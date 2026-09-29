from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd


def join_licensed_context(
    fixtures_path: Path,
    odds_path: Path,
    output: Path,
) -> dict:
    fixtures = pd.read_csv(fixtures_path)
    odds = pd.read_csv(odds_path)

    fixtures["kickoff_utc"] = pd.to_datetime(fixtures["kickoff_utc"], utc=True)
    odds["captured_at"] = pd.to_datetime(odds["captured_at"], utc=True)

    merged_rows: list[dict] = []
    matched = 0
    rejected_post_kickoff = 0

    grouped = {
        str(fixture_id): group.sort_values("captured_at")
        for fixture_id, group in odds.groupby("fixture_id")
    }

    for _, fixture in fixtures.iterrows():
        row = fixture.to_dict()
        snapshots = grouped.get(str(fixture["fixture_id"]))

        row.update(
            {
                "home_odds": None,
                "draw_odds": None,
                "away_odds": None,
                "closing_home_odds": None,
                "closing_draw_odds": None,
                "closing_away_odds": None,
                "opening_odds_captured_at": None,
                "closing_odds_captured_at": None,
            }
        )

        if snapshots is not None and not snapshots.empty:
            pre = snapshots[snapshots["captured_at"] < fixture["kickoff_utc"]].copy()
            rejected_post_kickoff += int(len(snapshots) - len(pre))
            if not pre.empty:
                opening = pre.iloc[0]
                closing = pre.iloc[-1]
                row.update(
                    {
                        "home_odds": opening.get("home_odds"),
                        "draw_odds": opening.get("draw_odds"),
                        "away_odds": opening.get("away_odds"),
                        "closing_home_odds": closing.get("home_odds"),
                        "closing_draw_odds": closing.get("draw_odds"),
                        "closing_away_odds": closing.get("away_odds"),
                        "opening_odds_captured_at": opening["captured_at"].isoformat(),
                        "closing_odds_captured_at": closing["captured_at"].isoformat(),
                    }
                )
                matched += 1

        merged_rows.append(row)

    merged = pd.DataFrame(merged_rows).sort_values(
        ["kickoff_utc", "fixture_id"]
    ).reset_index(drop=True)

    output.parent.mkdir(parents=True, exist_ok=True)
    merged.to_csv(output, index=False)

    odds_columns = ["home_odds", "draw_odds", "away_odds"]
    closing_columns = [
        "closing_home_odds",
        "closing_draw_odds",
        "closing_away_odds",
    ]
    report = {
        "fixtures": int(len(merged)),
        "matched_fixtures": int(matched),
        "opening_market_coverage": float(
            merged[odds_columns].notna().all(axis=1).mean()
        ),
        "near_kickoff_market_coverage": float(
            merged[closing_columns].notna().all(axis=1).mean()
        ),
        "post_kickoff_snapshots_rejected": int(rejected_post_kickoff),
        "causal_rule": "Only captured_at < kickoff_utc snapshots are eligible.",
    }
    (output.parent / "licensed-join-report.json").write_text(
        json.dumps(report, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixtures", required=True, type=Path)
    parser.add_argument("--odds", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    join_licensed_context(args.fixtures, args.odds, args.output)
