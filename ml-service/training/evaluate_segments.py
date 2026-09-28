from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, log_loss

from training.train_xgb import (
    blend_probabilities,
    elo_probabilities,
    load_dataset,
    market_probabilities,
    multiclass_brier,
    poisson_result_probabilities,
)


def metrics(y: np.ndarray, probabilities: np.ndarray) -> dict:
    return {
        "rows": int(len(y)),
        "log_loss": float(log_loss(y, probabilities, labels=[0, 1, 2])),
        "brier": multiclass_brier(y, probabilities),
        "accuracy": float(accuracy_score(y, probabilities.argmax(axis=1))),
    }


def evaluate_segments(
    dataset: Path,
    model_dir: Path,
    start: str,
    end: str,
) -> dict:
    metadata = json.loads((model_dir / "metadata.json").read_text(encoding="utf-8"))
    columns = list(metadata["feature_columns"])
    medians = pd.Series(metadata.get("training_imputation", {}), dtype=float)

    frame = load_dataset(dataset)
    period = frame[
        (frame["kickoff_utc"] >= pd.Timestamp(start, tz="UTC"))
        & (frame["kickoff_utc"] <= pd.Timestamp(end, tz="UTC"))
    ].copy()
    if period.empty:
        raise ValueError("No rows in segment evaluation window")

    calibrator = joblib.load(model_dir / "result_calibrator.joblib")
    home_goal_model = joblib.load(model_dir / "home_goals_xgb.joblib")
    away_goal_model = joblib.load(model_dir / "away_goals_xgb.joblib")

    calibration = metadata.get("result_calibration", {})
    model_weight = float(calibration.get("result_model_weight", 1.0))
    goal_weight = float(calibration.get("result_goal_weight", 0.0))
    market_weight = float(calibration.get("result_market_weight", 0.0))

    result: dict[str, dict] = {}
    for league, segment in period.groupby("league"):
        x = (
            segment[columns]
            .apply(pd.to_numeric, errors="coerce")
            .fillna(medians)
            .fillna(0.0)
        )
        y = segment["result_class"].astype(int).to_numpy()

        model_probs = calibrator.predict_proba(x)
        home_lambdas = np.clip(home_goal_model.predict(x), 0.05, 6.0)
        away_lambdas = np.clip(away_goal_model.predict(x), 0.05, 6.0)
        goal_probs = poisson_result_probabilities(home_lambdas, away_lambdas)
        elo_probs = elo_probabilities(segment)
        market_probs = market_probabilities(segment, fallback=elo_probs)
        candidate = blend_probabilities(
            model_probs,
            elo_probs,
            model_weight,
            goal_probs,
            goal_weight,
            market_probs,
            market_weight,
        )

        result[str(league)] = {
            "candidate": metrics(y, candidate),
            "market": metrics(y, market_probs),
            "elo": metrics(y, elo_probs),
            "candidate_minus_market_log_loss": float(
                log_loss(y, candidate, labels=[0, 1, 2])
                - log_loss(y, market_probs, labels=[0, 1, 2])
            ),
        }

    return {
        "model_version": metadata.get("model_version"),
        "period": {"start": start, "end": end},
        "segments": result,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--model-dir", required=True, type=Path)
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    result = evaluate_segments(
        args.dataset,
        args.model_dir,
        args.start,
        args.end,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
