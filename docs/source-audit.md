# Source audit

This document records what existed **before** Triveni Kavach was implemented, what was
reused, what was rewritten, and what remains unimplemented. The reference material was
inspected read-only; none of it was modified.

## 1. Where the sources were found

The build instructions named `reference/SIH25006-main/`,
`reference/animal-health-disease-prediction-model-main/` and
`reference/iot-reference-image.png`. **None of these paths existed** in the working
repository (`Civilinc---Submitted`, which contains an unrelated civic-complaints project,
CivilInc). The references were located as public GitHub repositories of the same owner
and cloned read-only outside this repository:

| Reference | Repository | Commit inspected |
|---|---|---|
| SIH static HTML apps | `YuvarajSYali-developer/SIH25006` | `63ea2b4` |
| SIH React prototype | `YuvarajSYali-developer/SIH-25006` | `3073d3a` |
| Animal-health model | `YuvarajSYali-developer/animal-health-disease-prediction-model` | `f8cee55` |
| IoT reference image | — | **not found** |
| Original SIH presentation | — | **not found** |

Both SIH repositories were also searched across their full git history for images,
slides and PDFs. The only image is `photorealistic-poultry-farm-scene-with-chickens.jpg`
(a decorative landing-page photograph). **The IoT image and the SIH presentation are
therefore unavailable**, and no hardware component can be confirmed from them (see
[`iot-concept.md`](iot-concept.md)).

Because the working repository already holds CivilInc, Triveni Kavach was built in its own
self-contained folder, `triveni-kavach/`, so that the existing project is left untouched.

## 2. Farm-management references (SIH)

### 2.1 `SIH25006` — static HTML/CSS/JS
| Screen | Contents | Status |
|---|---|---|
| `index.html` + `landing-*.{css,js}` | Landing page, Karnataka framing | Static |
| `WEB APP FOR DIRECTOR/` | State dashboard: KPIs, Chart.js charts, "disease heatmap", outbreak list, AI insights, resource management, report generator | All data is embedded JS objects; buttons do not persist anything |
| `WEB APP OF DISTRICT DIRECTOR/` | Haveri district dashboard: 8 taluk "blocks" with approximate taluk-town coordinates, incidents, high-risk visitors, vaccination progress | Hard-coded `dashboardData` object (e.g. `total_farms: 3000`) with simulated "real-time updates" |
| `MOBILE APP FOR FARMER/` | Kannada farmer app: alerts, vaccination reminders, schedule, voice buttons | Hard-coded |
| `MOBIILE APP OF VET/` | Vet app: case list, case form (farm, symptoms, diagnosis, treatment, follow-up) | Form does not save anywhere |
| `shared-design-system.css` | Shared styles | Reference only |

### 2.2 `SIH-25006` — React 18 / CRA prototype
Landing page with Three.js scene, `DirectorDashboard`, `DistrictDashboard`,
`VetMobileApp`, `FarmerMobileApp`, Recharts, Tailwind and shadcn-style components. All
statistics are hard-coded (e.g. "Total Farms 12,485", "Compliance Rate 89.2%"); the
director dashboard titled "Karnataka" contains Maharashtra district names; the farmer
screen shows fixed temperature (24 °C) and humidity (65 %). There is no backend, no
authentication and no persistence. The README's claims (offline PWA, voice recognition,
WCAG 100/100, "real-time IoT") are not implemented in the code. The README credits a
"FarmGuard Development Team" for the historic SIH work; that team work is distinct
from this individual internship implementation.

### 2.3 What was taken from the SIH material
* **Workflows and roles**: department/district oversight, veterinarian, farmer.
* **Record types**: vaccination schedules, visitor entry precautions (vehicle
  disinfection, footwear, cross-farm contact), hygiene/disinfection, mortality, alerts,
  "farms requiring attention", environmental (temperature/humidity) monitoring.
* **Haveri context**: the eight taluk names used as location labels and form suggestions.
* **Design cues**: card-based dashboards, Recharts, Lucide icons, Tailwind.

### 2.4 What was not reused
* No SIH code was copied. The UI was rebuilt as one React + TypeScript + Vite app with
  shared components and real API calls.
* Hard-coded statistics, outbreak names, people's names and coordinates were **not**
  carried over. The reference contains the name of the internship supervisor and other
  officials attached to fictional records; no real person appears in the new demo data.
* Taluk-town coordinates were not used to place farms on a map: farms store
  taluk/village only, so no map is drawn (a decision recorded in the dashboard itself).
* Three.js scenes, voice commands, market prices, PDF/Excel export and the chatbot were
  out of scope.

## 3. Animal-health prediction model

### 3.1 Inventory
| File | Purpose | Finding |
|---|---|---|
| `generate_data.py` | Synthetic data generator (20 conditions, 8 species) | Rule-based sampler; see 3.3 |
| `enhanced_animal_disease.csv` | 8 000 synthetic rows, 40 columns | Matches the generator's schema |
| `train_model.py` | One-hot species, LabelEncoder, XGBoost (700 trees), 85/15 stratified split | Reproducible (`random_state=42`) |
| `animal_model.pkl` | Pickled `xgboost.XGBClassifier` | **Loads** with xgboost 3.1.3 |
| `label_encoder.pkl` | `sklearn.LabelEncoder`, 20 classes | **Loads**; pickled with scikit-learn **1.7.1** (requirements said 1.7.2 — warning on 1.7.2) |
| `model_features.pkl` | Ordered list of 46 feature names | 4 vitals + 34 symptoms + 8 species one-hots |
| `training_metrics.json` | accuracy 0.98917, balanced acc 0.98855, macro-F1 0.98875 | **Reproduced exactly** (see 3.2) |
| `app.py` | Flask `/predict`, `/status` | Logic reviewed and partly reused (3.4) |
| `test_system.py` | Live-server smoke script | Not a unit test; requires the Flask server |
| `data_ingest.py`, `data_sources.example.json` | Merge external CSVs | Example config points to `example.com`; never used for training |
| `templates/index.html` | Flask UI | Not reused |

Species in the model: Cat, Cow, Dog, Fox, Goat, Horse, **Pig**, Sheep. **No poultry.**

### 3.2 Verification performed
Executed in a Python 3.12 virtual environment with the pinned dependencies:
* All three artifacts loaded; class count (20) matches the encoder; feature list matches
  the CSV column order after one-hot encoding.
* Re-creating the original 15 % stratified hold-out (`random_state=42`) and predicting
  with the saved model gives accuracy **0.989167**, identical to `training_metrics.json`.
  Accuracy on the full CSV (including training rows) is 0.998.
* `XGBClassifier.predict_proba` on an unnamed array fails (feature-name validation); the
  original's approach — predicting through a named `DMatrix` — works and is kept.

### 3.3 Data-generation findings (leakage, shortcuts, imbalance)
* **Perfect "Healthy" shortcut**: every Healthy row has zero symptoms and every non-Healthy
  row has at least two (the generator forces this). "Healthy ⇔ no symptoms" classifies
  Healthy-vs-not with 100 % accuracy on the dataset.
* **Near-deterministic signatures**: symptoms with probability ≥ 0.9 are raised to 0.98, so
  each disease has an almost fixed symptom fingerprint. High accuracy reflects the
  generator's rules being recovered, not clinical skill.
* **Same-generator evaluation**: train and test come from the same sampler; the metric
  measures agreement with the generator only.
* **Species leakage**: the label set is constrained by species (e.g. only 4 labels ever
  occur for Pig), so species one-hots carry much of the signal — yet the model can still
  output labels never seen for the species. Observed during the audit: a pig with cough
  and nasal discharge receives *K9 Distemper* (a dog-only class) as the second-highest score
  (0.41).
* **Coverage for pigs**: 677 pig rows; labels Swine Erysipelas (371), Gastroenteritis (120),
  Healthy (107), Foot and Mouth (79). African/Classical Swine Fever, PRRS etc. are absent.
* **Imbalance**: Healthy has double weight (734 rows vs ~340–410 per disease); species are
  uneven (Horse 1 750 … Fox 269). Training used balanced sample weights.
* 2 duplicate rows; `test_system.py` references a non-existent `Pot_Belly` symptom.
* The original `/predict` replaced a "Healthy" output with a lower-ranked disease, or with
  an invented **"Unknown Infection"** label at "0.1 %", whenever symptoms were present, and
  labelled raw scores as "confidence". These are post-hoc heuristics, not model outputs.

### 3.4 What was reused vs rewritten
| Item | Decision |
|---|---|
| `animal_model.pkl`, `label_encoder.pkl`, `model_features.pkl` | **Reused unchanged** (copied to `backend/ml_artifacts/`, SHA-256 prefixes `d15405db`, `fbfd674b`, `251c7d70`) |
| `training_metrics.json` | Kept as `historical_training_metrics.json` — historical evidence only |
| Feature construction (one-hot species, binary symptoms, named DMatrix) | **Reused** inside `app/services/screening/model_service.py` |
| "Unknown Infection" / Healthy-override heuristics | **Dropped**; replaced by explicit warnings |
| Flask server and UI | **Not used**; FastAPI is the only backend |
| Training/generation scripts and CSV | Not copied. `scripts/derive_model_metadata.py` reads the CSV once to produce `model_metadata.json` (labels per species, vital ranges) used to annotate outputs |

No retraining was done and no new training data was introduced.

## 4. Summary of reuse
* **Reused**: three model artifacts, the inference feature logic, historical metrics,
  workflow/role concepts, Haveri taluk names, general visual direction.
* **Rewritten**: the whole application (React + TypeScript frontend, FastAPI backend,
  database, auth, CRUD, dashboards, rule engine, alerts, telemetry simulator).
* **Unimplemented / out of scope**: physical IoT hardware, poultry screening, maps,
  voice/Kannada UI, PDF/Excel export, notifications (SMS/e-mail), offline mode. See the
  deferred list in [`implementation-log.md`](implementation-log.md).
