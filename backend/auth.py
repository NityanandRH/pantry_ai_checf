"""
auth.py — JWT authentication using AWS Cognito.

How it works:
1. User clicks "Sign in with Google" in the frontend
2. Frontend redirects to Cognito Hosted UI
3. Cognito handles Google OAuth, creates a JWT (access + id tokens)
4. Frontend stores the JWT in localStorage
5. Frontend sends JWT in every API request: Authorization: Bearer <token>
6. This file verifies the token is real (using Cognito's public keys)
7. Extracts user info (email, name, cognito_sub) from the token
8. Finds or auto-creates the User row in the database
9. Returns the User object as the current_user in every protected route

AUTH_DISABLED=true mode:
  During local development before Cognito is configured, set AUTH_DISABLED=true
  in your .env file. The app will skip JWT verification and return a fake
  admin user so you can test everything without setting up Cognito.
"""

import os
import json
import time
import logging
from typing import Optional
from functools import lru_cache

import requests
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError, ExpiredSignatureError
from sqlalchemy.orm import Session

from database import get_db
from models import User

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config from environment
# ---------------------------------------------------------------------------

COGNITO_REGION      = os.getenv("COGNITO_REGION", "ap-south-1")
COGNITO_USER_POOL_ID = os.getenv("COGNITO_USER_POOL_ID", "")
COGNITO_APP_CLIENT_ID = os.getenv("COGNITO_APP_CLIENT_ID", "")
AUTH_DISABLED       = os.getenv("AUTH_DISABLED", "false").lower() == "true"

COGNITO_ISSUER = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"
JWKS_URL       = f"{COGNITO_ISSUER}/.well-known/jwks.json"

bearer_scheme = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# JWKS — public keys used to verify JWT signatures
# Cached with TTL — refreshed every 24 hours
# ---------------------------------------------------------------------------

_jwks_cache: dict = {}
_jwks_fetched_at: float = 0.0
JWKS_TTL = 86400  # 24 hours


def _get_jwks() -> dict:
    """Fetch and cache Cognito's public keys (JWKS)."""
    global _jwks_cache, _jwks_fetched_at
    now = time.time()
    if _jwks_cache and (now - _jwks_fetched_at) < JWKS_TTL:
        return _jwks_cache
    try:
        resp = requests.get(JWKS_URL, timeout=5)
        resp.raise_for_status()
        _jwks_cache = {k["kid"]: k for k in resp.json().get("keys", [])}
        _jwks_fetched_at = now
        logger.info("JWKS refreshed — %d keys loaded", len(_jwks_cache))
    except Exception as exc:
        logger.error("Failed to fetch JWKS: %s", exc)
        if not _jwks_cache:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Auth service unavailable. Please try again.",
            )
    return _jwks_cache


# ---------------------------------------------------------------------------
# JWT verification
# ---------------------------------------------------------------------------

def _verify_token(token: str) -> dict:
    """
    Verify a Cognito JWT and return its claims.
    Raises HTTPException on any verification failure.
    """
    # Decode header to get key ID
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token format")

    kid = unverified_header.get("kid")
    if not kid:
        raise HTTPException(status_code=401, detail="Token missing key ID")

    jwks = _get_jwks()
    public_key = jwks.get(kid)
    if not public_key:
        # Key not in cache — force refresh and retry once
        global _jwks_fetched_at
        _jwks_fetched_at = 0
        jwks = _get_jwks()
        public_key = jwks.get(kid)
        if not public_key:
            raise HTTPException(status_code=401, detail="Token signed with unknown key")

    try:
        claims = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=COGNITO_APP_CLIENT_ID,
            issuer=COGNITO_ISSUER,
            options={"verify_at_hash": False},
        )
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired. Please sign in again.")
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=f"Token invalid: {exc}")

    return claims


# ---------------------------------------------------------------------------
# Auto-create or retrieve user from DB
# ---------------------------------------------------------------------------

def _get_or_create_user(claims: dict, db: Session) -> User:
    """
    Find the User row for these JWT claims, or create one if first login.
    Cognito sub is the stable identifier — email may change.
    """
    cognito_sub = claims.get("sub")
    if not cognito_sub:
        raise HTTPException(status_code=401, detail="Token missing user ID")

    # Try by cognito_sub first (most reliable)
    user = db.query(User).filter(User.cognito_sub == cognito_sub).first()

    # Extract profile from claims
    # Cognito puts Google profile claims in different places depending on token type
    email   = claims.get("email") or claims.get("cognito:username", "")
    name    = claims.get("name") or claims.get("given_name", "")
    picture = claims.get("picture", "")

    if user is None:
        # First login — create the user row
        user = User(
            cognito_sub=cognito_sub,
            email=email,
            name=name,
            picture=picture,
            tier="free",
            recipe_count=0,
            credits_balance=0.0,
            is_admin=False,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info("New user created: %s (sub=%s)", email, cognito_sub[:8])
    else:
        # Update profile info on each login in case it changed
        updated = False
        if email and user.email != email:
            user.email = email; updated = True
        if name and user.name != name:
            user.name = name; updated = True
        if picture and user.picture != picture:
            user.picture = picture; updated = True
        if updated:
            db.commit()
            db.refresh(user)

    return user


# ---------------------------------------------------------------------------
# DEV BYPASS USER — used when AUTH_DISABLED=true
# ---------------------------------------------------------------------------

_DEV_USER_EMAIL = os.getenv("DEV_USER_EMAIL", "dev@pantry-chef.local")


def _get_dev_user(db: Session) -> User:
    """
    Returns a fake admin user for local development when AUTH_DISABLED=true.
    Creates the user in DB on first call so recipes/ingredients are stored properly.
    """
    user = db.query(User).filter(User.email == _DEV_USER_EMAIL).first()
    if user is None:
        user = User(
            cognito_sub="dev-local-bypass",
            email=_DEV_USER_EMAIL,
            name="Dev Admin",
            picture="",
            tier="pro",
            recipe_count=0,
            credits_balance=999.0,
            is_admin=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.warning(
            "AUTH_DISABLED=true — dev user created (%s). "
            "NEVER use this in production!",
            _DEV_USER_EMAIL,
        )
    return user


# ---------------------------------------------------------------------------
# FastAPI dependency — inject into any protected route
# ---------------------------------------------------------------------------

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency. Use like:
        current_user: User = Depends(get_current_user)

    Returns the authenticated User ORM object.
    Raises HTTP 401 if token is missing / invalid.
    Raises HTTP 403 if user account is banned (future use).
    """
    # ── Dev bypass ──
    if AUTH_DISABLED:
        return _get_dev_user(db)

    # ── Require Bearer token ──
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Please sign in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    claims = _verify_token(credentials.credentials)
    return _get_or_create_user(claims, db)


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    Additional dependency for admin-only endpoints.
    Use like:
        admin: User = Depends(require_admin)
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return current_user
