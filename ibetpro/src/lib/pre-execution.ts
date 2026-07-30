// ============================================================================
// iBetPro Pre-Execution Prediction Engine
// Real-time analysis that runs RIGHT BEFORE bet execution
// Combines multiple signals into a final go/no-go decision
// ============================================================================

import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import {
  analyzeMatch,
  calculateKellyCriterion,
  shouldCashout,
  calculateOddsValue,
} from "@/lib/ai-engine";

// ==================== TYPES ====================

export interface PreExecutionSignal {
  signal: "strong_buy" | "buy" | "hold" | "skip" | "strong_skip";
  confidence: number; // 0-1
  edge: number; // Expected value edge
  kellyStake: number; // Recommended stake fraction
  riskScore: number; // 0-100
  riskLevel: "low" | "medium" | "high" | "extreme";
  reasons: string[];
  warnings: string[];
  modelAgreement: number; // 0-1, how much models agree
  timeDecay: number; // 0-1, how much time pressure affects the bet
  liquidityScore: number; // 0-1, how likely the bet can be placed
}

export interface PreExecutionResult {
  canExecute: boolean;
  signal: PreExecutionSignal;
  matchData: {
    id: string;
    homeTeam: string;
    awayTeam: string;
    sport: string;
    league: string;
    homeOdds: number;
    awayOdds: number;
    drawOdds: number | null;
  };
  prediction: {
    homeWinProb: number;
    drawProb: number;
    awayWinProb: number;
    recommended: string;
  };
  stakeRecommendation: {
    minStake: number;
    recommendedStake: number;
    maxStake: number;
    bankrollPercent: number;
  };
  riskAssessment: {
    overallRisk: string;
    factors: string[];
    maxLoss: number;
    expectedReturn: number;
  };
  executionWindow: {
    optimal: boolean;
    secondsRemaining: number;
    reason: string;
  };
}

// ==================== PRE-EXECUTION ANALYSIS ====================

/**
 * Run a comprehensive pre-execution analysis right before placing a bet
 * This is the "final check" that determines whether the bet should be placed
 */
export async function runPreExecutionAnalysis(
  userId: string,
  matchId: string,
  selection: string,
  requestedStake: number,
  bettingAccountId: string
): Promise<PreExecutionResult> {
  // 1. Fetch all required data
  const [user, match, userSettings, bettingAccount, recentBets] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.match.findUnique({
      where: { id: matchId },
      include: { bets: true },
    }),
    prisma.userSettings.findUnique({ where: { userId } }),
    prisma.bettingAccount.findUnique({ where: { id: bettingAccountId } }),
    prisma.bet.findMany({
      where: { userId, status: { in: ["pending", "won", "lost"] } },
      orderBy: { placedAt: "desc" },
      take: 20,
    }),
  ]);

  if (!user || !match || !userSettings || !bettingAccount) {
    throw new Error("Missing required data for pre-execution analysis");
  }

  // 2. Run AI analysis on the match
  const teamStats = await fetchTeamStats(match);
  const analysis = analyzeMatch(
    {
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      sport: match.sport,
      league: match.league,
      homeOdds: match.homeOdds,
      drawOdds: match.drawOdds ?? undefined,
      awayOdds: match.awayOdds,
      status: match.status,
    },
    teamStats.homeStats,
    teamStats.awayStats,
    user.bankroll
  );

  // 3. Calculate Kelly criterion
  const selectionOdds = selection === match.homeTeam ? match.homeOdds :
                         selection === match.awayTeam ? match.awayOdds :
                         match.drawOdds ?? 2.0;
  const selectionProb = selection === match.homeTeam ? analysis.homeWinProb :
                         selection === match.awayTeam ? analysis.awayWinProb :
                         analysis.drawProb;
  const kellyResult = calculateKellyCriterion(
    selectionProb,
    selectionOdds,
    user.bankroll,
    userSettings.kellyFraction
  );

  // 4. Calculate value edge
  const valueEdgeNumber = calculateOddsValue(selectionProb, selectionOdds);
  const valueEdge = { edge: valueEdgeNumber, isValue: valueEdgeNumber > 0 };

  // 5. Evaluate multiple signals
  const signal = evaluateSignals(
    analysis,
    valueEdge,
    kellyResult,
    userSettings,
    user,
    recentBets,
    match,
    requestedStake,
    bettingAccount
  );

  // 6. Calculate stake recommendation
  const stakeRec = calculateStakeRecommendation(
    kellyResult,
    user.bankroll,
    userSettings,
    requestedStake,
    signal
  );

  // 7. Assess risk
  const riskAssessment = assessRisk(
    analysis,
    valueEdge,
    recentBets,
    user.bankroll,
    requestedStake,
    match
  );

  // 8. Check execution window
  const executionWindow = checkExecutionWindow(match);

  // 9. Final go/no-go decision
  const canExecute =
    signal.signal !== "strong_skip" &&
    signal.signal !== "skip" &&
    stakeRec.recommendedStake > 0 &&
    riskAssessment.overallRisk !== "extreme" &&
    executionWindow.optimal &&
    bettingAccount.isConnected &&
    bettingAccount.balance >= requestedStake;

  return {
    canExecute,
    signal,
    matchData: {
      id: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      sport: match.sport,
      league: match.league,
      homeOdds: match.homeOdds,
      awayOdds: match.awayOdds,
      drawOdds: match.drawOdds,
    },
    prediction: {
      homeWinProb: analysis.homeWinProb,
      drawProb: analysis.drawProb,
      awayWinProb: analysis.awayWinProb,
      recommended: analysis.recommended,
    },
    stakeRecommendation: stakeRec,
    riskAssessment,
    executionWindow,
  };
}

// ==================== SIGNAL EVALUATION ====================

function evaluateSignals(
  analysis: { homeWinProb: number; drawProb: number; awayWinProb: number; confidence: number; recommended: string; valueBets: { edge: number }[]; riskScore: number; riskLevel: string },
  valueEdge: { edge: number; isValue: boolean },
  kellyResult: { fraction: number; expectedValue: number; riskOfRuin: number },
  settings: { autoBettingEnabled: boolean; minEdgeThreshold: number; riskLevel: string; maxBetAmount: number; dailyBetLimit: number },
  user: { balance: number; bankroll: number; totalProfit: number; totalLoss: number },
  recentBets: { stake: number; status: string; placedAt: Date }[],
  match: { status: string; commenceTime: Date; sport: string; league: string },
  requestedStake: number,
  account: { balance: number; isConnected: boolean }
): PreExecutionSignal {
  const reasons: string[] = [];
  const warnings: string[] = [];

  // Signal 1: Value edge
  const edgeScore = valueEdge.isValue ? Math.min(valueEdge.edge / 0.1, 1) : 0;
  if (valueEdge.isValue && valueEdge.edge > settings.minEdgeThreshold) {
    reasons.push(`Value edge detected: ${(valueEdge.edge * 100).toFixed(1)}% above threshold`);
  } else if (!valueEdge.isValue) {
    warnings.push(`No value edge — AI probability below implied odds`);
  }

  // Signal 2: AI confidence
  const confidenceScore = analysis.confidence;
  if (analysis.confidence >= 0.7) {
    reasons.push(`High AI confidence: ${(analysis.confidence * 100).toFixed(0)}%`);
  } else if (analysis.confidence < 0.5) {
    warnings.push(`Low AI confidence: ${(analysis.confidence * 100).toFixed(0)}%`);
  }

  // Signal 3: Kelly criterion
  const kellyScore = kellyResult.fraction > 0 ? Math.min(kellyResult.fraction * 4, 1) : 0;
  if (kellyResult.fraction > 0) {
    reasons.push(`Kelly criterion positive: ${(kellyResult.fraction * 100).toFixed(1)}% of bankroll`);
  } else {
    warnings.push(`Kelly criterion negative — no mathematical edge`);
  }

  // Signal 4: Risk of ruin
  if (kellyResult.riskOfRuin > 0.05) {
    warnings.push(`Risk of ruin above threshold: ${(kellyResult.riskOfRuin * 100).toFixed(1)}%`);
  }

  // Signal 5: Bankroll management
  const stakePercentBankroll = requestedStake / user.bankroll;
  if (stakePercentBankroll > 0.1) {
    warnings.push(`Stake is ${(stakePercentBankroll * 100).toFixed(1)}% of bankroll — high exposure`);
  } else if (stakePercentBankroll <= 0.03) {
    reasons.push(`Conservative stake: ${(stakePercentBankroll * 100).toFixed(1)}% of bankroll`);
  }

  // Signal 6: Recent performance (tilt detection)
  const recentLosses = recentBets.filter(b => b.status === "lost").length;
  const recentWinRate = recentBets.length > 0 ?
    recentBets.filter(b => b.status === "won").length / recentBets.length : 0.5;
  if (recentLosses >= 5) {
    warnings.push(`Tilt alert: ${recentLosses} recent losses — consider pausing`);
  }
  if (recentWinRate > 0.7 && recentBets.length >= 5) {
    reasons.push(`Hot streak: ${(recentWinRate * 100).toFixed(0)}% win rate on recent bets`);
  }

  // Signal 7: Account status
  if (!account.isConnected) {
    warnings.push(`Betting account not connected`);
  }
  if (account.balance < requestedStake) {
    warnings.push(`Insufficient account balance: $${account.balance.toFixed(2)} available`);
  }

  // Signal 8: Match status check
  if (match.status !== "upcoming") {
    warnings.push(`Match is not upcoming — current status: ${match.status}`);
  }

  // Signal 9: Time decay — how close to match start
  const minutesToStart = (new Date(match.commenceTime).getTime() - Date.now()) / 60000;
  const timeDecay = minutesToStart < 5 ? 0.3 : minutesToStart < 30 ? 0.7 : minutesToStart < 120 ? 0.9 : 1.0;
  if (minutesToStart < 5) {
    warnings.push(`Match starts in ${Math.ceil(minutesToStart)} minutes — odds may shift rapidly`);
  }

  // Calculate composite signal
  const compositeScore = (edgeScore * 0.3 + confidenceScore * 0.25 + kellyScore * 0.25 + timeDecay * 0.1 + (recentWinRate > 0.5 ? 0.1 : 0.05));
  const riskScore = analysis.riskScore;

  // Determine signal
  let signal: PreExecutionSignal["signal"];
  if (compositeScore >= 0.75 && warnings.length <= 1) signal = "strong_buy";
  else if (compositeScore >= 0.55 && warnings.length <= 2) signal = "buy";
  else if (compositeScore >= 0.4) signal = "hold";
  else if (compositeScore >= 0.25) signal = "skip";
  else signal = "strong_skip";

  // Model agreement (simplified — based on how close value bets are to each other)
  const modelAgreement = analysis.valueBets.length > 0 ?
    1 - (analysis.valueBets.length > 1 ?
      Math.abs(analysis.valueBets[0].edge - analysis.valueBets[Math.min(1, analysis.valueBets.length - 1)].edge) : 0) :
    analysis.confidence;

  return {
    signal,
    confidence: analysis.confidence,
    edge: valueEdge.edge,
    kellyStake: kellyResult.fraction,
    riskScore,
    riskLevel: analysis.riskLevel as "low" | "medium" | "high" | "extreme",
    reasons,
    warnings,
    modelAgreement,
    timeDecay,
    liquidityScore: account.isConnected ? Math.min(account.balance / requestedStake, 1) : 0,
  };
}

// ==================== STAKE RECOMMENDATION ====================

function calculateStakeRecommendation(
  kellyResult: { fraction: number; recommendedStake: number; maxStake: number; expectedValue: number },
  bankroll: number,
  settings: { maxBetAmount: number; dailyBetLimit: number; kellyFraction: number },
  requestedStake: number,
  signal: PreExecutionSignal
): PreExecutionResult["stakeRecommendation"] {
  const minStake = Math.max(1, bankroll * 0.005); // 0.5% of bankroll minimum
  const maxStake = Math.min(
    settings.maxBetAmount,
    bankroll * 0.1, // Never more than 10% of bankroll
    kellyResult.maxStake
  );

  // Adjust recommended stake based on signal
  let recommendedStake = kellyResult.recommendedStake;
  if (signal.signal === "strong_buy") recommendedStake *= 1.0; // Full Kelly fraction
  else if (signal.signal === "buy") recommendedStake *= 0.8;
  else if (signal.signal === "hold") recommendedStake *= 0.5;
  else recommendedStake = 0;

  // Clamp to bounds
  recommendedStake = Math.max(minStake, Math.min(maxStake, recommendedStake));

  // If requested stake exceeds recommendation, use the lower amount
  if (requestedStake > recommendedStake && signal.signal !== "strong_buy") {
    recommendedStake = Math.min(recommendedStake, requestedStake);
  }

  return {
    minStake: Math.round(minStake * 100) / 100,
    recommendedStake: Math.round(recommendedStake * 100) / 100,
    maxStake: Math.round(maxStake * 100) / 100,
    bankrollPercent: Math.round((recommendedStake / bankroll) * 10000) / 100,
  };
}

// ==================== RISK ASSESSMENT ====================

function assessRisk(
  analysis: { confidence: number; riskScore: number; riskLevel: string },
  valueEdge: { edge: number; isValue: boolean },
  recentBets: { stake: number; status: string }[],
  bankroll: number,
  stake: number,
  match: { sport: string; league: string }
): PreExecutionResult["riskAssessment"] {
  const factors: string[] = [];

  // Risk factor 1: Value edge
  if (!valueEdge.isValue) {
    factors.push("No mathematical edge detected");
  } else if (valueEdge.edge < 0.03) {
    factors.push("Marginal edge — small room for error");
  }

  // Risk factor 2: AI confidence
  if (analysis.confidence < 0.5) {
    factors.push("Low AI prediction confidence");
  }

  // Risk factor 3: Exposure
  const exposure = stake / bankroll;
  if (exposure > 0.1) {
    factors.push(`High exposure: ${(exposure * 100).toFixed(1)}% of bankroll`);
  }

  // Risk factor 4: Drawdown
  const totalLosses = recentBets.filter(b => b.status === "lost").reduce((sum, b) => sum + b.stake, 0);
  if (totalLosses > bankroll * 0.2) {
    factors.push("Significant recent drawdown");
  }

  // Risk factor 5: Concentration
  const pendingBets = recentBets.filter(b => b.status === "pending").length;
  if (pendingBets >= 5) {
    factors.push("High concentration of pending bets");
  }

  // Determine overall risk
  let overallRisk: string;
  if (analysis.riskScore >= 80 || factors.length >= 4) overallRisk = "extreme";
  else if (analysis.riskScore >= 60 || factors.length >= 3) overallRisk = "high";
  else if (analysis.riskScore >= 40 || factors.length >= 2) overallRisk = "medium";
  else overallRisk = "low";

  const maxLoss = stake;
  const expectedReturn = valueEdge.isValue ? stake * valueEdge.edge : -stake * 0.1;

  return {
    overallRisk,
    factors,
    maxLoss,
    expectedReturn: Math.round(expectedReturn * 100) / 100,
  };
}

// ==================== EXECUTION WINDOW ====================

function checkExecutionWindow(match: { status: string; commenceTime: Date }): PreExecutionResult["executionWindow"] {
  const now = Date.now();
  const start = new Date(match.commenceTime).getTime();
  const diff = start - now;

  if (match.status === "live") {
    return {
      optimal: false,
      secondsRemaining: 0,
      reason: "Match is already live — in-play betting requires different strategy",
    };
  }

  if (match.status === "finished") {
    return {
      optimal: false,
      secondsRemaining: 0,
      reason: "Match has already finished",
    };
  }

  if (match.status !== "upcoming") {
    return {
      optimal: false,
      secondsRemaining: 0,
      reason: `Match status is ${match.status} — cannot place bets`,
    };
  }

  if (diff < 0) {
    return {
      optimal: false,
      secondsRemaining: 0,
      reason: "Match has already started",
    };
  }

  // Optimal window: 30 minutes to 2 hours before start
  const minutesToStart = diff / 60000;
  const optimal = minutesToStart >= 30 && minutesToStart <= 120;

  return {
    optimal,
    secondsRemaining: Math.floor(diff / 1000),
    reason: optimal
      ? "Within optimal execution window"
      : minutesToStart < 30
        ? "Too close to match start — odds may shift rapidly"
        : "Plenty of time — odds may improve closer to match start",
  };
}

// ==================== TEAM STATS FETCHER ====================

async function fetchTeamStats(match: {
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
}): Promise<{
  homeStats: Parameters<typeof analyzeMatch>[1];
  awayStats: Parameters<typeof analyzeMatch>[2];
}> {
  const currentSeason = new Date().getFullYear().toString();

  const [homeStats, awayStats] = await Promise.all([
    prisma.teamStats.findFirst({
      where: { teamName: match.homeTeam, sport: match.sport, league: match.league, season: currentSeason },
    }),
    prisma.teamStats.findFirst({
      where: { teamName: match.awayTeam, sport: match.sport, league: match.league, season: currentSeason },
    }),
  ]);

  return {
    homeStats: homeStats ? {
      teamName: homeStats.teamName,
      sport: homeStats.sport,
      league: homeStats.league,
      matchesPlayed: homeStats.matchesPlayed,
      wins: homeStats.wins,
      draws: homeStats.draws,
      losses: homeStats.losses,
      goalsFor: homeStats.goalsFor,
      goalsAgainst: homeStats.goalsAgainst,
      form: homeStats.form,
      homeRecord: homeStats.homeRecord,
      awayRecord: homeStats.awayRecord,
      attackRating: homeStats.attackRating,
      defenseRating: homeStats.defenseRating,
      overallRating: homeStats.overallRating,
      keyPlayers: homeStats.keyPlayers,
      xgFor: homeStats.xgFor,
      xgAgainst: homeStats.xgAgainst,
      eloRating: homeStats.eloRating,
      shotsPerGame: homeStats.shotsPerGame,
      shotsOnTargetPerGame: homeStats.shotsOnTargetPerGame,
      possessionAvg: homeStats.possessionAvg,
      cornersPerGame: homeStats.cornersPerGame,
      cardsPerGame: homeStats.cardsPerGame,
    } : null,
    awayStats: awayStats ? {
      teamName: awayStats.teamName,
      sport: awayStats.sport,
      league: awayStats.league,
      matchesPlayed: awayStats.matchesPlayed,
      wins: awayStats.wins,
      draws: awayStats.draws,
      losses: awayStats.losses,
      goalsFor: awayStats.goalsFor,
      goalsAgainst: awayStats.goalsAgainst,
      form: awayStats.form,
      homeRecord: awayStats.homeRecord,
      awayRecord: awayStats.awayRecord,
      attackRating: awayStats.attackRating,
      defenseRating: awayStats.defenseRating,
      overallRating: awayStats.overallRating,
      keyPlayers: awayStats.keyPlayers,
      xgFor: awayStats.xgFor,
      xgAgainst: awayStats.xgAgainst,
      eloRating: awayStats.eloRating,
      shotsPerGame: awayStats.shotsPerGame,
      shotsOnTargetPerGame: awayStats.shotsOnTargetPerGame,
      possessionAvg: awayStats.possessionAvg,
      cornersPerGame: awayStats.cornersPerGame,
      cardsPerGame: awayStats.cardsPerGame,
    } : null,
  };
}
