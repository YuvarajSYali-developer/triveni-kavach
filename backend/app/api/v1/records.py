# NOTE: no ``from __future__ import annotations`` here — the route factory relies on
# annotations being evaluated at definition time so FastAPI sees the concrete schemas.
from collections.abc import Callable
from datetime import date, datetime, time, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import Date, DateTime, func, select, type_coerce
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import get_accessible_farm, get_current_user
from app.db.base import UTCDateTime
from app.db.session import get_db
from app.models import (
    EnvironmentalObservation,
    Farm,
    HygieneInspection,
    InspectionResult,
    MortalityRecord,
    ObservationSource,
    Role,
    User,
    VaccinationRecord,
    VisitorLog,
)
from app.schemas import (
    EnvironmentIn,
    EnvironmentOut,
    HygieneIn,
    HygieneOut,
    MortalityIn,
    MortalityOut,
    Page,
    SimulateRequest,
    TelemetryIngest,
    VaccinationIn,
    VaccinationOut,
    VisitorIn,
    VisitorOut,
)
from app.services import audit, telemetry

router = APIRouter(tags=["farm records"])

HYGIENE_FIELDS = (
    "footbath_maintained",
    "shed_cleaned",
    "disinfectant_applied",
    "waste_disposed_properly",
    "protective_clothing_available",
)


def _prepare_hygiene(data: dict[str, Any]) -> dict[str, Any]:
    data["result"] = InspectionResult.PASS if all(data[f] for f in HYGIENE_FIELDS) else InspectionResult.FAIL
    return data


def _prepare_environment(data: dict[str, Any]) -> dict[str, Any]:
    if data["source"] != ObservationSource.MANUAL:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Readings entered through this form must use source 'manual'. Simulated readings come from the "
            "simulator; device readings are not enabled in this deployment.",
        )
    return data


def _check_species(farm: Farm, data: dict[str, Any]) -> None:
    sp = data.get("species")
    if sp is None:
        return
    allowed = {"pig": {"pig"}, "poultry": {"poultry"}, "mixed": {"pig", "poultry"}}[farm.farm_type.value]
    if sp.value not in allowed:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, f"A {farm.farm_type.value} farm cannot have {sp.value} records."
        )


def _can_modify(user: User, farm: Farm, recorder_id: int | None) -> bool:
    if user.role == Role.ADMIN:
        return True
    if user.role == Role.VETERINARIAN and farm.veterinarian_id == user.id:
        return True
    return recorder_id is not None and recorder_id == user.id


def register(
    kind: str,
    label: str,
    model: type,
    in_schema: type[BaseModel],
    out_schema: type[BaseModel],
    date_col: Any,
    recorder_col: str = "recorded_by_id",
    prepare: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
    filters: tuple[str, ...] = (),
) -> None:
    column = getattr(model, date_col) if isinstance(date_col, str) else date_col
    is_datetime = isinstance(column.type, (UTCDateTime, DateTime))

    def _bound(d: date, end: bool):
        if not is_datetime:
            return d
        return datetime.combine(d, time.max if end else time.min, tzinfo=timezone.utc)

    @router.get(f"/farms/{{farm_id}}/{kind}", response_model=Page[out_schema], name=f"list_{kind}")
    def list_records(
        farm_id: int,
        date_from: date | None = None,
        date_to: date | None = None,
        status_filter: str | None = Query(default=None, alias="status", max_length=20),
        species: str | None = Query(default=None, max_length=20),
        source: str | None = Query(default=None, max_length=20),
        limit: int = Query(default=100, ge=1, le=1000),
        offset: int = Query(default=0, ge=0),
        db: Session = Depends(get_db),
        user: User = Depends(get_current_user),
    ):
        get_accessible_farm(db, user, farm_id)
        if date_from and date_to and date_from > date_to:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "'date_from' must not be after 'date_to'.")
        stmt = select(model).where(model.farm_id == farm_id)
        if date_from:
            stmt = stmt.where(column >= _bound(date_from, False))
        if date_to:
            stmt = stmt.where(column <= _bound(date_to, True))
        for name, value in (("status", status_filter), ("species", species), ("source", source)):
            if value is not None:
                if name not in filters:
                    raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Filter '{name}' is not supported here.")
                attr = "result" if (name == "status" and kind == "hygiene") else name
                stmt = stmt.where(getattr(model, attr) == value)
        total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        items = db.scalars(stmt.order_by(column.desc(), model.id.desc()).limit(limit).offset(offset)).all()
        return Page(items=items, total=total, limit=limit, offset=offset)

    @router.post(
        f"/farms/{{farm_id}}/{kind}", response_model=out_schema, status_code=status.HTTP_201_CREATED, name=f"create_{kind}"
    )
    def create_record(farm_id: int, payload: in_schema, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
        farm = get_accessible_farm(db, user, farm_id)
        data = payload.model_dump()
        _check_species(farm, data)
        if prepare:
            data = prepare(data)
        obj = model(farm_id=farm.id, **{recorder_col: user.id}, **data)
        db.add(obj)
        db.flush()
        audit.record(db, user, f"{kind}.create", kind, obj.id, f"Added {label} for {farm.name}", farm_id=farm.id)
        db.commit()
        db.refresh(obj)
        return obj

    def _load(db: Session, user: User, farm_id: int, record_id: int):
        farm = get_accessible_farm(db, user, farm_id)
        obj = db.get(model, record_id)
        if obj is None or obj.farm_id != farm.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"{label.capitalize()} not found.")
        return farm, obj

    @router.get(f"/farms/{{farm_id}}/{kind}/{{record_id}}", response_model=out_schema, name=f"get_{kind}")
    def get_record(farm_id: int, record_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
        return _load(db, user, farm_id, record_id)[1]

    @router.put(f"/farms/{{farm_id}}/{kind}/{{record_id}}", response_model=out_schema, name=f"update_{kind}")
    def update_record(
        farm_id: int, record_id: int, payload: in_schema, db: Session = Depends(get_db), user: User = Depends(get_current_user)
    ):
        farm, obj = _load(db, user, farm_id, record_id)
        if not _can_modify(user, farm, getattr(obj, recorder_col)):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit records you entered.")
        data = payload.model_dump()
        _check_species(farm, data)
        if prepare:
            data = prepare(data)
        for k, v in data.items():
            setattr(obj, k, v)
        audit.record(db, user, f"{kind}.update", kind, obj.id, f"Updated {label} for {farm.name}", farm_id=farm.id)
        db.commit()
        db.refresh(obj)
        return obj

    @router.delete(f"/farms/{{farm_id}}/{kind}/{{record_id}}", status_code=status.HTTP_204_NO_CONTENT, name=f"delete_{kind}")
    def delete_record(farm_id: int, record_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
        farm, obj = _load(db, user, farm_id, record_id)
        if not _can_modify(user, farm, getattr(obj, recorder_col)):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only delete records you entered.")
        audit.record(db, user, f"{kind}.delete", kind, obj.id, f"Deleted {label} for {farm.name}", farm_id=farm.id)
        db.delete(obj)
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)


# Vaccinations are dated by when they were given, falling back to when they were due.
_vax_date = type_coerce(func.coalesce(VaccinationRecord.administered_on, VaccinationRecord.due_on), Date)
register(
    "vaccinations",
    "vaccination record",
    VaccinationRecord,
    VaccinationIn,
    VaccinationOut,
    _vax_date,
    filters=("status", "species"),
)
register("mortality", "mortality record", MortalityRecord, MortalityIn, MortalityOut, "observed_on", filters=("species",))
register(
    "hygiene",
    "hygiene inspection",
    HygieneInspection,
    HygieneIn,
    HygieneOut,
    "inspected_on",
    recorder_col="inspector_id",
    prepare=_prepare_hygiene,
    filters=("status",),
)
register("visitors", "visitor entry", VisitorLog, VisitorIn, VisitorOut, "entry_time")
register(
    "environment",
    "environmental reading",
    EnvironmentalObservation,
    EnvironmentIn,
    EnvironmentOut,
    "observed_at",
    prepare=_prepare_environment,
    filters=("source",),
)


# ------------------------------------------------------------------ telemetry
@router.post("/telemetry/ingest", status_code=status.HTTP_201_CREATED, tags=["telemetry"])
def ingest(payload: TelemetryIngest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Batch ingestion of environmental readings. Accepts ``manual`` and ``simulated``
    sources. ``device`` is rejected unless ALLOW_DEVICE_SOURCE is enabled — no physical
    device has been integrated or tested in this project."""
    farm = get_accessible_farm(db, user, payload.farm_id)
    allow_device = get_settings().ALLOW_DEVICE_SOURCE
    for i, r in enumerate(payload.readings):
        if r.source == ObservationSource.DEVICE and not allow_device:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Reading {i}: source 'device' is not enabled. No physical device integration exists in this deployment.",
            )
        if r.source == ObservationSource.DEVICE and not r.device_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Reading {i}: device readings need a device_id.")
    objs = [EnvironmentalObservation(farm_id=farm.id, recorded_by_id=user.id, **r.model_dump()) for r in payload.readings]
    db.add_all(objs)
    sources = sorted({o.source.value for o in objs})
    audit.record(
        db,
        user,
        "environment.ingest",
        "environment",
        None,
        f"Ingested {len(objs)} reading(s) ({', '.join(sources)}) for {farm.name}",
        farm_id=farm.id,
    )
    db.commit()
    return {"farm_id": farm.id, "stored": len(objs), "sources": sources}


@router.post("/farms/{farm_id}/environment/simulate", status_code=status.HTTP_201_CREATED, tags=["telemetry"])
def simulate(farm_id: int, payload: SimulateRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Generate SYNTHETIC readings (source='simulated') to demonstrate the IoT concept."""
    if not get_settings().ENABLE_TELEMETRY_SIMULATOR:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "The telemetry simulator is disabled in this deployment.")
    farm = get_accessible_farm(db, user, farm_id)
    objs = telemetry.generate(farm.id, payload.hours, payload.interval_minutes, payload.include_excursion, payload.seed, user.id)
    db.add_all(objs)
    audit.record(
        db,
        user,
        "environment.simulate",
        "environment",
        None,
        f"Generated {len(objs)} simulated reading(s) for {farm.name}",
        farm_id=farm.id,
    )
    db.commit()
    return {"farm_id": farm.id, "stored": len(objs), "source": "simulated"}
