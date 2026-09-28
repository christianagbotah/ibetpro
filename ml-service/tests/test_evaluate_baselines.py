from __future__ import annotations

import numpy as np
import pandas as pd

from training.evaluate_baselines import normalize_market_probs


def test_market_baseline_uses_feature_implied_probabilities():
    row = pd.Series(
        {
            "home_implied_prob": 0.50,
            "draw_implied_prob": 0.30,
            "away_implied_prob": 0.25,
        }
    )

    result = normalize_market_probs(row)

    assert result is not None
    assert np.isclose(result.sum(), 1.0)
    assert np.allclose(result, np.array([0.50, 0.30, 0.25]) / 1.05)


def test_market_baseline_falls_back_to_raw_odds():
    row = pd.Series(
        {
            "home_odds": 2.0,
            "draw_odds": 4.0,
            "away_odds": 4.0,
        }
    )

    result = normalize_market_probs(row)

    assert result is not None
    assert np.allclose(result, [0.5, 0.25, 0.25])
