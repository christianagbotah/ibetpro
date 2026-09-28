from __future__ import annotations

import numpy as np

from app import inference
from app.schemas import PredictionInput, ModelFeatureVector


class _ResultModel:
    def predict_proba(self, frame):
        return np.array([[0.50, 0.25, 0.25]], dtype=float)


class _GoalModel:
    def __init__(self, value: float):
        self.value = value

    def predict(self, frame):
        return np.array([self.value], dtype=float)


class _Bundle:
    version = "test-enriched-v1"
    feature_columns = [
        "home_elo",
        "away_elo",
        "elo_diff",
        "home_form_points_5",
        "away_form_points_5",
        "home_goals_for_5",
        "away_goals_for_5",
        "home_goals_against_5",
        "away_goals_against_5",
        "home_xg_for_5",
        "away_xg_for_5",
        "home_xg_against_5",
        "away_xg_against_5",
        "home_shots_5",
        "away_shots_5",
        "home_sot_5",
        "away_sot_5",
        "home_rest_days",
        "away_rest_days",
        "home_implied_prob",
        "draw_implied_prob",
        "away_implied_prob",
        "home_possession_5",
        "away_possession_5",
        "home_corners_5",
        "away_corners_5",
    ]
    imputation = {name: 0.0 for name in feature_columns}
    result_calibrator = _ResultModel()
    home_goal_model = _GoalModel(1.6)
    away_goal_model = _GoalModel(1.1)
    result_model_weight = 0.7
    result_goal_weight = 0.2


def _payload() -> PredictionInput:
    return PredictionInput(
        matchId="m1",
        asOf="2026-09-28T12:00:00Z",
        league="Premier League",
        homeTeam="Home",
        awayTeam="Away",
        status="upcoming",
        modelFeatures=ModelFeatureVector(
            home_elo=1550,
            away_elo=1500,
            elo_diff=50,
            home_form_points_5=2.0,
            away_form_points_5=1.2,
            home_goals_for_5=1.8,
            away_goals_for_5=1.1,
            home_goals_against_5=0.9,
            away_goals_against_5=1.4,
            home_xg_for_5=None,
            away_xg_for_5=None,
            home_xg_against_5=None,
            away_xg_against_5=None,
            home_shots_5=None,
            away_shots_5=None,
            home_sot_5=None,
            away_sot_5=None,
            home_rest_days=7,
            away_rest_days=6,
            home_implied_prob=None,
            draw_implied_prob=None,
            away_implied_prob=None,
        ),
    )


def test_completeness_uses_trained_feature_schema(monkeypatch):
    monkeypatch.setattr(inference, "get_model_bundle", lambda: _Bundle())

    result = inference.predict(_payload(), require_model=True)

    # 11 of the 26 trained features are observed in this payload.
    assert result.dataCompleteness == round(11 / 26, 4)
    assert any("model features were imputed" in warning for warning in result.warnings)
    assert any("substantial share" in warning for warning in result.warnings)
    assert result.confidence < 0.70
