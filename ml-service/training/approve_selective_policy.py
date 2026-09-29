from __future__ import annotations

import argparse
import json
from pathlib import Path


def approve_selective_policy(metadata: dict, walk_forward: dict) -> dict:
    stability = walk_forward.get("selective_stability") or {}
    stable_bands = list(stability.get("stable_bands") or [])
    approved = bool(
        stability.get("eligible_for_shadow")
        and stable_bands
        and stability.get("stable_band_count", 0) == len(stable_bands)
    )

    result = json.loads(json.dumps(metadata))
    calibration = result.setdefault("result_calibration", {})
    calibration["selective_stability_approval"] = {
        "approved": approved,
        "source": "walk-forward",
        "required_folds": int(stability.get("required_folds", 0)),
        "material_market_edge_required": stability.get(
            "material_market_edge_required"
        ),
        "stable_bands": stable_bands if approved else [],
    }
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--metadata", required=True, type=Path)
    parser.add_argument("--walk-forward", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    metadata = json.loads(args.metadata.read_text(encoding="utf-8"))
    walk_forward = json.loads(args.walk_forward.read_text(encoding="utf-8"))
    result = approve_selective_policy(metadata, walk_forward)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result["result_calibration"]["selective_stability_approval"], indent=2))
