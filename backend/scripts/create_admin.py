"""Create a department administrator account interactively (for a database without demo data).

Usage (from the backend directory, after ``alembic upgrade head``):
    python scripts/create_admin.py
"""

from __future__ import annotations

import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import ValidationError  # noqa: E402
from sqlalchemy import func, select  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models import Role, User  # noqa: E402
from app.schemas import UserCreate  # noqa: E402


def main() -> None:
    email = input("E-mail: ").strip()
    name = input("Full name: ").strip()
    password = getpass.getpass("Password (min 10 chars, letters and digits): ")
    if password != getpass.getpass("Repeat password: "):
        raise SystemExit("Passwords do not match.")
    try:
        data = UserCreate(email=email, full_name=name, role=Role.ADMIN, password=password)
    except ValidationError as exc:
        raise SystemExit("; ".join(e["msg"] for e in exc.errors())) from None
    with SessionLocal() as db:
        if db.scalar(select(User).where(func.lower(User.email) == data.email.lower())):
            raise SystemExit("A user with this e-mail already exists.")
        db.add(
            User(
                email=data.email.lower(), full_name=data.full_name, role=Role.ADMIN, hashed_password=hash_password(data.password)
            )
        )
        db.commit()
    print(f"Administrator {data.email} created.")


if __name__ == "__main__":
    main()
