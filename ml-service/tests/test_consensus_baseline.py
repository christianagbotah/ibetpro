from __future__ import annotations

from app.baselines import poisson_baseline
from app.schemas import ModelFeatureVector, PredictionInput


def _input(with_consensus: bool) -> PredictionInput:
    return PredictionInput(
        matchId="baseline-consensus-test",
        asOf="2026-09-28T12:00:00Z",
        league="Premier League",
        homeTeam="Home",
        awayTeam="Away",
        status="upcoming",
        modelFeatures=ModelFeatureVector(
            home_elo=1500,
            away_elo=1500,
            elo_diff=0,
            home_form_points_5=1.5,
            away_form_points_5=1.5,
            home_goals_for_5=1.4,
            away_goals_for_5=1.2,
            home_goals_against_5=1.1,
            away_goals_against_5=1.3,
            home_market_prob=0.50,
            draw_market_prob=0.30,
            away_market_prob=0.20,
            market_consensus_available=with_consensus,
            market_consensus_age_minutes=30 if with_consensus else None,
        ),
    )


def test_baseline_prefers_genuine_consensus_for_1x2():
    result = poisson_baseline(_input(True))

    assert result.resultMode == "market-consensus"
    assert result.result.homeWin == 0.5
    assert result.result.draw == 0.3
    assert result.result.awayWin == 0.2
    assert any("market consensus" in warning for warning in result.warnings)


def test_baseline_stays_poisson_without_consensus():
    result = poisson_baseline(_input(False))

    assert result.resultMode == "baseline"
    assert abs(
        result.result.homeWin + result.result.draw + result.result.awayWin - 1.0
    ) < 0.001
