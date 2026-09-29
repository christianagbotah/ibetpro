from __future__ import annotations

import pandas as pd

from training.collect_football_data import normalize, season_code


def test_season_code():
    assert season_code(2019) == "1920"
    assert season_code(2025) == "2526"


def test_normalize_prefers_non_closing_odds_and_maps_stats():
    raw = pd.DataFrame(
        [
            {
                "Date": "17/08/2024",
                "HomeTeam": "Home FC",
                "AwayTeam": "Away FC",
                "FTHG": 2,
                "FTAG": 1,
                "HS": 14,
                "AS": 8,
                "HST": 6,
                "AST": 3,
                "HC": 7,
                "AC": 2,
                "HY": 1,
                "AY": 3,
                "HR": 0,
                "AR": 1,
                "AvgH": 1.80,
                "AvgD": 3.60,
                "AvgA": 4.60,
                "AvgCH": 1.72,
                "AvgCD": 3.80,
                "AvgCA": 5.00,
                "Avg>2.5": 1.92,
                "Avg<2.5": 1.98,
            }
        ]
    )

    result = normalize(raw, "E0", 2024)
    row = result.iloc[0]

    assert row["league"] == "Premier League"
    assert row["season"] == "2024/2025"
    assert row["home_goals"] == 2
    assert row["away_goals"] == 1
    assert row["home_shots"] == 14
    assert row["away_sot"] == 3
    assert row["home_corners"] == 7
    assert row["away_red_cards"] == 1
    assert row["home_odds"] == 1.80
    assert row["closing_home_odds"] == 1.72
    assert row["over25_odds"] == 1.92
    assert row["under25_odds"] == 1.98
    assert str(row["kickoff_utc"]).startswith("2024-08-17")


def test_normalize_falls_back_to_available_bookmaker_odds():
    raw = pd.DataFrame(
        [
            {
                "Date": "01/09/2023",
                "HomeTeam": "A",
                "AwayTeam": "B",
                "FTHG": 0,
                "FTAG": 0,
                "B365H": 2.10,
                "B365D": 3.20,
                "B365A": 3.50,
            }
        ]
    )

    row = normalize(raw, "SP1", 2023).iloc[0]
    assert row["home_odds"] == 2.10
    assert row["draw_odds"] == 3.20
    assert row["away_odds"] == 3.50
