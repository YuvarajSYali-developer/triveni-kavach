"""Persistence around the pure rule engine: build a snapshot from the database,
store the assessment and synchronise alerts (with deduplication)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Alert,
    AlertSeverity,
    AlertStatus,
    BiosecurityAssessment,
    EnvironmentalObservation,
    Farm,
    HygieneInspection,
    MortalityRecord,
    RiskStatus,
    User,
    VaccinationRecord,
    VisitorLog,
)
from app.services import audit
from app.services.biosecurity import rules

_SEVERITY_RANK = {"low": 0, "medium": 1, "high": 2}
_HYGIENE_ITEMS = {
    "footbath_maintained": "footbath",
    "shed_cleaned": "shed cleaning",
    "disinfectant_applied": "disinfection",
    "waste_disposed_properly": "waste disposal",
    "protective_clothing_available": "protective clothing",
}


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def build_snapshot(db: Session, farm: Farm, now: datetime) -> rules.FarmSnapshot:
    horizon = now.date() - timedelta(days=400)
    fid = farm.id
    vax = db.scalars(select(VaccinationRecord).where(VaccinationRecord.farm_id == fid)).all()
    mort = db.scalars(select(MortalityRecord).where(MortalityRecord.farm_id == fid, MortalityRecord.observed_on >= horizon)).all()
    hyg = db.scalars(
        select(HygieneInspection).where(HygieneInspection.farm_id == fid, HygieneInspection.inspected_on >= horizon)
    ).all()
    vis = db.scalars(select(VisitorLog).where(VisitorLog.farm_id == fid, VisitorLog.entry_time >= now - timedelta(days=60))).all()
    env = db.scalars(
        select(EnvironmentalObservation).where(
            EnvironmentalObservation.farm_id == fid,
            EnvironmentalObservation.observed_at >= now - timedelta(days=30),
        )
    ).all()
    return rules.FarmSnapshot(
        farm_id=fid,
        population=farm.total_animals,
        vaccinations=[rules.Vaccination(v.status.value, v.vaccine_name, v.due_on, v.administered_on) for v in vax],
        mortality=[rules.Mortality(m.observed_on, m.count) for m in mort],
        hygiene=[
            rules.Hygiene(
                h.inspected_on,
                h.result.value,
                tuple(label for attr, label in _HYGIENE_ITEMS.items() if not getattr(h, attr)),
            )
            for h in hyg
        ],
        visits=[rules.Visit(_aware(v.entry_time), v.visitor_name, v.precautions_complete, v.visited_other_farm_48h) for v in vis],
        environment=[
            rules.EnvReading(_aware(e.observed_at), e.source.value, e.temperature_c, e.relative_humidity_pct, e.ammonia_ppm)
            for e in env
        ],
    )


def run_assessment(db: Session, farm: Farm, actor: User | None, now: datetime | None = None):
    """Evaluate the farm, persist the assessment and synchronise alerts.

    Returns ``(assessment, alerts_created, alerts_updated)``. Repeating the assessment
    with unchanged data updates existing open alerts rather than duplicating them."""
    now = now or datetime.now(timezone.utc)
    result = rules.evaluate(build_snapshot(db, farm, now), now=now)
    assessment = BiosecurityAssessment(
        farm_id=farm.id,
        assessed_at=now,
        rules_version=result.rules_version,
        status=RiskStatus(result.status),
        score=result.score,
        triggered_rules=[t.__dict__ for t in result.triggered],
        observations=result.observations,
        recommendations=result.recommendations,
        data_quality_warnings=result.data_quality_warnings,
        limitations=result.limitations,
        triggered_by_id=actor.id if actor else None,
    )
    db.add(assessment)
    db.flush()

    created = updated = 0
    for t in result.triggered:
        key = f"{farm.id}:{t.code}"
        existing = db.scalar(select(Alert).where(Alert.dedup_key == key, Alert.status != AlertStatus.RESOLVED))
        if existing:
            existing.last_seen_at = now
            existing.occurrence_count += 1
            existing.last_assessment_id = assessment.id
            existing.message = t.detail
            if _SEVERITY_RANK[t.severity] > _SEVERITY_RANK[existing.severity.value]:
                existing.severity = AlertSeverity(t.severity)
            updated += 1
        else:
            db.add(
                Alert(
                    farm_id=farm.id,
                    rule_code=t.code,
                    dedup_key=key,
                    severity=AlertSeverity(t.severity),
                    status=AlertStatus.OPEN,
                    title=t.title,
                    message=t.detail,
                    first_seen_at=now,
                    last_seen_at=now,
                    last_assessment_id=assessment.id,
                )
            )
            created += 1

    audit.record(
        db,
        actor,
        "assessment.run",
        "biosecurity_assessment",
        assessment.id,
        f"Biosecurity assessment for {farm.name}: {result.status}"
        + (f" (score {result.score})" if result.score is not None else "")
        + f"; {created} new alert(s)",
        farm_id=farm.id,
    )
    db.commit()
    db.refresh(assessment)
    return assessment, created, updated
