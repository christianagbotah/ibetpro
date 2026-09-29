from __future__ import annotations

from training.collect_sportmonks import normalize_fixture


def test_sportmonks_fixture_normalization():
    fixture = {
        "id": 123,
        "starting_at": "2025-05-10 15:00:00",
        "league_id": 8,
        "season_id": 2025,
        "league": {"name": "Premier League"},
        "season": {"name": "2024/2025"},
        "participants": [
            {"id": 1, "name": "Home FC", "meta": {"location": "home"}},
            {"id": 2, "name": "Away FC", "meta": {"location": "away"}},
        ],
        "scores": [
            {
                "participant_id": 1,
                "description": "CURRENT",
                "score": {"goals": 2},
            },
            {
                "participant_id": 2,
                "description": "CURRENT",
                "score": {"goals": 1},
            },
        ],
        "statistics": [
            {
                "participant_id": 1,
                "type": {"code": "total-shots"},
                "data": {"value": 13},
            },
            {
                "participant_id": 1,
                "type": {"code": "shots-on-target"},
                "data": {"value": 6},
            },
            {
                "participant_id": 2,
                "type": {"code": "total-shots"},
                "data": {"value": 8},
            },
            {
                "participant_id": 2,
                "type": {"code": "ball-possession"},
                "data": {"value": 46.2},
            },
        ],
        "xgfixture": [
            {
                "location": "home",
                "type": {"code": "expected-goals"},
                "data": {"value": 1.72},
            },
            {
                "location": "away",
                "type": {"code": "expected-goals"},
                "data": {"value": 0.91},
            },
        ],
    }

    row = normalize_fixture(fixture)

    assert row is not None
    assert row["fixture_id"] == "sportmonks:123"
    assert row["league"] == "Premier League"
    assert row["home_goals"] == 2
    assert row["away_goals"] == 1
    assert row["home_xg"] == 1.72
    assert row["away_xg"] == 0.91
    assert row["home_shots"] == 13
    assert row["home_sot"] == 6
    assert row["away_shots"] == 8
    assert row["away_possession"] == 46.2


def test_sportmonks_unfinished_fixture_is_not_training_row():
    fixture = {
        "id": 124,
        "starting_at": "2026-10-01 15:00:00",
        "participants": [
            {"id": 1, "meta": {"location": "home"}},
            {"id": 2, "meta": {"location": "away"}},
        ],
        "scores": [],
    }

    assert normalize_fixture(fixture) is None
