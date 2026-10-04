from __future__ import annotations

from pathlib import Path

import pandas as pd

from training.join_licensed_context import join_licensed_context


def test_join_uses_only_pre_kickoff_odds(tmp_path: Path):
    fixtures = pd.DataFrame(
        [
            {
                "fixture_id": "sportmonks:1",
                "kickoff_utc": "2025-08-10T15:00:00Z",
                "league": "Premier League",
                "season": "2025/2026",
                "home_team_id": "sportmonks:10",
                "away_team_id": "sportmonks:20",
                "home_team_name": "Home FC",
                "away_team_name": "Away FC",
                "home_goals": 2,
                "away_goals": 1,
                "home_shots": 12,
                "away_shots": 8,
                "home_sot": 5,
                "away_sot": 3,
            }
        ]
    )
    odds = pd.DataFrame(
        [
            {
                "fixture_id": "sportmonks:1",
                "captured_at": "2025-08-08T15:00:00Z",
                "home_odds": 2.10,
                "draw_odds": 3.40,
                "away_odds": 3.60,
            },
            {
                "fixture_id": "sportmonks:1",
                "captured_at": "2025-08-10T14:00:00Z",
                "home_odds": 1.95,
                "draw_odds": 3.50,
                "away_odds": 3.90,
            },
            {
                "fixture_id": "sportmonks:1",
                "captured_at": "2025-08-10T15:10:00Z",
                "home_odds": 1.20,
                "draw_odds": 7.00,
                "away_odds": 15.00,
            },
        ]
    )

    fixture_path = tmp_path / "fixtures.csv"
    odds_path = tmp_path / "odds.csv"
    output = tmp_path / "run" / "football.csv"
    fixtures.to_csv(fixture_path, index=False)
    odds.to_csv(odds_path, index=False)

    report = join_licensed_context(fixture_path, odds_path, output)
    joined = pd.read_csv(output).iloc[0]

    assert joined["home_odds"] == 2.10
    assert joined["closing_home_odds"] == 1.95
    assert "15:10:00" not in str(joined["closing_odds_captured_at"])
    assert report["post_kickoff_snapshots_rejected"] == 1
    assert report["matched_fixtures"] == 1
    assert report["opening_market_coverage"] == 1.0
    assert report["near_kickoff_market_coverage"] == 1.0
