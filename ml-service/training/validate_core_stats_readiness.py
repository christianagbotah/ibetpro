from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from training.train_xgb import CORE_STATS_FEATURE_COLUMNS


def validate(
    dataset: Path,
    min_coverage: float = 0.90,
    start: str | None = None,
    end: str | None = None,
) -> dict:
    frame = pd.read_parquet(dataset) if dataset.suffix.lower() == ".parquet" else pd.read_csv(dataset)
    frame["kickoff_utc"] = pd.to_datetime(frame["kickoff_utc"], utc=True)

    if start:
        frame = frame[frame["kickoff_utc"] >= pd.Timestamp(start, tz="UTC")]
    if end:
        frame = frame[frame["kickoff_utc"] <= pd.Timestamp(end, tz="UTC")]

    if frame.empty:
        raise ValueError("No rows available for core-stats readiness validation")

    coverage: dict[str, float] = {}
    missing_columns: list[str] = []
    for column in CORE_STATS_FEATURE_COLUMNS:
        if column not in frame.columns:
            missing_columns.append(column)
            coverage[column] = 0.0
            continue
        numeric = pd.to_numeric(frame[column], errors="coerce")
        coverage[column] = float(numeric.notna().mean())

    failing = {
        key: value
        for key, value in coverage.items()
        if value < min_coverage
    }

    result = {
        "rows": int(len(frame)),
        "minimum_coverage": min_coverage,
        "coverage": coverage,
        "missing_columns": missing_columns,
        "failing_features": failing,
        "ready": not missing_columns and not failing,
    }
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--min-coverage", type=float, default=0.90)
    parser.add_argument("--start")
    parser.add_argument("--end")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    result = validate(
        args.dataset,
        min_coverage=args.min_coverage,
        start=args.start,
        end=args.end,
    )
    payload = json.dumps(result, indent=2)
    print(payload)

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")

    if not result["ready"]:
        raise SystemExit(2)
