from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from training.collect_odds_api_history import (
    build_plan,
    canonical_team_key,
    collect,
    load_team_aliases,
    match_fixture,
    normalize_team,
)


def _fixtures() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "fixture_id": "sportmonks:1",
                "kickoff_utc": "2025-08-10T15:00:00Z",
                "home_team_name": "Home FC",
                "away_team_name": "Away FC",
            },
            {
                "fixture_id": "sportmonks:2",
                "kickoff_utc": "2025-08-10T17:30:00Z",
                "home_team_name": "Another FC",
                "away_team_name": "Visitors FC",
            },
        ]
    )


def test_build_plan_buckets_pre_kickoff_snapshots():
    plan = build_plan(
        _fixtures(),
        offsets_hours=(24, 1),
        bucket_minutes=60,
    )

    assert len(plan) == 4
    assert all(item["fixture_count"] >= 1 for item in plan)
    assert all("snapshot_at" in item for item in plan)


def test_dry_run_reports_worst_case_historical_credit_cost(tmp_path: Path):
    fixtures_path = tmp_path / "fixtures.csv"
    _fixtures().to_csv(fixtures_path, index=False)

    out = tmp_path / "odds"
    result = collect(
        fixtures_path=fixtures_path,
        sport_key="soccer_epl",
        out=out,
        region="uk,eu",
        offsets_hours=(24, 1),
        bucket_minutes=60,
        execute=False,
    )

    plan = json.loads((out / "historical-odds-plan.json").read_text())

    assert result["planned_api_calls"] == 4
    # 4 historical snapshots × 10 credits × 2 regions × 1 h2h market.
    assert result["estimated_max_credits"] == 80
    assert plan["estimated_max_credits"] == 80
    assert plan["credit_formula"] == "10 x historical calls x regions x 1 h2h market"


def test_match_fixture_respects_planned_fixture_ids():
    fixtures = pd.DataFrame(
        [
            {
                "fixture_id": "sportmonks:allowed",
                "kickoff_utc": pd.Timestamp("2025-08-10T15:00:00Z"),
                "home_team_name": "Manchester City",
                "away_team_name": "Liverpool",
            },
            {
                "fixture_id": "sportmonks:other",
                "kickoff_utc": pd.Timestamp("2025-08-10T15:30:00Z"),
                "home_team_name": "Manchester City",
                "away_team_name": "Liverpool",
            },
        ]
    )
    fixtures["_home_key"] = fixtures["home_team_name"].map(normalize_team)
    fixtures["_away_key"] = fixtures["away_team_name"].map(normalize_team)

    event = {
        "home_team": "Manchester City",
        "away_team": "Liverpool",
        "commence_time": "2025-08-10T15:30:00Z",
    }

    matched = match_fixture(
        event,
        fixtures,
        allowed_fixture_ids={"sportmonks:allowed"},
    )

    assert matched == "sportmonks:allowed"


def test_explicit_alias_maps_provider_team_name_without_fuzzy_matching(tmp_path: Path):
    aliases_path = tmp_path / "aliases.json"
    aliases_path.write_text(
        json.dumps({"Man Utd": "Manchester United"}),
        encoding="utf-8",
    )
    aliases = load_team_aliases(aliases_path)

    assert canonical_team_key("Man Utd", aliases) == normalize_team("Manchester United")
    assert canonical_team_key("Manchester United FC", aliases) == normalize_team("Manchester United")


def test_unknown_team_name_is_not_fuzzy_matched():
    fixtures = pd.DataFrame(
        [
            {
                "fixture_id": "sportmonks:mu",
                "kickoff_utc": pd.Timestamp("2025-08-10T15:00:00Z"),
                "home_team_name": "Manchester United",
                "away_team_name": "Arsenal",
            }
        ]
    )
    fixtures["_home_key"] = fixtures["home_team_name"].map(normalize_team)
    fixtures["_away_key"] = fixtures["away_team_name"].map(normalize_team)

    event = {
        "home_team": "Man Utd",
        "away_team": "Arsenal",
        "commence_time": "2025-08-10T15:00:00Z",
    }

    assert match_fixture(event, fixtures, {"sportmonks:mu"}) is None
