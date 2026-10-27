"""Symptom checker endpoints.

Public (no sign-in, nothing stored): the disease library, an anonymous check, a weather
summary for the map and the list of active official notices — all non-personal data.
Authenticated: save a check, view history, and (veterinarians/administrators) record the
confirmed diagnosis, which turns a check into a real labelled case."""

import csv
import io
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import accessible_farm_ids, get_accessible_farm, get_current_user, require_roles
from app.db.session import get_db
from app.models import FarmType, OutbreakNotice, OutbreakStatus, Role, SymptomCheck, User
from app.schemas import Page
from app.services import audit, weather
from app.services.symptoms import engine

router = APIRouter()


class CheckIn(BaseModel):
    species: Literal["pig", "poultry"]
    signs: list[str] = Field(min_length=1, max_length=40)
    age_group: str | None = Field(default=None, max_length=20)
    sudden_deaths: bool = False


class SaveCheckIn(CheckIn):
    farm_id: int | None = None
    animal_identifier: str | None = Field(default=None, max_length=60)


class ConfirmIn(BaseModel):
    diagnosis: str = Field(min_length=2, max_length=160)
    method: Literal["clinical", "laboratory", "post_mortem"]
    notes: str | None = Field(default=None, max_length=2000)


class CheckOut(BaseModel):
    id: int
    created_at: datetime
    species: str
    age_group: str | None
    sudden_deaths: bool
    signs: list[str]
    results: list[dict]
    kb_version: str
    urgent: bool
    animal_identifier: str | None
    farm_id: int | None
    created_by_id: int | None
    confirmed_diagnosis: str | None
    diagnosis_method: str | None
    confirmation_notes: str | None
    confirmed_at: datetime | None

    model_config = {"from_attributes": True}


def _run(payload: CheckIn) -> dict:
    try:
        return engine.check(payload.species, payload.signs, payload.age_group, payload.sudden_deaths)
    except engine.CheckError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from None


# ----------------------------------------------------------------- public
@router.get("/public/symptom-library", tags=["public"])
def public_library(species: Literal["pig", "poultry"] | None = None):
    return engine.library(species)


@router.post("/public/symptom-check", tags=["public"])
def public_check(payload: CheckIn):
    """Anonymous check. Nothing is stored."""
    return _run(payload)


@router.get("/public/weather-summary", tags=["public"])
def public_weather():
    """Live weather for every supported taluk (cached), for the public map."""
    items = []
    for loc in weather.supported_locations():
        try:
            w = weather.get_weather(loc["district"], loc["taluk"])
            fmax = [f["temperature_max_c"] for f in w["forecast"] if f["temperature_max_c"] is not None]
            items.append(
                {
                    **loc,
                    "ok": True,
                    "temperature_c": w["current"]["temperature_c"],
                    "relative_humidity_pct": w["current"]["relative_humidity_pct"],
                    "weather_code": w["current"]["weather_code"],
                    "max_next_days_c": max(fmax) if fmax else None,
                    "heat_advisory": bool(w["advisories"]),
                    "observed_at": w["observed_at"],
                }
            )
        except (weather.WeatherUnavailable, weather.LocationNotSupported) as exc:
            items.append({**loc, "ok": False, "error": str(exc)})
    return {"locations": items, "attribution": weather.ATTRIBUTION}


@router.get("/public/notices", tags=["public"])
def public_notices(db: Session = Depends(get_db)):
    """Active official disease notices (public information with source links)."""
    rows = db.scalars(
        select(OutbreakNotice)
        .where(OutbreakNotice.status == OutbreakStatus.ACTIVE)
        .order_by(OutbreakNotice.reported_on.desc())
        .limit(50)
    ).all()
    return [
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
        for n in rows
    ]


# ---------------------------------------------------------- authenticated
@router.post("/symptom-checks", status_code=status.HTTP_201_CREATED, tags=["symptom checker"])
def save_check(payload: SaveCheckIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    farm = None
    if payload.farm_id is not None:
        farm = get_accessible_farm(db, user, payload.farm_id)
        allowed = {FarmType.PIG: {"pig"}, FarmType.POULTRY: {"poultry"}, FarmType.MIXED: {"pig", "poultry"}}[farm.farm_type]
        if payload.species not in allowed:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"This farm does not keep {payload.species}.")
    result = _run(payload)
    row = SymptomCheck(
        species=payload.species,
        age_group=payload.age_group,
        sudden_deaths=payload.sudden_deaths,
        signs=list(dict.fromkeys(payload.signs)),
        results=result["results"][:3],
        kb_version=result["kb_version"],
        urgent=result["urgent_warning"] is not None,
        animal_identifier=payload.animal_identifier,
        farm_id=farm.id if farm else None,
        created_by_id=user.id,
    )
    db.add(row)
    db.flush()
    top = result["results"][0]["name"] if result["results"] else "no match"
    audit.record(
        db,
        user,
        "symptom_check.create",
        "symptom_check",
        row.id,
        f"Symptom check ({payload.species}): closest match {top}",
        farm_id=row.farm_id,
    )
    db.commit()
    return {**result, "id": row.id, "saved_at": row.created_at}


def _scoped(db: Session, user: User):
    stmt = select(SymptomCheck)
    if user.role != Role.ADMIN:
        stmt = stmt.where(or_(SymptomCheck.farm_id.in_(accessible_farm_ids(db, user)), SymptomCheck.created_by_id == user.id))
    return stmt


@router.get("/symptom-checks", response_model=Page[CheckOut], tags=["symptom checker"])
def list_checks(
    farm_id: int | None = None,
    confirmed: bool | None = None,
    limit: int = Query(default=25, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = _scoped(db, user)
    if farm_id is not None:
        get_accessible_farm(db, user, farm_id)
        stmt = stmt.where(SymptomCheck.farm_id == farm_id)
    if confirmed is not None:
        stmt = stmt.where(
            SymptomCheck.confirmed_diagnosis.is_not(None) if confirmed else SymptomCheck.confirmed_diagnosis.is_(None)
        )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.order_by(SymptomCheck.id.desc()).limit(limit).offset(offset)).all()
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.post("/symptom-checks/{check_id}/confirm", response_model=CheckOut, tags=["symptom checker"])
def confirm(
    check_id: int,
    payload: ConfirmIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.ADMIN, Role.VETERINARIAN)),
):
    row = db.scalar(_scoped(db, user).where(SymptomCheck.id == check_id))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Symptom check not found.")
    row.confirmed_diagnosis = payload.diagnosis.strip()
    row.diagnosis_method = payload.method
    row.confirmation_notes = payload.notes
    row.confirmed_by_id = user.id
    row.confirmed_at = datetime.now(timezone.utc)
    audit.record(
        db,
        user,
        "symptom_check.confirm",
        "symptom_check",
        row.id,
        f"Confirmed diagnosis '{row.confirmed_diagnosis}' ({payload.method})",
        farm_id=row.farm_id,
    )
    db.commit()
    db.refresh(row)
    return row


@router.get("/symptom-checks/export", tags=["symptom checker"])
def export_confirmed(db: Session = Depends(get_db), _: User = Depends(require_roles(Role.ADMIN))):
    """CSV of vet-confirmed cases (no personal data) — the dataset for a future trained model."""
    rows = db.scalars(select(SymptomCheck).where(SymptomCheck.confirmed_diagnosis.is_not(None)).order_by(SymptomCheck.id)).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        ["case_id", "species", "age_group", "sudden_deaths", "signs", "confirmed_diagnosis", "diagnosis_method", "kb_version"]
    )
    for r in rows:
        w.writerow(
            [
                r.id,
                r.species,
                r.age_group or "",
                int(r.sudden_deaths),
                ";".join(r.signs),
                r.confirmed_diagnosis,
                r.diagnosis_method,
                r.kb_version,
            ]
        )
    return Response(
        buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=confirmed_cases.csv"}
    )
