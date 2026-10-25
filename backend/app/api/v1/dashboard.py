"""Role-scoped dashboard aggregates computed from the database. Read-only: no alerts
or assessments are generated here."""

from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.v1.external import active_notices_for_user
from app.core.deps import accessible_farm_ids, get_current_user
from app.db.session import get_db
from app.models import (
    Alert,
    AlertStatus,
    AnimalScreening,
    AuditLog,
    BiosecurityAssessment,
    EnvironmentalObservation,
    Farm,
    HygieneInspection,
    MortalityRecord,
    Role,
    User,
    VaccinationRecord,
    VaccinationStatus,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _dt(d: date, end: bool = False) -> datetime:
    return datetime.combine(d, time.max if end else time.min, tzinfo=timezone.utc)


@router.get("/summary")
def summary(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    today = datetime.now(timezone.utc).date()
    date_to = date_to or today
    date_from = date_from or (date_to - timedelta(days=89))
    if date_from > date_to:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "'date_from' must not be after 'date_to'.")
    if (date_to - date_from).days > 731:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The date range cannot exceed two years.")

    ids = accessible_farm_ids(db, user)
    farms = db.scalars(select(Farm).where(Farm.id.in_(ids))).unique().all() if ids else []
    names = {f.id: f.name for f in farms}

    by_type: dict[str, int] = defaultdict(int)
    by_taluk: dict[str, dict] = {}
    for f in farms:
        by_type[f.farm_type.value] += 1
        t = by_taluk.setdefault(f.taluk, {"taluk": f.taluk, "farms": 0, "open_alerts": 0})
        t["farms"] += 1

    # ------------------------------------------------------------ vaccinations
    vax = db.scalars(select(VaccinationRecord).where(VaccinationRecord.farm_id.in_(ids))).all() if ids else []
    completed_in = [
        v
        for v in vax
        if v.status == VaccinationStatus.COMPLETED and v.administered_on and date_from <= v.administered_on <= date_to
    ]
    overdue = [v for v in vax if v.status == VaccinationStatus.SCHEDULED and v.due_on and v.due_on < today]
    upcoming = sorted(
        (
            v
            for v in vax
            if v.status == VaccinationStatus.SCHEDULED and v.due_on and today <= v.due_on <= today + timedelta(days=30)
        ),
        key=lambda v: v.due_on,
    )
    missed_in = [v for v in vax if v.status == VaccinationStatus.MISSED and v.due_on and date_from <= v.due_on <= date_to]
    vax_monthly: dict[str, int] = defaultdict(int)
    for v in completed_in:
        vax_monthly[v.administered_on.strftime("%Y-%m")] += 1

    # --------------------------------------------------------------- mortality
    mort = (
        db.scalars(
            select(MortalityRecord).where(
                MortalityRecord.farm_id.in_(ids), MortalityRecord.observed_on >= date_from, MortalityRecord.observed_on <= date_to
            )
        ).all()
        if ids
        else []
    )
    weekly: dict[date, dict] = {}
    for m in mort:
        wk = m.observed_on - timedelta(days=m.observed_on.weekday())
        row = weekly.setdefault(wk, {"week_start": wk.isoformat(), "pig": 0, "poultry": 0})
        row[m.species.value] += m.count
    mort_by_species = {
        "pig": sum(m.count for m in mort if m.species.value == "pig"),
        "poultry": sum(m.count for m in mort if m.species.value == "poultry"),
    }

    # ----------------------------------------------------------------- hygiene
    hyg = (
        db.scalars(
            select(HygieneInspection).where(
                HygieneInspection.farm_id.in_(ids),
                HygieneInspection.inspected_on >= date_from,
                HygieneInspection.inspected_on <= date_to,
            )
        ).all()
        if ids
        else []
    )

    # ------------------------------------------------------------------ alerts
    active_alerts = (
        db.scalars(select(Alert).where(Alert.farm_id.in_(ids), Alert.status != AlertStatus.RESOLVED)).unique().all()
        if ids
        else []
    )
    sev = {"high": 0, "medium": 0, "low": 0}
    open_high_by_farm: dict[int, int] = defaultdict(int)
    for a in active_alerts:
        sev[a.severity.value] += 1
        if a.severity.value == "high":
            open_high_by_farm[a.farm_id] += 1
    for f in farms:
        by_taluk[f.taluk]["open_alerts"] += sum(1 for a in active_alerts if a.farm_id == f.id)

    # --------------------------------------------------- latest risk per farm
    latest: dict[int, BiosecurityAssessment] = {}
    if ids:
        sub = (
            select(func.max(BiosecurityAssessment.id))
            .where(BiosecurityAssessment.farm_id.in_(ids))
            .group_by(BiosecurityAssessment.farm_id)
        )
        for a in db.scalars(select(BiosecurityAssessment).where(BiosecurityAssessment.id.in_(sub))).all():
            latest[a.farm_id] = a
    risk_counts: dict[str, int] = defaultdict(int)
    for f in farms:
        risk_counts[latest[f.id].status.value if f.id in latest else "not_assessed"] += 1

    follow_up = []
    for f in farms:
        reasons = []
        if open_high_by_farm.get(f.id):
            reasons.append(f"{open_high_by_farm[f.id]} high-severity alert(s) active")
        la = latest.get(f.id)
        if la and la.status.value == "high":
            reasons.append(f"latest assessment high (score {la.score})")
        if la and la.status.value == "insufficient_data":
            reasons.append("latest assessment: insufficient data")
        if not la:
            reasons.append("never assessed")
        if reasons:
            follow_up.append(
                {
                    "farm_id": f.id,
                    "farm_name": f.name,
                    "taluk": f.taluk,
                    "latest_status": la.status.value if la else None,
                    "latest_assessed_at": la.assessed_at.isoformat() if la else None,
                    "reasons": reasons,
                }
            )
    follow_up.sort(key=lambda r: (-(open_high_by_farm.get(r["farm_id"], 0)), r["latest_status"] != "high", r["farm_name"]))

    # ------------------------------------------------------------- environment
    env_rows = (
        db.execute(
            select(EnvironmentalObservation.source, func.count())
            .where(
                EnvironmentalObservation.farm_id.in_(ids),
                EnvironmentalObservation.observed_at >= _dt(date_from),
                EnvironmentalObservation.observed_at <= _dt(date_to, True),
            )
            .group_by(EnvironmentalObservation.source)
        ).all()
        if ids
        else []
    )

    screenings = (
        db.scalar(
            select(func.count())
            .select_from(AnimalScreening)
            .where(
                AnimalScreening.created_at >= _dt(date_from),
                AnimalScreening.created_at <= _dt(date_to, True),
                (AnimalScreening.farm_id.in_(ids)) | (AnimalScreening.requested_by_id == user.id)
                if user.role != Role.ADMIN
                else True,
            )
        )
        or 0
    )

    # --------------------------------------------------------------- activity
    act_stmt = select(AuditLog).order_by(AuditLog.id.desc()).limit(12)
    if user.role != Role.ADMIN:
        act_stmt = act_stmt.where(AuditLog.farm_id.in_(ids) | (AuditLog.actor_id == user.id))
    activity = [
        {
            "at": a.created_at.isoformat(),
            "actor": a.actor.full_name if a.actor else "system",
            "action": a.action,
            "summary": a.summary,
            "farm_id": a.farm_id,
        }
        for a in db.scalars(act_stmt).unique().all()
    ]

    return {
        "role": user.role.value,
        "period": {"from": date_from.isoformat(), "to": date_to.isoformat()},
        "contains_demo_data": any(f.is_demo for f in farms),
        "farms": {
            "total": len(farms),
            "by_type": [{"type": k, "count": by_type.get(k, 0)} for k in ("pig", "poultry", "mixed")],
            "by_taluk": sorted(by_taluk.values(), key=lambda r: r["taluk"]),
            "population": {"pig": sum(f.pig_count for f in farms), "poultry": sum(f.poultry_count for f in farms)},
        },
        "vaccinations": {
            "completed_in_period": len(completed_in),
            "missed_in_period": len(missed_in),
            "overdue": len(overdue),
            "due_next_30_days": len(upcoming),
            "monthly_completed": [{"month": k, "completed": vax_monthly[k]} for k in sorted(vax_monthly)],
            "upcoming": [
                {
                    "id": v.id,
                    "farm_id": v.farm_id,
                    "farm_name": names.get(v.farm_id),
                    "vaccine_name": v.vaccine_name,
                    "species": v.species.value,
                    "due_on": v.due_on.isoformat(),
                }
                for v in upcoming[:10]
            ],
            "overdue_items": [
                {
                    "id": v.id,
                    "farm_id": v.farm_id,
                    "farm_name": names.get(v.farm_id),
                    "vaccine_name": v.vaccine_name,
                    "species": v.species.value,
                    "due_on": v.due_on.isoformat(),
                }
                for v in sorted(overdue, key=lambda v: v.due_on)[:10]
            ],
        },
        "mortality": {
            "total_in_period": sum(mort_by_species.values()),
            "by_species": mort_by_species,
            "reports_in_period": len(mort),
            "weekly": [weekly[k] for k in sorted(weekly)],
        },
        "hygiene": {
            "inspections_in_period": len(hyg),
            "passed": sum(1 for h in hyg if h.result.value == "pass"),
            "failed": sum(1 for h in hyg if h.result.value == "fail"),
        },
        "alerts": {
            "active": len(active_alerts),
            "open": sum(1 for a in active_alerts if a.status == AlertStatus.OPEN),
            "acknowledged": sum(1 for a in active_alerts if a.status == AlertStatus.ACKNOWLEDGED),
            "by_severity": sev,
        },
        "risk_status": [
            {"status": k, "count": risk_counts.get(k, 0)}
            for k in ("low", "moderate", "high", "insufficient_data", "not_assessed")
        ],
        "follow_up_farms": follow_up[:15],
        "environment": {"readings_in_period": {s.value: c for s, c in env_rows}},
        "screenings_in_period": screenings,
        "official_notices": [
            {
                "id": n.id,
                "disease": n.disease,
                "species": n.species.value,
                "district": n.district,
                "taluk": n.taluk,
                "reported_on": n.reported_on.isoformat(),
                "source_name": n.source_name,
                "source_url": n.source_url,
            }
            for n in active_notices_for_user(db, user)
        ],
        "recent_activity": activity,
    }
