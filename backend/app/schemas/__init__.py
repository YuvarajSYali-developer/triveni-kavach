"""Request/response schemas."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models import (
    AlertSeverity,
    AlertStatus,
    FarmType,
    InspectionResult,
    NoticeSpecies,
    ObservationSource,
    OutbreakStatus,
    RiskStatus,
    Role,
    Species,
    VaccinationStatus,
)

T = TypeVar("T")

PHONE_PATTERN = r"^\+?[0-9][0-9 \-]{6,18}$"
_FIVE_MIN = timedelta(minutes=5)


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


def _strip(v: Any) -> Any:
    return v.strip() if isinstance(v, str) else v


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _aware(v: datetime | None) -> datetime | None:
    if v is not None and v.tzinfo is None:
        return v.replace(tzinfo=timezone.utc)
    return v


# ---------------------------------------------------------------- auth & users
class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(ORM):
    id: int
    email: str
    full_name: str
    role: Role
    phone: str | None
    is_active: bool
    is_demo: bool


class UserBrief(ORM):
    id: int
    full_name: str
    role: Role


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    role: Role
    password: str = Field(min_length=10, max_length=128)
    phone: str | None = Field(default=None, pattern=PHONE_PATTERN)

    _s = field_validator("full_name", mode="before")(_strip)

    @field_validator("password")
    @classmethod
    def _strength(cls, v: str) -> str:
        if not (any(c.isalpha() for c in v) and any(c.isdigit() for c in v)):
            raise ValueError("Password must contain letters and digits.")
        return v


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, pattern=PHONE_PATTERN)
    is_active: bool | None = None


# ---------------------------------------------------------------------- farms
class FarmBase(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    farm_type: FarmType
    district: str = Field(min_length=2, max_length=80)
    taluk: str = Field(min_length=2, max_length=80)
    village: str | None = Field(default=None, max_length=120)
    pig_count: int = Field(default=0, ge=0, le=1_000_000)
    poultry_count: int = Field(default=0, ge=0, le=10_000_000)
    contact_phone: str | None = Field(default=None, pattern=PHONE_PATTERN)

    _s = field_validator("name", "district", "taluk", "village", mode="before")(_strip)

    @model_validator(mode="after")
    def _counts_match_type(self):
        if self.farm_type == FarmType.PIG and self.poultry_count:
            raise ValueError("A pig farm cannot record poultry; choose 'mixed' instead.")
        if self.farm_type == FarmType.POULTRY and self.pig_count:
            raise ValueError("A poultry farm cannot record pigs; choose 'mixed' instead.")
        return self


class FarmCreate(FarmBase):
    owner_id: int | None = None
    veterinarian_id: int | None = None


class FarmUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    farm_type: FarmType | None = None
    district: str | None = Field(default=None, min_length=2, max_length=80)
    taluk: str | None = Field(default=None, min_length=2, max_length=80)
    village: str | None = Field(default=None, max_length=120)
    pig_count: int | None = Field(default=None, ge=0, le=1_000_000)
    poultry_count: int | None = Field(default=None, ge=0, le=10_000_000)
    contact_phone: str | None = Field(default=None, pattern=PHONE_PATTERN)
    owner_id: int | None = None
    veterinarian_id: int | None = None


class FarmOut(ORM):
    id: int
    name: str
    farm_type: FarmType
    state: str
    district: str
    taluk: str
    village: str | None
    pig_count: int
    poultry_count: int
    total_animals: int
    contact_phone: str | None
    owner: UserBrief | None
    veterinarian: UserBrief | None
    is_demo: bool
    created_at: datetime
    updated_at: datetime
    open_alerts: int = 0
    latest_status: RiskStatus | None = None


# -------------------------------------------------------------------- records
class _RecordOut(ORM):
    id: int
    farm_id: int
    notes: str | None
    created_at: datetime
    updated_at: datetime
    recorded_by_id: int | None = None


class VaccinationIn(BaseModel):
    species: Species
    vaccine_name: str = Field(min_length=2, max_length=120)
    target_disease: str | None = Field(default=None, max_length=120)
    status: VaccinationStatus
    due_on: date | None = None
    administered_on: date | None = None
    animals_covered: int = Field(default=0, ge=0, le=10_000_000)
    batch_number: str | None = Field(default=None, max_length=60)
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _dates(self):
        if self.status == VaccinationStatus.COMPLETED and self.administered_on is None:
            raise ValueError("A completed vaccination needs the date it was administered.")
        if self.status == VaccinationStatus.SCHEDULED and self.due_on is None:
            raise ValueError("A scheduled vaccination needs a due date.")
        if self.status == VaccinationStatus.MISSED and self.due_on is None:
            raise ValueError("A missed vaccination needs the date it was due.")
        if self.administered_on and self.administered_on > _today():
            raise ValueError("The administered date cannot be in the future.")
        return self


class VaccinationOut(_RecordOut):
    species: Species
    vaccine_name: str
    target_disease: str | None
    status: VaccinationStatus
    due_on: date | None
    administered_on: date | None
    animals_covered: int
    batch_number: str | None


class MortalityIn(BaseModel):
    species: Species
    observed_on: date
    count: int = Field(ge=0, le=1_000_000, description="0 records an explicit nil report")
    suspected_cause: str | None = Field(default=None, max_length=160)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("observed_on")
    @classmethod
    def _not_future(cls, v: date) -> date:
        if v > _today():
            raise ValueError("The observation date cannot be in the future.")
        return v


class MortalityOut(_RecordOut):
    species: Species
    observed_on: date
    count: int
    suspected_cause: str | None


class HygieneIn(BaseModel):
    inspected_on: date
    footbath_maintained: bool
    shed_cleaned: bool
    disinfectant_applied: bool
    waste_disposed_properly: bool
    protective_clothing_available: bool
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("inspected_on")
    @classmethod
    def _not_future(cls, v: date) -> date:
        if v > _today():
            raise ValueError("The inspection date cannot be in the future.")
        return v


class HygieneOut(_RecordOut):
    recorded_by_id: int | None = Field(default=None, validation_alias="inspector_id")
    inspected_on: date
    footbath_maintained: bool
    shed_cleaned: bool
    disinfectant_applied: bool
    waste_disposed_properly: bool
    protective_clothing_available: bool
    result: InspectionResult


class VisitorIn(BaseModel):
    visitor_name: str = Field(min_length=2, max_length=120)
    purpose: str = Field(min_length=2, max_length=160)
    entry_time: datetime
    exit_time: datetime | None = None
    vehicle_disinfected: bool
    footwear_changed: bool
    hands_sanitised: bool
    visited_other_farm_48h: bool
    notes: str | None = Field(default=None, max_length=2000)

    _aw = field_validator("entry_time", "exit_time")(_aware)

    @model_validator(mode="after")
    def _times(self):
        if self.exit_time and self.exit_time < self.entry_time:
            raise ValueError("Exit time cannot be before entry time.")
        return self


class VisitorOut(_RecordOut):
    visitor_name: str
    purpose: str
    entry_time: datetime
    exit_time: datetime | None
    vehicle_disinfected: bool
    footwear_changed: bool
    hands_sanitised: bool
    visited_other_farm_48h: bool
    precautions_complete: bool


class EnvironmentIn(BaseModel):
    """A manually entered or simulated environmental reading. Limits are physical
    plausibility bounds for input validation — not operational thresholds."""

    observed_at: datetime
    shed_label: str | None = Field(default=None, max_length=60)
    temperature_c: float | None = Field(default=None, ge=-10, le=60)
    relative_humidity_pct: float | None = Field(default=None, ge=0, le=100)
    ammonia_ppm: float | None = Field(default=None, ge=0, le=500)
    source: ObservationSource = ObservationSource.MANUAL
    device_id: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=2000)

    _aw = field_validator("observed_at")(_aware)

    @model_validator(mode="after")
    def _has_value(self):
        if self.temperature_c is None and self.relative_humidity_pct is None and self.ammonia_ppm is None:
            raise ValueError("Provide at least one reading (temperature, humidity or ammonia).")
        if self.observed_at > datetime.now(timezone.utc).replace(microsecond=0) + _FIVE_MIN:
            raise ValueError("The observation time cannot be in the future.")
        return self


class EnvironmentOut(_RecordOut):
    observed_at: datetime
    shed_label: str | None
    temperature_c: float | None
    relative_humidity_pct: float | None
    ammonia_ppm: float | None
    source: ObservationSource
    device_id: str | None


class TelemetryIngest(BaseModel):
    """Batch ingestion contract (also the proposed future device contract)."""

    farm_id: int
    readings: list[EnvironmentIn] = Field(min_length=1, max_length=500)


class SimulateRequest(BaseModel):
    hours: int = Field(default=24, ge=1, le=24 * 14)
    interval_minutes: int = Field(default=60, ge=10, le=720)
    include_excursion: bool = False
    seed: int | None = None


# ------------------------------------------------------- assessments & alerts
class TriggeredRule(BaseModel):
    code: str
    title: str
    severity: AlertSeverity
    weight: int
    detail: str


class AssessmentOut(ORM):
    id: int
    farm_id: int
    assessed_at: datetime
    rules_version: str
    status: RiskStatus
    score: int | None
    triggered_rules: list[TriggeredRule]
    observations: list[str]
    recommendations: list[str]
    data_quality_warnings: list[str]
    limitations: list[str]


class AssessmentRunResult(BaseModel):
    assessment: AssessmentOut
    alerts_created: int
    alerts_updated: int


class AlertOut(ORM):
    id: int
    farm_id: int
    farm_name: str
    rule_code: str
    severity: AlertSeverity
    status: AlertStatus
    title: str
    message: str
    first_seen_at: datetime
    last_seen_at: datetime
    occurrence_count: int
    last_assessment_id: int | None
    acknowledged_at: datetime | None
    acknowledged_by_id: int | None
    resolved_at: datetime | None
    resolved_by_id: int | None
    resolution_note: str | None


class AlertResolve(BaseModel):
    resolution_note: str = Field(min_length=3, max_length=2000)


# ----------------------------------------------------------------- screening
class ScreeningRequest(BaseModel):
    species: str = Field(min_length=1, max_length=40)
    body_temperature_c: float = Field(ge=30, le=45)
    heart_rate_bpm: int = Field(ge=20, le=300)
    respiratory_rate_bpm: int = Field(ge=4, le=150)
    activity_level: int = Field(ge=0, le=100, description="0 = immobile, 100 = fully active")
    symptoms: list[str] = Field(default_factory=list, max_length=40)
    farm_id: int | None = None
    animal_identifier: str | None = Field(default=None, max_length=60)

    @field_validator("symptoms")
    @classmethod
    def _unique(cls, v: list[str]) -> list[str]:
        return list(dict.fromkeys(v))


class ScoredLabel(BaseModel):
    label: str
    model_score: float
    observed_for_species_in_training: bool


class ScreeningOut(BaseModel):
    id: int
    created_at: datetime
    farm_id: int | None
    species: str
    animal_identifier: str | None
    inputs: dict[str, Any]
    model_version: str
    top: ScoredLabel
    alternatives: list[ScoredLabel]
    warnings: list[str]
    score_note: str
    recommendation: str
    limitations: list[str]


# ------------------------------------------------- official external data
URL_PATTERN = r"^https?://[^\s/$.?#].[^\s]*$"


def _not_future(v: date | None) -> date | None:
    if v is not None and v > _today():
        raise ValueError("The date cannot be in the future.")
    return v


class OutbreakIn(BaseModel):
    disease: str = Field(min_length=2, max_length=160)
    species: NoticeSpecies
    state: str = Field(default="Karnataka", min_length=2, max_length=80)
    district: str = Field(min_length=2, max_length=80)
    taluk: str | None = Field(default=None, max_length=80)
    reported_on: date
    status: OutbreakStatus = OutbreakStatus.ACTIVE
    closed_on: date | None = None
    source_name: str = Field(min_length=3, max_length=200, description="Publishing authority, e.g. a government department")
    source_url: str = Field(max_length=500, pattern=URL_PATTERN, description="Link to the official notice")
    reference: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=2000)

    _s = field_validator("disease", "state", "district", "taluk", "source_name", mode="before")(_strip)
    _nf = field_validator("reported_on", "closed_on")(_not_future)

    @model_validator(mode="after")
    def _closure(self):
        if self.status == OutbreakStatus.CLOSED and self.closed_on is None:
            raise ValueError("A closed notice needs the closing date.")
        if self.closed_on and self.closed_on < self.reported_on:
            raise ValueError("The closing date cannot be before the reported date.")
        if self.status == OutbreakStatus.ACTIVE and self.closed_on is not None:
            raise ValueError("An active notice cannot have a closing date.")
        return self


class OutbreakOut(ORM):
    id: int
    disease: str
    species: NoticeSpecies
    state: str
    district: str
    taluk: str | None
    reported_on: date
    status: OutbreakStatus
    closed_on: date | None
    source_name: str
    source_url: str
    reference: str | None
    notes: str | None
    created_by_id: int | None
    created_at: datetime
    updated_at: datetime


class LivestockStatIn(BaseModel):
    state: str = Field(min_length=2, max_length=80)
    district: str = Field(min_length=2, max_length=80)
    species: Species
    population: int = Field(ge=0, le=1_000_000_000)
    reference_year: int = Field(ge=1950, le=2100)
    source_name: str = Field(min_length=3, max_length=200)
    source_url: str = Field(max_length=500, pattern=URL_PATTERN)
    notes: str | None = Field(default=None, max_length=2000)

    _s = field_validator("state", "district", "source_name", mode="before")(_strip)

    @field_validator("reference_year")
    @classmethod
    def _year(cls, v: int) -> int:
        if v > _today().year:
            raise ValueError("The reference year cannot be in the future.")
        return v


class LivestockStatOut(ORM):
    id: int
    state: str
    district: str
    species: Species
    population: int
    reference_year: int
    source_name: str
    source_url: str
    import_method: str
    notes: str | None
    created_at: datetime


class DataGovImport(BaseModel):
    resource_id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9-]+$")
    state_field: str = Field(min_length=1, max_length=100)
    district_field: str = Field(min_length=1, max_length=100)
    pig_field: str | None = Field(default=None, max_length=100)
    poultry_field: str | None = Field(default=None, max_length=100)
    state_filter: str | None = Field(default=None, max_length=80)
    reference_year: int = Field(ge=1950, le=2100)
    source_name: str = Field(min_length=3, max_length=200)

    @model_validator(mode="after")
    def _one_species(self):
        if not self.pig_field and not self.poultry_field:
            raise ValueError("Choose at least one of the pig or poultry fields.")
        return self


class ImportResult(BaseModel):
    created: int
    updated: int
    skipped: list[str]
