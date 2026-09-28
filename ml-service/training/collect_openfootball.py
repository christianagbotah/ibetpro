from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
import pandas as pd

BASE_URL = "https://raw.githubusercontent.com/openfootball/football.json/master"

LEAGUES = {
    "en.1": {
        "name": "English Premier League",
        "timezone": "Europe/London",
    },
    "es.1": {
        "name": "Spanish La Liga",
        "timezone": "Europe/Madrid",
    },
}


def team_id(name: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"openfootball:{normalized}"


def fixture_id(season: str, league: str, date: str, home: str, away: str) -> str:
    raw = f"{season}|{league}|{date}|{home}|{away}".encode("utf-8")
    digest = hashlib.sha1(raw).hexdigest()[:16]
    return f"openfootball:{league}:{season}:{digest}"


def kickoff_utc(date: str, time: str | None, timezone_name: str) -> str:
    clock = time or "12:00"
    local = datetime.strptime(f"{date} {clock}", "%Y-%m-%d %H:%M").replace(
        tzinfo=ZoneInfo(timezone_name)
    )
    return local.astimezone(ZoneInfo("UTC")).isoformat()


def final_score(match: dict) -> list[int] | None:
    score = match.get("score")
    if isinstance(score, dict):
        ft = score.get("ft")
        if (
            isinstance(ft, list)
            and len(ft) == 2
            and all(isinstance(value, (int, float)) for value in ft)
        ):
            return [int(ft[0]), int(ft[1])]
        return None

    if (
        isinstance(score, list)
        and len(score) == 2
        and all(isinstance(value, (int, float)) for value in score)
    ):
        return [int(score[0]), int(score[1])]

    return None


def collect(seasons: list[str], leagues: list[str], out: Path) -> Path:
    out.mkdir(parents=True, exist_ok=True)
    raw_dir = out / "openfootball-raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    rows: list[dict] = []
    provenance: list[dict] = []

    with httpx.Client(timeout=30.0, follow_redirects=True) as http:
        for season in seasons:
            for league_code in leagues:
                config = LEAGUES[league_code]
                url = f"{BASE_URL}/{season}/{league_code}.json"
                response = http.get(url)
                response.raise_for_status()
                payload = response.json()

                raw_path = raw_dir / f"{season}-{league_code}.json"
                raw_path.write_text(
                    json.dumps(payload, indent=2, ensure_ascii=False),
                    encoding="utf-8",
                )
                provenance.append(
                    {
                        "season": season,
                        "league": league_code,
                        "url": url,
                        "rows": len(payload.get("matches", [])),
                    }
                )

                for match in payload.get("matches", []):
                    score = final_score(match)
                    if score is None:
                        continue

                    home = str(match["team1"])
                    away = str(match["team2"])
                    date = str(match["date"])
                    home_goals = int(score[0])
                    away_goals = int(score[1])

                    rows.append(
                        {
                            "fixture_id": fixture_id(
                                season, league_code, date, home, away
                            ),
                            "kickoff_utc": kickoff_utc(
                                date,
                                match.get("time"),
                                config["timezone"],
                            ),
                            "league": config["name"],
                            "season": season,
                            "home_team_id": team_id(home),
                            "away_team_id": team_id(away),
                            "home_goals": home_goals,
                            "away_goals": away_goals,
                            "home_xg": None,
                            "away_xg": None,
                            "home_shots": None,
                            "away_shots": None,
                            "home_sot": None,
                            "away_sot": None,
                            "home_odds": None,
                            "draw_odds": None,
                            "away_odds": None,
                            "source": "openfootball-football.json",
                        }
                    )

    frame = pd.DataFrame(rows)
    if frame.empty:
        raise RuntimeError("OpenFootball collection produced no finished fixtures")

    frame["kickoff_utc"] = pd.to_datetime(frame["kickoff_utc"], utc=True)
    frame = (
        frame.sort_values(["kickoff_utc", "fixture_id"])
        .drop_duplicates(subset=["fixture_id"], keep="last")
        .reset_index(drop=True)
    )

    output = out / "openfootball-bootstrap.csv"
    frame.to_csv(output, index=False)

    manifest = {
        "source": "openfootball/football.json",
        "license": "CC0-1.0",
        "source_repository": "https://github.com/openfootball/football.json",
        "files": provenance,
        "rows": int(len(frame)),
        "start": frame["kickoff_utc"].min().isoformat(),
        "end": frame["kickoff_utc"].max().isoformat(),
    }
    (out / "openfootball-provenance.json").write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8",
    )

    print(json.dumps(manifest, indent=2))
    print(f"Wrote {len(frame):,} fixtures to {output}")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--seasons",
        nargs="+",
        default=[
            "2019-20",
            "2020-21",
            "2021-22",
            "2022-23",
            "2023-24",
            "2024-25",
            "2025-26",
        ],
    )
    parser.add_argument(
        "--leagues",
        nargs="+",
        choices=sorted(LEAGUES),
        default=["en.1", "es.1"],
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("data/openfootball"),
    )
    args = parser.parse_args()

    collect(args.seasons, args.leagues, args.out)
