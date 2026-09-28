from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd


def merge_csvs(input_dir: Path, output: Path) -> dict:
    files = sorted(input_dir.glob("api-football-*.csv"))
    if not files:
        raise FileNotFoundError(f"No API-Football CSV files found in {input_dir}")

    frames = []
    for path in files:
        frame = pd.read_csv(path)
        frame["source_file"] = path.name
        frames.append(frame)

    merged = pd.concat(frames, ignore_index=True)
    merged["kickoff_utc"] = pd.to_datetime(merged["kickoff_utc"], utc=True)

    before = len(merged)
    merged = (
        merged.sort_values(["kickoff_utc", "fixture_id"])
        .drop_duplicates(subset=["fixture_id"], keep="last")
        .reset_index(drop=True)
    )
    duplicates_removed = before - len(merged)

    invalid = merged[
        merged["home_team_id"].isna()
        | merged["away_team_id"].isna()
        | merged["home_goals"].isna()
        | merged["away_goals"].isna()
    ]
    if not invalid.empty:
        raise ValueError(f"Corpus contains {len(invalid)} invalid finished fixtures")

    output.parent.mkdir(parents=True, exist_ok=True)
    merged.to_csv(output, index=False)

    report = {
        "files": len(files),
        "rows": int(len(merged)),
        "duplicates_removed": int(duplicates_removed),
        "start": merged["kickoff_utc"].min().isoformat(),
        "end": merged["kickoff_utc"].max().isoformat(),
        "leagues": sorted(merged["league"].dropna().astype(str).unique().tolist()),
        "seasons": sorted(merged["season"].dropna().astype(str).unique().tolist()),
        "missing": {
            column: int(merged[column].isna().sum())
            for column in [
                "home_xg",
                "away_xg",
                "home_shots",
                "away_shots",
                "home_sot",
                "away_sot",
                "home_odds",
                "draw_odds",
                "away_odds",
            ]
            if column in merged.columns
        },
    }

    (output.parent / "corpus-quality.json").write_text(
        json.dumps(report, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, default=Path("data/historical"))
    parser.add_argument("--output", type=Path, default=Path("data/corpus/football.csv"))
    args = parser.parse_args()
    merge_csvs(args.input_dir, args.output)
