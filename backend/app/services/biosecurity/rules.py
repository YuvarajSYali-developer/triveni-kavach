"""Explainable, rule-based farm biosecurity assessment.

IMPORTANT: every threshold and weight below is a *provisional engineering choice*
made for this internship prototype. None of them is an established veterinary
standard, and none has been validated as a predictor of disease. They must be
reviewed by the Department's veterinary experts before any operational use.
The resulting score summarises recorded biosecurity gaps; it is NOT a probability
of disease.

The engine is pure: it takes a ``FarmSnapshot`` and returns an ``AssessmentResult``.
Database access lives in ``service.py``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

RULES_VERSION = "2026.10-provisional"


@dataclass(frozen=True)
class EnvThreshold:
    low: float | None
    high: float | None
    unit: str
    label: str


@dataclass(frozen=True)
class RuleConfig:
    vaccination_lookback_days: int = 365
    missed_vaccination_lookback_days: int = 180
    mortality_window_days: int = 7
    mortality_baseline_days: int = 28
    mortality_min_recent_deaths: int = 3
    mortality_spike_ratio: float = 2.0
    mortality_rate_pct_threshold: float = 1.0  # % of population within the window
    hygiene_lookback_days: int = 90
    hygiene_stale_days: int = 30
    visitor_lookback_days: int = 30
    env_lookback_days: int = 7
    mortality_reporting_lookback_days: int = 90
    # Weights (score contribution) per rule; total score is capped at 100.
    weights: dict[str, int] = field(
        default_factory=lambda: {
            "VACCINATION_OVERDUE": 25,
            "VACCINATION_MISSED": 20,
            "NO_VACCINATION_RECORDS": 15,
            "MORTALITY_SPIKE": 30,
            "MORTALITY_RATE_HIGH": 30,
            "HYGIENE_FAILED": 20,
            "HYGIENE_STALE": 10,
            "VISITOR_PRECAUTIONS_INCOMPLETE": 10,
            "VISITOR_CROSS_FARM_CONTACT": 10,
            "ENVIRONMENT_OUT_OF_RANGE": 10,
        }
    )
    # Provisional operating ranges shared by pig and poultry housing. Real ranges
    # depend on species, age and production stage and require expert review.
    env_thresholds: dict[str, EnvThreshold] = field(
        default_factory=lambda: {
            "temperature_c": EnvThreshold(10.0, 32.0, "°C", "Temperature"),
            "relative_humidity_pct": EnvThreshold(40.0, 80.0, "%", "Relative humidity"),
            "ammonia_ppm": EnvThreshold(None, 25.0, "ppm", "Ammonia"),
        }
    )
    # Score bands (only used when sufficient data exists).
    moderate_from: int = 25
    high_from: int = 50


DEFAULT_CONFIG = RuleConfig()


# --------------------------------------------------------------- input snapshot
@dataclass(frozen=True)
class Vaccination:
    status: str  # scheduled | completed | missed
    vaccine_name: str
    due_on: date | None
    administered_on: date | None


@dataclass(frozen=True)
class Mortality:
    observed_on: date
    count: int


@dataclass(frozen=True)
class Hygiene:
    inspected_on: date
    result: str  # pass | fail
    failed_items: tuple[str, ...] = ()


@dataclass(frozen=True)
class Visit:
    entry_time: datetime
    visitor_name: str
    precautions_complete: bool
    visited_other_farm_48h: bool


@dataclass(frozen=True)
class EnvReading:
    observed_at: datetime
    source: str
    temperature_c: float | None = None
    relative_humidity_pct: float | None = None
    ammonia_ppm: float | None = None


@dataclass(frozen=True)
class FarmSnapshot:
    farm_id: int
    population: int
    vaccinations: list[Vaccination] = field(default_factory=list)
    mortality: list[Mortality] = field(default_factory=list)
    hygiene: list[Hygiene] = field(default_factory=list)
    visits: list[Visit] = field(default_factory=list)
    environment: list[EnvReading] = field(default_factory=list)


# ------------------------------------------------------------------ the result
@dataclass
class Triggered:
    code: str
    title: str
    severity: str  # low | medium | high
    weight: int
    detail: str


@dataclass
class AssessmentResult:
    status: str  # low | moderate | high | insufficient_data
    score: int | None
    triggered: list[Triggered]
    observations: list[str]
    recommendations: list[str]
    data_quality_warnings: list[str]
    limitations: list[str]
    rules_version: str = RULES_VERSION


LIMITATIONS = [
    "Rule thresholds and weights are provisional engineering choices for a prototype and "
    "have not been validated by veterinary experts.",
    "The score summarises gaps in recorded biosecurity practice. It is not a probability "
    "of disease and must not be used as a diagnosis.",
    "The assessment only reflects records entered into this system; unrecorded events are invisible to it.",
]

RECOMMENDATIONS = {
    "VACCINATION_OVERDUE": "Confirm the status of overdue vaccinations with the assigned veterinarian and update the record once administered.",
    "VACCINATION_MISSED": "Ask the assigned veterinarian whether a catch-up vaccination is required for the missed schedule.",
    "NO_VACCINATION_RECORDS": "Record the farm's vaccination history so schedules can be tracked.",
    "MORTALITY_SPIKE": "Report the increase in deaths to the assigned veterinarian promptly for an on-farm assessment; avoid moving animals until advised.",
    "MORTALITY_RATE_HIGH": "Arrange a veterinary assessment of the recorded deaths; follow the veterinarian's guidance on sampling and carcass disposal.",
    "HYGIENE_FAILED": "Correct the failed hygiene checklist items and schedule a follow-up inspection.",
    "HYGIENE_STALE": "Carry out and record a hygiene and disinfection inspection.",
    "VISITOR_PRECAUTIONS_INCOMPLETE": "Ensure every visitor completes vehicle disinfection, footwear change and hand sanitation before entry.",
    "VISITOR_CROSS_FARM_CONTACT": "Restrict entry of visitors who were on another livestock farm within 48 hours, or enforce full precautions.",
    "ENVIRONMENT_OUT_OF_RANGE": "Check shed ventilation and conditions; confirm readings with a calibrated instrument before acting on them.",
}


def _days_ago(today: date, d: date) -> int:
    return (today - d).days


def evaluate(snapshot: FarmSnapshot, now: datetime | None = None, config: RuleConfig = DEFAULT_CONFIG) -> AssessmentResult:
    now = now or datetime.now(timezone.utc)
    today = now.date()
    w = config.weights
    triggered: list[Triggered] = []
    observations: list[str] = []
    warnings: list[str] = []

    def hit(code: str, title: str, severity: str, detail: str) -> None:
        triggered.append(Triggered(code, title, severity, w[code], detail))

    # ---------------------------------------------------------- vaccinations
    vax_recent = [
        v
        for v in snapshot.vaccinations
        if (v.administered_on or v.due_on) and _days_ago(today, v.administered_on or v.due_on) <= config.vaccination_lookback_days
    ]
    has_vax_data = bool(vax_recent)
    if not snapshot.vaccinations:
        hit(
            "NO_VACCINATION_RECORDS",
            "No vaccination records",
            "medium",
            "No vaccination records have been entered for this farm.",
        )
        warnings.append("No vaccination records exist; vaccination status is unknown.")
    elif not has_vax_data:
        warnings.append(f"No vaccination activity recorded in the last {config.vaccination_lookback_days} days.")

    overdue = [v for v in snapshot.vaccinations if v.status == "scheduled" and v.due_on and v.due_on < today]
    if overdue:
        names = ", ".join(sorted({v.vaccine_name for v in overdue}))
        oldest = max(_days_ago(today, v.due_on) for v in overdue if v.due_on)
        hit(
            "VACCINATION_OVERDUE",
            "Scheduled vaccination overdue",
            "high",
            f"{len(overdue)} scheduled vaccination(s) past due ({names}); oldest is {oldest} day(s) overdue.",
        )
    missed = [
        v
        for v in snapshot.vaccinations
        if v.status == "missed" and v.due_on and _days_ago(today, v.due_on) <= config.missed_vaccination_lookback_days
    ]
    if missed:
        hit(
            "VACCINATION_MISSED",
            "Vaccination recorded as missed",
            "medium",
            f"{len(missed)} vaccination(s) marked missed in the last {config.missed_vaccination_lookback_days} days.",
        )
    completed = [v for v in vax_recent if v.status == "completed"]
    if completed:
        last = max(v.administered_on for v in completed if v.administered_on)
        observations.append(f"Most recent completed vaccination: {last.isoformat()}.")

    # -------------------------------------------------------------- mortality
    mort_reports = [m for m in snapshot.mortality if _days_ago(today, m.observed_on) <= config.mortality_reporting_lookback_days]
    has_mortality_data = bool(mort_reports)
    if not has_mortality_data:
        warnings.append(
            f"No mortality reports (including nil reports) in the last {config.mortality_reporting_lookback_days} days; "
            "a lack of records does not mean a lack of deaths."
        )
    recent = sum(m.count for m in snapshot.mortality if 0 <= _days_ago(today, m.observed_on) < config.mortality_window_days)
    baseline_records = [
        m
        for m in snapshot.mortality
        if config.mortality_window_days
        <= _days_ago(today, m.observed_on)
        < config.mortality_window_days + config.mortality_baseline_days
    ]
    if has_mortality_data:
        observations.append(f"Deaths recorded in the last {config.mortality_window_days} days: {recent}.")
    if baseline_records:
        baseline_per_window = (
            sum(m.count for m in baseline_records) * config.mortality_window_days / config.mortality_baseline_days
        )
        if recent >= config.mortality_min_recent_deaths and recent >= config.mortality_spike_ratio * max(
            baseline_per_window, 0.5
        ):
            hit(
                "MORTALITY_SPIKE",
                "Increase in recorded mortality",
                "high",
                f"{recent} deaths in the last {config.mortality_window_days} days versus an average of "
                f"{baseline_per_window:.1f} per {config.mortality_window_days} days over the preceding {config.mortality_baseline_days} days.",
            )
    elif has_mortality_data:
        warnings.append("No baseline mortality records in the preceding weeks; changes in mortality cannot be assessed.")
    if snapshot.population > 0 and recent >= config.mortality_min_recent_deaths:
        rate = 100.0 * recent / snapshot.population
        if rate >= config.mortality_rate_pct_threshold:
            hit(
                "MORTALITY_RATE_HIGH",
                "High recorded mortality relative to population",
                "high",
                f"{recent} deaths are {rate:.2f}% of the recorded population of {snapshot.population} "
                f"(provisional threshold {config.mortality_rate_pct_threshold}%).",
            )

    # ---------------------------------------------------------------- hygiene
    hyg = sorted(
        (h for h in snapshot.hygiene if _days_ago(today, h.inspected_on) <= config.hygiene_lookback_days),
        key=lambda h: h.inspected_on,
        reverse=True,
    )
    has_hygiene_data = bool(hyg)
    if hyg:
        latest = hyg[0]
        observations.append(f"Latest hygiene inspection on {latest.inspected_on.isoformat()}: {latest.result}.")
        if latest.result == "fail":
            items = ", ".join(latest.failed_items) or "one or more items"
            hit(
                "HYGIENE_FAILED",
                "Latest hygiene inspection failed",
                "medium",
                f"Inspection on {latest.inspected_on.isoformat()} failed: {items}.",
            )
        if _days_ago(today, latest.inspected_on) > config.hygiene_stale_days:
            hit(
                "HYGIENE_STALE",
                "Hygiene inspection overdue",
                "low",
                f"Last inspection was {_days_ago(today, latest.inspected_on)} days ago (provisional interval {config.hygiene_stale_days} days).",
            )
    else:
        hit(
            "HYGIENE_STALE",
            "Hygiene inspection overdue",
            "low",
            f"No hygiene inspection recorded in the last {config.hygiene_lookback_days} days.",
        )
        warnings.append(f"No hygiene inspection in the last {config.hygiene_lookback_days} days.")

    # --------------------------------------------------------------- visitors
    cutoff = now - timedelta(days=config.visitor_lookback_days)
    visits = [v for v in snapshot.visits if v.entry_time >= cutoff]
    if visits:
        observations.append(f"Visitor entries in the last {config.visitor_lookback_days} days: {len(visits)}.")
        incomplete = [v for v in visits if not v.precautions_complete]
        if incomplete:
            hit(
                "VISITOR_PRECAUTIONS_INCOMPLETE",
                "Visitor precautions incomplete",
                "medium",
                f"{len(incomplete)} of {len(visits)} visitor entries did not complete all entry precautions.",
            )
        cross = [v for v in visits if v.visited_other_farm_48h]
        if cross:
            hit(
                "VISITOR_CROSS_FARM_CONTACT",
                "Visitors with recent contact with other farms",
                "medium",
                f"{len(cross)} visitor(s) reported visiting another livestock farm within the previous 48 hours.",
            )

    # ------------------------------------------------------------ environment
    env_cutoff = now - timedelta(days=config.env_lookback_days)
    env = [e for e in snapshot.environment if e.observed_at >= env_cutoff]
    if not env:
        warnings.append(f"No environmental readings in the last {config.env_lookback_days} days.")
    else:
        sources = sorted({e.source for e in env})
        observations.append(
            f"Environmental readings in the last {config.env_lookback_days} days: {len(env)} (sources: {', '.join(sources)})."
        )
        if "simulated" in sources:
            warnings.append("Some environmental readings are SIMULATED demonstration values, not measurements.")
        breaches: list[str] = []
        for attr, th in config.env_thresholds.items():
            vals = [(getattr(e, attr), e.source) for e in env if getattr(e, attr) is not None]
            out = [(v, s) for v, s in vals if (th.low is not None and v < th.low) or (th.high is not None and v > th.high)]
            if out:
                srcs = ", ".join(sorted({s for _, s in out}))
                rng = (
                    f"outside {th.low}–{th.high} {th.unit}"
                    if th.low is not None and th.high is not None
                    else f"above {th.high} {th.unit}"
                    if th.high is not None
                    else f"below {th.low} {th.unit}"
                )
                breaches.append(f"{th.label}: {len(out)} of {len(vals)} readings {rng} (source: {srcs})")
        if breaches:
            hit("ENVIRONMENT_OUT_OF_RANGE", "Environmental readings outside configured range", "low", "; ".join(breaches) + ".")

    # ------------------------------------------------------------- summarise
    if snapshot.population <= 0:
        warnings.append("Farm has no recorded animal population; mortality rates cannot be calculated.")

    core_available = sum([has_vax_data, has_mortality_data, has_hygiene_data])
    insufficient = core_available < 2 or snapshot.population <= 0
    raw = sum(t.weight for t in triggered)
    if insufficient:
        status, score = "insufficient_data", None
        warnings.insert(
            0,
            "Insufficient data for an overall rating: at least two of vaccination, mortality and "
            "hygiene records (and a recorded population) are required. Triggered rules are still listed.",
        )
    else:
        score = min(raw, 100)
        status = "high" if score >= config.high_from else "moderate" if score >= config.moderate_from else "low"

    recs = [RECOMMENDATIONS[t.code] for t in triggered]
    if any(t.code.startswith("MORTALITY") for t in triggered):
        recs.insert(
            0,
            "Concerning mortality was recorded: contact the assigned veterinarian or the local veterinary "
            "hospital for an assessment. This system does not diagnose disease.",
        )
    if insufficient:
        recs.append(
            "Enter the missing vaccination, mortality (including nil reports) and hygiene records, then re-run the assessment."
        )
    if not recs:
        recs.append("No rule was triggered. Continue routine record keeping; this does not certify the farm as disease-free.")

    return AssessmentResult(
        status=status,
        score=score,
        triggered=triggered,
        observations=observations,
        recommendations=list(dict.fromkeys(recs)),
        data_quality_warnings=warnings,
        limitations=list(LIMITATIONS),
    )
