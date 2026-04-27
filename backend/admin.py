"""
admin.py — Admin-only API endpoints for PantryChef.

All routes require is_admin=True (enforced via require_admin dependency).
Mounted in app.py under the /admin prefix.

Endpoints:
  GET  /admin/stats          — overview numbers (users, recipes, activity)
  GET  /admin/users          — paginated user list with per-user stats
  PUT  /admin/users/{id}     — update a user's tier or admin status
  GET  /admin/analytics      — time-series + distribution data for charts
  POST /admin/ask            — LLM Q&A: admin types a question, GPT answers
                               using real aggregated data as context
"""

import os
import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.orm import Session
from openai import OpenAI

from database import get_db
from models import User, Recipe, Ingredient, Feedback, UserRecipe
from auth import require_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class UserUpdate(BaseModel):
    tier: Optional[str]    = None   # free | pro | credits
    is_admin: Optional[bool] = None
    recipe_count: Optional[int] = None


class AdminAskRequest(BaseModel):
    question: str
    chat_history: Optional[list] = []


# ---------------------------------------------------------------------------
# Helper: gather rich context snapshot for LLM Q&A
# ---------------------------------------------------------------------------

def _build_data_context(db: Session) -> dict:
    """
    Aggregate key metrics from the database.
    This dict is serialised to JSON and passed to GPT-4o as context
    so the admin can ask natural language questions about real data.
    """
    now = datetime.utcnow()
    last_7d  = now - timedelta(days=7)
    last_30d = now - timedelta(days=30)

    # ── User stats ──────────────────────────────────────────────────────────
    total_users   = db.query(func.count(User.id)).scalar() or 0
    free_users    = db.query(func.count(User.id)).filter(User.tier == "free").scalar() or 0
    pro_users     = db.query(func.count(User.id)).filter(User.tier == "pro").scalar() or 0
    admin_users   = db.query(func.count(User.id)).filter(User.is_admin == True).scalar() or 0
    new_7d        = db.query(func.count(User.id)).filter(User.created_at >= last_7d).scalar() or 0
    active_7d     = db.query(func.count(User.id)).filter(User.last_active >= last_7d).scalar() or 0
    inactive_users = total_users - active_7d

    # ── Recipe stats ─────────────────────────────────────────────────────────
    total_recipes = db.query(func.count(Recipe.id)).scalar() or 0
    pantry_recipes = db.query(func.count(Recipe.id)).filter(Recipe.mode == "pantry").scalar() or 0
    direct_recipes = db.query(func.count(Recipe.id)).filter(Recipe.mode == "direct").scalar() or 0
    recipes_7d    = db.query(func.count(Recipe.id)).filter(Recipe.generated_at >= last_7d).scalar() or 0
    recipes_today = db.query(func.count(Recipe.id)).filter(
        Recipe.generated_at >= now.replace(hour=0, minute=0, second=0)
    ).scalar() or 0
    favourited    = db.query(func.count(Recipe.id)).filter(Recipe.is_favourite == True).scalar() or 0

    # ── Top dishes ───────────────────────────────────────────────────────────
    top_dishes_rows = (
        db.query(Recipe.name, func.count(Recipe.id).label("count"))
        .filter(Recipe.mode == "pantry")
        .group_by(Recipe.name)
        .order_by(func.count(Recipe.id).desc())
        .limit(10)
        .all()
    )
    top_dishes = [{"name": r.name, "count": r.count} for r in top_dishes_rows]

    # ── Top direct searches ───────────────────────────────────────────────────
    top_searches_rows = (
        db.query(Recipe.dish_searched, func.count(Recipe.id).label("count"))
        .filter(Recipe.mode == "direct", Recipe.dish_searched.isnot(None))
        .group_by(Recipe.dish_searched)
        .order_by(func.count(Recipe.id).desc())
        .limit(10)
        .all()
    )
    top_searches = [{"dish": r.dish_searched, "count": r.count} for r in top_searches_rows]

    # ── Cuisine distribution ─────────────────────────────────────────────────
    # Extract cuisine from recipe_json — use PostgreSQL JSON operators
    # Fall back to Python-side counting if JSON queries fail
    cuisine_counts: dict = {}
    try:
        all_recipes = db.query(Recipe.recipe_json).limit(500).all()
        for (rj,) in all_recipes:
            try:
                data = json.loads(rj)
                cuisine = data.get("cuisine") or "Unknown"
                cuisine_counts[cuisine] = cuisine_counts.get(cuisine, 0) + 1
            except Exception:
                pass
    except Exception:
        pass
    top_cuisines = sorted(cuisine_counts.items(), key=lambda x: x[1], reverse=True)[:8]

    # ── Ingredient stats ──────────────────────────────────────────────────────
    total_ingredients = db.query(func.count(Ingredient.id)).scalar() or 0
    top_ingredient_rows = (
        db.query(Ingredient.name, func.count(Ingredient.id).label("count"))
        .group_by(Ingredient.name)
        .order_by(func.count(Ingredient.id).desc())
        .limit(10)
        .all()
    )
    top_ingredients = [{"name": r.name, "count": r.count} for r in top_ingredient_rows]

    top_category_rows = (
        db.query(Ingredient.category, func.count(Ingredient.id).label("count"))
        .group_by(Ingredient.category)
        .order_by(func.count(Ingredient.id).desc())
        .all()
    )
    category_distribution = [{"category": r.category, "count": r.count} for r in top_category_rows]

    # ── Feedback distribution ─────────────────────────────────────────────────
    feedback_rows = (
        db.query(Feedback.rating, func.count(Feedback.id).label("count"))
        .group_by(Feedback.rating)
        .all()
    )
    feedback_dist = [{"rating": r.rating, "count": r.count} for r in feedback_rows]

    # ── Recipes per day (last 14 days) ────────────────────────────────────────
    daily_counts = []
    for i in range(13, -1, -1):
        day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end   = day_start + timedelta(days=1)
        count = db.query(func.count(Recipe.id)).filter(
            Recipe.generated_at >= day_start,
            Recipe.generated_at < day_end,
        ).scalar() or 0
        daily_counts.append({
            "date":  day_start.strftime("%d %b"),
            "count": count,
        })

    # ── Users per day (last 14 days) ─────────────────────────────────────────
    daily_signups = []
    for i in range(13, -1, -1):
        day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end   = day_start + timedelta(days=1)
        count = db.query(func.count(User.id)).filter(
            User.created_at >= day_start,
            User.created_at < day_end,
        ).scalar() or 0
        daily_signups.append({
            "date":  day_start.strftime("%d %b"),
            "count": count,
        })

    return {
        "generated_at": now.isoformat(),
        "users": {
            "total": total_users, "free": free_users,
            "pro": pro_users, "admins": admin_users,
            "new_last_7_days": new_7d, "active_last_7_days": active_7d,
            "inactive": inactive_users,
        },
        "recipes": {
            "total": total_recipes, "pantry_mode": pantry_recipes,
            "direct_search_mode": direct_recipes,
            "last_7_days": recipes_7d, "today": recipes_today,
            "favourited": favourited,
        },
        "top_dishes":         top_dishes,
        "top_searches":       top_searches,
        "top_cuisines":       [{"cuisine": k, "count": v} for k, v in top_cuisines],
        "ingredients": {
            "total": total_ingredients,
            "top_ingredients": top_ingredients,
            "category_distribution": category_distribution,
        },
        "feedback_distribution": feedback_dist,
        "daily_recipe_counts":  daily_counts,
        "daily_signup_counts":  daily_signups,
    }


# ---------------------------------------------------------------------------
# GET /admin/stats — quick overview numbers
# ---------------------------------------------------------------------------

@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Quick KPI numbers for the dashboard header cards."""
    now = datetime.utcnow()
    last_7d = now - timedelta(days=7)

    total_users   = db.query(func.count(User.id)).scalar() or 0
    total_recipes = db.query(func.count(Recipe.id)).scalar() or 0
    active_7d     = db.query(func.count(User.id)).filter(User.last_active >= last_7d).scalar() or 0
    recipes_today = db.query(func.count(Recipe.id)).filter(
        Recipe.generated_at >= now.replace(hour=0, minute=0, second=0)
    ).scalar() or 0
    free_users    = db.query(func.count(User.id)).filter(User.tier == "free").scalar() or 0
    pro_users     = db.query(func.count(User.id)).filter(User.tier == "pro").scalar() or 0
    total_ingr    = db.query(func.count(Ingredient.id)).scalar() or 0
    total_feedback = db.query(func.count(Feedback.id)).scalar() or 0

    return {
        "total_users":     total_users,
        "total_recipes":   total_recipes,
        "active_7d":       active_7d,
        "recipes_today":   recipes_today,
        "free_users":      free_users,
        "pro_users":       pro_users,
        "total_ingredients": total_ingr,
        "total_feedback":  total_feedback,
    }


# ---------------------------------------------------------------------------
# GET /admin/users — paginated user list
# ---------------------------------------------------------------------------

@router.get("/users")
def list_users(
    page: int = 1,
    per_page: int = 20,
    search: Optional[str] = None,
    tier: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Paginated list of all users with their recipe counts and ingredient counts.
    Supports filtering by search (email/name) and tier.
    """
    q = db.query(User)
    if search:
        q = q.filter(
            User.email.ilike(f"%{search}%") |
            User.name.ilike(f"%{search}%")
        )
    if tier:
        q = q.filter(User.tier == tier)

    total = q.count()
    users = q.order_by(User.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    result = []
    for u in users:
        recipe_count = db.query(func.count(Recipe.id)).filter(Recipe.user_id == u.id).scalar() or 0
        ingr_count   = db.query(func.count(Ingredient.id)).filter(Ingredient.user_id == u.id).scalar() or 0
        result.append({
            **u.to_dict(),
            "total_recipes":     recipe_count,
            "total_ingredients": ingr_count,
        })

    return {
        "users":    result,
        "total":    total,
        "page":     page,
        "per_page": per_page,
        "pages":    (total + per_page - 1) // per_page,
    }


# ---------------------------------------------------------------------------
# PUT /admin/users/{user_id} — update tier / admin status
# ---------------------------------------------------------------------------

@router.put("/users/{user_id}")
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update a user's tier, admin status, or manually reset recipe count."""
    if user_id == admin.id and payload.is_admin is False:
        raise HTTPException(400, "You cannot remove your own admin status.")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")

    valid_tiers = {"free", "pro", "credits"}
    if payload.tier is not None:
        if payload.tier not in valid_tiers:
            raise HTTPException(400, f"Invalid tier. Must be one of: {', '.join(valid_tiers)}")
        user.tier = payload.tier
    if payload.is_admin is not None:
        user.is_admin = payload.is_admin
    if payload.recipe_count is not None:
        user.recipe_count = max(0, payload.recipe_count)

    db.commit()
    db.refresh(user)
    return user.to_dict()


# ---------------------------------------------------------------------------
# GET /admin/analytics — chart data
# ---------------------------------------------------------------------------

@router.get("/analytics")
def get_analytics(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Returns all chart-ready data arrays for the admin dashboard.
    Includes time-series (14 days), cuisine pie, ingredient categories,
    feedback ratings, top dishes, and top searches.
    """
    ctx = _build_data_context(db)
    return {
        "daily_recipes":         ctx["daily_recipe_counts"],
        "daily_signups":         ctx["daily_signup_counts"],
        "cuisine_distribution":  ctx["top_cuisines"],
        "category_distribution": ctx["ingredients"]["category_distribution"],
        "top_dishes":            ctx["top_dishes"],
        "top_searches":          ctx["top_searches"],
        "top_ingredients":       ctx["ingredients"]["top_ingredients"],
        "feedback_distribution": ctx["feedback_distribution"],
    }


# ---------------------------------------------------------------------------
# POST /admin/ask — LLM Q&A on real data
# ---------------------------------------------------------------------------

ADMIN_QA_SYSTEM = """You are PantryChef's data analyst assistant. You have access to real-time
aggregated statistics from the PantryChef platform database.

Answer the admin's question using the data context provided. Be specific and cite numbers.
Keep answers concise — 2 to 5 sentences unless a list or table is clearly better.
If the data doesn't contain enough information to answer, say so clearly.

Do NOT make up numbers. Only reference values that appear in the DATA CONTEXT below.

DATA CONTEXT (live from database):
{context}
"""


@router.post("/ask")
def admin_ask(
    payload: AdminAskRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    LLM Q&A endpoint. Admin types a natural language question,
    backend fetches fresh aggregated data, passes it to GPT-4o,
    and returns a grounded answer.

    Example questions:
      "Which cuisine is most popular?"
      "How many users signed up this week?"
      "Which users are at risk of churning?"
      "What are the top 5 most searched dishes?"
    """
    # Build fresh data context every time so answers are always up to date
    ctx = _build_data_context(db)
    ctx_json = json.dumps(ctx, indent=2, ensure_ascii=False)

    # Trim context if it's too long (keep most important sections)
    if len(ctx_json) > 8000:
        # Remove daily arrays which are verbose but less useful for Q&A
        ctx.pop("daily_recipe_counts", None)
        ctx.pop("daily_signup_counts", None)
        ctx_json = json.dumps(ctx, indent=2, ensure_ascii=False)

    system_prompt = ADMIN_QA_SYSTEM.format(context=ctx_json)

    messages = [{"role": "system", "content": system_prompt}]

    # Include recent chat history for multi-turn conversations
    for turn in (payload.chat_history or [])[-8:]:
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": turn["content"]})

    messages.append({"role": "user", "content": payload.question})

    try:
        resp = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=0.3,  # lower temperature = more factual, less creative
            max_tokens=600,
        )
        answer = resp.choices[0].message.content.strip()
    except Exception as e:
        raise HTTPException(502, f"AI service error: {e}")

    return {
        "answer":   answer,
        "question": payload.question,
        "context_snapshot": {
            "total_users":   ctx["users"]["total"],
            "total_recipes": ctx["recipes"]["total"],
            "generated_at":  ctx["generated_at"],
        },
    }
