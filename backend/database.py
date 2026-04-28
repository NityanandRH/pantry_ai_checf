"""
database.py — PostgreSQL connection using SQLAlchemy.

Reads DATABASE_URL from environment variable.
Local dev: set DATABASE_URL=postgresql://pantry:pantrylocal123@localhost:5432/pantrydb
AWS: DATABASE_URL is injected from Secrets Manager via App Runner env vars.

This module REPLACES the DB connection code that was previously in models.py.
models.py now only contains table definitions.
"""

import os
import warnings
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from dotenv import load_dotenv

# Load .env when running locally (no-op in production where env vars are injected)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # Fallback to SQLite for developers who haven't set up PostgreSQL yet
    # This allows the app to start without docker-compose if AUTH_DISABLED=true
    
    warnings.warn(
        "DATABASE_URL not set — falling back to SQLite (pantry.db). "
        "For multi-user / AWS deployment, run docker-compose up -d first.",
        RuntimeWarning,
        stacklevel=2,
    )
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'pantry.db')}"

# Connection pool settings suitable for both local dev and AWS App Runner
if DATABASE_URL.startswith("postgresql"):
    engine = create_engine(
        DATABASE_URL,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,        # test connection before using from pool
        pool_recycle=1800,         # recycle connections every 30 min
        connect_args={
            "connect_timeout": 10,
            "application_name": "pantry-chef",
        },
    )
else:
    # SQLite fallback
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency — yields a DB session, closes it after the request."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    Create all tables if they don't exist.
    Used for local development — in production, Alembic handles migrations.
    Import Base + all models before calling this so SQLAlchemy knows all tables.
    """
    # Import models here to register them with Base.metadata
    import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
