from datetime import date, timedelta

API = "/api/v1"
TODAY = date.today()


def test_dashboard_counts_come_from_database(client, auth, farm, other_farm):
    client.post(
        f"{API}/farms/{farm.id}/mortality",
        json={"species": "pig", "observed_on": TODAY.isoformat(), "count": 4},
        headers=auth["farmer"],
    )
    client.post(
        f"{API}/farms/{other_farm.id}/mortality",
        json={"species": "poultry", "observed_on": TODAY.isoformat(), "count": 9},
        headers=auth["farmer2"],
    )
    client.post(
        f"{API}/farms/{farm.id}/vaccinations",
        json={"species": "pig", "vaccine_name": "CSF", "status": "scheduled", "due_on": (TODAY + timedelta(days=5)).isoformat()},
        headers=auth["vet"],
    )

    admin = client.get(f"{API}/dashboard/summary", headers=auth["admin"]).json()
    assert admin["farms"]["total"] == 2
    assert {r["type"]: r["count"] for r in admin["farms"]["by_type"]} == {"pig": 1, "poultry": 1, "mixed": 0}
    assert admin["mortality"]["by_species"] == {"pig": 4, "poultry": 9}
    assert admin["vaccinations"]["due_next_30_days"] == 1
    assert admin["contains_demo_data"] is False
    assert {r["status"]: r["count"] for r in admin["risk_status"]}["not_assessed"] == 2
    assert admin["recent_activity"]

    farmer = client.get(f"{API}/dashboard/summary", headers=auth["farmer"]).json()
    assert farmer["farms"]["total"] == 1 and farmer["mortality"]["total_in_period"] == 4
    assert all(a["farm_id"] in (farm.id, None) for a in farmer["recent_activity"])
    vet2 = client.get(f"{API}/dashboard/summary", headers=auth["vet2"]).json()
    assert vet2["mortality"]["by_species"] == {"pig": 0, "poultry": 9}


def test_dashboard_date_filters(client, auth, farm):
    old = (TODAY - timedelta(days=200)).isoformat()
    client.post(
        f"{API}/farms/{farm.id}/mortality", json={"species": "pig", "observed_on": old, "count": 3}, headers=auth["farmer"]
    )
    assert client.get(f"{API}/dashboard/summary", headers=auth["farmer"]).json()["mortality"]["total_in_period"] == 0
    r = client.get(
        f"{API}/dashboard/summary", params={"date_from": (TODAY - timedelta(days=365)).isoformat()}, headers=auth["farmer"]
    ).json()
    assert r["mortality"]["total_in_period"] == 3
    assert (
        client.get(
            f"{API}/dashboard/summary", params={"date_from": "2026-05-01", "date_to": "2026-04-01"}, headers=auth["farmer"]
        ).status_code
        == 422
    )


def test_empty_dashboard_for_user_without_farms(client, auth):
    r = client.get(f"{API}/dashboard/summary", headers=auth["vet"]).json()
    assert r["farms"]["total"] == 0 and r["alerts"]["active"] == 0 and r["follow_up_farms"] == []
