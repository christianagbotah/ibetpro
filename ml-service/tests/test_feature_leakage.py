from __future__ import annotations

import pandas as pd

from training.build_features import build_features


def sample_frame() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "fixture_id": "f1",
                "kickoff_utc": "2024-01-01T15:00:00Z",
                "league": "Test League",
                "season": "2024",
                "home_team_id": "A",
                "away_team_id": "B",
                "home_goals": 5,
                "away_goals": 0,
                "home_xg": 3.0,
                "away_xg": 0.2,
                "home_shots": 20,
                "away_shots": 4,
                "home_sot": 10,
                "away_sot": 1,
            },
            {
                "fixture_id": "f2",
                "kickoff_utc": "2024-01-08T15:00:00Z",
                "league": "Test League",
                "season": "2024",
                "home_team_id": "A",
                "away_team_id": "B",
                "home_goals": 1,
                "away_goals": 1,
                "home_xg": 1.1,
                "away_xg": 1.0,
                "home_shots": 8,
                "away_shots": 7,
                "home_sot": 3,
                "away_sot": 3,
            },
        ]
    )


def test_current_fixture_does_not_leak_into_its_features():
    features = build_features(sample_frame(), window=5)

    first = features.iloc[0]
    second = features.iloc[1]

    # The first match has no prior history. Its own 5 goals / 3.0 xG must not
    # appear in the features used to predict that same fixture.
    assert first["home_goals_for_5"] == 0.0
    assert first["home_xg_for_5"] == 1.35

    # The second fixture may use the first fixture because it was known by then.
    assert second["home_goals_for_5"] == 5.0
    assert second["home_xg_for_5"] == 3.0


def test_elo_updates_only_after_fixture():
    features = build_features(sample_frame(), window=5)

    assert features.iloc[0]["home_elo"] == 1500.0
    assert features.iloc[0]["away_elo"] == 1500.0
    assert features.iloc[1]["home_elo"] > 1500.0
    assert features.iloc[1]["away_elo"] < 1500.0


def test_venue_features_use_only_prior_matches():
    features = build_features(sample_frame(), window=10)

    first = features.iloc[0]
    second = features.iloc[1]

    assert first["home_home_points_5"] == 0.0
    assert first["away_away_points_5"] == 0.0
    assert second["home_home_points_5"] == 3.0
    assert second["away_away_points_5"] == 0.0
    assert second["home_home_goals_for_5"] == 5.0
    assert second["away_away_goals_against_5"] == 5.0
