from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from time import sleep

import httpx
import pandas as pd

BASE_URL = "https://api.sportmonks.com/v3/football"
DEFAULT_INCLUDE = "participants;scores;statistics.type;xGFixture.type;league;season"


def client() -> httpx.Client:
    token = os.environ.get("SPORTMONKS_API_TOKEN")
    if not token:
        raise RuntimeError("SPORTMONKS_API_TOKEN is required")
    return httpx.Client(
        base_url=BASE_URL,
        headers={"Authorization": token},
        timeout=45.0,
    )


def _type_name(item: dict) -> str:
    type_data = item.get("type") or {}
    return str(
        type_data.get("code")
        or type_data.get("name")
        or item.get("type_id")
        or ""
    ).strip().lower()


def _numeric(value):
    if isinstance(value, dict):
        value = value.get("value")
    if isinstance(value, str):
        value = value.rstrip("%").strip()
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _participant_by_location(item: dict, location: str) -> dict | None:
    for participant in item.get("participants", []) or []:
        meta = participant.get("meta") or {}
        if str(meta.get("location", "")).lower() == location:
            return participant
    return None


def _score_for_participant(item: dict, participant_id: int) -> int | None:
    scores = [
        score
        for score in item.get("scores", []) or []
        if score.get("participant_id") == participant_id
    ]
    priority = ("CURRENT", "FT", "2ND_HALF")
    for description in priority:
        candidates = [
            score for score in scores
            if str(score.get("description", "")).upper() == description
        ]
        if candidates:
            value = _numeric((candidates[-1].get("score") or {}).get("goals"))
            return int(value) if value is not None else None
    if scores:
        value = _numeric((scores[-1].get("score") or {}).get("goals"))
        return int(value) if value is not None else None
    return None


def _team_statistics(item: dict, participant_id: int) -> dict:
    result = {
        "shots": None,
        "sot": None,
        "possession": None,
        "corners": None,
        "yellow_cards": None,
        "red_cards": None,
    }
    aliases = {
        "shots": ("shots-total", "total-shots", "shots total", "total shots"),
        "sot": (
            "shots-on-target",
            "shots on target",
            "shots-on-goal",
            "shots on goal",
        ),
        "possession": ("ball-possession", "ball possession", "possession"),
        "corners": ("corners", "corner-kicks", "corner kicks"),
        "yellow_cards": ("yellowcards", "yellow-cards", "yellow cards"),
        "red_cards": ("redcards", "red-cards", "red cards"),
    }
    for stat in item.get("statistics", []) or []:
        if stat.get("participant_id") != participant_id:
            continue
        name = _type_name(stat)
        for key, names in aliases.items():
            if name in names:
                result[key] = _numeric(stat.get("data"))
                break
    return result


def _fixture_xg(item: dict, location: str) -> float | None:
    for record in item.get("xgfixture", []) or []:
        if str(record.get("location", "")).lower() != location:
            continue
        name = _type_name(record)
        if name in ("expected-goals", "expected goals", "xg"):
            return _numeric(record.get("data"))
    return None


def normalize_fixture(item: dict) -> dict | None:
    home = _participant_by_location(item, "home")
    away = _participant_by_location(item, "away")
    if not home or not away:
        return None

    fixture_id = item.get("id")
    if fixture_id is None:
        return None

    home_id = int(home["id"])
    away_id = int(away["id"])
    home_goals = _score_for_participant(item, home_id)
    away_goals = _score_for_participant(item, away_id)
    if home_goals is None or away_goals is None:
        return None

    home_stats = _team_statistics(item, home_id)
    away_stats = _team_statistics(item, away_id)
    league = item.get("league") or {}
    season = item.get("season") or {}

    return {
        "fixture_id": f"sportmonks:{fixture_id}",
        "kickoff_utc": item.get("starting_at"),
        "league": league.get("name") or str(item.get("league_id", "")),
        "season": season.get("name") or str(item.get("season_id", "")),
        "home_team_id": f"sportmonks:{home_id}",
        "away_team_id": f"sportmonks:{away_id}",
        "home_team_name": home.get("name"),
        "away_team_name": away.get("name"),
        "home_goals": home_goals,
        "away_goals": away_goals,
        "home_xg": _fixture_xg(item, "home"),
        "away_xg": _fixture_xg(item, "away"),
        "home_shots": home_stats["shots"],
        "away_shots": away_stats["shots"],
        "home_sot": home_stats["sot"],
        "away_sot": away_stats["sot"],
        "home_possession": home_stats["possession"],
        "away_possession": away_stats["possession"],
        "home_corners": home_stats["corners"],
        "away_corners": away_stats["corners"],
        "home_yellow_cards": home_stats["yellow_cards"],
        "away_yellow_cards": away_stats["yellow_cards"],
        "home_red_cards": home_stats["red_cards"],
        "away_red_cards": away_stats["red_cards"],
        "home_odds": None,
        "draw_odds": None,
        "away_odds": None,
        "source": "sportmonks",
    }


def collect(
    start_date: str,
    end_date: str,
    out: Path,
    league_ids: list[int],
    pause: float,
) -> Path:
    out.mkdir(parents=True, exist_ok=True)
    raw_dir = out / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    params: dict[str, str | int] = {
        "include": DEFAULT_INCLUDE,
        "per_page": 100,
    }
    if league_ids:
        params["filters"] = "fixtureLeagues:" + ",".join(map(str, league_ids))

    rows: list[dict] = []
    page = 1
    with client() as http:
        while True:
            params["page"] = page
            response = http.get(
                f"/fixtures/between/{start_date}/{end_date}",
                params=params,
            )
            response.raise_for_status()
            payload = response.json()

            (raw_dir / f"fixtures-{page:04d}.json").write_text(
                json.dumps(payload, indent=2),
                encoding="utf-8",
            )

            items = payload.get("data", []) or []
            for item in items:
                row = normalize_fixture(item)
                if row is not None:
                    rows.append(row)

            pagination = payload.get("pagination") or {}
            has_more = bool(pagination.get("has_more"))
            print(
                f"Sportmonks page {page}: {len(items)} fixtures, "
                f"{len(rows)} finished normalized"
            )
            if not has_more:
                break
            page += 1
            sleep(max(0.0, pause))

    frame = pd.DataFrame(rows)
    if frame.empty:
        raise RuntimeError("Sportmonks collection produced no finished fixtures")

    frame["kickoff_utc"] = pd.to_datetime(frame["kickoff_utc"], utc=True)
    frame = (
        frame.sort_values(["kickoff_utc", "fixture_id"])
        .drop_duplicates("fixture_id")
        .reset_index(drop=True)
    )

    output = out / f"sportmonks-{start_date}-{end_date}.csv"
    frame.to_csv(output, index=False)

    coverage_columns = [
        "home_xg",
        "away_xg",
        "home_shots",
        "away_shots",
        "home_sot",
        "away_sot",
        "home_possession",
        "away_possession",
        "home_corners",
        "away_corners",
        "home_yellow_cards",
        "away_yellow_cards",
    ]
    coverage = {
        column: round(float(frame[column].notna().mean()), 4)
        for column in coverage_columns
    }
    (out / "sportmonks-manifest.json").write_text(
        json.dumps(
            {
                "provider": "sportmonks",
                "start_date": start_date,
                "end_date": end_date,
                "league_ids": league_ids,
                "rows": int(len(frame)),
                "coverage": coverage,
                "includes": DEFAULT_INCLUDE,
                "license_note": (
                    "Use only under the account's Sportmonks commercial/API "
                    "subscription terms. Raw provider responses are retained "
                    "for provenance and audit."
                ),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Wrote {len(frame):,} fixtures to {output}")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument("--league-ids", nargs="*", type=int, default=[])
    parser.add_argument("--out", type=Path, default=Path("data/licensed/sportmonks"))
    parser.add_argument("--pause", type=float, default=0.15)
    args = parser.parse_args()

    collect(
        start_date=args.start,
        end_date=args.end,
        out=args.out,
        league_ids=args.league_ids,
        pause=args.pause,
    )
