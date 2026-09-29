from __future__ import annotations

import pandas as pd
import pytest

from training.prepare_licensed_horizon_corpus import build_horizon_corpus


def test_horizon_selects_latest_snapshot_not_after_target():
    fixtures = pd.DataFrame(
        [
            {
                "fixture_id": "sportmonks:1",
                "kickoff_utc": "2025-05-10T18:00:00Z",
                "home_team_id": "sportmonks:10",
                "away_team_id": "sportmonks:20",
                "home_goals": 2,
                "away_goals": 1,
            }
        ]
    )
    odds = pd.DataFrame(
        [
            {
                "fixture_id": "sportmonks:1",
                "captured_at": "2025-05-09T16:00:00Z",
                "home_odds": 2.20,
                "draw_odds": 3.40,
                "away_odds": 3.50,
            },
            {
                "fixture_id": "sportmonks:1",
                "captured_at": "2025-05-09T18:00:00Z",
                "home_odds": 2.10,
                "draw_odds": 3.50,
                "away_odds": 3.60,
            },
            {
                "fixture_id": "sportmonks:1",
                "captured_at": "2025-05-09T18:05:00Z",
                "home_odds": 2.00,
                "draw_odds": 3.60,
                "away_odds": 3.70,
            },
        ]
    )

    corpus, report = build_horizon_corpus(fixtures, odds, horizon_hours=24)
    row = corpus.iloc[0]

    assert report["coverage"] == 1.0
    assert row["market_asof_utc"].startswith("2025-05-09T18:00:00")
    assert row["home_odds"] == 2.10
    assert row["opening_home_odds"] == 2.20
    assert row["market_snapshot_count"] == 2


def test_horizon_drops_fixture_without_causal_snapshot():
    fixtures = pd.DataFrame(
        [
            {
                "fixture_id": "sportmonks:1",
                "kickoff_utc": "2025-05-10T18:00:00Z",
            }
        ]
    )
    odds = pd.DataFrame(
        [
            {
                "fixture_id": "sportmonks:1",
                "captured_at": "2025-05-10T17:30:00Z",
                "home_odds": 2.0,
                "draw_odds": 3.5,
                "away_odds": 4.0,
            }
        ]
    )

    corpus, report = build_horizon_corpus(fixtures, odds, horizon_hours=6)

    assert corpus.empty
    assert report["coverage"] == 0.0
    assert report["missing_fixture_count"] == 1
