from datetime import date, datetime, timedelta, timezone

API = "/api/v1"
TODAY = date.today()


def vax(**kw):
    body = {
        "species": "pig",
        "vaccine_name": "CSF",
        "status": "completed",
        "administered_on": (TODAY - timedelta(days=3)).isoformat(),
        "animals_covered": 50,
    }
    body.update(kw)
    return body


def test_vaccination_crud_and_filters(client, auth, farm):
    url = f"{API}/farms/{farm.id}/vaccinations"
    r = client.post(url, json=vax(), headers=auth["farmer"])
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    client.post(
        url,
        json=vax(status="scheduled", administered_on=None, due_on=(TODAY + timedelta(days=10)).isoformat()),
        headers=auth["vet"],
    )
    assert client.get(url, headers=auth["admin"]).json()["total"] == 2
    assert client.get(url, params={"status": "scheduled"}, headers=auth["farmer"]).json()["total"] == 1
    r = client.get(url, params={"date_from": TODAY.isoformat()}, headers=auth["farmer"]).json()
    assert r["total"] == 1 and r["items"][0]["status"] == "scheduled"
    assert client.get(url, params={"date_from": "2026-02-01", "date_to": "2026-01-01"}, headers=auth["farmer"]).status_code == 422
    r = client.put(f"{url}/{rid}", json=vax(animals_covered=60), headers=auth["farmer"])
    assert r.status_code == 200 and r.json()["animals_covered"] == 60
    assert client.delete(f"{url}/{rid}", headers=auth["farmer"]).status_code == 204
    assert client.get(f"{url}/{rid}", headers=auth["farmer"]).status_code == 404


def test_vaccination_validation(client, auth, farm):
    url = f"{API}/farms/{farm.id}/vaccinations"
    bad = [
        vax(administered_on=None),  # completed without date
        vax(status="scheduled", administered_on=None),  # scheduled without due date
        vax(administered_on=(TODAY + timedelta(days=2)).isoformat()),  # future administration
        vax(animals_covered=-5),
        vax(vaccine_name=""),
    ]
    for body in bad:
        assert client.post(url, json=body, headers=auth["farmer"]).status_code == 422, body
    # species must match farm type
    r = client.post(url, json=vax(species="poultry"), headers=auth["farmer"])
    assert r.status_code == 422 and "cannot have poultry" in r.json()["detail"]


def test_record_permissions(client, auth, farm):
    url = f"{API}/farms/{farm.id}/vaccinations"
    rid = client.post(url, json=vax(), headers=auth["vet"]).json()["id"]
    # farmer can view but not edit a record the vet entered
    assert client.get(f"{url}/{rid}", headers=auth["farmer"]).status_code == 200
    assert client.put(f"{url}/{rid}", json=vax(), headers=auth["farmer"]).status_code == 403
    assert client.delete(f"{url}/{rid}", headers=auth["farmer"]).status_code == 403
    # unrelated users cannot see or create records
    for who in ("farmer2", "vet2"):
        assert client.get(url, headers=auth[who]).status_code == 404
        assert client.get(f"{url}/{rid}", headers=auth[who]).status_code == 404
        assert client.post(url, json=vax(), headers=auth[who]).status_code == 404
    # admin may edit anything
    assert client.put(f"{url}/{rid}", json=vax(batch_number="B1"), headers=auth["admin"]).status_code == 200


def test_record_id_must_belong_to_farm(client, auth, farm, other_farm):
    rid = client.post(
        f"{API}/farms/{other_farm.id}/mortality",
        json={"species": "poultry", "observed_on": TODAY.isoformat(), "count": 2},
        headers=auth["admin"],
    ).json()["id"]
    assert client.get(f"{API}/farms/{farm.id}/mortality/{rid}", headers=auth["admin"]).status_code == 404


def test_mortality(client, auth, farm):
    url = f"{API}/farms/{farm.id}/mortality"
    assert (
        client.post(
            url, json={"species": "pig", "observed_on": TODAY.isoformat(), "count": 0}, headers=auth["farmer"]
        ).status_code
        == 201
    )
    future = (TODAY + timedelta(days=1)).isoformat()
    assert client.post(url, json={"species": "pig", "observed_on": future, "count": 1}, headers=auth["farmer"]).status_code == 422
    assert (
        client.post(
            url, json={"species": "pig", "observed_on": TODAY.isoformat(), "count": -1}, headers=auth["farmer"]
        ).status_code
        == 422
    )


def test_hygiene_result_is_derived(client, auth, farm):
    url = f"{API}/farms/{farm.id}/hygiene"
    ok = {
        "inspected_on": TODAY.isoformat(),
        "footbath_maintained": True,
        "shed_cleaned": True,
        "disinfectant_applied": True,
        "waste_disposed_properly": True,
        "protective_clothing_available": True,
    }
    first = client.post(url, json=ok, headers=auth["vet"]).json()
    assert first["result"] == "pass" and first["recorded_by_id"] is not None
    # a client cannot force a 'pass' result
    r = client.post(url, json={**ok, "footbath_maintained": False, "result": "pass"}, headers=auth["vet"])
    assert r.json()["result"] == "fail"
    assert client.get(url, params={"status": "fail"}, headers=auth["farmer"]).json()["total"] == 1


def test_visitor_log(client, auth, farm):
    url = f"{API}/farms/{farm.id}/visitors"
    entry = datetime.now(timezone.utc) - timedelta(hours=2)
    body = {
        "visitor_name": "Feed supplier",
        "purpose": "Delivery",
        "entry_time": entry.isoformat(),
        "vehicle_disinfected": True,
        "footwear_changed": False,
        "hands_sanitised": True,
        "visited_other_farm_48h": False,
    }
    r = client.post(url, json=body, headers=auth["farmer"])
    assert r.status_code == 201 and r.json()["precautions_complete"] is False
    bad = {**body, "exit_time": (entry - timedelta(hours=1)).isoformat()}
    assert client.post(url, json=bad, headers=auth["farmer"]).status_code == 422
    # naive datetimes are treated as UTC; responses are timezone-aware
    naive = {**body, "entry_time": "2026-01-05T10:00:00"}
    out = client.post(url, json=naive, headers=auth["farmer"]).json()
    assert out["entry_time"].endswith(("+00:00", "Z"))
