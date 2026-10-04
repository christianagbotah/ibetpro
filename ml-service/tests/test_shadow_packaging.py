from __future__ import annotations

import hashlib
import json
from pathlib import Path

import joblib
import pytest

from training.package_shadow_candidate import package_shadow_candidate


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def _model_dir(tmp_path: Path) -> Path:
    model = tmp_path / "model"
    model.mkdir()

    for name in [
        "result_calibrator.joblib",
        "home_goals_xgb.joblib",
        "away_goals_xgb.joblib",
    ]:
        joblib.dump({"artifact": name}, model / name)

    artifacts = {
        name: _sha256(model / name)
        for name in [
            "result_calibrator.joblib",
            "home_goals_xgb.joblib",
            "away_goals_xgb.joblib",
        ]
    }
    (model / "metadata.json").write_text(
        json.dumps(
            {
                "model_version": "candidate-v1",
                "feature_columns": ["home_elo"],
                "artifacts": artifacts,
                "result_calibration": {
                    "selective_policy": {
                        "bands": [
                            {
                                "lower": 0.02,
                                "upper": 0.05,
                                "use_candidate": True,
                            }
                        ]
                    }
                },
            }
        ),
        encoding="utf-8",
    )
    return model


def test_shadow_package_is_blocked_without_stable_band(tmp_path: Path):
    model = _model_dir(tmp_path)
    walk_forward = tmp_path / "walk-forward.json"
    walk_forward.write_text(
        json.dumps(
            {
                "selective_stability": {
                    "eligible_for_shadow": False,
                    "stable_band_count": 0,
                    "stable_bands": [],
                    "required_folds": 3,
                }
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="not cross-season stable"):
        package_shadow_candidate(model, walk_forward, tmp_path / "shadow")


def test_shadow_package_verifies_and_stamps_approved_bundle(tmp_path: Path):
    model = _model_dir(tmp_path)
    walk_forward = tmp_path / "walk-forward.json"
    walk_forward.write_text(
        json.dumps(
            {
                "selective_stability": {
                    "eligible_for_shadow": True,
                    "stable_band_count": 1,
                    "stable_bands": [{"lower": 0.02, "upper": 0.05}],
                    "required_folds": 3,
                    "material_market_edge_required": 0.001,
                }
            }
        ),
        encoding="utf-8",
    )

    output = tmp_path / "shadow"
    manifest = package_shadow_candidate(model, walk_forward, output)
    metadata = json.loads((output / "metadata.json").read_text(encoding="utf-8"))

    assert manifest["promotion_status"] == "shadow-approved"
    assert metadata["promotion_status"] == "shadow-approved"
    assert (
        metadata["result_calibration"]["selective_stability_approval"]["approved"]
        is True
    )
    assert manifest["stable_bands"] == [{"lower": 0.02, "upper": 0.05}]


def test_shadow_package_rejects_tampered_artifact(tmp_path: Path):
    model = _model_dir(tmp_path)
    (model / "result_calibrator.joblib").write_bytes(b"tampered")

    walk_forward = tmp_path / "walk-forward.json"
    walk_forward.write_text(
        json.dumps(
            {
                "selective_stability": {
                    "eligible_for_shadow": True,
                    "stable_band_count": 1,
                    "stable_bands": [{"lower": 0.02, "upper": 0.05}],
                    "required_folds": 3,
                }
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="checksum mismatch"):
        package_shadow_candidate(model, walk_forward, tmp_path / "shadow")
