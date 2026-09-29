from __future__ import annotations

from training.validate_provider_pair import validate_pair


def test_epl_provider_pair_is_supported():
    result = validate_pair("8", "soccer_epl")
    assert result["valid"] is True
    assert result["competition"] == "English Premier League"


def test_mismatched_provider_pair_is_rejected():
    result = validate_pair("8", "soccer_spain_la_liga")
    assert result["valid"] is False
    assert result["competition"] is None
