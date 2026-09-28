from __future__ import annotations

import numpy as np

from training.selective_policy import (
    SelectivePolicyRules,
    apply_selective_policy,
    learn_selective_policy,
    policy_allows_divergence,
)


def test_policy_enables_only_supported_divergence_band():
    y = np.array([0] * 100 + [2] * 100)
    market = np.tile(np.array([0.45, 0.25, 0.30]), (200, 1))
    candidate = market.copy()

    # First 100 rows sit cleanly inside the 0.02-0.05 divergence band and
    # improve the observed home result.
    candidate[:100] = np.array([0.49, 0.23, 0.28])
    # Second 100 rows differ materially but worsen the observed away result.
    candidate[100:] = np.array([0.60, 0.20, 0.20])

    policy = learn_selective_policy(
        y,
        candidate,
        market,
        rules=SelectivePolicyRules(
            min_rows=80,
            min_log_loss_improvement=0.001,
            require_ci_below_zero=True,
            bootstrap_iterations=500,
            seed=7,
        ),
    )

    assert policy["enabled_band_count"] == 1
    assert policy_allows_divergence(0.04, policy) is True
    assert policy_allows_divergence(0.15, policy) is False
    assert any(band["use_candidate"] for band in policy["bands"])


def test_apply_policy_abstains_to_market_when_no_band_enabled():
    market = np.array([[0.50, 0.25, 0.25]])
    candidate = np.array([[0.60, 0.20, 0.20]])
    policy = {
        "bands": [
            {
                "lower": 0.0,
                "upper": 1.01,
                "use_candidate": False,
            }
        ]
    }

    selected, mask = apply_selective_policy(candidate, market, policy)

    assert mask.tolist() == [False]
    assert np.allclose(selected, market)
