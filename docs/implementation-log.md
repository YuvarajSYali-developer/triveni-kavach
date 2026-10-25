# Implementation log

Status key: **Implemented** = code exists · **Tested** = covered by automated tests or the
recorded end-to-end run (see `testing-log.md`) · **Deferred** = planned but not done ·
**Out of scope** = deliberately not attempted.

All entries below were carried out in one working session on **2026-10-25**. No earlier
dates are claimed for this repository; the SIH material dates from the original
hackathon work and is reference material only.

## Milestones

| # | Milestone | Status |
|---|---|---|
| 0 | Source audit and architecture docs | Implemented — `source-audit.md`, `architecture.md`, `database-schema.md`, `iot-concept.md`, `model-limitations.md` |
| 1 | Foundation: React/TS/Vite/Tailwind frontend, FastAPI backend, `/api/v1`, health check, CORS, error handling, env config, tests | Implemented, Tested |
| 2 | Database, migrations, authentication, RBAC, farm and record CRUD with forms | Implemented, Tested |
| 3 | Role-specific dashboards, farm detail, charts, date filters | Implemented, Tested (API + e2e) |
| 4 | Rule-based biosecurity engine, alerts lifecycle with deduplication | Implemented, Tested |
| 5 | Animal-health screening integration of the reused model | Implemented, Tested |
| 6 | Simulated telemetry, ingestion API, IoT concept page/docs | Implemented, Tested |
| 7 | End-to-end integration, security review items, testing, docs | Implemented, Tested (with the gaps listed below) |

## Decisions and assumptions

1. **Location of the new project**: the working repository already contains CivilInc, so
   Triveni Kavach was created in `triveni-kavach/` rather than overwriting CivilInc's
   `frontend/` and `backend/`. The required files exist relative to that folder.
2. **References** were not in the workspace; they were found as the owner's public GitHub
   repositories and cloned read-only outside the repository. The IoT image and SIH
   presentation were not found anywhere (documented).
3. **Model reuse**: artifacts load and reproduce the recorded hold-out accuracy exactly,
   so they are reused unchanged. scikit-learn pinned to **1.7.1** (the version that
   pickled the LabelEncoder), xgboost 3.1.3. Original "Unknown Infection"/Healthy-override
   heuristics removed; raw scores returned with warnings.
4. **Screening species**: only Pig enabled (the only farm species in the model). Poultry
   always rejected with an explanation.
5. **Auth**: JWT bearer tokens (PyJWT, HS256, 60 min) + bcrypt. `python-jose` was
   installed initially and replaced by PyJWT (fewer dependencies, maintained). Role is read
   from the DB per request. No self-registration.
6. **Access errors return 404** for resources outside a user's scope, 403 for
   role-forbidden actions on visible resources.
7. **Assessments run on demand** (button / API), never on dashboard reads, so refreshes
   cannot create alerts.
8. **Mortality nil reports** (count 0) are allowed so "no deaths" differs from "no data".
9. **Environmental thresholds** (10–32 °C, 40–80 % RH, ≤ 25 ppm NH₃) are generic placeholders.
10. **No map**: farms store taluk/village only; inventing coordinates was rejected.
11. **SQLite default**, PostgreSQL supported; portable naming convention, non-native enums,
    partial unique index valid on both.
12. **Demo data** is fictional (names prefixed "Demo", e-mails on the reserved `.example`
    domain, `is_demo` flag) and uses Haveri taluk names only as labels. Passwords come from
    `DEMO_PASSWORD` or are randomly generated.
13. **Chart colours** use a categorical palette validated for colour-vision deficiency;
    each chart has a table view.

## Work log (2026-10-25)

| Area | Work | Status |
|---|---|---|
| Audit | Inspected 3 reference repos; loaded artifacts; reproduced metrics; analysed generator shortcuts, species leakage, imbalance; derived `model_metadata.json` | Done |
| Backend core | Settings, security, DB session, UTC datetime type, error handlers, audit log | Implemented, Tested |
| Models & migration | 11 tables, constraints, indexes, partial unique index; Alembic `0001_initial_schema`; up/down/check verified on SQLite; DDL and tests on PostgreSQL 16 | Implemented, Tested |
| Auth & users | login, `/me`, admin user management, password policy | Implemented, Tested |
| Farms | CRUD, scoping, assignment rules, search/filters, cascade delete | Implemented, Tested |
| Records | generic router for 5 record types with filters, permissions, derived fields | Implemented, Tested |
| Rule engine | 10 rules, insufficient-data logic, recommendations, limitations | Implemented, Tested |
| Alerts | create/update dedup, acknowledge, resolve with note, recurrence | Implemented, Tested |
| Screening | model service, status, predict, history, 503 when unavailable | Implemented, Tested |
| Telemetry | manual form, ingest API, simulator, source labelling | Implemented, Tested |
| Dashboard API | role-scoped aggregates with date range | Implemented, Tested |
| Scripts | `seed_demo.py`, `create_admin.py`, `derive_model_metadata.py` | Implemented, run manually |
| Frontend | layout, auth, dashboards, farms, farm detail tabs, record forms, alerts, screening, IoT, users, about | Implemented; typecheck/lint/build pass; Vitest + e2e |
| QA fixes | UTC timestamps, sign-out redirect leak, chart rendering, threshold wording, score precision (see testing log) | Fixed, re-tested |
| Docs | README, 7 docs files | Written |

## Deferred (not implemented)

* Running and verifying the setup on Windows.
* httpOnly-cookie sessions with CSRF protection, refresh tokens, login rate limiting,
  account lockout, password reset.
* Per-device credentials, idempotency and enabling the `device` source (no hardware).
* Configurable rule thresholds via the UI / database (currently in code), species- and
  age-specific environmental ranges, expert review of all rules.
* Notifications (SMS / e-mail / push) for new alerts.
* Report export (PDF/CSV), Kannada localisation, offline/PWA mode.
* Map view (needs consented, verified farm coordinates).
* Recalibrated or retrained screening model on real, labelled data; poultry support.
* CI pipeline running backend, frontend and e2e checks.
* Pagination of very large dashboard aggregates (currently computed in Python).

## Out of scope
Physical IoT hardware, MQTT broker deployment, device drivers, paid cloud services.
