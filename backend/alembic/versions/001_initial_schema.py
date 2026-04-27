"""Initial schema — all tables

Revision ID: 001
Revises:
Create Date: 2025-01-01 00:00:00
"""

from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id",              sa.Integer(),     nullable=False),
        sa.Column("cognito_sub",     sa.String(128),   nullable=False),
        sa.Column("email",           sa.String(255),   nullable=False),
        sa.Column("name",            sa.String(255),   nullable=True),
        sa.Column("picture",         sa.String(500),   nullable=True),
        sa.Column("tier",            sa.String(20),    nullable=False, server_default="free"),
        sa.Column("recipe_count",    sa.Integer(),     nullable=False, server_default="0"),
        sa.Column("credits_balance", sa.Float(),       nullable=False, server_default="0.0"),
        sa.Column("is_admin",        sa.Boolean(),     nullable=False, server_default="false"),
        sa.Column("created_at",      sa.DateTime(),    nullable=True),
        sa.Column("last_active",     sa.DateTime(),    nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cognito_sub"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_cognito_sub", "users", ["cognito_sub"])
    op.create_index("ix_users_email",       "users", ["email"])

    # ── ingredients ────────────────────────────────────────────────────────
    op.create_table(
        "ingredients",
        sa.Column("id",          sa.Integer(),    nullable=False),
        sa.Column("user_id",     sa.Integer(),    nullable=False),
        sa.Column("name",        sa.String(255),  nullable=False),
        sa.Column("category",    sa.String(50),   nullable=False),
        sa.Column("quantity",    sa.Float(),      nullable=True),
        sa.Column("unit",        sa.String(20),   nullable=True),
        sa.Column("expiry_date", sa.Date(),       nullable=True),
        sa.Column("created_at",  sa.DateTime(),   nullable=True),
        sa.Column("updated_at",  sa.DateTime(),   nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ingredients_user_id",       "ingredients", ["user_id"])
    op.create_index("ix_ingredients_user_category", "ingredients", ["user_id", "category"])

    # ── recipes ────────────────────────────────────────────────────────────
    op.create_table(
        "recipes",
        sa.Column("id",                 sa.Integer(),    nullable=False),
        sa.Column("user_id",            sa.Integer(),    nullable=False),
        sa.Column("name",               sa.String(255),  nullable=False),
        sa.Column("recipe_json",        sa.Text(),       nullable=False),
        sa.Column("inventory_snapshot", sa.Text(),       nullable=False),
        sa.Column("filters_used",       sa.Text(),       nullable=True),
        sa.Column("cache_hash",         sa.String(64),   nullable=True),
        sa.Column("session_id",         sa.String(64),   nullable=True),
        sa.Column("mode",               sa.String(10),   nullable=False),
        sa.Column("dish_searched",      sa.String(255),  nullable=True),
        sa.Column("is_favourite",       sa.Boolean(),    nullable=False, server_default="false"),
        sa.Column("is_user_submitted",  sa.Boolean(),    nullable=False, server_default="false"),
        sa.Column("generated_at",       sa.DateTime(),   nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_recipes_user_id",    "recipes", ["user_id"])
    op.create_index("ix_recipes_cache_hash", "recipes", ["cache_hash"])
    op.create_index("ix_recipes_session_id", "recipes", ["session_id"])
    op.create_index("ix_recipes_user_mode",  "recipes", ["user_id", "mode"])
    op.create_index("ix_recipes_user_fav",   "recipes", ["user_id", "is_favourite"])

    # ── favourites ─────────────────────────────────────────────────────────
    op.create_table(
        "favourites",
        sa.Column("id",        sa.Integer(),  nullable=False),
        sa.Column("recipe_id", sa.Integer(),  nullable=False),
        sa.Column("saved_at",  sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── feedback ───────────────────────────────────────────────────────────
    op.create_table(
        "feedback",
        sa.Column("id",         sa.Integer(),   nullable=False),
        sa.Column("recipe_id",  sa.Integer(),   nullable=False),
        sa.Column("rating",     sa.String(20),  nullable=False),
        sa.Column("notes",      sa.Text(),      nullable=True),
        sa.Column("created_at", sa.DateTime(),  nullable=True),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── user_recipes ───────────────────────────────────────────────────────
    op.create_table(
        "user_recipes",
        sa.Column("id",           sa.Integer(),    nullable=False),
        sa.Column("user_id",      sa.Integer(),    nullable=False),
        sa.Column("name",         sa.String(255),  nullable=False),
        sa.Column("ingredients",  sa.Text(),       nullable=False),
        sa.Column("steps",        sa.Text(),       nullable=False),
        sa.Column("cuisine",      sa.String(100),  nullable=True),
        sa.Column("submitted_at", sa.DateTime(),   nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_recipes_user_id", "user_recipes", ["user_id"])


def downgrade() -> None:
    op.drop_table("user_recipes")
    op.drop_table("feedback")
    op.drop_table("favourites")
    op.drop_table("recipes")
    op.drop_table("ingredients")
    op.drop_table("users")
