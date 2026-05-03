"""add scan_count to users

Revision ID: 003
Revises: 002
Create Date: 2026-04-01
"""
from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("scan_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("scan_reset_date", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("users", "scan_count")
    op.drop_column("users", "scan_reset_date")