"""Derive read-only metadata about the reused animal-health model from its original
synthetic training CSV.

The output (``ml_artifacts/model_metadata.json``) records, per species:
  * which labels actually occur for that species in the training data, and
  * the observed min/max of each vital sign.

The screening service uses this to *annotate* model outputs (e.g. "this label never
occurred for pigs in the training data") — it never changes the model's scores.

Usage (from the backend directory):
    python scripts/derive_model_metadata.py <path-to>/enhanced_animal_disease.csv
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import pandas as pd

VITALS = ["Body_Temperature", "Heart_Rate", "Respiratory_Rate", "Activity_Level"]


def main(csv_path: str) -> None:
    path = Path(csv_path)
    df = pd.read_csv(path)
    symptoms = [c for c in df.columns if c not in {"Animal_Type", "Disease_Prediction", *VITALS}]

    species: dict[str, dict] = {}
    for name, group in df.groupby("Animal_Type"):
        species[str(name)] = {
            "rows": int(len(group)),
            "labels": {str(k): int(v) for k, v in group["Disease_Prediction"].value_counts().items()},
            "vital_ranges": {v: [float(group[v].min()), float(group[v].max())] for v in VITALS},
        }

    sym_count = df[symptoms].sum(axis=1)
    healthy = df["Disease_Prediction"] == "Healthy"
    metadata = {
        "source_csv": path.name,
        "source_csv_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "rows": int(len(df)),
        "symptoms": symptoms,
        "species": species,
        "observations": {
            "healthy_rows_with_any_symptom": int(((sym_count > 0) & healthy).sum()),
            "non_healthy_rows_without_symptoms": int(((sym_count == 0) & ~healthy).sum()),
            "duplicate_rows": int(df.duplicated().sum()),
        },
    }
    out = Path(__file__).resolve().parents[1] / "ml_artifacts" / "model_metadata.json"
    out.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(f"Wrote {out}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: python scripts/derive_model_metadata.py <enhanced_animal_disease.csv>")
    main(sys.argv[1])
