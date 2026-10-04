from __future__ import annotations

import math

import pandas as pd
import pytest

from training.build_features import build_features
from training.prepare_near_kickoff_movement import prepare_near_kickoff_dataset


def _raw_fixture() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "fixture_id": "m1",
                "kickoff_utc": "2024-08-17T15:00:00Z",
                "league": "Premier League",
                "season": "2024/2025",
                "home_team_id": "A",
                "away_team_id": "B",
                "home_goals": 2,
                "away_goals": 1,
                "home_odds": 2.00,
                "draw_odds": 4.00,
                "away_odds": 4.00,
                "closing_home_odds": 1.80,
                "closing_draw_odds": 4.20,
                "closing_away_odds": 4.80,
            }
        ]
    )


def test_feature_builder_preserves_opening_closing_and_movement():
    features = build_features(_raw_fixture())
    row = features.iloc[0]

    assert math.isclose(row["opening_home_market_prob"], 0.50)
    closing_raw = [1 / 1.80, 1 / 4.20, 1 / 4.80]
    closing_total = sum(closing_raw)
    closing_home = closing_raw[0] / closing_total

    assert math.isclose(row["closing_home_market_prob"], closing_home)
    assert math.isclose(
        row["home_market_prob_move_open"],
        closing_home - row["opening_home_market_prob"],
    )


def test_near_kickoff_dataset_uses_closing_market_as_authority():
    features = build_features(_raw_fixture())
    prepared, report = prepare_near_kickoff_dataset(features)
    row = prepared.iloc[0]

    assert report["prediction_horizon"] == "near-kickoff-closing-market"
    assert math.isclose(
        row["home_market_prob"],
        row["closing_home_market_prob"],
    )
    assert math.isclose(
        row["home_implied_prob"],
        row["closing_home_implied_prob"],
    )
    assert not math.isclose(
        row["home_market_prob"],
        row["opening_home_market_prob"],
    )


def test_near_kickoff_dataset_rejects_insufficient_closing_coverage():
    features = build_features(_raw_fixture())
    missing = pd.concat([features] * 10, ignore_index=True)
    missing.loc[:8, [
        "closing_home_market_prob",
        "closing_draw_market_prob",
        "closing_away_market_prob",
    ]] = float("nan")

    with pytest.raises(ValueError, match="Closing-market coverage"):
        prepare_near_kickoff_dataset(missing, min_closing_coverage=0.90)
