from __future__ import annotations

import math

import numpy as np

from training.build_features import _market_structure


def test_market_structure_normalizes_overround_and_derives_ratios():
    result = _market_structure(
        home_implied=0.50,
        draw_implied=0.30,
        away_implied=0.25,
    )

    assert math.isclose(result["market_overround"], 1.05, rel_tol=1e-12)
    assert math.isclose(
        result["home_market_prob"]
        + result["draw_market_prob"]
        + result["away_market_prob"],
        1.0,
        rel_tol=1e-12,
    )
    assert math.isclose(
        result["market_home_away_log_ratio"],
        math.log(result["home_market_prob"] / result["away_market_prob"]),
        rel_tol=1e-12,
    )
    assert result["market_entropy"] > 0


def test_market_structure_is_missing_when_any_market_leg_is_missing():
    result = _market_structure(
        home_implied=0.50,
        draw_implied=np.nan,
        away_implied=0.25,
    )

    assert all(np.isnan(value) for value in result.values())
