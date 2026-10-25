from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import accessible_farm_ids, get_accessible_farm, get_current_user
from app.db.session import get_db
from app.models import AnimalScreening, FarmType, Role, User
from app.schemas import Page, ScreeningOut, ScreeningRequest
from app.services import audit
from app.services.screening.model_service import (
    LIMITATIONS,
    RECOMMENDATION,
    SCORE_NOTE,
    InvalidInput,
    ModelUnavailable,
    UnsupportedSpecies,
    get_screening_model,
)

router = APIRouter(prefix="/screening", tags=["animal-health screening"])


def _out(s: AnimalScreening) -> ScreeningOut:
    return ScreeningOut(
        id=s.id,
        created_at=s.created_at,
        farm_id=s.farm_id,
        species=s.species,
        animal_identifier=s.animal_identifier,
        inputs=s.inputs,
        model_version=s.model_version,
        top={"label": s.top_label, "model_score": s.top_score, "observed_for_species_in_training": s.top_observed_for_species},
        alternatives=s.alternatives,
        warnings=s.warnings,
        score_note=SCORE_NOTE,
        recommendation=RECOMMENDATION,
        limitations=LIMITATIONS,
    )


@router.get("/status")
def model_status(_: User = Depends(get_current_user)):
    m = get_screening_model()
    if not m.available:
        m.load()
    return m.status()


@router.post("", response_model=ScreeningOut, status_code=status.HTTP_201_CREATED)
def screen(payload: ScreeningRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    model = get_screening_model()
    farm = None
    if payload.farm_id is not None:
        farm = get_accessible_farm(db, user, payload.farm_id)
        if farm.farm_type == FarmType.POULTRY:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "This farm keeps only poultry, which the screening model does not support."
            )
    try:
        pred = model.predict(
            payload.species,
            payload.body_temperature_c,
            payload.heart_rate_bpm,
            payload.respiratory_rate_bpm,
            payload.activity_level,
            payload.symptoms,
        )
    except UnsupportedSpecies as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from None
    except InvalidInput as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from None
    except ModelUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"The screening model is unavailable: {exc}") from None

    record = AnimalScreening(
        farm_id=farm.id if farm else None,
        requested_by_id=user.id,
        species=pred.inputs["species"],
        animal_identifier=payload.animal_identifier,
        inputs=pred.inputs,
        model_version=pred.model_version,
        top_label=pred.top["label"],
        top_score=pred.top["model_score"],
        top_observed_for_species=pred.top["observed_for_species_in_training"],
        alternatives=pred.alternatives,
        warnings=pred.warnings,
    )
    db.add(record)
    db.flush()
    audit.record(
        db,
        user,
        "screening.create",
        "animal_screening",
        record.id,
        f"Screening request ({record.species}) -> model output '{record.top_label}'",
        farm_id=record.farm_id,
    )
    db.commit()
    db.refresh(record)
    return _out(record)


@router.get("", response_model=Page[ScreeningOut])
def history(
    farm_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(AnimalScreening)
    if farm_id is not None:
        get_accessible_farm(db, user, farm_id)
        stmt = stmt.where(AnimalScreening.farm_id == farm_id)
    elif user.role != Role.ADMIN:
        stmt = stmt.where(
            or_(AnimalScreening.farm_id.in_(accessible_farm_ids(db, user)), AnimalScreening.requested_by_id == user.id)
        )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.order_by(AnimalScreening.id.desc()).limit(limit).offset(offset)).all()
    return Page(items=[_out(s) for s in items], total=total, limit=limit, offset=offset)


@router.get("/{screening_id}", response_model=ScreeningOut)
def get_screening(screening_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    s = db.get(AnimalScreening, screening_id)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Screening record not found.")
    if user.role != Role.ADMIN and s.requested_by_id != user.id:
        if s.farm_id is None or s.farm_id not in accessible_farm_ids(db, user):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Screening record not found.")
    return _out(s)
