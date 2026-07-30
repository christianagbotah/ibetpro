import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/session";
import { checkRateLimit, rateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";
import { validateInput, createBetSchema } from "@/lib/validation";
import { runPreExecutionAnalysis } from "@/lib/pre-execution";
import { placeBetOnPlatform } from "@/lib/betting-platforms";

/**
 * GET /api/bets - Get all bets for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const rateLimit = checkRateLimit(user.id, RATE_LIMITS.standard);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rateLimit) });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where: { userId: string; status?: string } = { userId: user.id };
    if (status) where.status = status;

    const bets = await prisma.bet.findMany({
      where,
      include: {
        match: {
          select: {
            id: true,
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
    });

    return NextResponse.json(bets, { headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    console.error("Error fetching bets:", error);
    return NextResponse.json({ error: "Failed to fetch bets" }, { status: 500 });
  }
}

/**
 * POST /api/bets - Create a new bet with pre-execution analysis
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const rateLimit = checkRateLimit(user.id, RATE_LIMITS.betting);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rateLimit) });
    }

    const body = await request.json();
    const validation = validateInput(createBetSchema, body);
    if (!validation.success) return validation.error;

    const { matchId, bettingAccountId, betType, selection, odds, stake, isAutoPlaced, aiConfidence } = validation.data;

    // Run pre-execution analysis before placing the bet
    const preExecResult = await runPreExecutionAnalysis(
      user.id,
      matchId,
      selection,
      stake,
      bettingAccountId
    );

    // If pre-execution says no-go, block the bet
    if (!preExecResult.canExecute) {
      return NextResponse.json({
        error: "Bet blocked by pre-execution analysis",
        preExecution: preExecResult,
      }, { status: 400 });
    }

    // Verify the betting account belongs to the user
    const account = await prisma.bettingAccount.findUnique({
      where: { id: bettingAccountId },
    });

    if (!account || account.userId !== user.id) {
      return NextResponse.json({ error: "Invalid betting account" }, { status: 400 });
    }

    // Place bet on the platform
    const platformResult = await placeBetOnPlatform(account.platform, account.accessToken || "", {
      matchId,
      selection,
      odds,
      stake,
      betType,
    });

    if (!platformResult.success) {
      return NextResponse.json({
        error: platformResult.error || "Failed to place bet on platform",
        platform: account.platform,
      }, { status: 502 });
    }

    // Create the bet record
    const bet = await prisma.bet.create({
      data: {
        userId: user.id,
        bettingAccountId,
        matchId,
        betType,
        selection,
        odds,
        stake,
        potentialWin: odds * stake,
        isAutoPlaced: isAutoPlaced ?? false,
        aiConfidence: aiConfidence ?? preExecResult.signal.confidence,
        aiReasoning: preExecResult.signal.reasons.join("; "),
        aiModelUsed: "pre-execution-ensemble",
        kellyStake: preExecResult.stakeRecommendation.recommendedStake,
        valueEdge: preExecResult.signal.edge,
        riskScore: preExecResult.signal.riskScore,
      },
    });

    return NextResponse.json({
      bet,
      preExecution: preExecResult,
      platformResult,
    }, { status: 201, headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    console.error("Error creating bet:", error);
    return NextResponse.json({ error: "Failed to create bet" }, { status: 500 });
  }
}
