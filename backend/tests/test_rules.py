"""Unit tests for the pure rule engine (no database)."""

from datetime import datetime, timedelta, timezone

from app.services.biosecurity.rules import (
    DEFAULT_CONFIG,
    EnvReading,
    FarmSnapshot,
    Hygiene,
    Mortality,
    Vaccination,
    Visit,
    evaluate,
)

NOW = datetime(2026, 10, 25, 12, 0, tzinfo=timezone.utc)
TODAY = NOW.date()


def d(days):
    return TODAY - timedelta(days=days)


def baseline(**kw):
    """A farm with complete, unremarkable records."""
    snap = dict(
        farm_id=1,
        population=100,
        vaccinations=[Vaccination("completed", "CSF", d(30), d(30))],
        mortality=[Mortality(d(i), 0) for i in range(0, 35, 7)],
        hygiene=[Hygiene(d(5), "pass")],
    )
    snap.update(kw)
    return FarmSnapshot(**snap)


def codes(result):
    return {t.code for t in result.triggered}


def test_clean_farm_is_low_with_no_rules():
    r = evaluate(baseline(), now=NOW)
    assert r.status == "low" and r.score == 0 and not r.triggered
    assert any("does not certify" in x for x in r.recommendations)
    assert r.limitations


def test_insufficient_data_when_records_missing():
    r = evaluate(FarmSnapshot(farm_id=1, population=100), now=NOW)
    assert r.status == "insufficient_data" and r.score is None
    assert "NO_VACCINATION_RECORDS" in codes(r)  # still listed
    assert r.data_quality_warnings[0].startswith("Insufficient data")


def test_insufficient_data_without_population():
    r = evaluate(baseline(population=0), now=NOW)
    assert r.status == "insufficient_data" and r.score is None


def test_overdue_vaccination_boundary():
    due_today = baseline(
        vaccinations=[Vaccination("completed", "CSF", d(30), d(30)), Vaccination("scheduled", "CSF", TODAY, None)]
    )
    assert "VACCINATION_OVERDUE" not in codes(evaluate(due_today, now=NOW))
    overdue = baseline(vaccinations=[Vaccination("completed", "CSF", d(30), d(30)), Vaccination("scheduled", "CSF", d(1), None)])
    r = evaluate(overdue, now=NOW)
    assert "VACCINATION_OVERDUE" in codes(r) and r.score == DEFAULT_CONFIG.weights["VACCINATION_OVERDUE"]
    assert r.status == "moderate"


def test_missed_vaccination_lookback():
    recent = baseline(vaccinations=[Vaccination("completed", "CSF", d(30), d(30)), Vaccination("missed", "RD", d(10), None)])
    assert "VACCINATION_MISSED" in codes(evaluate(recent, now=NOW))
    old = baseline(vaccinations=[Vaccination("completed", "CSF", d(30), d(30)), Vaccination("missed", "RD", d(200), None)])
    assert "VACCINATION_MISSED" not in codes(evaluate(old, now=NOW))


def test_mortality_spike_requires_minimum_and_ratio():
    base = [Mortality(d(i), 1) for i in (8, 15, 22, 29)]  # ~1/week baseline
    two = baseline(mortality=base + [Mortality(d(1), 2)])
    assert "MORTALITY_SPIKE" not in codes(evaluate(two, now=NOW))  # below minimum of 3
    three = baseline(mortality=base + [Mortality(d(1), 3)])
    r = evaluate(three, now=NOW)
    assert "MORTALITY_SPIKE" in codes(r)
    assert any("veterinarian" in x for x in r.recommendations)


def test_mortality_rate_threshold_boundary():
    pop = 300
    at = baseline(population=pop, mortality=[Mortality(d(i), 3) for i in (8, 15, 22, 29)] + [Mortality(d(1), 3)])
    assert "MORTALITY_RATE_HIGH" in codes(evaluate(at, now=NOW))  # 3/300 = exactly 1.0 %
    below = baseline(population=pop + 1, mortality=[Mortality(d(i), 3) for i in (8, 15, 22, 29)] + [Mortality(d(1), 3)])
    assert "MORTALITY_RATE_HIGH" not in codes(evaluate(below, now=NOW))


def test_mortality_without_baseline_warns():
    r = evaluate(baseline(mortality=[Mortality(d(1), 1)]), now=NOW)
    assert any("baseline" in w for w in r.data_quality_warnings)


def test_hygiene_failed_and_stale():
    r = evaluate(baseline(hygiene=[Hygiene(d(3), "fail", ("footbath",)), Hygiene(d(20), "pass")]), now=NOW)
    assert "HYGIENE_FAILED" in codes(r) and "footbath" in r.triggered[0].detail
    # only the latest inspection counts
    assert "HYGIENE_FAILED" not in codes(evaluate(baseline(hygiene=[Hygiene(d(3), "pass"), Hygiene(d(20), "fail")]), now=NOW))
    assert "HYGIENE_STALE" not in codes(evaluate(baseline(hygiene=[Hygiene(d(30), "pass")]), now=NOW))
    assert "HYGIENE_STALE" in codes(evaluate(baseline(hygiene=[Hygiene(d(31), "pass")]), now=NOW))


def test_visitor_rules():
    visits = [
        Visit(NOW - timedelta(days=2), "A", True, False),
        Visit(NOW - timedelta(days=3), "B", False, True),
        Visit(NOW - timedelta(days=40), "C", False, True),  # outside lookback
    ]
    r = evaluate(baseline(visits=visits), now=NOW)
    assert {"VISITOR_PRECAUTIONS_INCOMPLETE", "VISITOR_CROSS_FARM_CONTACT"} <= codes(r)
    detail = next(t.detail for t in r.triggered if t.code == "VISITOR_PRECAUTIONS_INCOMPLETE")
    assert detail.startswith("1 of 2")


def test_environment_thresholds_and_simulated_warning():
    env = [
        EnvReading(NOW - timedelta(hours=1), "simulated", temperature_c=32.0, relative_humidity_pct=80.0),  # on the limits
        EnvReading(NOW - timedelta(hours=2), "manual", ammonia_ppm=25.0),
    ]
    r = evaluate(baseline(environment=env), now=NOW)
    assert "ENVIRONMENT_OUT_OF_RANGE" not in codes(r)
    assert any("SIMULATED" in w for w in r.data_quality_warnings)
    env.append(EnvReading(NOW - timedelta(hours=3), "simulated", temperature_c=32.1, ammonia_ppm=30))
    r = evaluate(baseline(environment=env), now=NOW)
    t = next(t for t in r.triggered if t.code == "ENVIRONMENT_OUT_OF_RANGE")
    assert "Temperature" in t.detail and "Ammonia" in t.detail and "simulated" in t.detail
    old = [EnvReading(NOW - timedelta(days=8), "manual", temperature_c=45)]
    assert "ENVIRONMENT_OUT_OF_RANGE" not in codes(evaluate(baseline(environment=old), now=NOW))


def test_score_capped_and_banded():
    snap = baseline(
        vaccinations=[Vaccination("scheduled", "CSF", d(5), None), Vaccination("missed", "CSF", d(10), None)],
        mortality=[Mortality(d(i), 0) for i in (8, 15, 22, 29)] + [Mortality(d(1), 10)],
        hygiene=[Hygiene(d(40), "fail", ("shed cleaning",))],
        visits=[Visit(NOW - timedelta(days=1), "X", False, True)],
    )
    r = evaluate(snap, now=NOW)
    assert r.score == 100 and r.status == "high"
    assert sum(t.weight for t in r.triggered) > 100


def test_evaluation_is_deterministic():
    snap = baseline(hygiene=[Hygiene(d(3), "fail", ("footbath",))])
    assert evaluate(snap, now=NOW) == evaluate(snap, now=NOW)
