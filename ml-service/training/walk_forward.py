from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from training.train_xgb import ChronologicalSplit, train


FOLDS = [
    {
        "name": "2022-23",
        "train_end": "2021-06-30",
        "calibration_end": "2022-06-30",
        "test_end": "2023-06-30",
    },
    {
        "name": "2023-24",
        "train_end": "2022-06-30",
        "calibration_end": "2023-06-30",
        "test_end": "2024-06-30",
    },
    {
        "name": "2024-25",
        "train_end": "2023-06-30",
        "calibration_end": "2024-06-30",
        "test_end": "2025-06-30",
    },
]


def timestamp(value: str) -> pd.Timestamp:
    return pd.Timestamp(value, tz="UTC")


def run_walk_forward(
    dataset: Path,
    output_dir: Path,
    feature_profile: str = "core",
) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    fold_results: list[dict] = []

    for fold in FOLDS:
        fold_dir = output_dir / fold["name"]
        metadata = train(
            dataset,
            fold_dir,
            ChronologicalSplit(
                train_end=timestamp(fold["train_end"]),
                calibration_end=timestamp(fold["calibration_end"]),
                test_end=timestamp(fold["test_end"]),
            ),
            feature_profile=feature_profile,
        )

        result = metadata["metrics"]["result"]
        market = metadata["metrics"].get("market_comparison")
        fold_results.append(
            {
                "name": fold["name"],
                "train_end": fold["train_end"],
                "calibration_end": fold["calibration_end"],
                "test_end": fold["test_end"],
                "rows": metadata["metrics"]["rows"],
                "result": result,
                "goals": metadata["metrics"]["goals"],
                "market_comparison": market,
                "blend": metadata.get("result_calibration", {}),
            }
        )

    comparable = [
        fold for fold in fold_results
        if fold.get("market_comparison") is not None
    ]
    market_wins = sum(
        1
        for fold in comparable
        if fold["market_comparison"]["delta"] < 0
    )
    significant_market_wins = sum(
        1
        for fold in comparable
        if fold["market_comparison"]["bootstrap_ci95_high"] < 0
    )

    deltas = [
        float(fold["market_comparison"]["delta"])
        for fold in comparable
    ]

    summary = {
        "feature_profile": feature_profile,
        "folds": fold_results,
        "stability": {
            "fold_count": len(fold_results),
            "market_comparable_folds": len(comparable),
            "folds_beating_market": market_wins,
            "folds_significantly_beating_market": significant_market_wins,
            "mean_candidate_minus_market_log_loss": (
                sum(deltas) / len(deltas) if deltas else None
            ),
            "all_folds_beat_market": (
                len(comparable) == len(fold_results)
                and market_wins == len(fold_results)
            ),
            "all_folds_significantly_beat_market": (
                len(comparable) == len(fold_results)
                and significant_market_wins == len(fold_results)
            ),
        },
        "note": (
            "Walk-forward folds are chronological and have disjoint test seasons. "
            "The 2025/26 untouched holdout is not used here."
        ),
    }

    (output_dir / "walk-forward.json").write_text(
        json.dumps(summary, indent=2),
        encoding="utf-8",
    )
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--feature-profile",
        choices=["core", "enriched"],
        default="core",
    )
    args = parser.parse_args()

    result = run_walk_forward(
        args.dataset,
        args.output,
        feature_profile=args.feature_profile,
    )
    print(json.dumps(result, indent=2))
