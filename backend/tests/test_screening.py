import json
from pathlib import Path

import pytest

from app.services.screening.model_service import ScreeningModel, UnsupportedSpecies, get_screening_model

API = "/api/v1"
ARTIFACTS = Path(__file__).resolve().parents[1] / "ml_artifacts"


def pig_case(**kw):
    body = {
        "species": "Pig",
        "body_temperature_c": 41.0,
        "heart_rate_bpm": 110,
        "respiratory_rate_bpm": 40,
        "activity_level": 20,
        "symptoms": ["Skin_Lesions", "Fever_Chills", "Lameness"],
    }
    body.update(kw)
    return body


@pytest.fixture(scope="module")
def model():
    m = ScreeningModel(ARTIFACTS, ["Pig"])
    assert m.load(), m.error
    return m


def test_artifacts_load_and_are_consistent(model):
    assert model.available
    assert len(model.features) == 46
    assert model.features[:4] == ["Body_Temperature", "Heart_Rate", "Respiratory_Rate", "Activity_Level"]
    assert len(model.label_encoder.classes_) == 20 == model.model.n_classes_
    assert "Pig" in model.model_species and "Chicken" not in model.model_species
    meta = json.loads((ARTIFACTS / "model_metadata.json").read_text())
    assert meta["symptoms"] == model.symptoms  # feature ordering matches the training CSV
    assert model.enabled_species == ["Pig"]


def test_label_encoding_round_trip(model):
    classes = list(model.label_encoder.classes_)
    assert classes == sorted(classes)
    assert model.label_encoder.transform(["Swine Erysipelas"])[0] == classes.index("Swine Erysipelas")


def test_prediction_matches_original_pipeline(model):
    """Reference values recorded during the source audit by running the original
    feature construction against the same artifacts."""
    p = model.predict("Pig", 41.0, 110, 40, 20, ["Skin_Lesions", "Fever_Chills", "Lameness"])
    assert p.top["label"] == "Swine Erysipelas"
    assert p.top["model_score"] == pytest.approx(0.9996, abs=1e-3)
    assert p.top["observed_for_species_in_training"] is True
    assert len(p.alternatives) == 2
    again = model.predict("pig", 41.0, 110, 40, 20, ["Skin_Lesions", "Fever_Chills", "Lameness"])
    assert again.top == p.top  # deterministic, species is case-insensitive


def test_cross_species_labels_are_flagged(model):
    p = model.predict("Pig", 40.5, 110, 45, 40, ["Coughing", "Nasal_Discharge"])
    flagged = [a for a in p.alternatives if not a["observed_for_species_in_training"]]
    assert any(a["label"] == "K9 Distemper" for a in flagged)
    assert any("never occurred for Pig" in w for w in p.warnings)


def test_no_symptom_shortcut_warning(model):
    p = model.predict("Pig", 39.2, 70, 15, 95, [])
    assert p.top["label"] == "Healthy"
    assert any("symptom-free" in w for w in p.warnings)


def test_out_of_training_range_warning(model):
    p = model.predict("Pig", 36.0, 70, 15, 95, ["Lethargy"])
    assert any("outside the range seen" in w for w in p.warnings)


def test_unsupported_species(model):
    for sp in ("Chicken", "poultry", "Broiler"):
        with pytest.raises(UnsupportedSpecies, match="no poultry"):
            model.check_species(sp)
    with pytest.raises(UnsupportedSpecies, match="outside the scope"):
        model.check_species("Dog")
    with pytest.raises(UnsupportedSpecies, match="not a species"):
        model.check_species("Elephant")


def test_api_predict_and_history(client, auth, farm, other_farm):
    r = client.post(f"{API}/screening", json=pig_case(farm_id=farm.id, animal_identifier="Pig-17"), headers=auth["farmer"])
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["top"]["label"] == "Swine Erysipelas"
    assert "not a diagnosis" in body["recommendation"]
    assert "not probabilities" in body["score_note"]
    assert body["limitations"]
    assert body["model_version"].startswith("xgboost-animal-v4@")
    hist = client.get(f"{API}/screening", headers=auth["farmer"]).json()
    assert hist["total"] == 1 and hist["items"][0]["animal_identifier"] == "Pig-17"
    sid = body["id"]
    assert client.get(f"{API}/screening/{sid}", headers=auth["vet"]).status_code == 200
    assert client.get(f"{API}/screening/{sid}", headers=auth["farmer2"]).status_code == 404
    assert client.get(f"{API}/screening", headers=auth["farmer2"]).json()["total"] == 0
    assert client.get(f"{API}/screening", params={"farm_id": farm.id}, headers=auth["farmer2"]).status_code == 404
    # cannot attach a screening to someone else's farm or to a poultry-only farm
    assert client.post(f"{API}/screening", json=pig_case(farm_id=other_farm.id), headers=auth["farmer"]).status_code == 404
    assert client.post(f"{API}/screening", json=pig_case(farm_id=other_farm.id), headers=auth["admin"]).status_code == 422


def test_api_rejects_invalid_inputs(client, auth):
    bad = [
        pig_case(species="Chicken"),
        pig_case(species="Dog"),
        pig_case(symptoms=["Wing_Droop"]),
        pig_case(body_temperature_c=50),
        pig_case(heart_rate_bpm=5),
        pig_case(activity_level=101),
        {k: v for k, v in pig_case().items() if k != "heart_rate_bpm"},
    ]
    for body in bad:
        r = client.post(f"{API}/screening", json=body, headers=auth["vet"])
        assert r.status_code == 422, (body, r.text)
    assert client.get(f"{API}/screening", headers=auth["admin"]).json()["total"] == 0  # nothing stored


def test_status_endpoint(client, auth):
    s = client.get(f"{API}/screening/status", headers=auth["farmer"]).json()
    assert s["available"] is True
    assert s["enabled_species"] == ["Pig"]
    assert s["labels_by_enabled_species"]["Pig"] == ["Foot and Mouth", "Gastroenteritis (General)", "Healthy", "Swine Erysipelas"]
    assert s["historical_training_metrics"]["accuracy"] == pytest.approx(0.98917, abs=1e-4)
    assert any(u["species"] == "Poultry" for u in s["unsupported_species"])


def test_unavailable_model_returns_503(client, auth, tmp_path, monkeypatch):
    broken = ScreeningModel(tmp_path, ["Pig"])  # empty directory: no artifacts
    assert broken.load() is False and broken.error
    monkeypatch.setattr("app.api.v1.screening.get_screening_model", lambda: broken)
    r = client.post(f"{API}/screening", json=pig_case(), headers=auth["vet"])
    assert r.status_code == 503 and "unavailable" in r.json()["detail"]
    s = client.get(f"{API}/screening/status", headers=auth["vet"]).json()
    assert s["available"] is False and s["labels"] == []
    assert get_screening_model().available  # the real model is unaffected
