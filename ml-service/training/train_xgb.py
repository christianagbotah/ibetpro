from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import accuracy_score, brier_score_loss, log_loss, mean_absolute_error
from xgboost import XGBClassifier, XGBRegressor

FEATURE_COLUMNS = [
    "home_elo",
    "away_elo",
    "elo_diff",
    "home_form_points_5",
    "away_form_points_5",
    "home_goals_for_5",
    "away_goals_for_5",
    "home_goals_against_5",
    "away_goals_against_5",
    "home_xg_for_5",
    "away_xg_for_5",
    "home_xg_against_5",
    "away_xg_against_5",
    "home_shots_5",
    "away_shots_5",
    "home_sot_5",
    "away_sot_5",
    "home_rest_days",
    "away_rest_days",
    "home_implied_prob",
    "draw_implied_prob",
    "away_implied_prob",
]

REQUIRED_COLUMNS = [
    "kickoff_utc",
    "home_goals",
    "away_goals",
    "result_class",
    *FEATURE_COLUMNS,
]


@dataclass(frozen=True)
class ChronologicalSplit:
    train_end: pd.Timestamp
    calibration_end: pd.Timestamp
    test_end: pd.Timestamp


def load_dataset(path: Path) -> pd.DataFrame:
    frame = pd.read_parquet(path) if path.suffix.lower() == ".parquet" else pd.read_csv(path)
    missing = [column for column in REQUIRED_COLUMNS if column not in frame.columns]
    if missing:
        raise ValueError(f"Dataset is missing required columns: {missing}")

    frame = frame.copy()
    frame["kickoff_utc"] = pd.to_datetime(frame["kickoff_utc"], utc=True)
    frame = frame.sort_values("kickoff_utc")
    target_columns = ["kickoff_utc", "home_goals", "away_goals", "result_class"]
    frame = frame.dropna(subset=target_columns)
    return frame


def multiclass_brier(y_true: np.ndarray, probabilities: np.ndarray) -> float:
    labels = np.eye(3)[y_true.astype(int)]
    return float(np.mean(np.sum((probabilities - labels) ** 2, axis=1)))


def train(dataset_path: Path, output_dir: Path, split: ChronologicalSplit) -> dict:
    frame = load_dataset(dataset_path)

    train_df = frame[frame["kickoff_utc"] <= split.train_end]
    calibration_df = frame[
        (frame["kickoff_utc"] > split.train_end)
        & (frame["kickoff_utc"] <= split.calibration_end)
    ]
    test_df = frame[
        (frame["kickoff_utc"] > split.calibration_end)
        & (frame["kickoff_utc"] <= split.test_end)
    ]

    if min(len(train_df), len(calibration_df), len(test_df)) == 0:
        raise ValueError(
            f"Empty chronological split: train={len(train_df)}, "
            f"calibration={len(calibration_df)}, test={len(test_df)}"
        )

    # Fit imputation values strictly on the training period to avoid
    # calibration/test leakage. Missing market/stat columns are expected for
    # some historical providers and must not cause entire fixtures to vanish.
    train_medians = train_df[FEATURE_COLUMNS].median(numeric_only=True).fillna(0.0)

    def features(df: pd.DataFrame) -> pd.DataFrame:
        return df[FEATURE_COLUMNS].apply(pd.to_numeric, errors="coerce").fillna(train_medians)

    x_train = features(train_df)
    y_train = train_df["result_class"].astype(int)

    result_model = XGBClassifier(
        objective="multi:softprob",
        num_class=3,
        n_estimators=700,
        max_depth=5,
        learning_rate=0.035,
        subsample=0.85,
        colsample_bytree=0.85,
        min_child_weight=4,
        reg_alpha=0.2,
        reg_lambda=2.0,
        eval_metric="mlogloss",
        random_state=42,
        n_jobs=-1,
    )
    result_model.fit(x_train, y_train)

    calibrator = CalibratedClassifierCV(result_model, method="isotonic", cv="prefit")
    calibrator.fit(
        features(calibration_df),
        calibration_df["result_class"].astype(int),
    )

    home_goal_model = XGBRegressor(
        objective="count:poisson",
        n_estimators=700,
        max_depth=5,
        learning_rate=0.035,
        subsample=0.85,
        colsample_bytree=0.85,
        min_child_weight=4,
        reg_alpha=0.2,
        reg_lambda=2.0,
        random_state=43,
        n_jobs=-1,
    )
    away_goal_model = XGBRegressor(
        objective="count:poisson",
        n_estimators=700,
        max_depth=5,
        learning_rate=0.035,
        subsample=0.85,
        colsample_bytree=0.85,
        min_child_weight=4,
        reg_alpha=0.2,
        reg_lambda=2.0,
        random_state=44,
        n_jobs=-1,
    )
    home_goal_model.fit(x_train, train_df["home_goals"])
    away_goal_model.fit(x_train, train_df["away_goals"])

    x_test = features(test_df)
    y_test = test_df["result_class"].astype(int).to_numpy()
    probabilities = calibrator.predict_proba(x_test)
    predicted_class = np.argmax(probabilities, axis=1)

    home_goal_pred = np.clip(home_goal_model.predict(x_test), 0, 6)
    away_goal_pred = np.clip(away_goal_model.predict(x_test), 0, 6)

    metrics = {
        "rows": {
            "train": int(len(train_df)),
            "calibration": int(len(calibration_df)),
            "test": int(len(test_df)),
        },
        "periods": {
            "train_end": split.train_end.isoformat(),
            "calibration_end": split.calibration_end.isoformat(),
            "test_end": split.test_end.isoformat(),
        },
        "result": {
            "log_loss": float(log_loss(y_test, probabilities, labels=[0, 1, 2])),
            "multiclass_brier": multiclass_brier(y_test, probabilities),
            "accuracy": float(accuracy_score(y_test, predicted_class)),
        },
        "goals": {
            "home_mae": float(mean_absolute_error(test_df["home_goals"], home_goal_pred)),
            "away_mae": float(mean_absolute_error(test_df["away_goals"], away_goal_pred)),
        },
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(result_model, output_dir / "result_xgb.joblib")
    joblib.dump(calibrator, output_dir / "result_calibrator.joblib")
    joblib.dump(home_goal_model, output_dir / "home_goals_xgb.joblib")
    joblib.dump(away_goal_model, output_dir / "away_goals_xgb.joblib")

    metadata = {
        "model_version": "xgb-football-v0",
        "feature_columns": FEATURE_COLUMNS,
        "training_imputation": {key: float(value) for key, value in train_medians.items()},
        "metrics": metrics,
        "promotion_status": "candidate",
        "notes": [
            "Chronological split only; no random train/test split.",
            "A final untouched holdout and shadow-production evaluation are still required.",
            "Training rows must contain only features available before kickoff.",
        ],
    }
    (output_dir / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return metadata


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--train-end", required=True)
    parser.add_argument("--calibration-end", required=True)
    parser.add_argument("--test-end", required=True)
    args = parser.parse_args()

    split = ChronologicalSplit(
        train_end=pd.Timestamp(args.train_end, tz="UTC"),
        calibration_end=pd.Timestamp(args.calibration_end, tz="UTC"),
        test_end=pd.Timestamp(args.test_end, tz="UTC"),
    )
    result = train(args.dataset, args.output, split)
    print(json.dumps(result, indent=2))
