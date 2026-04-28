"""Add app_feedback table

Revision ID: 002
Revises: 001
Create Date: 2025-01-01 00:00:00
"""

from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_feedback",
        sa.Column("id",         sa.Integer(),   nullable=False),
        sa.Column("user_id",    sa.Integer(),   nullable=False),
        sa.Column("rating",     sa.Integer(),   nullable=False),
        sa.Column("category",   sa.String(50),  nullable=False),
        sa.Column("message",    sa.Text(),      nullable=True),
        sa.Column("created_at", sa.DateTime(),  nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_app_feedback_user_id", "app_feedback", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_app_feedback_user_id", table_name="app_feedback")
    op.drop_table("app_feedback")