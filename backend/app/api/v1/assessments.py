from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import accessible_farm_ids, get_accessible_farm, get_current_user, require_roles
from app.db.session import get_db
from app.models import Alert, AlertSeverity, AlertStatus, BiosecurityAssessment, Farm, Role, User
from app.schemas import AlertOut, AlertResolve, AssessmentOut, AssessmentRunResult, Page
from app.services import audit
from app.services.biosecurity.service import run_assessment

router = APIRouter(tags=["biosecurity"])


@router.post("/farms/{farm_id}/assessments", response_model=AssessmentRunResult, status_code=status.HTTP_201_CREATED)
def assess_farm(farm_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Run the rule-based assessment. This is the only operation that creates alerts;
    dashboards are read-only, so refreshing them never generates alerts."""
    farm = get_accessible_farm(db, user, farm_id)
    assessment, created, updated = run_assessment(db, farm, user)
    return AssessmentRunResult(
        assessment=AssessmentOut.model_validate(assessment), alerts_created=created, alerts_updated=updated
    )


@router.post("/assessments/run-all", tags=["biosecurity"])
def assess_all(db: Session = Depends(get_db), user: User = Depends(require_roles(Role.ADMIN, Role.VETERINARIAN))):
    ids = accessible_farm_ids(db, user)
    created = updated = 0
    summary: dict[str, int] = {}
    for fid in ids:
        a, c, u = run_assessment(db, db.get(Farm, fid), user)
        created += c
        updated += u
        summary[a.status.value] = summary.get(a.status.value, 0) + 1
    return {"farms_assessed": len(ids), "alerts_created": created, "alerts_updated": updated, "by_status": summary}


@router.get("/farms/{farm_id}/assessments", response_model=Page[AssessmentOut])
def list_assessments(
    farm_id: int,
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    get_accessible_farm(db, user, farm_id)
    stmt = select(BiosecurityAssessment).where(BiosecurityAssessment.farm_id == farm_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.order_by(BiosecurityAssessment.id.desc()).limit(limit).offset(offset)).all()
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/assessments/{assessment_id}", response_model=AssessmentOut)
def get_assessment(assessment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    a = db.get(BiosecurityAssessment, assessment_id)
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assessment not found.")
    get_accessible_farm(db, user, a.farm_id)
    return a


# --------------------------------------------------------------------- alerts
def _alert_out(a: Alert) -> AlertOut:
    data = {c: getattr(a, c) for c in AlertOut.model_fields if c != "farm_name"}
    return AlertOut(**data, farm_name=a.farm.name)


@router.get("/alerts", response_model=Page[AlertOut])
def list_alerts(
    status_filter: AlertStatus | None = Query(default=None, alias="status"),
    active: bool | None = Query(default=None, description="true = open or acknowledged"),
    severity: AlertSeverity | None = None,
    farm_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Alert)
    if user.role != Role.ADMIN:
        stmt = stmt.where(Alert.farm_id.in_(accessible_farm_ids(db, user)))
    if farm_id is not None:
        get_accessible_farm(db, user, farm_id)
        stmt = stmt.where(Alert.farm_id == farm_id)
    if status_filter:
        stmt = stmt.where(Alert.status == status_filter)
    if active is True:
        stmt = stmt.where(Alert.status != AlertStatus.RESOLVED)
    if severity:
        stmt = stmt.where(Alert.severity == severity)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.order_by(Alert.last_seen_at.desc(), Alert.id.desc()).limit(limit).offset(offset)).unique().all()
    return Page(items=[_alert_out(a) for a in items], total=total, limit=limit, offset=offset)


def _load_alert(db: Session, user: User, alert_id: int) -> Alert:
    a = db.get(Alert, alert_id)
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found.")
    get_accessible_farm(db, user, a.farm_id)
    return a


@router.post("/alerts/{alert_id}/acknowledge", response_model=AlertOut)
def acknowledge(alert_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    a = _load_alert(db, user, alert_id)
    if a.status != AlertStatus.OPEN:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Only open alerts can be acknowledged (current: {a.status.value}).")
    a.status = AlertStatus.ACKNOWLEDGED
    a.acknowledged_by_id = user.id
    a.acknowledged_at = datetime.now(timezone.utc)
    audit.record(db, user, "alert.acknowledge", "alert", a.id, f"Acknowledged alert '{a.title}'", farm_id=a.farm_id)
    db.commit()
    return _alert_out(a)


@router.post("/alerts/{alert_id}/resolve", response_model=AlertOut)
def resolve(
    alert_id: int,
    payload: AlertResolve,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.ADMIN, Role.VETERINARIAN)),
):
    a = _load_alert(db, user, alert_id)
    if a.status == AlertStatus.RESOLVED:
        raise HTTPException(status.HTTP_409_CONFLICT, "This alert is already resolved.")
    a.status = AlertStatus.RESOLVED
    a.resolved_by_id = user.id
    a.resolved_at = datetime.now(timezone.utc)
    a.resolution_note = payload.resolution_note
    audit.record(db, user, "alert.resolve", "alert", a.id, f"Resolved alert '{a.title}'", farm_id=a.farm_id)
    db.commit()
    return _alert_out(a)
