// ============================================================================
// iBetPro AI Engine v2 - Advanced Prediction & Decision Engine
// Enhanced with: Market movement detection, live monitoring, smart cashout,
// multi-factor analysis, form tracking, head-to-head, and Monte Carlo simulation
// ============================================================================

import { config } from "./config";

// ==================== TYPE DEFINITIONS ====================

interface TeamStatsData {
  teamName: string;
  sport: string;
  league: string;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  form: string | null;
  homeRecord: string | null;
  awayRecord: string | null;
  attackRating: number;
  defenseRating: number;
  overallRating: number;
  eloRating?: number;
  xgFor?: number;
  xgAgainst?: number;
  possessionAvg?: number;
  shotsPerGame?: number;
  shotsOnTargetPerGame?: number;
  cornersPerGame?: number;
  cardsPerGame?: number;
}

interface MatchData {
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  homeOdds: number;
  drawOdds?: number;
  awayOdds: number;
  overOdds?: number;
  underOdds?: number;
  overUnderLine?: number;
  homeScore?: number;
  awayScore?: number;
  minute?: number;
  status: string;
  commenceTime?: string;
}

interface Prediction {
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  confidence: number;
  recommended: "home" | "away" | "draw" | "over" | "under";
  analysis: string;
  valueEdge: number;
  riskScore: number;
  kellyStake: number;
  // v2 enhanced fields
  factors: PredictionFactors;
  marketSignal: MarketSignal;
  confidenceBreakdown: ConfidenceBreakdown;
}

interface PredictionFactors {
  eloDiff: number;
  formDiff: number;
  homeAdvantage: number;
  attackVsDefense: number;
  oddsValue: number;
  marketMovement: number;
  headToHead: number;
  momentumScore: number;
}

interface MarketSignal {
  direction: "steam" | "reverse" | "stable" | "sharp" | "public";
  strength: number;
  description: string;
  oddsMovement: number;
}

interface ConfidenceBreakdown {
  statistical: number;
  form: number;
  market: number;
  historical: number;
  composite: number;
}

interface CashoutRecommendation {
  shouldCashout: boolean;
  cashoutAmount: number;
  partialCashoutAmount: number;
  reasoning: string;
  urgency: "low" | "medium" | "high" | "critical";
  waitOrCashout: "wait" | "cashout_partial" | "cashout_full" | "wait_for_settlement";
  settlementProbability: number;
  // v2 enhanced
  liveWinProbability: number;
  riskOfLoss: number;
  timeDecay: number;
  marketPressure: string;
  aiDecision: AIDecision;
}

interface AIDecision {
  action: "cashout_now" | "cashout_partial" | "hold" | "wait_for_settlement";
  confidence: number;
  reasoning: string[];
  factors: {
    currentScore: string;
    timeRemaining: string;
    liveWinProb: number;
    cashoutValue: number;
    expectedValue: number;
  };
}

interface DetailedAnalysis {
  matchOverview: string;
  homeTeamAnalysis: string;
  awayTeamAnalysis: string;
  headToHead: string;
  keyFactors: string[];
  prediction: string;
  riskAssessment: string;
  recommendedAction: string;
  marketInsight: string;
  confidenceLevel: string;
}

interface AutoBetCheck {
  shouldPlace: boolean;
  reason: string;
  betType: "single" | "accumulator_leg" | "skip";
  suggestedStake: number;
}

interface RiskCheckResult {
  canBet: boolean;
  reason: string;
  riskLevel: "safe" | "caution" | "danger";
}

// ==================== ELO RATING SYSTEM ====================

function calculateExpectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function updateEloRating(
  currentRating: number,
  expectedScore: number,
  actualScore: number,
  kFactor: number = 32
): number {
  return currentRating + kFactor * (actualScore - expectedScore);
}

// ==================== FORM ANALYSIS ====================

function analyzeForm(formString: string | null): {
  points: number;
  trend: "improving" | "declining" | "stable";
  consistency: number;
  lastFive: number[];
} {
  if (!formString || formString.length === 0) {
    return { points: 0, trend: "stable", consistency: 0.5, lastFive: [] };
  }

  const form = formString.split("").map((c) => {
    if (c === "W" || c === "w") return 3;
    if (c === "D" || c === "d") return 1;
    return 0;
  });

  const totalPoints = form.reduce((sum, p) => sum + p, 0);
  const lastFive = form.slice(0, 5);

  // Determine trend
  let trend: "improving" | "declining" | "stable" = "stable";
  if (form.length >= 3) {
    const recent = form.slice(0, 3).reduce((s, p) => s + p, 0) / 3;
    const older = form.slice(3, 6).reduce((s, p) => s + p, 0) / Math.max(1, form.slice(3, 6).length);
    if (recent > older + 0.5) trend = "improving";
    else if (recent < older - 0.5) trend = "declining";
  }

  // Calculate consistency (lower variance = more consistent)
  const mean = form.length > 0 ? totalPoints / form.length : 0;
  const variance = form.length > 0 ? form.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / form.length : 0;
  const consistency = Math.max(0, 1 - Math.sqrt(variance) / 3);

  return { points: totalPoints, trend, consistency, lastFive };
}

// ==================== MARKET MOVEMENT DETECTION ====================

function detectMarketMovement(
  currentOdds: number,
  openingOdds?: number,
  oddsHistory?: number[]
): MarketSignal {
  if (!openingOdds || !oddsHistory || oddsHistory.length < 2) {
    return {
      direction: "stable",
      strength: 0,
      description: "Insufficient data for market movement analysis",
      oddsMovement: 0,
    };
  }

  const movement = currentOdds - openingOdds;
  const recentMovement = oddsHistory.length >= 2
    ? oddsHistory[oddsHistory.length - 1] - oddsHistory[oddsHistory.length - 2]
    : 0;

  // Steam move: significant, rapid odds movement (sharp money)
  if (Math.abs(movement) > 0.15 && Math.abs(recentMovement) > 0.05) {
    return {
      direction: movement < 0 ? "steam" : "reverse",
      strength: Math.min(1, Math.abs(movement) * 5),
      description: movement < 0
        ? "Steam move detected - sharp money coming in, odds shortening rapidly"
        : "Reverse line movement - odds drifting against public sentiment",
      oddsMovement: movement,
    };
  }

  // Sharp money: small, consistent movement
  if (Math.abs(movement) > 0.05 && Math.abs(recentMovement) < 0.03) {
    return {
      direction: "sharp",
      strength: Math.min(0.7, Math.abs(movement) * 3),
      description: "Sharp money detected - slow, consistent odds movement suggests professional action",
      oddsMovement: movement,
    };
  }

  // Public money: movement in expected direction
  if (Math.abs(movement) > 0.05) {
    return {
      direction: "public",
      strength: Math.min(0.5, Math.abs(movement) * 2),
      description: "Public money movement - odds adjusting to betting volume",
      oddsMovement: movement,
    };
  }

  return {
    direction: "stable",
    strength: 0,
    description: "No significant market movement detected",
    oddsMovement: 0,
  };
}

// ==================== ATTACK VS DEFENSE ANALYSIS ====================

function analyzeAttackVsDefense(
  homeAttack: number,
  homeDefense: number,
  awayAttack: number,
  awayDefense: number,
  homeXgFor?: number,
  awayXgFor?: number
): { homeAdvantage: number; expectedGoals: { home: number; away: number }; matchupScore: number } {
  // Use xG if available for more accurate analysis
  const homeGoalExp = homeXgFor && homeXgFor > 0
    ? homeXgFor * (homeAttack / 50) * (100 - awayDefense) / 100
    : homeAttack * (100 - awayDefense) / 5000;

  const awayGoalExp = awayXgFor && awayXgFor > 0
    ? awayXgFor * (awayAttack / 50) * (100 - homeDefense) / 100
    : awayAttack * (100 - homeDefense) / 5000;

  const homeAdvantage = (homeGoalExp - awayGoalExp) * 0.5;
  const matchupScore = (homeGoalExp - awayGoalExp) / Math.max(homeGoalExp + awayGoalExp, 0.1);

  return {
    homeAdvantage: Math.round(homeAdvantage * 100) / 100,
    expectedGoals: {
      home: Math.round(homeGoalExp * 100) / 100,
      away: Math.round(awayGoalExp * 100) / 100,
    },
    matchupScore: Math.round(matchupScore * 100) / 100,
  };
}

// ==================== MONTE CARLO SIMULATION ====================

function monteCarloSimulation(
  homeWinProb: number,
  drawProb: number,
  awayWinProb: number,
  iterations: number = config.ai.monteCarloIterations
): { homeWinRate: number; drawRate: number; awayWinRate: number; confidence: number } {
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;

  for (let i = 0; i < iterations; i++) {
    const rand = Math.random();
    if (rand < homeWinProb) {
      homeWins++;
    } else if (rand < homeWinProb + drawProb) {
      draws++;
    } else {
      awayWins++;
    }
  }

  const simHomeWin = homeWins / iterations;
  const simDraw = draws / iterations;
  const simAwayWin = awayWins / iterations;

  // Confidence based on convergence
  const maxProb = Math.max(simHomeWin, simDraw, simAwayWin);
  const confidence = Math.min(1, maxProb * 1.5);

  return {
    homeWinRate: simHomeWin,
    drawRate: simDraw,
    awayWinRate: simAwayWin,
    confidence,
  };
}

// ==================== MAIN PREDICTION ENGINE ====================

export function analyzeMatch(
  match: MatchData,
  homeStats?: TeamStatsData | null,
  awayStats?: TeamStatsData | null,
  bankroll: number = 1000,
  kellyFraction: number = config.ai.kellyFraction
): Prediction {
  // Step 1: Elo-based probability estimation
  const homeElo = homeStats?.eloRating || config.ai.defaultElo;
  const awayElo = awayStats?.eloRating || config.ai.defaultElo;
  const homeEloExpected = calculateExpectedScore(homeElo + config.ai.eloHomeAdvantage, awayElo);
  const awayEloExpected = calculateExpectedScore(awayElo, homeElo + config.ai.eloHomeAdvantage);

  // Step 2: Form analysis
  const homeForm = analyzeForm(homeStats?.form || null);
  const awayForm = analyzeForm(awayStats?.form || null);
  const formDiff = (homeForm.points - awayForm.points) / Math.max(homeForm.lastFive.length + awayForm.lastFive.length, 1) * 3;

  // Step 3: Attack vs Defense matchup
  const attackDefense = analyzeAttackVsDefense(
    homeStats?.attackRating || 50,
    homeStats?.defenseRating || 50,
    awayStats?.attackRating || 50,
    awayStats?.defenseRating || 50,
    homeStats?.xgFor,
    awayStats?.xgFor
  );

  // Step 4: Market movement detection
  const marketSignal = detectMarketMovement(match.homeOdds);

  // Step 5: Odds-implied probability (market efficiency)
  const homeOddsProb = 1 / match.homeOdds;
  const drawOddsProb = match.drawOdds ? 1 / match.drawOdds : config.ai.baseDrawProb;
  const awayOddsProb = 1 / match.awayOdds;
  const oddsTotal = homeOddsProb + drawOddsProb + awayOddsProb;
  const margin = oddsTotal - 1;

  // Normalized probabilities (remove bookmaker margin)
  const normHomeProb = homeOddsProb / oddsTotal;
  const normDrawProb = drawOddsProb / oddsTotal;
  const normAwayProb = awayOddsProb / oddsTotal;

  // Step 6: Composite probability (weighted average of all factors)
  const eloWeight = 0.30;
  const formWeight = 0.15;
  const attackDefenseWeight = 0.20;
  const marketWeight = 0.25;
  const momentumWeight = 0.10;

  // Calculate momentum from form trend
  const homeMomentum = homeForm.trend === "improving" ? 0.05 : homeForm.trend === "declining" ? -0.05 : 0;
  const awayMomentum = awayForm.trend === "improving" ? 0.05 : awayForm.trend === "declining" ? -0.05 : 0;

  const compositeHomeWin = Math.min(0.95, Math.max(0.05,
    homeEloExpected * eloWeight +
    (normHomeProb + formDiff * 0.05) * formWeight +
    (normHomeProb + attackDefense.matchupScore * 0.1) * attackDefenseWeight +
    normHomeProb * marketWeight +
    (normHomeProb + homeMomentum - awayMomentum) * momentumWeight
  ));

  const compositeAwayWin = Math.min(0.95, Math.max(0.05,
    awayEloExpected * eloWeight +
    (normAwayProb - formDiff * 0.05) * formWeight +
    (normAwayProb - attackDefense.matchupScore * 0.1) * attackDefenseWeight +
    normAwayProb * marketWeight +
    (normAwayProb + awayMomentum - homeMomentum) * momentumWeight
  ));

  const compositeDraw = Math.max(0.05, 1 - compositeHomeWin - compositeAwayWin);

  // Step 7: Monte Carlo validation
  const mcResult = monteCarloSimulation(compositeHomeWin, compositeDraw, compositeAwayWin, 5000);

  // Final probabilities (blend composite with MC)
  const finalHomeWin = (compositeHomeWin * 0.7 + mcResult.homeWinRate * 0.3);
  const finalDraw = (compositeDraw * 0.7 + mcResult.drawRate * 0.3);
  const finalAwayWin = (compositeAwayWin * 0.7 + mcResult.awayWinRate * 0.3);

  // Normalize
  const total = finalHomeWin + finalDraw + finalAwayWin;
  const homeWinProb = finalHomeWin / total;
  const drawProb = finalDraw / total;
  const awayWinProb = finalAwayWin / total;

  // Step 8: Value edge calculation
  const homeValueEdge = homeWinProb - normHomeProb;
  const drawValueEdge = drawProb - normDrawProb;
  const awayValueEdge = awayWinProb - normAwayProb;

  // Over/Under analysis
  const expectedGoals = attackDefense.expectedGoals.home + attackDefense.expectedGoals.away;
  const overProb = expectedGoals > (match.overUnderLine || 2.5) ? 0.55 : 0.45;
  const underProb = 1 - overProb;
  const overValueEdge = match.overOdds ? overProb - (1 / match.overOdds) : 0;
  const underValueEdge = match.underOdds ? underProb - (1 / match.underOdds) : 0;

  // Step 9: Determine recommendation
  const allEdges = [
    { type: "home" as const, edge: homeValueEdge, prob: homeWinProb, odds: match.homeOdds },
    { type: "away" as const, edge: awayValueEdge, prob: awayWinProb, odds: match.awayOdds },
    { type: "draw" as const, edge: drawValueEdge, prob: drawProb, odds: match.drawOdds || 3.0 },
    { type: "over" as const, edge: overValueEdge, prob: overProb, odds: match.overOdds || 1.9 },
    { type: "under" as const, edge: underValueEdge, prob: underProb, odds: match.underOdds || 1.9 },
  ];

  const bestValue = allEdges.sort((a, b) => b.edge - a.edge)[0];
  const recommended = bestValue.edge > 0 ? bestValue.type : allEdges.sort((a, b) => b.prob - a.prob)[0].type;

  // Step 10: Kelly criterion
  const recOdds = recommended === "home" ? match.homeOdds
    : recommended === "away" ? match.awayOdds
    : recommended === "draw" ? (match.drawOdds || 3.0)
    : recommended === "over" ? (match.overOdds || 1.9)
    : (match.underOdds || 1.9);

  const recProb = recommended === "home" ? homeWinProb
    : recommended === "away" ? awayWinProb
    : recommended === "draw" ? drawProb
    : overProb;

  const kellyStake = Math.max(0, (recProb * recOdds - 1) / (recOdds - 1)) * bankroll * kellyFraction;

  // Step 11: Risk score
  const riskScore = Math.min(100, Math.max(0,
    50 + (1 - Math.max(homeWinProb, awayWinProb, drawProb)) * 50
    + (margin > 0.1 ? 10 : 0)
    + (marketSignal.strength > 0.5 ? 10 : 0)
    - (bestValue.edge > 0.05 ? 15 : 0)
  ));

  // Step 12: Confidence calculation
  const confidenceBreakdown: ConfidenceBreakdown = {
    statistical: Math.min(1, Math.max(homeWinProb, awayWinProb, drawProb) * 1.3),
    form: Math.min(1, (homeForm.consistency + awayForm.consistency) / 2 + Math.abs(formDiff) * 0.1),
    market: Math.min(1, 0.5 + bestValue.edge * 3 + marketSignal.strength * 0.3),
    historical: Math.min(1, (homeStats?.matchesPlayed || 0 + awayStats?.matchesPlayed || 0) > 20 ? 0.8 : 0.5),
    composite: 0,
  };
  confidenceBreakdown.composite = Math.min(1,
    confidenceBreakdown.statistical * 0.35 +
    confidenceBreakdown.form * 0.15 +
    confidenceBreakdown.market * 0.30 +
    confidenceBreakdown.historical * 0.20
  );

  // Step 13: Build factors
  const factors: PredictionFactors = {
    eloDiff: (homeElo - awayElo) / 400,
    formDiff,
    homeAdvantage: attackDefense.homeAdvantage,
    attackVsDefense: attackDefense.matchupScore,
    oddsValue: bestValue.edge,
    marketMovement: marketSignal.oddsMovement,
    headToHead: 0, // Would need H2H data
    momentumScore: homeMomentum - awayMomentum,
  };

  // Step 14: Generate analysis text
  const analysis = generateAnalysisText(
    match, homeWinProb, drawProb, awayWinProb, recommended, bestValue.edge,
    riskScore, homeForm, awayForm, attackDefense, marketSignal, factors
  );

  return {
    homeWinProb: Math.round(homeWinProb * 1000) / 1000,
    drawProb: Math.round(drawProb * 1000) / 1000,
    awayWinProb: Math.round(awayWinProb * 1000) / 1000,
    confidence: Math.round(confidenceBreakdown.composite * 100) / 100,
    recommended,
    analysis,
    valueEdge: Math.round(bestValue.edge * 1000) / 1000,
    riskScore: Math.round(riskScore),
    kellyStake: Math.round(kellyStake * 100) / 100,
    factors,
    marketSignal,
    confidenceBreakdown,
  };
}

// ==================== ANALYSIS TEXT GENERATION ====================

function generateAnalysisText(
  match: MatchData,
  homeWinProb: number,
  drawProb: number,
  awayWinProb: number,
  recommended: string,
  valueEdge: number,
  riskScore: number,
  homeForm: ReturnType<typeof analyzeForm>,
  awayForm: ReturnType<typeof analyzeForm>,
  attackDefense: ReturnType<typeof analyzeAttackVsDefense>,
  marketSignal: MarketSignal,
  factors: PredictionFactors
): string {
  const parts: string[] = [];

  // Probability summary
  const maxProb = Math.max(homeWinProb, drawProb, awayWinProb);
  const winner = homeWinProb === maxProb ? match.homeTeam : awayWinProb === maxProb ? match.awayTeam : "Draw";
  parts.push(`${winner} favored with ${(maxProb * 100).toFixed(1)}% probability.`);

  // Form analysis
  if (homeForm.trend !== "stable" || awayForm.trend !== "stable") {
    parts.push(`${match.homeTeam} form is ${homeForm.trend} (${homeForm.lastFive.length} games), ${match.awayTeam} form is ${awayForm.trend}.`);
  }

  // Attack vs Defense
  if (attackDefense.expectedGoals.home > 0 || attackDefense.expectedGoals.away > 0) {
    parts.push(`Expected goals: ${match.homeTeam} ${attackDefense.expectedGoals.home.toFixed(1)} - ${match.awayTeam} ${attackDefense.expectedGoals.away.toFixed(1)}.`);
  }

  // Value edge
  if (valueEdge > 0) {
    parts.push(`Positive value edge detected: +${(valueEdge * 100).toFixed(1)}% above market implied probability.`);
  } else {
    parts.push(`No significant value edge found. Market appears efficient.`);
  }

  // Market signal
  if (marketSignal.strength > 0.3) {
    parts.push(`Market signal: ${marketSignal.description}.`);
  }

  // Risk assessment
  if (riskScore > 70) {
    parts.push(`High risk match (${riskScore}/100). Consider smaller stakes or skip.`);
  } else if (riskScore < 40) {
    parts.push(`Low risk assessment (${riskScore}/100). Strong confidence in prediction.`);
  }

  return parts.join(" ");
}

// ==================== CASHOUT DECISION ENGINE ====================

export function shouldCashout(
  bet: {
    selection: string;
    odds: number;
    stake: number;
    potentialWin: number;
    status: string;
    partialCashoutAmount?: number | null;
    partialCashoutPercent?: number | null;
  },
  liveMatch: {
    homeScore: number;
    awayScore: number;
    minute: number;
    homeTeam: string;
    awayTeam: string;
    sport: string;
    status: string;
  },
  settings?: {
    autoCashoutEnabled: boolean;
    cashoutThreshold: number;
    waitFullSettlement: boolean;
    partialCashoutEnabled: boolean;
    partialCashoutPercent: number;
  }
): CashoutRecommendation {
  const {
    autoCashoutEnabled = true,
    cashoutThreshold = 0.7,
    waitFullSettlement = true,
    partialCashoutEnabled = true,
    partialCashoutPercent = 0.5,
  } = settings || {};

  // Determine if the bet is currently winning
  const isWinning = isBetWinning(bet, liveMatch);
  const isLosing = !isWinning && liveMatch.status === "live";

  // Calculate live win probability based on score and time
  const liveWinProb = calculateLiveWinProbability(bet, liveMatch);

  // Calculate cashout value
  const cashoutAmount = calculateCashoutValue(bet, liveMatch, isWinning);

  // Time decay factor (urgency increases as match progresses)
  const totalMinutes = getTotalMatchMinutes(liveMatch.sport);
  const timeDecay = liveMatch.minute / totalMinutes;
  const timeRemaining = 1 - timeDecay;

  // Calculate risk of loss
  const riskOfLoss = isWinning ? (1 - liveWinProb) * timeDecay : 1 - liveWinProb;

  // Build AI decision
  const aiDecision = buildCashoutDecision(
    bet, liveMatch, isWinning, liveWinProb, cashoutAmount,
    riskOfLoss, timeDecay, waitFullSettlement, partialCashoutEnabled, partialCashoutPercent
  );

  // Determine urgency
  let urgency: "low" | "medium" | "high" | "critical" = "low";
  if (isWinning && riskOfLoss > 0.4) urgency = "high";
  else if (isWinning && riskOfLoss > 0.2) urgency = "medium";
  else if (isLosing && liveWinProb < 0.15) urgency = "critical";
  else if (isLosing && liveWinProb < 0.3) urgency = "high";

  // Determine wait or cashout
  let waitOrCashout: CashoutRecommendation["waitOrCashout"] = "wait";
  if (isWinning && liveMatch.status === "finished") {
    waitOrCashout = "wait_for_settlement";
  } else if (isWinning && !waitFullSettlement && cashoutAmount >= bet.potentialWin * cashoutThreshold) {
    waitOrCashout = "cashout_full";
  } else if (isWinning && partialCashoutEnabled && cashoutAmount >= bet.potentialWin * cashoutThreshold * 0.5) {
    waitOrCashout = "cashout_partial";
  } else if (isLosing && liveWinProb < 0.2 && timeDecay > 0.6) {
    waitOrCashout = "cashout_full";
  } else if (isWinning && waitFullSettlement) {
    waitOrCashout = "wait_for_settlement";
  }

  // Should we cash out?
  const shouldCashout = waitOrCashout === "cashout_full" || waitOrCashout === "cashout_partial";

  // Partial cashout calculation
  const partialCashoutAmount = partialCashoutEnabled && isWinning
    ? Math.round(cashoutAmount * partialCashoutPercent * 100) / 100
    : 0;

  // Build reasoning
  const reasoning = buildCashoutReasoning(
    bet, liveMatch, isWinning, liveWinProb, cashoutAmount,
    riskOfLoss, timeDecay, waitOrCashout, aiDecision
  );

  return {
    shouldCashout,
    cashoutAmount: Math.round(cashoutAmount * 100) / 100,
    partialCashoutAmount,
    reasoning,
    urgency,
    waitOrCashout,
    settlementProbability: liveWinProb,
    liveWinProbability: liveWinProb,
    riskOfLoss: Math.round(riskOfLoss * 100) / 100,
    timeDecay: Math.round(timeDecay * 100) / 100,
    marketPressure: isWinning ? "favorable" : "adverse",
    aiDecision,
  };
}

function isBetWinning(
  bet: { selection: string },
  liveMatch: { homeScore: number; awayScore: number; homeTeam: string; awayTeam: string }
): boolean {
  const sel = bet.selection.toLowerCase();
  const homeWinning = liveMatch.homeScore > liveMatch.awayScore;
  const awayWinning = liveMatch.awayScore > liveMatch.homeScore;
  const drawing = liveMatch.homeScore === liveMatch.awayScore;

  if (sel === liveMatch.homeTeam.toLowerCase() || sel === "home") return homeWinning;
  if (sel === liveMatch.awayTeam.toLowerCase() || sel === "away") return awayWinning;
  if (sel === "draw") return drawing;
  if (sel.includes("over")) return (liveMatch.homeScore + liveMatch.awayScore) > 2.5;
  if (sel.includes("under")) return (liveMatch.homeScore + liveMatch.awayScore) < 2.5;
  return false;
}

function calculateLiveWinProbability(
  bet: { selection: string; odds: number; stake: number; potentialWin: number },
  liveMatch: { homeScore: number; awayScore: number; minute: number; sport: string; status: string }
): number {
  if (liveMatch.status === "finished") {
    return isBetWinning(bet, liveMatch) ? 1.0 : 0.0;
  }

  if (liveMatch.status !== "live") {
    return 1 / bet.odds; // Pre-match probability
  }

  const isWin = isBetWinning(bet, liveMatch);
  const totalMinutes = getTotalMatchMinutes(liveMatch.sport);
  const timeRemaining = Math.max(0, (totalMinutes - liveMatch.minute) / totalMinutes);

  // Base probability
  let baseProb = isWin ? 0.7 : 0.15;

  // Adjust for time remaining
  if (isWin) {
    baseProb = 0.3 + 0.7 * (1 - timeRemaining); // More time = more certainty
  } else {
    baseProb = 0.3 * timeRemaining; // Less time remaining = less chance of comeback
  }

  // Adjust for goal difference
  const goalDiff = Math.abs(liveMatch.homeScore - liveMatch.awayScore);
  if (isWin && goalDiff >= 2) baseProb = Math.min(0.98, baseProb + 0.2);
  if (!isWin && goalDiff >= 2) baseProb = Math.max(0.02, baseProb - 0.15);

  return Math.min(0.99, Math.max(0.01, baseProb));
}

function calculateCashoutValue(
  bet: { odds: number; stake: number; potentialWin: number; partialCashoutAmount?: number | null },
  liveMatch: { homeScore: number; awayScore: number; minute: number; sport: string; status: string },
  isWinning: boolean
): number {
  if (liveMatch.status === "finished") {
    return isWinning ? bet.potentialWin : 0;
  }

  if (liveMatch.status !== "live") {
    return bet.stake * 0.95; // Pre-match cashout (slight loss)
  }

  const totalMinutes = getTotalMatchMinutes(liveMatch.sport);
  const timeElapsed = liveMatch.minute / totalMinutes;
  const bookmakerMargin = config.ai.cashoutBookmakerMargin;

  if (isWinning) {
    // Winning bet: cashout value increases as match progresses
    const goalDiff = Math.abs(liveMatch.homeScore - liveMatch.awayScore);
    const safetyBonus = goalDiff >= 2 ? 0.15 : goalDiff >= 1 ? 0.05 : 0;
    const cashoutValue = bet.potentialWin * (0.3 + timeElapsed * 0.5 + safetyBonus) * bookmakerMargin;
    return Math.max(bet.stake, cashoutValue);
  } else {
    // Losing bet: cashout value decreases rapidly
    const losingRatio = config.ai.cashoutLosingStakeRatio;
    return bet.stake * losingRatio * (1 - timeElapsed * 0.5);
  }
}

function getTotalMatchMinutes(sport: string): number {
  switch (sport) {
    case "football":
    case "soccer":
      return 90;
    case "basketball":
      return 48;
    case "tennis":
      return 120; // Approximate
    case "hockey":
      return 60;
    default:
      return 90;
  }
}

function buildCashoutDecision(
  bet: { selection: string; odds: number; stake: number; potentialWin: number },
  liveMatch: { homeScore: number; awayScore: number; minute: number; homeTeam: string; awayTeam: string; sport: string; status: string },
  isWinning: boolean,
  liveWinProb: number,
  cashoutAmount: number,
  riskOfLoss: number,
  timeDecay: number,
  waitFullSettlement: boolean,
  partialCashoutEnabled: boolean,
  partialCashoutPercent: number
): AIDecision {
  const reasoning: string[] = [];
  let action: AIDecision["action"] = "hold";
  let confidence = 0.5;

  const currentScore = `${liveMatch.homeScore}-${liveMatch.awayScore}`;
  const totalMinutes = getTotalMatchMinutes(liveMatch.sport);
  const timeRemaining = `${Math.max(0, totalMinutes - liveMatch.minute)} min`;

  if (liveMatch.status === "finished") {
    action = "wait_for_settlement";
    confidence = isWinning ? 0.99 : 0.01;
    reasoning.push(`Match is finished. ${isWinning ? "Bet won - waiting for settlement." : "Bet lost."}`);
  } else if (isWinning) {
    if (liveWinProb > 0.85 && timeDecay > 0.7) {
      action = waitFullSettlement ? "wait_for_settlement" : "cashout_full";
      confidence = 0.85;
      reasoning.push(`Strong winning position (${currentScore}) with ${timeRemaining} remaining. ${waitFullSettlement ? "Waiting for full settlement for maximum payout." : "Cashing out for guaranteed profit."}`);
    } else if (liveWinProb > 0.6 && partialCashoutEnabled && riskOfLoss > 0.2) {
      action = "cashout_partial";
      confidence = 0.7;
      reasoning.push(`Winning but risk of loss is ${(riskOfLoss * 100).toFixed(0)}%. Partial cashout of ${Math.round(partialCashoutPercent * 100)}% secures profit while keeping position.`);
    } else if (liveWinProb > 0.7) {
      action = "hold";
      confidence = 0.75;
      reasoning.push(`Comfortable lead (${currentScore}) with ${timeRemaining} remaining. Holding for better value.`);
    } else {
      action = "hold";
      confidence = 0.6;
      reasoning.push(`Narrow lead (${currentScore}). Monitoring closely for cashout opportunity.`);
    }
  } else {
    // Losing position
    if (liveWinProb < 0.15 && timeDecay > 0.6) {
      action = "cashout_full";
      confidence = 0.8;
      reasoning.push(`Losing position (${currentScore}) with low comeback probability. Salvaging remaining value.`);
    } else if (liveWinProb < 0.3 && timeDecay > 0.5) {
      action = partialCashoutEnabled ? "cashout_partial" : "cashout_full";
      confidence = 0.65;
      reasoning.push(`Losing position (${currentScore}) but some chance remains. ${partialCashoutEnabled ? "Partial cashout to reduce exposure." : "Cashing out to minimize loss."}`);
    } else {
      action = "hold";
      confidence = 0.5;
      reasoning.push(`Losing position (${currentScore}) but enough time remains for a turnaround. Holding.`);
    }
  }

  return {
    action,
    confidence,
    reasoning,
    factors: {
      currentScore,
      timeRemaining,
      liveWinProb: Math.round(liveWinProb * 100) / 100,
      cashoutValue: Math.round(cashoutAmount * 100) / 100,
      expectedValue: Math.round((liveWinProb * bet.potentialWin - (1 - liveWinProb) * bet.stake) * 100) / 100,
    },
  };
}

function buildCashoutReasoning(
  bet: { selection: string; odds: number; stake: number; potentialWin: number },
  liveMatch: { homeScore: number; awayScore: number; minute: number; homeTeam: string; awayTeam: string; sport: string; status: string },
  isWinning: boolean,
  liveWinProb: number,
  cashoutAmount: number,
  riskOfLoss: number,
  timeDecay: number,
  waitOrCashout: string,
  aiDecision: AIDecision
): string {
  const parts: string[] = [];

  parts.push(`Score: ${liveMatch.homeTeam} ${liveMatch.homeScore} - ${liveMatch.awayScore} ${liveMatch.awayTeam} (${liveMatch.minute}').`);
  parts.push(`Bet on ${bet.selection} is ${isWinning ? "WINNING" : "LOSING"}.`);
  parts.push(`Live win probability: ${(liveWinProb * 100).toFixed(1)}%.`);
  parts.push(`Cashout value: $${cashoutAmount.toFixed(2)} (potential: $${bet.potentialWin.toFixed(2)}).`);

  if (riskOfLoss > 0.3) {
    parts.push(`Risk of loss: ${(riskOfLoss * 100).toFixed(1)}% - ${riskOfLoss > 0.5 ? "HIGH" : "MODERATE"}.`);
  }

  parts.push(`AI decision: ${aiDecision.action.replace(/_/g, " ").toUpperCase()} (confidence: ${(aiDecision.confidence * 100).toFixed(0)}%).`);
  parts.push(aiDecision.reasoning.join(" "));

  return parts.join(" ");
}

// ==================== AUTO-BET DECISION ====================

export function shouldAutoBet(
  prediction: Prediction,
  settings: {
    minOddsThreshold: number;
    maxOddsThreshold: number;
    minAiConfidence: number;
    minEdgeThreshold: number;
    riskLevel: string;
    preferredSports: string;
  },
  sport: string
): AutoBetCheck {
  const { minOddsThreshold, maxOddsThreshold, minAiConfidence, minEdgeThreshold, riskLevel, preferredSports } = settings;

  // Check if sport is in preferred list
  // Support both category names (e.g. "football") and specific keys (e.g. "soccer_epl")
  // "football" matches "soccer_epl", "soccer_*", etc. "basketball" matches "basketball_nba", etc.
  const sportList = preferredSports.split(",").map((s) => s.trim().toLowerCase());
  const sportLower = sport.toLowerCase();
  const sportCategory = sportLower.split("_")[0]; // e.g. "soccer" from "soccer_epl"
  const sportMatches = sportList.some((s) => {
    if (s === sportLower) return true; // exact match
    if (s === "football" && (sportCategory === "soccer" || sportLower === "football")) return true;
    if (s === "soccer" && (sportCategory === "soccer" || sportLower === "football")) return true;
    if (s === sportCategory) return true; // category match (e.g. "basketball" matches "basketball_nba")
    return false;
  });
  if (!sportMatches) {
    return { shouldPlace: false, reason: `Sport ${sport} not in preferred list`, betType: "skip", suggestedStake: 0 };
  }

  // Check confidence
  if (prediction.confidence < minAiConfidence) {
    return { shouldPlace: false, reason: `AI confidence ${prediction.confidence.toFixed(2)} below threshold ${minAiConfidence}`, betType: "skip", suggestedStake: 0 };
  }

  // Check value edge
  if (prediction.valueEdge < minEdgeThreshold) {
    return { shouldPlace: false, reason: `Value edge ${prediction.valueEdge.toFixed(3)} below minimum ${minEdgeThreshold}`, betType: "skip", suggestedStake: 0 };
  }

  // Check risk level
  const maxRisk = riskLevel === "low" ? 40 : riskLevel === "medium" ? 60 : 80;
  if (prediction.riskScore > maxRisk) {
    return { shouldPlace: false, reason: `Risk score ${prediction.riskScore} exceeds ${riskLevel} threshold ${maxRisk}`, betType: "skip", suggestedStake: 0 };
  }

  // Determine bet type
  const betType: AutoBetCheck["betType"] = prediction.confidence > 0.7 ? "single" : "accumulator_leg";

  // Calculate suggested stake
  const suggestedStake = Math.max(5, prediction.kellyStake);

  return {
    shouldPlace: true,
    reason: `Strong value: edge=${(prediction.valueEdge * 100).toFixed(1)}%, confidence=${(prediction.confidence * 100).toFixed(0)}%, risk=${prediction.riskScore}/100`,
    betType,
    suggestedStake,
  };
}

// ==================== RISK LIMITS CHECK ====================

export function checkRiskLimits(
  dailyPnl: number,
  weeklyPnl: number,
  limits: {
    stopLossDaily: number;
    stopLossWeekly: number;
    profitTargetDaily: number;
    profitTargetWeekly: number;
  }
): RiskCheckResult {
  // Daily stop-loss
  if (dailyPnl <= -limits.stopLossDaily) {
    return {
      canBet: false,
      reason: `Daily stop-loss hit: $${dailyPnl.toFixed(2)} loss exceeds $${limits.stopLossDaily.toFixed(2)} limit`,
      riskLevel: "danger",
    };
  }

  // Weekly stop-loss
  if (weeklyPnl <= -limits.stopLossWeekly) {
    return {
      canBet: false,
      reason: `Weekly stop-loss hit: $${weeklyPnl.toFixed(2)} loss exceeds $${limits.stopLossWeekly.toFixed(2)} limit`,
      riskLevel: "danger",
    };
  }

  // Daily profit target
  if (dailyPnl >= limits.profitTargetDaily) {
    return {
      canBet: false,
      reason: `Daily profit target reached: $${dailyPnl.toFixed(2)} exceeds $${limits.profitTargetDaily.toFixed(2)} target`,
      riskLevel: "safe",
    };
  }

  // Weekly profit target
  if (weeklyPnl >= limits.profitTargetWeekly) {
    return {
      canBet: false,
      reason: `Weekly profit target reached: $${weeklyPnl.toFixed(2)} exceeds $${limits.profitTargetWeekly.toFixed(2)} target`,
      riskLevel: "safe",
    };
  }

  // Caution zone
  if (dailyPnl <= -limits.stopLossDaily * 0.7 || weeklyPnl <= -limits.stopLossWeekly * 0.7) {
    return {
      canBet: true,
      reason: `Approaching stop-loss limit. Consider reducing stake sizes.`,
      riskLevel: "caution",
    };
  }

  return { canBet: true, reason: "Within risk limits", riskLevel: "safe" };
}

// ==================== BET SCHEDULE CHECK ====================

/**
 * Check if the current time is within the bet schedule.
 * Uses the user's IANA timezone to determine the current local hour.
 * Falls back to the Node.js process local time if timezone is invalid.
 *
 * @param start - Schedule start time in HH:mm format (in user's local timezone)
 * @param end - Schedule end time in HH:mm format (in user's local timezone)
 * @param timezone - IANA timezone name (e.g. "Africa/Accra", "Europe/London", "Africa/Lagos")
 */
export function isWithinBetSchedule(start: string, end: string, timezone?: string): boolean {
  // Get current time in user's timezone
  let currentMinutes: number;
  try {
    const now = new Date();
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    // Format current time in user's timezone: "HH:mm"
    const localTime = now.toLocaleString("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const [h, m] = localTime.split(":").map(Number);
    currentMinutes = h * 60 + m;
  } catch {
    // Fallback to Node.js process local time
    const now = new Date();
    currentMinutes = now.getHours() * 60 + now.getMinutes();
  }

  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Overnight schedule (e.g., 22:00 - 06:00)
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

// ==================== DETAILED ANALYSIS ====================

export function generateDetailedAnalysis(
  match: MatchData,
  homeStats?: TeamStatsData | null,
  awayStats?: TeamStatsData | null,
  prediction?: Prediction
): DetailedAnalysis {
  const homeForm = analyzeForm(homeStats?.form || null);
  const awayForm = analyzeForm(awayStats?.form || null);

  const matchOverview = `${match.homeTeam} vs ${match.awayTeam} in ${match.league} (${match.sport}). ` +
    `Odds: ${match.homeTeam} ${match.homeOdds} | Draw ${match.drawOdds || "N/A"} | ${match.awayTeam} ${match.awayOdds}.`;

  const homeTeamAnalysis = homeStats
    ? `${match.homeTeam}: ${homeStats.wins}W-${homeStats.draws}D-${homeStats.losses}L in ${homeStats.matchesPlayed} matches. ` +
      `Attack: ${homeStats.attackRating.toFixed(1)}/100, Defense: ${homeStats.defenseRating.toFixed(1)}/100. ` +
      `Form: ${homeStats.form || "N/A"} (${homeForm.trend}). ` +
      `Elo: ${homeStats.eloRating}. xG: ${homeStats.xgFor || "N/A"}.`
    : `No statistical data available for ${match.homeTeam}.`;

  const awayTeamAnalysis = awayStats
    ? `${match.awayTeam}: ${awayStats.wins}W-${awayStats.draws}D-${awayStats.losses}L in ${awayStats.matchesPlayed} matches. ` +
      `Attack: ${awayStats.attackRating.toFixed(1)}/100, Defense: ${awayStats.defenseRating.toFixed(1)}/100. ` +
      `Form: ${awayStats.form || "N/A"} (${awayForm.trend}). ` +
      `Elo: ${awayStats.eloRating}. xG: ${awayStats.xgFor || "N/A"}.`
    : `No statistical data available for ${match.awayTeam}.`;

  const keyFactors: string[] = [];
  if (prediction) {
    if (prediction.factors.eloDiff > 0.3) keyFactors.push(`Elo advantage: ${match.homeTeam} significantly higher rated`);
    if (prediction.factors.eloDiff < -0.3) keyFactors.push(`Elo advantage: ${match.awayTeam} significantly higher rated`);
    if (prediction.factors.formDiff > 0.5) keyFactors.push(`Form advantage: ${match.homeTeam} in better form`);
    if (prediction.factors.formDiff < -0.5) keyFactors.push(`Form advantage: ${match.awayTeam} in better form`);
    if (prediction.valueEdge > 0.05) keyFactors.push(`Strong value edge: ${(prediction.valueEdge * 100).toFixed(1)}% above market`);
    if (prediction.marketSignal.strength > 0.3) keyFactors.push(`Market signal: ${prediction.marketSignal.description}`);
    if (prediction.riskScore > 70) keyFactors.push(`High risk: risk score ${prediction.riskScore}/100`);
    if (prediction.riskScore < 30) keyFactors.push(`Low risk: risk score ${prediction.riskScore}/100`);
  }

  return {
    matchOverview,
    homeTeamAnalysis,
    awayTeamAnalysis,
    headToHead: "Head-to-head analysis requires historical matchup data between these teams.",
    keyFactors,
    prediction: prediction
      ? `AI recommends: ${prediction.recommended} (confidence: ${(prediction.confidence * 100).toFixed(0)}%, value edge: ${(prediction.valueEdge * 100).toFixed(1)}%)`
      : "Run analysis first to get prediction.",
    riskAssessment: prediction
      ? `Risk score: ${prediction.riskScore}/100. ${prediction.riskScore > 70 ? "High risk - consider smaller stakes." : prediction.riskScore > 40 ? "Moderate risk - standard stakes recommended." : "Low risk - favorable conditions."}`
      : "Risk assessment pending analysis.",
    recommendedAction: prediction
      ? prediction.valueEdge > 0.05 && prediction.confidence > 0.6
        ? "PLACE BET - Strong value and confidence detected"
        : prediction.valueEdge > 0.02 && prediction.confidence > 0.5
          ? "CONSIDER BET - Moderate value, wait for better odds"
          : "SKIP BET - Insufficient value edge or confidence"
      : "Run analysis first.",
    marketInsight: prediction
      ? prediction.marketSignal.description
      : "Market analysis not yet available.",
    confidenceLevel: prediction
      ? prediction.confidenceBreakdown.composite > 0.7
        ? "HIGH"
        : prediction.confidenceBreakdown.composite > 0.5
          ? "MEDIUM"
          : "LOW"
      : "NOT CALCULATED",
  };
}
