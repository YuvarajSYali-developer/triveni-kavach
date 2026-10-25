"""Request dependencies: authentication, role checks and farm-scoped access.

Authorisation is enforced here, on the server. The client-side role only controls
which navigation items are shown."""

from __future__ import annotations

from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import Farm, Role, User

bearer = HTTPBearer(auto_error=False)

_UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated. Please sign in again.",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None or creds.scheme.lower() != "bearer":
        raise _UNAUTHENTICATED
    try:
        payload = decode_access_token(creds.credentials)
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise _UNAUTHENTICATED from None
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _UNAUTHENTICATED
    return user


def require_roles(*roles: Role) -> Callable[[User], User]:
    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role does not permit this action.")
        return user

    return checker


def scope_farms(stmt: Select, user: User) -> Select:
    """Restrict a query over ``Farm`` to the farms ``user`` may see."""
    if user.role == Role.ADMIN:
        return stmt
    if user.role == Role.VETERINARIAN:
        return stmt.where(Farm.veterinarian_id == user.id)
    return stmt.where(Farm.owner_id == user.id)


def accessible_farm_ids(db: Session, user: User) -> list[int]:
    return list(db.scalars(scope_farms(select(Farm.id), user)))


def can_access_farm(user: User, farm: Farm) -> bool:
    return (
        user.role == Role.ADMIN
        or (user.role == Role.VETERINARIAN and farm.veterinarian_id == user.id)
        or (user.role == Role.FARMER and farm.owner_id == user.id)
    )


def get_accessible_farm(db: Session, user: User, farm_id: int) -> Farm:
    """Return the farm or raise 404. Inaccessible farms are reported as not found so
    record identifiers cannot be enumerated by unauthorised users."""
    farm = db.get(Farm, farm_id)
    if farm is None or not can_access_farm(user, farm):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Farm not found.")
    return farm
