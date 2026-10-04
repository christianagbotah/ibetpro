from __future__ import annotations

import pandas as pd

from training.collect_odds_api_history import (
    build_plan,
    consensus_1x2,
    match_fixture,
)


def _fixtures():
    return pd.DataFrame(
        [
            {
                "fixture_id": "sportmonks:1",
                "kickoff_utc": "2025-05-10T15:00:00Z",
                "home_team_name": "Arsenal",
                "away_team_name": "Chelsea",
            },
            {
                "fixture_id": "sportmonks:2",
                "kickoff_utc": "2025-05-10T17:30:00Z",
                "home_team_name": "Liverpool FC",
                "away_team_name": "Everton",
            },
        ]
    )


def test_plan_buckets_fixture_snapshot_requests():
    plan = build_plan(_fixtures(), offsets_hours=(24, 6), bucket_minutes=60)

    assert len(plan) == 4
    assert all(item["fixture_count"] >= 1 for item in plan)


def test_consensus_averages_h2h_bookmaker_prices():
    event = {
        "home_team": "Arsenal",
        "away_team": "Chelsea",
        "bookmakers": [
            {
                "markets": [
                    {
                        "key": "h2h",
                        "outcomes": [
                            {"name": "Arsenal", "price": 2.0},
                            {"name": "Draw", "price": 3.5},
                            {"name": "Chelsea", "price": 4.0},
                        ],
                    }
                ]
            },
            {
                "markets": [
                    {
                        "key": "h2h",
                        "outcomes": [
                            {"name": "Arsenal", "price": 2.2},
                            {"name": "Draw", "price": 3.7},
                            {"name": "Chelsea", "price": 3.8},
                        ],
                    }
                ]
            },
        ],
    }

    home, draw, away = consensus_1x2(event)

    assert home == 2.1
    assert draw == 3.6
    assert away == 3.9


def test_fixture_matching_normalizes_common_club_suffixes():
    fixtures = _fixtures()
    fixtures["kickoff_utc"] = pd.to_datetime(fixtures["kickoff_utc"], utc=True)
    fixtures["_home_key"] = ["arsenal", "liverpool"]
    fixtures["_away_key"] = ["chelsea", "everton"]

    event = {
        "home_team": "Liverpool",
        "away_team": "Everton",
        "commence_time": "2025-05-10T17:31:00Z",
    }

    assert match_fixture(event, fixtures) == "sportmonks:2"
