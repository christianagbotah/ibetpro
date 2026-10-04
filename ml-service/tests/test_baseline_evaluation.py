from pathlib import Path

import pandas as pd

from training.evaluate_baselines import evaluate_baselines


def test_elo_baseline_evaluates_without_market_odds(tmp_path: Path):
    frame = pd.DataFrame(
        [
            {
                "kickoff_utc": "2025-01-01T12:00:00Z",
                "home_elo": 1550.0,
                "away_elo": 1490.0,
                "result_class": 0,
                "home_odds": None,
                "draw_odds": None,
                "away_odds": None,
            },
            {
                "kickoff_utc": "2025-01-08T12:00:00Z",
                "home_elo": 1500.0,
                "away_elo": 1510.0,
                "result_class": 1,
                "home_odds": None,
                "draw_odds": None,
                "away_odds": None,
            },
            {
                "kickoff_utc": "2025-01-15T12:00:00Z",
                "home_elo": 1480.0,
                "away_elo": 1580.0,
                "result_class": 2,
                "home_odds": None,
                "draw_odds": None,
                "away_odds": None,
            },
        ]
    )
    path = tmp_path / "features.csv"
    frame.to_csv(path, index=False)

    result = evaluate_baselines(
        path,
        "2025-01-01",
        "2025-01-31",
    )

    assert result["rows"] == 3
    assert result["elo"]["log_loss"] > 0
    assert result["elo"]["brier"] > 0
    assert 0 <= result["elo"]["accuracy"] <= 1
    assert result["market"] is None
