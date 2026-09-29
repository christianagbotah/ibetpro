from __future__ import annotations

import math
import os
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


def _policy_allows_divergence(divergence: float, policy: dict) -> bool:
    bands = policy.get("bands", [])
    for index, band in enumerate(bands):
        if not band.get("use_candidate"):
            continue
        lower = float(band["lower"])
        upper = float(band["upper"])
        is_last = index == len(bands) - 1
        if divergence >= lower and (
            divergence <= upper if is_last else divergence < upper
        ):
            return True
    return False


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
    observed_features = 0
    imputed_features: list[str] = []
    for feature in bundle.feature_columns:
        value = raw.get(feature)
        if value is None:
            imputed_features.append(feature)
            value = bundle.imputation.get(feature, 0.0)
        else:
            observed_features += 1
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

    home_lambda = float(np.clip(bundle.home_goal_model.predict(frame)[0], 0.05, 6.0))
    away_lambda = float(np.clip(bundle.away_goal_model.predict(frame)[0], 0.05, 6.0))

    matrix = _score_matrix(home_lambda, away_lambda)
    matrix_home = sum(item.probability for item in matrix if item.home > item.away)
    matrix_draw = sum(item.probability for item in matrix if item.home == item.away)
    matrix_away = 1.0 - matrix_home - matrix_draw
    goal_probs = np.array([matrix_home, matrix_draw, matrix_away], dtype=float)

    market_values = [
        raw.get("home_implied_prob"),
        raw.get("draw_implied_prob"),
        raw.get("away_implied_prob"),
    ]
    market_available = all(
        value is not None and np.isfinite(float(value)) and float(value) > 0
        for value in market_values
    )
    if market_available:
        market_probs = np.asarray(market_values, dtype=float)
        market_probs = market_probs / market_probs.sum()
    else:
        # Training uses ELO as the market-component fallback when a fixture has
        # no genuine pre-match market snapshot. Keep serving semantics identical.
        market_probs = elo_probs.copy()

    model_weight = bundle.result_model_weight
    goal_weight = bundle.result_goal_weight
    market_weight = getattr(bundle, "result_market_weight", 0.0)
    elo_weight = max(
        0.0,
        1.0 - model_weight - goal_weight - market_weight,
    )
    global_probs = (
        model_weight * model_probs
        + goal_weight * goal_probs
        + market_weight * market_probs
        + elo_weight * elo_probs
    )
    global_probs = global_probs / global_probs.sum()

    selective_policy = getattr(bundle, "selective_policy", None)
    consensus_available = bool(raw.get("market_consensus_available"))
    consensus_age = raw.get("market_consensus_age_minutes")
    max_consensus_age = float(
        os.environ.get("SELECTIVE_MAX_CONSENSUS_AGE_MINUTES", "360")
    )
    consensus_fresh = (
        consensus_available
        and consensus_age is not None
        and np.isfinite(float(consensus_age))
        and 0.0 <= float(consensus_age) <= max_consensus_age
    )
    selective_used = False
    selective_abstained = False
    selective_divergence = None

    if selective_policy and (not market_available or not consensus_fresh):
        fallback = poisson_baseline(payload)
        reason = (
            "genuine market consensus is unavailable"
            if not market_available or not consensus_available
            else f"the consensus snapshot is older than {max_consensus_age:.0f} minutes"
        )
        fallback.warnings.append(
            f"Trained selective inference was not used because {reason}; prediction fell back to the baseline model."
        )
        return fallback

    if market_available and consensus_fresh and selective_policy:
        weights = selective_policy.get("alternative_weights", {})
        alternative_model_weight = float(weights.get("model", 0.0))
        alternative_goal_weight = float(weights.get("goal", 0.0))
        alternative_market_weight = float(weights.get("market", 1.0))
        alternative_elo_weight = max(
            0.0,
            1.0
            - alternative_model_weight
            - alternative_goal_weight
            - alternative_market_weight,
        )
        alternative_probs = (
            alternative_model_weight * model_probs
            + alternative_goal_weight * goal_probs
            + alternative_market_weight * market_probs
            + alternative_elo_weight * elo_probs
        )
        alternative_probs = alternative_probs / alternative_probs.sum()
        selective_divergence = float(
            np.max(np.abs(alternative_probs - market_probs))
        )
        selective_used = _policy_allows_divergence(
            selective_divergence,
            selective_policy,
        )
        selective_abstained = not selective_used
        result_probs = alternative_probs if selective_used else market_probs
    else:
        result_probs = global_probs

    # Result classifier/ensemble is authoritative for 1X2; goal models remain
    # authoritative for score and goal-derived markets.
    home_win, draw, away_win = map(float, result_probs)

    warnings: list[str] = []
    if selective_policy and market_available and not consensus_available:
        warnings.append(
            "Selective model deviation is disabled because genuine consensus odds are unavailable for this fixture."
        )
    elif selective_policy and market_available and not consensus_fresh:
        warnings.append(
            f"Selective model deviation is disabled because the consensus odds snapshot is older than {max_consensus_age:.0f} minutes."
        )

    if selective_used:
        warnings.append(
            f"Selective model deviation was authorized for this fixture (market divergence {selective_divergence:.3f})."
        )
    elif selective_abstained:
        warnings.append(
            "Model did not meet the calibrated selective-edge condition; 1X2 probabilities use market consensus."
        )

    if market_weight > 0 and not market_available:
        warnings.append(
            "Market ensemble weight is configured but genuine market probabilities are unavailable; the market component fell back to ELO."
        )

    if imputed_features:
        warnings.append(
            f"{len(imputed_features)} of {len(bundle.feature_columns)} model features were imputed."
        )
        if len(imputed_features) / max(len(bundle.feature_columns), 1) >= 0.25:
            warnings.append(
                "A substantial share of trained-model features is unavailable for this fixture; confidence is reduced."
            )

    divergence = max(
        abs(home_win - matrix_home),
        abs(draw - matrix_draw),
        abs(away_win - matrix_away),
    )
    if divergence > 0.18:
        warnings.append(
            "Result and goal-model distributions disagree materially; interpret confidence cautiously."
        )

    completeness = observed_features / max(len(bundle.feature_columns), 1)
    separation = max(home_win, draw, away_win) - min(home_win, draw, away_win)
    imputation_penalty = min(0.20, (1.0 - completeness) * 0.25)
    confidence = max(
        0.25,
        min(
            0.92,
            0.40
            + completeness * 0.30
            + separation * 0.25
            - divergence * 0.20
            - imputation_penalty,
        ),
    )

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
        resultMode=(
            "selective-model"
            if selective_used
            else "market-consensus"
            if selective_abstained
            else "baseline"
        ),
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
