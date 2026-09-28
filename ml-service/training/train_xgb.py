from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import hashlib
import json
import os
import math

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.frozen import FrozenEstimator
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, log_loss, mean_absolute_error
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from lightgbm import LGBMClassifier
from xgboost import XGBClassifier, XGBRegressor

CORE_FEATURE_COLUMNS = [
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

CORE_STATS_FEATURE_COLUMNS = [
    "home_corners_5",
    "away_corners_5",
    "home_yellow_cards_5",
    "away_yellow_cards_5",
    "home_home_form_points_5",
    "away_away_form_points_5",
    "home_home_goals_for_5",
    "home_home_goals_against_5",
    "away_away_goals_for_5",
    "away_away_goals_against_5",
    "home_home_shots_5",
    "away_away_shots_5",
    "home_home_sot_5",
    "away_away_sot_5",
    "home_home_corners_5",
    "away_away_corners_5",
    "home_home_yellow_cards_5",
    "away_away_yellow_cards_5",
]

ENRICHED_FEATURE_COLUMNS = [
    "home_possession_5",
    "away_possession_5",
    "home_corners_5",
    "away_corners_5",
    "home_yellow_cards_5",
    "away_yellow_cards_5",
    "home_red_cards_5",
    "away_red_cards_5",
]


def feature_columns(profile: str) -> list[str]:
    if profile == "core":
        return list(CORE_FEATURE_COLUMNS)
    if profile == "core_stats":
        return [*CORE_FEATURE_COLUMNS, *CORE_STATS_FEATURE_COLUMNS]
    if profile == "enriched":
        return [
            *CORE_FEATURE_COLUMNS,
            *CORE_STATS_FEATURE_COLUMNS,
            *ENRICHED_FEATURE_COLUMNS,
        ]
    raise ValueError(f"Unsupported feature profile: {profile}")


REQUIRED_COLUMNS = [
    "kickoff_utc",
    "home_goals",
    "away_goals",
    "result_class",
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


def market_valid_mask(frame: pd.DataFrame) -> np.ndarray:
    columns = ["home_implied_prob", "draw_implied_prob", "away_implied_prob"]
    values = frame[columns].apply(pd.to_numeric, errors="coerce").to_numpy(dtype=float)
    return np.isfinite(values).all(axis=1) & (values.sum(axis=1) > 0)


def market_probabilities(
    frame: pd.DataFrame,
    fallback: np.ndarray | None = None,
) -> np.ndarray:
    columns = ["home_implied_prob", "draw_implied_prob", "away_implied_prob"]
    values = frame[columns].apply(pd.to_numeric, errors="coerce").to_numpy(dtype=float)
    valid = market_valid_mask(frame)
    result = np.zeros_like(values, dtype=float)

    if valid.any():
        rows = values[valid]
        result[valid] = rows / rows.sum(axis=1, keepdims=True)

    if (~valid).any():
        if fallback is not None:
            result[~valid] = fallback[~valid]
        else:
            result[~valid] = np.array([1 / 3, 1 / 3, 1 / 3], dtype=float)

    return result


def paired_log_loss_bootstrap(
    y_true: np.ndarray,
    candidate_probs: np.ndarray,
    benchmark_probs: np.ndarray,
    iterations: int = 4000,
    seed: int = 42,
) -> dict[str, float]:
    if len(y_true) == 0:
        raise ValueError("Cannot bootstrap an empty comparison set")

    indices = np.arange(len(y_true))
    candidate_losses = -np.log(
        np.clip(candidate_probs[indices, y_true.astype(int)], 1e-12, 1.0)
    )
    benchmark_losses = -np.log(
        np.clip(benchmark_probs[indices, y_true.astype(int)], 1e-12, 1.0)
    )
    paired_delta = candidate_losses - benchmark_losses

    rng = np.random.default_rng(seed)
    sampled_means = np.empty(iterations, dtype=float)
    for iteration in range(iterations):
        sample = rng.integers(0, len(paired_delta), size=len(paired_delta))
        sampled_means[iteration] = float(paired_delta[sample].mean())

    low, high = np.quantile(sampled_means, [0.025, 0.975])
    return {
        "candidate_log_loss": float(candidate_losses.mean()),
        "benchmark_log_loss": float(benchmark_losses.mean()),
        "delta": float(paired_delta.mean()),
        "bootstrap_ci95_low": float(low),
        "bootstrap_ci95_high": float(high),
        "probability_candidate_better": float(np.mean(sampled_means < 0.0)),
        "iterations": int(iterations),
    }


def poisson_result_probabilities(
    home_lambdas: np.ndarray,
    away_lambdas: np.ndarray,
    max_goals: int = 8,
) -> np.ndarray:
    rows: list[list[float]] = []
    factorials = np.array([math.factorial(i) for i in range(max_goals + 1)], dtype=float)
    goals = np.arange(max_goals + 1, dtype=float)

    for home_lambda, away_lambda in zip(home_lambdas, away_lambdas):
        home = np.exp(-home_lambda) * np.power(home_lambda, goals) / factorials
        away = np.exp(-away_lambda) * np.power(away_lambda, goals) / factorials
        matrix = np.outer(home, away)
        matrix = matrix / matrix.sum()
        rows.append([
            float(np.tril(matrix, k=-1).sum()),
            float(np.trace(matrix)),
            float(np.triu(matrix, k=1).sum()),
        ])

    return np.asarray(rows, dtype=float)


def blend_probabilities(
    model_probs: np.ndarray,
    elo_probs: np.ndarray,
    model_weight: float,
    goal_probs: np.ndarray | None = None,
    goal_weight: float = 0.0,
    market_probs: np.ndarray | None = None,
    market_weight: float = 0.0,
) -> np.ndarray:
    elo_weight = 1.0 - model_weight - goal_weight - market_weight
    if elo_weight < -1e-9:
        raise ValueError("Blend weights exceed 1.0")

    blended = model_weight * model_probs + max(0.0, elo_weight) * elo_probs
    if goal_probs is not None and goal_weight > 0:
        blended = blended + goal_weight * goal_probs
    if market_probs is not None and market_weight > 0:
        blended = blended + market_weight * market_probs

    return blended / blended.sum(axis=1, keepdims=True)


def train(
    dataset_path: Path,
    output_dir: Path,
    split: ChronologicalSplit,
    feature_profile: str = "core",
) -> dict:
    columns = feature_columns(feature_profile)
    frame = load_dataset(dataset_path)
    missing_features = [column for column in columns if column not in frame.columns]
    if missing_features:
        raise ValueError(
            f"Dataset is missing {feature_profile} feature columns: {missing_features}"
        )
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
    train_medians = train_df[columns].median(numeric_only=True).fillna(0.0)

    def features(df: pd.DataFrame) -> pd.DataFrame:
        return df[columns].apply(pd.to_numeric, errors="coerce").fillna(train_medians)

    x_train = features(train_df)
    y_train = train_df["result_class"].astype(int)

    result_models = {
        "xgboost": XGBClassifier(
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
        ),
        "lightgbm": LGBMClassifier(
            objective="multiclass",
            num_class=3,
            n_estimators=600,
            learning_rate=0.03,
            num_leaves=24,
            max_depth=6,
            subsample=0.85,
            colsample_bytree=0.85,
            min_child_samples=30,
            reg_alpha=0.2,
            reg_lambda=2.0,
            random_state=42,
            n_jobs=train_jobs,
            verbosity=-1,
        ),
        **{
            "logistic_c_%s" % str(c_value).replace(".", "_"): Pipeline(
                [
                    ("scale", StandardScaler()),
                    (
                        "model",
                        LogisticRegression(
                            C=c_value,
                            max_iter=3000,
                            solver="lbfgs",
                            random_state=42,
                        ),
                    ),
                ]
            )
            for c_value in (0.05, 0.10, 0.20, 0.35, 0.60, 1.00, 2.00)
        },
    }
    for model in result_models.values():
        model.fit(x_train, y_train)

    calibration_df = calibration_df.sort_values("kickoff_utc").reset_index(drop=True)
    split_at = max(1, len(calibration_df) // 2)
    calibration_fit_df = calibration_df.iloc[:split_at]
    calibration_select_df = calibration_df.iloc[split_at:]
    if calibration_select_df.empty:
        raise ValueError("Calibration selection split is empty")

    calibration_candidates = {}
    selection_y = calibration_select_df["result_class"].astype(int).to_numpy()
    selection_x = features(calibration_select_df)
    calibration_fit_x = features(calibration_fit_df)
    calibration_fit_y = calibration_fit_df["result_class"].astype(int)

    for model_name, model in result_models.items():
        raw_selection = model.predict_proba(selection_x)
        calibration_candidates[f"{model_name}:raw"] = {
            "model_name": model_name,
            "method": "raw",
            "log_loss": float(
                log_loss(selection_y, raw_selection, labels=[0, 1, 2])
            ),
            "probabilities": raw_selection,
        }

        for method in ("sigmoid", "isotonic"):
            candidate = CalibratedClassifierCV(
                FrozenEstimator(model),
                method=method,
            )
            candidate.fit(calibration_fit_x, calibration_fit_y)
            probabilities = candidate.predict_proba(selection_x)
            calibration_candidates[f"{model_name}:{method}"] = {
                "model_name": model_name,
                "method": method,
                "log_loss": float(
                    log_loss(selection_y, probabilities, labels=[0, 1, 2])
                ),
                "probabilities": probabilities,
            }

    selected_key = min(
        calibration_candidates,
        key=lambda name: calibration_candidates[name]["log_loss"],
    )
    selected_candidate = calibration_candidates[selected_key]
    selected_model_name = selected_candidate["model_name"]
    selected_method = selected_candidate["method"]
    result_model = result_models[selected_model_name]

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

    selected_model_probs = selected_candidate["probabilities"]

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

    selection_elo = elo_probabilities(calibration_select_df)
    selection_home_lambda = np.clip(
        home_goal_model.predict(selection_x), 0.05, 6.0
    )
    selection_away_lambda = np.clip(
        away_goal_model.predict(selection_x), 0.05, 6.0
    )
    selection_goal_probs = poisson_result_probabilities(
        selection_home_lambda, selection_away_lambda
    )
    selection_market = market_probabilities(
        calibration_select_df,
        fallback=selection_elo,
    )

    blend_scores: dict[str, float] = {}
    blend_candidates: list[tuple[float, float, float]] = []
    grid = [round(value, 2) for value in np.linspace(0.0, 1.0, 21)]
    for model_weight in grid:
        for goal_weight in grid:
            for market_weight in grid:
                if model_weight + goal_weight + market_weight > 1.000001:
                    continue
                key = (
                    "model=%.2f,goal=%.2f,market=%.2f"
                    % (model_weight, goal_weight, market_weight)
                )
                score = float(
                    log_loss(
                        selection_y,
                        blend_probabilities(
                            selected_model_probs,
                            selection_elo,
                            model_weight,
                            selection_goal_probs,
                            goal_weight,
                            selection_market,
                            market_weight,
                        ),
                        labels=[0, 1, 2],
                    )
                )
                blend_scores[key] = score
                blend_candidates.append(
                    (model_weight, goal_weight, market_weight)
                )

    result_model_weight, result_goal_weight, result_market_weight = min(
        blend_candidates,
        key=lambda weights: blend_scores[
            "model=%.2f,goal=%.2f,market=%.2f" % weights
        ],
    )
    x_test = features(test_df)
    y_test = test_df["result_class"].astype(int).to_numpy()
    calibrated_test = (
        result_model.predict_proba(x_test)
        if calibrator is None
        else calibrator.predict_proba(x_test)
    )
    home_goal_pred = np.clip(home_goal_model.predict(x_test), 0.05, 6.0)
    away_goal_pred = np.clip(away_goal_model.predict(x_test), 0.05, 6.0)
    goal_test_probs = poisson_result_probabilities(home_goal_pred, away_goal_pred)
    test_elo = elo_probabilities(test_df)
    test_market = market_probabilities(test_df, fallback=test_elo)
    probabilities = blend_probabilities(
        calibrated_test,
        test_elo,
        result_model_weight,
        goal_test_probs,
        result_goal_weight,
        test_market,
        result_market_weight,
    )
    predicted_class = np.argmax(probabilities, axis=1)

    market_mask = market_valid_mask(test_df)
    if market_mask.any():
        market_comparison = {
            **paired_log_loss_bootstrap(
                y_test[market_mask],
                probabilities[market_mask],
                test_market[market_mask],
            ),
            "rows": int(market_mask.sum()),
            "coverage": float(market_mask.mean()),
        }
    else:
        market_comparison = None

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
        "market_comparison": market_comparison,
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(result_model, output_dir / "result_model.joblib")
    joblib.dump(
        calibrator if calibrator is not None else result_model,
        output_dir / "result_calibrator.joblib",
    )
    joblib.dump(home_goal_model, output_dir / "home_goals_xgb.joblib")
    joblib.dump(away_goal_model, output_dir / "away_goals_xgb.joblib")

    def sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    artifacts = {
        "result_model.joblib": sha256(output_dir / "result_model.joblib"),
        "result_calibrator.joblib": sha256(output_dir / "result_calibrator.joblib"),
        "home_goals_xgb.joblib": sha256(output_dir / "home_goals_xgb.joblib"),
        "away_goals_xgb.joblib": sha256(output_dir / "away_goals_xgb.joblib"),
    }

    metadata = {
        "model_version": "football-ensemble-v0",
        "feature_profile": feature_profile,
        "feature_columns": columns,
        "training_imputation": {key: float(value) for key, value in train_medians.items()},
        "result_calibration": {
            "selected_model": selected_model_name,
            "selected_method": selected_method,
            "selection_log_loss": {
                name: float(value["log_loss"])
                for name, value in calibration_candidates.items()
            },
            "result_model_weight": float(result_model_weight),
            "result_goal_weight": float(result_goal_weight),
            "result_market_weight": float(result_market_weight),
            "result_elo_weight": float(
                1.0
                - result_model_weight
                - result_goal_weight
                - result_market_weight
            ),
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
    parser.add_argument(
        "--feature-profile",
        choices=["core", "core_stats", "enriched"],
        default="core",
    )
    args = parser.parse_args()

    split = ChronologicalSplit(
        train_end=pd.Timestamp(args.train_end, tz="UTC"),
        calibration_end=pd.Timestamp(args.calibration_end, tz="UTC"),
        test_end=pd.Timestamp(args.test_end, tz="UTC"),
    )
    result = train(
        args.dataset,
        args.output,
        split,
        feature_profile=args.feature_profile,
    )
    print(json.dumps(result, indent=2))
