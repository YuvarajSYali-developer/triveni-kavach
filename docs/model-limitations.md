# Model and rule-engine limitations

Two separate decision-support components exist. Neither diagnoses disease.

## 1. Animal-health screening model (reused)

**Provenance**: `animal-health-disease-prediction-model` @ `f8cee55` — XGBoost
(`multi:softprob`, 700 trees) with a scikit-learn `LabelEncoder`, trained on
`enhanced_animal_disease.csv` (8 000 synthetic rows). Artifacts reused unchanged; version
string `xgboost-animal-v4@<sha256 prefix>` is stored with each screening.

### Status in this application
* **Loads and predicts** with the pinned stack (Python 3.12, xgboost 3.1.3,
  scikit-learn 1.7.1, pandas 3.0.0, numpy 2.4.2). Verified by tests.
* Exposed as an *exploratory screening* page, enabled for **Pig only**
  (`SCREENING_ENABLED_SPECIES`). Poultry terms (chicken, broiler, layer, duck …) return 422
  "no poultry training data". Other model species (Dog, Cow …) are out of portal scope → 422.
* If the artifacts cannot be loaded, `/screening/status` reports `available: false` with
  the error and `POST /screening` returns **503**. No substitute predictions are produced.

### What the outputs are and are not
| The output is | The output is not |
|---|---|
| The classifier's raw softmax score per label | A calibrated probability or "confidence" |
| Agreement with the synthetic generator's patterns | Evidence of clinical accuracy |
| A prompt to involve a veterinarian | A diagnosis |

### Known weaknesses (from the source audit)
1. **Synthetic only**: no real animal case was used for training or evaluation.
2. **Historical metrics are not clinical**: accuracy 0.989 / macro-F1 0.989 was measured on a
   hold-out drawn from the same generator (reproduced exactly during the audit).
3. **"Healthy" shortcut**: Healthy ⇔ zero symptoms in the data. Any symptom pushes the
   model away from Healthy; zero symptoms yields Healthy almost regardless of vitals.
   → The API warns when no symptoms are given, and when the output is Healthy despite symptoms.
4. **Cross-species labels**: the model can output labels never seen for the species (e.g.
   *K9 Distemper* for a pig). → Each label carries `observed_for_species_in_training`; a
   warning is raised.
5. **Narrow pig coverage**: only Swine Erysipelas, Gastroenteritis (General), Foot and
   Mouth and Healthy. ASF, CSF, PRRS, swine influenza etc. are absent.
6. **Vital-sign ranges**: inputs outside the per-species training range trigger a warning
   (ranges in `ml_artifacts/model_metadata.json`).
7. **Activity level** is a 0–100 synthetic scale with no defined measurement protocol.
8. The original app's post-processing ("Unknown Infection", Healthy override) is removed;
   outputs here are raw.

### What would be needed for real use
Real, veterinarian-labelled pig and poultry case data; external validation; calibration;
a species-specific label set agreed with the Department; prospective evaluation. None of
this has been done, and no performance improvement is claimed.

## 2. Rule-based biosecurity assessment (new)

Implemented in `backend/app/services/biosecurity/rules.py` (version
`2026.10-provisional`). Thresholds and weights are **provisional engineering choices**,
not veterinary standards, and are not validated predictors of disease.

| Rule | Trigger (provisional) | Severity | Weight |
|---|---|---|---|
| `NO_VACCINATION_RECORDS` | no vaccination records at all | medium | 15 |
| `VACCINATION_OVERDUE` | scheduled with `due_on` < today | high | 25 |
| `VACCINATION_MISSED` | marked missed, due within 180 days | medium | 20 |
| `MORTALITY_SPIKE` | ≥ 3 deaths in last 7 days **and** ≥ 2× the 7-day average of the preceding 28 days (baseline floor 0.5) | high | 30 |
| `MORTALITY_RATE_HIGH` | ≥ 3 deaths in 7 days **and** ≥ 1 % of recorded population | high | 30 |
| `HYGIENE_FAILED` | latest inspection (≤ 90 days) failed | medium | 20 |
| `HYGIENE_STALE` | latest inspection > 30 days old, or none in 90 days | low | 10 |
| `VISITOR_PRECAUTIONS_INCOMPLETE` | any visitor in 30 days missed a precaution | medium | 10 |
| `VISITOR_CROSS_FARM_CONTACT` | visitor on another farm within 48 h | medium | 10 |
| `ENVIRONMENT_OUT_OF_RANGE` | any reading in 7 days outside 10–32 °C, 40–80 % RH, or > 25 ppm NH₃ | low | 10 |

* **Score** = sum of weights, capped at 100. Bands: < 25 low, 25–49 moderate, ≥ 50 high.
* **Insufficient data**: if fewer than two of {vaccination activity in 365 days, mortality
  reports incl. nil reports in 90 days, hygiene inspection in 90 days} exist, or the farm
  has no recorded population, the status is `insufficient_data` and **no score** is given.
  Triggered rules are still listed and still raise alerts.
* Each assessment returns triggered rules with details, supporting observations,
  recommended follow-up, data-quality warnings and limitations.
* Mortality findings always add a recommendation to contact a veterinarian; no rule names
  a disease.
* A "low" result with no triggered rules explicitly states that it does not certify the
  farm as disease-free.
* Simulated environmental readings are evaluated (to demonstrate the rule) but flagged in
  both the rule detail and the data-quality warnings.

Known gaps: thresholds are uniform across species, ages and seasons; mortality uses
recorded population counts that may be stale; the engine only sees what is recorded.
