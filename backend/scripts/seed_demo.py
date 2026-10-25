"""Seed FICTIONAL demonstration data for local development.

* Every farm and user created here is fictional and flagged ``is_demo=True``.
* Taluk names are real administrative areas of Haveri district, used only as
  location labels; no real farm, person or observation is represented.
* Passwords are never hard-coded. Set DEMO_PASSWORD (min 10 chars, letters and
  digits) or a random password is generated and printed once.

Usage (from the backend directory, after ``alembic upgrade head``):
    python scripts/seed_demo.py               # demo accounts + fictional farm records (local development)
    python scripts/seed_demo.py --reset       # deletes existing demo data first
    python scripts/seed_demo.py --users-only  # demo accounts only, no fictional records (public deployment)

``--users-only`` is the only mode allowed when APP_ENV=production, and there DEMO_PASSWORD
must be set (a generated password would only appear in a hosting log).
"""

from __future__ import annotations

import argparse
import os
import random
import secrets
import string
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, select  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    EnvironmentalObservation,
    Farm,
    FarmType,
    HygieneInspection,
    InspectionResult,
    MortalityRecord,
    ObservationSource,
    Role,
    Species,
    User,
    VaccinationRecord,
    VaccinationStatus,
    VisitorLog,
)
from app.services.biosecurity.service import run_assessment  # noqa: E402

USERS = [
    ("admin@demo.triveni-kavach.example", "Demo Department Administrator", Role.ADMIN),
    ("vet.anand@demo.triveni-kavach.example", "Dr. Demo Vet Anand", Role.VETERINARIAN),
    ("vet.kavya@demo.triveni-kavach.example", "Dr. Demo Vet Kavya", Role.VETERINARIAN),
    ("farmer.ravi@demo.triveni-kavach.example", "Demo Farmer Ravi", Role.FARMER),
    ("farmer.lakshmi@demo.triveni-kavach.example", "Demo Farmer Lakshmi", Role.FARMER),
    ("farmer.manju@demo.triveni-kavach.example", "Demo Farmer Manju", Role.FARMER),
]

# name, type, taluk, pigs, poultry, owner index, vet index, profile
FARMS = [
    ("Demo Sunrise Piggery", FarmType.PIG, "Haveri", 120, 0, 3, 1, "good"),
    ("Demo Green Valley Pig Unit", FarmType.PIG, "Ranebennur", 85, 0, 3, 1, "mortality"),
    ("Demo Hilltop Layers", FarmType.POULTRY, "Hirekerur", 0, 2500, 4, 2, "hygiene"),
    ("Demo Riverside Broilers", FarmType.POULTRY, "Savanur", 0, 1800, 4, 2, "visitors"),
    ("Demo Mixed Livestock Farm", FarmType.MIXED, "Byadgi", 40, 600, 5, 1, "overdue"),
    ("Demo New Registration Farm", FarmType.PIG, "Shiggaon", 30, 0, 5, None, "sparse"),
]


def _password() -> tuple[str, bool]:
    pw = os.environ.get("DEMO_PASSWORD")
    if pw:
        if len(pw) < 10 or not any(c.isdigit() for c in pw) or not any(c.isalpha() for c in pw):
            raise SystemExit("DEMO_PASSWORD must be at least 10 characters and contain letters and digits.")
        return pw, False
    alphabet = string.ascii_letters + string.digits
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(14))
        if any(c.isdigit() for c in pw) and any(c.isalpha() for c in pw):
            return pw, True


def reset(db) -> None:
    db.execute(delete(Farm).where(Farm.is_demo.is_(True)))
    db.execute(delete(User).where(User.is_demo.is_(True)))
    db.commit()


def seed_users(db, password: str) -> list[User]:
    hashed = hash_password(password)
    users = []
    for email, name, role in USERS:
        u = User(email=email, full_name=name, role=role, hashed_password=hashed, is_demo=True)
        db.add(u)
        users.append(u)
    db.flush()
    return users


def seed(db, password: str) -> None:
    rng = random.Random(25006)
    today = date.today()
    now = datetime.now(timezone.utc)
    users = seed_users(db, password)

    for name, ftype, taluk, pigs, birds, owner_i, vet_i, profile in FARMS:
        farm = Farm(
            name=name,
            farm_type=ftype,
            district="Haveri",
            taluk=taluk,
            village=None,
            pig_count=pigs,
            poultry_count=birds,
            owner_id=users[owner_i].id,
            veterinarian_id=users[vet_i].id if vet_i is not None else None,
            is_demo=True,
        )
        db.add(farm)
        db.flush()
        recorder = users[vet_i].id if vet_i is not None else users[owner_i].id
        species = (
            [Species.PIG]
            if ftype == FarmType.PIG
            else [Species.POULTRY]
            if ftype == FarmType.POULTRY
            else [Species.PIG, Species.POULTRY]
        )
        note = "Fictional demonstration record."

        if profile == "sparse":
            db.add(
                VaccinationRecord(
                    farm_id=farm.id,
                    species=Species.PIG,
                    vaccine_name="Demo CSF vaccine",
                    status=VaccinationStatus.SCHEDULED,
                    due_on=today + timedelta(days=12),
                    recorded_by_id=recorder,
                    notes=note,
                )
            )
            continue

        for sp in species:
            vname = "Demo CSF vaccine" if sp == Species.PIG else "Demo Newcastle (RD) vaccine"
            for months_ago in (5, 2):
                d = today - timedelta(days=30 * months_ago + rng.randint(0, 6))
                db.add(
                    VaccinationRecord(
                        farm_id=farm.id,
                        species=sp,
                        vaccine_name=vname,
                        status=VaccinationStatus.COMPLETED,
                        due_on=d,
                        administered_on=d,
                        animals_covered=pigs if sp == Species.PIG else birds,
                        recorded_by_id=recorder,
                        notes=note,
                    )
                )
            due = today + timedelta(days=rng.randint(5, 25))
            if profile == "overdue":
                due = today - timedelta(days=9)
            db.add(
                VaccinationRecord(
                    farm_id=farm.id,
                    species=sp,
                    vaccine_name=vname,
                    status=VaccinationStatus.SCHEDULED,
                    due_on=due,
                    recorded_by_id=recorder,
                    notes=note,
                )
            )

        # Mortality: weekly reports (zero = nil report) over the last 10 weeks.
        for wk in range(10, 0, -1):
            for sp in species:
                base = 0 if sp == Species.PIG else 1
                count = base + (rng.random() < 0.15)
                if profile == "mortality" and wk == 1:
                    count = 7
                db.add(
                    MortalityRecord(
                        farm_id=farm.id,
                        species=sp,
                        observed_on=today - timedelta(days=7 * wk - 4),
                        count=count,
                        recorded_by_id=recorder,
                        notes=note,
                    )
                )

        for days_ago in (75, 40, 12):
            ok = not (profile == "hygiene" and days_ago == 12)
            db.add(
                HygieneInspection(
                    farm_id=farm.id,
                    inspected_on=today - timedelta(days=days_ago),
                    footbath_maintained=ok,
                    shed_cleaned=True,
                    disinfectant_applied=ok,
                    waste_disposed_properly=True,
                    protective_clothing_available=True,
                    result=InspectionResult.PASS if ok else InspectionResult.FAIL,
                    inspector_id=recorder,
                    notes=note,
                )
            )

        purposes = ["Feed delivery", "Veterinary visit", "Equipment repair", "Buyer visit"]
        for i in range(4):
            bad = profile == "visitors" and i < 2
            entry = now - timedelta(days=rng.randint(1, 25), hours=rng.randint(0, 8))
            db.add(
                VisitorLog(
                    farm_id=farm.id,
                    visitor_name=f"Demo visitor {i + 1}",
                    purpose=purposes[i],
                    entry_time=entry,
                    exit_time=entry + timedelta(hours=1),
                    vehicle_disinfected=not bad,
                    footwear_changed=True,
                    hands_sanitised=True,
                    visited_other_farm_48h=bad and i == 0,
                    recorded_by_id=recorder,
                    notes=note,
                )
            )

        for h in range(0, 72, 12):
            db.add(
                EnvironmentalObservation(
                    farm_id=farm.id,
                    observed_at=now - timedelta(hours=h),
                    shed_label="Shed 1",
                    temperature_c=round(rng.uniform(24, 30), 1),
                    relative_humidity_pct=round(rng.uniform(55, 72), 1),
                    ammonia_ppm=None,
                    source=ObservationSource.MANUAL,
                    recorded_by_id=recorder,
                    notes="Fictional manually entered demonstration reading.",
                )
            )
    db.commit()

    admin = users[0]
    for farm in db.scalars(select(Farm).where(Farm.is_demo.is_(True))).unique().all():
        run_assessment(db, farm, admin)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reset", action="store_true", help="delete existing demo data first")
    parser.add_argument("--users-only", action="store_true", help="create demo accounts without fictional records")
    args = parser.parse_args()
    if get_settings().APP_ENV == "production":
        if not args.users_only:
            raise SystemExit("In production only --users-only is allowed (no fictional records).")
        if not os.environ.get("DEMO_PASSWORD"):
            raise SystemExit("Set DEMO_PASSWORD when seeding a production database.")
    db = SessionLocal()
    try:
        if db.scalar(select(User).where(User.is_demo.is_(True))):
            if not args.reset:
                raise SystemExit("Demo data already exists. Re-run with --reset to recreate it.")
            reset(db)
        password, generated = _password()
        if args.users_only:
            seed_users(db, password)
            db.commit()
            print("Created fictional demo accounts (no farm records). Accounts:")
        else:
            seed(db, password)
            print("Seeded fictional demo data. Development accounts:")
        for email, _, role in USERS:
            print(f"  {role.value:<13} {email}")
        if generated:
            print(f"\nGenerated password for all demo accounts (shown once): {password}")
        else:
            print("\nPassword for all demo accounts: the value of DEMO_PASSWORD")
    finally:
        db.close()


if __name__ == "__main__":
    main()
