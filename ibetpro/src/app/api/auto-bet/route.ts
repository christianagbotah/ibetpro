import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/session";
import { analyzeMatch, calculateKellyCriterion, calculateOddsValue } from "@/lib/ai-engine";
import { runPreExecutionAnalysis } from "@/lib/pre-execution";
import { placeBetOnPlatform } from "@/lib/betting-platforms";
import { broadcastToUser } from "@/lib/sse";

/**
 * POST /api/auto-bet - Run the auto-betting engine for a user
 * Scans upcoming matches, runs AI analysis, and places bets that meet the user's criteria
 * This is the "brain" of the auto-betting system
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Get user settings
    const settings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });

    if (!settings?.autoBettingEnabled) {
      return NextResponse.json({ error: "Auto-betting is not enabled" }, { status: 400 });
    }

    // Get user's connected betting accounts
    const accounts = await prisma.bettingAccount.findMany({
      where: { userId: user.id, isConnected: true },
    });

    if (accounts.length === 0) {
      return NextResponse.json({ error: "No connected betting accounts" }, { status: 400 });
    }

    // Get upcoming matches that haven't been analyzed yet (or need refresh)
    const upcomingMatches = await prisma.match.findMany({
      where: {
        status: "upcoming",
        commenceTime: {
          gte: new Date(),
          lte: new Date(Date.now() + 24 * 60 * 60 * 1000), // Next 24 hours
        },
      },
      orderBy: { commenceTime: "asc" },
      take: 20,
    });

    const results: Array<{
      matchId: string;
      homeTeam: string;
      awayTeam: string;
      action: "placed" | "skipped" | "error";
      reason: string;
      betId?: string;
      stake?: number;
    }> = [];

    // Get user's current bankroll
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: { bankroll: true, balance: true },
    });

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check daily bet limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayBets = await prisma.bet.aggregate({
      where: {
        userId: user.id,
        placedAt: { gte: todayStart },
        isAutoPlaced: true,
      },
      _sum: { stake: true },
    });
    const dailyStaked = todayBets._sum.stake || 0;

    if (dailyStaked >= settings.dailyBetLimit) {
      return NextResponse.json({
        message: "Daily auto-bet limit reached",
        dailyStaked,
        dailyLimit: settings.dailyBetLimit,
        results: [],
      });
    }

    // Process each match
    for (const match of upcomingMatches) {
      // Skip if already have a pending bet on this match
      const existingBet = await prisma.bet.findFirst({
        where: { userId: user.id, matchId: match.id, status: "pending" },
      });
      if (existingBet) continue;

      // Check if sport is in preferred sports
      const preferredSports = settings.preferredSports.split(",");
      const matchSport = match.sport.includes("_") ? match.sport.split("_")[0] : match.sport;
      if (!preferredSports.includes(matchSport) && !preferredSports.includes(match.sport)) continue;

      // Fetch team stats
      const currentSeason = new Date().getFullYear().toString();
      const [homeStats, awayStats] = await Promise.all([
        prisma.teamStats.findFirst({
          where: { teamName: match.homeTeam, sport: match.sport, league: match.league, season: currentSeason },
        }),
        prisma.teamStats.findFirst({
          where: { teamName: match.awayTeam, sport: match.sport, league: match.league, season: currentSeason },
        }),
      ]);

      const convertStats = (s: typeof homeStats) => s ? {
        teamName: s.teamName, sport: s.sport, league: s.league, matchesPlayed: s.matchesPlayed,
        wins: s.wins, draws: s.draws, losses: s.losses, goalsFor: s.goalsFor, goalsAgainst: s.goalsAgainst,
        form: s.form, homeRecord: s.homeRecord, awayRecord: s.awayRecord, attackRating: s.attackRating,
        defenseRating: s.defenseRating, overallRating: s.overallRating, keyPlayers: s.keyPlayers,
        xgFor: s.xgFor, xgAgainst: s.xgAgainst, eloRating: s.eloRating, shotsPerGame: s.shotsPerGame,
        shotsOnTargetPerGame: s.shotsOnTargetPerGame, possessionAvg: s.possessionAvg,
        cornersPerGame: s.cornersPerGame, cardsPerGame: s.cardsPerGame,
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
          status: match.status,
        },
        convertStats(homeStats),
        convertStats(awayStats),
        userData.bankroll
      );

      // Find the best value bet
      const bestValueBet = analysis.valueBets.length > 0 ? analysis.valueBets[0] : null;

      if (!bestValueBet) {
        results.push({
          matchId: match.id,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          action: "skipped",
          reason: "No value bets found",
        });
        continue;
      }

      // Check if the edge meets minimum threshold
      if (bestValueBet.edge < settings.minEdgeThreshold) {
        results.push({
          matchId: match.id,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          action: "skipped",
          reason: `Edge ${((bestValueBet.edge * 100).toFixed(1))}% below threshold ${(settings.minEdgeThreshold * 100).toFixed(1)}%`,
        });
        continue;
      }

      // Check odds are within range
      if (bestValueBet.odds < settings.minOddsThreshold || bestValueBet.odds > settings.maxOddsThreshold) {
        results.push({
          matchId: match.id,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          action: "skipped",
          reason: `Odds ${bestValueBet.odds} outside range [${settings.minOddsThreshold}, ${settings.maxOddsThreshold}]`,
        });
        continue;
      }

      // Calculate Kelly stake
      const kellyResult = calculateKellyCriterion(
        bestValueBet.aiProb,
        bestValueBet.odds,
        userData.bankroll,
        settings.kellyFraction
      );

      const stake = Math.min(
        kellyResult.recommendedStake,
        settings.maxBetAmount,
        settings.dailyBetLimit - dailyStaked,
        userData.bankroll * 0.1 // Never more than 10% of bankroll
      );

      if (stake < 1) {
        results.push({
          matchId: match.id,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          action: "skipped",
          reason: `Calculated stake $${stake.toFixed(2)} too low`,
        });
        continue;
      }

      // Select the best account for this bet
      const bestAccount = accounts.find(a => a.balance >= stake) || accounts[0];

      // Run pre-execution analysis
      try {
        const preExec = await runPreExecutionAnalysis(
          user.id,
          match.id,
          bestValueBet.selection,
          stake,
          bestAccount.id
        );

        if (!preExec.canExecute) {
          results.push({
            matchId: match.id,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            action: "skipped",
            reason: `Pre-execution blocked: ${preExec.signal.reasons.join(", ")}`,
          });
          continue;
        }

        // Place the bet on the platform
        const platformResult = await placeBetOnPlatform(
          bestAccount.platform,
          bestAccount.accessToken || "",
          {
            matchId: match.id,
            selection: bestValueBet.selection,
            odds: bestValueBet.odds,
            stake,
            betType: "match_winner",
          }
        );

        if (!platformResult.success) {
          results.push({
            matchId: match.id,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            action: "error",
            reason: `Platform error: ${platformResult.error}`,
          });
          continue;
        }

        // Create the bet record
        const bet = await prisma.bet.create({
          data: {
            userId: user.id,
            bettingAccountId: bestAccount.id,
            matchId: match.id,
            betType: "match_winner",
            selection: bestValueBet.selection,
            odds: bestValueBet.odds,
            stake,
            potentialWin: bestValueBet.odds * stake,
            isAutoPlaced: true,
            aiConfidence: analysis.confidence,
            aiReasoning: `Auto-bet: ${bestValueBet.selection} — edge ${(bestValueBet.edge * 100).toFixed(1)}%, confidence ${(analysis.confidence * 100).toFixed(0)}%`,
            aiModelUsed: "auto-bet-ensemble",
            kellyStake: kellyResult.recommendedStake,
            valueEdge: bestValueBet.edge,
            riskScore: analysis.riskScore,
          },
        });

        // Update match AI data
        await prisma.match.update({
          where: { id: match.id },
          data: {
            aiHomeWinProb: analysis.homeWinProb,
            aiDrawProb: analysis.drawProb,
            aiAwayWinProb: analysis.awayWinProb,
            aiConfidence: analysis.confidence,
            aiRecommended: analysis.recommended,
            aiRiskScore: analysis.riskScore,
            aiRiskLevel: analysis.riskLevel,
            aiValueEdge: bestValueBet.edge,
            aiKellyStake: kellyResult.recommendedStake,
            aiAnalysis: analysis.analysis,
          },
        });

        // Notify user via SSE
        broadcastToUser(user.id, {
          event: "auto_bet_placed",
          data: {
            betId: bet.id,
            match: `${match.homeTeam} vs ${match.awayTeam}`,
            selection: bestValueBet.selection,
            odds: bestValueBet.odds,
            stake,
            confidence: analysis.confidence,
            edge: bestValueBet.edge,
          },
          timestamp: Date.now(),
        });

        results.push({
          matchId: match.id,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          action: "placed",
          reason: `Bet placed: ${bestValueBet.selection} @ ${bestValueBet.odds} — $${stake.toFixed(2)}`,
          betId: bet.id,
          stake,
        });
      } catch (error) {
        results.push({
          matchId: match.id,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          action: "error",
          reason: `Pre-execution error: ${error instanceof Error ? error.message : "Unknown"}`,
        });
      }
    }

    // Update AI analysis cache for matches that were skipped
    for (const match of upcomingMatches) {
      await prisma.match.update({
        where: { id: match.id },
        data: { lastSyncedAt: new Date() },
      }).catch(() => {}); // Ignore errors on cache update
    }

    const placed = results.filter(r => r.action === "placed").length;
    const skipped = results.filter(r => r.action === "skipped").length;
    const errors = results.filter(r => r.action === "error").length;

    return NextResponse.json({
      success: true,
      summary: {
        matchesAnalyzed: upcomingMatches.length,
        betsPlaced: placed,
        betsSkipped: skipped,
        errors,
        dailyStaked: dailyStaked + results.filter(r => r.action === "placed").reduce((sum, r) => sum + (r.stake || 0), 0),
        dailyLimit: settings.dailyBetLimit,
      },
      results,
    });
  } catch (error) {
    console.error("Auto-bet error:", error);
    return NextResponse.json({ error: "Auto-bet engine failed" }, { status: 500 });
  }
}
