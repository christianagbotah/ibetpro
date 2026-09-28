from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from time import sleep

import httpx
import pandas as pd

BASE_URL = "https://v3.football.api-sports.io"


def client() -> httpx.Client:
    key = os.environ.get("API_FOOTBALL_KEY")
    if not key:
        raise RuntimeError("API_FOOTBALL_KEY is required")
    return httpx.Client(
        base_url=BASE_URL,
        headers={"x-apisports-key": key},
        timeout=30.0,
    )


def get_json(http: httpx.Client, path: str, params: dict) -> list[dict]:
    response = http.get(path, params=params)
    response.raise_for_status()
    payload = response.json()
    errors = payload.get("errors")
    if errors:
        raise RuntimeError(f"API-Football error: {errors}")
    return payload.get("response", [])


def stat_value(stats: list[dict], name: str):
    for item in stats:
        if item.get("type") == name:
            value = item.get("value")
            if isinstance(value, str) and value.endswith("%"):
                try:
                    return float(value[:-1])
                except ValueError:
                    return None
            return value
    return None



def chunks(values: list[int], size: int = 20):
    for start in range(0, len(values), size):
        yield values[start : start + size]


def embedded_fixture_stats(item: dict) -> dict[int, dict]:
    result: dict[int, dict] = {}
    for team_block in item.get("statistics", []) or []:
        team = team_block.get("team", {})
        team_id = team.get("id")
        if team_id is None:
            continue
        stats = team_block.get("statistics", []) or []
        result[int(team_id)] = {
            "shots": stat_value(stats, "Total Shots"),
            "sot": stat_value(stats, "Shots on Goal"),
            "possession": stat_value(stats, "Ball Possession"),
            "corners": stat_value(stats, "Corner Kicks"),
            "yellow_cards": stat_value(stats, "Yellow Cards"),
            "red_cards": stat_value(stats, "Red Cards"),
        }
    return result


def fetch_batched_fixture_details(
    http: httpx.Client,
    fixture_ids: list[int],
    raw_dir: Path,
    pause: float,
) -> dict[int, dict[int, dict]]:
    details: dict[int, dict[int, dict]] = {}
    for batch_index, group in enumerate(chunks(fixture_ids, 20), start=1):
        response = get_json(http, "/fixtures", {"ids": "-".join(map(str, group))})
        (raw_dir / f"fixture-details-{batch_index:03d}.json").write_text(
            json.dumps(response, indent=2),
            encoding="utf-8",
        )
        for item in response:
            fixture_id = item.get("fixture", {}).get("id")
            if fixture_id is None:
                continue
            details[int(fixture_id)] = embedded_fixture_stats(item)
        print(
            f"Collected detail batch {batch_index}: "
            f"{len(group)} fixtures ({len(details)}/{len(fixture_ids)})"
        )
        sleep(max(0.0, pause))
    return details

def fetch_fixture_stats(http: httpx.Client, fixture_id: int) -> dict[int, dict]:
    response = get_json(http, "/fixtures/statistics", {"fixture": fixture_id})
    result: dict[int, dict] = {}
    for team_block in response:
        team_id = int(team_block.get("team", {}).get("id"))
        result[team_id] = {
            "shots": stat_value(team_block.get("statistics", []), "Total Shots"),
            "sot": stat_value(team_block.get("statistics", []), "Shots on Goal"),
            "possession": stat_value(team_block.get("statistics", []), "Ball Possession"),
            "corners": stat_value(team_block.get("statistics", []), "Corner Kicks"),
        }
    return result


def fetch_fixture_odds(http: httpx.Client, fixture_id: int) -> dict:
    try:
        response = get_json(http, "/odds", {"fixture": fixture_id})
    except Exception:
        return {}
    if not response:
        return {}

    bookmakers = response[0].get("bookmakers", [])
    if not bookmakers:
        return {}

    bets = bookmakers[0].get("bets", [])
    result: dict[str, float] = {}
    for bet in bets:
        name = str(bet.get("name", "")).lower()
        values = bet.get("values", [])
        if "match winner" in name:
            for value in values:
                label = str(value.get("value", "")).lower()
                odd = value.get("odd")
                try:
                    odd = float(odd)
                except (TypeError, ValueError):
                    continue
                if label in {"home", "1"}:
                    result["home_odds"] = odd
                elif label in {"draw", "x"}:
                    result["draw_odds"] = odd
                elif label in {"away", "2"}:
                    result["away_odds"] = odd
    return result


def collect(league: int, season: int, out: Path, include_detail: bool, pause: float) -> Path:
    out.mkdir(parents=True, exist_ok=True)
    raw_dir = out / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    with client() as http:
        fixtures = get_json(http, "/fixtures", {"league": league, "season": season})

        (raw_dir / f"fixtures-{league}-{season}.json").write_text(
            json.dumps(fixtures, indent=2),
            encoding="utf-8",
        )

        finished_ids = [
            int(item.get("fixture", {}).get("id"))
            for item in fixtures
            if item.get("fixture", {}).get("id") is not None
            and item.get("goals", {}).get("home") is not None
            and item.get("goals", {}).get("away") is not None
        ]
        detail_map = (
            fetch_batched_fixture_details(
                http,
                finished_ids,
                raw_dir,
                pause,
            )
            if include_detail
            else {}
        )

        rows: list[dict] = []
        for index, item in enumerate(fixtures, start=1):
            fixture = item.get("fixture", {})
            teams = item.get("teams", {})
            goals = item.get("goals", {})
            league_info = item.get("league", {})

            fixture_id = int(fixture.get("id"))
            home_id = int(teams.get("home", {}).get("id"))
            away_id = int(teams.get("away", {}).get("id"))

            row = {
                "fixture_id": f"api-football:{fixture_id}",
                "kickoff_utc": fixture.get("date"),
                "league": league_info.get("name"),
                "season": str(league_info.get("season", season)),
                "home_team_id": f"api-football:{home_id}",
                "away_team_id": f"api-football:{away_id}",
                "home_goals": goals.get("home"),
                "away_goals": goals.get("away"),
                "home_xg": None,
                "away_xg": None,
                "home_shots": None,
                "away_shots": None,
                "home_sot": None,
                "away_sot": None,
                "home_odds": None,
                "draw_odds": None,
                "away_odds": None,
                "home_possession": None,
                "away_possession": None,
                "home_corners": None,
                "away_corners": None,
                "home_yellow_cards": None,
                "away_yellow_cards": None,
                "home_red_cards": None,
                "away_red_cards": None,
                "source": "api-football",
            }

            if include_detail and goals.get("home") is not None and goals.get("away") is not None:
                stats = detail_map.get(fixture_id, {})
                home_stats = stats.get(home_id, {})
                away_stats = stats.get(away_id, {})
                row.update(
                    {
                        "home_shots": home_stats.get("shots"),
                        "away_shots": away_stats.get("shots"),
                        "home_sot": home_stats.get("sot"),
                        "away_sot": away_stats.get("sot"),
                        "home_possession": home_stats.get("possession"),
                        "away_possession": away_stats.get("possession"),
                        "home_corners": home_stats.get("corners"),
                        "away_corners": away_stats.get("corners"),
                        "home_yellow_cards": home_stats.get("yellow_cards"),
                        "away_yellow_cards": away_stats.get("yellow_cards"),
                        "home_red_cards": home_stats.get("red_cards"),
                        "away_red_cards": away_stats.get("red_cards"),
                    }
                )

                # API-Football's historical pre-match odds endpoint does not
                # provide a durable multi-season archive. Keep historical odds
                # null here rather than spending quota on requests that cannot
                # reproduce the required pre-kickoff snapshot.

            rows.append(row)

            if index % 50 == 0:
                print(f"Collected {index}/{len(fixtures)} fixtures")

    frame = pd.DataFrame(rows)
    frame = frame.dropna(subset=["kickoff_utc", "home_goals", "away_goals"])
    frame["kickoff_utc"] = pd.to_datetime(frame["kickoff_utc"], utc=True)
    frame = frame.sort_values("kickoff_utc")

    output = out / f"api-football-{league}-{season}.csv"
    frame.to_csv(output, index=False)
    coverage_columns = [
        "home_shots",
        "away_shots",
        "home_sot",
        "away_sot",
        "home_possession",
        "away_possession",
        "home_corners",
        "away_corners",
    ]
    coverage = {
        column: round(float(frame[column].notna().mean()), 4)
        for column in coverage_columns
        if column in frame.columns
    }
    (out / f"api-football-{league}-{season}-coverage.json").write_text(
        json.dumps(
            {
                "provider": "api-football",
                "league": league,
                "season": season,
                "rows": int(len(frame)),
                "detail_enabled": include_detail,
                "coverage": coverage,
                "historical_odds_note": (
                    "Historical pre-match odds intentionally left null; "
                    "use a provider/source with timestamped historical odds."
                ),
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"Wrote {len(frame):,} finished fixtures to {output}")
    print("Coverage:", json.dumps(coverage, sort_keys=True))
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--league", required=True, type=int)
    parser.add_argument("--season", required=True, type=int)
    parser.add_argument("--out", type=Path, default=Path("data/historical"))
    parser.add_argument("--include-detail", action="store_true")
    parser.add_argument("--pause", type=float, default=0.20)
    args = parser.parse_args()

    collect(
        league=args.league,
        season=args.season,
        out=args.out,
        include_detail=args.include_detail,
        pause=args.pause,
    )
