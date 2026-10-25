from datetime import date, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.models import Alert, AlertSeverity, AlertStatus

API = "/api/v1"
TODAY = date.today()


def make_risky(client, auth, farm):
    """Records that trigger VACCINATION_OVERDUE and HYGIENE_FAILED with enough data."""
    url = f"{API}/farms/{farm.id}"
    client.post(
        f"{url}/vaccinations",
        json={"species": "pig", "vaccine_name": "CSF", "status": "scheduled", "due_on": (TODAY - timedelta(days=4)).isoformat()},
        headers=auth["vet"],
    )
    for i in range(0, 35, 7):
        client.post(
            f"{url}/mortality",
            json={"species": "pig", "observed_on": (TODAY - timedelta(days=i)).isoformat(), "count": 0},
            headers=auth["farmer"],
        )
    client.post(
        f"{url}/hygiene",
        json={
            "inspected_on": TODAY.isoformat(),
            "footbath_maintained": False,
            "shed_cleaned": True,
            "disinfectant_applied": True,
            "waste_disposed_properly": True,
            "protective_clothing_available": True,
        },
        headers=auth["vet"],
    )


def test_assessment_creates_alerts_and_is_explainable(client, auth, farm):
    make_risky(client, auth, farm)
    r = client.post(f"{API}/farms/{farm.id}/assessments", headers=auth["farmer"])
    assert r.status_code == 201, r.text
    body = r.json()
    a = body["assessment"]
    assert a["status"] == "moderate" and a["score"] == 45
    assert {t["code"] for t in a["triggered_rules"]} == {"VACCINATION_OVERDUE", "HYGIENE_FAILED"}
    for key in ("observations", "recommendations", "data_quality_warnings", "limitations"):
        assert isinstance(a[key], list)
    assert body["alerts_created"] == 2


def test_repeated_assessment_deduplicates(client, auth, farm, db):
    make_risky(client, auth, farm)
    client.post(f"{API}/farms/{farm.id}/assessments", headers=auth["vet"])
    r = client.post(f"{API}/farms/{farm.id}/assessments", headers=auth["vet"]).json()
    assert r["alerts_created"] == 0 and r["alerts_updated"] == 2
    alerts = client.get(f"{API}/alerts", headers=auth["vet"]).json()
    assert alerts["total"] == 2
    assert {a["occurrence_count"] for a in alerts["items"]} == {2}
    assert db.scalar(select(func.count()).select_from(Alert)) == 2


def test_dashboard_refresh_does_not_create_alerts(client, auth, farm, db):
    make_risky(client, auth, farm)
    for _ in range(3):
        assert client.get(f"{API}/dashboard/summary", headers=auth["admin"]).status_code == 200
        client.get(f"{API}/alerts", headers=auth["admin"])
    assert db.scalar(select(func.count()).select_from(Alert)) == 0


def test_alert_lifecycle(client, auth, farm):
    make_risky(client, auth, farm)
    client.post(f"{API}/farms/{farm.id}/assessments", headers=auth["vet"])
    alert = client.get(f"{API}/alerts", params={"severity": "high"}, headers=auth["farmer"]).json()["items"][0]
    aid = alert["id"]
    assert alert["status"] == "open" and alert["farm_name"] == farm.name

    assert client.post(f"{API}/alerts/{aid}/acknowledge", headers=auth["farmer2"]).status_code == 404
    r = client.post(f"{API}/alerts/{aid}/acknowledge", headers=auth["farmer"])
    assert r.status_code == 200 and r.json()["status"] == "acknowledged" and r.json()["acknowledged_at"]
    assert client.post(f"{API}/alerts/{aid}/acknowledge", headers=auth["farmer"]).status_code == 409

    # farmers cannot resolve; a note is required
    assert client.post(f"{API}/alerts/{aid}/resolve", json={"resolution_note": "done"}, headers=auth["farmer"]).status_code == 403
    assert client.post(f"{API}/alerts/{aid}/resolve", json={"resolution_note": ""}, headers=auth["vet"]).status_code == 422
    assert client.post(f"{API}/alerts/{aid}/resolve", json={"resolution_note": "noted"}, headers=auth["vet2"]).status_code == 404
    r = client.post(f"{API}/alerts/{aid}/resolve", json={"resolution_note": "Vaccinated on site"}, headers=auth["vet"])
    assert r.status_code == 200 and r.json()["status"] == "resolved" and r.json()["resolution_note"] == "Vaccinated on site"
    assert client.post(f"{API}/alerts/{aid}/resolve", json={"resolution_note": "again"}, headers=auth["vet"]).status_code == 409

    # condition still present -> a NEW alert is raised on the next assessment
    r = client.post(f"{API}/farms/{farm.id}/assessments", headers=auth["vet"]).json()
    assert r["alerts_created"] == 1
    active = client.get(f"{API}/alerts", params={"active": True}, headers=auth["vet"]).json()
    assert active["total"] == 2


def test_alert_filters_and_scoping(client, auth, farm, other_farm):
    make_risky(client, auth, farm)
    client.post(f"{API}/farms/{farm.id}/assessments", headers=auth["admin"])
    client.post(f"{API}/farms/{other_farm.id}/assessments", headers=auth["admin"])
    # the unrecorded farm raises NO_VACCINATION_RECORDS and HYGIENE_STALE
    assert client.get(f"{API}/alerts", headers=auth["farmer2"]).json()["total"] == 2
    assert client.get(f"{API}/alerts", params={"farm_id": farm.id}, headers=auth["farmer2"]).status_code == 404
    assert client.get(f"{API}/alerts", params={"status": "resolved"}, headers=auth["admin"]).json()["total"] == 0


def test_database_prevents_duplicate_active_alerts(db, farm):
    for _ in range(2):
        db.add(
            Alert(
                farm_id=farm.id,
                rule_code="X",
                dedup_key=f"{farm.id}:X",
                severity=AlertSeverity.LOW,
                status=AlertStatus.OPEN,
                title="t",
                message="m",
            )
        )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    # a resolved alert with the same key is allowed alongside an open one
    db.add(
        Alert(
            farm_id=farm.id,
            rule_code="X",
            dedup_key=f"{farm.id}:X",
            severity=AlertSeverity.LOW,
            status=AlertStatus.RESOLVED,
            title="t",
            message="m",
        )
    )
    db.add(
        Alert(
            farm_id=farm.id,
            rule_code="X",
            dedup_key=f"{farm.id}:X",
            severity=AlertSeverity.LOW,
            status=AlertStatus.OPEN,
            title="t",
            message="m",
        )
    )
    db.commit()


def test_run_all_restricted_to_scope(client, auth, farm, other_farm):
    assert client.post(f"{API}/assessments/run-all", headers=auth["farmer"]).status_code == 403
    r = client.post(f"{API}/assessments/run-all", headers=auth["vet"]).json()
    assert r["farms_assessed"] == 1
