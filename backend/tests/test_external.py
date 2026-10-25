"""Weather, official outbreak notices, livestock statistics, data.gov.in import,
login rate limiting and production settings. External HTTP is mocked with
httpx.MockTransport; responses follow the providers' documented formats."""

import io
from datetime import date, timedelta

import httpx
import pytest

from app.core.config import Settings
from app.services import datagov, weather

API = "/api/v1"
TODAY = date.today()


def meteo_payload(tmax=(31.0, 36.4, 33.0)):
    days = [(TODAY + timedelta(days=i)).isoformat() for i in range(3)]
    return {
        "latitude": 14.8,
        "longitude": 75.4,
        "timezone": "Asia/Kolkata",
        "current": {
            "time": f"{days[0]}T14:00",
            "temperature_2m": 30.2,
            "relative_humidity_2m": 48,
            "apparent_temperature": 31.5,
            "precipitation": 0.0,
            "weather_code": 2,
            "wind_speed_10m": 11.3,
        },
        "daily": {
            "time": days,
            "temperature_2m_max": list(tmax),
            "temperature_2m_min": [21.0, 22.1, None],
            "precipitation_sum": [0.0, 1.2, 0.0],
        },
    }


@pytest.fixture
def mock_http(monkeypatch):
    """Route every httpx.Client created by the services through a handler."""
    calls = []
    state = {"handler": lambda req: httpx.Response(200, json=meteo_payload())}
    real_client = httpx.Client  # patched below on the shared httpx module

    def factory(*a, **kw):
        def handler(request):
            calls.append(request)
            return state["handler"](request)

        return real_client(transport=httpx.MockTransport(handler))

    monkeypatch.setattr("app.services.weather.httpx.Client", factory)
    monkeypatch.setattr("app.services.datagov.httpx.Client", factory)
    return state, calls


# --------------------------------------------------------------------- weather
def test_parse_response_and_heat_advisory():
    out = weather.parse_response(meteo_payload())
    assert out["current"]["temperature_c"] == 30.2
    assert out["forecast"][2]["temperature_min_c"] is None  # missing stays missing
    assert len(out["advisories"]) == 1 and "36" in out["advisories"][0] and "not a shed measurement" in out["advisories"][0]
    assert weather.parse_response(meteo_payload(tmax=(30, 31, 32)))["advisories"] == []
    with pytest.raises(weather.WeatherUnavailable):
        weather.parse_response({"error": True, "reason": "bad"})


def test_weather_endpoint_caches_and_attributes(client, auth, farm, mock_http):
    _, calls = mock_http
    r = client.get(f"{API}/farms/{farm.id}/weather", headers=auth["farmer"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "open-meteo" and body["attribution"]["licence"] == "CC BY 4.0"
    assert body["taluk"] == "Haveri" and body["cached"] is False
    q = dict(calls[0].url.params)
    assert q["timezone"] == "Asia/Kolkata" and "temperature_2m" in q["current"] and q["latitude"] == "14.795"
    again = client.get(f"{API}/weather", params={"district": "Haveri", "taluk": "Haveri"}, headers=auth["vet"]).json()
    assert again["cached"] is True and len(calls) == 1


def test_weather_failures_are_reported_not_faked(client, auth, farm, mock_http):
    state, _ = mock_http
    state["handler"] = lambda req: httpx.Response(500, json={})
    r = client.get(f"{API}/farms/{farm.id}/weather", headers=auth["farmer"])
    assert r.status_code == 503 and "could not be reached" in r.json()["detail"]
    r = client.get(f"{API}/weather", params={"district": "Mysuru", "taluk": "Hunsur"}, headers=auth["farmer"])
    assert r.status_code == 404
    assert client.get(f"{API}/farms/{farm.id}/weather", headers=auth["farmer2"]).status_code == 404


# ------------------------------------------------------------ outbreak notices
def notice(**kw):
    body = {
        "disease": "African swine fever",
        "species": "pig",
        "district": "Haveri",
        "taluk": "Haveri",
        "reported_on": (TODAY - timedelta(days=3)).isoformat(),
        "status": "active",
        "source_name": "Department of Animal Husbandry and Veterinary Services, Karnataka",
        "source_url": "https://ahvs.karnataka.gov.in/notice/example",
    }
    body.update(kw)
    return body


def test_outbreak_permissions_and_validation(client, auth):
    assert client.post(f"{API}/outbreaks", json=notice(), headers=auth["farmer"]).status_code == 403
    for bad in (
        notice(source_url="not a url"),
        notice(source_url=""),
        notice(source_name=""),
        notice(reported_on=(TODAY + timedelta(days=1)).isoformat()),
        notice(status="closed"),
        notice(closed_on=TODAY.isoformat()),
    ):
        assert client.post(f"{API}/outbreaks", json=bad, headers=auth["vet"]).status_code == 422, bad
    r = client.post(f"{API}/outbreaks", json=notice(), headers=auth["vet"])
    assert r.status_code == 201
    nid = r.json()["id"]
    # only the author or an administrator can change it; only administrators delete
    assert client.put(f"{API}/outbreaks/{nid}", json=notice(), headers=auth["vet2"]).status_code == 403
    closed = notice(status="closed", closed_on=TODAY.isoformat())
    assert client.put(f"{API}/outbreaks/{nid}", json=closed, headers=auth["vet"]).json()["status"] == "closed"
    assert client.delete(f"{API}/outbreaks/{nid}", headers=auth["vet"]).status_code == 403
    assert client.delete(f"{API}/outbreaks/{nid}", headers=auth["admin"]).status_code == 204


def test_advisories_match_district_and_species(client, auth, farm, other_farm):
    client.post(f"{API}/outbreaks", json=notice(), headers=auth["admin"])  # pig, Haveri
    client.post(f"{API}/outbreaks", json=notice(disease="Avian influenza", species="poultry"), headers=auth["admin"])
    client.post(f"{API}/outbreaks", json=notice(district="Dharwad"), headers=auth["admin"])
    adv = client.get(f"{API}/farms/{farm.id}/advisories", headers=auth["farmer"]).json()
    assert [a["disease"] for a in adv] == ["African swine fever"]  # pig farm in Haveri only
    poultry = client.get(f"{API}/farms/{other_farm.id}/advisories", headers=auth["farmer2"]).json()
    assert [a["disease"] for a in poultry] == ["Avian influenza"]
    dash = client.get(f"{API}/dashboard/summary", headers=auth["farmer"]).json()
    assert {n["district"] for n in dash["official_notices"]} == {"Haveri"}
    assert len(client.get(f"{API}/dashboard/summary", headers=auth["admin"]).json()["official_notices"]) == 3
    assert client.get(f"{API}/dashboard/summary", headers=auth["vet2"]).json()["official_notices"]  # Savanur is in Haveri
    listed = client.get(f"{API}/outbreaks", params={"district": "haveri", "species": "pig"}, headers=auth["farmer"]).json()
    assert listed["total"] == 1


# --------------------------------------------------------- livestock statistics
def stat(**kw):
    body = {
        "state": "Karnataka",
        "district": "Haveri",
        "species": "pig",
        "population": 1234,
        "reference_year": 2019,
        "source_name": "20th Livestock Census",
        "source_url": "https://dahd.gov.in/example",
    }
    body.update(kw)
    return body


def test_statistics_manual_upsert_and_permissions(client, auth):
    assert client.post(f"{API}/statistics/livestock", json=stat(), headers=auth["vet"]).status_code == 403
    assert client.post(f"{API}/statistics/livestock", json=stat(), headers=auth["admin"]).status_code == 201
    r = client.post(f"{API}/statistics/livestock", json=stat(population=2000), headers=auth["admin"])
    assert r.json()["population"] == 2000  # same key updates rather than duplicating
    assert client.get(f"{API}/statistics/livestock", headers=auth["farmer"]).json()["total"] == 1
    for bad in (stat(population=-1), stat(reference_year=TODAY.year + 1), stat(source_url="ftp://x"), stat(species="cattle")):
        assert client.post(f"{API}/statistics/livestock", json=bad, headers=auth["admin"]).status_code == 422


def test_statistics_csv_import(client, auth):
    csv_text = (
        "state,district,species,population,reference_year,source_name,source_url\n"
        'Karnataka,Haveri,pig,"1,500",2019,Census,https://example.gov.in/a\n'
        "Karnataka,Dharwad,poultry,250000,2019,Census,https://example.gov.in/a\n"
        "Karnataka,Gadag,pig,NA,2019,Census,https://example.gov.in/a\n"
        "Karnataka,Gadag,goat,10,2019,Census,https://example.gov.in/a\n"
    )
    files = {"file": ("census.csv", io.BytesIO(csv_text.encode()), "text/csv")}
    assert client.post(f"{API}/statistics/livestock/import-csv", files=files, headers=auth["vet"]).status_code == 403
    files = {"file": ("census.csv", io.BytesIO(csv_text.encode()), "text/csv")}
    r = client.post(f"{API}/statistics/livestock/import-csv", files=files, headers=auth["admin"]).json()
    assert r["created"] == 2 and r["updated"] == 0 and len(r["skipped"]) == 2
    rows = client.get(f"{API}/statistics/livestock", params={"district": "Haveri"}, headers=auth["admin"]).json()["items"]
    assert rows[0]["population"] == 1500 and rows[0]["import_method"] == "csv"
    bad = {"file": ("x.csv", io.BytesIO(b"district,population\nHaveri,1\n"), "text/csv")}
    assert client.post(f"{API}/statistics/livestock/import-csv", files=bad, headers=auth["admin"]).status_code == 422


# ------------------------------------------------------------------ data.gov.in
def datagov_page(records):
    return {
        "title": "District-wise livestock",
        "total": len(records),
        "field": [
            {"id": "state", "name": "State", "type": "keyword"},
            {"id": "district", "name": "District", "type": "keyword"},
            {"id": "pigs", "name": "Pigs", "type": "double"},
            {"id": "poultry_total", "name": "Poultry", "type": "double"},
        ],
        "records": records,
    }


RECORDS = [
    {"state": "Karnataka", "district": "Haveri", "pigs": "12,345", "poultry_total": "456789"},
    {"state": "Karnataka", "district": "Gadag", "pigs": "NA", "poultry_total": 1000},
    {"state": "Kerala", "district": "Idukki", "pigs": "50", "poultry_total": "70"},
]


def test_parse_count():
    assert datagov.parse_count("1,234") == 1234 and datagov.parse_count(12.0) == 12
    for v in ("NA", "-", "", None, -3, "1.5", True):
        assert datagov.parse_count(v) is None


def test_datagov_requires_key(client, auth, monkeypatch):
    monkeypatch.setattr("app.services.datagov.get_settings", lambda: Settings(DATA_GOV_IN_API_KEY=""))
    r = client.get(f"{API}/statistics/livestock/datagov/preview", params={"resource_id": "abcd1234-ef"}, headers=auth["admin"])
    assert r.status_code == 502 and "not configured" in r.json()["detail"]


def test_datagov_preview_and_import(client, auth, monkeypatch, mock_http):
    state, calls = mock_http
    state["handler"] = lambda req: httpx.Response(200, json=datagov_page(RECORDS))
    monkeypatch.setattr("app.services.datagov.get_settings", lambda: Settings(DATA_GOV_IN_API_KEY="test-key"))
    assert (
        client.get(
            f"{API}/statistics/livestock/datagov/preview", params={"resource_id": "abcd1234-ef"}, headers=auth["farmer"]
        ).status_code
        == 403
    )
    p = client.get(
        f"{API}/statistics/livestock/datagov/preview", params={"resource_id": "abcd1234-ef"}, headers=auth["admin"]
    ).json()
    assert [f["id"] for f in p["fields"]] == ["state", "district", "pigs", "poultry_total"] and len(p["sample_records"]) == 3
    assert calls[0].url.params["api-key"] == "test-key" and calls[0].url.path.endswith("/abcd1234-ef")
    body = {
        "resource_id": "abcd1234-ef",
        "state_field": "state",
        "district_field": "district",
        "pig_field": "pigs",
        "poultry_field": "poultry_total",
        "state_filter": "Karnataka",
        "reference_year": 2019,
        "source_name": "20th Livestock Census",
    }
    r = client.post(f"{API}/statistics/livestock/datagov/import", json=body, headers=auth["admin"])
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 3 and any("Gadag" in s for s in r.json()["skipped"])  # Haveri x2 + Gadag poultry
    items = client.get(f"{API}/statistics/livestock", params={"state": "Karnataka"}, headers=auth["admin"]).json()["items"]
    haveri_pig = next(i for i in items if i["district"] == "Haveri" and i["species"] == "pig")
    assert haveri_pig["population"] == 12345 and haveri_pig["source_url"] == "https://data.gov.in/resource/abcd1234-ef"
    assert all(i["state"] == "Karnataka" for i in items)
    state["handler"] = lambda req: httpx.Response(403, json={})
    assert client.post(f"{API}/statistics/livestock/datagov/import", json=body, headers=auth["admin"]).status_code == 502
    bad = {**body, "resource_id": "../../etc"}
    assert client.post(f"{API}/statistics/livestock/datagov/import", json=bad, headers=auth["admin"]).status_code == 422


# ---------------------------------------------------------- security settings
def test_login_rate_limit(client, users):
    email = users["farmer"].email
    for _ in range(8):
        assert client.post(f"{API}/auth/login", json={"email": email, "password": "wrong-password-1"}).status_code == 401
    r = client.post(f"{API}/auth/login", json={"email": email, "password": "Correct-horse-42"})
    assert r.status_code == 429 and int(r.headers["Retry-After"]) > 0
    # other accounts are unaffected
    assert client.post(f"{API}/auth/login", json={"email": users["vet"].email, "password": "Correct-horse-42"}).status_code == 200


def test_successful_login_resets_failures(client, users):
    email = users["farmer"].email
    for _ in range(7):
        client.post(f"{API}/auth/login", json={"email": email, "password": "wrong-password-1"})
    assert client.post(f"{API}/auth/login", json={"email": email, "password": "Correct-horse-42"}).status_code == 200
    for _ in range(7):
        assert client.post(f"{API}/auth/login", json={"email": email, "password": "wrong-password-1"}).status_code == 401


def test_production_settings_guard():
    s = Settings(
        APP_ENV="production",
        SECRET_KEY="x" * 40,
        DATABASE_URL="postgres://u:p@db.example/neondb?sslmode=require",
        CORS_ORIGINS="https://triveni-kavach.vercel.app",
    )
    assert s.DATABASE_URL == "postgresql+psycopg://u:p@db.example/neondb?sslmode=require"
    s.check_production()
    with pytest.raises(RuntimeError, match="PostgreSQL"):
        Settings(
            APP_ENV="production", SECRET_KEY="x" * 40, DATABASE_URL="sqlite:///x.db", CORS_ORIGINS="https://a.app"
        ).check_production()
    with pytest.raises(RuntimeError, match="CORS"):
        Settings(
            APP_ENV="production", SECRET_KEY="x" * 40, DATABASE_URL="postgresql://u@h/d", CORS_ORIGINS="http://localhost:5173"
        ).check_production()
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        Settings(
            APP_ENV="production", SECRET_KEY="", DATABASE_URL="postgresql://u@h/d", CORS_ORIGINS="https://a.app"
        ).check_production()
