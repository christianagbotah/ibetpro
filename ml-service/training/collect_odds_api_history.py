from __future__ import annotations

import argparse
import json
import os
import re
from collections import defaultdict
from datetime import timedelta
from pathlib import Path

import httpx
import pandas as pd

BASE_URL = "https://api.the-odds-api.com/v4"
DEFAULT_OFFSETS_HOURS = (48, 24, 6, 1)


def normalize_team(value: str) -> str:
    value = value.lower().replace("&", "and")
    value = re.sub(r"\b(fc|cf|afc|cfc|club|football)\b", " ", value)
    return re.sub(r"[^a-z0-9]+", "", value)


def bucket_timestamp(value: pd.Timestamp, minutes: int) -> pd.Timestamp:
    epoch = int(value.timestamp())
    step = minutes * 60
    return pd.Timestamp(epoch - (epoch % step), unit="s", tz="UTC")


def build_plan(
    fixtures: pd.DataFrame,
    offsets_hours: tuple[int, ...] = DEFAULT_OFFSETS_HOURS,
    bucket_minutes: int = 60,
) -> list[dict]:
    if "kickoff_utc" not in fixtures.columns:
        raise ValueError("Fixture corpus requires kickoff_utc")
    if "home_team_name" not in fixtures.columns or "away_team_name" not in fixtures.columns:
        raise ValueError("Fixture corpus requires home_team_name and away_team_name")

    frame = fixtures.copy()
    frame["kickoff_utc"] = pd.to_datetime(frame["kickoff_utc"], utc=True)
    buckets: dict[pd.Timestamp, set[str]] = defaultdict(set)

    for _, row in frame.iterrows():
        for offset in offsets_hours:
            target = row["kickoff_utc"] - timedelta(hours=offset)
            bucket = bucket_timestamp(target, bucket_minutes)
            buckets[bucket].add(str(row["fixture_id"]))

    return [
        {
            "snapshot_at": timestamp.isoformat(),
            "fixture_ids": sorted(ids),
            "fixture_count": len(ids),
        }
        for timestamp, ids in sorted(buckets.items())
    ]


def api_client() -> httpx.Client:
    key = os.environ.get("ODDS_API_KEY")
    if not key:
        raise RuntimeError("ODDS_API_KEY is required for --execute")
    return httpx.Client(base_url=BASE_URL, timeout=45.0), key


def consensus_1x2(event: dict) -> tuple[float | None, float | None, float | None]:
    prices: dict[str, list[float]] = defaultdict(list)
    home = str(event.get("home_team", ""))
    away = str(event.get("away_team", ""))

    for bookmaker in event.get("bookmakers", []) or []:
        for market in bookmaker.get("markets", []) or []:
            if market.get("key") != "h2h":
                continue
            for outcome in market.get("outcomes", []) or []:
                name = str(outcome.get("name", ""))
                price = outcome.get("price")
                if not isinstance(price, (int, float)) or price <= 1:
                    continue
                if normalize_team(name) == normalize_team(home):
                    prices["home"].append(float(price))
                elif normalize_team(name) == normalize_team(away):
                    prices["away"].append(float(price))
                elif name.lower() in {"draw", "tie"}:
                    prices["draw"].append(float(price))

    def mean(key: str):
        values = prices.get(key, [])
        return sum(values) / len(values) if values else None

    return mean("home"), mean("draw"), mean("away")


def match_fixture(event: dict, fixtures: pd.DataFrame) -> str | None:
    event_home = normalize_team(str(event.get("home_team", "")))
    event_away = normalize_team(str(event.get("away_team", "")))
    event_time = pd.to_datetime(event.get("commence_time"), utc=True, errors="coerce")
    if pd.isna(event_time):
        return None

    candidates = fixtures[
        (fixtures["_home_key"] == event_home)
        & (fixtures["_away_key"] == event_away)
        & ((fixtures["kickoff_utc"] - event_time).abs() <= pd.Timedelta(hours=3))
    ]
    if candidates.empty:
        return None
    return str(candidates.iloc[0]["fixture_id"])


def collect(
    fixtures_path: Path,
    sport_key: str,
    out: Path,
    region: str,
    offsets_hours: tuple[int, ...],
    bucket_minutes: int,
    execute: bool,
) -> dict:
    fixtures = pd.read_csv(fixtures_path)
    fixtures["kickoff_utc"] = pd.to_datetime(fixtures["kickoff_utc"], utc=True)
    fixtures["_home_key"] = fixtures["home_team_name"].astype(str).map(normalize_team)
    fixtures["_away_key"] = fixtures["away_team_name"].astype(str).map(normalize_team)

    plan = build_plan(fixtures, offsets_hours, bucket_minutes)
    regions = [item.strip() for item in region.split(",") if item.strip()]
    # Historical featured-market endpoint: 10 credits per market per region.
    # We request only h2h, so this is a worst-case upper bound; empty responses
    # are not charged by the provider.
    estimated_max_credits = len(plan) * 10 * max(len(regions), 1)
    out.mkdir(parents=True, exist_ok=True)
    (out / "historical-odds-plan.json").write_text(
        json.dumps(
            {
                "provider": "the-odds-api",
                "sport_key": sport_key,
                "region": region,
                "offsets_hours": list(offsets_hours),
                "bucket_minutes": bucket_minutes,
                "planned_api_calls": len(plan),
                "estimated_max_credits": estimated_max_credits,
                "credit_formula": "10 x historical calls x regions x 1 h2h market",
                "fixtures": int(len(fixtures)),
                "plan": plan,
                "note": (
                    "Dry-run by default. Historical odds require a paid The Odds API plan. "
                    "Review planned call count and subscription quota before --execute."
                ),
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "fixtures": int(len(fixtures)),
                "planned_api_calls": len(plan),
                "estimated_max_credits": estimated_max_credits,
                "execute": execute,
            },
            indent=2,
        )
    )
    if not execute:
        return {
            "planned_api_calls": len(plan),
            "estimated_max_credits": estimated_max_credits,
            "rows": 0,
        }

    http, key = api_client()
    rows: list[dict] = []
    credits_used_observed = 0
    last_remaining: int | None = None
    raw_dir = out / "raw"
    raw_dir.mkdir(exist_ok=True)

    try:
        for index, request in enumerate(plan, start=1):
            response = http.get(
                f"/historical/sports/{sport_key}/odds",
                params={
                    "apiKey": key,
                    "regions": region,
                    "markets": "h2h",
                    "oddsFormat": "decimal",
                    "date": request["snapshot_at"],
                },
            )
            response.raise_for_status()
            try:
                credits_used_observed += int(response.headers.get("x-requests-last", "0"))
            except ValueError:
                pass
            try:
                last_remaining = int(response.headers.get("x-requests-remaining", ""))
            except ValueError:
                pass
            payload = response.json()
            (raw_dir / f"snapshot-{index:05d}.json").write_text(
                json.dumps(payload, indent=2),
                encoding="utf-8",
            )

            snapshot_at = payload.get("timestamp") or request["snapshot_at"]
            for event in payload.get("data", []) or []:
                fixture_id = match_fixture(event, fixtures)
                if not fixture_id:
                    continue
                home_odds, draw_odds, away_odds = consensus_1x2(event)
                if not all(value is not None for value in (home_odds, draw_odds, away_odds)):
                    continue
                rows.append(
                    {
                        "fixture_id": fixture_id,
                        "provider_event_id": event.get("id"),
                        "captured_at": snapshot_at,
                        "requested_at": request["snapshot_at"],
                        "home_odds": home_odds,
                        "draw_odds": draw_odds,
                        "away_odds": away_odds,
                        "source": "the-odds-api",
                    }
                )
            print(f"Historical odds {index}/{len(plan)}")
    finally:
        http.close()

    frame = pd.DataFrame(rows)
    output = out / "historical-odds.csv"
    frame.to_csv(output, index=False)

    manifest = {
        "provider": "the-odds-api",
        "sport_key": sport_key,
        "planned_api_calls": len(plan),
        "estimated_max_credits": estimated_max_credits,
        "observed_credits_used": credits_used_observed,
        "credits_remaining_after_last_call": last_remaining,
        "rows": int(len(frame)),
        "matched_fixtures": int(frame["fixture_id"].nunique()) if not frame.empty else 0,
        "license_note": "Use under the account's paid The Odds API subscription terms.",
    }
    (out / "historical-odds-manifest.json").write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8",
    )
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixtures", required=True, type=Path)
    parser.add_argument("--sport-key", required=True)
    parser.add_argument("--out", type=Path, default=Path("data/licensed/odds-history"))
    parser.add_argument("--region", default="uk")
    parser.add_argument("--offset-hours", nargs="+", type=int, default=list(DEFAULT_OFFSETS_HOURS))
    parser.add_argument("--bucket-minutes", type=int, default=60)
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually spend historical API quota. Without this flag the command is dry-run only.",
    )
    args = parser.parse_args()

    collect(
        fixtures_path=args.fixtures,
        sport_key=args.sport_key,
        out=args.out,
        region=args.region,
        offsets_hours=tuple(args.offset_hours),
        bucket_minutes=args.bucket_minutes,
        execute=args.execute,
    )
