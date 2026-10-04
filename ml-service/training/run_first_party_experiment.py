from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from training.evaluate_baselines import evaluate_baselines
from training.promotion_gate import decide
from training.train_xgb import ChronologicalSplit, train
from training.validate_first_party_export import assess


def run(
    dataset: Path,
    work_dir: Path,
    horizon: str,
    train_end: str,
    calibration_end: str,
    test_end: str,
    feature_profile: str,
    min_rows: int,
    min_completeness: float,
) -> dict:
    work_dir.mkdir(parents=True, exist_ok=True)

    readiness = assess(
        dataset,
        horizon,
        min_rows=min_rows,
        min_completeness=min_completeness,
        feature_profile=feature_profile,
    )
    (work_dir / "first-party-readiness.json").write_text(
        json.dumps(readiness, indent=2),
        encoding="utf-8",
    )
    if not readiness["ready_for_first_party_training"]:
        raise ValueError(
            "First-party export failed causal/readiness validation; "
            "see first-party-readiness.json"
        )

    split = ChronologicalSplit(
        train_end=pd.Timestamp(train_end, tz="UTC"),
        calibration_end=pd.Timestamp(calibration_end, tz="UTC"),
        test_end=pd.Timestamp(test_end, tz="UTC"),
    )

    model_dir = work_dir / "candidate"
    metadata = train(
        dataset,
        model_dir,
        split,
        feature_profile=feature_profile,
        prediction_horizon=horizon,
    )

    test_start = (
        pd.Timestamp(calibration_end, tz="UTC") + pd.Timedelta(nanoseconds=1)
    ).isoformat()
    baselines = evaluate_baselines(dataset, test_start, test_end)
    (work_dir / "baselines.json").write_text(
        json.dumps(baselines, indent=2),
        encoding="utf-8",
    )

    promotion = decide(metadata, baselines)
    (work_dir / "promotion.json").write_text(
        json.dumps(promotion, indent=2),
        encoding="utf-8",
    )

    summary = {
        "source": "ibetpro-first-party",
        "horizon": horizon,
        "feature_profile": feature_profile,
        "rows": readiness["rows"],
        "model_version": metadata["model_version"],
        "promotion_status": promotion["promotion_status"],
        "all_gates_passed": promotion["all_gates_passed"],
        "candidate_log_loss": metadata["metrics"]["result"]["log_loss"],
        "market_log_loss": (
            baselines.get("market", {}).get("log_loss")
            if baselines.get("market")
            else None
        ),
        "elo_log_loss": baselines["elo"]["log_loss"],
        "work_dir": str(work_dir),
    }
    (work_dir / "run-summary.json").write_text(
        json.dumps(summary, indent=2),
        encoding="utf-8",
    )
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--work-dir", required=True, type=Path)
    parser.add_argument("--horizon", required=True, choices=["24h", "6h", "1h"])
    parser.add_argument("--train-end", required=True)
    parser.add_argument("--calibration-end", required=True)
    parser.add_argument("--test-end", required=True)
    parser.add_argument(
        "--feature-profile",
        choices=["core", "core_stats", "market_movement", "enriched"],
        default="core",
    )
    parser.add_argument("--min-rows", type=int, default=300)
    parser.add_argument("--min-completeness", type=float, default=0.70)
    args = parser.parse_args()

    result = run(
        args.dataset,
        args.work_dir,
        args.horizon,
        args.train_end,
        args.calibration_end,
        args.test_end,
        args.feature_profile,
        args.min_rows,
        args.min_completeness,
    )
    print(json.dumps(result, indent=2))
