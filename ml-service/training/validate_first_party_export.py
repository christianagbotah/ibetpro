from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

HORIZON_WINDOWS = {
    "24h": (18 * 60, 30 * 60),
    "6h": (4 * 60, 8 * 60),
    "1h": (30, 90),
}

REQUIRED_COLUMNS = {
    "fixture_id",
    "kickoff_utc",
    "home_goals",
    "away_goals",
    "result_class",
    "snapshot_as_of",
    "horizon_key",
    "feature_schema_version",
    "feature_hash",
    "horizon_minutes_actual",
    "feature_completeness",
    "market_consensus_available",
    "market_snapshot_count",
}


def assess(
    dataset: Path,
    horizon: str,
    *,
    min_rows: int = 300,
    min_completeness: float = 0.70,
) -> dict:
    if horizon not in HORIZON_WINDOWS:
        raise ValueError(f"Unsupported horizon: {horizon}")

    frame = pd.read_csv(dataset)
    missing = sorted(REQUIRED_COLUMNS - set(frame.columns))
    if missing:
        raise ValueError(f"First-party export is missing columns: {missing}")

    frame = frame.copy()
    frame["kickoff_utc"] = pd.to_datetime(frame["kickoff_utc"], utc=True)
    frame["snapshot_as_of"] = pd.to_datetime(frame["snapshot_as_of"], utc=True)
    frame["horizon_minutes_actual"] = pd.to_numeric(
        frame["horizon_minutes_actual"], errors="coerce"
    )
    frame["feature_completeness"] = pd.to_numeric(
        frame["feature_completeness"], errors="coerce"
    )

    lower, upper = HORIZON_WINDOWS[horizon]
    horizon_match = frame["horizon_key"].astype(str).eq(horizon)
    timing_valid = frame["horizon_minutes_actual"].between(
        lower, upper, inclusive="both"
    )
    pre_kickoff = frame["snapshot_as_of"] < frame["kickoff_utc"]
    consensus = (
        frame["market_consensus_available"]
        .astype(str)
        .str.lower()
        .isin({"true", "1"})
    )
    complete = frame["feature_completeness"] >= min_completeness
    labeled = (
        frame["home_goals"].notna()
        & frame["away_goals"].notna()
        & frame["result_class"].notna()
    )
    duplicate_fixture_rows = int(frame.duplicated(subset=["fixture_id"]).sum())

    checks = [
        {
            "name": "minimum_rows",
            "actual": int(len(frame)),
            "threshold": int(min_rows),
            "passed": int(len(frame)) >= int(min_rows),
        },
        {
            "name": "single_expected_horizon",
            "actual": int(horizon_match.sum()),
            "threshold": int(len(frame)),
            "passed": bool(horizon_match.all()),
        },
        {
            "name": "horizon_window_compliance",
            "actual": int(timing_valid.sum()),
            "threshold": int(len(frame)),
            "passed": bool(timing_valid.all()),
        },
        {
            "name": "pre_kickoff_snapshots",
            "actual": int(pre_kickoff.sum()),
            "threshold": int(len(frame)),
            "passed": bool(pre_kickoff.all()),
        },
        {
            "name": "genuine_market_consensus",
            "actual": int(consensus.sum()),
            "threshold": int(len(frame)),
            "passed": bool(consensus.all()),
        },
        {
            "name": "minimum_feature_completeness",
            "actual": float(frame["feature_completeness"].min())
            if len(frame)
            else 0.0,
            "threshold": float(min_completeness),
            "passed": bool(complete.all()) if len(frame) else False,
        },
        {
            "name": "all_rows_labeled",
            "actual": int(labeled.sum()),
            "threshold": int(len(frame)),
            "passed": bool(labeled.all()),
        },
        {
            "name": "unique_fixture_rows",
            "actual": duplicate_fixture_rows,
            "threshold": 0,
            "passed": duplicate_fixture_rows == 0,
        },
    ]

    ready = all(check["passed"] for check in checks)
    report = {
        "ready_for_first_party_training": ready,
        "horizon": horizon,
        "rows": int(len(frame)),
        "period": {
            "start": frame["kickoff_utc"].min().isoformat() if len(frame) else None,
            "end": frame["kickoff_utc"].max().isoformat() if len(frame) else None,
        },
        "feature_schema_versions": sorted(
            frame["feature_schema_version"].dropna().astype(str).unique().tolist()
        ),
        "average_feature_completeness": (
            float(frame["feature_completeness"].mean()) if len(frame) else 0.0
        ),
        "average_market_snapshot_count": (
            float(
                pd.to_numeric(
                    frame["market_snapshot_count"], errors="coerce"
                ).fillna(0).mean()
            )
            if len(frame)
            else 0.0
        ),
        "checks": checks,
    }
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--horizon", required=True, choices=list(HORIZON_WINDOWS))
    parser.add_argument("--min-rows", type=int, default=300)
    parser.add_argument("--min-completeness", type=float, default=0.70)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    result = assess(
        args.dataset,
        args.horizon,
        min_rows=args.min_rows,
        min_completeness=args.min_completeness,
    )
    payload = json.dumps(result, indent=2)
    print(payload)

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")

    if not result["ready_for_first_party_training"]:
        raise SystemExit(2)
