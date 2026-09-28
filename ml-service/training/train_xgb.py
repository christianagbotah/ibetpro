from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import hashlib
import json
import os

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.frozen import FrozenEstimator
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



def expected_calibration_error(
    y_true: np.ndarray,
    probabilities: np.ndarray,
    bins: int = 10,
) -> float:
    confidence = probabilities.max(axis=1)
    predicted = probabilities.argmax(axis=1)
    correct = (predicted == y_true).astype(float)

    edges = np.linspace(0.0, 1.0, bins + 1)
    ece = 0.0
    total = len(y_true)
    for i in range(bins):
        lower, upper = edges[i], edges[i + 1]
        if i == bins - 1:
            mask = (confidence >= lower) & (confidence <= upper)
        else:
            mask = (confidence >= lower) & (confidence < upper)
        count = int(mask.sum())
        if count == 0:
            continue
        bin_accuracy = float(correct[mask].mean())
        bin_confidence = float(confidence[mask].mean())
        ece += (count / total) * abs(bin_accuracy - bin_confidence)
    return float(ece)


def ranked_probability_score(
    y_true: np.ndarray,
    probabilities: np.ndarray,
) -> float:
    observed = np.eye(3)[y_true.astype(int)]
    predicted_cdf = np.cumsum(probabilities, axis=1)[:, :-1]
    observed_cdf = np.cumsum(observed, axis=1)[:, :-1]
    return float(np.mean(np.sum((predicted_cdf - observed_cdf) ** 2, axis=1) / 2.0))


def elo_probabilities(frame: pd.DataFrame) -> np.ndarray:
    home = frame["home_elo"].astype(float).to_numpy() + 65.0
    away = frame["away_elo"].astype(float).to_numpy()
    home_no_draw = 1.0 / (1.0 + 10 ** ((away - home) / 400.0))
    draw = np.full(len(frame), 0.25, dtype=float)
    home_prob = home_no_draw * 0.75
    away_prob = (1.0 - home_no_draw) * 0.75
    return np.column_stack([home_prob, draw, away_prob])


def blend_probabilities(
    model_probs: np.ndarray,
    elo_probs: np.ndarray,
    model_weight: float,
) -> np.ndarray:
    blended = model_weight * model_probs + (1.0 - model_weight) * elo_probs
    return blended / blended.sum(axis=1, keepdims=True)


def train(dataset_path: Path, output_dir: Path, split: ChronologicalSplit) -> dict:
    frame = load_dataset(dataset_path)
    train_jobs = max(1, int(os.environ.get("MODEL_TRAIN_N_JOBS", "2")))

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
        n_jobs=train_jobs,
    )
    result_model.fit(x_train, y_train)

    calibration_df = calibration_df.sort_values("kickoff_utc").reset_index(drop=True)
    split_at = max(1, len(calibration_df) // 2)
    calibration_fit_df = calibration_df.iloc[:split_at]
    calibration_select_df = calibration_df.iloc[split_at:]
    if calibration_select_df.empty:
        raise ValueError("Calibration selection split is empty")

    calibration_candidates = {}
    selection_y = calibration_select_df["result_class"].astype(int).to_numpy()
    selection_x = features(calibration_select_df)

    raw_selection = result_model.predict_proba(selection_x)
    calibration_candidates["raw"] = {
        "log_loss": float(log_loss(selection_y, raw_selection, labels=[0, 1, 2])),
        "probabilities": raw_selection,
    }

    for method in ("sigmoid", "isotonic"):
        candidate = CalibratedClassifierCV(
            FrozenEstimator(result_model),
            method=method,
        )
        candidate.fit(
            features(calibration_fit_df),
            calibration_fit_df["result_class"].astype(int),
        )
        probabilities = candidate.predict_proba(selection_x)
        calibration_candidates[method] = {
            "log_loss": float(
                log_loss(selection_y, probabilities, labels=[0, 1, 2])
            ),
            "probabilities": probabilities,
        }

    selected_method = min(
        calibration_candidates,
        key=lambda name: calibration_candidates[name]["log_loss"],
    )

    if selected_method == "raw":
        calibrator = None
    else:
        calibrator = CalibratedClassifierCV(
            FrozenEstimator(result_model),
            method=selected_method,
        )
        calibrator.fit(
            features(calibration_df),
            calibration_df["result_class"].astype(int),
        )

    selected_model_probs = calibration_candidates[selected_method]["probabilities"]
    selection_elo = elo_probabilities(calibration_select_df)
    blend_grid = [round(value, 2) for value in np.linspace(0.0, 1.0, 11)]
    blend_scores = {
        weight: float(
            log_loss(
                selection_y,
                blend_probabilities(selected_model_probs, selection_elo, weight),
                labels=[0, 1, 2],
            )
        )
        for weight in blend_grid
    }
    result_model_weight = min(blend_scores, key=blend_scores.get)

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
        n_jobs=train_jobs,
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
        n_jobs=train_jobs,
    )
    home_goal_model.fit(x_train, train_df["home_goals"])
    away_goal_model.fit(x_train, train_df["away_goals"])

    x_test = features(test_df)
    y_test = test_df["result_class"].astype(int).to_numpy()
    calibrated_test = (
        result_model.predict_proba(x_test)
        if calibrator is None
        else calibrator.predict_proba(x_test)
    )
    probabilities = blend_probabilities(
        calibrated_test,
        elo_probabilities(test_df),
        result_model_weight,
    )
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
            "expected_calibration_error": expected_calibration_error(y_test, probabilities),
            "ranked_probability_score": ranked_probability_score(y_test, probabilities),
        },
        "goals": {
            "home_mae": float(mean_absolute_error(test_df["home_goals"], home_goal_pred)),
            "away_mae": float(mean_absolute_error(test_df["away_goals"], away_goal_pred)),
        },
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(result_model, output_dir / "result_xgb.joblib")
    joblib.dump(calibrator if calibrator is not None else result_model, output_dir / "result_calibrator.joblib")
    joblib.dump(home_goal_model, output_dir / "home_goals_xgb.joblib")
    joblib.dump(away_goal_model, output_dir / "away_goals_xgb.joblib")

    def sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    artifacts = {
        "result_xgb.joblib": sha256(output_dir / "result_xgb.joblib"),
        "result_calibrator.joblib": sha256(output_dir / "result_calibrator.joblib"),
        "home_goals_xgb.joblib": sha256(output_dir / "home_goals_xgb.joblib"),
        "away_goals_xgb.joblib": sha256(output_dir / "away_goals_xgb.joblib"),
    }

    metadata = {
        "model_version": "xgb-football-v0",
        "feature_columns": FEATURE_COLUMNS,
        "training_imputation": {key: float(value) for key, value in train_medians.items()},
        "result_calibration": {
            "selected_method": selected_method,
            "selection_log_loss": {
                name: float(value["log_loss"])
                for name, value in calibration_candidates.items()
            },
            "result_model_weight": float(result_model_weight),
            "blend_selection_log_loss": {
                str(weight): float(score) for weight, score in blend_scores.items()
            },
        },
        "artifacts": artifacts,
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
