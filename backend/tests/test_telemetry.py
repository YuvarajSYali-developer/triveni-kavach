from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models import EnvironmentalObservation

API = "/api/v1"


def reading(**kw):
    body = {
        "observed_at": (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat(),
        "temperature_c": 27.5,
        "relative_humidity_pct": 65,
    }
    body.update(kw)
    return body


def test_manual_reading_stored_with_source(client, auth, farm, db):
    r = client.post(f"{API}/farms/{farm.id}/environment", json=reading(), headers=auth["farmer"])
    assert r.status_code == 201
    assert r.json()["source"] == "manual"
    row = db.scalar(select(EnvironmentalObservation))
    assert row.source.value == "manual"


def test_form_rejects_non_manual_sources(client, auth, farm):
    for src in ("simulated", "device"):
        r = client.post(f"{API}/farms/{farm.id}/environment", json=reading(source=src), headers=auth["farmer"])
        assert r.status_code == 422


def test_invalid_payloads(client, auth, farm):
    url = f"{API}/farms/{farm.id}/environment"
    future = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    for body in (
        reading(relative_humidity_pct=120),
        reading(temperature_c=99),
        reading(ammonia_ppm=-1),
        {"observed_at": reading()["observed_at"]},  # no values at all
        reading(observed_at=future),
        reading(source="satellite"),
    ):
        assert client.post(url, json=body, headers=auth["farmer"]).status_code == 422, body


def test_ingest_accepts_manual_and_simulated(client, auth, farm):
    payload = {"farm_id": farm.id, "readings": [reading(), reading(source="simulated", ammonia_ppm=12)]}
    r = client.post(f"{API}/telemetry/ingest", json=payload, headers=auth["vet"])
    assert r.status_code == 201 and r.json() == {"farm_id": farm.id, "stored": 2, "sources": ["manual", "simulated"]}
    listed = client.get(f"{API}/farms/{farm.id}/environment", params={"source": "simulated"}, headers=auth["vet"]).json()
    assert listed["total"] == 1


def test_ingest_rejects_device_source_and_foreign_farm(client, auth, farm, other_farm):
    r = client.post(
        f"{API}/telemetry/ingest",
        json={"farm_id": farm.id, "readings": [reading(source="device", device_id="esp-1")]},
        headers=auth["vet"],
    )
    assert r.status_code == 422 and "not enabled" in r.json()["detail"]
    r = client.post(f"{API}/telemetry/ingest", json={"farm_id": other_farm.id, "readings": [reading()]}, headers=auth["vet"])
    assert r.status_code == 404
    r = client.post(f"{API}/telemetry/ingest", json={"farm_id": farm.id, "readings": []}, headers=auth["vet"])
    assert r.status_code == 422


def test_simulator_labels_values_as_simulated(client, auth, farm, db):
    r = client.post(
        f"{API}/farms/{farm.id}/environment/simulate",
        json={"hours": 12, "interval_minutes": 60, "include_excursion": True, "seed": 7},
        headers=auth["farmer"],
    )
    assert r.status_code == 201 and r.json()["stored"] == 12
    rows = db.scalars(select(EnvironmentalObservation)).all()
    assert len(rows) == 12 and {x.source.value for x in rows} == {"simulated"}
    assert all("not a measurement" in x.notes for x in rows)
    assert max(x.temperature_c for x in rows) > 32  # the excursion is present
