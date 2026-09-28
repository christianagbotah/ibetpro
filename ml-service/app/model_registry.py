from __future__ import annotations

from functools import lru_cache
from pathlib import Path
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
    def imputation(self) -> dict[str, float]:
        return {
            str(key): float(value)
            for key, value in self.metadata.get("training_imputation", {}).items()
        }


def configured_model_dir() -> Path | None:
    value = os.environ.get("IBETPRO_MODEL_DIR")
    if not value:
        return None
    return Path(value).expanduser().resolve()


def validate_model_dir(directory: Path) -> tuple[bool, list[str]]:
    missing = [name for name in REQUIRED_ARTIFACTS if not (directory / name).is_file()]
    return len(missing) == 0, missing


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
            "reason": f"Missing artifacts: {', '.join(missing)}",
        }

    try:
        bundle = get_model_bundle()
        return {
            "configured": True,
            "loaded": bundle is not None,
            "modelVersion": bundle.version if bundle else None,
            "features": len(bundle.feature_columns) if bundle else 0,
            "reason": None,
        }
    except Exception as exc:
        return {
            "configured": True,
            "loaded": False,
            "modelVersion": None,
            "reason": str(exc),
        }
