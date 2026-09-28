from __future__ import annotations

import numpy as np

from training.train_xgb import blend_probabilities


def test_market_component_is_applied_exactly():
    model = np.array([[0.60, 0.20, 0.20]])
    elo = np.array([[0.45, 0.25, 0.30]])
    goal = np.array([[0.50, 0.30, 0.20]])
    market = np.array([[0.55, 0.25, 0.20]])

    result = blend_probabilities(
        model,
        elo,
        model_weight=0.20,
        goal_probs=goal,
        goal_weight=0.10,
        market_probs=market,
        market_weight=0.50,
    )

    expected = (
        0.20 * model
        + 0.10 * goal
        + 0.50 * market
        + 0.20 * elo
    )
    expected = expected / expected.sum(axis=1, keepdims=True)

    assert np.allclose(result, expected)


def test_blend_rejects_weights_above_one():
    model = np.array([[0.60, 0.20, 0.20]])
    elo = np.array([[0.45, 0.25, 0.30]])

    try:
        blend_probabilities(
            model,
            elo,
            model_weight=0.60,
            market_probs=elo,
            market_weight=0.50,
        )
    except ValueError as exc:
        assert "exceed" in str(exc)
    else:
        raise AssertionError("Expected invalid blend weights to raise")
