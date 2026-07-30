// AI Engine for iBetPro - Statistical analysis and prediction engine

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
}

interface MatchData {
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  homeOdds: number;
  drawOdds?: number;
  awayOdds: number;
  homeScore?: number;
  awayScore?: number;
  minute?: number;
  status: string;
}

interface Prediction {
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  confidence: number;
  recommended: "home" | "away" | "draw" | "over" | "under";
  analysis: string;
}

interface CashoutRecommendation {
  shouldCashout: boolean;
  cashoutAmount: number;
  reasoning: string;
  urgency: "low" | "medium" | "high";
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

export function analyzeMatch(
  match: MatchData,
  homeTeamStats?: TeamStatsData | null,
  awayTeamStats?: TeamStatsData | null
): Prediction {
  let homeWinProb = 0.33;
  let drawProb = 0.33;
  let awayWinProb = 0.33;

  // Base probability from bookmaker odds (implied probability)
  const homeImplied = 1 / match.homeOdds;
  const awayImplied = 1 / match.awayOdds;
  const drawImplied = match.drawOdds ? 1 / match.drawOdds : 0.25;
  const totalImplied = homeImplied + drawImplied + awayImplied;
  const margin = 1 / totalImplied;

  homeWinProb = homeImplied * margin;
  drawProb = drawImplied * margin;
  awayWinProb = awayImplied * margin;

  // Adjust based on team stats if available
  if (homeTeamStats && awayTeamStats) {
    // Form factor (0-1)
    const homeForm = parseForm(homeTeamStats.form ?? "");
    const awayForm = parseForm(awayTeamStats.form ?? "");

    // Overall rating factor
    const ratingDiff = homeTeamStats.overallRating - awayTeamStats.overallRating;
    const ratingFactor = ratingDiff / 100; // Normalize to small range

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
    const homeAdvantage = 0.05; // Home advantage baseline
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
      // Low scoring game, under might be better value
      if (calculateOddsValue(0.55, 2.1) > calculateOddsValue(maxProb, recommended === "home" ? match.homeOdds : match.awayOdds)) {
        recommended = "under";
      }
    }
  }

  // Generate analysis text
  const analysis = generateBetReasoning(match, { homeWinProb, drawProb, awayWinProb, confidence, recommended, analysis: "" }, homeTeamStats, awayTeamStats);

  return {
    homeWinProb: Math.round(homeWinProb * 100) / 100,
    drawProb: Math.round(drawProb * 100) / 100,
    awayWinProb: Math.round(awayWinProb * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    recommended,
    analysis,
  };
}

export function shouldCashout(
  bet: {
    selection: string;
    odds: number;
    stake: number;
    potentialWin: number;
    status: string;
  },
  currentMatchState: {
    homeScore: number;
    awayScore: number;
    minute: number;
    homeTeam: string;
    awayTeam: string;
    sport: string;
  }
): CashoutRecommendation {
  const { stake, potentialWin, odds } = bet;
  const { homeScore, awayScore, minute, sport } = currentMatchState;

  // Calculate current cashout amount based on match state
  const isFootball = sport === "football";
  const isBasketball = sport === "basketball";
  const totalMinutes = isFootball ? 90 : isBasketball ? 48 : 180;
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
  let shouldCashout = false;
  let urgency: CashoutRecommendation["urgency"] = "low";

  if (currentLead > 0) {
    // Bet is currently winning
    const remainingTime = 1 - progress;
    const riskFactor = remainingTime * 0.3; // Risk increases with more time remaining

    if (isFootball) {
      // Football cashout logic
      if (currentLead >= 2 && minute >= 60) {
        // Comfortable lead, late in game
        cashoutAmount = potentialWin * 0.85;
        shouldCashout = true;
        urgency = "low";
      } else if (currentLead >= 1 && minute >= 75) {
        // One goal lead, very late
        cashoutAmount = potentialWin * 0.75;
        shouldCashout = true;
        urgency = "medium";
      } else if (currentLead >= 1 && minute >= 60) {
        // One goal lead, late
        cashoutAmount = potentialWin * 0.55;
        shouldCashout = minute >= 70;
        urgency = "medium";
      } else if (currentLead >= 1 && minute >= 45) {
        // One goal lead, second half
        cashoutAmount = potentialWin * 0.4;
        shouldCashout = false;
        urgency = "low";
      }
    } else if (isBasketball) {
      // Basketball cashout logic
      if (currentLead >= 10 && minute >= 36) {
        cashoutAmount = potentialWin * 0.85;
        shouldCashout = true;
        urgency = "low";
      } else if (currentLead >= 5 && minute >= 40) {
        cashoutAmount = potentialWin * 0.7;
        shouldCashout = true;
        urgency = "medium";
      }
    }

    // Always ensure minimum cashout
    cashoutAmount = Math.max(cashoutAmount, stake * 1.1);
  } else if (currentLead === 0) {
    // Draw - bet is at risk
    cashoutAmount = stake * 0.5;
    if (progress > 0.7) {
      shouldCashout = true;
      urgency = "high";
    }
  } else {
    // Bet is losing
    cashoutAmount = stake * 0.15;
    if (progress > 0.5) {
      shouldCashout = true;
      urgency = "high";
    }
  }

  const reasoning = generateCashoutReasoning(bet, currentMatchState, shouldCashout, cashoutAmount, urgency);

  return {
    shouldCashout,
    cashoutAmount: Math.round(cashoutAmount * 100) / 100,
    reasoning,
    urgency,
  };
}

export function calculateOddsValue(aiProb: number, bookmakerOdds: number): number {
  const impliedProb = 1 / bookmakerOdds;
  const value = aiProb - impliedProb;
  return Math.round(value * 100) / 100;
}

function generateBetReasoning(
  match: MatchData,
  prediction: Prediction,
  homeTeamStats?: TeamStatsData | null,
  awayTeamStats?: TeamStatsData | null
): string {
  const parts: string[] = [];

  if (homeTeamStats && awayTeamStats) {
    // Form analysis
    const homeForm = homeTeamStats.form || "N/A";
    const awayForm = awayTeamStats.form || "N/A";
    parts.push(`${match.homeTeam} form: ${homeForm}, ${match.awayTeam} form: ${awayForm}.`);

    // Rating comparison
    if (homeTeamStats.overallRating > awayTeamStats.overallRating) {
      parts.push(`${match.homeTeam} have a higher overall rating (${homeTeamStats.overallRating} vs ${awayTeamStats.overallRating}).`);
    } else {
      parts.push(`${match.awayTeam} have a higher overall rating (${awayTeamStats.overallRating} vs ${homeTeamStats.overallRating}).`);
    }

    // Attack vs defense
    parts.push(`${match.homeTeam} attack (${homeTeamStats.attackRating}) vs ${match.awayTeam} defense (${awayTeamStats.defenseRating}).`);

    // Home/away record
    if (homeTeamStats.homeRecord) {
      parts.push(`${match.homeTeam} home record: ${homeTeamStats.homeRecord}.`);
    }
    if (awayTeamStats.awayRecord) {
      parts.push(`${match.awayTeam} away record: ${awayTeamStats.awayRecord}.`);
    }
  }

  // Recommendation
  const recTeam = prediction.recommended === "home" ? match.homeTeam : prediction.recommended === "away" ? match.awayTeam : "Draw";
  const confidencePct = Math.round(prediction.confidence * 100);
  parts.push(`AI recommends: ${recTeam} with ${confidencePct}% confidence.`);

  // Value check
  const recOdds = prediction.recommended === "home" ? match.homeOdds : match.awayOdds;
  const value = calculateOddsValue(prediction.recommended === "home" ? prediction.homeWinProb : prediction.awayWinProb, recOdds);
  if (value > 0.05) {
    parts.push(`Strong value detected (${Math.round(value * 100)}% edge over bookmaker).`);
  }

  return parts.join(" ");
}

function generateCashoutReasoning(
  bet: { selection: string; odds: number; stake: number; potentialWin: number },
  match: { homeScore: number; awayScore: number; minute: number; homeTeam: string; awayTeam: string; sport: string },
  shouldCashout: boolean,
  cashoutAmount: number,
  urgency: string
): string {
  const selectionIsHome = bet.selection === match.homeTeam;
  const currentLead = selectionIsHome
    ? match.homeScore - match.awayScore
    : match.awayScore - match.homeScore;

  if (shouldCashout) {
    if (currentLead > 0) {
      return `Your bet on ${bet.selection} is currently winning (${match.homeScore}-${match.awayScore} at ${match.minute}'). Cashout recommended to secure profit of $${Math.round((cashoutAmount - bet.stake) * 100) / 100}. ${urgency === "high" ? "ACT NOW - match state could change!" : "Moderate urgency - consider cashing out soon."}`;
    } else if (currentLead === 0) {
      return `Match is drawn (${match.homeScore}-${match.awayScore} at ${match.minute}'). Cashout recommended to recover partial stake. High urgency - your bet is at risk.`;
    } else {
      return `${bet.selection} is currently losing (${match.homeScore}-${match.awayScore} at ${match.minute}'). Cashout to minimize losses. Recovery unlikely at this stage.`;
    }
  } else {
    if (currentLead > 0) {
      return `Your bet on ${bet.selection} is winning (${match.homeScore}-${match.awayScore} at ${match.minute}'). No cashout needed yet - let it ride for maximum profit.`;
    }
    return `Match is level at ${match.homeScore}-${match.awayScore}. Hold your position - there's still time for the match to turn in your favor.`;
  }
}

// ==================== NEW ENHANCED AI ENGINE FUNCTIONS ====================

/**
 * Calculate Poisson-based probabilities for match outcomes
 * Uses team attack/defense ratings to model expected goals
 */
export function calculatePoissonProbabilities(
  homeAttackRating: number,
  awayAttackRating: number,
  homeDefenseRating: number,
  awayDefenseRating: number
): PoissonResult {
  // Average goals in a match (football baseline ~1.3 per team)
  const avgGoals = 1.3;

  // Expected goals based on attack vs defense
  const homeAttackStrength = homeAttackRating / 70; // Normalize around 70
  const awayDefenseWeakness = (100 - awayDefenseRating) / 70;
  const expectedHomeGoals = avgGoals * homeAttackStrength * awayDefenseWeakness;

  const awayAttackStrength = awayAttackRating / 70;
  const homeDefenseWeakness = (100 - homeDefenseRating) / 70;
  const expectedAwayGoals = avgGoals * awayAttackStrength * homeDefenseWeakness;

  // Calculate score matrix (0-5 goals each)
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

  // Normalize
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

/**
 * Calculate over/under probabilities for a given line
 */
export function calculateOverUnderProbabilities(
  expectedGoals: number,
  line: number
): OverUnderResult {
  // Calculate probability of total goals using Poisson distribution
  let underProb = 0;
  const maxGoals = 8;

  for (let i = 0; i <= maxGoals; i++) {
    const prob = poissonProbability(expectedGoals, i);
    if (i < line) {
      underProb += prob;
    }
  }

  // For fractional lines (e.g., 2.5), this is clean
  // For whole lines (e.g., 2.0), we need to handle the push
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

/**
 * Generate a detailed analysis with structured sections
 */
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

  // Key factors
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

    // Home advantage
    keyFactors.push(`${match.homeTeam} has home advantage`);

    // Attack vs defense matchup
    if (homeStats.attackRating > awayStats.defenseRating + 10) {
      keyFactors.push(`${match.homeTeam}'s strong attack (${homeStats.attackRating}) vs ${match.awayTeam}'s weaker defense (${awayStats.defenseRating})`);
    }
    if (awayStats.attackRating > homeStats.defenseRating + 10) {
      keyFactors.push(`${match.awayTeam}'s strong attack (${awayStats.attackRating}) vs ${match.homeTeam}'s weaker defense (${homeStats.defenseRating})`);
    }

    // Strengths
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

    // Weaknesses
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

  // Value bet
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

  // Risk assessment
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
