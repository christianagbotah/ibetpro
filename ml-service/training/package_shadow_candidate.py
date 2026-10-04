from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

from training.approve_selective_policy import approve_selective_policy


REQUIRED_MODEL_FILES = (
    "result_calibrator.joblib",
    "home_goals_xgb.joblib",
    "away_goals_xgb.joblib",
    "metadata.json",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def package_shadow_candidate(
    model_dir: Path,
    walk_forward_path: Path,
    output_dir: Path,
) -> dict:
    missing = [name for name in REQUIRED_MODEL_FILES if not (model_dir / name).is_file()]
    if missing:
        raise ValueError(f"Model bundle is incomplete: {missing}")

    metadata = json.loads((model_dir / "metadata.json").read_text(encoding="utf-8"))
    walk_forward = json.loads(walk_forward_path.read_text(encoding="utf-8"))
    approved_metadata = approve_selective_policy(metadata, walk_forward)
    approval = approved_metadata["result_calibration"]["selective_stability_approval"]

    if not approval.get("approved"):
        raise ValueError(
            "Selective policy is not cross-season stable; shadow packaging is blocked"
        )

    expected = metadata.get("artifacts", {})
    for name, expected_hash in expected.items():
        path = model_dir / name
        if not path.is_file():
            raise ValueError(f"Artifact declared in metadata is missing: {name}")
        actual = sha256(path)
        if actual != expected_hash:
            raise ValueError(f"Artifact checksum mismatch: {name}")

    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True)

    for name in REQUIRED_MODEL_FILES:
        if name == "metadata.json":
            continue
        shutil.copy2(model_dir / name, output_dir / name)

    approved_metadata["promotion_status"] = "shadow-approved"
    approved_metadata["shadow_package"] = {
        "approval_source": str(walk_forward_path),
        "stable_band_count": len(approval.get("stable_bands", [])),
    }
    (output_dir / "metadata.json").write_text(
        json.dumps(approved_metadata, indent=2),
        encoding="utf-8",
    )

    manifest = {
        "model_version": approved_metadata.get("model_version"),
        "promotion_status": approved_metadata["promotion_status"],
        "stable_bands": approval.get("stable_bands", []),
        "files": {
            name: sha256(output_dir / name)
            for name in REQUIRED_MODEL_FILES
            if (output_dir / name).is_file()
        },
    }
    (output_dir / "shadow-manifest.json").write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8",
    )
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", required=True, type=Path)
    parser.add_argument("--walk-forward", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    try:
        manifest = package_shadow_candidate(
            args.model_dir,
            args.walk_forward,
            args.output,
        )
    except ValueError as exc:
        print(f"SHADOW PACKAGE BLOCKED: {exc}")
        raise SystemExit(2) from exc

    print(json.dumps(manifest, indent=2))
