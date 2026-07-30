// AI Engine for iBetPro - Statistical analysis and prediction engine
// Enhanced with accumulator support, smart cashout, and production features

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
}

interface CashoutRecommendation {
  shouldCashout: boolean;
  cashoutAmount: number;
  partialCashoutAmount: number;
  reasoning: string;
  urgency: "low" | "medium" | "high";
  waitOrCashout: "wait" | "cashout_partial" | "cashout_full" | "wait_for_settlement";
  settlementProbability: number;
}

interface DetailedAnalysis {
  keyFactors: string[];
  strengths: { team: string; points: string[] };
  weaknesses: { team: string; points: string[] };
  valueBet: { selection: string; reason: string; edge: number };
  riskAssessment: { level: "low" | "medium" | "high"; score: number; factors: string[] };
}

interface PoissonResult {
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  scoreProbabilities: Record<string, number>;
}

interface OverUnderResult {
  line: number;
  overProb: number;
  underProb: number;
  recommendation: "over" | "under";
  value: number;
}

interface AccumulatorAnalysis {
  totalOdds: number;
  combinedProbability: number;
  riskScore: number;
  recommendedStake: number;
  expectedValue: number;
  bonusPercent: number;
  legAnalyses: Prediction[];
  shouldPlace: boolean;
  reasoning: string;
}

// Parse form string like "WWWDW" into a score
function parseForm(form: string): number {
  if (!form) return 0.5;
  const chars = form.split("");
  let score = 0;
  let total = 0;
  for (const c of chars) {
    if (c === "W") score += 1;
    else if (c === "D") score += 0.5;
    total += 1;
  }
  return total > 0 ? score / total : 0.5;
}

// Parse record string like "12-1-1" into win rate
function parseRecord(record: string): number {
  if (!record) return 0.5;
  const parts = record.split("-").map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return 0.5;
  const [wins, draws, losses] = parts;
  const total = wins + draws + losses;
  return total > 0 ? (wins + draws * 0.5) / total : 0.5;
}

// Calculate Poisson-based probability for goals
function poissonProbability(lambda: number, k: number): number {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

// ==================== KELLY CRITERION ====================

/**
 * Calculate Kelly Criterion optimal stake
 * f* = (bp - q) / b
 * where b = odds-1, p = probability, q = 1-p
 */
export function calculateKellyStake(
  probability: number,
  odds: number,
  bankroll: number,
  fraction: number = 0.25 // quarter-Kelly by default
): { stake: number; fullKelly: number; fractionKelly: number; edge: number } {
  const b = odds - 1; // net odds
  const p = probability;
  const q = 1 - p;
  const fullKelly = (b * p - q) / b;
  const fractionKelly = fullKelly * fraction;
  const edge = p * odds - 1; // expected value per dollar

  // Cap at 10% of bankroll for safety
  const maxStake = bankroll * 0.10;
  const stake = Math.max(0, Math.min(fractionKelly * bankroll, maxStake));

  return {
    stake: Math.round(stake * 100) / 100,
    fullKelly: Math.round(fullKelly * 10000) / 10000,
    fractionKelly: Math.round(fractionKelly * 10000) / 10000,
    edge: Math.round(edge * 10000) / 10000,
  };
}

// ==================== ELO RATING SYSTEM ====================

/**
 * Calculate ELO-based win probability
 */
export function calculateEloProbability(
  homeElo: number,
  awayElo: number,
  homeAdvantage: number = 65 // typical home advantage in ELO points
): { homeWinProb: number; drawProb: number; awayWinProb: number } {
  const effectiveHomeElo = homeElo + homeAdvantage;
  const diff = effectiveHomeElo - awayElo;

  // Standard ELO expected score formula
  const homeExpected = 1 / (1 + Math.pow(10, -diff / 400));

  // Approximate draw probability (peaks when teams are equal)
  const drawProb = 0.25 * Math.exp(-Math.abs(diff) / 400);
  const homeWinProb = homeExpected * (1 - drawProb);
  const awayWinProb = (1 - homeExpected) * (1 - drawProb);

  // Normalize
  const total = homeWinProb + drawProb + awayWinProb;
  return {
    homeWinProb: Math.round((homeWinProb / total) * 100) / 100,
    drawProb: Math.round((drawProb / total) * 100) / 100,
    awayWinProb: Math.round((awayWinProb / total) * 100) / 100,
  };
}

// ==================== MAIN ANALYSIS ====================

export function analyzeMatch(
  match: MatchData,
  homeTeamStats?: TeamStatsData | null,
  awayTeamStats?: TeamStatsData | null,
  bankroll: number = 1000,
  kellyFraction: number = 0.25
): Prediction {
  let homeWinProb = 0.33;
  let drawProb = 0.33;
  let awayWinProb = 0.33;

  // Model 1: Bookmaker Odds Implied Probability
  const homeImplied = 1 / match.homeOdds;
  const awayImplied = 1 / match.awayOdds;
  const drawImplied = match.drawOdds ? 1 / match.drawOdds : 0.25;
  const totalImplied = homeImplied + drawImplied + awayImplied;
  const margin = 1 / totalImplied;

  homeWinProb = homeImplied * margin;
  drawProb = drawImplied * margin;
  awayWinProb = awayImplied * margin;

  // Model 2: Poisson Distribution (if team stats available)
  let poissonResult: PoissonResult | null = null;
  if (homeTeamStats && awayTeamStats) {
    poissonResult = calculatePoissonProbabilities(
      homeTeamStats.attackRating,
      awayTeamStats.attackRating,
      homeTeamStats.defenseRating,
      awayTeamStats.defenseRating
    );

    // Model 3: ELO Rating (if available)
    let eloResult = null;
    if (homeTeamStats.eloRating && awayTeamStats.eloRating) {
      eloResult = calculateEloProbability(homeTeamStats.eloRating, awayTeamStats.eloRating);
    }

    // Form factor (0-1)
    const homeForm = parseForm(homeTeamStats.form ?? "");
    const awayForm = parseForm(awayTeamStats.form ?? "");

    // Overall rating factor
    const ratingDiff = homeTeamStats.overallRating - awayTeamStats.overallRating;
    const ratingFactor = ratingDiff / 100;

    // Attack vs Defense
    const homeAttackVsAwayDefense = (homeTeamStats.attackRating - awayTeamStats.defenseRating) / 100;
    const awayAttackVsHomeDefense = (awayTeamStats.attackRating - homeTeamStats.defenseRating) / 100;

    // Home/away record
    const homeHomeRecord = parseRecord(homeTeamStats.homeRecord ?? "");
    const awayAwayRecord = parseRecord(awayTeamStats.awayRecord ?? "");

    // Win rate
    const homeWinRate = homeTeamStats.matchesPlayed > 0
      ? homeTeamStats.wins / homeTeamStats.matchesPlayed
      : 0.5;
    const awayWinRate = awayTeamStats.matchesPlayed > 0
      ? awayTeamStats.wins / awayTeamStats.matchesPlayed
      : 0.5;

    // Composite adjustments
    const homeAdvantage = 0.05;
    const formAdjust = (homeForm - awayForm) * 0.08;
    const ratingAdjust = ratingFactor * 0.15;
    const attackDefenseAdjust = (homeAttackVsAwayDefense - awayAttackVsHomeDefense) * 0.1;
    const recordAdjust = (homeHomeRecord - awayAwayRecord) * 0.06;
    const winRateAdjust = (homeWinRate - awayWinRate) * 0.05;

    const totalAdjust = homeAdvantage + formAdjust + ratingAdjust + attackDefenseAdjust + recordAdjust + winRateAdjust;

    // Apply adjustments
    homeWinProb += totalAdjust * 0.5;
    awayWinProb -= totalAdjust * 0.5;

    // Draw probability adjustment
    const closeness = 1 - Math.abs(homeWinProb - awayWinProb);
    drawProb = 0.2 + closeness * 0.15;

    // Model 4: Ensemble blending (weighted average)
    // Weights: Implied=40%, Poisson=30%, ELO=20%, Stats=10%
    const weights = { implied: 0.40, poisson: 0.30, elo: 0.20, stats: 0.10 };

    const statsHome = homeWinProb;
    const statsDraw = drawProb;
    const statsAway = awayWinProb;

    if (poissonResult && eloResult) {
      homeWinProb = (
        weights.implied * (homeImplied * margin) +
        weights.poisson * poissonResult.homeWinProb +
        weights.elo * eloResult.homeWinProb +
        weights.stats * statsHome
      );
      drawProb = (
        weights.implied * (drawImplied * margin) +
        weights.poisson * poissonResult.drawProb +
        weights.elo * eloResult.drawProb +
        weights.stats * statsDraw
      );
      awayWinProb = (
        weights.implied * (awayImplied * margin) +
        weights.poisson * poissonResult.awayWinProb +
        weights.elo * eloResult.awayWinProb +
        weights.stats * statsAway
      );
    } else if (poissonResult) {
      // Blend implied + poisson + stats
      homeWinProb = 0.45 * (homeImplied * margin) + 0.35 * poissonResult.homeWinProb + 0.20 * statsHome;
      drawProb = 0.45 * (drawImplied * margin) + 0.35 * poissonResult.drawProb + 0.20 * statsDraw;
      awayWinProb = 0.45 * (awayImplied * margin) + 0.35 * poissonResult.awayWinProb + 0.20 * statsAway;
    }
  }

  // Normalize probabilities
  const total = homeWinProb + drawProb + awayWinProb;
  homeWinProb /= total;
  drawProb /= total;
  awayWinProb /= total;

  // Clamp values
  homeWinProb = Math.max(0.05, Math.min(0.95, homeWinProb));
  drawProb = Math.max(0.05, Math.min(0.40, drawProb));
  awayWinProb = Math.max(0.05, Math.min(0.95, awayWinProb));

  // Re-normalize
  const finalTotal = homeWinProb + drawProb + awayWinProb;
  homeWinProb /= finalTotal;
  drawProb /= finalTotal;
  awayWinProb /= finalTotal;

  // Calculate confidence
  const maxProb = Math.max(homeWinProb, drawProb, awayWinProb);
  const confidence = Math.min(0.95, maxProb + 0.1);

  // Determine recommendation
  let recommended: Prediction["recommended"] = "home";
  const oddsValue = calculateOddsValue(maxProb, match.homeOdds);

  if (homeWinProb > awayWinProb && homeWinProb > drawProb) {
    recommended = "home";
  } else if (awayWinProb > homeWinProb && awayWinProb > drawProb) {
    recommended = "away";
  } else {
    recommended = "draw";
  }

  // Check for better value in over/under
  if (match.sport === "football" && homeTeamStats && awayTeamStats) {
    const avgHomeGoals = homeTeamStats.goalsFor / Math.max(1, homeTeamStats.matchesPlayed);
    const avgAwayGoals = awayTeamStats.goalsFor / Math.max(1, awayTeamStats.matchesPlayed);
    const expectedGoals = avgHomeGoals + avgAwayGoals;

    if (expectedGoals < 2.2 && match.drawOdds && match.drawOdds < 3.5) {
      if (calculateOddsValue(0.55, 2.1) > calculateOddsValue(maxProb, recommended === "home" ? match.homeOdds : match.awayOdds)) {
        recommended = "under";
      }
    }
  }

  // Calculate value edge
  const recOdds = recommended === "home" ? match.homeOdds : recommended === "away" ? match.awayOdds : match.drawOdds || 3.0;
  const recProb = recommended === "home" ? homeWinProb : recommended === "away" ? awayWinProb : drawProb;
  const valueEdge = recProb - (1 / recOdds);

  // Calculate risk score (0-100)
  let riskScore = 50;
  if (confidence < 0.5) riskScore += 20;
  if (confidence > 0.7) riskScore -= 20;
  if (Math.abs(homeWinProb - awayWinProb) < 0.1) riskScore += 15;
  if (match.homeOdds > 3.0 || match.awayOdds > 3.0) riskScore += 10;
  if (!homeTeamStats || !awayTeamStats) riskScore += 15;
  riskScore = Math.max(0, Math.min(100, riskScore));

  // Calculate Kelly stake
  const kelly = calculateKellyStake(recProb, recOdds, bankroll, kellyFraction);

  // Generate analysis text
  const analysis = generateBetReasoning(match, { homeWinProb, drawProb, awayWinProb, confidence, recommended, analysis: "", valueEdge, riskScore, kellyStake: kelly.stake }, homeTeamStats, awayTeamStats);

  return {
    homeWinProb: Math.round(homeWinProb * 100) / 100,
    drawProb: Math.round(drawProb * 100) / 100,
    awayWinProb: Math.round(awayWinProb * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    recommended,
    analysis,
    valueEdge: Math.round(valueEdge * 10000) / 10000,
    riskScore,
    kellyStake: kelly.stake,
  };
}

// ==================== SMART CASHOUT ENGINE ====================

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
  currentMatchState: {
    homeScore: number;
    awayScore: number;
    minute: number;
    homeTeam: string;
    awayTeam: string;
    sport: string;
    status: string;
  },
  settings?: {
    autoCashoutEnabled?: boolean;
    cashoutThreshold?: number;
    waitFullSettlement?: boolean;
    partialCashoutEnabled?: boolean;
    partialCashoutPercent?: number;
  }
): CashoutRecommendation {
  const { stake, potentialWin, odds } = bet;
  const { homeScore, awayScore, minute, sport, status } = currentMatchState;

  // If match is finished, wait for full settlement
  if (status === "finished") {
    return {
      shouldCashout: false,
      cashoutAmount: potentialWin,
      partialCashoutAmount: 0,
      reasoning: "Match has finished. Waiting for full settlement to collect maximum payout.",
      urgency: "low",
      waitOrCashout: "wait_for_settlement",
      settlementProbability: 1.0,
    };
  }

  // If match is upcoming, no cashout needed
  if (status === "upcoming") {
    return {
      shouldCashout: false,
      cashoutAmount: stake * 0.85, // slight loss due to margin
      partialCashoutAmount: 0,
      reasoning: "Match hasn't started yet. No cashout needed - hold your position.",
      urgency: "low",
      waitOrCashout: "wait",
      settlementProbability: 0,
    };
  }

  const isFootball = sport === "football";
  const isBasketball = sport === "basketball";
  const isTennis = sport === "tennis";
  const totalMinutes = isFootball ? 90 : isBasketball ? 48 : isTennis ? 180 : 90;
  const progress = minute / totalMinutes;

  // Determine if the bet is currently winning
  const selectionIsHome = bet.selection === currentMatchState.homeTeam;
  const selectionIsAway = bet.selection === currentMatchState.awayTeam;
  const currentLead = selectionIsHome
    ? homeScore - awayScore
    : selectionIsAway
    ? awayScore - homeScore
    : 0;

  let cashoutAmount = 0;
  let partialCashoutAmount = 0;
  let shouldCashout = false;
  let urgency: CashoutRecommendation["urgency"] = "low";
  let waitOrCashout: CashoutRecommendation["waitOrCashout"] = "wait";
  let settlementProbability = 0;

  // Calculate settlement probability based on match state
  if (currentLead > 0) {
    // Winning - calculate probability of winning at full time
    if (isFootball) {
      if (currentLead >= 2 && progress >= 0.6) settlementProbability = 0.92;
      else if (currentLead >= 2 && progress >= 0.4) settlementProbability = 0.80;
      else if (currentLead >= 1 && progress >= 0.75) settlementProbability = 0.78;
      else if (currentLead >= 1 && progress >= 0.5) settlementProbability = 0.55;
      else settlementProbability = 0.35;
    } else if (isBasketball) {
      if (currentLead >= 10 && progress >= 0.75) settlementProbability = 0.93;
      else if (currentLead >= 5 && progress >= 0.8) settlementProbability = 0.80;
      else settlementProbability = 0.45;
    } else {
      settlementProbability = 0.5 + currentLead * 0.1;
    }
  } else if (currentLead === 0) {
    settlementProbability = 0.25; // Draw situation
  } else {
    // Losing
    settlementProbability = Math.max(0.05, 0.15 + progress * 0.1);
  }

  const effectiveStake = bet.partialCashoutAmount ? stake - bet.partialCashoutAmount : stake;

  if (currentLead > 0) {
    // Bet is currently winning
    const remainingTime = 1 - progress;
    const riskFactor = remainingTime * 0.3;

    if (isFootball) {
      if (currentLead >= 2 && minute >= 60) {
        // Comfortable lead, late in game - WAIT for full settlement
        cashoutAmount = potentialWin * 0.88;
        shouldCashout = false;
        urgency = "low";
        waitOrCashout = settings?.waitFullSettlement ? "wait_for_settlement" : "wait";
      } else if (currentLead >= 1 && minute >= 75) {
        // One goal lead, very late - consider partial cashout
        cashoutAmount = potentialWin * 0.78;
        partialCashoutAmount = (effectiveStake + (potentialWin - effectiveStake) * 0.5) * (settings?.partialCashoutPercent || 0.5);
        shouldCashout = settings?.autoCashoutEnabled && (cashoutAmount / potentialWin) >= (settings?.cashoutThreshold || 0.7);
        urgency = "medium";
        waitOrCashout = shouldCashout ? "cashout_partial" : "wait";
      } else if (currentLead >= 1 && minute >= 60) {
        // One goal lead, late
        cashoutAmount = potentialWin * 0.55;
        partialCashoutAmount = (effectiveStake + (potentialWin - effectiveStake) * 0.3) * (settings?.partialCashoutPercent || 0.5);
        shouldCashout = false;
        urgency = "low";
        waitOrCashout = "wait";
      } else if (currentLead >= 1 && minute >= 45) {
        // One goal lead, second half
        cashoutAmount = potentialWin * 0.4;
        shouldCashout = false;
        urgency = "low";
        waitOrCashout = "wait";
      } else {
        // Early goal lead
        cashoutAmount = potentialWin * 0.25;
        shouldCashout = false;
        urgency = "low";
        waitOrCashout = "wait";
      }
    } else if (isBasketball) {
      if (currentLead >= 10 && minute >= 36) {
        cashoutAmount = potentialWin * 0.88;
        shouldCashout = false;
        urgency = "low";
        waitOrCashout = "wait_for_settlement";
      } else if (currentLead >= 5 && minute >= 40) {
        cashoutAmount = potentialWin * 0.72;
        shouldCashout = settings?.autoCashoutEnabled ?? true;
        urgency = "medium";
        waitOrCashout = shouldCashout ? "cashout_partial" : "wait";
      } else {
        cashoutAmount = potentialWin * 0.4;
        shouldCashout = false;
        urgency = "low";
        waitOrCashout = "wait";
      }
    } else {
      // Generic sport
      cashoutAmount = potentialWin * (0.3 + progress * 0.5);
      shouldCashout = progress > 0.8 && currentLead >= 2;
      urgency = shouldCashout ? "medium" : "low";
      waitOrCashout = shouldCashout ? "cashout_full" : "wait";
    }

    // Always ensure minimum cashout
    cashoutAmount = Math.max(cashoutAmount, effectiveStake * 1.1);
  } else if (currentLead === 0) {
    // Draw - bet is at risk
    cashoutAmount = effectiveStake * 0.5;
    partialCashoutAmount = 0;
    if (progress > 0.7) {
      shouldCashout = true;
      urgency = "high";
      waitOrCashout = "cashout_full";
    } else {
      shouldCashout = false;
      urgency = "medium";
      waitOrCashout = "wait";
    }
  } else {
    // Bet is losing
    cashoutAmount = effectiveStake * 0.15;
    partialCashoutAmount = 0;
    if (progress > 0.5) {
      shouldCashout = true;
      urgency = "high";
      waitOrCashout = "cashout_full";
    } else {
      shouldCashout = false;
      urgency = "medium";
      waitOrCashout = "wait";
    }
  }

  // Apply settings thresholds
  if (settings?.autoCashoutEnabled && settings.cashoutThreshold) {
    if (cashoutAmount / potentialWin >= settings.cashoutThreshold && currentLead > 0) {
      if (settings.waitFullSettlement && settlementProbability > 0.8) {
        // Wait for full settlement - AI is confident bet will win
        shouldCashout = false;
        waitOrCashout = "wait_for_settlement";
      } else if (settings.partialCashoutEnabled && partialCashoutAmount > 0) {
        shouldCashout = true;
        waitOrCashout = "cashout_partial";
      } else {
        shouldCashout = true;
        waitOrCashout = "cashout_full";
      }
    }
  }

  const reasoning = generateCashoutReasoning(
    bet, currentMatchState, shouldCashout, cashoutAmount, urgency,
    waitOrCashout, settlementProbability, partialCashoutAmount
  );

  return {
    shouldCashout,
    cashoutAmount: Math.round(cashoutAmount * 100) / 100,
    partialCashoutAmount: Math.round(partialCashoutAmount * 100) / 100,
    reasoning,
    urgency,
    waitOrCashout,
    settlementProbability: Math.round(settlementProbability * 100) / 100,
  };
}

// ==================== ACCUMULATOR ANALYSIS ====================

/**
 * Analyze an accumulator (parlay) bet with multiple legs
 */
export function analyzeAccumulator(
  legs: Array<{
    match: MatchData;
    homeTeamStats?: TeamStatsData | null;
    awayTeamStats?: TeamStatsData | null;
    recommended: "home" | "away" | "draw" | "over" | "under";
  }>,
  bankroll: number = 1000,
  kellyFraction: number = 0.25,
  bonusThresholds: Array<{ legs: number; bonus: number }> = []
): AccumulatorAnalysis {
  const legAnalyses: Prediction[] = [];
  let totalOdds = 1;

  for (const leg of legs) {
    const prediction = analyzeMatch(leg.match, leg.homeTeamStats, leg.awayTeamStats, bankroll, kellyFraction);
    legAnalyses.push(prediction);

    const recOdds = leg.recommended === "home" ? leg.match.homeOdds
      : leg.recommended === "away" ? leg.match.awayOdds
      : leg.match.drawOdds || 3.0;
    totalOdds *= recOdds;
  }

  // Combined probability (independent events)
  const combinedProbability = legAnalyses.reduce((prod, leg) => {
    const prob = leg.recommended === "home" ? leg.homeWinProb
      : leg.recommended === "away" ? leg.awayWinProb
      : leg.drawProb;
    return prod * prob;
  }, 1);

  // Risk score increases with more legs
  const avgRisk = legAnalyses.reduce((sum, leg) => sum + leg.riskScore, 0) / legAnalyses.length;
  const riskScore = Math.min(100, avgRisk + (legs.length - 1) * 10);

  // Calculate accumulator bonus
  let bonusPercent = 0;
  for (const threshold of bonusThresholds) {
    if (legs.length >= threshold.legs) {
      bonusPercent = threshold.bonus;
    }
  }

  // Expected value
  const expectedValue = combinedProbability * totalOdds * (1 + bonusPercent / 100) - 1;

  // Recommended stake (fractional Kelly, even more conservative for accumulators)
  const accaKellyFraction = kellyFraction * 0.5; // Half the normal Kelly for accumulators
  const recommendedStake = Math.max(0, Math.min(
    (expectedValue / (totalOdds - 1)) * accaKellyFraction * bankroll,
    bankroll * 0.05 // Max 5% of bankroll for accumulators
  ));

  // Should place if expected value is positive and risk is acceptable
  const shouldPlace = expectedValue > 0.05 && riskScore < 75 && legs.length <= 6;

  // Generate reasoning
  const reasoning = generateAccumulatorReasoning(legs, legAnalyses, totalOdds, combinedProbability, expectedValue, riskScore, bonusPercent);

  return {
    totalOdds: Math.round(totalOdds * 100) / 100,
    combinedProbability: Math.round(combinedProbability * 10000) / 10000,
    riskScore: Math.round(riskScore),
    recommendedStake: Math.round(recommendedStake * 100) / 100,
    expectedValue: Math.round(expectedValue * 10000) / 10000,
    bonusPercent,
    legAnalyses,
    shouldPlace,
    reasoning,
  };
}

// ==================== UTILITY FUNCTIONS ====================

export function calculateOddsValue(aiProb: number, bookmakerOdds: number): number {
  const impliedProb = 1 / bookmakerOdds;
  const value = aiProb - impliedProb;
  return Math.round(value * 100) / 100;
}

/**
 * Determine if a bet should be auto-placed based on user settings
 */
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
): { shouldPlace: boolean; reason: string } {
  // Check sport
  const preferredList = settings.preferredSports.split(",");
  if (!preferredList.includes(sport)) {
    return { shouldPlace: false, reason: `Sport ${sport} not in preferred sports list` };
  }

  // Check odds range
  const recOdds = prediction.recommended === "home" ? 0 : prediction.recommended === "away" ? 0 : 0; // We need the actual odds from the match
  if (prediction.recommended === "home" || prediction.recommended === "away" || prediction.recommended === "draw") {
    // Odds checks will be done at the API level where we have match data
  }

  // Check AI confidence
  if (prediction.confidence < settings.minAiConfidence) {
    return { shouldPlace: false, reason: `AI confidence ${Math.round(prediction.confidence * 100)}% below minimum ${Math.round(settings.minAiConfidence * 100)}%` };
  }

  // Check value edge
  if (prediction.valueEdge < settings.minEdgeThreshold) {
    return { shouldPlace: false, reason: `Value edge ${(prediction.valueEdge * 100).toFixed(1)}% below minimum ${(settings.minEdgeThreshold * 100).toFixed(1)}%` };
  }

  // Check risk level
  if (settings.riskLevel === "low" && prediction.riskScore > 40) {
    return { shouldPlace: false, reason: `Risk score ${prediction.riskScore} too high for low risk setting` };
  }
  if (settings.riskLevel === "medium" && prediction.riskScore > 65) {
    return { shouldPlace: false, reason: `Risk score ${prediction.riskScore} too high for medium risk setting` };
  }

  return { shouldPlace: true, reason: `All criteria met. Confidence: ${Math.round(prediction.confidence * 100)}%, Edge: ${(prediction.valueEdge * 100).toFixed(1)}%, Risk: ${prediction.riskScore}` };
}

/**
 * Check stop-loss and profit targets
 */
export function checkRiskLimits(
  dailyPnl: number,
  weeklyPnl: number,
  settings: {
    stopLossDaily: number;
    stopLossWeekly: number;
    profitTargetDaily: number;
    profitTargetWeekly: number;
  }
): { canBet: boolean; reason: string } {
  // Check daily stop-loss
  if (dailyPnl <= -settings.stopLossDaily) {
    return { canBet: false, reason: `Daily stop-loss reached: -$${Math.abs(dailyPnl).toFixed(2)} / -$${settings.stopLossDaily.toFixed(2)}` };
  }

  // Check weekly stop-loss
  if (weeklyPnl <= -settings.stopLossWeekly) {
    return { canBet: false, reason: `Weekly stop-loss reached: -$${Math.abs(weeklyPnl).toFixed(2)} / -$${settings.stopLossWeekly.toFixed(2)}` };
  }

  // Check daily profit target
  if (dailyPnl >= settings.profitTargetDaily) {
    return { canBet: false, reason: `Daily profit target reached: +$${dailyPnl.toFixed(2)} / $${settings.profitTargetDaily.toFixed(2)}` };
  }

  // Check weekly profit target
  if (weeklyPnl >= settings.profitTargetWeekly) {
    return { canBet: false, reason: `Weekly profit target reached: +$${weeklyPnl.toFixed(2)} / $${settings.profitTargetWeekly.toFixed(2)}` };
  }

  return { canBet: true, reason: "Within risk limits" };
}

/**
 * Check if current time is within the betting schedule
 */
export function isWithinBetSchedule(
  scheduleStart: string,
  scheduleEnd: string
): boolean {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = scheduleStart.split(":").map(Number);
  const [endH, endM] = scheduleEnd.split(":").map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Overnight schedule (e.g., 22:00 to 08:00)
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

// ==================== POISSON & OVER/UNDER ====================

export function calculatePoissonProbabilities(
  homeAttackRating: number,
  awayAttackRating: number,
  homeDefenseRating: number,
  awayDefenseRating: number
): PoissonResult {
  const avgGoals = 1.3;

  const homeAttackStrength = homeAttackRating / 70;
  const awayDefenseWeakness = (100 - awayDefenseRating) / 70;
  const expectedHomeGoals = avgGoals * homeAttackStrength * awayDefenseWeakness;

  const awayAttackStrength = awayAttackRating / 70;
  const homeDefenseWeakness = (100 - homeDefenseRating) / 70;
  const expectedAwayGoals = avgGoals * awayAttackStrength * homeDefenseWeakness;

  const maxGoals = 5;
  const scoreProbabilities: Record<string, number> = {};
  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;

  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const prob = poissonProbability(expectedHomeGoals, i) * poissonProbability(expectedAwayGoals, j);
      const key = `${i}-${j}`;
      scoreProbabilities[key] = Math.round(prob * 10000) / 10000;

      if (i > j) homeWinProb += prob;
      else if (i === j) drawProb += prob;
      else awayWinProb += prob;
    }
  }

  const total = homeWinProb + drawProb + awayWinProb;
  homeWinProb /= total;
  drawProb /= total;
  awayWinProb /= total;

  return {
    expectedHomeGoals: Math.round(expectedHomeGoals * 100) / 100,
    expectedAwayGoals: Math.round(expectedAwayGoals * 100) / 100,
    homeWinProb: Math.round(homeWinProb * 100) / 100,
    drawProb: Math.round(drawProb * 100) / 100,
    awayWinProb: Math.round(awayWinProb * 100) / 100,
    scoreProbabilities,
  };
}

export function calculateOverUnderProbabilities(
  expectedGoals: number,
  line: number
): OverUnderResult {
  let underProb = 0;
  const maxGoals = 8;

  for (let i = 0; i <= maxGoals; i++) {
    const prob = poissonProbability(expectedGoals, i);
    if (i < line) {
      underProb += prob;
    }
  }

  const overProb = 1 - underProb;
  const recommendation = overProb > underProb ? "over" : "under";
  const value = Math.abs(overProb - underProb);

  return {
    line,
    overProb: Math.round(overProb * 100) / 100,
    underProb: Math.round(underProb * 100) / 100,
    recommendation,
    value: Math.round(value * 100) / 100,
  };
}

// ==================== DETAILED ANALYSIS ====================

export function generateDetailedAnalysis(
  match: MatchData,
  homeStats: TeamStatsData | null,
  awayStats: TeamStatsData | null,
  prediction: Prediction
): DetailedAnalysis {
  const keyFactors: string[] = [];
  const homeStrengths: string[] = [];
  const homeWeaknesses: string[] = [];
  const awayStrengths: string[] = [];
  const awayWeaknesses: string[] = [];
  const riskFactors: string[] = [];

  if (homeStats && awayStats) {
    const ratingDiff = homeStats.overallRating - awayStats.overallRating;
    if (Math.abs(ratingDiff) > 10) {
      keyFactors.push(
        `${ratingDiff > 0 ? match.homeTeam : match.awayTeam} has a significant rating advantage (${Math.abs(ratingDiff)} points)`
      );
    }

    if (homeStats.form && awayStats.form) {
      const homeFormScore = parseForm(homeStats.form);
      const awayFormScore = parseForm(awayStats.form);
      if (Math.abs(homeFormScore - awayFormScore) > 0.3) {
        keyFactors.push(
          `${homeFormScore > awayFormScore ? match.homeTeam : match.awayTeam} is in significantly better form`
        );
      }
    }

    keyFactors.push(`${match.homeTeam} has home advantage`);

    if (homeStats.attackRating > awayStats.defenseRating + 10) {
      keyFactors.push(`${match.homeTeam}'s strong attack (${homeStats.attackRating}) vs ${match.awayTeam}'s weaker defense (${awayStats.defenseRating})`);
    }
    if (awayStats.attackRating > homeStats.defenseRating + 10) {
      keyFactors.push(`${match.awayTeam}'s strong attack (${awayStats.attackRating}) vs ${match.homeTeam}'s weaker defense (${homeStats.defenseRating})`);
    }

    if (homeStats.attackRating > 70) homeStrengths.push(`Strong attack (${homeStats.attackRating})`);
    if (homeStats.defenseRating > 70) homeStrengths.push(`Solid defense (${homeStats.defenseRating})`);
    if (homeStats.form && parseForm(homeStats.form) > 0.7) homeStrengths.push(`Excellent recent form (${homeStats.form})`);
    if (homeStats.homeRecord) {
      const homeRec = parseRecord(homeStats.homeRecord);
      if (homeRec > 0.6) homeStrengths.push(`Strong home record (${homeStats.homeRecord})`);
    }

    if (awayStats.attackRating > 70) awayStrengths.push(`Strong attack (${awayStats.attackRating})`);
    if (awayStats.defenseRating > 70) awayStrengths.push(`Solid defense (${awayStats.defenseRating})`);
    if (awayStats.form && parseForm(awayStats.form) > 0.7) awayStrengths.push(`Excellent recent form (${awayStats.form})`);
    if (awayStats.awayRecord) {
      const awayRec = parseRecord(awayStats.awayRecord);
      if (awayRec > 0.6) awayStrengths.push(`Strong away record (${awayStats.awayRecord})`);
    }

    if (homeStats.defenseRating < 50) homeWeaknesses.push(`Weak defense (${homeStats.defenseRating})`);
    if (homeStats.form && parseForm(homeStats.form) < 0.4) homeWeaknesses.push(`Poor recent form (${homeStats.form})`);
    if (homeStats.losses > homeStats.wins) homeWeaknesses.push(`More losses than wins this season`);

    if (awayStats.defenseRating < 50) awayWeaknesses.push(`Weak defense (${awayStats.defenseRating})`);
    if (awayStats.form && parseForm(awayStats.form) < 0.4) awayWeaknesses.push(`Poor recent form (${awayStats.form})`);
    if (awayStats.losses > awayStats.wins) awayWeaknesses.push(`More losses than wins this season`);
  } else {
    keyFactors.push("Limited team statistics available - analysis based on odds only");
    riskFactors.push("No team stats available for deep analysis");
  }

  const recTeam = prediction.recommended === "home" ? match.homeTeam
    : prediction.recommended === "away" ? match.awayTeam
    : prediction.recommended === "draw" ? "Draw"
    : prediction.recommended === "over" ? "Over 2.5"
    : "Under 2.5";
  const recOdds = prediction.recommended === "home" ? match.homeOdds
    : prediction.recommended === "away" ? match.awayOdds
    : match.drawOdds || 3.0;
  const recProb = prediction.recommended === "home" ? prediction.homeWinProb
    : prediction.recommended === "away" ? prediction.awayWinProb
    : prediction.drawProb;
  const edge = recProb - (1 / recOdds);

  let riskScore = 50;
  if (prediction.confidence < 0.5) riskScore += 20;
  if (prediction.confidence > 0.7) riskScore -= 20;
  if (Math.abs(prediction.homeWinProb - prediction.awayWinProb) < 0.1) riskScore += 15;
  if (match.homeOdds > 3.0 || match.awayOdds > 3.0) riskScore += 10;
  if (!homeStats || !awayStats) riskScore += 15;
  riskScore = Math.max(0, Math.min(100, riskScore));

  if (riskScore > 60) riskFactors.push("High uncertainty in prediction");
  if (Math.abs(prediction.homeWinProb - prediction.awayWinProb) < 0.1) riskFactors.push("Teams are closely matched");
  if (prediction.confidence < 0.5) riskFactors.push("Low AI confidence level");

  const riskLevel: "low" | "medium" | "high" =
    riskScore <= 35 ? "low" : riskScore <= 65 ? "medium" : "high";

  return {
    keyFactors: keyFactors.length > 0 ? keyFactors : ["Standard match analysis"],
    strengths: { team: match.homeTeam, points: homeStrengths.length > 0 ? homeStrengths : ["Average performance"] },
    weaknesses: { team: match.homeTeam, points: homeWeaknesses.length > 0 ? homeWeaknesses : ["No significant weaknesses"] },
    valueBet: {
      selection: recTeam,
      reason: edge > 0.05
        ? `AI detects ${Math.round(edge * 100)}% edge over bookmaker odds. ${recTeam} has ${Math.round(recProb * 100)}% probability vs ${Math.round((1 / recOdds) * 100)}% implied probability.`
        : `Marginal value on ${recTeam}. Proceed with caution.`,
      edge: Math.round(edge * 100) / 100,
    },
    riskAssessment: {
      level: riskLevel,
      score: riskScore,
      factors: riskFactors.length > 0 ? riskFactors : ["Standard risk level"],
    },
  };
}

// ==================== HELPER FUNCTIONS ====================

function generateBetReasoning(
  match: MatchData,
  prediction: Prediction,
  homeTeamStats?: TeamStatsData | null,
  awayTeamStats?: TeamStatsData | null
): string {
  const parts: string[] = [];

  if (homeTeamStats && awayTeamStats) {
    const homeForm = homeTeamStats.form || "N/A";
    const awayForm = awayTeamStats.form || "N/A";
    parts.push(`${match.homeTeam} form: ${homeForm}, ${match.awayTeam} form: ${awayForm}.`);

    if (homeTeamStats.overallRating > awayTeamStats.overallRating) {
      parts.push(`${match.homeTeam} have a higher overall rating (${homeTeamStats.overallRating} vs ${awayTeamStats.overallRating}).`);
    } else {
      parts.push(`${match.awayTeam} have a higher overall rating (${awayTeamStats.overallRating} vs ${homeTeamStats.overallRating}).`);
    }

    parts.push(`${match.homeTeam} attack (${homeTeamStats.attackRating}) vs ${match.awayTeam} defense (${awayTeamStats.defenseRating}).`);

    if (homeTeamStats.homeRecord) {
      parts.push(`${match.homeTeam} home record: ${homeTeamStats.homeRecord}.`);
    }
    if (awayTeamStats.awayRecord) {
      parts.push(`${match.awayTeam} away record: ${awayTeamStats.awayRecord}.`);
    }
  }

  const recTeam = prediction.recommended === "home" ? match.homeTeam : prediction.recommended === "away" ? match.awayTeam : "Draw";
  const confidencePct = Math.round(prediction.confidence * 100);
  parts.push(`AI recommends: ${recTeam} with ${confidencePct}% confidence.`);

  const value = prediction.valueEdge;
  if (value > 0.05) {
    parts.push(`Strong value detected (${Math.round(value * 100)}% edge over bookmaker).`);
  }

  if (prediction.kellyStake > 0) {
    parts.push(`Kelly Criterion suggests: $${prediction.kellyStake.toFixed(2)} stake.`);
  }

  return parts.join(" ");
}

function generateCashoutReasoning(
  bet: { selection: string; odds: number; stake: number; potentialWin: number; partialCashoutAmount?: number | null },
  match: { homeScore: number; awayScore: number; minute: number; homeTeam: string; awayTeam: string; sport: string; status: string },
  shouldCashout: boolean,
  cashoutAmount: number,
  urgency: string,
  waitOrCashout: string,
  settlementProbability: number,
  partialCashoutAmount: number
): string {
  const selectionIsHome = bet.selection === match.homeTeam;
  const currentLead = selectionIsHome
    ? match.homeScore - match.awayScore
    : match.awayScore - match.homeScore;

  if (waitOrCashout === "wait_for_settlement") {
    return `Your bet on ${bet.selection} is currently winning (${match.homeScore}-${match.awayScore} at ${match.minute}'). Settlement probability: ${Math.round(settlementProbability * 100)}%. AI recommends waiting for full match settlement to collect maximum payout of $${bet.potentialWin.toFixed(2)}.`;
  }

  if (shouldCashout) {
    if (waitOrCashout === "cashout_partial" && partialCashoutAmount > 0) {
      return `Your bet on ${bet.selection} is winning (${match.homeScore}-${match.awayScore} at ${match.minute}'). AI recommends partial cashout of $${partialCashoutAmount.toFixed(2)} to secure some profit while keeping the remaining stake active for full payout. ${urgency === "high" ? "ACT NOW - match state could change!" : "Moderate urgency."}`;
    }
    if (currentLead > 0) {
      return `Your bet on ${bet.selection} is currently winning (${match.homeScore}-${match.awayScore} at ${match.minute}'). Cashout recommended to secure profit of $${Math.round((cashoutAmount - bet.stake) * 100) / 100}. ${urgency === "high" ? "ACT NOW - match state could change!" : "Moderate urgency - consider cashing out soon."}`;
    } else if (currentLead === 0) {
      return `Match is drawn (${match.homeScore}-${match.awayScore} at ${match.minute}'). Cashout recommended to recover partial stake. High urgency - your bet is at risk.`;
    } else {
      return `${bet.selection} is currently losing (${match.homeScore}-${match.awayScore} at ${match.minute}'). Cashout to minimize losses. Recovery unlikely at this stage.`;
    }
  } else {
    if (currentLead > 0) {
      return `Your bet on ${bet.selection} is winning (${match.homeScore}-${match.awayScore} at ${match.minute}'). Settlement probability: ${Math.round(settlementProbability * 100)}%. AI recommends letting it ride for maximum profit of $${bet.potentialWin.toFixed(2)}.`;
    }
    return `Match is level at ${match.homeScore}-${match.awayScore}. Hold your position - there's still time for the match to turn in your favor.`;
  }
}

function generateAccumulatorReasoning(
  legs: Array<{ match: MatchData; recommended: string }>,
  legAnalyses: Prediction[],
  totalOdds: number,
  combinedProbability: number,
  expectedValue: number,
  riskScore: number,
  bonusPercent: number
): string {
  const parts: string[] = [];

  parts.push(`${legs.length}-leg accumulator with total odds of ${totalOdds.toFixed(2)}.`);
  parts.push(`Combined probability: ${Math.round(combinedProbability * 100)}%.`);
  parts.push(`Expected value: ${(expectedValue * 100).toFixed(1)}%.`);
  parts.push(`Risk score: ${riskScore}/100.`);

  if (bonusPercent > 0) {
    parts.push(`Accumulator bonus: ${bonusPercent}% applied.`);
  }

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const analysis = legAnalyses[i];
    const recTeam = leg.recommended === "home" ? leg.match.homeTeam
      : leg.recommended === "away" ? leg.match.awayTeam
      : leg.recommended === "draw" ? "Draw" : leg.recommended;
    parts.push(`Leg ${i + 1}: ${leg.match.homeTeam} vs ${leg.match.awayTeam} - ${recTeam} (${Math.round(analysis.confidence * 100)}% confidence).`);
  }

  if (riskScore > 65) {
    parts.push("Warning: High risk accumulator. Consider reducing stake or number of legs.");
  }

  return parts.join(" ");
}
