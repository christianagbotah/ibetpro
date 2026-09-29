from __future__ import annotations

import numpy as np

from training.train_xgb import paired_log_loss_bootstrap


def test_identical_probabilities_have_zero_paired_delta():
    y = np.array([0, 1, 2, 0, 2, 1], dtype=int)
    probs = np.array(
        [
            [0.60, 0.25, 0.15],
            [0.20, 0.55, 0.25],
            [0.15, 0.25, 0.60],
            [0.55, 0.30, 0.15],
            [0.15, 0.30, 0.55],
            [0.25, 0.50, 0.25],
        ],
        dtype=float,
    )

    result = paired_log_loss_bootstrap(
        y,
        probs,
        probs,
        iterations=500,
        seed=7,
    )

    assert abs(result["delta"]) < 1e-12
    assert abs(result["bootstrap_ci95_low"]) < 1e-12
    assert abs(result["bootstrap_ci95_high"]) < 1e-12
    assert result["probability_candidate_better"] == 0.0


def test_consistently_better_candidate_has_negative_interval():
    y = np.array([0, 1, 2] * 40, dtype=int)
    candidate = np.tile(
        np.array(
            [
                [0.72, 0.18, 0.10],
                [0.15, 0.70, 0.15],
                [0.10, 0.18, 0.72],
            ],
            dtype=float,
        ),
        (40, 1),
    )
    market = np.tile(
        np.array(
            [
                [0.52, 0.28, 0.20],
                [0.25, 0.50, 0.25],
                [0.20, 0.28, 0.52],
            ],
            dtype=float,
        ),
        (40, 1),
    )

    result = paired_log_loss_bootstrap(
        y,
        candidate,
        market,
        iterations=1000,
        seed=11,
    )

    assert result["delta"] < 0
    assert result["bootstrap_ci95_high"] < 0
    assert result["probability_candidate_better"] == 1.0
