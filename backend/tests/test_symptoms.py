"""Symptom checker: knowledge-base integrity, ranking behaviour, public and saved checks,
diagnosis confirmation permissions, export, and the confirmed-case training guard."""

import pandas as pd
import pytest

from app.services.symptoms import engine
from app.services.symptoms import knowledge as kb

API = "/api/v1"


def test_knowledge_base_integrity():
    for sp, diseases in kb.DISEASES.items():
        index = kb.sign_index(sp)
        ages = {a for a, _ in kb.AGE_GROUPS[sp]}
        ids = [d["id"] for d in diseases]
        assert len(ids) == len(set(ids))
        for d in diseases:
            assert set(d["signs"]) <= set(index), d["id"]
            assert set(d["signs"].values()) <= {1, 2, 3}
            assert set(d["ages"]) <= ages and d["ages"]
            assert d["sources"] and all(s in kb.SOURCES for s in d["sources"])
            assert d["actions"] and d["summary"]
    assert kb.REVIEW_STATUS == "pending veterinary review"


@pytest.mark.parametrize(
    "species,signs,age,expected",
    [
        ("pig", ["fever", "skin_redness", "skin_haemorrhage", "sudden_death"], "grower", "asf"),
        ("pig", ["cough", "sneezing", "fever", "nasal_discharge"], "grower", "swine_flu"),
        ("pig", ["blisters", "lameness", "drooling"], None, "fmd"),
        ("pig", ["yellow_scour", "dehydration"], "piglet", "neonatal_diarrhoea"),
        ("pig", ["itching", "skin_crusts"], "grower", "mange"),
        ("poultry", ["green_diarrhoea", "twisted_neck", "gasping"], "adult", "nd"),
        ("poultry", ["swollen_head", "cyanotic_comb", "sudden_high_mortality"], "layer", "hpai"),
        ("poultry", ["white_diarrhoea", "vent_pecking", "depression"], "chick", "ibd"),
        ("poultry", ["bloody_droppings", "huddling"], "chick", "coccidiosis"),
        ("poultry", ["leg_paralysis", "grey_eye"], "grower", "marek"),
    ],
)
def test_textbook_presentations_rank_first(species, signs, age, expected):
    r = engine.check(species, signs, age)
    assert r["results"][0]["disease_id"] == expected


def test_urgent_warning_only_for_reportable_matches():
    asf = engine.check("pig", ["skin_redness", "skin_haemorrhage", "sudden_death"], "grower", True)
    assert asf["urgent_warning"] and "African swine fever" in asf["urgent_warning"]
    mange = engine.check("pig", ["itching", "skin_crusts"], "grower")
    assert mange["urgent_warning"] is None


def test_scores_are_bounded_and_explained():
    r = engine.check("poultry", ["coughing"], None)
    for res in r["results"]:
        assert 0 <= res["match_score"] <= 100
        assert res["matched_signs"] == ["Coughing or sneezing"]
        assert res["sources"]
    assert "not a diagnosis" in r["disclaimer"]


def test_age_group_modifies_ranking():
    young = engine.check("poultry", ["white_diarrhoea", "huddling"], "chick")
    adult = engine.check("poultry", ["white_diarrhoea", "huddling"], "layer")
    s_young = next(x["match_score"] for x in young["results"] if x["disease_id"] == "ibd")
    s_adult = next(x["match_score"] for x in adult["results"] if x["disease_id"] == "ibd")
    assert s_young > s_adult


@pytest.mark.parametrize(
    "bad",
    [
        {"species": "cow", "signs": ["fever"]},
        {"species": "pig", "signs": []},
        {"species": "pig", "signs": ["twisted_neck"]},  # poultry sign
        {"species": "pig", "signs": ["fever"], "age_group": "layer"},
    ],
)
def test_public_check_validation(client, bad):
    assert client.post(f"{API}/public/symptom-check", json=bad).status_code == 422


def test_public_endpoints_need_no_login_and_store_nothing(client, db):
    from app.models import SymptomCheck

    lib = client.get(f"{API}/public/symptom-library").json()
    assert lib["counts"] == {"pig": len(kb.DISEASES["pig"]), "poultry": len(kb.DISEASES["poultry"])}
    assert lib["review_status"] == "pending veterinary review"
    r = client.post(f"{API}/public/symptom-check", json={"species": "pig", "signs": ["blisters", "lameness"]})
    assert r.status_code == 200 and r.json()["results"][0]["disease_id"] == "fmd"
    assert db.query(SymptomCheck).count() == 0
    assert client.get(f"{API}/public/notices").status_code == 200


def test_save_history_confirm_and_export(client, auth, farm, other_farm):
    body = {
        "species": "pig",
        "signs": ["fever", "cough", "sneezing"],
        "age_group": "grower",
        "farm_id": farm.id,
        "animal_identifier": "P-7",
    }
    r = client.post(f"{API}/symptom-checks", json=body, headers=auth["farmer"])
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    # species must match the farm; other people's farms are invisible
    assert (
        client.post(
            f"{API}/symptom-checks", json={**body, "species": "poultry", "signs": ["coughing"]}, headers=auth["farmer"]
        ).status_code
        == 422
    )
    assert (
        client.post(f"{API}/symptom-checks", json={**body, "farm_id": other_farm.id}, headers=auth["farmer"]).status_code == 404
    )
    assert client.get(f"{API}/symptom-checks", headers=auth["farmer"]).json()["total"] == 1
    assert client.get(f"{API}/symptom-checks", headers=auth["farmer2"]).json()["total"] == 0

    confirm = {"diagnosis": "Swine influenza", "method": "laboratory", "notes": "PCR positive"}
    assert client.post(f"{API}/symptom-checks/{cid}/confirm", json=confirm, headers=auth["farmer"]).status_code == 403
    assert client.post(f"{API}/symptom-checks/{cid}/confirm", json=confirm, headers=auth["vet2"]).status_code == 404
    assert (
        client.post(f"{API}/symptom-checks/{cid}/confirm", json={**confirm, "method": "guess"}, headers=auth["vet"]).status_code
        == 422
    )
    r = client.post(f"{API}/symptom-checks/{cid}/confirm", json=confirm, headers=auth["vet"])
    assert r.status_code == 200 and r.json()["confirmed_diagnosis"] == "Swine influenza" and r.json()["confirmed_at"]
    assert client.get(f"{API}/symptom-checks", params={"confirmed": True}, headers=auth["vet"]).json()["total"] == 1

    assert client.get(f"{API}/symptom-checks/export", headers=auth["vet"]).status_code == 403
    csv_text = client.get(f"{API}/symptom-checks/export", headers=auth["admin"]).text
    assert "Swine influenza" in csv_text and "P-7" not in csv_text  # no identifiers exported


def test_training_script_refuses_without_enough_confirmed_cases(tmp_path):
    from scripts.train_from_confirmed_cases import check_enough

    with pytest.raises(SystemExit, match="Not enough confirmed cases"):
        check_enough(pd.Series(["Swine influenza"] * 40 + ["Mange"] * 5))
    assert check_enough(pd.Series(["A"] * 30 + ["B"] * 31)) == {"A": 30, "B": 31}
