"""Train a symptom-based classifier from VETERINARIAN-CONFIRMED cases recorded in Triveni Kavach.

This is the path to a genuine AI model: it only uses cases whose diagnosis a veterinarian
confirmed (exported by an administrator from /api/v1/symptom-checks/export). It refuses to
train until each diagnosis has enough cases, and reports cross-validated metrics so the
result can be judged honestly. No synthetic data is used.

Usage (from the backend directory):
    python scripts/train_from_confirmed_cases.py confirmed_cases.csv --species pig
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

MIN_CASES_PER_CLASS = 30
MIN_CLASSES = 2


def load(path: Path, species: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    required = {"species", "signs", "confirmed_diagnosis", "age_group", "sudden_deaths"}
    if missing := required - set(df.columns):
        raise SystemExit(f"Missing columns: {', '.join(sorted(missing))}")
    df = df[df["species"] == species].copy()
    df["signs"] = df["signs"].fillna("").map(lambda s: [x for x in str(s).split(";") if x])
    return df


def check_enough(labels: pd.Series) -> dict[str, int]:
    counts = Counter(labels)
    usable = {k: v for k, v in counts.items() if v >= MIN_CASES_PER_CLASS}
    if len(usable) < MIN_CLASSES:
        raise SystemExit(
            f"Not enough confirmed cases to train: need >= {MIN_CASES_PER_CLASS} cases for at least "
            f"{MIN_CLASSES} diagnoses. Current counts: {dict(counts)}"
        )
    return usable


def train(df: pd.DataFrame, out_dir: Path) -> dict:
    import joblib
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import balanced_accuracy_score, classification_report
    from sklearn.model_selection import StratifiedKFold, cross_val_predict
    from sklearn.preprocessing import MultiLabelBinarizer

    usable = check_enough(df["confirmed_diagnosis"])
    df = df[df["confirmed_diagnosis"].isin(usable)]
    mlb = MultiLabelBinarizer()
    X = pd.DataFrame(mlb.fit_transform(df["signs"]), columns=mlb.classes_, index=df.index)
    X["sudden_deaths"] = df["sudden_deaths"].astype(int)
    X = pd.concat([X, pd.get_dummies(df["age_group"].fillna("unknown"), prefix="age").astype(int)], axis=1)
    y = df["confirmed_diagnosis"]
    model = LogisticRegression(max_iter=2000, class_weight="balanced")
    folds = min(5, min(usable.values()))
    pred = cross_val_predict(model, X, y, cv=StratifiedKFold(folds, shuffle=True, random_state=0))
    report = {
        "cases": int(len(df)),
        "classes": usable,
        "cv_folds": folds,
        "balanced_accuracy": float(balanced_accuracy_score(y, pred)),
        "per_class": classification_report(y, pred, output_dict=True, zero_division=0),
    }
    model.fit(X, y)
    out_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "features": list(X.columns)}, out_dir / "confirmed_case_model.pkl")
    (out_dir / "confirmed_case_model_report.json").write_text(json.dumps(report, indent=2))
    return report


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv", type=Path)
    ap.add_argument("--species", choices=["pig", "poultry"], required=True)
    ap.add_argument("--out", type=Path, default=Path("ml_artifacts/confirmed_cases"))
    args = ap.parse_args(argv)
    report = train(load(args.csv, args.species), args.out)
    print(
        f"Trained on {report['cases']} confirmed cases; cross-validated balanced accuracy "
        f"{report['balanced_accuracy']:.3f} over {report['cv_folds']} folds."
    )


if __name__ == "__main__":
    sys.exit(main())
