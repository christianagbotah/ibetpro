from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from training.walk_forward import FOLDS


DEFAULT_RULES = {
    "minimum_train_rows": 300,
    "minimum_calibration_rows": 150,
    "minimum_test_rows": 150,
}


def validate_horizon(dataset: Path, rules: dict | None = None) -> dict:
    config = {**DEFAULT_RULES, **(rules or {})}
    frame = pd.read_csv(dataset)
    if "kickoff_utc" not in frame.columns:
        raise ValueError("Dataset requires kickoff_utc")

    frame["kickoff_utc"] = pd.to_datetime(frame["kickoff_utc"], utc=True)
    frame = frame.sort_values("kickoff_utc")

    folds: list[dict] = []
    all_ready = True

    for fold in FOLDS:
        train_end = pd.Timestamp(fold["train_end"], tz="UTC")
        calibration_end = pd.Timestamp(fold["calibration_end"], tz="UTC")
        test_end = pd.Timestamp(fold["test_end"], tz="UTC")

        train = frame[frame["kickoff_utc"] <= train_end]
        calibration = frame[
            (frame["kickoff_utc"] > train_end)
            & (frame["kickoff_utc"] <= calibration_end)
        ]
        test = frame[
            (frame["kickoff_utc"] > calibration_end)
            & (frame["kickoff_utc"] <= test_end)
        ]

        checks = {
            "train": len(train) >= int(config["minimum_train_rows"]),
            "calibration": len(calibration) >= int(config["minimum_calibration_rows"]),
            "test": len(test) >= int(config["minimum_test_rows"]),
        }
        ready = all(checks.values())
        all_ready = all_ready and ready

        folds.append(
            {
                "name": fold["name"],
                "rows": {
                    "train": int(len(train)),
                    "calibration": int(len(calibration)),
                    "test": int(len(test)),
                },
                "checks": checks,
                "ready": ready,
            }
        )

    return {
        "walk_forward_ready": all_ready,
        "dataset_rows": int(len(frame)),
        "dataset_start": frame["kickoff_utc"].min().isoformat() if len(frame) else None,
        "dataset_end": frame["kickoff_utc"].max().isoformat() if len(frame) else None,
        "rules": config,
        "folds": folds,
        "note": (
            "Historical context covers every chronological walk-forward fold."
            if all_ready
            else "Historical context is insufficient for one or more walk-forward folds; do not spend historical odds quota yet."
        ),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    result = validate_horizon(args.dataset)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))

    if not result["walk_forward_ready"]:
        raise SystemExit(2)
