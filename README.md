# Triveni Kavach — Farm Biosecurity and Animal Health Platform

A web application for recording and reviewing biosecurity practice on pig and poultry farms:
farm registration, vaccination schedules, mortality, hygiene inspections, visitor entry
precautions and environmental readings, with role-based dashboards, an explainable
rule-based biosecurity assessment with alerts, and an exploratory animal-health screening
module built on a reused machine-learning model.

* **Problem statement**: SIH 25006 — Digital Farm Management Portal for Implementing
  Biosecurity Measures in Pig and Poultry Farms.
* **Context**: individual two-month internship with the Department of Animal Husbandry and
  Veterinary Services, Haveri, Karnataka (supervisor: Dr. Shivayogi B. Yali, Deputy Director).
* **Status**: working prototype. It has not been deployed or endorsed by the Department.
  Demo data is fictional. IoT hardware was not built (software simulation only).


| Layer | Stack |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, React Router, Recharts, Lucide, React Hook Form + Zod |
| Backend | Python 3.12, FastAPI, Pydantic 2, SQLAlchemy 2, Alembic, PyJWT, bcrypt |
| Database | SQLite (default, local) · PostgreSQL-compatible (tested on PostgreSQL 16) |
| ML | Reused XGBoost 3.1 classifier + scikit-learn LabelEncoder, pandas, NumPy |
| Tests | pytest, Vitest + Testing Library, Playwright (end-to-end script), ruff, ESLint |

Documentation: [architecture](docs/architecture.md) · [database schema](docs/database-schema.md) ·
[source audit](docs/source-audit.md) · [model limitations](docs/model-limitations.md) ·
[IoT concept](docs/iot-concept.md) · [testing log](docs/testing-log.md) ·
[implementation log](docs/implementation-log.md)

---

## Prerequisites

* **Python 3.12** (3.11 also works; 3.13 is untested with the pinned ML wheels).
  Windows: install from python.org and tick "Add python.exe to PATH"; the `py` launcher is used below.
* **Node.js 20 or 22** with npm.
* Git. No paid service, cloud account, database server or IoT device is required.

## Setup (Windows PowerShell)

All commands are run from the `triveni-kavach` folder.

### 1. Configuration

```powershell
Copy-Item .env.example .env
# Generate a secret key and paste it into .env as SECRET_KEY=...
py -3.12 -c "import secrets; print(secrets.token_urlsafe(48))"
```

### 2. Backend: virtual environment and dependencies

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1          # if blocked: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
python -m pip install --upgrade pip
pip install -r requirements-dev.txt    # runtime deps + pytest/ruff (use requirements.txt for runtime only)
```

### 3. Database: migrations and development accounts

```powershell
alembic upgrade head                   # creates backend\triveni_kavach.db (SQLite)
$env:DEMO_PASSWORD = "ChooseAPassw0rd" # optional; min 10 chars with letters and digits
python scripts\seed_demo.py            # fictional demo farms, records and accounts
```

If `DEMO_PASSWORD` is not set, the script generates a random password and prints it once.
Re-run with `--reset` to recreate the demo data. The script refuses to run when
`APP_ENV=production`.

Development accounts (all share the demo password):

| Role | E-mail |
|---|---|
| Department administrator | `admin@demo.triveni-kavach.example` |
| Veterinarian | `vet.anand@demo.triveni-kavach.example`, `vet.kavya@demo.triveni-kavach.example` |
| Farmer | `farmer.ravi@demo.triveni-kavach.example`, `farmer.lakshmi@demo.triveni-kavach.example`, `farmer.manju@demo.triveni-kavach.example` |

To start with an empty database instead, skip the seed script and create the first
administrator interactively with `python scripts\create_admin.py`; that administrator
then creates veterinarian and farmer accounts under **Users**.

### 4. Start the backend

```powershell
uvicorn app.main:app --reload --port 8000
```

* Health check: <http://localhost:8000/api/v1/health>
* **API documentation (Swagger UI)**: <http://localhost:8000/api/v1/docs> (ReDoc at `/api/v1/redoc`)

### 5. Frontend (second PowerShell window)

```powershell
cd frontend
npm ci                                 # or: npm install
Copy-Item .env.example .env            # optional; default API URL is http://localhost:8000/api/v1
npm run dev
```

Open <http://localhost:5173> and sign in. The login page shows whether the backend is reachable.

### Linux / macOS
Same steps with `python3.12 -m venv .venv`, `source .venv/bin/activate`, `cp` instead of
`Copy-Item`, and `/` paths.

## Using PostgreSQL instead of SQLite

```powershell
# in .env
DATABASE_URL=postgresql+psycopg://triveni:change-me@localhost:5432/triveni_kavach
```
Create the database and user, then run `alembic upgrade head`. The `psycopg` driver is
already in `requirements.txt`.

## Tests and quality checks

```powershell
# Backend (from backend/, venv active)
pytest                                  # 67 tests; builds a temporary DB via the real migrations
ruff check .
ruff format --check .
alembic check                           # models and migrations agree
# Optional: run the suite against PostgreSQL
$env:TEST_DATABASE_URL = "postgresql+psycopg://user:pass@localhost:5432/tk_test"; pytest

# Frontend (from frontend/)
npm run typecheck
npm run lint
npm test                                # Vitest unit tests
npm run build                           # production build into frontend/dist

# End-to-end journey (both services running, demo data seeded, Playwright installed)
#   npm install --no-save playwright ; npx playwright install chromium
$env:DEMO_PASSWORD = "ChooseAPassw0rd"; node e2e/journey.mjs
```

Results of the runs performed for this version are in [docs/testing-log.md](docs/testing-log.md).

## What the application does

* **Roles**: department administrator (all farms, user management), veterinarian
  (assigned farms), farmer (own farms). Enforced by the API; inaccessible items return 404.
* **Farms**: create, edit, search, filter by type and taluk; delete (administrator, with confirmation).
* **Records** per farm, each with add/edit/delete, date filters and validation:
  vaccinations (scheduled/completed/missed, overdue highlighting), mortality (including
  nil reports), hygiene inspections (pass/fail derived from a checklist), visitor entries
  (precautions), environmental readings (source `manual` or `simulated`).
* **Dashboards** computed from the database with date-range filters: totals by type,
  population, vaccinations, mortality per week, hygiene results, active alerts, latest
  assessment status, farms requiring follow-up, upcoming/overdue vaccinations, recent activity.
* **Biosecurity assessment**: explainable provisional rules → status, score (or
  *insufficient data*), triggered rules, observations, recommendations, data-quality
  warnings and limitations. Alerts are deduplicated and move open → acknowledged → resolved.
* **Animal-health screening** (pigs only): reused XGBoost model with raw scores,
  alternatives, species-coverage warnings and a stored history.
* **IoT concept**: simulator + validated ingestion API; no hardware.

## Known limitations

* The screening model was trained on **synthetic data only**; its outputs are uncalibrated
  scores, not diagnoses or probabilities. No poultry support. See [model-limitations](docs/model-limitations.md).
* Rule thresholds and weights are **provisional** and need veterinary review. The score is
  not a disease probability.
* No physical IoT integration; `device` source is disabled.
* No maps (farms store administrative locations only), no SMS/e-mail notifications, no
  Kannada interface, no offline mode, no report export.
* Access tokens are kept in `sessionStorage`; there is no refresh token, login rate limiting
  or account lockout. These are required before any real deployment.
* Windows setup commands are documented but were not executed on Windows in this
  environment (development and testing ran on Linux; see the testing log).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Login page says "Backend unreachable" | Start the backend on port 8000; check `VITE_API_BASE_URL` in `frontend/.env` |
| Browser console shows a CORS error | Add your frontend origin to `CORS_ORIGINS` in `.env` and restart the backend |
| `Activate.ps1 cannot be loaded` | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `pip install` fails building pandas / xgboost | You are probably on an unsupported Python (e.g. 3.13+ or 32-bit); use 64-bit Python 3.12 |
| Warning "SECRET_KEY is not set" | Set `SECRET_KEY` in `.env`; otherwise sessions end when the backend restarts |
| Screening page says "model unavailable" | Ensure `backend/ml_artifacts/*.pkl` exist and scikit-learn 1.7.1 / xgboost 3.1.3 are installed; the error text is shown on the page |
| "Demo data already exists" | `python scripts\seed_demo.py --reset` |
| Start completely fresh | Stop the backend, delete `backend\triveni_kavach.db`, run `alembic upgrade head` (and the seed script) |
| Port 5173 in use | Stop the other process; the dev server uses a fixed port so CORS settings stay valid |
