"""Exploratory animal-health screening using the reused XGBoost artifacts.

Origin: ``animal-health-disease-prediction-model`` (commit f8cee55). The feature
construction below mirrors the original Flask ``/predict`` handler (one-hot species
column, binary symptom columns, prediction through a named ``DMatrix``) so outputs
are identical to the original model's raw scores.

Deliberate differences from the original handler:
  * The original's post-processing that replaced a "Healthy" prediction with an
    alternative label, or with an invented "Unknown Infection" label, is NOT
    reproduced. Raw model scores are returned and concerns are raised as warnings.
  * Scores are reported as uncalibrated model scores, not as confidence or probability.
  * Each label is annotated with whether it ever occurred for the requested species
    in the synthetic training data.
  * Only species enabled by configuration (default: Pig) are accepted. The model has
    no poultry classes, so poultry is always rejected.
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

logger = logging.getLogger("triveni_kavach.screening")

VITAL_FEATURES = ("Body_Temperature", "Heart_Rate", "Respiratory_Rate", "Activity_Level")
SPECIES_PREFIX = "Animal_Type_"
POULTRY_TERMS = {"poultry", "chicken", "hen", "broiler", "layer", "duck", "turkey", "bird", "fowl", "quail"}

SCORE_NOTE = (
    "Model scores are the classifier's raw, uncalibrated outputs. They are not "
    "probabilities of disease and not a measure of clinical accuracy."
)
RECOMMENDATION = (
    "This is an exploratory screening aid, not a diagnosis. If the animal appears unwell, "
    "isolate it where practical and contact the assigned veterinarian or the nearest "
    "veterinary hospital for a clinical examination."
)
LIMITATIONS = [
    "The model was trained only on synthetic (computer-generated) data; it has not been " "validated on real animal cases.",
    "The recorded 98.9% hold-out accuracy was measured on synthetic data from the same "
    "generator and does not indicate real-world clinical accuracy.",
    "In the training data every 'Healthy' example has zero symptoms and every other "
    "example has at least one, so the presence of any symptom strongly drives the output.",
    "For pigs the training data contains only four labels: Swine Erysipelas, Gastroenteritis "
    "(General), Foot and Mouth and Healthy. Important pig diseases such as African Swine "
    "Fever and Classical Swine Fever are not represented.",
    "Poultry is not represented in the model at all.",
]


class ModelUnavailable(RuntimeError):
    pass


class UnsupportedSpecies(ValueError):
    pass


class InvalidInput(ValueError):
    pass


@dataclass
class Prediction:
    model_version: str
    top: dict[str, Any]
    alternatives: list[dict[str, Any]]
    warnings: list[str]
    inputs: dict[str, Any]


class ScreeningModel:
    def __init__(self, artifact_dir: Path, enabled_species: list[str]):
        self.artifact_dir = Path(artifact_dir)
        self.enabled_species_config = enabled_species
        self._lock = threading.Lock()
        self._loaded = False
        self.error: str | None = None
        self.model = None
        self.label_encoder = None
        self.features: list[str] = []
        self.metadata: dict[str, Any] = {}
        self.historical_metrics: dict[str, Any] | None = None
        self.version = "unavailable"

    # ------------------------------------------------------------- loading
    def load(self) -> bool:
        with self._lock:
            if self._loaded:
                return True
            try:
                import joblib  # noqa: F401  (import errors are reported as unavailability)
                import xgboost  # noqa: F401

                model_path = self.artifact_dir / "animal_model.pkl"
                self.model = joblib.load(model_path)
                self.label_encoder = joblib.load(self.artifact_dir / "label_encoder.pkl")
                self.features = list(joblib.load(self.artifact_dir / "model_features.pkl"))
                meta_path = self.artifact_dir / "model_metadata.json"
                self.metadata = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
                hist = self.artifact_dir / "historical_training_metrics.json"
                self.historical_metrics = json.loads(hist.read_text(encoding="utf-8")) if hist.exists() else None
                n_classes = len(self.label_encoder.classes_)
                if getattr(self.model, "n_classes_", n_classes) != n_classes:
                    raise ValueError("Model class count does not match the label encoder.")
                if not all(f in self.features for f in VITAL_FEATURES):
                    raise ValueError("Feature list is missing expected vital-sign features.")
                digest = hashlib.sha256(model_path.read_bytes()).hexdigest()[:12]
                self.version = f"xgboost-animal-v4@{digest}"
                self._loaded = True
                self.error = None
                logger.info("Screening model loaded (%s, %d features)", self.version, len(self.features))
                return True
            except Exception as exc:  # any failure => honest unavailable state
                self.error = f"{exc.__class__.__name__}: {exc}"
                logger.error("Screening model unavailable: %s", self.error)
                return False

    @property
    def available(self) -> bool:
        return self._loaded

    # ------------------------------------------------------------ metadata
    @property
    def model_species(self) -> list[str]:
        return [f[len(SPECIES_PREFIX) :] for f in self.features if f.startswith(SPECIES_PREFIX)]

    @property
    def symptoms(self) -> list[str]:
        return [f for f in self.features if f not in VITAL_FEATURES and not f.startswith(SPECIES_PREFIX)]

    @property
    def enabled_species(self) -> list[str]:
        return [s for s in self.enabled_species_config if s in self.model_species]

    def labels_for_species(self, species: str) -> set[str]:
        return set(self.metadata.get("species", {}).get(species, {}).get("labels", {}).keys())

    def status(self) -> dict[str, Any]:
        return {
            "available": self.available,
            "error": self.error,
            "model_version": self.version,
            "model_species": self.model_species,
            "enabled_species": self.enabled_species,
            "unsupported_species": [{"species": "Poultry", "reason": "The model contains no poultry training data or classes."}],
            "symptoms": self.symptoms,
            "labels": [str(c) for c in self.label_encoder.classes_] if self.available else [],
            "labels_by_enabled_species": {s: sorted(self.labels_for_species(s)) for s in self.enabled_species},
            "training_vital_ranges": {
                s: self.metadata.get("species", {}).get(s, {}).get("vital_ranges") for s in self.enabled_species
            },
            "historical_training_metrics": self.historical_metrics,
            "score_note": SCORE_NOTE,
            "limitations": LIMITATIONS,
        }

    # ----------------------------------------------------------- inference
    def check_species(self, species: str) -> str:
        normalized = species.strip()
        if normalized.lower() in POULTRY_TERMS:
            raise UnsupportedSpecies(
                "Poultry screening is not available: the reused model has no poultry training data or classes."
            )
        match = next((s for s in self.model_species if s.lower() == normalized.lower()), None)
        if match is None:
            raise UnsupportedSpecies(f"'{species}' is not a species the model was trained on.")
        if match not in self.enabled_species:
            raise UnsupportedSpecies(f"'{match}' is in the model but is outside the scope of this pig and poultry farm portal.")
        return match

    def predict(
        self,
        species: str,
        body_temperature_c: float,
        heart_rate_bpm: int,
        respiratory_rate_bpm: int,
        activity_level: int,
        symptoms: list[str],
        top_k: int = 3,
    ) -> Prediction:
        if not self.available and not self.load():
            raise ModelUnavailable(self.error or "Model artifacts could not be loaded.")
        sp = self.check_species(species)
        unknown = [s for s in symptoms if s not in self.symptoms]
        if unknown:
            raise InvalidInput(f"Unknown symptom(s) for this model: {', '.join(unknown)}")

        import numpy as np
        import pandas as pd
        import xgboost as xgb

        row = {f: 0 for f in self.features}
        row["Body_Temperature"] = float(body_temperature_c)
        row["Heart_Rate"] = int(heart_rate_bpm)
        row["Respiratory_Rate"] = int(respiratory_rate_bpm)
        row["Activity_Level"] = int(activity_level)
        row[f"{SPECIES_PREFIX}{sp}"] = 1
        for s in symptoms:
            row[s] = 1
        frame = pd.DataFrame([row], columns=self.features)
        scores = self.model.get_booster().predict(xgb.DMatrix(frame, feature_names=self.features))[0]
        order = np.argsort(scores)[::-1]

        seen = self.labels_for_species(sp)

        def scored(i: int) -> dict[str, Any]:
            label = str(self.label_encoder.inverse_transform([int(i)])[0])
            return {"label": label, "model_score": round(float(scores[i]), 4), "observed_for_species_in_training": label in seen}

        top = scored(order[0])
        alternatives = [scored(i) for i in order[1:top_k]]

        warnings: list[str] = []
        if not top["observed_for_species_in_training"]:
            warnings.append(
                f"The top label '{top['label']}' never occurred for {sp} in the training data; treat this output as unreliable."
            )
        for alt in alternatives:
            if not alt["observed_for_species_in_training"]:
                warnings.append(f"Alternative '{alt['label']}' never occurred for {sp} in the training data.")
        if top["label"] == "Healthy" and symptoms:
            warnings.append(
                "The model output is 'Healthy' although symptoms were entered. Symptoms still warrant veterinary attention."
            )
        if not symptoms:
            warnings.append(
                "No symptoms were entered. In the training data every symptom-free example is labelled 'Healthy', "
                "so the model will tend to output 'Healthy' regardless of vital signs."
            )
        ranges = self.metadata.get("species", {}).get(sp, {}).get("vital_ranges", {})
        for feat, value, label in [
            ("Body_Temperature", body_temperature_c, "Body temperature"),
            ("Heart_Rate", heart_rate_bpm, "Heart rate"),
            ("Respiratory_Rate", respiratory_rate_bpm, "Respiratory rate"),
            ("Activity_Level", activity_level, "Activity level"),
        ]:
            lo_hi = ranges.get(feat)
            if lo_hi and not (lo_hi[0] <= value <= lo_hi[1]):
                warnings.append(
                    f"{label} {value} is outside the range seen for {sp} in training ({lo_hi[0]}–{lo_hi[1]}); output may be unreliable."
                )

        return Prediction(
            model_version=self.version,
            top=top,
            alternatives=alternatives,
            warnings=warnings,
            inputs={
                "species": sp,
                "body_temperature_c": body_temperature_c,
                "heart_rate_bpm": heart_rate_bpm,
                "respiratory_rate_bpm": respiratory_rate_bpm,
                "activity_level": activity_level,
                "symptoms": symptoms,
            },
        )


_instance: ScreeningModel | None = None


def get_screening_model() -> ScreeningModel:
    global _instance
    if _instance is None:
        from app.core.config import get_settings

        s = get_settings()
        _instance = ScreeningModel(s.MODEL_ARTIFACT_DIR, s.screening_species)
    return _instance
