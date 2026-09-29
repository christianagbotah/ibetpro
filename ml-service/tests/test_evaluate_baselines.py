from __future__ import annotations

import numpy as np
import pandas as pd

from training.evaluate_baselines import normalize_market_probs, utc_timestamp


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


def test_utc_timestamp_accepts_aware_and_naive_values():
    naive = utc_timestamp("2026-09-29")
    aware = utc_timestamp("2026-09-29T08:00:00+00:00")

    assert str(naive.tz) == "UTC"
    assert str(aware.tz) == "UTC"
    assert naive.isoformat().startswith("2026-09-29T00:00:00")
    assert aware.isoformat().startswith("2026-09-29T08:00:00")
