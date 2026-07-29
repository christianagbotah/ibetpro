import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

async function getDemoUserId(): Promise<string> {
  const user = await prisma.user.findFirst({ where: { email: "demo@ibetpro.com" } });
  return user?.id || "";
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || await getDemoUserId();
    const status = searchParams.get("status");

    if (!userId) {
      return NextResponse.json({ error: "No user found" }, { status: 404 });
    }

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
    console.error("Error fetching bets:", error);
    return NextResponse.json({ error: "Failed to fetch bets" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
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

    const uid = userId || await getDemoUserId();

    if (!uid || !bettingAccountId || !matchId || !betType || !selection || !odds || !stake) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const potentialWin = Math.round(odds * stake * 100) / 100;

    const bet = await prisma.bet.create({
      data: {
        userId: uid,
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
        userId: uid,
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
    console.error("Error creating bet:", error);
    return NextResponse.json({ error: "Failed to create bet" }, { status: 500 });
  }
}
