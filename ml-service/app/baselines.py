from __future__ import annotations

import math
from datetime import datetime, timezone

from .schemas import (
    ExpectedGoals,
    MatchPrediction,
    PredictionInput,
    ProbabilityMarket,
    ResultProbabilities,
    ScoreProbability,
)


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _safe_rate(numerator: float, denominator: float, fallback: float) -> float:
    return numerator / denominator if denominator and denominator > 0 else fallback


def _poisson(k: int, lam: float) -> float:
    return math.exp(-lam) * (lam**k) / math.factorial(k)


def _fair_odds(probability: float) -> float | None:
    return round(1.0 / probability, 2) if 0 < probability <= 1 else None


def estimate_expected_goals(payload: PredictionInput) -> tuple[float, float]:
    league_goal_rate = 1.35
    home_matches = payload.home.matchesPlayed if payload.home else 0
    away_matches = payload.away.matchesPlayed if payload.away else 0

    home_scored = _safe_rate(payload.home.goalsFor if payload.home else 0, home_matches, league_goal_rate)
    home_conceded = _safe_rate(payload.home.goalsAgainst if payload.home else 0, home_matches, league_goal_rate)
    away_scored = _safe_rate(payload.away.goalsFor if payload.away else 0, away_matches, league_goal_rate)
    away_conceded = _safe_rate(payload.away.goalsAgainst if payload.away else 0, away_matches, league_goal_rate)

    home_xg = payload.home.xgFor if payload.home and payload.home.xgFor and payload.home.xgFor > 0 else home_scored
    home_xga = payload.home.xgAgainst if payload.home and payload.home.xgAgainst and payload.home.xgAgainst > 0 else home_conceded
    away_xg = payload.away.xgFor if payload.away and payload.away.xgFor and payload.away.xgFor > 0 else away_scored
    away_xga = payload.away.xgAgainst if payload.away and payload.away.xgAgainst and payload.away.xgAgainst > 0 else away_conceded

    home_elo = payload.home.eloRating if payload.home and payload.home.eloRating else 1500
    away_elo = payload.away.eloRating if payload.away and payload.away.eloRating else 1500
    elo_diff = _clamp((home_elo - away_elo) / 400.0, -1.0, 1.0)

    home_attack = home_scored * 0.45 + home_xg * 0.55
    away_attack = away_scored * 0.45 + away_xg * 0.55
    home_def_weakness = home_conceded * 0.45 + home_xga * 0.55
    away_def_weakness = away_conceded * 0.45 + away_xga * 0.55

    home_lambda = ((home_attack + away_def_weakness) / 2.0) * 1.10 * (1 + elo_diff * 0.10)
    away_lambda = ((away_attack + home_def_weakness) / 2.0) * 0.94 * (1 - elo_diff * 0.08)

    if payload.status == "live":
        minute = _clamp(float(payload.minute or 0), 0, 120)
        remaining = max(0.08, 1.0 - minute / 90.0)
        home_lambda = float(payload.homeScore or 0) + home_lambda * remaining
        away_lambda = float(payload.awayScore or 0) + away_lambda * remaining

    return _clamp(home_lambda, 0.15, 4.5), _clamp(away_lambda, 0.10, 4.0)


def _completeness(payload: PredictionInput) -> float:
    checks = [
        payload.home is not None,
        payload.away is not None,
        bool(payload.home and payload.home.matchesPlayed >= 5),
        bool(payload.away and payload.away.matchesPlayed >= 5),
        bool(payload.home and payload.home.eloRating),
        bool(payload.away and payload.away.eloRating),
        bool(payload.home and payload.home.xgFor),
        bool(payload.away and payload.away.xgFor),
        bool(payload.homeOdds),
        bool(payload.drawOdds),
        bool(payload.awayOdds),
    ]
    return sum(1 for item in checks if item) / len(checks)


def poisson_baseline(payload: PredictionInput) -> MatchPrediction:
    home_lambda, away_lambda = estimate_expected_goals(payload)
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
    matrix = [
        ScoreProbability(home=row.home, away=row.away, probability=row.probability / mass)
        for row in matrix
    ]

    home_win = sum(row.probability for row in matrix if row.home > row.away)
    draw = sum(row.probability for row in matrix if row.home == row.away)
    away_win = 1.0 - home_win - draw

    def p(predicate) -> float:
        return sum(row.probability for row in matrix if predicate(row))

    over_05 = p(lambda s: s.home + s.away >= 1)
    over_15 = p(lambda s: s.home + s.away >= 2)
    over_25 = p(lambda s: s.home + s.away >= 3)
    over_35 = p(lambda s: s.home + s.away >= 4)
    over_45 = p(lambda s: s.home + s.away >= 5)
    btts = p(lambda s: s.home > 0 and s.away > 0)

    market_values = [
        ("home-win", "Home win", home_win),
        ("draw", "Draw", draw),
        ("away-win", "Away win", away_win),
        ("1x", "Home or draw", home_win + draw),
        ("x2", "Away or draw", away_win + draw),
        ("12", "Either team wins", home_win + away_win),
        ("over-0.5", "Over 0.5 goals", over_05),
        ("over-1.5", "Over 1.5 goals", over_15),
        ("over-2.5", "Over 2.5 goals", over_25),
        ("under-2.5", "Under 2.5 goals", 1 - over_25),
        ("over-3.5", "Over 3.5 goals", over_35),
        ("under-3.5", "Under 3.5 goals", 1 - over_35),
        ("over-4.5", "Over 4.5 goals", over_45),
        ("btts-yes", "Both teams to score", btts),
        ("btts-no", "Both teams not to score", 1 - btts),
        ("home-over-0.5", "Home over 0.5 goals", p(lambda s: s.home >= 1)),
        ("home-over-1.5", "Home over 1.5 goals", p(lambda s: s.home >= 2)),
        ("away-over-0.5", "Away over 0.5 goals", p(lambda s: s.away >= 1)),
        ("away-over-1.5", "Away over 1.5 goals", p(lambda s: s.away >= 2)),
    ]

    markets = [
        ProbabilityMarket(
            key=key,
            label=label,
            probability=round(_clamp(probability, 0, 1), 4),
            fairOdds=_fair_odds(_clamp(probability, 0, 1)),
        )
        for key, label, probability in market_values
    ]

    completeness = _completeness(payload)
    warnings: list[str] = []
    if completeness < 0.65:
        warnings.append("Limited feature coverage; confidence is reduced.")
    if not (payload.home and payload.home.xgFor) or not (payload.away and payload.away.xgFor):
        warnings.append("xG inputs are incomplete; observed scoring rates are being used as fallback.")
    if not payload.homeOdds or not payload.awayOdds:
        warnings.append("Market odds are unavailable; no market calibration signal is included.")

    separation = max(home_win, draw, away_win) - min(home_win, draw, away_win)
    confidence = _clamp(0.35 + completeness * 0.35 + separation * 0.25, 0.35, 0.9)

    scorelines = sorted(matrix, key=lambda row: row.probability, reverse=True)[:10]
    scorelines = [
        ScoreProbability(home=row.home, away=row.away, probability=round(row.probability, 4))
        for row in scorelines
    ]

    return MatchPrediction(
        modelVersion="poisson-baseline-v1",
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
        markets=markets,
        confidence=round(confidence, 4),
        dataCompleteness=round(completeness, 4),
        warnings=warnings,
    )
