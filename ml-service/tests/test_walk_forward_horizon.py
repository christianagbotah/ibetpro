from __future__ import annotations

from pathlib import Path

import pandas as pd

from training.validate_walk_forward_horizon import validate_horizon


def _season_rows(start: str, periods: int, freq: str = "7D") -> pd.DataFrame:
    dates = pd.date_range(start=start, periods=periods, freq=freq, tz="UTC")
    return pd.DataFrame({"kickoff_utc": dates})


def test_horizon_gate_passes_when_all_folds_have_history(tmp_path: Path):
    dates = pd.date_range(
        start="2019-07-01",
        end="2025-06-30",
        freq="2D",
        tz="UTC",
    )
    path = tmp_path / "fixtures.csv"
    pd.DataFrame({"kickoff_utc": dates}).to_csv(path, index=False)

    result = validate_horizon(
        path,
        {
            "minimum_train_rows": 300,
            "minimum_calibration_rows": 150,
            "minimum_test_rows": 150,
        },
    )

    assert result["walk_forward_ready"] is True
    assert all(fold["ready"] for fold in result["folds"])


def test_horizon_gate_blocks_late_start_before_paid_odds(tmp_path: Path):
    dates = pd.date_range(
        start="2021-07-01",
        end="2025-06-30",
        freq="2D",
        tz="UTC",
    )
    path = tmp_path / "fixtures.csv"
    pd.DataFrame({"kickoff_utc": dates}).to_csv(path, index=False)

    result = validate_horizon(
        path,
        {
            "minimum_train_rows": 300,
            "minimum_calibration_rows": 150,
            "minimum_test_rows": 150,
        },
    )

    assert result["walk_forward_ready"] is False
    assert result["folds"][0]["checks"]["train"] is False
