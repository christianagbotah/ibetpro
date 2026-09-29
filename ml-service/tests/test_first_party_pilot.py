from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from training.run_first_party_pilot import derive_split, run_first_party_pilot


def base_frame(rows: int = 12, horizon: str = "1h") -> pd.DataFrame:
    kickoff = pd.date_range("2026-01-01", periods=rows, freq="D", tz="UTC")
    snapshot = kickoff - pd.Timedelta(minutes=60)
    return pd.DataFrame(
        {
            "fixture_id": [f"fixture-{index}" for index in range(rows)],
            "kickoff_utc": kickoff,
            "home_goals": [1] * rows,
            "away_goals": [0] * rows,
            "result_class": [0] * rows,
            "snapshot_as_of": snapshot,
            "horizon_key": [horizon] * rows,
            "feature_schema_version": ["online-v1"] * rows,
            "feature_hash": [f"hash-{index}" for index in range(rows)],
            "horizon_minutes_actual": [60] * rows,
            "feature_completeness": [0.95] * rows,
            "market_consensus_available": [True] * rows,
            "market_snapshot_count": [3] * rows,
        }
    )


def test_derive_split_is_strictly_chronological():
    split = derive_split(base_frame(20))
    assert split.train_end < split.calibration_end < split.test_end


def test_pilot_rejects_mixed_horizons_before_training(tmp_path: Path):
    frame = base_frame(10)
    frame.loc[9, "horizon_key"] = "6h"
    dataset = tmp_path / "mixed.csv"
    frame.to_csv(dataset, index=False)

    with pytest.raises(ValueError, match="readiness checks"):
        run_first_party_pilot(
            dataset,
            tmp_path / "out",
            "1h",
            minimum_rows=1,
        )

    assert (tmp_path / "out" / "first-party-readiness.json").exists()


def test_pilot_rejects_duplicate_fixture_ids_before_training(tmp_path: Path):
    frame = base_frame(10)
    frame.loc[9, "fixture_id"] = frame.loc[8, "fixture_id"]
    dataset = tmp_path / "duplicate.csv"
    frame.to_csv(dataset, index=False)

    with pytest.raises(ValueError, match="readiness checks"):
        run_first_party_pilot(
            dataset,
            tmp_path / "out",
            "1h",
            minimum_rows=1,
        )


def test_pilot_rejects_undersized_corpus_before_training(tmp_path: Path):
    dataset = tmp_path / "small.csv"
    base_frame(10).to_csv(dataset, index=False)

    with pytest.raises(ValueError, match="readiness checks"):
        run_first_party_pilot(
            dataset,
            tmp_path / "out",
            "1h",
            minimum_rows=300,
        )


def test_pilot_rejects_post_kickoff_snapshot_before_training(tmp_path: Path):
    frame = base_frame(10)
    frame.loc[0, "snapshot_as_of"] = pd.Timestamp("2026-01-01T00:05:00Z")
    frame.loc[0, "horizon_minutes_actual"] = -5
    dataset = tmp_path / "leaky.csv"
    frame.to_csv(dataset, index=False)

    with pytest.raises(ValueError, match="readiness checks"):
        run_first_party_pilot(
            dataset,
            tmp_path / "out",
            "1h",
            minimum_rows=1,
        )
