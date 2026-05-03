"""
app.py — All FastAPI endpoints for PantryChef.
Run: uvicorn app:app --reload --port 8000  (from backend/ folder)

Phase 1 changes:
  - All endpoints now require authentication (JWT from Cognito)
  - All data (ingredients, recipes) is scoped to the logged-in user
  - Recipe generation enforces per-tier limits (free = 3 recipes/day)
  - AUTH_DISABLED=true in .env skips auth for local development
"""

import os, io, json, hashlib, base64
from datetime import datetime, date
from typing import Optional, List

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
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
from prompts import SUGGESTIONS_SYSTEM, SUGGESTIONS_USER, DISH_IDENTIFICATION_SYSTEM, DISH_IDENTIFICATION_USER

# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

init_db()

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app = FastAPI(title="PantryChef API", version="2.4.0")
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

# ---------------------------------------------------------------------------
# Per-tier daily limits
# ---------------------------------------------------------------------------

TIER_LIMITS = {
    "free":    {"recipe": 3,  "dish_scan": 1,  "pantry_scan": 1,  "chat_tokens": 500,  "variations_per_recipe": 1},
    "pro":     {"recipe": 20, "dish_scan": 10, "pantry_scan": 10, "chat_tokens": 3000, "variations_per_recipe": 2},
    "credits": {"recipe": None, "dish_scan": None, "pantry_scan": None, "chat_tokens": 3000, "variations_per_recipe": None},
}

# Credits cost per action (deducted from credits_balance)
CREDITS_COST = {
    "recipe":      1.0,
    "dish_scan":   2.0,
    "pantry_scan": 2.0,
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

class ImageScanRequest(BaseModel):
    image_b64: str

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

class SuggestionsRequest(BaseModel):
    filters: dict = {}
    already_shown: list = []


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
# Guardrail helpers
# ---------------------------------------------------------------------------

def _get_limit(user: User, key: str):
    """Return numeric limit for this user+action. None = credits tier (balance-gated)."""
    limits = TIER_LIMITS.get(user.tier, TIER_LIMITS["free"])
    return limits.get(key)


def _reset_daily(user: User, db: Session, count_col: str, date_col: str) -> None:
    """Atomically reset a daily counter if 24 h have elapsed."""
    now = datetime.utcnow()
    date_val = getattr(user, date_col, None)
    if date_val is None or (now - date_val).total_seconds() >= 86400:
        db.execute(
            text(f"UPDATE users SET {count_col} = 0, {date_col} = :now WHERE id = :uid"),
            {"now": now, "uid": user.id},
        )
        db.commit()
        db.refresh(user)


def _check_and_deduct_credits(user: User, db: Session, action: str) -> None:
    """For credits-tier users: check balance then deduct. Raises 402 if insufficient."""
    cost = CREDITS_COST.get(action, 1.0)
    if user.credits_balance < cost:
        raise HTTPException(
            status_code=402,
            detail={
                "error":   "INSUFFICIENT_CREDITS",
                "message": f"You need {cost} credits for this action. Current balance: {user.credits_balance:.1f}. Please top up.",
                "balance": user.credits_balance,
                "cost":    cost,
            },
        )
    db.execute(
        text("UPDATE users SET credits_balance = credits_balance - :cost WHERE id = :uid"),
        {"cost": cost, "uid": user.id},
    )
    db.commit()
    db.refresh(user)


def _recipe_guardrail(user: User, db: Session) -> None:
    """Check + atomically reserve one recipe generation slot. Handles all 3 tiers."""
    if user.is_admin:
        return
    if user.tier == "credits":
        _check_and_deduct_credits(user, db, "recipe")
        return
    _reset_daily(user, db, "recipe_count", "recipe_reset_date")
    limit = _get_limit(user, "recipe")
    result = db.execute(
        text("""
            UPDATE users SET recipe_count = recipe_count + 1
            WHERE id = :uid AND recipe_count < :lim
            RETURNING recipe_count
        """),
        {"uid": user.id, "lim": limit},
    ).fetchone()
    db.commit()
    if result is None:
        db.refresh(user)
        raise HTTPException(
            status_code=402,
            detail={
                "error":       "LIMIT_REACHED",
                "message":     f"You've used all {limit} daily recipes. Resets in 24 hours. Upgrade to Pro for 20/day!",
                "used":        user.recipe_count,
                "limit":       limit,
                "tier":        user.tier,
                "upgrade_url": "/upgrade",
            },
        )


def _scan_guardrail(user: User, db: Session, scan_type: str) -> None:
    """Check + increment scan counter for 'dish' or 'pantry'. Handles all 3 tiers."""
    if user.is_admin:
        return
    if scan_type == "dish":
        count_col, date_col = "dish_scan_count", "dish_scan_reset_date"
    else:
        count_col, date_col = "pantry_scan_count", "pantry_scan_reset_date"

    if user.tier == "credits":
        _check_and_deduct_credits(user, db, f"{scan_type}_scan")
    else:
        _reset_daily(user, db, count_col, date_col)
        limit = _get_limit(user, f"{scan_type}_scan")
        current = getattr(user, count_col, 0)
        if current >= limit:
            raise HTTPException(
                status_code=402,
                detail={
                    "error":       "SCAN_LIMIT_REACHED",
                    "message":     f"Daily {scan_type} scan limit ({limit}) reached. Resets in 24 hours.",
                    "used":        current,
                    "limit":       limit,
                    "upgrade_url": "/upgrade",
                },
            )

    db.execute(
        text(f"UPDATE users SET {count_col} = {count_col} + 1 WHERE id = :uid"),
        {"uid": user.id},
    )
    db.commit()
    db.refresh(user)


# ---------------------------------------------------------------------------
# ME endpoint
# ---------------------------------------------------------------------------

@app.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    """Return the logged-in user's profile and usage info."""
    tier_limits = TIER_LIMITS.get(current_user.tier, TIER_LIMITS["free"])
    recipe_limit = tier_limits.get("recipe") or 0
    return {
        **current_user.to_dict(),
        "recipe_limit":       recipe_limit,
        "recipes_remaining":  max(0, recipe_limit - current_user.recipe_count),
        "limit_reached":      current_user.recipe_count >= recipe_limit and current_user.tier != "credits",
        "dish_scan_limit":    tier_limits.get("dish_scan"),
        "pantry_scan_limit":  tier_limits.get("pantry_scan"),
        "chat_token_limit":   tier_limits.get("chat_tokens"),
    }


# ---------------------------------------------------------------------------
# INVENTORY endpoints
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
    payload: ImageScanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # ── Guardrail: check + increment daily pantry scan counter ───────────────
    _scan_guardrail(current_user, db, "pantry")

    # ── Size guard ───────────────────────────────────────────────────────────
    if len(payload.image_b64) > 1_500_000:
        raise HTTPException(400, "Image too large. Please use a smaller image.")

    b64 = payload.image_b64
    resp = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": IMAGE_EXTRACTION_SYSTEM},
            {"role": "user", "content": [
                {"type": "image_url", "image_url": {
                    "url": f"data:image/jpeg;base64,{b64}",
                    "detail": "high"
                }},
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
    content = (await file.read()).decode("utf-8-sig").strip()
    reader = csv.DictReader(io.StringIO(content))
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
# RECIPE SUGGESTIONS
# ---------------------------------------------------------------------------

@app.post("/recipe/suggestions")
def get_recipe_suggestions(
    payload: SuggestionsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return 6-8 recipe name suggestions based on current pantry.
    Uses GPT-4o-mini — fast and cheap, no agent loop.
    Does NOT count against the recipe generation limit.
    """
    inventory = [i.to_dict() for i in db.query(Ingredient).filter(
        Ingredient.user_id == current_user.id).all()]

    if not inventory:
        raise HTTPException(400, "Your pantry is empty. Add some ingredients first.")

    inventory_json = json.dumps([{"name": i["name"], "category": i["category"]} for i in inventory])
    filters_json = json.dumps(payload.filters)
    already_shown = json.dumps(payload.already_shown)

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SUGGESTIONS_SYSTEM},
                {"role": "user", "content": SUGGESTIONS_USER.format(
                    inventory_json=inventory_json,
                    filters_json=filters_json,
                    already_shown=already_shown,
                )},
            ],
            temperature=0.8,
            max_tokens=1500,
        )
        raw = resp.choices[0].message.content.strip()
        suggestions = _parse_json_response(raw)

        if not isinstance(suggestions, list):
            raise ValueError("Expected a list of suggestions")

        valid = []
        for s in suggestions:
            if not isinstance(s, dict) or not s.get("name"):
                continue
            valid.append({
                "name": s.get("name", ""),
                "cuisine": s.get("cuisine", "Indian"),
                "meal_type": s.get("meal_type", ""),
                "cook_time_minutes": s.get("cook_time_minutes", None),
                "difficulty": s.get("difficulty", "beginner"),
                "key_ingredients": s.get("key_ingredients", []),
                "missing_count": int(s.get("missing_count", 0)),
                "reason": s.get("reason", ""),
            })

        return {"suggestions": valid[:8]}

    except Exception as e:
        raise HTTPException(500, f"Could not generate suggestions: {str(e)}")


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
    Guardrail: all tiers limited daily. Free=3, Pro=20, Credits=balance-gated.
    """
    # ── Atomic guardrail — check + reserve in one SQL statement ─────────────
    _recipe_guardrail(current_user, db)

    inventory = [i.to_dict() for i in db.query(Ingredient).filter(Ingredient.user_id == current_user.id).all()]
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
            raise HTTPException(502, "AI service temporarily unavailable. Please try again.")

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
    db.commit()
    db.refresh(row)

    result = row.to_dict()
    result["from_cache"] = False
    result["ingredient_status"] = _map_inventory_to_recipe(recipe_data.get("ingredients_used", []), inventory)
    return result


# ---------------------------------------------------------------------------
# RECIPE — Mode B: direct dish search (WITH GUARDRAIL)
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

    # ── Guardrail: search counts against daily recipe limit ─────────────────
    _recipe_guardrail(current_user, db)

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
        raise HTTPException(502, "AI service temporarily unavailable. Please try again.")

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
    limit = min(limit, 50)
    q = db.query(Recipe).filter(Recipe.user_id == current_user.id)
    if mode in ("pantry", "direct"):
        q = q.filter(Recipe.mode == mode)
    rows = q.order_by(Recipe.generated_at.desc()).limit(limit).all()
    return [r.to_summary() for r in rows]


@app.post("/recipe/identify-dish")
async def identify_dish(
    payload: ImageScanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # ── Guardrail: check + increment daily dish scan counter ─────────────────
    _scan_guardrail(current_user, db, "dish")

    if len(payload.image_b64) > 1_500_000:
        raise HTTPException(400, "Image too large. Please use a smaller image.")

    b64 = payload.image_b64
    resp = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": DISH_IDENTIFICATION_SYSTEM},
            {"role": "user", "content": [
                {"type": "image_url", "image_url": {
                    "url": f"data:image/jpeg;base64,{b64}",
                    "detail": "high"
                }},
                {"type": "text", "text": DISH_IDENTIFICATION_USER},
            ]},
        ],
        max_tokens=500,
    )
    try:
        result = _parse_json_response(resp.choices[0].message.content.strip())
        if not isinstance(result, dict) or not result.get("name"):
            return {"name": None, "confidence": "low", "alternatives": [], "cuisine": "", "description": ""}
        return result
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(500, "Could not identify the dish from this image")


@app.get("/recipe/{recipe_id}")
def get_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)):
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
# RECIPE — Variations
# ---------------------------------------------------------------------------

@app.post("/recipe/{recipe_id}/variations")
def get_recipe_variations(
    recipe_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a variation of an existing recipe — different style, same dish."""
    r = db.query(Recipe).filter(Recipe.id == recipe_id, Recipe.user_id == current_user.id).first()
    if not r:
        raise HTTPException(404, "Recipe not found")

    # ── Variation limit per recipe ───────────────────────────────────────────
    if not current_user.is_admin and current_user.tier != "credits":
        var_limit = TIER_LIMITS.get(current_user.tier, TIER_LIMITS["free"]).get("variations_per_recipe", 1)
        existing_variations = db.query(Recipe).filter(
            Recipe.user_id == current_user.id,
            Recipe.parent_recipe_id == recipe_id,
        ).count()
        if existing_variations >= var_limit:
            raise HTTPException(
                status_code=402,
                detail={
                    "error":   "VARIATION_LIMIT_REACHED",
                    "message": f"You've used all {var_limit} variation{'s' if var_limit != 1 else ''} for this recipe. Upgrade for more!",
                    "used":    existing_variations,
                    "limit":   var_limit,
                },
            )

    # ── Also counts against daily recipe quota ───────────────────────────────
    _recipe_guardrail(current_user, db)

    original  = json.loads(r.recipe_json)
    dish_name = original.get("name", r.name)
    cuisine   = original.get("cuisine", "")

    try:
        raw = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": MODE_B_SYSTEM},
                {"role": "user", "content": (
                    f"Generate a DIFFERENT variation of '{dish_name}'. "
                    f"Original cuisine: {cuisine}. "
                    f"Change the cooking style, flavour profile, or regional twist significantly. "
                    f"Do NOT repeat the original recipe."
                )},
            ],
            temperature=0.9, max_tokens=2500,
        ).choices[0].message.content.strip()
        recipe_data = _parse_json_response(raw)
    except Exception as e:
        raise HTTPException(502, "AI service temporarily unavailable. Please try again.")

    inventory = [i.to_dict() for i in db.query(Ingredient).filter(
        Ingredient.user_id == current_user.id).all()]
    ingredient_status = _map_inventory_to_recipe(recipe_data.get("ingredients", []), inventory)
    shopping_list = [
        f"{m['name']} — {m['quantity']}".strip(" —")
        for m in ingredient_status["missing"]
    ]

    row = Recipe(
        user_id=current_user.id,
        name=recipe_data.get("name", dish_name),
        recipe_json=json.dumps(recipe_data, ensure_ascii=False),
        inventory_snapshot=json.dumps(inventory, ensure_ascii=False),
        mode="direct", dish_searched=dish_name,
        parent_recipe_id=recipe_id,
    )
    db.add(row); db.commit(); db.refresh(row)
    result = row.to_dict()
    result["ingredient_status"] = ingredient_status
    result["shopping_list"] = shopping_list
    return result


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

    # ── Per-tier token limit ─────────────────────────────────────────────────
    chat_tokens = TIER_LIMITS.get(current_user.tier, TIER_LIMITS["free"]).get("chat_tokens", 500)

    try:
        reply = client.chat.completions.create(
            model="gpt-4o-mini", messages=messages,
            temperature=0.6, max_tokens=chat_tokens,
        ).choices[0].message.content.strip()
    except Exception as e:
        raise HTTPException(502, "Chat service temporarily unavailable. Please try again.")
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
    return {"status": "ok", "service": "PantryChef API", "version": "2.4.0"}


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
    rows = db.query(AppFeedback).filter(
        AppFeedback.user_id == current_user.id
    ).order_by(AppFeedback.created_at.desc()).all()
    return [r.to_dict() for r in rows]