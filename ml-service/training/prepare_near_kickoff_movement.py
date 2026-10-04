from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd


REQUIRED_COLUMNS = [
    "fixture_id",
    "kickoff_utc",
    "result_class",
    "closing_home_implied_prob",
    "closing_draw_implied_prob",
    "closing_away_implied_prob",
    "closing_home_market_prob",
    "closing_draw_market_prob",
    "closing_away_market_prob",
    "closing_market_overround",
    "closing_market_entropy",
    "closing_market_home_away_log_ratio",
    "closing_market_home_draw_log_ratio",
    "closing_market_away_draw_log_ratio",
    "opening_home_market_prob",
    "opening_draw_market_prob",
    "opening_away_market_prob",
    "home_market_prob_move_open",
    "draw_market_prob_move_open",
    "away_market_prob_move_open",
    "market_overround_move_open",
]


def prepare_near_kickoff_dataset(
    frame: pd.DataFrame,
    *,
    min_closing_coverage: float = 0.90,
) -> tuple[pd.DataFrame, dict]:
    missing = [column for column in REQUIRED_COLUMNS if column not in frame.columns]
    if missing:
        raise ValueError(f"Feature dataset is missing near-kickoff columns: {missing}")

    result = frame.copy()

    closing_columns = [
        "closing_home_market_prob",
        "closing_draw_market_prob",
        "closing_away_market_prob",
    ]
    closing_valid = (
        result[closing_columns]
        .apply(pd.to_numeric, errors="coerce")
        .notna()
        .all(axis=1)
    )
    coverage = float(closing_valid.mean()) if len(result) else 0.0
    if coverage < min_closing_coverage:
        raise ValueError(
            f"Closing-market coverage {coverage:.3f} is below required "
            f"{min_closing_coverage:.3f}"
        )

    # This dataset represents a near-kickoff decision point. The generic
    # training/evaluation stack always reads the authoritative market through
    # these standard fields, so replace them with the closing snapshot here.
    # The earlier market remains available only under opening_* and movement
    # feature names.
    result["home_implied_prob"] = result["closing_home_implied_prob"]
    result["draw_implied_prob"] = result["closing_draw_implied_prob"]
    result["away_implied_prob"] = result["closing_away_implied_prob"]

    result["home_market_prob"] = result["closing_home_market_prob"]
    result["draw_market_prob"] = result["closing_draw_market_prob"]
    result["away_market_prob"] = result["closing_away_market_prob"]
    result["market_overround"] = result["closing_market_overround"]
    result["market_entropy"] = result["closing_market_entropy"]
    result["market_home_away_log_ratio"] = result[
        "closing_market_home_away_log_ratio"
    ]
    result["market_home_draw_log_ratio"] = result[
        "closing_market_home_draw_log_ratio"
    ]
    result["market_away_draw_log_ratio"] = result[
        "closing_market_away_draw_log_ratio"
    ]

    # Rows without a closing market cannot participate in a closing-market
    # benchmark. Drop them explicitly rather than imputing a benchmark.
    result = result.loc[closing_valid].copy()

    movement_columns = [
        "home_market_prob_move_open",
        "draw_market_prob_move_open",
        "away_market_prob_move_open",
        "market_overround_move_open",
    ]
    movement_coverage = {
        column: float(
            pd.to_numeric(result[column], errors="coerce").notna().mean()
        )
        for column in movement_columns
    }

    report = {
        "prediction_horizon": "near-kickoff-closing-market",
        "input_rows": int(len(frame)),
        "output_rows": int(len(result)),
        "closing_market_coverage": coverage,
        "movement_coverage": movement_coverage,
        "warning": (
            "Closing prices are used only for a near-kickoff research horizon. "
            "This dataset must not be used to simulate predictions made before "
            "the closing market was available."
        ),
    }
    return result, report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--min-closing-coverage", type=float, default=0.90)
    args = parser.parse_args()

    frame = (
        pd.read_parquet(args.input)
        if args.input.suffix.lower() == ".parquet"
        else pd.read_csv(args.input)
    )
    prepared, report = prepare_near_kickoff_dataset(
        frame,
        min_closing_coverage=args.min_closing_coverage,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.suffix.lower() == ".parquet":
        prepared.to_parquet(args.output, index=False)
    else:
        prepared.to_csv(args.output, index=False)

    report_path = args.report or args.output.with_suffix(".report.json")
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
