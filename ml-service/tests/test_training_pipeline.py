from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from training.build_features import build_features
from training.train_xgb import ChronologicalSplit, train


def synthetic_raw(n: int = 180) -> pd.DataFrame:
    rng = np.random.default_rng(42)
    teams = [f"T{i:02d}" for i in range(12)]
    rows = []
    start = pd.Timestamp("2021-01-01T15:00:00Z")

    for i in range(n):
        home = teams[i % len(teams)]
        away = teams[(i * 5 + 3) % len(teams)]
        if home == away:
            away = teams[(i * 5 + 4) % len(teams)]

        home_strength = (int(home[1:]) % 6) * 0.12
        away_strength = (int(away[1:]) % 6) * 0.12
        home_lambda = 1.25 + 0.25 + home_strength - away_strength * 0.4
        away_lambda = 1.10 + away_strength - home_strength * 0.35

        hg = int(rng.poisson(max(home_lambda, 0.2)))
        ag = int(rng.poisson(max(away_lambda, 0.2)))

        rows.append(
            {
                "fixture_id": f"synthetic-{i}",
                "kickoff_utc": (start + pd.Timedelta(days=i * 7)).isoformat(),
                "league": "Synthetic League",
                "season": str(2021 + i // 52),
                "home_team_id": home,
                "away_team_id": away,
                "home_goals": hg,
                "away_goals": ag,
                "home_xg": max(0.1, home_lambda + rng.normal(0, 0.15)),
                "away_xg": max(0.1, away_lambda + rng.normal(0, 0.15)),
                "home_shots": max(1, int(home_lambda * 7 + rng.normal(0, 2))),
                "away_shots": max(1, int(away_lambda * 7 + rng.normal(0, 2))),
                "home_sot": max(1, int(home_lambda * 3 + rng.normal(0, 1))),
                "away_sot": max(1, int(away_lambda * 3 + rng.normal(0, 1))),
                "home_odds": 2.0 + float(rng.normal(0, 0.15)),
                "draw_odds": 3.2 + float(rng.normal(0, 0.15)),
                "away_odds": 2.8 + float(rng.normal(0, 0.2)),
            }
        )

    return pd.DataFrame(rows)


def test_training_pipeline_runs_end_to_end(tmp_path: Path):
    features = build_features(synthetic_raw())
    dataset = tmp_path / "features.csv"
    features.to_csv(dataset, index=False)

    metadata = train(
        dataset,
        tmp_path / "model",
        ChronologicalSplit(
            train_end=pd.Timestamp("2022-12-31T23:59:59Z"),
            calibration_end=pd.Timestamp("2023-09-30T23:59:59Z"),
            test_end=pd.Timestamp("2024-06-30T23:59:59Z"),
        ),
    )

    assert metadata["model_version"] == "football-ensemble-v0"
    assert metadata["result_calibration"]["selected_model"] in {"xgboost", "lightgbm"}
    assert metadata["metrics"]["rows"]["train"] > 0
    assert metadata["metrics"]["rows"]["calibration"] > 0
    assert metadata["metrics"]["rows"]["test"] > 0
    assert 0 <= metadata["metrics"]["result"]["accuracy"] <= 1
