from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_accessible_farm, get_current_user, require_roles, scope_farms
from app.db.session import get_db
from app.models import Alert, AlertStatus, BiosecurityAssessment, Farm, FarmType, Role, User
from app.schemas import FarmBase, FarmCreate, FarmOut, FarmUpdate, Page
from app.services import audit

router = APIRouter(prefix="/farms", tags=["farms"])


def _check_assignee(db: Session, user_id: int | None, role: Role, label: str) -> None:
    if user_id is None:
        return
    u = db.get(User, user_id)
    if not u or u.role != role or not u.is_active:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{label} must be an active {role.value} account.")


def _annotate(db: Session, farms: list[Farm]) -> list[FarmOut]:
    if not farms:
        return []
    ids = [f.id for f in farms]
    open_counts = dict(
        db.execute(
            select(Alert.farm_id, func.count())
            .where(Alert.farm_id.in_(ids), Alert.status != AlertStatus.RESOLVED)
            .group_by(Alert.farm_id)
        ).all()
    )
    latest_sub = (
        select(BiosecurityAssessment.farm_id, func.max(BiosecurityAssessment.id).label("mid"))
        .where(BiosecurityAssessment.farm_id.in_(ids))
        .group_by(BiosecurityAssessment.farm_id)
        .subquery()
    )
    latest = dict(
        db.execute(
            select(BiosecurityAssessment.farm_id, BiosecurityAssessment.status).join(
                latest_sub, BiosecurityAssessment.id == latest_sub.c.mid
            )
        ).all()
    )
    out = []
    for f in farms:
        o = FarmOut.model_validate(f)
        o.open_alerts = open_counts.get(f.id, 0)
        o.latest_status = latest.get(f.id)
        out.append(o)
    return out


@router.get("", response_model=Page[FarmOut])
def list_farms(
    q: str | None = Query(default=None, max_length=100),
    farm_type: FarmType | None = None,
    taluk: str | None = Query(default=None, max_length=80),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = scope_farms(select(Farm), user)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(func.lower(Farm.name).like(like) | func.lower(func.coalesce(Farm.village, "")).like(like))
    if farm_type:
        stmt = stmt.where(Farm.farm_type == farm_type)
    if taluk:
        stmt = stmt.where(Farm.taluk == taluk)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    farms = db.scalars(stmt.order_by(Farm.name).limit(limit).offset(offset)).unique().all()
    return Page(items=_annotate(db, list(farms)), total=total, limit=limit, offset=offset)


@router.post("", response_model=FarmOut, status_code=status.HTTP_201_CREATED)
def create_farm(
    payload: FarmCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.ADMIN, Role.FARMER)),
):
    data = payload.model_dump()
    if user.role == Role.FARMER:
        if data["veterinarian_id"] is not None or data["owner_id"] not in (None, user.id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Farmers cannot assign owners or veterinarians.")
        data["owner_id"] = user.id
    _check_assignee(db, data["owner_id"], Role.FARMER, "Owner")
    _check_assignee(db, data["veterinarian_id"], Role.VETERINARIAN, "Veterinarian")
    farm = Farm(**data)
    db.add(farm)
    db.flush()
    audit.record(db, user, "farm.create", "farm", farm.id, f"Registered farm {farm.name}", farm_id=farm.id)
    db.commit()
    db.refresh(farm)
    return _annotate(db, [farm])[0]


@router.get("/{farm_id}", response_model=FarmOut)
def get_farm(farm_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _annotate(db, [get_accessible_farm(db, user, farm_id)])[0]


@router.patch("/{farm_id}", response_model=FarmOut)
def update_farm(farm_id: int, payload: FarmUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    farm = get_accessible_farm(db, user, farm_id)
    changes = payload.model_dump(exclude_unset=True)
    if user.role != Role.ADMIN and ({"owner_id", "veterinarian_id"} & changes.keys()):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only administrators can change farm assignments.")
    if "owner_id" in changes:
        _check_assignee(db, changes["owner_id"], Role.FARMER, "Owner")
    if "veterinarian_id" in changes:
        _check_assignee(db, changes["veterinarian_id"], Role.VETERINARIAN, "Veterinarian")
    for field in ("name", "farm_type", "district", "taluk"):
        if field in changes and changes[field] is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{field} cannot be empty.")
    merged = {
        k: changes.get(k, getattr(farm, k))
        for k in ("name", "farm_type", "district", "taluk", "village", "pig_count", "poultry_count", "contact_phone")
    }
    merged["pig_count"] = merged["pig_count"] or 0
    merged["poultry_count"] = merged["poultry_count"] or 0
    try:
        FarmBase(**merged)  # re-validate the combined state (e.g. counts vs farm type)
    except ValidationError as exc:
        msg = str(exc.errors()[0].get("msg", "Invalid farm details.")).removeprefix("Value error, ")
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, msg) from None
    for k, v in changes.items():
        setattr(farm, k, v if k not in ("pig_count", "poultry_count") else (v or 0))
    audit.record(db, user, "farm.update", "farm", farm.id, f"Updated farm {farm.name}", farm_id=farm.id)
    db.commit()
    db.refresh(farm)
    return _annotate(db, [farm])[0]


@router.delete("/{farm_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_farm(farm_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles(Role.ADMIN))):
    farm = get_accessible_farm(db, user, farm_id)
    audit.record(db, user, "farm.delete", "farm", farm.id, f"Deleted farm {farm.name} and its records")
    db.delete(farm)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
