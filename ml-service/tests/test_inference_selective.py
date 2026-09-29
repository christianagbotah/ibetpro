from __future__ import annotations

import numpy as np

from app import inference
from app.schemas import ModelFeatureVector, PredictionInput


class _ResultModel:
    def predict_proba(self, frame):
        return np.array([[0.70, 0.15, 0.15]], dtype=float)


class _GoalModel:
    def __init__(self, value: float):
        self.value = value

    def predict(self, frame):
        return np.array([self.value], dtype=float)


class _Bundle:
    version = "selective-test-v1"
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
        "home_implied_prob",
        "draw_implied_prob",
        "away_implied_prob",
    ]
    imputation = {name: 0.0 for name in feature_columns}
    result_calibrator = _ResultModel()
    home_goal_model = _GoalModel(1.7)
    away_goal_model = _GoalModel(0.9)
    result_model_weight = 0.0
    result_goal_weight = 0.0
    result_market_weight = 1.0

    def __init__(self, enabled: bool):
        self.selective_policy = {
            "bands": [
                {
                    "lower": 0.0,
                    "upper": 1.01,
                    "use_candidate": enabled,
                }
            ],
            "alternative_weights": {
                "model": 1.0,
                "goal": 0.0,
                "market": 0.0,
                "elo": 0.0,
            },
        }


def _payload() -> PredictionInput:
    return PredictionInput(
        matchId="m-selective",
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
            away_form_points_5=1.0,
            home_goals_for_5=1.8,
            away_goals_for_5=1.0,
            home_goals_against_5=0.9,
            away_goals_against_5=1.4,
            home_implied_prob=0.50,
            draw_implied_prob=0.30,
            away_implied_prob=0.25,
            market_consensus_available=True,
            market_consensus_age_minutes=30,
        ),
    )


def test_selective_policy_abstains_to_market(monkeypatch):
    monkeypatch.setattr(inference, "get_model_bundle", lambda: _Bundle(False))

    result = inference.predict(_payload(), require_model=True)

    total = 0.50 + 0.30 + 0.25
    assert result.result.homeWin == round(0.50 / total, 4)
    assert result.result.draw == round(0.30 / total, 4)
    assert result.result.awayWin == round(0.25 / total, 4)
    assert any("market consensus" in warning for warning in result.warnings)


def test_selective_policy_can_authorize_model_deviation(monkeypatch):
    monkeypatch.setattr(inference, "get_model_bundle", lambda: _Bundle(True))

    result = inference.predict(_payload(), require_model=True)

    assert result.result.homeWin == 0.70
    assert result.result.draw == 0.15
    assert result.result.awayWin == 0.15
    assert any("Selective model deviation" in warning for warning in result.warnings)


def test_selective_policy_requires_genuine_consensus(monkeypatch):
    monkeypatch.setattr(inference, "get_model_bundle", lambda: _Bundle(True))
    payload = _payload()
    payload.modelFeatures.market_consensus_available = False

    result = inference.predict(payload, require_model=True)

    assert result.resultMode != "selective-model"
    assert any(
        "genuine consensus odds are unavailable" in warning
        for warning in result.warnings
    )


def test_selective_policy_rejects_stale_consensus(monkeypatch):
    monkeypatch.setattr(inference, "get_model_bundle", lambda: _Bundle(True))
    payload = _payload()
    payload.modelFeatures.market_consensus_age_minutes = 720

    result = inference.predict(payload, require_model=True)

    assert result.resultMode != "selective-model"
    assert any(
        "older than 360 minutes" in warning
        for warning in result.warnings
    )


def test_horizon_guard_accepts_matching_window():
    reason = inference.horizon_mismatch_reason(
        "1h",
        "upcoming",
        "2026-09-28T12:00:00Z",
        "2026-09-28T13:00:00Z",
    )
    assert reason is None


def test_horizon_guard_rejects_outside_window():
    reason = inference.horizon_mismatch_reason(
        "1h",
        "upcoming",
        "2026-09-28T12:00:00Z",
        "2026-09-28T16:00:00Z",
    )
    assert reason is not None
    assert "30-90 minutes" in reason


def test_horizon_guard_requires_upcoming_status_and_kickoff():
    assert "cannot be used" in inference.horizon_mismatch_reason(
        "6h",
        "live",
        "2026-09-28T12:00:00Z",
        "2026-09-28T18:00:00Z",
    )
    assert "requires kickoffAt" in inference.horizon_mismatch_reason(
        "24h",
        "upcoming",
        "2026-09-28T12:00:00Z",
        None,
    )
