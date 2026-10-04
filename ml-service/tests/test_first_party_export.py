from __future__ import annotations

from pathlib import Path

import pandas as pd

from training.train_xgb import feature_columns
from training.validate_first_party_export import assess


def _row(index: int = 0) -> dict:
    kickoff = pd.Timestamp("2026-10-10T15:00:00Z") + pd.Timedelta(days=index)
    snapshot = kickoff - pd.Timedelta(minutes=60)
    row = {
        "fixture_id": f"fixture-{index}",
        "kickoff_utc": kickoff.isoformat(),
        "home_goals": 2,
        "away_goals": 1,
        "result_class": 0,
        "snapshot_as_of": snapshot.isoformat(),
        "horizon_key": "1h",
        "feature_schema_version": "online-v1",
        "feature_hash": f"hash-{index}",
        "horizon_minutes_actual": 60,
        "feature_completeness": 0.90,
        "market_consensus_available": True,
        "market_snapshot_count": 4,
    }
    row.update({column: 1.0 for column in feature_columns("core")})
    return row


def test_valid_first_party_export_passes(tmp_path: Path):
    dataset = tmp_path / "first-party.csv"
    pd.DataFrame([_row(i) for i in range(3)]).to_csv(dataset, index=False)

    report = assess(dataset, "1h", min_rows=3, min_completeness=0.70)

    assert report["ready_for_first_party_training"] is True
    assert report["rows"] == 3
    assert report["feature_profile"] == "core"


def test_core_profile_completeness_uses_training_columns(tmp_path: Path):
    row = _row()
    core = feature_columns("core")
    for column in core[:8]:
        row[column] = None
    row["feature_completeness"] = 0.20
    dataset = tmp_path / "profile-completeness.csv"
    pd.DataFrame([row]).to_csv(dataset, index=False)

    report = assess(
        dataset,
        "1h",
        min_rows=1,
        min_completeness=0.70,
        feature_profile="core",
    )

    checks = {check["name"]: check for check in report["checks"]}
    assert report["ready_for_first_party_training"] is True
    assert checks["minimum_feature_completeness"]["actual"] == 22 / 30
    assert checks["minimum_feature_completeness"]["passed"] is True
    assert report["average_all_feature_completeness"] == 0.20


def test_post_kickoff_snapshot_fails(tmp_path: Path):
    row = _row()
    row["snapshot_as_of"] = "2026-10-10T15:05:00Z"
    row["horizon_minutes_actual"] = -5
    dataset = tmp_path / "leaky.csv"
    pd.DataFrame([row]).to_csv(dataset, index=False)

    report = assess(dataset, "1h", min_rows=1, min_completeness=0.70)

    assert report["ready_for_first_party_training"] is False
    checks = {check["name"]: check for check in report["checks"]}
    assert checks["pre_kickoff_snapshots"]["passed"] is False
    assert checks["horizon_window_compliance"]["passed"] is False
