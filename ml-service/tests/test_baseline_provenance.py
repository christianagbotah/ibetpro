from __future__ import annotations

from app.baselines import poisson_baseline
from app.schemas import PredictionInput


def test_poisson_baseline_reports_its_actual_provenance():
    payload = PredictionInput(
        matchId="baseline-provenance",
        asOf="2026-09-29T06:45:00Z",
        league="Premier League",
        homeTeam="Home",
        awayTeam="Away",
        status="upcoming",
        home=None,
        away=None,
    )

    result = poisson_baseline(payload)

    assert result.source == "poisson-baseline-v1"
    assert result.modelVersion == "poisson-baseline-v1"
    assert result.resultMode == "baseline"
