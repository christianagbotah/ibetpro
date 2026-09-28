from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, log_loss, mean_absolute_error

from training.train_xgb import (
    blend_probabilities,
    elo_probabilities,
    expected_calibration_error,
    load_dataset,
    multiclass_brier,
    poisson_result_probabilities,
    ranked_probability_score,
)


def evaluate(
    dataset_path: Path,
    model_dir: Path,
    start: str,
    end: str | None = None,
) -> dict:
    metadata = json.loads((model_dir / "metadata.json").read_text(encoding="utf-8"))
    columns = list(metadata["feature_columns"])
    medians = pd.Series(metadata.get("training_imputation", {}), dtype=float)

    frame = load_dataset(dataset_path)
    start_ts = pd.Timestamp(start, tz="UTC")
    holdout = frame[frame["kickoff_utc"] >= start_ts].copy()
    if end:
        holdout = holdout[holdout["kickoff_utc"] <= pd.Timestamp(end, tz="UTC")]
    if holdout.empty:
        raise ValueError("Untouched holdout contains no fixtures")

    x = (
        holdout[columns]
        .apply(pd.to_numeric, errors="coerce")
        .fillna(medians)
        .fillna(0.0)
    )
    y = holdout["result_class"].astype(int).to_numpy()

    result_model = joblib.load(model_dir / "result_calibrator.joblib")
    home_goal_model = joblib.load(model_dir / "home_goals_xgb.joblib")
    away_goal_model = joblib.load(model_dir / "away_goals_xgb.joblib")

    model_probs = result_model.predict_proba(x)
    home_goal_pred = np.clip(home_goal_model.predict(x), 0.05, 6.0)
    away_goal_pred = np.clip(away_goal_model.predict(x), 0.05, 6.0)
    goal_probs = poisson_result_probabilities(home_goal_pred, away_goal_pred)
    elo_probs = elo_probabilities(holdout)

    calibration = metadata.get("result_calibration", {})
    model_weight = float(calibration.get("result_model_weight", 1.0))
    goal_weight = float(calibration.get("result_goal_weight", 0.0))
    probabilities = blend_probabilities(
        model_probs,
        elo_probs,
        model_weight,
        goal_probs,
        goal_weight,
    )
    predicted = probabilities.argmax(axis=1)

    result = {
        "rows": int(len(holdout)),
        "period": {
            "start": holdout["kickoff_utc"].min().isoformat(),
            "end": holdout["kickoff_utc"].max().isoformat(),
        },
        "model_version": metadata.get("model_version"),
        "feature_profile": metadata.get("feature_profile"),
        "result": {
            "log_loss": float(log_loss(y, probabilities, labels=[0, 1, 2])),
            "multiclass_brier": multiclass_brier(y, probabilities),
            "accuracy": float(accuracy_score(y, predicted)),
            "expected_calibration_error": expected_calibration_error(y, probabilities),
            "ranked_probability_score": ranked_probability_score(y, probabilities),
        },
        "goals": {
            "home_mae": float(mean_absolute_error(holdout["home_goals"], home_goal_pred)),
            "away_mae": float(mean_absolute_error(holdout["away_goals"], away_goal_pred)),
        },
        "note": "Untouched holdout evidence; do not use these values for candidate selection or hyperparameter tuning.",
    }
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--model-dir", required=True, type=Path)
    parser.add_argument("--start", required=True)
    parser.add_argument("--end")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    result = evaluate(args.dataset, args.model_dir, args.start, args.end)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
