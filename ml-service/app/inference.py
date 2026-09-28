from __future__ import annotations

import math
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from .baselines import poisson_baseline
from .model_registry import get_model_bundle
from .schemas import (
    ExpectedGoals,
    MatchPrediction,
    PredictionInput,
    ProbabilityMarket,
    ResultProbabilities,
    ScoreProbability,
)


def _poisson(k: int, lam: float) -> float:
    return math.exp(-lam) * (lam ** k) / math.factorial(k)


def _fair_odds(probability: float) -> float | None:
    return round(1.0 / probability, 2) if 0 < probability <= 1 else None


def _score_matrix(home_lambda: float, away_lambda: float) -> list[ScoreProbability]:
    matrix: list[ScoreProbability] = []
    for home in range(9):
        for away in range(9):
            matrix.append(
                ScoreProbability(
                    home=home,
                    away=away,
                    probability=_poisson(home, home_lambda) * _poisson(away, away_lambda),
                )
            )

    mass = sum(row.probability for row in matrix)
    return [
        ScoreProbability(
            home=row.home,
            away=row.away,
            probability=row.probability / mass,
        )
        for row in matrix
    ]


def _markets(
    matrix: list[ScoreProbability],
    home_win: float,
    draw: float,
    away_win: float,
) -> list[ProbabilityMarket]:
    def p(predicate) -> float:
        return sum(row.probability for row in matrix if predicate(row))

    values = [
        ("home-win", "Home win", home_win),
        ("draw", "Draw", draw),
        ("away-win", "Away win", away_win),
        ("1x", "Home or draw", home_win + draw),
        ("x2", "Away or draw", away_win + draw),
        ("12", "Either team wins", home_win + away_win),
        ("over-0.5", "Over 0.5 goals", p(lambda s: s.home + s.away >= 1)),
        ("over-1.5", "Over 1.5 goals", p(lambda s: s.home + s.away >= 2)),
        ("over-2.5", "Over 2.5 goals", p(lambda s: s.home + s.away >= 3)),
        ("under-2.5", "Under 2.5 goals", p(lambda s: s.home + s.away <= 2)),
        ("over-3.5", "Over 3.5 goals", p(lambda s: s.home + s.away >= 4)),
        ("under-3.5", "Under 3.5 goals", p(lambda s: s.home + s.away <= 3)),
        ("btts-yes", "Both teams to score", p(lambda s: s.home > 0 and s.away > 0)),
        ("btts-no", "Both teams not to score", p(lambda s: s.home == 0 or s.away == 0)),
        ("home-over-0.5", "Home over 0.5 goals", p(lambda s: s.home >= 1)),
        ("home-over-1.5", "Home over 1.5 goals", p(lambda s: s.home >= 2)),
        ("away-over-0.5", "Away over 0.5 goals", p(lambda s: s.away >= 1)),
        ("away-over-1.5", "Away over 1.5 goals", p(lambda s: s.away >= 2)),
    ]

    return [
        ProbabilityMarket(
            key=key,
            label=label,
            probability=round(float(probability), 4),
            fairOdds=_fair_odds(float(probability)),
        )
        for key, label, probability in values
    ]


def predict(payload: PredictionInput, require_model: bool = False) -> MatchPrediction:
    bundle = get_model_bundle()
    if bundle is None or payload.modelFeatures is None:
        if require_model:
            missing = []
            if bundle is None:
                missing.append("configured trained model")
            if payload.modelFeatures is None:
                missing.append("modelFeatures")
            raise RuntimeError("Candidate inference unavailable: missing " + ", ".join(missing))
        return poisson_baseline(payload)

    raw = payload.modelFeatures.model_dump()
    row = {}
    for feature in bundle.feature_columns:
        value = raw.get(feature)
        if value is None:
            value = bundle.imputation.get(feature, 0.0)
        row[feature] = float(value)

    frame = pd.DataFrame([row], columns=bundle.feature_columns)

    model_probs = np.asarray(bundle.result_calibrator.predict_proba(frame)[0], dtype=float)
    if len(model_probs) != 3:
        raise RuntimeError(f"Expected 3 result probabilities, got {len(model_probs)}")
    model_probs = model_probs / model_probs.sum()

    home_elo = float(row.get("home_elo", 1500.0)) + 65.0
    away_elo = float(row.get("away_elo", 1500.0))
    home_no_draw = 1.0 / (1.0 + 10 ** ((away_elo - home_elo) / 400.0))
    elo_probs = np.array(
        [home_no_draw * 0.75, 0.25, (1.0 - home_no_draw) * 0.75],
        dtype=float,
    )
    model_weight = bundle.result_model_weight
    result_probs = model_weight * model_probs + (1.0 - model_weight) * elo_probs
    result_probs = result_probs / result_probs.sum()

    home_lambda = float(np.clip(bundle.home_goal_model.predict(frame)[0], 0.05, 6.0))
    away_lambda = float(np.clip(bundle.away_goal_model.predict(frame)[0], 0.05, 6.0))

    matrix = _score_matrix(home_lambda, away_lambda)
    matrix_home = sum(row.probability for row in matrix if row.home > row.away)
    matrix_draw = sum(row.probability for row in matrix if row.home == row.away)
    matrix_away = 1.0 - matrix_home - matrix_draw

    # Result classifier is the authoritative 1X2 estimator; the goal models
    # remain authoritative for score/goal-derived markets.
    home_win, draw, away_win = map(float, result_probs)

    warnings: list[str] = []
    divergence = max(
        abs(home_win - matrix_home),
        abs(draw - matrix_draw),
        abs(away_win - matrix_away),
    )
    if divergence > 0.18:
        warnings.append(
            "Result and goal-model distributions disagree materially; interpret confidence cautiously."
        )

    completeness = sum(value is not None for value in raw.values()) / max(len(raw), 1)
    separation = max(home_win, draw, away_win) - min(home_win, draw, away_win)
    confidence = max(0.35, min(0.92, 0.40 + completeness * 0.30 + separation * 0.25 - divergence * 0.20))

    scorelines = sorted(matrix, key=lambda item: item.probability, reverse=True)[:10]
    scorelines = [
        ScoreProbability(
            home=item.home,
            away=item.away,
            probability=round(item.probability, 4),
        )
        for item in scorelines
    ]

    return MatchPrediction(
        modelVersion=bundle.version,
        source="ml-service",
        generatedAt=datetime.now(timezone.utc).isoformat(),
        asOf=payload.asOf,
        matchId=payload.matchId,
        expectedGoals=ExpectedGoals(
            home=round(home_lambda, 2),
            away=round(away_lambda, 2),
            total=round(home_lambda + away_lambda, 2),
        ),
        result=ResultProbabilities(
            homeWin=round(home_win, 4),
            draw=round(draw, 4),
            awayWin=round(away_win, 4),
        ),
        scorelines=scorelines,
        markets=_markets(matrix, home_win, draw, away_win),
        confidence=round(confidence, 4),
        dataCompleteness=round(completeness, 4),
        warnings=warnings,
    )
