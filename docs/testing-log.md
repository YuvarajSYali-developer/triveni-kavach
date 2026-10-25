# Testing log

All runs below were executed on **2026-10-25** in a Linux cloud container (Python 3.12.3,
Node.js 22.22.0, npm 10.9.4, PostgreSQL 16.15, Chromium via pre-installed Playwright).
Nothing was run on Windows; the PowerShell instructions in the README are written for
Windows but are **not verified there**.

## Summary (final state)

| Check | Command | Result |
|---|---|---|
| Backend lint | `ruff check .` / `ruff format --check .` | **pass** (43 files) |
| Backend tests, SQLite | `pytest` | **67 passed**, 0 failed |
| Backend tests, PostgreSQL 16 | `TEST_DATABASE_URL=postgresql+psycopg://…/tk_test pytest` | **67 passed**, 0 failed |
| Clean install | fresh venv → `pip install -r requirements-dev.txt` → `pip check` → `pytest` | **no conflicts; 67 passed** |
| Migrations | `alembic upgrade head` → `alembic check` → `alembic downgrade base` → `alembic upgrade head` on an empty SQLite file | **pass** ("No new upgrade operations detected") |
| PostgreSQL DDL | `alembic upgrade head --sql` with a PostgreSQL URL | **pass** (11 application tables + `alembic_version`, partial unique index `WHERE status != 'resolved'`) |
| Frontend type check | `npm run typecheck` (`tsc -b`) | **pass** |
| Frontend lint | `npm run lint` | **pass** (0 errors, 0 warnings) |
| Frontend unit tests | `npm test` (Vitest) | **9 passed** (3 files) |
| Frontend production build | `npm run build` | **pass** |
| Backend starts | `uvicorn app.main:app --port 8000` + `GET /api/v1/health` | `{"status":"ok","database":"ok","screening_model_available":true}` |
| Frontend starts | `npx vite --port 5173`, `GET /` | HTTP 200 |
| End-to-end journey | `node e2e/journey.mjs` (fresh DB + seed) | **19/19 steps passed**; backend log contained 0 HTTP 500 responses |
| Seed + admin scripts | `seed_demo.py`, `seed_demo.py` again (refuses), `--reset`, `create_admin.py` | **pass** |

## Backend test inventory (67)

| File | Tests | Covers |
|---|---|---|
| `test_auth_users.py` | 11 | health + CORS (allowed vs disallowed origin), login, case-insensitive e-mail, identical error for wrong password vs unknown user, inactive users, 401 on protected endpoints, forged/expired tokens, forged role claim ignored, admin-only user management, password policy, self-deactivation blocked |
| `test_farms.py` | 9 | admin CRUD, farmer creates own farm, farmer cannot assign vet/owner, vet cannot create, validation (counts vs type, negatives, empty name, bad enum, bad phone, wrong-role assignee), PATCH re-validation, list scoping per role, ownership boundaries (404 for others, 403 on assignment/delete), search & filters |
| `test_records.py` | 7 | vaccination CRUD + status/date filters + invalid range, vaccination validation and species/farm-type match, record edit/delete permissions, record must belong to the farm in the URL, mortality nil report and future-date rejection, hygiene result derived server-side (client cannot force "pass"), visitor precautions and time validation, naive datetimes stored as UTC |
| `test_rules.py` | 13 | each rule, boundaries (due today vs yesterday, 3-death minimum, exactly 1.0 % rate, 30 vs 31 days, thresholds at the limit), lookback windows, insufficient data (no records / no population), missing baseline warning, simulated-data warning, score cap and bands, determinism |
| `test_alerts.py` | 7 | assessment output shape and alert creation, deduplication on repeat (occurrence_count), dashboard/alert reads never create alerts, full lifecycle (ack → 409 on re-ack, farmer cannot resolve, note required, other vet 404, resolve, 409 on re-resolve, recurrence creates a new alert), filters and scoping, DB partial unique index, run-all scope |
| `test_screening.py` | 11 | artifacts load, 46 features in expected order matching the training CSV, 20 classes, label round-trip, prediction equals the audit reference (Swine Erysipelas 0.9996), cross-species label flag (K9 Distemper for a pig), no-symptom shortcut warning, out-of-range vitals warning, poultry/other/unknown species rejected, API predict + history + access scoping, invalid inputs rejected and nothing stored, status endpoint, unavailable model → 503 with no fake output |
| `test_telemetry.py` | 6 | manual reading stored with `source=manual`, form rejects simulated/device, invalid payloads (humidity > 100, temp 99, negative ammonia, no values, future time, unknown source), ingest accepts manual+simulated, ingest rejects `device` and foreign farms and empty batches, simulator stores only `simulated` values with the "not a measurement" note |
| `test_dashboard.py` | 3 | totals by type, mortality by species, due vaccinations, not-assessed count and activity computed from DB rows; per-role scoping; date filters and invalid range; empty state for a vet with no farms |

## End-to-end journey (`e2e/journey.mjs`)

Run against a freshly migrated and seeded SQLite database with both dev servers running.
Final run: **19/19 passed**.

| # | Step (maps to the required journey) | Result |
|---|---|---|
| 1 | Login page shows live backend health | pass |
| 1b | Wrong password rejected with message | pass |
| 2 | Farmer signs in → "My farm dashboard", demo-data notice, charts | pass |
| 3 | Create farm (client validation blocks −3 pigs, then succeeds) | pass |
| 3b | Update farm (pig count 60 → 80) | pass |
| 4 | Add completed + overdue scheduled vaccinations; "Overdue" shown | pass |
| 5 | Record mortality incl. two nil reports | pass |
| 6 | Hygiene inspection with a failed item → "Fail"; visitor with incomplete precautions | pass |
| 8 | Manual reading shows source "Manual"; simulated telemetry (with excursion) shows "Simulated" + warning | pass |
| 7 | Run assessment → overdue vaccination, hygiene failure, mortality rules shown with "not a probability" note; re-run reports 0 new alerts and alert count unchanged | pass |
| 7b | Farmer acknowledges an alert; no Resolve button for farmers | pass |
| 10–11 | Pig screening → Swine Erysipelas, "not a diagnosis", stored in history; Poultry option disabled | pass |
| 12 | Farmer opening another farmer's farm → "Farm not found."; `/users` redirects to dashboard; no Users link | pass |
| 9 | Admin department dashboard shows taluk table and the new farm | pass |
| 7c | Admin resolves an alert with a note; visible under "Resolved" | pass |
| — | Users page; farm delete shows confirmation and can be cancelled | pass |
| — | Veterinarian sees only assigned farms | pass |
| — | IoT concept page renders | pass |
| — | Mobile viewport (390 px) navigation | pass |

Browser console errors during the run were only the expected 401 (wrong-password step) and
404s (forbidden-farm step).

## Failures found during testing and how they were resolved

| Found by | Problem | Classification | Resolution |
|---|---|---|---|
| First pytest run | `register()` failed at import: `UTCDateTime.python_type` not implemented | code defect | detect datetime columns by type class |
| pytest | lifecycle test sent a 2-character note below the 3-character minimum | test defect | corrected the test |
| pytest (speed) | suite took 138 s due to bcrypt cost 12 | test infrastructure | `BCRYPT_ROUNDS=4` in tests only (6 s) |
| API smoke test | SQLite returned naive timestamps (`…T17:01:31`) that browsers would read as local time | code defect | `UTCDateTime` column type; migration regenerated; test added |
| Vitest | duplicate "Sign in" buttons — no auto-cleanup without globals | test setup | explicit `cleanup()` |
| E2E run 1 | after signing out on a farm page, the next user was redirected to that farm (404 for them) | **UX defect** | sign-out navigates to a clean `/login` |
| E2E | several ambiguous locators (hidden `<option>` "Fail", "Alerts" vs "View alerts", duplicate farm names), and one count taken before the list loaded | test defects | precise locators / wait for content |
| E2E (one run) | HTTP 500 `OperationalError` on writes | **environment** — an old backend still held the deleted SQLite file while the new one could not bind the port; the API correctly returned "change was not saved" rather than fake success | stopped all instances; re-ran clean (0 × 500) |
| Screenshot review | bar charts empty in screenshots (animation not finished) | UX defect | chart animation disabled |
| Screenshot review | rule text "outside --25.0 ppm" for one-sided limits | code defect | wording "above 25.0 ppm" |
| Screenshot review | score 0.9996 displayed as "1.000" (overstates certainty) | UX defect | 4 decimals |

## Unresolved / not verified

* **Windows execution** of the documented PowerShell steps (no Windows host available).
* **Real PostgreSQL deployment**: tests and migrations were run against a local
  PostgreSQL 16 test cluster only.
* **Accessibility audit** with a screen reader or automated tool (labels, roles and
  keyboard focus were implemented but not formally audited).
* **Load/performance testing**: dashboards aggregate in Python and are sized for district
  scale, not measured.
* The Playwright script is a smoke test run manually; it is not wired into CI.
