from training.collect_api_football import chunks, embedded_fixture_stats, stat_value


def test_chunks_respects_api_football_twenty_id_limit():
    groups = list(chunks(list(range(45)), 20))
    assert [len(group) for group in groups] == [20, 20, 5]
    assert groups[0][0] == 0
    assert groups[-1][-1] == 44


def test_stat_value_converts_percentages_and_preserves_numbers():
    stats = [
        {"type": "Ball Possession", "value": "57%"},
        {"type": "Total Shots", "value": 14},
    ]
    assert stat_value(stats, "Ball Possession") == 57.0
    assert stat_value(stats, "Total Shots") == 14
    assert stat_value(stats, "Shots on Goal") is None


def test_embedded_fixture_stats_extracts_supported_team_statistics():
    item = {
        "statistics": [
            {
                "team": {"id": 10},
                "statistics": [
                    {"type": "Total Shots", "value": 15},
                    {"type": "Shots on Goal", "value": 6},
                    {"type": "Ball Possession", "value": "58%"},
                    {"type": "Corner Kicks", "value": 7},
                    {"type": "Yellow Cards", "value": 2},
                    {"type": "Red Cards", "value": 0},
                ],
            },
            {
                "team": {"id": 20},
                "statistics": [
                    {"type": "Total Shots", "value": 9},
                    {"type": "Shots on Goal", "value": 3},
                    {"type": "Ball Possession", "value": "42%"},
                    {"type": "Corner Kicks", "value": 4},
                    {"type": "Yellow Cards", "value": 3},
                    {"type": "Red Cards", "value": 1},
                ],
            },
        ]
    }

    result = embedded_fixture_stats(item)

    assert result[10] == {
        "shots": 15,
        "sot": 6,
        "possession": 58.0,
        "corners": 7,
        "yellow_cards": 2,
        "red_cards": 0,
    }
    assert result[20]["shots"] == 9
    assert result[20]["sot"] == 3
    assert result[20]["possession"] == 42.0
    assert result[20]["red_cards"] == 1


def test_embedded_fixture_stats_tolerates_missing_statistics():
    assert embedded_fixture_stats({"statistics": None}) == {}
    assert embedded_fixture_stats({}) == {}
