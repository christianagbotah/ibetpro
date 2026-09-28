from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import hashlib
import json
import os

import joblib

REQUIRED_ARTIFACTS = (
    "result_calibrator.joblib",
    "home_goals_xgb.joblib",
    "away_goals_xgb.joblib",
    "metadata.json",
)


class ModelBundle:
    def __init__(self, directory: Path):
        self.directory = directory
        self.metadata = json.loads((directory / "metadata.json").read_text(encoding="utf-8"))
        self.result_calibrator = joblib.load(directory / "result_calibrator.joblib")
        self.home_goal_model = joblib.load(directory / "home_goals_xgb.joblib")
        self.away_goal_model = joblib.load(directory / "away_goals_xgb.joblib")

    @property
    def version(self) -> str:
        return str(self.metadata.get("model_version", "unknown"))

    @property
    def feature_columns(self) -> list[str]:
        return list(self.metadata.get("feature_columns", []))

    @property
    def feature_profile(self) -> str:
        return str(self.metadata.get("feature_profile", "core"))

    @property
    def imputation(self) -> dict[str, float]:
        return {
            str(key): float(value)
            for key, value in self.metadata.get("training_imputation", {}).items()
        }

    @property
    def result_model_weight(self) -> float:
        value = (
            self.metadata.get("result_calibration", {})
            .get("result_model_weight", 1.0)
        )
        return min(1.0, max(0.0, float(value)))

    @property
    def result_goal_weight(self) -> float:
        value = (
            self.metadata.get("result_calibration", {})
            .get("result_goal_weight", 0.0)
        )
        return min(1.0, max(0.0, float(value)))

    @property
    def result_market_weight(self) -> float:
        value = (
            self.metadata.get("result_calibration", {})
            .get("result_market_weight", 0.0)
        )
        return min(1.0, max(0.0, float(value)))


def configured_model_dir() -> Path | None:
    value = os.environ.get("IBETPRO_MODEL_DIR")
    if not value:
        return None
    return Path(value).expanduser().resolve()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_model_dir(directory: Path) -> tuple[bool, list[str]]:
    problems = [name for name in REQUIRED_ARTIFACTS if not (directory / name).is_file()]
    if problems:
        return False, problems

    metadata = json.loads((directory / "metadata.json").read_text(encoding="utf-8"))
    expected = metadata.get("artifacts", {})
    for name, expected_hash in expected.items():
        path = directory / name
        if not path.is_file():
            problems.append(f"{name}:missing")
            continue
        actual_hash = _sha256(path)
        if actual_hash != expected_hash:
            problems.append(f"{name}:checksum-mismatch")

    return len(problems) == 0, problems


@lru_cache(maxsize=1)
def get_model_bundle() -> ModelBundle | None:
    directory = configured_model_dir()
    if directory is None:
        return None

    valid, missing = validate_model_dir(directory)
    if not valid:
        raise RuntimeError(
            f"Configured model directory is incomplete: {directory}; missing={missing}"
        )

    bundle = ModelBundle(directory)
    if not bundle.feature_columns:
        raise RuntimeError("Configured model metadata has no feature_columns")
    return bundle


def model_status() -> dict:
    directory = configured_model_dir()
    if directory is None:
        return {
            "configured": False,
            "loaded": False,
            "modelVersion": None,
            "reason": "IBETPRO_MODEL_DIR is not configured",
        }

    valid, missing = validate_model_dir(directory)
    if not valid:
        return {
            "configured": True,
            "loaded": False,
            "modelVersion": None,
            "reason": f"Model artifact validation failed: {', '.join(missing)}",
        }

    try:
        bundle = get_model_bundle()
        return {
            "configured": True,
            "loaded": bundle is not None,
            "modelVersion": bundle.version if bundle else None,
            "features": len(bundle.feature_columns) if bundle else 0,
            "featureProfile": bundle.feature_profile if bundle else None,
            "blendWeights": {
                "model": bundle.result_model_weight if bundle else None,
                "goal": bundle.result_goal_weight if bundle else None,
                "market": bundle.result_market_weight if bundle else None,
                "elo": (
                    max(
                        0.0,
                        1.0
                        - bundle.result_model_weight
                        - bundle.result_goal_weight
                        - bundle.result_market_weight,
                    )
                    if bundle
                    else None
                ),
            },
            "reason": None,
        }
    except Exception as exc:
        return {
            "configured": True,
            "loaded": False,
            "modelVersion": None,
            "reason": str(exc),
        }
