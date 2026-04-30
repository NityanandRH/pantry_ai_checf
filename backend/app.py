"""
app.py — All FastAPI endpoints for PantryChef.
Run: uvicorn app:app --reload --port 8000  (from backend/ folder)

Phase 1 changes:
  - All endpoints now require authentication (JWT from Cognito)
  - All data (ingredients, recipes) is scoped to the logged-in user
  - Recipe generation enforces per-tier limits (free = 3 recipes)
  - AUTH_DISABLED=true in .env skips auth for local development
"""

import os, io, json, hashlib, base64
from datetime import datetime, date
from typing import Optional, List

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from openai import OpenAI
from PIL import Image

from database import get_db, init_db
from models import Ingredient, Recipe, Favourite, Feedback, UserRecipe, User, AppFeedback
from auth import get_current_user, require_admin
from admin import router as admin_router
from prompts import (
    RECIPE_AGENT_TOOLS, AGENT_SYSTEM,
    MODE_A_FALLBACK_SYSTEM, MODE_B_SYSTEM,
    IMAGE_EXTRACTION_SYSTEM, IMAGE_EXTRACTION_USER,
    BASE_FOOD_CATEGORIES, UNIVERSAL_STAPLES,
    build_agent_user_prompt, build_mode_a_fallback_prompt,
    build_mode_b_prompt, build_chat_system,
    _format_ingredient,
)

# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

init_db()

# Parse allowed origins from env — supports multiple comma-separated values
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app = FastAPI(title="PantryChef API", version="2.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(admin_router)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

VALID_CATEGORIES = [
    "spices", "lentils", "vegetables", "fruits", "oils",
    "flours", "dairy", "protein", "grains", "other",
]
VALID_RATINGS = ["loved_it", "too_spicy", "too_bland", "too_complex", "other"]

# Per-tier recipe generation limits
TIER_LIMITS = {
    "free":    3,
    "pro":     999_999,
    "credits": 999_999,   # credits tier uses credits_balance to gate, not count
}


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class IngredientCreate(BaseModel):
    name: str
    category: str
    quantity: Optional[float] = None
    unit: Optional[str] = None
    expiry_date: Optional[str] = None

class IngredientUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    expiry_date: Optional[str] = None

class RecipeGenerateRequest(BaseModel):
    filters: Optional[dict] = {}
    already_shown: Optional[List[str]] = []
    session_id: Optional[str] = None

class RecipeSearchRequest(BaseModel):
    dish_name: str

class FeedbackRequest(BaseModel):
    rating: str
    notes: Optional[str] = None

class UserRecipeCreate(BaseModel):
    name: str
    ingredients: List[str]
    steps: List[str]
    cuisine: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
    chat_history: Optional[List[dict]] = []

class AppFeedbackCreate(BaseModel):
    rating: int         # 1–5
    category: str       # general | ui | feature | bug | other
    message: Optional[str] = None


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _parse_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        return None


def _compute_cache_hash(inventory: list, filters: dict) -> str:
    inv_key = sorted([i["name"].lower().strip() for i in inventory])
    return hashlib.md5(
        (json.dumps(inv_key) + json.dumps(filters, sort_keys=True)).encode()
    ).hexdigest()


def _fuzzy_match(query: str, inventory: list) -> Optional[dict]:
    q = query.lower().strip()
    if q in UNIVERSAL_STAPLES:
        return {"name": q, "category": "other", "quantity": None, "unit": None, "_universal": True}
    best, best_score = None, 0
    for item in inventory:
        name = item["name"].lower().strip()
        if q == name:
            return item
        score = 0
        if q in name or name in q:
            score = 2
        else:
            q_words = [w for w in q.split() if len(w) > 2]
            n_words = [w for w in name.split() if len(w) > 2]
            overlap = sum(1 for w in q_words if any(w in nw or nw in w for nw in n_words))
            if overlap:
                score = overlap
        if score > best_score:
            best_score = score
            best = item
    return best if best_score > 0 else None


def _is_low_quantity(qty: Optional[float], unit: Optional[str]) -> bool:
    if qty is None:
        return False
    u = (unit or "").lower().strip()
    if u in ("pieces", "piece", "pcs", "nos", "number", ""):
        return qty < 2
    if u in ("g", "gram", "grams"):
        return qty < 20
    if u in ("kg", "kilogram"):
        return qty < 0.05
    if u in ("ml", "milliliter"):
        return qty < 25
    if u in ("l", "litre", "liter"):
        return qty < 0.05
    if u in ("tbsp", "tablespoon"):
        return qty < 1
    if u in ("tsp", "teaspoon"):
        return qty < 0.5
    if u in ("cup", "cups"):
        return qty < 0.2
    return qty < 5


def _map_inventory_to_recipe(recipe_ingredients: list, inventory: list) -> dict:
    available, low_qty, missing = [], [], []
    for ing in recipe_ingredients:
        match = _fuzzy_match(ing["name"], inventory)
        if match:
            if match.get("_universal"):
                available.append(ing["name"])
            elif _is_low_quantity(match.get("quantity"), match.get("unit")):
                low_qty.append({
                    "name": ing["name"],
                    "have": f"{match.get('quantity', '?')} {match.get('unit', '')}".strip(),
                    "need": ing.get("quantity", ""),
                })
            else:
                available.append(ing["name"])
        else:
            missing.append({"name": ing["name"], "quantity": ing.get("quantity", "")})
    return {"available": available, "low_qty": low_qty, "missing": missing}


def _parse_json_response(raw: str) -> dict:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = [l for l in cleaned.split("\n") if not l.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()
    return json.loads(cleaned)


def _has_base_ingredient(recipe: dict, inventory: list) -> bool:
    used = [i["name"].lower().strip() for i in recipe.get("ingredients_used", [])]
    for name in used:
        match = _fuzzy_match(name, inventory)
        if match and not match.get("_universal"):
            if match.get("category", "").lower() in BASE_FOOD_CATEGORIES:
                return True
    return False


# ---------------------------------------------------------------------------
# Agent tool functions
# ---------------------------------------------------------------------------

def _tool_list_pantry(inventory: list, category: str) -> str:
    items = inventory if category == "all" else [i for i in inventory if i["category"] == category]
    if not items:
        return json.dumps({"result": f"No ingredients in '{category}'"})
    return json.dumps({"category": category, "count": len(items),
                        "ingredients": [_format_ingredient(i) for i in items]})


def _tool_check_ingredient(inventory: list, name: str) -> str:
    if name.lower().strip() in UNIVERSAL_STAPLES:
        return json.dumps({"available": True, "ingredient": name,
                            "note": "Universal staple — always available"})
    match = _fuzzy_match(name, inventory)
    if not match:
        return json.dumps({"available": False, "ingredient": name})
    return json.dumps({"available": True, "ingredient": name,
                        "matched_as": match["name"],
                        "category": match.get("category", ""),
                        "quantity": match.get("quantity"),
                        "unit": match.get("unit") or ""})


def _tool_get_quantity(inventory: list, name: str) -> str:
    if name.lower().strip() in UNIVERSAL_STAPLES:
        return json.dumps({"ingredient": name, "quantity": "unlimited", "unit": ""})
    match = _fuzzy_match(name, inventory)
    if not match:
        return json.dumps({"available": False, "ingredient": name})
    qty, unit = match.get("quantity"), match.get("unit") or ""
    return json.dumps({"available": True, "ingredient": name,
                        "matched_as": match["name"], "quantity": qty, "unit": unit,
                        "is_low": _is_low_quantity(qty, unit)})


def _execute_tool(name: str, args: dict, inventory: list) -> str:
    if name == "list_pantry_ingredients":
        return _tool_list_pantry(inventory, args.get("category", "all"))
    if name == "check_ingredient":
        return _tool_check_ingredient(inventory, args.get("ingredient_name", ""))
    if name == "get_ingredient_quantity":
        return _tool_get_quantity(inventory, args.get("ingredient_name", ""))
    return json.dumps({"error": f"Unknown tool: {name}"})


def _run_recipe_agent(inventory: list, filters: dict, already_shown: list) -> dict:
    messages = [
        {"role": "system", "content": AGENT_SYSTEM},
        {"role": "user",   "content": build_agent_user_prompt(filters, already_shown)},
    ]
    for _ in range(10):
        resp = client.chat.completions.create(
            model="gpt-4o", messages=messages, tools=RECIPE_AGENT_TOOLS,
            tool_choice="auto", temperature=0.75, max_tokens=3000,
        )
        msg = resp.choices[0].message
        if resp.choices[0].finish_reason == "stop":
            return _parse_json_response(msg.content)
        if resp.choices[0].finish_reason == "tool_calls" and msg.tool_calls:
            messages.append(msg)
            for tc in msg.tool_calls:
                try:
                    args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    args = {}
                messages.append({
                    "role": "tool", "tool_call_id": tc.id,
                    "content": _execute_tool(tc.function.name, args, inventory),
                })
            continue
        if msg.content:
            return _parse_json_response(msg.content)
    raise RuntimeError("Agent did not complete within 10 rounds")


# ---------------------------------------------------------------------------
# ── ME endpoint — current user info + usage stats
# ---------------------------------------------------------------------------

@app.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    """Return the logged-in user's profile and usage info."""
    limit = TIER_LIMITS.get(current_user.tier, 3)
    return {
        **current_user.to_dict(),
        "recipe_limit": limit,
        "recipes_remaining": max(0, limit - current_user.recipe_count),
        "limit_reached": current_user.recipe_count >= limit and current_user.tier == "free",
    }


# ---------------------------------------------------------------------------
# INVENTORY endpoints — all scoped to current_user
# ---------------------------------------------------------------------------

@app.get("/inventory")
def list_ingredients(
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Ingredient).filter(Ingredient.user_id == current_user.id)
    if category and category in VALID_CATEGORIES:
        q = q.filter(Ingredient.category == category)
    return [i.to_dict() for i in q.order_by(Ingredient.category, Ingredient.name).all()]


@app.post("/inventory", status_code=201)
def add_ingredient(
    payload: IngredientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.category not in VALID_CATEGORIES:
        raise HTTPException(400, f"Invalid category. Must be one of: {', '.join(VALID_CATEGORIES)}")
    item = Ingredient(
        user_id=current_user.id,
        name=payload.name.strip(), category=payload.category,
        quantity=payload.quantity, unit=payload.unit,
        expiry_date=_parse_date(payload.expiry_date),
    )
    db.add(item); db.commit(); db.refresh(item)
    return item.to_dict()


@app.put("/inventory/{iid}")
def update_ingredient(
    iid: int, payload: IngredientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(Ingredient).filter(
        Ingredient.id == iid, Ingredient.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(404, "Ingredient not found")
    if payload.name is not None:
        item.name = payload.name.strip()
    if payload.category is not None:
        if payload.category not in VALID_CATEGORIES:
            raise HTTPException(400, "Invalid category")
        item.category = payload.category
    if payload.quantity is not None:
        item.quantity = payload.quantity
    if payload.unit is not None:
        item.unit = payload.unit
    if payload.expiry_date is not None:
        item.expiry_date = _parse_date(payload.expiry_date)
    item.updated_at = datetime.utcnow()
    db.commit(); db.refresh(item)
    return item.to_dict()


@app.delete("/inventory/{iid}", status_code=204)
def delete_ingredient(
    iid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(Ingredient).filter(
        Ingredient.id == iid, Ingredient.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(404, "Ingredient not found")
    db.delete(item); db.commit()
    return None


@app.post("/inventory/scan-image")
async def scan_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    contents = await file.read()
    img = Image.open(io.BytesIO(contents))
    img.thumbnail((1024, 1024), Image.LANCZOS)
    buf = io.BytesIO()
    fmt = img.format or "JPEG"
    img.save(buf, format=fmt); buf.seek(0)
    b64 = base64.standard_b64encode(buf.read()).decode()
    resp = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": IMAGE_EXTRACTION_SYSTEM},
            {"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/{fmt.lower()};base64,{b64}", "detail": "high"}},
                {"type": "text", "text": IMAGE_EXTRACTION_USER},
            ]},
        ],
        max_tokens=1000,
    )
    try:
        extracted = _parse_json_response(resp.choices[0].message.content.strip())
        if not isinstance(extracted, list):
            extracted = []
    except Exception:
        extracted = []
    for item in extracted:
        if item.get("category") not in VALID_CATEGORIES:
            item["category"] = "other"
    return {"extracted_ingredients": extracted, "count": len(extracted)}


@app.post("/inventory/bulk-import", status_code=201)
async def bulk_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import csv
    text = (await file.read()).decode("utf-8-sig").strip()
    reader = csv.DictReader(io.StringIO(text))
    imported = skipped = 0
    errors = []
    for i, row in enumerate(reader, 2):
        name = (row.get("name") or "").strip()
        if not name:
            skipped += 1; errors.append(f"Row {i}: missing name"); continue
        cat = (row.get("category") or "other").strip().lower()
        if cat not in VALID_CATEGORIES:
            cat = "other"
        raw_qty = row.get("quantity", "").strip()
        try:
            qty = float(raw_qty) if raw_qty else None
        except ValueError:
            qty = None
        db.add(Ingredient(
            user_id=current_user.id, name=name, category=cat, quantity=qty,
            unit=(row.get("unit") or "").strip() or None,
            expiry_date=_parse_date((row.get("expiry_date") or "").strip() or None),
        ))
        imported += 1
    db.commit()
    return {"imported": imported, "skipped": skipped, "errors": errors}


# ---------------------------------------------------------------------------
# RECIPE — Mode A: agent-based pantry generation (WITH GUARDRAIL)
# ---------------------------------------------------------------------------

@app.post("/recipe/generate")
def generate_recipe(
    payload: RecipeGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate a recipe from the user's pantry using the AI agent.

    Guardrail: free users are limited to TIER_LIMITS['free'] generations.
    Increment recipe_count on every successful generation.
    """
    # ── Guardrail check ──────────────────────────────────────────────────────
    limit = TIER_LIMITS.get(current_user.tier, 3)
    if not current_user.is_admin and current_user.recipe_count >= limit:
        raise HTTPException(
            status_code=402,
            detail={
                "error":       "LIMIT_REACHED",
                "message":     f"You've used all {limit} free recipe generation{'s' if limit != 1 else ''}. Upgrade to cook more!",
                "used":        current_user.recipe_count,
                "limit":       limit,
                "tier":        current_user.tier,
                "upgrade_url": "/upgrade",
            },
        )

    inventory = [i.to_dict() for i in db.query(Ingredient).filter(
        Ingredient.user_id == current_user.id).all()]
    if not inventory:
        raise HTTPException(400, "Your pantry is empty. Add some ingredients first.")

    filters       = payload.filters or {}
    already_shown = payload.already_shown or []
    session_id    = payload.session_id
    cache_hash    = _compute_cache_hash(inventory, filters)

    # ── Cache check ──
    cached = (
        db.query(Recipe)
        .filter(Recipe.user_id == current_user.id,
                Recipe.cache_hash == cache_hash,
                Recipe.mode == "pantry")
        .filter(~Recipe.name.in_(already_shown))
        .order_by(Recipe.generated_at.desc())
        .first()
    )
    if cached:
        result = cached.to_dict(); result["from_cache"] = True
        return result

    # ── Agent call ──
    recipe_data = None
    try:
        recipe_data = _run_recipe_agent(inventory, filters, already_shown)
    except Exception:
        try:
            raw = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": MODE_A_FALLBACK_SYSTEM},
                    {"role": "user",   "content": build_mode_a_fallback_prompt(inventory, filters, already_shown)},
                ],
                temperature=0.75, max_tokens=2000,
            ).choices[0].message.content.strip()
            recipe_data = _parse_json_response(raw)
        except Exception as e:
            raise HTTPException(502, f"AI service error: {e}")

    if "error" in recipe_data:
        return {
            "error": "INSUFFICIENT_INGREDIENTS",
            "message": recipe_data.get("reason", "Not enough ingredients."),
        }

    if not _has_base_ingredient(recipe_data, inventory):
        return {
            "error": "INSUFFICIENT_INGREDIENTS",
            "message": "Please add at least one vegetable, grain, lentil, or protein to your pantry.",
        }

    # ── Save recipe ──
    row = Recipe(
        user_id=current_user.id,
        name=recipe_data.get("name", "Recipe"),
        recipe_json=json.dumps(recipe_data, ensure_ascii=False),
        inventory_snapshot=json.dumps(inventory, ensure_ascii=False),
        filters_used=json.dumps(filters, ensure_ascii=False),
        cache_hash=cache_hash, session_id=session_id,
        mode="pantry", dish_searched=None,
    )
    db.add(row)

    # ── Increment usage count ──
    current_user.recipe_count += 1
    db.commit(); db.refresh(row)

    result = row.to_dict()
    result["from_cache"] = False
    result["usage"] = {
        "used":      current_user.recipe_count,
        "limit":     limit,
        "remaining": max(0, limit - current_user.recipe_count),
    }
    return result


# ---------------------------------------------------------------------------
# RECIPE — Mode B: direct dish search (no guardrail — informational only)
# ---------------------------------------------------------------------------

@app.post("/recipe/search")
def search_recipe(
    payload: RecipeSearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    dish = payload.dish_name.strip()
    if not dish:
        raise HTTPException(400, "dish_name is required")
    inventory = [i.to_dict() for i in db.query(Ingredient).filter(
        Ingredient.user_id == current_user.id).all()]
    try:
        raw = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": MODE_B_SYSTEM},
                {"role": "user",   "content": build_mode_b_prompt(dish)},
            ],
            temperature=0.6, max_tokens=2500,
        ).choices[0].message.content.strip()
        recipe_data = _parse_json_response(raw)
    except Exception as e:
        raise HTTPException(502, f"AI service error: {e}")

    ingredient_status = _map_inventory_to_recipe(
        recipe_data.get("ingredients", []), inventory)
    shopping_list = [
        f"{m['name']} — {m['quantity']}".strip(" —")
        for m in ingredient_status["missing"]
    ]

    row = Recipe(
        user_id=current_user.id,
        name=recipe_data.get("name", dish),
        recipe_json=json.dumps(recipe_data, ensure_ascii=False),
        inventory_snapshot=json.dumps(inventory, ensure_ascii=False),
        filters_used=None, cache_hash=None, session_id=None,
        mode="direct", dish_searched=dish,
    )
    db.add(row); db.commit(); db.refresh(row)
    result = row.to_dict()
    result["ingredient_status"] = ingredient_status
    result["shopping_list"] = shopping_list
    return result


# ---------------------------------------------------------------------------
# RECIPE — History + navigation + validation
# ---------------------------------------------------------------------------

@app.get("/recipe/session/{session_id}")
def get_session_recipes(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (db.query(Recipe.id, Recipe.name, Recipe.generated_at)
            .filter(Recipe.user_id == current_user.id, Recipe.session_id == session_id)
            .order_by(Recipe.generated_at.asc()).all())
    return [{"id": r.id, "name": r.name, "generated_at": r.generated_at.isoformat()} for r in rows]


@app.get("/recipe/favourites")
def list_favourites(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return [r.to_dict() for r in
            db.query(Recipe)
            .filter(Recipe.user_id == current_user.id, Recipe.is_favourite == True)
            .order_by(Recipe.generated_at.desc()).all()]


@app.get("/recipe/history")
def get_recipe_history(
    limit: int = 30,
    mode: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return the user's recent recipe history as lightweight summaries.
    Used by ProfileSidebar to show past recipes with load-back option.

    Query params:
      limit — max number of recipes (default 30, max 50)
      mode  — filter by 'pantry' or 'direct' (optional)
    """
    limit = min(limit, 50)
    q = db.query(Recipe).filter(Recipe.user_id == current_user.id)
    if mode in ("pantry", "direct"):
        q = q.filter(Recipe.mode == mode)
    rows = q.order_by(Recipe.generated_at.desc()).limit(limit).all()
    return [r.to_summary() for r in rows]

@app.get("/recipe/{recipe_id}")
def get_recipe_by_id(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recipe = db.query(Recipe).filter(
        Recipe.id == recipe_id,
        Recipe.user_id == current_user.id
    ).first()
    if not recipe:
        raise HTTPException(404, "Recipe not found")
    return recipe.to_dict()


@app.get("/recipe/{recipe_id}")
def get_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    r = db.query(Recipe).filter(Recipe.id == recipe_id, Recipe.user_id == current_user.id).first()
    if not r:
        raise HTTPException(404, "Recipe not found")
    return r.to_dict()


@app.get("/recipe/{recipe_id}/validate")
def validate_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    r = db.query(Recipe).filter(Recipe.id == recipe_id, Recipe.user_id == current_user.id).first()
    if not r:
        raise HTTPException(404, "Recipe not found")
    data = json.loads(r.recipe_json)
    inv  = [i.to_dict() for i in db.query(Ingredient).filter(
        Ingredient.user_id == current_user.id).all()]
    ing_list = data.get("ingredients_used", []) if r.mode == "pantry" else data.get("ingredients", [])
    status = _map_inventory_to_recipe(ing_list, inv)
    status.update({"recipe_id": recipe_id, "recipe_name": r.name, "mode": r.mode})
    return status


# ---------------------------------------------------------------------------
# RECIPE — Favourites + Feedback
# ---------------------------------------------------------------------------

@app.post("/recipe/{recipe_id}/favourite")
def toggle_favourite(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    r = db.query(Recipe).filter(Recipe.id == recipe_id, Recipe.user_id == current_user.id).first()
    if not r:
        raise HTTPException(404, "Recipe not found")
    r.is_favourite = not r.is_favourite
    if r.is_favourite:
        db.add(Favourite(recipe_id=recipe_id))
    else:
        db.query(Favourite).filter(Favourite.recipe_id == recipe_id).delete()
    db.commit()
    return {"recipe_id": recipe_id, "is_favourite": r.is_favourite}


@app.post("/recipe/{recipe_id}/feedback")
def submit_feedback(
    recipe_id: int, payload: FeedbackRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not db.query(Recipe).filter(Recipe.id == recipe_id, Recipe.user_id == current_user.id).first():
        raise HTTPException(404, "Recipe not found")
    if payload.rating not in VALID_RATINGS:
        raise HTTPException(400, f"Invalid rating. Must be one of: {', '.join(VALID_RATINGS)}")
    fb = Feedback(recipe_id=recipe_id, rating=payload.rating, notes=payload.notes)
    db.add(fb); db.commit(); db.refresh(fb)
    return fb.to_dict()


# ---------------------------------------------------------------------------
# COOKING CHAT
# ---------------------------------------------------------------------------

@app.post("/recipe/{recipe_id}/chat")
def chat_about_recipe(
    recipe_id: int, payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    r = db.query(Recipe).filter(Recipe.id == recipe_id, Recipe.user_id == current_user.id).first()
    if not r:
        raise HTTPException(404, "Recipe not found")
    system = build_chat_system(json.loads(r.recipe_json), r.name)
    messages = [{"role": "system", "content": system}]
    for turn in (payload.chat_history or []):
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append({"role": "user", "content": payload.message})
    try:
        reply = client.chat.completions.create(
            model="gpt-4o-mini", messages=messages,
            temperature=0.6, max_tokens=600,
        ).choices[0].message.content.strip()
    except Exception as e:
        raise HTTPException(502, f"Chat error: {e}")
    return {"reply": reply, "recipe_id": recipe_id}


# ---------------------------------------------------------------------------
# USER-SUBMITTED RECIPES
# ---------------------------------------------------------------------------

@app.post("/user-recipes", status_code=201)
def submit_user_recipe(
    payload: UserRecipeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not payload.name.strip():
        raise HTTPException(400, "Name required")
    ur = UserRecipe(
        user_id=current_user.id,
        name=payload.name.strip(),
        ingredients=json.dumps(payload.ingredients, ensure_ascii=False),
        steps=json.dumps(payload.steps, ensure_ascii=False),
        cuisine=payload.cuisine,
    )
    db.add(ur)
    db.add(Recipe(
        user_id=current_user.id,
        name=payload.name.strip(),
        recipe_json=json.dumps({
            "name": payload.name, "cuisine": payload.cuisine,
            "ingredients_used": [{"name": i} for i in payload.ingredients],
            "steps": payload.steps,
        }, ensure_ascii=False),
        inventory_snapshot=json.dumps([], ensure_ascii=False),
        filters_used=None, cache_hash=None, session_id=None,
        mode="pantry", dish_searched=None, is_user_submitted=True,
    ))
    db.commit(); db.refresh(ur)
    return ur.to_dict()


@app.get("/user-recipes")
def list_user_recipes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return [r.to_dict() for r in
            db.query(UserRecipe)
            .filter(UserRecipe.user_id == current_user.id)
            .order_by(UserRecipe.submitted_at.desc()).all()]


# ---------------------------------------------------------------------------
# HEALTH
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "service": "PantryChef API", "version": "2.3.0"}


# ---------------------------------------------------------------------------
# APP FEEDBACK
# ---------------------------------------------------------------------------

VALID_FB_CATEGORIES = {"general", "ui", "feature", "bug", "other"}

@app.post("/app-feedback", status_code=201)
def submit_app_feedback(
    payload: AppFeedbackCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Store user feedback about the app itself."""
    if not 1 <= payload.rating <= 5:
        raise HTTPException(400, "Rating must be between 1 and 5")
    cat = payload.category.lower().strip()
    if cat not in VALID_FB_CATEGORIES:
        cat = "other"
    fb = AppFeedback(
        user_id=current_user.id,
        rating=payload.rating,
        category=cat,
        message=payload.message,
    )
    db.add(fb); db.commit(); db.refresh(fb)
    return fb.to_dict()


@app.get("/app-feedback/mine")
def get_my_feedback(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the current user's own feedback submissions."""
    rows = db.query(AppFeedback).filter(
        AppFeedback.user_id == current_user.id
    ).order_by(AppFeedback.created_at.desc()).all()
    return [r.to_dict() for r in rows]