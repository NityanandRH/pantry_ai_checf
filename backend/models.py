"""
models.py — SQLAlchemy ORM table definitions.
Database connection is in database.py (not here).
All tables are now multi-user: scoped by user_id.
"""

import json
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean,
    DateTime, Date, Text, ForeignKey, Index,
)
from database import Base


# ---------------------------------------------------------------------------
# Table: users
# Created automatically on first Google login via Cognito.
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    cognito_sub      = Column(String(128), unique=True, nullable=False, index=True)
    # cognito_sub is the unique user ID Cognito assigns — never changes even if email does

    email            = Column(String(255), unique=True, nullable=False, index=True)
    name             = Column(String(255), nullable=True)
    picture          = Column(String(500), nullable=True)  # Google profile photo URL

    tier             = Column(String(20), default="free", nullable=False)
    # free | pro | credits

    recipe_count     = Column(Integer, default=0, nullable=False)
    # Lifetime count for free tier. Reset monthly for pro (future)

    scan_count       = Column(Integer, default=0, nullable=False)
    # Lifetime image scans (pantry + dish). Free tier limit = 1 per type enforced server-side..

    scan_reset_date = Column(DateTime, nullable=True)

    credits_balance  = Column(Float, default=0.0, nullable=False)
    # Only used when tier = 'credits'. Deducted per generation.

    is_admin         = Column(Boolean, default=False, nullable=False)
    # Admin users bypass all limits and can see the admin dashboard.

    created_at       = Column(DateTime, default=datetime.utcnow)
    last_active      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id":             self.id,
            "email":          self.email,
            "name":           self.name,
            "picture":        self.picture,
            "tier":           self.tier,
            "recipe_count":   self.recipe_count,
            "scan_count":     self.scan_count,
            "credits_balance":round(self.credits_balance, 2),
            "is_admin":       self.is_admin,
            "created_at":     self.created_at.isoformat() if self.created_at else None,
            "last_active":    self.last_active.isoformat() if self.last_active else None,
        }


# ---------------------------------------------------------------------------
# Table: ingredients  (now scoped per user)
# ---------------------------------------------------------------------------

class Ingredient(Base):
    __tablename__ = "ingredients"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name        = Column(String(255), nullable=False)
    category    = Column(String(50), nullable=False)
    quantity    = Column(Float, nullable=True)
    unit        = Column(String(20), nullable=True)
    expiry_date = Column(Date, nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_ingredients_user_category", "user_id", "category"),
    )

    def to_dict(self):
        return {
            "id":          self.id,
            "name":        self.name,
            "category":    self.category,
            "quantity":    self.quantity,
            "unit":        self.unit,
            "expiry_date": self.expiry_date.isoformat() if self.expiry_date else None,
            "created_at":  self.created_at.isoformat() if self.created_at else None,
            "updated_at":  self.updated_at.isoformat() if self.updated_at else None,
        }


# ---------------------------------------------------------------------------
# Table: recipes  (now scoped per user)
# ---------------------------------------------------------------------------

class Recipe(Base):
    __tablename__ = "recipes"

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    user_id            = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name               = Column(String(255), nullable=False)
    recipe_json        = Column(Text, nullable=False)
    inventory_snapshot = Column(Text, nullable=False)
    filters_used       = Column(Text, nullable=True)
    cache_hash         = Column(String(64), nullable=True, index=True)
    session_id         = Column(String(64), nullable=True, index=True)
    mode               = Column(String(10), nullable=False)
    dish_searched      = Column(String(255), nullable=True)
    is_favourite       = Column(Boolean, default=False, nullable=False)
    is_user_submitted  = Column(Boolean, default=False, nullable=False)
    generated_at       = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_recipes_user_mode", "user_id", "mode"),
        Index("ix_recipes_user_fav", "user_id", "is_favourite"),
    )

    def to_dict(self):
        return {
            "id":                 self.id,
            "name":               self.name,
            "recipe_json":        json.loads(self.recipe_json),
            "inventory_snapshot": json.loads(self.inventory_snapshot),
            "filters_used":       json.loads(self.filters_used) if self.filters_used else None,
            "session_id":         self.session_id,
            "mode":               self.mode,
            "dish_searched":      self.dish_searched,
            "is_favourite":       bool(self.is_favourite),
            "is_user_submitted":  bool(self.is_user_submitted),
            "generated_at":       self.generated_at.isoformat() if self.generated_at else None,
        }

    def to_summary(self):
        recipe_data = {}
        if self.recipe_json:
            try:
                recipe_data = json.loads(self.recipe_json) if isinstance(self.recipe_json, str) else self.recipe_json
            except (json.JSONDecodeError, TypeError):
                pass
        return {
            "id": self.id,
            "name": self.name,
            "mode": self.mode,
            "cuisine": recipe_data.get("cuisine", ""),
            "cook_time_minutes": recipe_data.get("cook_time_minutes", None),
            "difficulty": recipe_data.get("difficulty", ""),
            "is_favourite": self.is_favourite,
            "generated_at": self.generated_at.isoformat() if self.generated_at else None,
        }


# ---------------------------------------------------------------------------
# Table: favourites  (scoped per user via recipe FK)
# ---------------------------------------------------------------------------

class Favourite(Base):
    __tablename__ = "favourites"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    recipe_id = Column(Integer, ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False)
    saved_at  = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id":        self.id,
            "recipe_id": self.recipe_id,
            "saved_at":  self.saved_at.isoformat() if self.saved_at else None,
        }


# ---------------------------------------------------------------------------
# Table: feedback  (scoped per user via recipe FK)
# ---------------------------------------------------------------------------

class Feedback(Base):
    __tablename__ = "feedback"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    recipe_id  = Column(Integer, ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False)
    rating     = Column(String(20), nullable=False)
    notes      = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id":         self.id,
            "recipe_id":  self.recipe_id,
            "rating":     self.rating,
            "notes":      self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ---------------------------------------------------------------------------
# Table: user_recipes  (scoped per user)
# ---------------------------------------------------------------------------

class UserRecipe(Base):
    __tablename__ = "user_recipes"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    user_id      = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name         = Column(String(255), nullable=False)
    ingredients  = Column(Text, nullable=False)
    steps        = Column(Text, nullable=False)
    cuisine      = Column(String(100), nullable=True)
    submitted_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id":           self.id,
            "name":         self.name,
            "ingredients":  json.loads(self.ingredients),
            "steps":        json.loads(self.steps),
            "cuisine":      self.cuisine,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
        }


# ---------------------------------------------------------------------------
# NEW — Table: app_feedback
# User feedback about the app itself (not about a specific recipe).
# Admin can run LLM analysis on all feedback at once.
# ---------------------------------------------------------------------------
 
class AppFeedback(Base):
    __tablename__ = "app_feedback"
 
    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    rating     = Column(Integer, nullable=False)    # 1–5 stars
    category   = Column(String(50), nullable=False) # general|ui|feature|bug|other
    message    = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
 
    def to_dict(self):
        return {
            "id":         self.id,
            "user_id":    self.user_id,
            "rating":     self.rating,
            "category":   self.category,
            "message":    self.message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }