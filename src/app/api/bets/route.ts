import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;

    const bets = await prisma.bet.findMany({
      where,
      include: {
        match: true,
        bettingAccount: true,
      },
      orderBy: {
        placedAt: "desc",
      },
    });

    return NextResponse.json(bets);
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Error fetching bets:", error);
    return NextResponse.json({ error: "Failed to fetch bets" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();

    const body = await request.json();
    let {
      bettingAccountId,
      matchId,
      betType,
      selection,
      odds,
      stake,
      isAutoPlaced = false,
      aiConfidence,
      aiReasoning,
    } = body;

    if (!matchId || !betType || !selection || !odds || !stake) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Auto-create a simulated betting account if user doesn't have one
    if (!bettingAccountId) {
      let simulatedAccount = await prisma.bettingAccount.findFirst({
        where: { userId, platform: "simulated" },
      });
      if (!simulatedAccount) {
        simulatedAccount = await prisma.bettingAccount.create({
          data: {
            userId,
            platform: "simulated",
            accountId: `sim_${userId.slice(0, 8)}_${Date.now()}`,
            accountName: "Simulated Account",
            balance: 0,
            currency: "USD",
            isConnected: true,
            brokerType: "manual",
            lastSyncedAt: new Date(),
          },
        });
      }
      bettingAccountId = simulatedAccount.id;
    }

    const potentialWin = Math.round(odds * stake * 100) / 100;

    const bet = await prisma.bet.create({
      data: {
        userId,
        bettingAccountId,
        matchId,
        betType,
        selection,
        odds,
        stake,
        potentialWin,
        isAutoPlaced,
        aiConfidence: aiConfidence || 0,
        aiReasoning: aiReasoning || null,
      },
      include: {
        match: true,
        bettingAccount: true,
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
        description: `${bet.match?.homeTeam || "Match"} vs ${bet.match?.awayTeam || "Opponent"} - ${selection}`,
        betId: bet.id,
      },
    });

    return NextResponse.json(bet, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Error creating bet:", error);
    return NextResponse.json({ error: "Failed to create bet" }, { status: 500 });
  }
}
