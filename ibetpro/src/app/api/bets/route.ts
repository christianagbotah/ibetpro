import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, requireAuth } from "@/lib/session";
import { analyzeMatch } from "@/lib/ai-engine";

// GET /api/bets - List bets for authenticated user
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = searchParams.get("limit");

    const where: Record<string, unknown> = { userId: user.id };
    if (status) where.status = status;

    const bets = await prisma.bet.findMany({
      where,
      include: {
        match: {
          select: {
            homeTeam: true,
            awayTeam: true,
            sport: true,
            league: true,
            status: true,
            homeScore: true,
            awayScore: true,
            minute: true,
          },
        },
        bettingAccount: {
          select: { platform: true },
        },
      },
      orderBy: { placedAt: "desc" },
      ...(limit ? { take: parseInt(limit, 10) } : {}),
    });

    return NextResponse.json(bets);
  } catch (error) {
    console.error("Error fetching bets:", error);
    return NextResponse.json({ error: "Failed to fetch bets" }, { status: 500 });
  }
}

// POST /api/bets - Place a new bet
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();

    const body = await request.json();
    const {
      matchId,
      bettingAccountId,
      betType,
      selection,
      odds,
      stake,
      isAutoPlaced,
      aiConfidence,
    } = body;

    // Validate required fields
    if (!matchId || !betType || !selection || !odds || !stake) {
      return NextResponse.json(
        { error: "Match ID, bet type, selection, odds, and stake are required" },
        { status: 400 }
      );
    }

    // Get user settings for validation
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    // Validate stake against settings
    const maxBet = userSettings?.maxBetAmount || 200;
    const dailyLimit = userSettings?.dailyBetLimit || 500;

    if (stake > maxBet) {
      return NextResponse.json(
        { error: `Stake exceeds maximum bet amount of $${maxBet}` },
        { status: 400 }
      );
    }

    // Check daily bet limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayBets = await prisma.bet.aggregate({
      where: {
        userId,
        placedAt: { gte: today },
        status: { in: ["pending", "won", "lost"] },
      },
      _sum: { stake: true },
    });

    if ((todayBets._sum.stake || 0) + stake > dailyLimit) {
      return NextResponse.json(
        { error: `Daily bet limit of $${dailyLimit} would be exceeded` },
        { status: 400 }
      );
    }

    // Validate bankroll (max 10% per bet)
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user && stake > user.bankroll * 0.1) {
      return NextResponse.json(
        { error: `Stake cannot exceed 10% of bankroll ($${(user.bankroll * 0.1).toFixed(2)})` },
        { status: 400 }
      );
    }

    // Get or create betting account
    let account = bettingAccountId
      ? await prisma.bettingAccount.findUnique({ where: { id: bettingAccountId } })
      : null;

    if (!account) {
      // Find first connected account
      account = await prisma.bettingAccount.findFirst({
        where: { userId, isConnected: true },
      });
    }

    if (!account) {
      // Create a default account
      account = await prisma.bettingAccount.create({
        data: {
          userId,
          platform: "manual",
          accountId: `manual-${userId.slice(0, 8)}`,
          accountName: "Manual Entry",
          isConnected: true,
          balance: user?.bankroll || 1000,
        },
      });
    }

    // Get match for AI analysis
    const match = await prisma.match.findUnique({ where: { id: matchId } });
    const homeTeamStats = match
      ? await prisma.teamStats.findFirst({ where: { teamName: match.homeTeam, sport: match.sport } })
      : null;
    const awayTeamStats = match
      ? await prisma.teamStats.findFirst({ where: { teamName: match.awayTeam, sport: match.sport } })
      : null;

    // Run AI analysis if auto-placed
    let aiReasoning = "";
    let kellyStake = 0;
    let valueEdge = 0;
    let riskScore = 50;

    if (isAutoPlaced && match) {
      const prediction = analyzeMatch(
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
        homeTeamStats,
        awayTeamStats,
        user?.bankroll || 1000
      );

      aiReasoning = prediction.analysis;
      kellyStake = prediction.kellyStake.recommendedStake;
      valueEdge = prediction.valueBets.length > 0 ? prediction.valueBets[0].edge : 0;
      riskScore = prediction.riskScore;
    }

    // Create the bet
    const potentialWin = odds * stake;

    const bet = await prisma.bet.create({
      data: {
        userId,
        bettingAccountId: account.id,
        matchId,
        betType,
        selection,
        odds,
        stake,
        potentialWin,
        status: "pending",
        isAutoPlaced: isAutoPlaced || false,
        aiConfidence: aiConfidence || 0,
        aiReasoning: aiReasoning || null,
        aiModelUsed: "ensemble",
        kellyStake,
        valueEdge,
        riskScore,
      },
    });

    // Create transaction
    await prisma.transaction.create({
      data: {
        userId,
        type: "bet_placed",
        amount: -stake,
        currency: "USD",
        status: "completed",
        description: `Bet on ${selection} @ ${odds} - ${match?.homeTeam || "Unknown"} vs ${match?.awayTeam || "Unknown"}`,
        betId: bet.id,
      },
    });

    // Update user balance
    await prisma.user.update({
      where: { id: userId },
      data: { balance: { decrement: stake } },
    });

    return NextResponse.json(bet, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Error placing bet:", error);
    return NextResponse.json({ error: "Failed to place bet" }, { status: 500 });
  }
}
