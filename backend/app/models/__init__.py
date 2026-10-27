"""ORM models for Triveni Kavach.

All farm-scoped records reference ``farms.id`` with ``ON DELETE CASCADE`` so removing a
farm (administrator only) removes its records. Users are never hard-deleted while
records reference them (``ON DELETE SET NULL`` / ``RESTRICT``)."""

from __future__ import annotations

import enum
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UTCDateTime, utcnow


def _enum(e: type[enum.Enum], name: str) -> Enum:
    # Store enum *values* as plain strings (portable, readable in SQL).
    return Enum(e, name=name, native_enum=False, values_callable=lambda x: [m.value for m in x], length=32)


class Role(str, enum.Enum):
    ADMIN = "admin"
    VETERINARIAN = "veterinarian"
    FARMER = "farmer"


class FarmType(str, enum.Enum):
    PIG = "pig"
    POULTRY = "poultry"
    MIXED = "mixed"


class Species(str, enum.Enum):
    PIG = "pig"
    POULTRY = "poultry"


class VaccinationStatus(str, enum.Enum):
    SCHEDULED = "scheduled"
    COMPLETED = "completed"
    MISSED = "missed"


class InspectionResult(str, enum.Enum):
    PASS = "pass"
    FAIL = "fail"


class ObservationSource(str, enum.Enum):
    MANUAL = "manual"
    SIMULATED = "simulated"
    DEVICE = "device"  # reserved for a future, tested device integration


class RiskStatus(str, enum.Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    INSUFFICIENT_DATA = "insufficient_data"


class AlertSeverity(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class AlertStatus(str, enum.Enum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[Role] = mapped_column(_enum(Role, "role"))
    hashed_password: Mapped[str] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class Farm(TimestampMixin, Base):
    __tablename__ = "farms"
    __table_args__ = (
        CheckConstraint("pig_count >= 0", name="pig_count_nonneg"),
        CheckConstraint("poultry_count >= 0", name="poultry_count_nonneg"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), index=True)
    farm_type: Mapped[FarmType] = mapped_column(_enum(FarmType, "farm_type"), index=True)
    state: Mapped[str] = mapped_column(String(80), default="Karnataka")
    district: Mapped[str] = mapped_column(String(80), index=True)
    taluk: Mapped[str] = mapped_column(String(80), index=True)
    village: Mapped[str | None] = mapped_column(String(120))
    pig_count: Mapped[int] = mapped_column(Integer, default=0)
    poultry_count: Mapped[int] = mapped_column(Integer, default=0)
    contact_phone: Mapped[str | None] = mapped_column(String(20))
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    veterinarian_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

    owner: Mapped[User | None] = relationship(foreign_keys=[owner_id], lazy="joined")
    veterinarian: Mapped[User | None] = relationship(foreign_keys=[veterinarian_id], lazy="joined")

    @property
    def total_animals(self) -> int:
        return (self.pig_count or 0) + (self.poultry_count or 0)


class _FarmRecord(TimestampMixin):
    """Columns shared by every farm-scoped record table."""

    id: Mapped[int] = mapped_column(primary_key=True)
    notes: Mapped[str | None] = mapped_column(Text)


class VaccinationRecord(_FarmRecord, Base):
    __tablename__ = "vaccination_records"
    __table_args__ = (
        CheckConstraint("animals_covered >= 0", name="animals_covered_nonneg"),
        CheckConstraint("administered_on IS NOT NULL OR due_on IS NOT NULL", name="has_a_date"),
    )

    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    species: Mapped[Species] = mapped_column(_enum(Species, "species"))
    vaccine_name: Mapped[str] = mapped_column(String(120))
    target_disease: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[VaccinationStatus] = mapped_column(_enum(VaccinationStatus, "vaccination_status"), index=True)
    due_on: Mapped[date | None] = mapped_column(Date, index=True)
    administered_on: Mapped[date | None] = mapped_column(Date)
    animals_covered: Mapped[int] = mapped_column(Integer, default=0)
    batch_number: Mapped[str | None] = mapped_column(String(60))
    recorded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class MortalityRecord(_FarmRecord, Base):
    __tablename__ = "mortality_records"
    __table_args__ = (CheckConstraint("count >= 0", name="count_nonneg"),)

    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    species: Mapped[Species] = mapped_column(_enum(Species, "species"))
    observed_on: Mapped[date] = mapped_column(Date, index=True)
    # count == 0 is an explicit "nil report" (no deaths observed for that day).
    count: Mapped[int] = mapped_column(Integer)
    suspected_cause: Mapped[str | None] = mapped_column(String(160))
    recorded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class HygieneInspection(_FarmRecord, Base):
    __tablename__ = "hygiene_inspections"

    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    inspected_on: Mapped[date] = mapped_column(Date, index=True)
    footbath_maintained: Mapped[bool] = mapped_column(Boolean)
    shed_cleaned: Mapped[bool] = mapped_column(Boolean)
    disinfectant_applied: Mapped[bool] = mapped_column(Boolean)
    waste_disposed_properly: Mapped[bool] = mapped_column(Boolean)
    protective_clothing_available: Mapped[bool] = mapped_column(Boolean)
    # Derived server-side: pass only if every checklist item is satisfied.
    result: Mapped[InspectionResult] = mapped_column(_enum(InspectionResult, "inspection_result"))
    inspector_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class VisitorLog(_FarmRecord, Base):
    __tablename__ = "visitor_logs"

    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    visitor_name: Mapped[str] = mapped_column(String(120))
    purpose: Mapped[str] = mapped_column(String(160))
    entry_time: Mapped[datetime] = mapped_column(UTCDateTime(), index=True)
    exit_time: Mapped[datetime | None] = mapped_column(UTCDateTime())
    vehicle_disinfected: Mapped[bool] = mapped_column(Boolean)
    footwear_changed: Mapped[bool] = mapped_column(Boolean)
    hands_sanitised: Mapped[bool] = mapped_column(Boolean)
    visited_other_farm_48h: Mapped[bool] = mapped_column(Boolean)
    recorded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    @property
    def precautions_complete(self) -> bool:
        return self.vehicle_disinfected and self.footwear_changed and self.hands_sanitised


class EnvironmentalObservation(_FarmRecord, Base):
    __tablename__ = "environmental_observations"
    __table_args__ = (Index("ix_env_farm_time", "farm_id", "observed_at"),)

    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    observed_at: Mapped[datetime] = mapped_column(UTCDateTime())
    shed_label: Mapped[str | None] = mapped_column(String(60))
    temperature_c: Mapped[float | None] = mapped_column(Float)
    relative_humidity_pct: Mapped[float | None] = mapped_column(Float)
    ammonia_ppm: Mapped[float | None] = mapped_column(Float)
    source: Mapped[ObservationSource] = mapped_column(_enum(ObservationSource, "observation_source"), index=True)
    device_id: Mapped[str | None] = mapped_column(String(80))
    recorded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class BiosecurityAssessment(Base):
    __tablename__ = "biosecurity_assessments"

    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    assessed_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, index=True)
    rules_version: Mapped[str] = mapped_column(String(40))
    status: Mapped[RiskStatus] = mapped_column(_enum(RiskStatus, "risk_status"))
    score: Mapped[int | None] = mapped_column(Integer)
    triggered_rules: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    observations: Mapped[list[str]] = mapped_column(JSON, default=list)
    recommendations: Mapped[list[str]] = mapped_column(JSON, default=list)
    data_quality_warnings: Mapped[list[str]] = mapped_column(JSON, default=list)
    limitations: Mapped[list[str]] = mapped_column(JSON, default=list)
    triggered_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class Alert(TimestampMixin, Base):
    __tablename__ = "alerts"
    __table_args__ = (
        # At most one non-resolved alert per farm+rule (partial unique index; works on
        # SQLite and PostgreSQL). Guards deduplication against concurrent requests.
        Index(
            "uq_alerts_active_dedup_key",
            "dedup_key",
            unique=True,
            sqlite_where=text("status != 'resolved'"),
            postgresql_where=text("status != 'resolved'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    rule_code: Mapped[str] = mapped_column(String(40))
    dedup_key: Mapped[str] = mapped_column(String(80))  # "<farm_id>:<rule_code>"
    severity: Mapped[AlertSeverity] = mapped_column(_enum(AlertSeverity, "alert_severity"), index=True)
    status: Mapped[AlertStatus] = mapped_column(_enum(AlertStatus, "alert_status"), default=AlertStatus.OPEN, index=True)
    title: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(Text)
    first_seen_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    occurrence_count: Mapped[int] = mapped_column(Integer, default=1)
    last_assessment_id: Mapped[int | None] = mapped_column(ForeignKey("biosecurity_assessments.id", ondelete="SET NULL"))
    acknowledged_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    acknowledged_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    resolved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    resolution_note: Mapped[str | None] = mapped_column(Text)

    farm: Mapped[Farm] = relationship(lazy="joined")


class AnimalScreening(Base):
    __tablename__ = "animal_screenings"

    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int | None] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    requested_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, index=True)
    species: Mapped[str] = mapped_column(String(40))
    animal_identifier: Mapped[str | None] = mapped_column(String(60))
    inputs: Mapped[dict[str, Any]] = mapped_column(JSON)
    model_version: Mapped[str] = mapped_column(String(80))
    top_label: Mapped[str] = mapped_column(String(120))
    top_score: Mapped[float] = mapped_column(Float)
    top_observed_for_species: Mapped[bool] = mapped_column(Boolean)
    alternatives: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    warnings: Mapped[list[str]] = mapped_column(JSON)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, index=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(60))
    entity_type: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    farm_id: Mapped[int | None] = mapped_column(ForeignKey("farms.id", ondelete="SET NULL"), index=True)
    summary: Mapped[str] = mapped_column(String(255))

    actor: Mapped[User | None] = relationship(lazy="joined")


class OutbreakStatus(str, enum.Enum):
    ACTIVE = "active"
    CLOSED = "closed"


class NoticeSpecies(str, enum.Enum):
    PIG = "pig"
    POULTRY = "poultry"
    BOTH = "both"


class OutbreakNotice(TimestampMixin, Base):
    """An officially reported disease outbreak, entered from an official source.

    The source name and URL are mandatory so every notice can be traced to the
    publishing authority. Nothing is generated or inferred by the system."""

    __tablename__ = "outbreak_notices"

    id: Mapped[int] = mapped_column(primary_key=True)
    disease: Mapped[str] = mapped_column(String(160))
    species: Mapped[NoticeSpecies] = mapped_column(_enum(NoticeSpecies, "notice_species"))
    state: Mapped[str] = mapped_column(String(80), default="Karnataka")
    district: Mapped[str] = mapped_column(String(80), index=True)
    taluk: Mapped[str | None] = mapped_column(String(80))
    reported_on: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[OutbreakStatus] = mapped_column(_enum(OutbreakStatus, "outbreak_status"), index=True)
    closed_on: Mapped[date | None] = mapped_column(Date)
    source_name: Mapped[str] = mapped_column(String(200))
    source_url: Mapped[str] = mapped_column(String(500))
    reference: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class LivestockStatistic(TimestampMixin, Base):
    """Official population statistics (e.g. Livestock Census) with provenance."""

    __tablename__ = "livestock_statistics"
    __table_args__ = (
        CheckConstraint("population >= 0", name="population_nonneg"),
        Index("uq_livestock_stat_key", "state", "district", "species", "reference_year", "source_name", unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    state: Mapped[str] = mapped_column(String(80))
    district: Mapped[str] = mapped_column(String(80), index=True)
    species: Mapped[Species] = mapped_column(_enum(Species, "species"))
    population: Mapped[int] = mapped_column(Integer)
    reference_year: Mapped[int] = mapped_column(Integer)
    source_name: Mapped[str] = mapped_column(String(200))
    source_url: Mapped[str] = mapped_column(String(500))
    import_method: Mapped[str] = mapped_column(String(20), default="manual")  # manual | csv | data.gov.in
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class SymptomCheck(Base):
    """A saved symptom-checker run. When a veterinarian later records the confirmed
    diagnosis, the row becomes a real, labelled case for future model training."""

    __tablename__ = "symptom_checks"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, index=True)
    species: Mapped[str] = mapped_column(String(20), index=True)
    age_group: Mapped[str | None] = mapped_column(String(20))
    sudden_deaths: Mapped[bool] = mapped_column(Boolean, default=False)
    signs: Mapped[list[str]] = mapped_column(JSON)
    results: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    kb_version: Mapped[str] = mapped_column(String(40))
    urgent: Mapped[bool] = mapped_column(Boolean, default=False)
    animal_identifier: Mapped[str | None] = mapped_column(String(60))
    farm_id: Mapped[int | None] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    confirmed_diagnosis: Mapped[str | None] = mapped_column(String(160))
    diagnosis_method: Mapped[str | None] = mapped_column(String(20))  # clinical | laboratory | post_mortem
    confirmation_notes: Mapped[str | None] = mapped_column(Text)
    confirmed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    confirmed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


RECORD_MODELS = {
    "vaccinations": VaccinationRecord,
    "mortality": MortalityRecord,
    "hygiene": HygieneInspection,
    "visitors": VisitorLog,
    "environment": EnvironmentalObservation,
}
