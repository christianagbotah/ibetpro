import numpy as np
import pandas as pd

from training.train_xgb import blend_probabilities, elo_probabilities


def test_elo_probabilities_are_normalized():
    frame = pd.DataFrame(
        [
            {"home_elo": 1600.0, "away_elo": 1500.0},
            {"home_elo": 1450.0, "away_elo": 1550.0},
        ]
    )
    probabilities = elo_probabilities(frame)
    assert probabilities.shape == (2, 3)
    assert np.allclose(probabilities.sum(axis=1), 1.0)
    assert np.all(probabilities > 0)


def test_blend_weight_zero_is_pure_elo_and_one_is_pure_model():
    model = np.array([[0.6, 0.2, 0.2]])
    elo = np.array([[0.4, 0.3, 0.3]])

    assert np.allclose(blend_probabilities(model, elo, 0.0), elo)
    assert np.allclose(blend_probabilities(model, elo, 1.0), model)


def test_three_way_blend_is_normalized_and_respects_weights():
    model = np.array([[0.60, 0.20, 0.20]])
    elo = np.array([[0.40, 0.30, 0.30]])
    goals = np.array([[0.50, 0.25, 0.25]])

    blended = blend_probabilities(
        model,
        elo,
        model_weight=0.3,
        goal_probs=goals,
        goal_weight=0.4,
    )

    expected = 0.3 * model + 0.4 * goals + 0.3 * elo
    assert np.allclose(blended, expected)
    assert np.allclose(blended.sum(axis=1), 1.0)
