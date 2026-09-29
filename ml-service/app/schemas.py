from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field


class TeamFeatureSnapshot(BaseModel):
    teamName: str
    matchesPlayed: int = 0
    wins: int = 0
    draws: int = 0
    losses: int = 0
    goalsFor: int = 0
    goalsAgainst: int = 0
    eloRating: Optional[float] = None
    xgFor: Optional[float] = None
    xgAgainst: Optional[float] = None
    shotsPerGame: Optional[float] = None
    shotsOnTargetPerGame: Optional[float] = None
    possessionAvg: Optional[float] = None
    cornersPerGame: Optional[float] = None
    cardsPerGame: Optional[float] = None
    form: Optional[str] = None


class ModelFeatureVector(BaseModel):
    home_elo: float
    away_elo: float
    elo_diff: float
    home_form_points_5: float
    away_form_points_5: float
    home_goals_for_5: float
    away_goals_for_5: float
    home_goals_against_5: float
    away_goals_against_5: float
    home_xg_for_5: float | None = None
    away_xg_for_5: float | None = None
    home_xg_against_5: float | None = None
    away_xg_against_5: float | None = None
    home_shots_5: float | None = None
    away_shots_5: float | None = None
    home_sot_5: float | None = None
    away_sot_5: float | None = None
    home_rest_days: float | None = None
    away_rest_days: float | None = None
    home_implied_prob: float | None = None
    draw_implied_prob: float | None = None
    away_implied_prob: float | None = None
    home_market_prob: float | None = None
    draw_market_prob: float | None = None
    away_market_prob: float | None = None
    market_consensus_available: bool | None = None
    market_consensus_age_minutes: float | None = None
    market_overround: float | None = None
    market_entropy: float | None = None
    market_home_away_log_ratio: float | None = None
    market_home_draw_log_ratio: float | None = None
    market_away_draw_log_ratio: float | None = None
    market_snapshot_count: float | None = None
    market_history_minutes: float | None = None
    home_market_prob_move_open: float | None = None
    draw_market_prob_move_open: float | None = None
    away_market_prob_move_open: float | None = None
    market_overround_move_open: float | None = None
    home_market_prob_move_6h: float | None = None
    draw_market_prob_move_6h: float | None = None
    away_market_prob_move_6h: float | None = None
    home_market_prob_move_24h: float | None = None
    draw_market_prob_move_24h: float | None = None
    away_market_prob_move_24h: float | None = None
    home_possession_5: float | None = None
    away_possession_5: float | None = None
    home_corners_5: float | None = None
    away_corners_5: float | None = None
    home_yellow_cards_5: float | None = None
    away_yellow_cards_5: float | None = None
    home_red_cards_5: float | None = None
    away_red_cards_5: float | None = None
    home_home_form_points_5: float | None = None
    away_away_form_points_5: float | None = None
    home_home_goals_for_5: float | None = None
    home_home_goals_against_5: float | None = None
    away_away_goals_for_5: float | None = None
    away_away_goals_against_5: float | None = None
    home_home_shots_5: float | None = None
    away_away_shots_5: float | None = None
    home_home_sot_5: float | None = None
    away_away_sot_5: float | None = None
    home_home_corners_5: float | None = None
    away_away_corners_5: float | None = None
    home_home_yellow_cards_5: float | None = None
    away_away_yellow_cards_5: float | None = None


class PredictionInput(BaseModel):
    matchId: str
    asOf: str
    league: str
    homeTeam: str
    awayTeam: str
    status: str
    minute: Optional[int] = None
    homeScore: Optional[int] = None
    awayScore: Optional[int] = None
    homeOdds: Optional[float] = None
    drawOdds: Optional[float] = None
    awayOdds: Optional[float] = None
    overUnderLine: Optional[float] = None
    home: Optional[TeamFeatureSnapshot] = None
    away: Optional[TeamFeatureSnapshot] = None
    modelFeatures: Optional[ModelFeatureVector] = None


class ScoreProbability(BaseModel):
    home: int
    away: int
    probability: float = Field(ge=0.0, le=1.0)


class ProbabilityMarket(BaseModel):
    key: str
    label: str
    probability: float = Field(ge=0.0, le=1.0)
    fairOdds: Optional[float] = None


class ExpectedGoals(BaseModel):
    home: float
    away: float
    total: float


class ResultProbabilities(BaseModel):
    homeWin: float = Field(ge=0.0, le=1.0)
    draw: float = Field(ge=0.0, le=1.0)
    awayWin: float = Field(ge=0.0, le=1.0)


class MatchPrediction(BaseModel):
    resultMode: Literal["baseline", "market-consensus", "selective-model"] = "baseline"
    schemaVersion: Literal["1.0"] = "1.0"
    modelVersion: str
    source: Literal["heuristic-baseline-v1", "poisson-baseline-v1", "ml-service"]
    generatedAt: str
    asOf: str
    matchId: str
    expectedGoals: ExpectedGoals
    result: ResultProbabilities
    scorelines: list[ScoreProbability]
    markets: list[ProbabilityMarket]
    confidence: float = Field(ge=0.0, le=1.0)
    dataCompleteness: float = Field(ge=0.0, le=1.0)
    warnings: list[str] = []
