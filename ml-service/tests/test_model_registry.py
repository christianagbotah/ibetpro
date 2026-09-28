from __future__ import annotations

import json
from pathlib import Path

from app.model_registry import validate_model_dir


def test_incomplete_model_directory_is_rejected(tmp_path: Path):
    valid, missing = validate_model_dir(tmp_path)
    assert valid is False
    assert "metadata.json" in missing
    assert "result_calibrator.joblib" in missing


def test_complete_model_directory_is_accepted(tmp_path: Path):
    for name in [
        "result_calibrator.joblib",
        "home_goals_xgb.joblib",
        "away_goals_xgb.joblib",
    ]:
        (tmp_path / name).write_bytes(b"placeholder")

    (tmp_path / "metadata.json").write_text(
        json.dumps(
            {
                "model_version": "test-model",
                "feature_columns": ["home_elo"],
                "training_imputation": {"home_elo": 1500.0},
            }
        ),
        encoding="utf-8",
    )

    valid, missing = validate_model_dir(tmp_path)
    assert valid is True
    assert missing == []
