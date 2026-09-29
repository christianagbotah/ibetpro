from __future__ import annotations

import argparse
import io
import json
from pathlib import Path
from urllib.request import Request, urlopen

import pandas as pd

BASE_URL = "https://www.football-data.co.uk/mmz4281"

LEAGUES = {
    "E0": "Premier League",
    "SP1": "La Liga",
}


def season_code(start_year: int) -> str:
    return f"{start_year % 100:02d}{(start_year + 1) % 100:02d}"


def fetch_csv(code: str, start_year: int) -> pd.DataFrame:
    season = season_code(start_year)
    url = f"{BASE_URL}/{season}/{code}.csv"
    request = Request(url, headers={"User-Agent": "iBetPro-research/1.0"})
    with urlopen(request, timeout=30) as response:
        payload = response.read()
    return pd.read_csv(io.BytesIO(payload))


def first_present(row: pd.Series, *columns: str):
    for column in columns:
        if column in row.index and pd.notna(row[column]):
            return row[column]
    return None


def parse_date(value, start_year: int) -> pd.Timestamp:
    text = str(value).strip()
    parsed = pd.to_datetime(text, dayfirst=True, errors="coerce")
    if pd.isna(parsed):
        raise ValueError(f"Unable to parse match date: {value!r}")
    return pd.Timestamp(parsed, tz="UTC")


def normalize(frame: pd.DataFrame, code: str, start_year: int) -> pd.DataFrame:
    rows: list[dict] = []
    league = LEAGUES[code]
    season = f"{start_year}/{start_year + 1}"

    for index, row in frame.iterrows():
        home = str(row.get("HomeTeam", "")).strip()
        away = str(row.get("AwayTeam", "")).strip()
        if not home or not away or pd.isna(row.get("FTHG")) or pd.isna(row.get("FTAG")):
            continue

        kickoff = parse_date(row.get("Date"), start_year)
        fixture_id = (
            f"football-data:{code}:{season_code(start_year)}:"
            f"{kickoff.date()}:{home}:{away}"
        )

        rows.append(
            {
                "fixture_id": fixture_id,
                "kickoff_utc": kickoff.isoformat(),
                "league": league,
                "season": season,
                "home_team_id": f"football-data:{league}:{home}",
                "away_team_id": f"football-data:{league}:{away}",
                "home_goals": int(row["FTHG"]),
                "away_goals": int(row["FTAG"]),
                "home_xg": None,
                "away_xg": None,
                "home_shots": first_present(row, "HS"),
                "away_shots": first_present(row, "AS"),
                "home_sot": first_present(row, "HST"),
                "away_sot": first_present(row, "AST"),
                "home_possession": None,
                "away_possession": None,
                "home_corners": first_present(row, "HC"),
                "away_corners": first_present(row, "AC"),
                "home_yellow_cards": first_present(row, "HY"),
                "away_yellow_cards": first_present(row, "AY"),
                "home_red_cards": first_present(row, "HR"),
                "away_red_cards": first_present(row, "AR"),
                # Prefer the non-closing market set. Since 2019/20 Football-Data
                # publishes closing prices separately with C in the heading.
                "home_odds": first_present(row, "AvgH", "B365H", "WHH", "PSH"),
                "draw_odds": first_present(row, "AvgD", "B365D", "WHD", "PSD"),
                "away_odds": first_present(row, "AvgA", "B365A", "WHA", "PSA"),
                "over25_odds": first_present(
                    row, "Avg>2.5", "B365>2.5", "P>2.5", "Max>2.5"
                ),
                "under25_odds": first_present(
                    row, "Avg<2.5", "B365<2.5", "P<2.5", "Max<2.5"
                ),
                "closing_home_odds": first_present(row, "AvgCH", "B365CH", "PSCH"),
                "closing_draw_odds": first_present(row, "AvgCD", "B365CD", "PSCD"),
                "closing_away_odds": first_present(row, "AvgCA", "B365CA", "PSCA"),
                "source": "football-data.co.uk",
            }
        )

    return pd.DataFrame(rows)


def collect(
    leagues: list[str],
    start_years: list[int],
    output_dir: Path,
) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    normalized: list[pd.DataFrame] = []
    manifest: list[dict] = []

    for code in leagues:
        if code not in LEAGUES:
            raise ValueError(f"Unsupported Football-Data league code: {code}")
        for start_year in start_years:
            print(f"Downloading {LEAGUES[code]} {start_year}/{start_year + 1}")
            raw = fetch_csv(code, start_year)
            frame = normalize(raw, code, start_year)
            normalized.append(frame)
            manifest.append(
                {
                    "leagueCode": code,
                    "league": LEAGUES[code],
                    "season": f"{start_year}/{start_year + 1}",
                    "rows": int(len(frame)),
                }
            )

    corpus = pd.concat(normalized, ignore_index=True)
    corpus["kickoff_utc"] = pd.to_datetime(corpus["kickoff_utc"], utc=True)
    corpus = (
        corpus.sort_values(["kickoff_utc", "fixture_id"])
        .drop_duplicates(subset=["fixture_id"], keep="last")
        .reset_index(drop=True)
    )

    output = output_dir / "football-data-core.csv"
    corpus.to_csv(output, index=False)
    (output_dir / "football-data-manifest.json").write_text(
        json.dumps(
            {
                "source": "football-data.co.uk",
                "rows": int(len(corpus)),
                "files": manifest,
                "start": corpus["kickoff_utc"].min().isoformat(),
                "end": corpus["kickoff_utc"].max().isoformat(),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Wrote {len(corpus):,} fixtures to {output}")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--leagues", nargs="+", default=["E0", "SP1"])
    parser.add_argument(
        "--start-years",
        nargs="+",
        type=int,
        default=list(range(2019, 2026)),
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("data/public-core"),
    )
    args = parser.parse_args()
    collect(args.leagues, args.start_years, args.output_dir)
