import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/session";
import { checkRateLimit, rateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";
import { validateInput, analyzeMatchSchema } from "@/lib/validation";
import { analyzeMatch, calculatePoissonProbabilities, calculateOverUnderProbabilities, calculateKellyCriterion, generateDetailedAnalysis } from "@/lib/ai-engine";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const rateLimit = checkRateLimit(user.id, RATE_LIMITS.ai);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded", retryAfter: rateLimit.retryAfter }, { status: 429, headers: rateLimitHeaders(rateLimit) });
    }

    const body = await request.json();
    const validation = validateInput(analyzeMatchSchema, body);
    if (!validation.success) return validation.error;

    const { matchId, forceRefresh } = validation.data;

    const match = await prisma.match.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // Get user's bankroll for Kelly criterion
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    const bankroll = dbUser?.bankroll || 1000;

    // Get team stats
    const homeTeamStats = await prisma.teamStats.findFirst({
      where: {
        teamName: match.homeTeam,
        sport: match.sport,
      },
    });

    const awayTeamStats = await prisma.teamStats.findFirst({
      where: {
        teamName: match.awayTeam,
        sport: match.sport,
      },
    });

    // Transform team stats for AI engine
    const homeStatsForAI = homeTeamStats ? {
      teamName: homeTeamStats.teamName,
      sport: homeTeamStats.sport,
      league: homeTeamStats.league,
      matchesPlayed: homeTeamStats.matchesPlayed,
      wins: homeTeamStats.wins,
      draws: homeTeamStats.draws,
      losses: homeTeamStats.losses,
      goalsFor: homeTeamStats.goalsFor,
      goalsAgainst: homeTeamStats.goalsAgainst,
      form: homeTeamStats.form,
      homeRecord: homeTeamStats.homeRecord,
      awayRecord: homeTeamStats.awayRecord,
      attackRating: homeTeamStats.attackRating,
      defenseRating: homeTeamStats.defenseRating,
      overallRating: homeTeamStats.overallRating,
      keyPlayers: homeTeamStats.keyPlayers,
      xgFor: homeTeamStats.xgFor,
      xgAgainst: homeTeamStats.xgAgainst,
      eloRating: homeTeamStats.eloRating,
      shotsPerGame: homeTeamStats.shotsPerGame,
      shotsOnTargetPerGame: homeTeamStats.shotsOnTargetPerGame,
      possessionAvg: homeTeamStats.possessionAvg,
      cornersPerGame: homeTeamStats.cornersPerGame,
      cardsPerGame: homeTeamStats.cardsPerGame,
    } : null;

    const awayStatsForAI = awayTeamStats ? {
      teamName: awayTeamStats.teamName,
      sport: awayTeamStats.sport,
      league: awayTeamStats.league,
      matchesPlayed: awayTeamStats.matchesPlayed,
      wins: awayTeamStats.wins,
      draws: awayTeamStats.draws,
      losses: awayTeamStats.losses,
      goalsFor: awayTeamStats.goalsFor,
      goalsAgainst: awayTeamStats.goalsAgainst,
      form: awayTeamStats.form,
      homeRecord: awayTeamStats.homeRecord,
      awayRecord: awayTeamStats.awayRecord,
      attackRating: awayTeamStats.attackRating,
      defenseRating: awayTeamStats.defenseRating,
      overallRating: awayTeamStats.overallRating,
      keyPlayers: awayTeamStats.keyPlayers,
      xgFor: awayTeamStats.xgFor,
      xgAgainst: awayTeamStats.xgAgainst,
      eloRating: awayTeamStats.eloRating,
      shotsPerGame: awayTeamStats.shotsPerGame,
      shotsOnTargetPerGame: awayTeamStats.shotsOnTargetPerGame,
      possessionAvg: awayTeamStats.possessionAvg,
      cornersPerGame: awayTeamStats.cornersPerGame,
      cardsPerGame: awayTeamStats.cardsPerGame,
    } : null;

    // Run multi-model AI analysis
    const prediction = analyzeMatch(
      {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        sport: match.sport,
        league: match.league,
        homeOdds: match.homeOdds,
        drawOdds: match.drawOdds ?? undefined,
        awayOdds: match.awayOdds,
        overUnderLine: match.overUnderLine ?? undefined,
        overOdds: match.overOdds ?? undefined,
        underOdds: match.underOdds ?? undefined,
        status: match.status,
      },
      homeStatsForAI,
      awayStatsForAI,
      bankroll || 1000
    );

    // If not forcing refresh and match already has AI analysis, return cached
    if (!forceRefresh && match.aiConfidence && match.aiConfidence > 0) {
      return NextResponse.json({
        matchId,
        prediction: {
          homeWinProb: match.aiHomeWinProb,
          drawProb: match.aiDrawProb,
          awayWinProb: match.aiAwayWinProb,
          confidence: match.aiConfidence,
          recommended: match.aiRecommended,
          analysis: match.aiAnalysis,
          riskScore: match.aiRiskScore,
          riskLevel: match.aiRiskLevel,
        },
        cached: true,
      }, { headers: rateLimitHeaders(rateLimit) });
    }

    // Calculate Poisson probabilities
    const poissonResult = calculatePoissonProbabilities(homeStatsForAI, awayStatsForAI);

    // Calculate over/under probabilities
    const totalExpected = poissonResult.expectedHomeGoals + poissonResult.expectedAwayGoals;
    const overUnderResult = match.overUnderLine
      ? calculateOverUnderProbabilities(totalExpected, match.overUnderLine)
      : null;

    // Generate detailed analysis
    const detailedAnalysis = generateDetailedAnalysis(
      {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        sport: match.sport,
        league: match.league,
        homeOdds: match.homeOdds,
        drawOdds: match.drawOdds ?? undefined,
        awayOdds: match.awayOdds,
        overUnderLine: match.overUnderLine ?? undefined,
        overOdds: match.overOdds ?? undefined,
        underOdds: match.underOdds ?? undefined,
        status: match.status,
      },
      homeStatsForAI,
      awayStatsForAI,
      prediction
    );

    // Update match with AI analysis
    await prisma.match.update({
      where: { id: matchId },
      data: {
        aiHomeWinProb: prediction.homeWinProb,
        aiDrawProb: prediction.drawProb,
        aiAwayWinProb: prediction.awayWinProb,
        aiConfidence: prediction.confidence,
        aiRecommended: prediction.recommended,
        aiAnalysis: prediction.analysis,
        aiRiskScore: prediction.riskScore,
        aiRiskLevel: prediction.riskLevel,
        aiValueEdge: prediction.valueBets.length > 0 ? prediction.valueBets[0].edge : 0,
        aiKellyStake: prediction.kellyStake.recommendedStake,
      },
    });

    return NextResponse.json({
      matchId,
      prediction,
      poissonResult,
      overUnderResult,
      detailedAnalysis,
      homeTeamStats: homeStatsForAI,
      awayTeamStats: awayStatsForAI,
    });
  } catch (error) {
    console.error("Error analyzing match:", error);
    return NextResponse.json({ error: "Failed to analyze match" }, { status: 500 });
  }
}
