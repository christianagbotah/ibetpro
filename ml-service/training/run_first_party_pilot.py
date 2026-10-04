from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from training.evaluate_baselines import evaluate_baselines
from training.promotion_gate import decide
from training.train_xgb import ChronologicalSplit, load_dataset, train
from training.validate_first_party_export import assess


ALLOWED_HORIZONS = {"24h", "6h", "1h"}


def derive_split(frame: pd.DataFrame) -> ChronologicalSplit:
    ordered = frame.sort_values(["kickoff_utc", "fixture_id"]).reset_index(drop=True)
    total = len(ordered)
    if total < 3:
        raise ValueError("At least three rows are required for a chronological split")

    train_index = max(1, int(total * 0.60))
    calibration_index = max(train_index + 1, int(total * 0.80))
    calibration_index = min(calibration_index, total - 1)

    train_end = pd.Timestamp(ordered.iloc[train_index - 1]["kickoff_utc"])
    calibration_end = pd.Timestamp(
        ordered.iloc[calibration_index - 1]["kickoff_utc"]
    )
    test_end = pd.Timestamp(ordered.iloc[-1]["kickoff_utc"])

    if train_end.tzinfo is None:
        train_end = train_end.tz_localize("UTC")
    if calibration_end.tzinfo is None:
        calibration_end = calibration_end.tz_localize("UTC")
    if test_end.tzinfo is None:
        test_end = test_end.tz_localize("UTC")

    if not train_end < calibration_end < test_end:
        raise ValueError(
            "Corpus does not contain enough chronological time separation "
            "for train/calibration/test periods"
        )

    return ChronologicalSplit(
        train_end=train_end,
        calibration_end=calibration_end,
        test_end=test_end,
    )


def run_first_party_pilot(
    dataset: Path,
    output: Path,
    horizon: str,
    minimum_rows: int = 300,
    feature_profile: str = "core",
    minimum_completeness: float = 0.70,
) -> dict:
    if horizon not in ALLOWED_HORIZONS:
        raise ValueError(f"Unsupported horizon: {horizon}")

    readiness = assess(
        dataset,
        horizon,
        min_rows=minimum_rows,
        min_completeness=minimum_completeness,
        feature_profile=feature_profile,
    )
    output.mkdir(parents=True, exist_ok=True)
    (output / "first-party-readiness.json").write_text(
        json.dumps(readiness, indent=2),
        encoding="utf-8",
    )
    if not readiness["ready_for_first_party_training"]:
        failed = [
            check["name"]
            for check in readiness["checks"]
            if not check["passed"]
        ]
        raise ValueError(
            "First-party export failed readiness checks: "
            + ", ".join(failed)
        )

    frame = load_dataset(dataset)

    split = derive_split(frame)
    candidate_dir = output / "candidate"
    candidate = train(
        dataset,
        candidate_dir,
        split,
        feature_profile=feature_profile,
        prediction_horizon=horizon,
    )
    candidate["model_version"] = (
        f"first-party-{horizon}-ensemble-"
        f"{split.test_end.strftime('%Y%m%d')}"
    )
    candidate["training_source"] = "ibetpro-first-party-production"
    (candidate_dir / "metadata.json").write_text(
        json.dumps(candidate, indent=2),
        encoding="utf-8",
    )

    test_start = split.calibration_end + pd.Timedelta(nanoseconds=1)
    baselines = evaluate_baselines(
        dataset,
        test_start.isoformat(),
        split.test_end.isoformat(),
    )
    decision = decide(candidate, baselines)

    output.mkdir(parents=True, exist_ok=True)
    (output / "baselines.json").write_text(
        json.dumps(baselines, indent=2),
        encoding="utf-8",
    )
    (output / "pilot-gates.json").write_text(
        json.dumps(decision, indent=2),
        encoding="utf-8",
    )

    summary = {
        "source": "ibetpro-first-party-production",
        "horizon": horizon,
        "feature_profile": feature_profile,
        "rows": int(len(frame)),
        "minimum_rows": int(minimum_rows),
        "period": {
            "start": frame["kickoff_utc"].min().isoformat(),
            "end": frame["kickoff_utc"].max().isoformat(),
        },
        "split": {
            "train_end": split.train_end.isoformat(),
            "calibration_end": split.calibration_end.isoformat(),
            "test_end": split.test_end.isoformat(),
        },
        "candidate_metrics": candidate["metrics"],
        "baselines": baselines,
        "pilot_gate_result": decision,
        "pilot_only": True,
        "shadow_eligible": False,
        "note": (
            "A pilot pass is evidence for continued research only. "
            "Cross-season/walk-forward stability and shadow-production evidence "
            "remain mandatory before any promotion."
        ),
    }
    (output / "first-party-pilot-summary.json").write_text(
        json.dumps(summary, indent=2),
        encoding="utf-8",
    )
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--horizon", required=True, choices=sorted(ALLOWED_HORIZONS))
    parser.add_argument("--minimum-rows", type=int, default=300)
    parser.add_argument("--minimum-completeness", type=float, default=0.70)
    parser.add_argument(
        "--feature-profile",
        choices=["core", "core_stats", "market_movement", "enriched"],
        default="core",
    )
    args = parser.parse_args()

    result = run_first_party_pilot(
        args.dataset,
        args.output,
        args.horizon,
        minimum_rows=args.minimum_rows,
        feature_profile=args.feature_profile,
        minimum_completeness=args.minimum_completeness,
    )
    print(json.dumps(result, indent=2))
