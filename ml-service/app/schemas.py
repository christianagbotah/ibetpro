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
