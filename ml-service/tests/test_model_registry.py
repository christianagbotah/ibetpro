from __future__ import annotations

import json
from pathlib import Path

from app.model_registry import ModelBundle, validate_model_dir


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


def _bundle_with_metadata(tmp_path: Path, metadata: dict) -> ModelBundle:
    directory = tmp_path / "bundle"
    directory.mkdir()
    (directory / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
    for name in [
        "result_calibrator.joblib",
        "home_goals_xgb.joblib",
        "away_goals_xgb.joblib",
    ]:
        import joblib

        joblib.dump({"placeholder": True}, directory / name)
    return ModelBundle(directory)


def test_selective_policy_requires_cross_season_approval(tmp_path: Path):
    bundle = _bundle_with_metadata(
        tmp_path,
        {
            "model_version": "candidate-v1",
            "feature_columns": ["home_elo"],
            "result_calibration": {
                "selective_policy": {
                    "enabled_band_count": 1,
                    "bands": [
                        {
                            "lower": 0.02,
                            "upper": 0.05,
                            "use_candidate": True,
                        }
                    ],
                }
            },
        },
    )

    assert bundle.selective_policy is None


def test_selective_policy_filters_to_only_approved_stable_bands(tmp_path: Path):
    bundle = _bundle_with_metadata(
        tmp_path,
        {
            "model_version": "candidate-v1",
            "feature_columns": ["home_elo"],
            "result_calibration": {
                "selective_policy": {
                    "enabled_band_count": 2,
                    "bands": [
                        {
                            "lower": 0.02,
                            "upper": 0.05,
                            "use_candidate": True,
                        },
                        {
                            "lower": 0.05,
                            "upper": 0.10,
                            "use_candidate": True,
                        },
                    ],
                },
                "selective_stability_approval": {
                    "approved": True,
                    "stable_bands": [
                        {"lower": 0.02, "upper": 0.05},
                    ],
                },
            },
        },
    )

    policy = bundle.selective_policy
    assert policy is not None
    assert policy["enabled_band_count"] == 1
    assert policy["bands"][0]["use_candidate"] is True
    assert policy["bands"][1]["use_candidate"] is False


def test_selective_policy_rejects_explicit_failed_approval(tmp_path: Path):
    bundle = _bundle_with_metadata(
        tmp_path,
        {
            "model_version": "candidate-v1",
            "feature_columns": ["home_elo"],
            "result_calibration": {
                "selective_policy": {
                    "enabled_band_count": 1,
                    "bands": [
                        {
                            "lower": 0.02,
                            "upper": 0.05,
                            "use_candidate": True,
                        }
                    ],
                },
                "selective_stability_approval": {
                    "approved": False,
                    "stable_bands": [],
                },
            },
        },
    )

    assert bundle.selective_policy is None
