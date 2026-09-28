import {
  MatchPrediction,
  PredictionInput,
  ProbabilityMarket,
  ScoreProbability,
  fairOdds,
} from "./contracts";

function factorial(n: number): number {
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function poisson(k: number, lambda: number): number {
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeRate(numerator: number, denominator: number, fallback: number): number {
  if (!denominator || denominator <= 0) return fallback;
  return numerator / denominator;
}

function estimateExpectedGoals(input: PredictionInput): { home: number; away: number } {
  const leagueGoalRate = 1.35;

  const homeMatches = input.home?.matchesPlayed || 0;
  const awayMatches = input.away?.matchesPlayed || 0;

  const homeScored = safeRate(input.home?.goalsFor || 0, homeMatches, leagueGoalRate);
  const homeConceded = safeRate(input.home?.goalsAgainst || 0, homeMatches, leagueGoalRate);
  const awayScored = safeRate(input.away?.goalsFor || 0, awayMatches, leagueGoalRate);
  const awayConceded = safeRate(input.away?.goalsAgainst || 0, awayMatches, leagueGoalRate);

  const homeXg = input.home?.xgFor && input.home.xgFor > 0 ? input.home.xgFor : homeScored;
  const homeXga = input.home?.xgAgainst && input.home.xgAgainst > 0 ? input.home.xgAgainst : homeConceded;
  const awayXg = input.away?.xgFor && input.away.xgFor > 0 ? input.away.xgFor : awayScored;
  const awayXga = input.away?.xgAgainst && input.away.xgAgainst > 0 ? input.away.xgAgainst : awayConceded;

  const homeElo = input.home?.eloRating || 1500;
  const awayElo = input.away?.eloRating || 1500;
  const eloDiff = clamp((homeElo - awayElo) / 400, -1, 1);

  const homeAttack = (homeScored * 0.45 + homeXg * 0.55);
  const awayAttack = (awayScored * 0.45 + awayXg * 0.55);
  const homeDefenseWeakness = (homeConceded * 0.45 + homeXga * 0.55);
  const awayDefenseWeakness = (awayConceded * 0.45 + awayXga * 0.55);

  let home = ((homeAttack + awayDefenseWeakness) / 2) * 1.10 * (1 + eloDiff * 0.10);
  let away = ((awayAttack + homeDefenseWeakness) / 2) * 0.94 * (1 - eloDiff * 0.08);

  if (input.status === "live") {
    const minute = clamp(input.minute || 0, 0, 120);
    const elapsedShare = clamp(minute / 90, 0, 1);
    const remainingShare = Math.max(0.08, 1 - elapsedShare);
    const homeScore = input.homeScore || 0;
    const awayScore = input.awayScore || 0;

    home = homeScore + home * remainingShare;
    away = awayScore + away * remainingShare;
  }

  return {
    home: clamp(home, 0.15, 4.5),
    away: clamp(away, 0.10, 4.0),
  };
}

function dataCompleteness(input: PredictionInput): number {
  const checks = [
    Boolean(input.home),
    Boolean(input.away),
    Boolean(input.home?.matchesPlayed && input.home.matchesPlayed >= 5),
    Boolean(input.away?.matchesPlayed && input.away.matchesPlayed >= 5),
    Boolean(input.home?.eloRating),
    Boolean(input.away?.eloRating),
    Boolean(input.home?.xgFor),
    Boolean(input.away?.xgFor),
    Boolean(input.homeOdds),
    Boolean(input.drawOdds),
    Boolean(input.awayOdds),
  ];

  return checks.filter(Boolean).length / checks.length;
}

function buildMarkets(
  matrix: ScoreProbability[],
  homeWin: number,
  draw: number,
  awayWin: number
): ProbabilityMarket[] {
  const probability = (fn: (score: ScoreProbability) => boolean) =>
    matrix.filter(fn).reduce((sum, score) => sum + score.probability, 0);

  const over05 = probability((s) => s.home + s.away >= 1);
  const over15 = probability((s) => s.home + s.away >= 2);
  const over25 = probability((s) => s.home + s.away >= 3);
  const over35 = probability((s) => s.home + s.away >= 4);
  const over45 = probability((s) => s.home + s.away >= 5);
  const bttsYes = probability((s) => s.home > 0 && s.away > 0);
  const homeOver05 = probability((s) => s.home >= 1);
  const homeOver15 = probability((s) => s.home >= 2);
  const awayOver05 = probability((s) => s.away >= 1);
  const awayOver15 = probability((s) => s.away >= 2);

  const raw = [
    ["home-win", "Home win", homeWin],
    ["draw", "Draw", draw],
    ["away-win", "Away win", awayWin],
    ["1x", "Home or draw", homeWin + draw],
    ["x2", "Away or draw", awayWin + draw],
    ["12", "Either team wins", homeWin + awayWin],
    ["over-0.5", "Over 0.5 goals", over05],
    ["over-1.5", "Over 1.5 goals", over15],
    ["over-2.5", "Over 2.5 goals", over25],
    ["under-2.5", "Under 2.5 goals", 1 - over25],
    ["over-3.5", "Over 3.5 goals", over35],
    ["under-3.5", "Under 3.5 goals", 1 - over35],
    ["over-4.5", "Over 4.5 goals", over45],
    ["btts-yes", "Both teams to score", bttsYes],
    ["btts-no", "Both teams not to score", 1 - bttsYes],
    ["home-over-0.5", "Home over 0.5 goals", homeOver05],
    ["home-over-1.5", "Home over 1.5 goals", homeOver15],
    ["away-over-0.5", "Away over 0.5 goals", awayOver05],
    ["away-over-1.5", "Away over 1.5 goals", awayOver15],
  ] as const;

  return raw.map(([key, label, p]) => ({
    key,
    label,
    probability: Math.round(clamp(p, 0, 1) * 10000) / 10000,
    fairOdds: fairOdds(clamp(p, 0, 1)),
  }));
}

export function poissonBaselinePredict(input: PredictionInput): MatchPrediction {
  const expected = estimateExpectedGoals(input);
  const maxGoals = 8;
  const matrix: ScoreProbability[] = [];

  for (let home = 0; home <= maxGoals; home++) {
    for (let away = 0; away <= maxGoals; away++) {
      matrix.push({
        home,
        away,
        probability: poisson(home, expected.home) * poisson(away, expected.away),
      });
    }
  }

  const matrixMass = matrix.reduce((sum, row) => sum + row.probability, 0);
  for (const row of matrix) row.probability /= matrixMass;

  const poissonHomeWin = matrix.filter((s) => s.home > s.away).reduce((a, b) => a + b.probability, 0);
  const poissonDraw = matrix.filter((s) => s.home === s.away).reduce((a, b) => a + b.probability, 0);
  const poissonAwayWin = 1 - poissonHomeWin - poissonDraw;

  const marketValues = [
    input.modelFeatures?.home_market_prob,
    input.modelFeatures?.draw_market_prob,
    input.modelFeatures?.away_market_prob,
  ];
  const hasConsensus =
    input.modelFeatures?.market_consensus_available === true &&
    marketValues.every(
      (value) => value != null && Number.isFinite(value) && value > 0
    );

  let homeWin = poissonHomeWin;
  let draw = poissonDraw;
  let awayWin = poissonAwayWin;
  if (hasConsensus) {
    const total = marketValues.reduce((sum, value) => sum + Number(value), 0);
    homeWin = Number(marketValues[0]) / total;
    draw = Number(marketValues[1]) / total;
    awayWin = Number(marketValues[2]) / total;
  }

  const completeness = dataCompleteness(input);

  const warnings: string[] = [];
  if (hasConsensus) {
    warnings.push(
      "1X2 probabilities use normalized market consensus; goal and score markets remain Poisson-derived."
    );
  }
  if (completeness < 0.65) warnings.push("Limited feature coverage; confidence is reduced.");
  if (!input.home?.xgFor || !input.away?.xgFor) warnings.push("xG inputs are incomplete; observed scoring rates are being used as fallback.");
  if (!input.homeOdds || !input.awayOdds) warnings.push("Market odds are unavailable; no market calibration signal is included.");

  const scorelines = [...matrix]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 10)
    .map((s) => ({ ...s, probability: Math.round(s.probability * 10000) / 10000 }));

  const separation = Math.max(homeWin, draw, awayWin) - Math.min(homeWin, draw, awayWin);
  const confidence = clamp(0.35 + completeness * 0.35 + separation * 0.25, 0.35, 0.9);

  return {
    schemaVersion: "1.0",
    resultMode: hasConsensus ? "market-consensus" : "baseline",
    modelVersion: "poisson-baseline-v1",
    source: "poisson-baseline-v1",
    generatedAt: new Date().toISOString(),
    asOf: input.asOf,
    matchId: input.matchId,
    expectedGoals: {
      home: Math.round(expected.home * 100) / 100,
      away: Math.round(expected.away * 100) / 100,
      total: Math.round((expected.home + expected.away) * 100) / 100,
    },
    result: {
      homeWin: Math.round(homeWin * 10000) / 10000,
      draw: Math.round(draw * 10000) / 10000,
      awayWin: Math.round(awayWin * 10000) / 10000,
    },
    scorelines,
    markets: buildMarkets(matrix, homeWin, draw, awayWin),
    confidence: Math.round(confidence * 10000) / 10000,
    dataCompleteness: Math.round(completeness * 10000) / 10000,
    warnings,
  };
}
