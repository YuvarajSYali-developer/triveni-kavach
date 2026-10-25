"""Test fixtures. The schema is created by running the real Alembic migrations, so
the tests also verify that migrations build a working database.

Set TEST_DATABASE_URL to run against PostgreSQL; otherwise a temporary SQLite file
is used."""

import os
import tempfile
from pathlib import Path

_tmp = tempfile.mkdtemp(prefix="tk-test-")
os.environ["APP_ENV"] = "test"
os.environ["SECRET_KEY"] = "test-secret-key-not-for-production-use-0123456789"
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{Path(_tmp, 'test.db').as_posix()}"
os.environ["CORS_ORIGINS"] = "http://localhost:5173"
os.environ["BCRYPT_ROUNDS"] = "4"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Farm, FarmType, Role, User  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]
PASSWORD = "Correct-horse-42"


@pytest.fixture(scope="session", autouse=True)
def _migrate():
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    cfg.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield
    command.downgrade(cfg, "base")


@pytest.fixture(autouse=True)
def _clean():
    yield
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())


@pytest.fixture
def db():
    s = SessionLocal()
    yield s
    s.close()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _user(db, email, role, name=None, active=True):
    u = User(
        email=email, full_name=name or email.split("@")[0], role=role, hashed_password=hash_password(PASSWORD), is_active=active
    )
    db.add(u)
    db.commit()
    return u


@pytest.fixture
def users(db):
    return {
        "admin": _user(db, "admin@test.example", Role.ADMIN),
        "vet": _user(db, "vet@test.example", Role.VETERINARIAN),
        "vet2": _user(db, "vet2@test.example", Role.VETERINARIAN),
        "farmer": _user(db, "farmer@test.example", Role.FARMER),
        "farmer2": _user(db, "farmer2@test.example", Role.FARMER),
    }


def login(client, email, password=PASSWORD):
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def auth(client, users):
    """auth['farmer'] -> headers for that user."""
    return {k: login(client, u.email) for k, u in users.items()}


@pytest.fixture
def farm(db, users):
    """Pig farm owned by 'farmer', assigned to 'vet'."""
    f = Farm(
        name="Test Pig Farm",
        farm_type=FarmType.PIG,
        district="Haveri",
        taluk="Haveri",
        pig_count=100,
        owner_id=users["farmer"].id,
        veterinarian_id=users["vet"].id,
    )
    db.add(f)
    db.commit()
    return f


@pytest.fixture
def other_farm(db, users):
    """Poultry farm owned by 'farmer2', assigned to 'vet2'."""
    f = Farm(
        name="Other Poultry Farm",
        farm_type=FarmType.POULTRY,
        district="Haveri",
        taluk="Savanur",
        poultry_count=1000,
        owner_id=users["farmer2"].id,
        veterinarian_id=users["vet2"].id,
    )
    db.add(f)
    db.commit()
    return f
