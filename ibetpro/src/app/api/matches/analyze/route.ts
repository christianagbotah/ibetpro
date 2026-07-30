import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/session";
import { checkRateLimit, rateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";
import { validateInput, analyzeMatchSchema } from "@/lib/validation";
import { analyzeMatch } from "@/lib/ai-engine";

/**
 * POST /api/matches/analyze - Run on-demand AI analysis on a match
 * Returns detailed prediction, value bets, Kelly criterion, and risk assessment
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const rateLimit = checkRateLimit(user.id, RATE_LIMITS.standard);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rateLimit) });
    }

    const body = await request.json();
    const validation = validateInput(analyzeMatchSchema, body);
    if (!validation.success) return validation.error;

    const { matchId, forceRefresh } = validation.data;

    // Fetch the match
    const match = await prisma.match.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // If match already has AI analysis and forceRefresh is false, return cached
    if (match.aiConfidence && match.aiConfidence > 0 && !forceRefresh) {
      return NextResponse.json({
        cached: true,
        matchId: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        sport: match.sport,
        league: match.league,
        analysis: {
          homeWinProb: match.aiHomeWinProb,
          drawProb: match.aiDrawProb,
          awayWinProb: match.aiAwayWinProb,
          confidence: match.aiConfidence,
          recommended: match.aiRecommended,
          riskScore: match.aiRiskScore,
          riskLevel: match.aiRiskLevel,
          valueEdge: match.aiValueEdge,
          kellyStake: match.aiKellyStake,
          analysis: match.aiAnalysis,
        },
      }, { headers: rateLimitHeaders(rateLimit) });
    }

    // Fetch team stats from database
    const currentSeason = new Date().getFullYear().toString();
    const [homeStats, awayStats] = await Promise.all([
      prisma.teamStats.findFirst({
        where: { teamName: match.homeTeam, sport: match.sport, league: match.league, season: currentSeason },
      }),
      prisma.teamStats.findFirst({
        where: { teamName: match.awayTeam, sport: match.sport, league: match.league, season: currentSeason },
      }),
    ]);

    // Convert to format expected by AI engine
    const convertStats = (s: typeof homeStats) => s ? {
      teamName: s.teamName,
      sport: s.sport,
      league: s.league,
      matchesPlayed: s.matchesPlayed,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      goalsFor: s.goalsFor,
      goalsAgainst: s.goalsAgainst,
      form: s.form,
      homeRecord: s.homeRecord,
      awayRecord: s.awayRecord,
      attackRating: s.attackRating,
      defenseRating: s.defenseRating,
      overallRating: s.overallRating,
      keyPlayers: s.keyPlayers,
      xgFor: s.xgFor,
      xgAgainst: s.xgAgainst,
      eloRating: s.eloRating,
      shotsPerGame: s.shotsPerGame,
      shotsOnTargetPerGame: s.shotsOnTargetPerGame,
      possessionAvg: s.possessionAvg,
      cornersPerGame: s.cornersPerGame,
      cardsPerGame: s.cardsPerGame,
    } : null;

    // Run AI analysis
    const analysis = analyzeMatch(
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
      convertStats(homeStats),
      convertStats(awayStats),
      1000 // Default bankroll for analysis
    );

    // Save analysis to match for caching
    await prisma.match.update({
      where: { id: matchId },
      data: {
        aiHomeWinProb: analysis.homeWinProb,
        aiDrawProb: analysis.drawProb,
        aiAwayWinProb: analysis.awayWinProb,
        aiConfidence: analysis.confidence,
        aiRecommended: analysis.recommended,
        aiRiskScore: analysis.riskScore,
        aiRiskLevel: analysis.riskLevel,
        aiValueEdge: analysis.valueBets.length > 0 ? analysis.valueBets[0].edge : 0,
        aiKellyStake: analysis.kellyStake?.fraction ?? 0,
        aiAnalysis: analysis.analysis,
      },
    });

    return NextResponse.json({
      cached: false,
      matchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      sport: match.sport,
      league: match.league,
      analysis,
      teamStats: {
        home: homeStats ? { matchesPlayed: homeStats.matchesPlayed, form: homeStats.form, eloRating: homeStats.eloRating } : null,
        away: awayStats ? { matchesPlayed: awayStats.matchesPlayed, form: awayStats.form, eloRating: awayStats.eloRating } : null,
      },
    }, { headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    console.error("Match analysis error:", error);
    return NextResponse.json({ error: "Failed to analyze match" }, { status: 500 });
  }
}
