API = "/api/v1"


def farm_body(**kw):
    body = {"name": "Created Farm", "farm_type": "pig", "district": "Haveri", "taluk": "Byadgi", "pig_count": 10}
    body.update(kw)
    return body


def test_admin_full_crud(client, auth, users):
    body = farm_body(owner_id=users["farmer"].id, veterinarian_id=users["vet"].id)
    r = client.post(f"{API}/farms", json=body, headers=auth["admin"])
    assert r.status_code == 201, r.text
    fid = r.json()["id"]
    assert r.json()["owner"]["id"] == users["farmer"].id
    r = client.patch(f"{API}/farms/{fid}", json={"pig_count": 55, "name": "Renamed"}, headers=auth["admin"])
    assert r.status_code == 200 and r.json()["pig_count"] == 55 and r.json()["name"] == "Renamed"
    assert client.get(f"{API}/farms/{fid}", headers=auth["admin"]).status_code == 200
    assert client.delete(f"{API}/farms/{fid}", headers=auth["admin"]).status_code == 204
    assert client.get(f"{API}/farms/{fid}", headers=auth["admin"]).status_code == 404


def test_farmer_creates_own_farm(client, auth, users):
    r = client.post(f"{API}/farms", json=farm_body(), headers=auth["farmer"])
    assert r.status_code == 201
    assert r.json()["owner"]["id"] == users["farmer"].id
    assert r.json()["veterinarian"] is None


def test_farmer_cannot_assign_vet_or_other_owner(client, auth, users):
    r = client.post(f"{API}/farms", json=farm_body(veterinarian_id=users["vet"].id), headers=auth["farmer"])
    assert r.status_code == 403
    r = client.post(f"{API}/farms", json=farm_body(owner_id=users["farmer2"].id), headers=auth["farmer"])
    assert r.status_code == 403


def test_vet_cannot_create_farm(client, auth):
    assert client.post(f"{API}/farms", json=farm_body(), headers=auth["vet"]).status_code == 403


def test_farm_validation(client, auth, users):
    cases = [
        farm_body(farm_type="pig", poultry_count=5),
        farm_body(farm_type="poultry", pig_count=5),
        farm_body(pig_count=-1),
        farm_body(name=""),
        farm_body(farm_type="cattle"),
        farm_body(contact_phone="call me"),
    ]
    for body in cases:
        r = client.post(f"{API}/farms", json=body, headers=auth["admin"])
        assert r.status_code == 422, body
        assert r.json()["errors"]
    # assignee must have the right role
    r = client.post(f"{API}/farms", json=farm_body(veterinarian_id=users["farmer"].id), headers=auth["admin"])
    assert r.status_code == 422


def test_patch_revalidates_combined_state(client, auth, farm):
    r = client.patch(f"{API}/farms/{farm.id}", json={"poultry_count": 50}, headers=auth["admin"])
    assert r.status_code == 422
    r = client.patch(f"{API}/farms/{farm.id}", json={"farm_type": "mixed", "poultry_count": 50}, headers=auth["admin"])
    assert r.status_code == 200


def test_list_scoping(client, auth, farm, other_farm):
    def names(who):
        return {f["name"] for f in client.get(f"{API}/farms", headers=auth[who]).json()["items"]}

    assert names("admin") == {farm.name, other_farm.name}
    assert names("farmer") == {farm.name}
    assert names("farmer2") == {other_farm.name}
    assert names("vet") == {farm.name}
    assert names("vet2") == {other_farm.name}


def test_ownership_boundaries(client, auth, farm, users):
    # another farmer and an unassigned vet see "not found", not "forbidden"
    for who in ("farmer2", "vet2"):
        assert client.get(f"{API}/farms/{farm.id}", headers=auth[who]).status_code == 404
        assert client.patch(f"{API}/farms/{farm.id}", json={"pig_count": 1}, headers=auth[who]).status_code == 404
    # owner may update details but not assignments
    assert client.patch(f"{API}/farms/{farm.id}", json={"pig_count": 90}, headers=auth["farmer"]).status_code == 200
    r = client.patch(f"{API}/farms/{farm.id}", json={"veterinarian_id": users["vet2"].id}, headers=auth["farmer"])
    assert r.status_code == 403
    r = client.patch(f"{API}/farms/{farm.id}", json={"owner_id": users["farmer2"].id}, headers=auth["vet"])
    assert r.status_code == 403
    # only admins delete
    assert client.delete(f"{API}/farms/{farm.id}", headers=auth["farmer"]).status_code == 403
    assert client.delete(f"{API}/farms/{farm.id}", headers=auth["vet"]).status_code == 403


def test_search_and_filters(client, auth, farm, other_farm):
    r = client.get(f"{API}/farms", params={"q": "poultry"}, headers=auth["admin"]).json()
    assert [f["name"] for f in r["items"]] == [other_farm.name]
    r = client.get(f"{API}/farms", params={"farm_type": "pig"}, headers=auth["admin"]).json()
    assert [f["name"] for f in r["items"]] == [farm.name]
    r = client.get(f"{API}/farms", params={"taluk": "Savanur"}, headers=auth["admin"]).json()
    assert r["total"] == 1
