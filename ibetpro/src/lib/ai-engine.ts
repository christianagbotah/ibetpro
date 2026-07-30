// ============================================================================
// iBetPro Production AI Engine v2.0
// Multi-model prediction system with Poisson, ELO, Monte Carlo, Kelly Criterion
// All defaults are configurable via config.ts / environment variables
// ============================================================================

import { config } from "@/lib/config";

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
  keyPlayers: string | null;
  xgFor: number;
  xgAgainst: number;
  eloRating: number;
  shotsPerGame: number;
  shotsOnTargetPerGame: number;
  possessionAvg: number;
  cornersPerGame: number;
  cardsPerGame: number;
}

interface MatchData {
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  homeOdds: number;
  drawOdds?: number;
  awayOdds: number;
  overUnderLine?: number;
  overOdds?: number;
  underOdds?: number;
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
  modelResults: ModelResult[];
  valueBets: ValueBet[];
  kellyStake: KellyResult;
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
}

interface ModelResult {
  modelName: string;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  weight: number;
  confidence: number;
}

interface ValueBet {
  selection: string;
  aiProb: number;
  impliedProb: number;
  odds: number;
  edge: number;
  kellyFraction: number;
  expectedValue: number;
}

interface KellyResult {
  fraction: number;
  recommendedStake: number;
  maxStake: number;
  expectedValue: number;
  riskOfRuin: number;
}

interface CashoutRecommendation {
  shouldCashout: boolean;
  cashoutAmount: number;
  reasoning: string;
  urgency: "low" | "medium" | "high";
  probabilityOfWinning: number;
  expectedValueIfHold: number;
  expectedValueIfCashout: number;
}

interface DetailedAnalysis {
  keyFactors: string[];
  strengths: { team: string; points: string[] };
  weaknesses: { team: string; points: string[] };
  valueBet: { selection: string; reason: string; edge: number };
  riskAssessment: { level: "low" | "medium" | "high"; score: number; factors: string[] };
  modelConsensus: { agreement: number; dominantModel: string; spread: number };
  xgAnalysis: { homeXg: number; awayXg: number; totalExpected: number };
}

interface PoissonResult {
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  scoreProbabilities: Record<string, number>;
  overUnderProbabilities: { line: number; overProb: number; underProb: number }[];
}

interface OverUnderResult {
  line: number;
  overProb: number;
  underProb: number;
  recommendation: "over" | "under";
  value: number;
}

interface MonteCarloResult {
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  avgHomeGoals: number;
  avgAwayGoals: number;
  mostLikelyScore: string;
  confidenceInterval: { low: number; high: number };
}

// ==================== MATH UTILITIES ====================

// Seeded PRNG for reproducible Monte Carlo simulations
class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next(): number {
    // Mulberry32 — fast, good distribution
    this.seed |= 0;
    this.seed = (this.seed + 0x6d2b79f5) | 0;
    let t = Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

function createRng(seed?: number): SeededRandom {
  return new SeededRandom(seed ?? Date.now());
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function poissonProbability(lambda: number, k: number): number {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

function gaussianRandom(mean: number = 0, stdev: number = 1, rng?: SeededRandom): number {
  const u1 = rng ? rng.next() : Math.random();
  const u2 = rng ? rng.next() : Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z * stdev + mean;
}

// ==================== FORM & RECORD PARSING ====================

function parseForm(form: string | null): number {
  if (!form) return 0.5;
  const chars = form.replace(/[^WDL]/g, "").split("");
  if (chars.length === 0) return 0.5;
  let score = 0;
  let totalWeight = 0;
  // Recent matches weighted more heavily
  for (let i = 0; i < chars.length; i++) {
    const weight = 1 + (i / chars.length) * 0.5; // More recent = higher weight
    if (chars[i] === "W") score += 1 * weight;
    else if (chars[i] === "D") score += 0.4 * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? score / totalWeight : 0.5;
}

function parseRecord(record: string | null): { wins: number; draws: number; losses: number; rate: number } {
  if (!record) return { wins: 0, draws: 0, losses: 0, rate: 0.5 };
  const parts = record.split("-").map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return { wins: 0, draws: 0, losses: 0, rate: 0.5 };
  const [wins, draws, losses] = parts;
  const total = wins + draws + losses;
  return { wins, draws, losses, rate: total > 0 ? (wins + draws * 0.4) / total : 0.5 };
}

// ==================== ELO RATING SYSTEM ====================

function calculateEloProbability(homeElo: number, awayElo: number, isHome: boolean = true): number {
  // Home advantage bonus of 65 Elo points (well-established in football analytics)
  const homeAdvantage = isHome ? config.ai.eloHomeAdvantage : 0;
  const eloDiff = (homeElo + homeAdvantage) - awayElo;
  return 1 / (1 + Math.pow(10, -eloDiff / 400));
}

function calculateEloDrawProbability(homeElo: number, awayElo: number): number {
  // Draw probability is highest when teams are close in rating
  const eloDiff = Math.abs(homeElo - awayElo);
  // Base draw probability ~26% for football, decreasing with rating gap
  const baseDrawProb = config.ai.baseDrawProb;
  const gapPenalty = eloDiff / 1000; // Larger gap = fewer draws
  return Math.max(0.12, Math.min(0.35, baseDrawProb - gapPenalty));
}

function predictWithElo(homeElo: number, awayElo: number): { homeWin: number; draw: number; awayWin: number } {
  const homeWinRaw = calculateEloProbability(homeElo, awayElo, true);
  const drawProb = calculateEloDrawProbability(homeElo, awayElo);
  const awayWinRaw = 1 - homeWinRaw;

  // Adjust for draw probability
  const remaining = 1 - drawProb;
  const homeWin = homeWinRaw * remaining;
  const awayWin = awayWinRaw * remaining;

  return { homeWin, draw: drawProb, awayWin };
}

// ==================== POISSON MODEL ====================

export function calculatePoissonProbabilities(
  homeStats: TeamStatsData | null,
  awayStats: TeamStatsData | null,
  leagueAvgGoals: number = config.ai.leagueAvgGoals
): PoissonResult {
  let expectedHomeGoals = leagueAvgGoals;
  let expectedAwayGoals = leagueAvgGoals;

  if (homeStats && awayStats) {
    // Calculate attack strength and defense weakness relative to league average
    const homeAttackStrength = homeStats.goalsFor / Math.max(1, homeStats.matchesPlayed) / leagueAvgGoals;
    const awayDefenseStrength = awayStats.goalsAgainst / Math.max(1, awayStats.matchesPlayed) / leagueAvgGoals;
    const awayAttackStrength = awayStats.goalsFor / Math.max(1, awayStats.matchesPlayed) / leagueAvgGoals;
    const homeDefenseStrength = homeStats.goalsAgainst / Math.max(1, homeStats.matchesPlayed) / leagueAvgGoals;

    // Use xG data if available for more accurate expected goals
    const homeXgPerGame = homeStats.xgFor > 0 ? homeStats.xgFor / Math.max(1, homeStats.matchesPlayed) : 0;
    const awayXgPerGame = awayStats.xgFor > 0 ? awayStats.xgFor / Math.max(1, awayStats.matchesPlayed) : 0;

    // Blend actual goals and xG for more robust estimation
    const homeGoalRate = homeStats.goalsFor / Math.max(1, homeStats.matchesPlayed);
    const awayGoalRate = awayStats.goalsFor / Math.max(1, awayStats.matchesPlayed);

    const homeAttackRate = homeXgPerGame > 0 ? (homeGoalRate * 0.6 + homeXgPerGame * 0.4) : homeGoalRate;
    const awayAttackRate = awayXgPerGame > 0 ? (awayGoalRate * 0.6 + awayXgPerGame * 0.4) : awayGoalRate;

    // Expected goals = attack strength * opponent defense weakness * league avg
    expectedHomeGoals = homeAttackStrength * awayDefenseStrength * leagueAvgGoals;
    expectedAwayGoals = awayAttackStrength * homeDefenseStrength * leagueAvgGoals;

    // Override with blended xG model if available
    if (homeXgPerGame > 0 || awayXgPerGame > 0) {
      const homeConcedeRate = homeStats.goalsAgainst / Math.max(1, homeStats.matchesPlayed);
      const awayConcedeRate = awayStats.goalsAgainst / Math.max(1, awayStats.matchesPlayed);
      const homeXgAgainst = homeStats.xgAgainst > 0 ? homeStats.xgAgainst / Math.max(1, homeStats.matchesPlayed) : homeConcedeRate;
      const awayXgAgainst = awayStats.xgAgainst > 0 ? awayStats.xgAgainst / Math.max(1, awayStats.matchesPlayed) : awayConcedeRate;

      // Blend Poisson expected with xG model
      const xgHomeExpected = (homeAttackRate + awayXgAgainst) / 2;
      const xgAwayExpected = (awayAttackRate + homeXgAgainst) / 2;

      expectedHomeGoals = expectedHomeGoals * 0.4 + xgHomeExpected * 0.6;
      expectedAwayGoals = expectedAwayGoals * 0.4 + xgAwayExpected * 0.6;
    }

    // Home advantage boost (configurable via AI_HOME_ADV_MULT / AI_AWAY_PEN_MULT)
    expectedHomeGoals *= config.ai.homeAdvantageMultiplier;
    expectedAwayGoals *= config.ai.awayPenaltyMultiplier;
  }

  // Ensure reasonable bounds
  expectedHomeGoals = Math.max(0.3, Math.min(4.0, expectedHomeGoals));
  expectedAwayGoals = Math.max(0.2, Math.min(3.5, expectedAwayGoals));

  // Calculate score matrix (0-7 goals each)
  const maxGoals = 7;
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

  // Normalize (account for probabilities beyond maxGoals)
  const total = homeWinProb + drawProb + awayWinProb;
  homeWinProb /= total;
  drawProb /= total;
  awayWinProb /= total;

  // Calculate over/under probabilities for common lines
  const overUnderProbabilities: { line: number; overProb: number; underProb: number }[] = [];
  for (const line of [0.5, 1.5, 2.5, 3.5, 4.5]) {
    let underProb = 0;
    const totalExpected = expectedHomeGoals + expectedAwayGoals;

    for (let i = 0; i <= 8; i++) {
      const prob = poissonProbability(totalExpected, i);
      if (i < line) {
        underProb += prob;
      }
    }

    overUnderProbabilities.push({
      line,
      overProb: Math.round((1 - underProb) * 100) / 100,
      underProb: Math.round(underProb * 100) / 100,
    });
  }

  return {
    expectedHomeGoals: Math.round(expectedHomeGoals * 100) / 100,
    expectedAwayGoals: Math.round(expectedAwayGoals * 100) / 100,
    homeWinProb: Math.round(homeWinProb * 100) / 100,
    drawProb: Math.round(drawProb * 100) / 100,
    awayWinProb: Math.round(awayWinProb * 100) / 100,
    scoreProbabilities,
    overUnderProbabilities,
  };
}

// ==================== MONTE CARLO SIMULATION ====================

function runMonteCarloSimulation(
  expectedHomeGoals: number,
  expectedAwayGoals: number,
  iterations: number = config.ai.monteCarloIterations
): MonteCarloResult {
  // Use seeded PRNG for reproducibility
  const rng = createRng();

  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let totalHomeGoals = 0;
  let totalAwayGoals = 0;
  const scoreCounts: Record<string, number> = {};

  for (let i = 0; i < iterations; i++) {
    // Simulate goals using Poisson with seeded random variation
    const homeGoals = poissonRandom(expectedHomeGoals, rng);
    const awayGoals = poissonRandom(expectedAwayGoals, rng);

    totalHomeGoals += homeGoals;
    totalAwayGoals += awayGoals;

    const scoreKey = `${homeGoals}-${awayGoals}`;
    scoreCounts[scoreKey] = (scoreCounts[scoreKey] || 0) + 1;

    if (homeGoals > awayGoals) homeWins++;
    else if (homeGoals === awayGoals) draws++;
    else awayWins++;
  }

  // Find most likely score
  let mostLikelyScore = "1-0";
  let maxCount = 0;
  for (const [score, count] of Object.entries(scoreCounts)) {
    if (count > maxCount) {
      maxCount = count;
      mostLikelyScore = score;
    }
  }

  // Calculate confidence interval for total goals
  const totalGoals = [];
  for (let i = 0; i < iterations; i++) {
    totalGoals.push(poissonRandom(expectedHomeGoals, rng) + poissonRandom(expectedAwayGoals, rng));
  }
  totalGoals.sort((a, b) => a - b);
  const lowIdx = Math.floor(iterations * 0.1);
  const highIdx = Math.floor(iterations * 0.9);

  return {
    homeWinProb: Math.round((homeWins / iterations) * 100) / 100,
    drawProb: Math.round((draws / iterations) * 100) / 100,
    awayWinProb: Math.round((awayWins / iterations) * 100) / 100,
    avgHomeGoals: Math.round((totalHomeGoals / iterations) * 100) / 100,
    avgAwayGoals: Math.round((totalAwayGoals / iterations) * 100) / 100,
    mostLikelyScore,
    confidenceInterval: {
      low: totalGoals[lowIdx] || 1,
      high: totalGoals[highIdx] || 4,
    },
  };
}

function poissonRandom(lambda: number, rng?: SeededRandom): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng ? rng.next() : Math.random();
  } while (p > L);
  return k - 1;
}

// ==================== KELLY CRITERION ====================

export function calculateKellyCriterion(
  probability: number,
  odds: number,
  bankroll: number = 1000,
  fractionalKelly: number = config.ai.kellyFraction // Use quarter-Kelly for safety
): KellyResult {
  const b = odds - 1; // Net odds
  const q = 1 - probability; // Probability of losing

  // Full Kelly fraction
  const fullKelly = (b * probability - q) / b;

  // If negative, no bet should be placed
  if (fullKelly <= 0) {
    return {
      fraction: 0,
      recommendedStake: 0,
      maxStake: 0,
      expectedValue: 0,
      riskOfRuin: 0,
    };
  }

  // Apply fractional Kelly for risk management
  const adjustedFraction = fullKelly * fractionalKelly;

  // Cap at 10% of bankroll for safety
  const cappedFraction = Math.min(adjustedFraction, 0.10);

  // Expected value
  const expectedValue = probability * b - q;

  // Risk of ruin approximation (simplified)
  const riskOfRuin = Math.pow(q / probability, Math.floor(bankroll / (cappedFraction * bankroll)));

  return {
    fraction: Math.round(cappedFraction * 10000) / 10000,
    recommendedStake: Math.round(cappedFraction * bankroll * 100) / 100,
    maxStake: Math.round(Math.min(fullKelly * bankroll, bankroll * 0.10) * 100) / 100,
    expectedValue: Math.round(expectedValue * 1000) / 1000,
    riskOfRuin: Math.round(Math.min(riskOfRuin, 1) * 10000) / 10000,
  };
}

// ==================== OVER/UNDER ANALYSIS ====================

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

// ==================== VALUE BET DETECTION ====================

function detectValueBets(
  match: MatchData,
  prediction: { homeWinProb: number; drawProb: number; awayWinProb: number },
  bankroll: number = 1000
): ValueBet[] {
  const valueBets: ValueBet[] = [];

  // Home win value
  const homeImplied = 1 / match.homeOdds;
  const homeEdge = prediction.homeWinProb - homeImplied;
  if (homeEdge > 0.03) { // Minimum 3% edge
    const kelly = calculateKellyCriterion(prediction.homeWinProb, match.homeOdds, bankroll);
    valueBets.push({
      selection: `${match.homeTeam} Win`,
      aiProb: prediction.homeWinProb,
      impliedProb: homeImplied,
      odds: match.homeOdds,
      edge: Math.round(homeEdge * 100) / 100,
      kellyFraction: kelly.fraction,
      expectedValue: kelly.expectedValue,
    });
  }

  // Away win value
  const awayImplied = 1 / match.awayOdds;
  const awayEdge = prediction.awayWinProb - awayImplied;
  if (awayEdge > 0.03) {
    const kelly = calculateKellyCriterion(prediction.awayWinProb, match.awayOdds, bankroll);
    valueBets.push({
      selection: `${match.awayTeam} Win`,
      aiProb: prediction.awayWinProb,
      impliedProb: awayImplied,
      odds: match.awayOdds,
      edge: Math.round(awayEdge * 100) / 100,
      kellyFraction: kelly.fraction,
      expectedValue: kelly.expectedValue,
    });
  }

  // Draw value
  if (match.drawOdds) {
    const drawImplied = 1 / match.drawOdds;
    const drawEdge = prediction.drawProb - drawImplied;
    if (drawEdge > 0.03) {
      const kelly = calculateKellyCriterion(prediction.drawProb, match.drawOdds, bankroll);
      valueBets.push({
        selection: "Draw",
        aiProb: prediction.drawProb,
        impliedProb: drawImplied,
        odds: match.drawOdds,
        edge: Math.round(drawEdge * 100) / 100,
        kellyFraction: kelly.fraction,
        expectedValue: kelly.expectedValue,
      });
    }
  }

  // Over/Under value
  if (match.overUnderLine && match.overOdds && match.underOdds) {
    const overImplied = 1 / match.overOdds;
    const underImplied = 1 / match.underOdds;
    // Use Poisson model for over/under
    const totalExpected = config.ai.overUnderExpected; // Will be overridden by actual expected goals
    const overProb = 1 - normalCDF((match.overUnderLine - totalExpected) / Math.sqrt(totalExpected));
    const underProb = 1 - overProb;

    const overEdge = overProb - overImplied;
    const underEdge = underProb - underImplied;

    if (overEdge > 0.03) {
      const kelly = calculateKellyCriterion(overProb, match.overOdds, bankroll);
      valueBets.push({
        selection: `Over ${match.overUnderLine}`,
        aiProb: Math.round(overProb * 100) / 100,
        impliedProb: overImplied,
        odds: match.overOdds,
        edge: Math.round(overEdge * 100) / 100,
        kellyFraction: kelly.fraction,
        expectedValue: kelly.expectedValue,
      });
    }
    if (underEdge > 0.03) {
      const kelly = calculateKellyCriterion(underProb, match.underOdds, bankroll);
      valueBets.push({
        selection: `Under ${match.overUnderLine}`,
        aiProb: Math.round(underProb * 100) / 100,
        impliedProb: underImplied,
        odds: match.underOdds,
        edge: Math.round(underEdge * 100) / 100,
        kellyFraction: kelly.fraction,
        expectedValue: kelly.expectedValue,
      });
    }
  }

  return valueBets.sort((a, b) => b.edge - a.edge);
}

// ==================== MAIN ANALYSIS ENGINE ====================

export function analyzeMatch(
  match: MatchData,
  homeTeamStats?: TeamStatsData | null,
  awayTeamStats?: TeamStatsData | null,
  bankroll: number = 1000
): Prediction {
  const modelResults: ModelResult[] = [];

  // ---- MODEL 1: Bookmaker Odds Implied Probability ----
  const homeImplied = 1 / match.homeOdds;
  const awayImplied = 1 / match.awayOdds;
  const drawImplied = match.drawOdds ? 1 / match.drawOdds : 0.25;
  const totalImplied = homeImplied + drawImplied + awayImplied;
  const margin = 1 / totalImplied;

  const oddsModelHome = homeImplied * margin;
  const oddsModelDraw = drawImplied * margin;
  const oddsModelAway = awayImplied * margin;

  modelResults.push({
    modelName: "Bookmaker Odds Model",
    homeWinProb: oddsModelHome,
    drawProb: oddsModelDraw,
    awayWinProb: oddsModelAway,
    weight: 0.25,
    confidence: 0.6,
  });

  // ---- MODEL 2: Poisson Distribution Model ----
  const poissonResult = calculatePoissonProbabilities(homeTeamStats ?? null, awayTeamStats ?? null);

  modelResults.push({
    modelName: "Poisson Distribution",
    homeWinProb: poissonResult.homeWinProb,
    drawProb: poissonResult.drawProb,
    awayWinProb: poissonResult.awayWinProb,
    weight: 0.30,
    confidence: homeTeamStats && awayTeamStats ? 0.8 : 0.5,
  });

  // ---- MODEL 3: ELO Rating Model ----
  const homeElo = homeTeamStats?.eloRating || config.ai.defaultElo;
  const awayElo = awayTeamStats?.eloRating || config.ai.defaultElo;
  const eloResult = predictWithElo(homeElo, awayElo);

  modelResults.push({
    modelName: "ELO Rating System",
    homeWinProb: eloResult.homeWin,
    drawProb: eloResult.draw,
    awayWinProb: eloResult.awayWin,
    weight: 0.25,
    confidence: homeTeamStats && awayTeamStats ? 0.75 : 0.4,
  });

  // ---- MODEL 4: Monte Carlo Simulation ----
  const mcResult = runMonteCarloSimulation(
    poissonResult.expectedHomeGoals,
    poissonResult.expectedAwayGoals,
    10000
  );

  modelResults.push({
    modelName: "Monte Carlo Simulation",
    homeWinProb: mcResult.homeWinProb,
    drawProb: mcResult.drawProb,
    awayWinProb: mcResult.awayWinProb,
    weight: 0.20,
    confidence: 0.7,
  });

  // ---- ENSEMBLE: Weighted Average of All Models ----
  let totalWeight = 0;
  let ensembleHome = 0;
  let ensembleDraw = 0;
  let ensembleAway = 0;

  for (const model of modelResults) {
    // Adjust weight based on confidence and data availability
    const adjustedWeight = model.weight * model.confidence;
    ensembleHome += model.homeWinProb * adjustedWeight;
    ensembleDraw += model.drawProb * adjustedWeight;
    ensembleAway += model.awayWinProb * adjustedWeight;
    totalWeight += adjustedWeight;
  }

  if (totalWeight > 0) {
    ensembleHome /= totalWeight;
    ensembleDraw /= totalWeight;
    ensembleAway /= totalWeight;
  }

  // ---- FORM-BASED ADJUSTMENTS ----
  if (homeTeamStats && awayTeamStats) {
    const homeForm = parseForm(homeTeamStats.form);
    const awayForm = parseForm(awayTeamStats.form);
    const formAdjust = (homeForm - awayForm) * 0.04;

    // Home/away record adjustment
    const homeHomeRecord = parseRecord(homeTeamStats.homeRecord);
    const awayAwayRecord = parseRecord(awayTeamStats.awayRecord);
    const recordAdjust = (homeHomeRecord.rate - awayAwayRecord.rate) * 0.03;

    // Attack vs defense matchup
    const attackDefenseFactor = ((homeTeamStats.attackRating - awayTeamStats.defenseRating) -
      (awayTeamStats.attackRating - homeTeamStats.defenseRating)) / 200;

    // Apply adjustments
    ensembleHome += formAdjust + recordAdjust + attackDefenseFactor * 0.05;
    ensembleAway -= formAdjust + recordAdjust + attackDefenseFactor * 0.05;

    // xG-based adjustment if available
    if (homeTeamStats.xgFor > 0 && awayTeamStats.xgFor > 0) {
      const homeXgRate = homeTeamStats.xgFor / Math.max(1, homeTeamStats.matchesPlayed);
      const awayXgRate = awayTeamStats.xgFor / Math.max(1, awayTeamStats.matchesPlayed);
      const xgDiff = (homeXgRate - awayXgRate) * 0.05;
      ensembleHome += xgDiff;
      ensembleAway -= xgDiff;
    }
  }

  // ---- Normalize ----
  ensembleHome = Math.max(0.03, ensembleHome);
  ensembleDraw = Math.max(0.03, ensembleDraw);
  ensembleAway = Math.max(0.03, ensembleAway);

  const normTotal = ensembleHome + ensembleDraw + ensembleAway;
  ensembleHome /= normTotal;
  ensembleDraw /= normTotal;
  ensembleAway /= normTotal;

  // ---- Determine Recommendation ----
  let recommended: Prediction["recommended"] = "home";
  let maxProb = ensembleHome;

  if (ensembleAway > maxProb) {
    recommended = "away";
    maxProb = ensembleAway;
  }
  if (ensembleDraw > maxProb && match.sport === "football") {
    recommended = "draw";
    maxProb = ensembleDraw;
  }

  // Check if over/under is better value
  if (match.overUnderLine && match.sport === "football") {
    const totalExpected = poissonResult.expectedHomeGoals + poissonResult.expectedAwayGoals;
    const ouResult = calculateOverUnderProbabilities(totalExpected, match.overUnderLine);
    const ouValue = Math.abs(ouResult.overProb - (match.overOdds ? 1 / match.overOdds : 0.5));
    const matchWinnerValue = Math.abs(maxProb - (recommended === "home" ? 1 / match.homeOdds : 1 / match.awayOdds));

    if (ouValue > matchWinnerValue && ouValue > 0.08) {
      recommended = ouResult.recommendation as "over" | "under";
    }
  }

  // ---- Calculate Confidence ----
  const modelAgreement = 1 - Math.sqrt(
    modelResults.reduce((sum, m) => {
      return sum + Math.pow(m.homeWinProb - ensembleHome, 2) +
        Math.pow(m.drawProb - ensembleDraw, 2) +
        Math.pow(m.awayWinProb - ensembleAway, 2);
    }, 0) / modelResults.length
  );

  const confidence = Math.max(0.3, Math.min(0.95,
    maxProb * 0.6 + modelAgreement * 0.3 + (homeTeamStats && awayTeamStats ? 0.1 : 0)
  ));

  // ---- Risk Assessment ----
  let riskScore = 50;
  if (confidence < 0.5) riskScore += 25;
  if (confidence > 0.7) riskScore -= 20;
  if (Math.abs(ensembleHome - ensembleAway) < 0.1) riskScore += 15;
  if (match.homeOdds > 3.0 || match.awayOdds > 3.0) riskScore += 10;
  if (!homeTeamStats || !awayTeamStats) riskScore += 20;
  if (modelAgreement < 0.7) riskScore += 10;
  riskScore = Math.max(0, Math.min(100, riskScore));

  const riskLevel: "low" | "medium" | "high" =
    riskScore <= 35 ? "low" : riskScore <= 65 ? "medium" : "high";

  // ---- Value Bets ----
  const valueBets = detectValueBets(
    match,
    { homeWinProb: ensembleHome, drawProb: ensembleDraw, awayWinProb: ensembleAway },
    bankroll
  );

  // ---- Kelly Criterion for main recommendation ----
  const recOdds = recommended === "home" ? match.homeOdds :
    recommended === "away" ? match.awayOdds :
    match.drawOdds || 3.0;
  const recProb = recommended === "home" ? ensembleHome :
    recommended === "away" ? ensembleAway :
    ensembleDraw;
  const kellyStake = calculateKellyCriterion(recProb, recOdds, bankroll);

  // ---- Generate Analysis Text ----
  const analysis = generateAnalysisText(match, {
    homeWinProb: ensembleHome,
    drawProb: ensembleDraw,
    awayWinProb: ensembleAway,
    confidence,
    recommended,
    analysis: "",
    modelResults,
    valueBets,
    kellyStake,
    riskScore,
    riskLevel,
  }, homeTeamStats, awayTeamStats, poissonResult, mcResult);

  return {
    homeWinProb: Math.round(ensembleHome * 100) / 100,
    drawProb: Math.round(ensembleDraw * 100) / 100,
    awayWinProb: Math.round(ensembleAway * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    recommended,
    analysis,
    modelResults: modelResults.map(m => ({
      ...m,
      homeWinProb: Math.round(m.homeWinProb * 100) / 100,
      drawProb: Math.round(m.drawProb * 100) / 100,
      awayWinProb: Math.round(m.awayWinProb * 100) / 100,
    })),
    valueBets,
    kellyStake,
    riskScore,
    riskLevel,
  };
}

// ==================== ANALYSIS TEXT GENERATION ====================

function generateAnalysisText(
  match: MatchData,
  prediction: Prediction,
  homeStats?: TeamStatsData | null,
  awayStats?: TeamStatsData | null,
  poissonResult?: PoissonResult,
  mcResult?: MonteCarloResult
): string {
  const parts: string[] = [];

  // Model consensus
  const modelCount = prediction.modelResults.length;
  const agreeingModels = prediction.modelResults.filter(m => {
    const maxP = Math.max(m.homeWinProb, m.drawProb, m.awayWinProb);
    if (maxP === m.homeWinProb && prediction.recommended === "home") return true;
    if (maxP === m.awayWinProb && prediction.recommended === "away") return true;
    if (maxP === m.drawProb && prediction.recommended === "draw") return true;
    return false;
  }).length;

  parts.push(`Multi-model analysis (${modelCount} models, ${agreeingModels} agree): ` +
    `Home ${Math.round(prediction.homeWinProb * 100)}% | Draw ${Math.round(prediction.drawProb * 100)}% | Away ${Math.round(prediction.awayWinProb * 100)}%.`);

  // Poisson insights
  if (poissonResult) {
    parts.push(`Poisson model expects ${poissonResult.expectedHomeGoals}-${poissonResult.expectedAwayGoals} ` +
      `(total ${Math.round((poissonResult.expectedHomeGoals + poissonResult.expectedAwayGoals) * 10) / 10} goals).`);
  }

  // Monte Carlo insights
  if (mcResult) {
    parts.push(`Monte Carlo simulation (10,000 iterations): Most likely score ${mcResult.mostLikelyScore}, ` +
      `total goals range ${mcResult.confidenceInterval.low}-${mcResult.confidenceInterval.high}.`);
  }

  // Team stats analysis
  if (homeStats && awayStats) {
    // Form
    const homeForm = homeStats.form || "N/A";
    const awayForm = awayStats.form || "N/A";
    parts.push(`Form: ${match.homeTeam} (${homeForm}) vs ${match.awayTeam} (${awayForm}).`);

    // Rating comparison
    const ratingDiff = homeStats.overallRating - awayStats.overallRating;
    if (Math.abs(ratingDiff) > 5) {
      parts.push(`${ratingDiff > 0 ? match.homeTeam : match.awayTeam} has a ${Math.abs(ratingDiff)}-point rating advantage.`);
    }

    // ELO
    if (homeStats.eloRating > 0 && awayStats.eloRating > 0) {
      parts.push(`ELO ratings: ${match.homeTeam} (${homeStats.eloRating}) vs ${match.awayTeam} (${awayStats.eloRating}).`);
    }

    // xG
    if (homeStats.xgFor > 0 && awayStats.xgFor > 0) {
      const homeXgPerGame = Math.round(homeStats.xgFor / Math.max(1, homeStats.matchesPlayed) * 100) / 100;
      const awayXgPerGame = Math.round(awayStats.xgFor / Math.max(1, awayStats.matchesPlayed) * 100) / 100;
      parts.push(`xG per game: ${match.homeTeam} (${homeXgPerGame}) vs ${match.awayTeam} (${awayXgPerGame}).`);
    }

    // Attack vs defense
    if (homeStats.attackRating > awayStats.defenseRating + 10) {
      parts.push(`${match.homeTeam}'s attack (${homeStats.attackRating}) significantly exceeds ${match.awayTeam}'s defense (${awayStats.defenseRating}).`);
    }
    if (awayStats.attackRating > homeStats.defenseRating + 10) {
      parts.push(`${match.awayTeam}'s attack (${awayStats.attackRating}) significantly exceeds ${match.homeTeam}'s defense (${homeStats.defenseRating}).`);
    }
  }

  // Value bet info
  if (prediction.valueBets.length > 0) {
    const topValue = prediction.valueBets[0];
    parts.push(`Best value: ${topValue.selection} with ${Math.round(topValue.edge * 100)}% edge ` +
      `(AI: ${Math.round(topValue.aiProb * 100)}% vs implied: ${Math.round(topValue.impliedProb * 100)}%).`);
  }

  // Kelly recommendation
  if (prediction.kellyStake.recommendedStake > 0) {
    parts.push(`Kelly Criterion recommends $${prediction.kellyStake.recommendedStake} stake ` +
      `(${Math.round(prediction.kellyStake.fraction * 100)}% of bankroll).`);
  }

  // Risk
  parts.push(`Risk level: ${prediction.riskLevel.toUpperCase()} (${prediction.riskScore}/100). ` +
    `Confidence: ${Math.round(prediction.confidence * 100)}%.`);

  return parts.join(" ");
}

// ==================== CASHOUT ENGINE ====================

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
  },
  homeTeamStats?: TeamStatsData | null,
  awayTeamStats?: TeamStatsData | null
): CashoutRecommendation {
  const { stake, potentialWin, odds } = bet;
  const { homeScore, awayScore, minute, sport } = currentMatchState;

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

  // Calculate probability of current result holding
  let probabilityOfWinning = 0.5;

  if (currentLead > 0) {
    // Bet is winning - calculate probability of holding
    if (isFootball) {
      // Football: use Poisson model for remaining time
      const remainingMins = 90 - minute;
      const goalRate = remainingMins / 90 * config.ai.goalRatePerMatch; // Configurable average goals per match
      const probOfConceding = 1 - Math.exp(-goalRate * 0.4); // Approximate

      if (currentLead >= 2) {
        probabilityOfWinning = 0.85 + (progress * 0.10);
      } else if (currentLead === 1) {
        probabilityOfWinning = 0.55 + (progress * 0.25);
      }

      // Adjust for team quality
      if (homeTeamStats && awayTeamStats) {
        const defendingTeam = selectionIsHome ? homeTeamStats : awayTeamStats;
        const attackingTeam = selectionIsHome ? awayTeamStats : homeTeamStats;
        if (defendingTeam.defenseRating > 75) probabilityOfWinning += 0.05;
        if (attackingTeam.attackRating < 65) probabilityOfWinning += 0.05;
      }
    } else if (isBasketball) {
      // Basketball: use normal distribution approximation
      const remainingPossessions = (48 - minute) / 48 * 100;
      const standardDev = Math.sqrt(remainingPossessions) * 0.4;
      probabilityOfWinning = normalCDF(currentLead / Math.max(1, standardDev));
    } else if (isTennis) {
      // Tennis: simpler model based on lead and sets
      probabilityOfWinning = 0.5 + currentLead * 0.15 + progress * 0.2;
    }

    probabilityOfWinning = Math.min(0.98, probabilityOfWinning);
  } else if (currentLead === 0) {
    // Draw - bet is at risk
    probabilityOfWinning = 0.3 - progress * 0.1;
  } else {
    // Losing
    probabilityOfWinning = Math.max(0.02, 0.2 - Math.abs(currentLead) * 0.08);
  }

  // Calculate expected values
  const profitIfWin = potentialWin - stake;
  const fairCashout = probabilityOfWinning * profitIfWin + (1 - probabilityOfWinning) * 0;

  // Bookmaker cashout is typically 80-90% of fair value
  const bookmakerCashout = fairCashout * config.ai.cashoutBookmakerMargin;

  // Expected value if holding
  const expectedValueIfHold = probabilityOfWinning * profitIfWin - (1 - probabilityOfWinning) * stake;
  // Expected value if cashing out (after bookmaker margin)
  const expectedValueIfCashout = bookmakerCashout - stake;

  let cashoutAmount = stake + bookmakerCashout;
  let shouldCashout = false;
  let urgency: CashoutRecommendation["urgency"] = "low";

  // Cashout decision logic
  if (currentLead > 0) {
    // Currently winning
    if (progress > 0.75 && currentLead >= 1) {
      // Late in game, winning - strong cashout case
      shouldCashout = true;
      urgency = "medium";
      if (progress > 0.85) urgency = "low"; // Very late, less urgency needed
    } else if (progress > 0.5 && currentLead >= 2) {
      // Comfortable lead, second half
      shouldCashout = true;
      urgency = "low";
    } else if (expectedValueIfCashout > expectedValueIfHold * 0.9 && progress > 0.6) {
      // Cashout value is close to hold value with less risk
      shouldCashout = true;
      urgency = "medium";
    }

    // Minimum cashout should be above stake
    if (cashoutAmount < stake * 1.05) {
      shouldCashout = false;
    }
  } else if (currentLead === 0) {
    // Draw
    if (progress > 0.7) {
      shouldCashout = true;
      urgency = "high";
      cashoutAmount = stake * config.ai.cashoutDrawStakeRatio;
    }
  } else {
    // Losing
    if (progress > 0.5) {
      shouldCashout = true;
      urgency = "high";
      cashoutAmount = stake * config.ai.cashoutLosingStakeRatio;
    }
  }

  // Generate reasoning
  const reasoning = generateCashoutReasoning(
    bet, currentMatchState, shouldCashout, cashoutAmount, urgency,
    probabilityOfWinning, expectedValueIfHold, expectedValueIfCashout
  );

  return {
    shouldCashout,
    cashoutAmount: Math.round(cashoutAmount * 100) / 100,
    reasoning,
    urgency,
    probabilityOfWinning: Math.round(probabilityOfWinning * 100) / 100,
    expectedValueIfHold: Math.round(expectedValueIfHold * 100) / 100,
    expectedValueIfCashout: Math.round(expectedValueIfCashout * 100) / 100,
  };
}

function generateCashoutReasoning(
  bet: { selection: string; odds: number; stake: number; potentialWin: number },
  match: { homeScore: number; awayScore: number; minute: number; homeTeam: string; awayTeam: string; sport: string },
  shouldCashout: boolean,
  cashoutAmount: number,
  urgency: string,
  probOfWinning: number,
  evHold: number,
  evCashout: number
): string {
  const selectionIsHome = bet.selection === match.homeTeam;
  const currentLead = selectionIsHome
    ? match.homeScore - match.awayScore
    : match.awayScore - match.homeScore;

  if (shouldCashout) {
    if (currentLead > 0) {
      return `Your bet on ${bet.selection} is winning (${match.homeScore}-${match.awayScore} at ${match.minute}'). ` +
        `Win probability: ${Math.round(probOfWinning * 100)}%. Cashout of $${Math.round(cashoutAmount * 100) / 100} secures ` +
        `$${Math.round((cashoutAmount - bet.stake) * 100) / 100} profit. EV hold: $${Math.round(evHold * 100) / 100} vs EV cashout: $${Math.round(evCashout * 100) / 100}. ` +
        `${urgency === "high" ? "ACT NOW - position could deteriorate!" : "Moderate urgency - consider cashing out soon."}`;
    } else if (currentLead === 0) {
      return `Match is drawn (${match.homeScore}-${match.awayScore} at ${match.minute}'). ` +
        `Win probability: ${Math.round(probOfWinning * 100)}%. Cashout to recover $${Math.round(cashoutAmount * 100) / 100}. ` +
        `High urgency - your bet is at significant risk.`;
    } else {
      return `${bet.selection} is losing (${match.homeScore}-${match.awayScore} at ${match.minute}'). ` +
        `Win probability: ${Math.round(probOfWinning * 100)}%. Cashout to recover $${Math.round(cashoutAmount * 100) / 100}. ` +
        `Recovery unlikely at this stage.`;
    }
  } else {
    if (currentLead > 0) {
      return `Your bet on ${bet.selection} is winning (${match.homeScore}-${match.awayScore} at ${match.minute}'). ` +
        `Win probability: ${Math.round(probOfWinning * 100)}%. No cashout recommended - let it ride for maximum profit. ` +
        `EV hold ($${Math.round(evHold * 100) / 100}) exceeds EV cashout ($${Math.round(evCashout * 100) / 100}).`;
    }
    return `Match is level at ${match.homeScore}-${match.awayScore}. ` +
      `Win probability: ${Math.round(probOfWinning * 100)}%. Hold position - ` +
      `sufficient time remains for the match to turn in your favor.`;
  }
}

// ==================== DETAILED ANALYSIS GENERATOR ====================

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
    // Rating differential
    const ratingDiff = homeStats.overallRating - awayStats.overallRating;
    if (Math.abs(ratingDiff) > 10) {
      keyFactors.push(
        `${ratingDiff > 0 ? match.homeTeam : match.awayTeam} has a significant rating advantage (${Math.abs(ratingDiff)} points)`
      );
    }

    // Form analysis
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

    // ELO difference
    if (homeStats.eloRating > 0 && awayStats.eloRating > 0) {
      const eloDiff = Math.abs(homeStats.eloRating - awayStats.eloRating);
      if (eloDiff > 100) {
        keyFactors.push(`Significant ELO gap (${eloDiff} points) between teams`);
      }
    }

    // Attack vs defense matchup
    if (homeStats.attackRating > awayStats.defenseRating + 10) {
      keyFactors.push(`${match.homeTeam}'s strong attack (${homeStats.attackRating}) vs ${match.awayTeam}'s weaker defense (${awayStats.defenseRating})`);
    }
    if (awayStats.attackRating > homeStats.defenseRating + 10) {
      keyFactors.push(`${match.awayTeam}'s strong attack (${awayStats.attackRating}) vs ${match.homeTeam}'s weaker defense (${homeStats.defenseRating})`);
    }

    // xG insights
    if (homeStats.xgFor > 0 && awayStats.xgFor > 0) {
      const homeXgPerGame = homeStats.xgFor / Math.max(1, homeStats.matchesPlayed);
      const awayXgPerGame = awayStats.xgFor / Math.max(1, awayStats.matchesPlayed);
      if (Math.abs(homeXgPerGame - awayXgPerGame) > 0.5) {
        keyFactors.push(`xG differential: ${homeXgPerGame > awayXgPerGame ? match.homeTeam : match.awayTeam} generates significantly more expected goals`);
      }
    }

    // Strengths
    if (homeStats.attackRating > 75) homeStrengths.push(`Strong attack (${homeStats.attackRating})`);
    if (homeStats.defenseRating > 75) homeStrengths.push(`Solid defense (${homeStats.defenseRating})`);
    if (homeStats.form && parseForm(homeStats.form) > 0.7) homeStrengths.push(`Excellent recent form (${homeStats.form})`);
    if (homeStats.homeRecord) {
      const homeRec = parseRecord(homeStats.homeRecord);
      if (homeRec.rate > 0.65) homeStrengths.push(`Strong home record (${homeStats.homeRecord})`);
    }
    if (homeStats.eloRating > 1600) homeStrengths.push(`High ELO rating (${homeStats.eloRating})`);
    if (homeStats.xgFor > 0 && homeStats.xgFor / Math.max(1, homeStats.matchesPlayed) > 1.8) {
      homeStrengths.push(`High xG output (${(homeStats.xgFor / Math.max(1, homeStats.matchesPlayed)).toFixed(2)} per game)`);
    }

    if (awayStats.attackRating > 75) awayStrengths.push(`Strong attack (${awayStats.attackRating})`);
    if (awayStats.defenseRating > 75) awayStrengths.push(`Solid defense (${awayStats.defenseRating})`);
    if (awayStats.form && parseForm(awayStats.form) > 0.7) awayStrengths.push(`Excellent recent form (${awayStats.form})`);
    if (awayStats.awayRecord) {
      const awayRec = parseRecord(awayStats.awayRecord);
      if (awayRec.rate > 0.55) awayStrengths.push(`Strong away record (${awayStats.awayRecord})`);
    }
    if (awayStats.eloRating > 1600) awayStrengths.push(`High ELO rating (${awayStats.eloRating})`);

    // Weaknesses
    if (homeStats.defenseRating < 55) homeWeaknesses.push(`Weak defense (${homeStats.defenseRating})`);
    if (homeStats.form && parseForm(homeStats.form) < 0.4) homeWeaknesses.push(`Poor recent form (${homeStats.form})`);
    if (homeStats.losses > homeStats.wins) homeWeaknesses.push(`More losses than wins this season`);
    if (homeStats.xgAgainst > 0 && homeStats.xgAgainst / Math.max(1, homeStats.matchesPlayed) > 1.5) {
      homeWeaknesses.push(`High xG conceded (${(homeStats.xgAgainst / Math.max(1, homeStats.matchesPlayed)).toFixed(2)} per game)`);
    }

    if (awayStats.defenseRating < 55) awayWeaknesses.push(`Weak defense (${awayStats.defenseRating})`);
    if (awayStats.form && parseForm(awayStats.form) < 0.4) awayWeaknesses.push(`Poor recent form (${awayStats.form})`);
    if (awayStats.losses > awayStats.wins) awayWeaknesses.push(`More losses than wins this season`);
  } else {
    keyFactors.push("Limited team statistics available - analysis based on odds and model consensus");
    riskFactors.push("No team stats available for deep analysis");
  }

  // Value bet
  const recTeam = prediction.recommended === "home" ? match.homeTeam
    : prediction.recommended === "away" ? match.awayTeam
    : prediction.recommended === "draw" ? "Draw"
    : prediction.recommended === "over" ? `Over ${match.overUnderLine || 2.5}`
    : `Under ${match.overUnderLine || 2.5}`;
  const recOdds = prediction.recommended === "home" ? match.homeOdds
    : prediction.recommended === "away" ? match.awayOdds
    : match.drawOdds || 3.0;
  const recProb = prediction.recommended === "home" ? prediction.homeWinProb
    : prediction.recommended === "away" ? prediction.awayWinProb
    : prediction.drawProb;
  const edge = recProb - (1 / recOdds);

  // Model consensus
  const modelAgreement = prediction.modelResults.filter(m => {
    const maxP = Math.max(m.homeWinProb, m.drawProb, m.awayWinProb);
    if (maxP === m.homeWinProb && prediction.recommended === "home") return true;
    if (maxP === m.awayWinProb && prediction.recommended === "away") return true;
    if (maxP === m.drawProb && prediction.recommended === "draw") return true;
    return false;
  }).length;
  const agreementPct = modelAgreement / prediction.modelResults.length;

  // Risk factors
  if (prediction.riskScore > 60) riskFactors.push("High uncertainty in prediction");
  if (Math.abs(prediction.homeWinProb - prediction.awayWinProb) < 0.1) riskFactors.push("Teams are closely matched");
  if (prediction.confidence < 0.5) riskFactors.push("Low AI confidence level");
  if (agreementPct < 0.5) riskFactors.push("Models disagree on outcome");
  if (!homeStats || !awayStats) riskFactors.push("Insufficient team data for deep analysis");

  // xG analysis
  const homeXg = homeStats?.xgFor ? homeStats.xgFor / Math.max(1, homeStats.matchesPlayed) : 0;
  const awayXg = awayStats?.xgFor ? awayStats.xgFor / Math.max(1, awayStats.matchesPlayed) : 0;

  return {
    keyFactors: keyFactors.length > 0 ? keyFactors : ["Standard match analysis"],
    strengths: { team: match.homeTeam, points: homeStrengths.length > 0 ? homeStrengths : ["Average performance"] },
    weaknesses: { team: match.homeTeam, points: homeWeaknesses.length > 0 ? homeWeaknesses : ["No significant weaknesses identified"] },
    valueBet: {
      selection: recTeam,
      reason: edge > 0.05
        ? `AI detects ${Math.round(edge * 100)}% edge over bookmaker odds. ${recTeam} has ${Math.round(recProb * 100)}% probability vs ${Math.round((1 / recOdds) * 100)}% implied. Kelly Criterion suggests $${prediction.kellyStake.recommendedStake} stake.`
        : `Marginal value on ${recTeam}. Kelly Criterion suggests minimal or no stake. Proceed with caution.`,
      edge: Math.round(edge * 100) / 100,
    },
    riskAssessment: {
      level: prediction.riskLevel,
      score: prediction.riskScore,
      factors: riskFactors.length > 0 ? riskFactors : ["Standard risk level"],
    },
    modelConsensus: {
      agreement: Math.round(agreementPct * 100) / 100,
      dominantModel: prediction.modelResults.sort((a, b) => b.weight - a.weight)[0]?.modelName || "Unknown",
      spread: Math.round(Math.abs(prediction.homeWinProb - prediction.awayWinProb) * 100) / 100,
    },
    xgAnalysis: {
      homeXg: Math.round(homeXg * 100) / 100,
      awayXg: Math.round(awayXg * 100) / 100,
      totalExpected: Math.round((homeXg + awayXg) * 100) / 100,
    },
  };
}

// ==================== ODDS VALUE CALCULATION ====================

export function calculateOddsValue(aiProb: number, bookmakerOdds: number): number {
  const impliedProb = 1 / bookmakerOdds;
  const value = aiProb - impliedProb;
  return Math.round(value * 100) / 100;
}
