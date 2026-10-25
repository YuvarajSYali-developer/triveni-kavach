"""Real external data: live regional weather, official outbreak notices and official
livestock statistics. Every item carries its source."""

import csv
import io

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import accessible_farm_ids, get_accessible_farm, get_current_user, require_roles
from app.db.session import get_db
from app.models import (
    Farm,
    FarmType,
    LivestockStatistic,
    NoticeSpecies,
    OutbreakNotice,
    OutbreakStatus,
    Role,
    Species,
    User,
)
from app.schemas import (
    DataGovImport,
    ImportResult,
    LivestockStatIn,
    LivestockStatOut,
    OutbreakIn,
    OutbreakOut,
    Page,
)
from app.services import audit, datagov, weather

router = APIRouter()
staff = require_roles(Role.ADMIN, Role.VETERINARIAN)
admin_only = require_roles(Role.ADMIN)


# -------------------------------------------------------------------- weather
@router.get("/weather/locations", tags=["weather"])
def weather_locations(_: User = Depends(get_current_user)):
    return {"locations": weather.supported_locations(), "attribution": weather.ATTRIBUTION}


def _weather(district: str, taluk: str) -> dict:
    try:
        return weather.get_weather(district, taluk)
    except weather.LocationNotSupported as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from None
    except weather.WeatherUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from None


@router.get("/weather", tags=["weather"])
def weather_for(
    district: str = Query(min_length=2, max_length=80),
    taluk: str = Query(min_length=2, max_length=80),
    _: User = Depends(get_current_user),
):
    return _weather(district, taluk)


@router.get("/farms/{farm_id}/weather", tags=["weather"])
def farm_weather(farm_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    farm = get_accessible_farm(db, user, farm_id)
    return _weather(farm.district, farm.taluk)


# ---------------------------------------------------------- outbreak notices
def _species_filter(farm_type: FarmType) -> list[NoticeSpecies]:
    if farm_type == FarmType.PIG:
        return [NoticeSpecies.PIG, NoticeSpecies.BOTH]
    if farm_type == FarmType.POULTRY:
        return [NoticeSpecies.POULTRY, NoticeSpecies.BOTH]
    return list(NoticeSpecies)


@router.get("/outbreaks", response_model=Page[OutbreakOut], tags=["outbreak notices"])
def list_outbreaks(
    status_filter: OutbreakStatus | None = Query(default=None, alias="status"),
    district: str | None = Query(default=None, max_length=80),
    species: NoticeSpecies | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(OutbreakNotice)
    if status_filter:
        stmt = stmt.where(OutbreakNotice.status == status_filter)
    if district:
        stmt = stmt.where(func.lower(OutbreakNotice.district) == district.strip().lower())
    if species:
        stmt = stmt.where(OutbreakNotice.species.in_([species, NoticeSpecies.BOTH]))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(
        stmt.order_by(OutbreakNotice.reported_on.desc(), OutbreakNotice.id.desc()).limit(limit).offset(offset)
    ).all()
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.post("/outbreaks", response_model=OutbreakOut, status_code=status.HTTP_201_CREATED, tags=["outbreak notices"])
def create_outbreak(payload: OutbreakIn, db: Session = Depends(get_db), user: User = Depends(staff)):
    notice = OutbreakNotice(**payload.model_dump(), created_by_id=user.id)
    db.add(notice)
    db.flush()
    audit.record(
        db,
        user,
        "outbreak.create",
        "outbreak_notice",
        notice.id,
        f"Recorded official notice: {notice.disease} in {notice.district} ({notice.source_name})",
    )
    db.commit()
    return notice


def _editable(db: Session, user: User, notice_id: int) -> OutbreakNotice:
    notice = db.get(OutbreakNotice, notice_id)
    if notice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notice not found.")
    if user.role != Role.ADMIN and notice.created_by_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only administrators or the person who entered this notice can change it.")
    return notice


@router.put("/outbreaks/{notice_id}", response_model=OutbreakOut, tags=["outbreak notices"])
def update_outbreak(notice_id: int, payload: OutbreakIn, db: Session = Depends(get_db), user: User = Depends(staff)):
    notice = _editable(db, user, notice_id)
    for k, v in payload.model_dump().items():
        setattr(notice, k, v)
    audit.record(
        db, user, "outbreak.update", "outbreak_notice", notice.id, f"Updated notice: {notice.disease} in {notice.district}"
    )
    db.commit()
    return notice


@router.delete("/outbreaks/{notice_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["outbreak notices"])
def delete_outbreak(notice_id: int, db: Session = Depends(get_db), user: User = Depends(admin_only)):
    notice = _editable(db, user, notice_id)
    audit.record(
        db, user, "outbreak.delete", "outbreak_notice", notice.id, f"Deleted notice: {notice.disease} in {notice.district}"
    )
    db.delete(notice)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/farms/{farm_id}/advisories", response_model=list[OutbreakOut], tags=["outbreak notices"])
def farm_advisories(farm_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Active official notices in the farm's district that concern its species."""
    farm = get_accessible_farm(db, user, farm_id)
    return db.scalars(
        select(OutbreakNotice)
        .where(
            OutbreakNotice.status == OutbreakStatus.ACTIVE,
            func.lower(OutbreakNotice.district) == farm.district.lower(),
            OutbreakNotice.species.in_(_species_filter(farm.farm_type)),
        )
        .order_by(OutbreakNotice.reported_on.desc())
    ).all()


def active_notices_for_user(db: Session, user: User, limit: int = 10) -> list[OutbreakNotice]:
    """Active notices relevant to the user's farms (all districts for administrators)."""
    stmt = select(OutbreakNotice).where(OutbreakNotice.status == OutbreakStatus.ACTIVE)
    if user.role != Role.ADMIN:
        ids = accessible_farm_ids(db, user)
        districts = {d.lower() for d in db.scalars(select(Farm.district).where(Farm.id.in_(ids)))} if ids else set()
        if not districts:
            return []
        stmt = stmt.where(func.lower(OutbreakNotice.district).in_(districts))
    return list(db.scalars(stmt.order_by(OutbreakNotice.reported_on.desc()).limit(limit)).all())


# --------------------------------------------------------- livestock statistics
@router.get("/statistics/livestock", response_model=Page[LivestockStatOut], tags=["livestock statistics"])
def list_statistics(
    state: str | None = Query(default=None, max_length=80),
    district: str | None = Query(default=None, max_length=80),
    species: Species | None = None,
    reference_year: int | None = None,
    limit: int = Query(default=200, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(LivestockStatistic)
    if state:
        stmt = stmt.where(func.lower(LivestockStatistic.state) == state.strip().lower())
    if district:
        stmt = stmt.where(func.lower(LivestockStatistic.district) == district.strip().lower())
    if species:
        stmt = stmt.where(LivestockStatistic.species == species)
    if reference_year:
        stmt = stmt.where(LivestockStatistic.reference_year == reference_year)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(
        stmt.order_by(LivestockStatistic.state, LivestockStatistic.district, LivestockStatistic.species)
        .limit(limit)
        .offset(offset)
    ).all()
    return Page(items=items, total=total, limit=limit, offset=offset)


def _upsert(db: Session, data: dict, method: str, user: User) -> bool:
    """Insert or update one statistic; returns True when created."""
    existing = db.scalar(
        select(LivestockStatistic).where(
            func.lower(LivestockStatistic.state) == data["state"].lower(),
            func.lower(LivestockStatistic.district) == data["district"].lower(),
            LivestockStatistic.species == data["species"],
            LivestockStatistic.reference_year == data["reference_year"],
            LivestockStatistic.source_name == data["source_name"],
        )
    )
    if existing:
        for k, v in data.items():
            setattr(existing, k, v)
        existing.import_method = method
        return False
    db.add(LivestockStatistic(**data, import_method=method, created_by_id=user.id))
    return True


@router.post(
    "/statistics/livestock", response_model=LivestockStatOut, status_code=status.HTTP_201_CREATED, tags=["livestock statistics"]
)
def create_statistic(payload: LivestockStatIn, db: Session = Depends(get_db), user: User = Depends(admin_only)):
    _upsert(db, payload.model_dump(), "manual", user)
    audit.record(
        db,
        user,
        "statistics.manual",
        "livestock_statistic",
        None,
        f"Entered {payload.species.value} population for {payload.district} ({payload.reference_year})",
    )
    db.commit()
    return db.scalar(
        select(LivestockStatistic).where(
            func.lower(LivestockStatistic.district) == payload.district.lower(),
            func.lower(LivestockStatistic.state) == payload.state.lower(),
            LivestockStatistic.species == payload.species,
            LivestockStatistic.reference_year == payload.reference_year,
            LivestockStatistic.source_name == payload.source_name,
        )
    )


@router.delete("/statistics/livestock/{stat_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["livestock statistics"])
def delete_statistic(stat_id: int, db: Session = Depends(get_db), user: User = Depends(admin_only)):
    stat = db.get(LivestockStatistic, stat_id)
    if stat is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Statistic not found.")
    audit.record(db, user, "statistics.delete", "livestock_statistic", stat.id, f"Deleted statistic for {stat.district}")
    db.delete(stat)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


CSV_COLUMNS = ["state", "district", "species", "population", "reference_year", "source_name", "source_url"]


@router.post("/statistics/livestock/import-csv", response_model=ImportResult, tags=["livestock statistics"])
async def import_csv(file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(admin_only)):
    """CSV with header: state,district,species,population,reference_year,source_name,source_url[,notes]."""
    raw = await file.read(2_000_001)
    if len(raw) > 2_000_000:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The file is larger than 2 MB.")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The file must be UTF-8 encoded CSV.") from None
    reader = csv.DictReader(io.StringIO(text))
    missing = [c for c in CSV_COLUMNS if c not in (reader.fieldnames or [])]
    if missing:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Missing CSV column(s): {', '.join(missing)}.")
    rows, skipped = [], []
    for line, rec in enumerate(reader, start=2):
        population = datagov.parse_count(rec["population"])
        year = (rec["reference_year"] or "").strip()
        if population is None or not year.isdigit():
            skipped.append(f"line {line}: population and reference_year must be whole numbers")
            continue
        try:
            item = LivestockStatIn(
                state=rec["state"] or "",
                district=rec["district"] or "",
                species=(rec["species"] or "").strip().lower(),
                population=population,
                reference_year=int(year),
                source_name=rec["source_name"] or "",
                source_url=(rec["source_url"] or "").strip(),
                notes=(rec.get("notes") or None),
            )
        except ValidationError as exc:
            skipped.append(f"line {line}: {exc.errors()[0]['loc'][0]}: {exc.errors()[0]['msg']}")
            continue
        rows.append(item)
    if not rows:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No valid rows found. " + "; ".join(skipped[:5]))
    created = sum(_upsert(db, r.model_dump(), "csv", user) for r in rows)
    audit.record(
        db, user, "statistics.csv", "livestock_statistic", None, f"Imported {len(rows)} statistic(s) from {file.filename}"
    )
    db.commit()
    return ImportResult(created=created, updated=len(rows) - created, skipped=skipped)


@router.get("/statistics/livestock/datagov/status", tags=["livestock statistics"])
def datagov_status(_: User = Depends(admin_only)):
    from app.core.config import get_settings

    return {"configured": bool(get_settings().DATA_GOV_IN_API_KEY)}


@router.get("/statistics/livestock/datagov/preview", tags=["livestock statistics"])
def datagov_preview(resource_id: str = Query(min_length=8, max_length=64), _: User = Depends(admin_only)):
    try:
        return datagov.preview(resource_id.strip())
    except datagov.DataGovError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from None


@router.post("/statistics/livestock/datagov/import", response_model=ImportResult, tags=["livestock statistics"])
def datagov_import(payload: DataGovImport, db: Session = Depends(get_db), user: User = Depends(admin_only)):
    try:
        rows, skipped = datagov.fetch_population_rows(
            payload.resource_id,
            payload.state_field,
            payload.district_field,
            payload.pig_field,
            payload.poultry_field,
            payload.state_filter,
        )
    except datagov.DataGovError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from None
    if not rows:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No usable rows were found with the selected fields.")
    source_url = f"https://data.gov.in/resource/{payload.resource_id}"
    created = 0
    for r in rows:
        created += _upsert(
            db,
            {
                **r,
                "species": Species(r["species"]),
                "reference_year": payload.reference_year,
                "source_name": payload.source_name,
                "source_url": source_url,
                "notes": None,
            },
            "data.gov.in",
            user,
        )
    audit.record(
        db,
        user,
        "statistics.datagov",
        "livestock_statistic",
        None,
        f"Imported {len(rows)} statistic(s) from data.gov.in resource {payload.resource_id}",
    )
    db.commit()
    return ImportResult(created=created, updated=len(rows) - created, skipped=skipped[:200])
