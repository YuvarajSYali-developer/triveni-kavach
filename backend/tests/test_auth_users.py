from datetime import datetime, timedelta, timezone

import jwt

from app.models import Role
from tests.conftest import PASSWORD, _user, login

API = "/api/v1"


def test_health_and_cors(client):
    r = client.get(f"{API}/health", headers={"Origin": "http://localhost:5173"})
    assert r.status_code == 200
    assert r.json()["database"] == "ok"
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"
    r = client.get(f"{API}/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in r.headers


def test_login_success_and_me(client, users):
    h = login(client, users["vet"].email)
    me = client.get(f"{API}/auth/me", headers=h).json()
    assert me["role"] == "veterinarian"
    assert "hashed_password" not in me


def test_login_email_case_insensitive(client, users):
    login(client, "VET@test.example")


def test_login_wrong_password_and_unknown_user(client, users):
    r = client.post(f"{API}/auth/login", json={"email": users["vet"].email, "password": "wrong-password-1"})
    assert r.status_code == 401
    r2 = client.post(f"{API}/auth/login", json={"email": "nobody@test.example", "password": "wrong-password-1"})
    assert r2.status_code == 401
    assert r.json()["detail"] == r2.json()["detail"]  # no user enumeration


def test_inactive_user_cannot_login(client, db):
    _user(db, "gone@test.example", Role.FARMER, active=False)
    r = client.post(f"{API}/auth/login", json={"email": "gone@test.example", "password": PASSWORD})
    assert r.status_code == 401


def test_protected_endpoints_require_token(client):
    for path in ("/auth/me", "/farms", "/alerts", "/dashboard/summary", "/screening"):
        assert client.get(f"{API}{path}").status_code == 401


def test_tampered_and_expired_tokens_rejected(client, users):
    forged = jwt.encode({"sub": str(users["admin"].id), "role": "admin"}, "wrong-key", algorithm="HS256")
    assert client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401
    import os

    expired = jwt.encode(
        {"sub": str(users["admin"].id), "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
        os.environ["SECRET_KEY"],
        algorithm="HS256",
    )
    assert client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_role_claim_in_token_is_not_trusted(client, users):
    """A farmer token with a forged 'admin' role claim (valid signature) gains nothing:
    the role is read from the database."""
    import os

    token = jwt.encode(
        {"sub": str(users["farmer"].id), "role": "admin", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
        os.environ["SECRET_KEY"],
        algorithm="HS256",
    )
    r = client.get(f"{API}/users", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_user_management_admin_only(client, auth):
    body = {"email": "new.vet@test.example", "full_name": "New Vet", "role": "veterinarian", "password": "Longpassword9"}
    assert client.post(f"{API}/users", json=body, headers=auth["farmer"]).status_code == 403
    assert client.post(f"{API}/users", json=body, headers=auth["vet"]).status_code == 403
    assert client.get(f"{API}/users", headers=auth["vet"]).status_code == 403
    r = client.post(f"{API}/users", json=body, headers=auth["admin"])
    assert r.status_code == 201, r.text
    assert client.post(f"{API}/users", json=body, headers=auth["admin"]).status_code == 409
    vets = client.get(f"{API}/users", params={"role": "veterinarian"}, headers=auth["admin"]).json()
    assert {v["email"] for v in vets} >= {"new.vet@test.example", "vet@test.example"}


def test_user_password_policy(client, auth):
    body = {"email": "x@test.example", "full_name": "X Y", "role": "farmer", "password": "short"}
    r = client.post(f"{API}/users", json=body, headers=auth["admin"])
    assert r.status_code == 422
    assert r.json()["code"] == "validation_error"
    assert any(e["field"] == "password" for e in r.json()["errors"])


def test_admin_cannot_deactivate_self(client, auth, users):
    r = client.patch(f"{API}/users/{users['admin'].id}", json={"is_active": False}, headers=auth["admin"])
    assert r.status_code == 400
