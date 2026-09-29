from __future__ import annotations

from training.approve_selective_policy import approve_selective_policy


def test_approval_is_withheld_without_stable_bands():
    metadata = {
        "result_calibration": {
            "selective_policy": {
                "bands": [
                    {"lower": 0.02, "upper": 0.05, "use_candidate": True}
                ]
            }
        }
    }
    walk_forward = {
        "selective_stability": {
            "eligible_for_shadow": False,
            "stable_band_count": 0,
            "stable_bands": [],
            "required_folds": 3,
            "material_market_edge_required": 0.001,
        }
    }

    result = approve_selective_policy(metadata, walk_forward)
    approval = result["result_calibration"]["selective_stability_approval"]

    assert approval["approved"] is False
    assert approval["stable_bands"] == []


def test_approval_copies_only_walk_forward_stable_bands():
    metadata = {
        "result_calibration": {
            "selective_policy": {
                "bands": [
                    {"lower": 0.02, "upper": 0.05, "use_candidate": True},
                    {"lower": 0.05, "upper": 0.10, "use_candidate": True},
                ]
            }
        }
    }
    walk_forward = {
        "selective_stability": {
            "eligible_for_shadow": True,
            "stable_band_count": 1,
            "stable_bands": [{"lower": 0.02, "upper": 0.05}],
            "required_folds": 3,
            "material_market_edge_required": 0.001,
        }
    }

    result = approve_selective_policy(metadata, walk_forward)
    approval = result["result_calibration"]["selective_stability_approval"]

    assert approval["approved"] is True
    assert approval["required_folds"] == 3
    assert approval["stable_bands"] == [{"lower": 0.02, "upper": 0.05}]
