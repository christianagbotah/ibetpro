import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "demo-user";
    const status = searchParams.get("status");

    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;

    const bets = await db.bet.findMany({
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

    if (!userId || !bettingAccountId || !matchId || !betType || !selection || !odds || !stake) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const potentialWin = Math.round(odds * stake * 100) / 100;

    const bet = await db.bet.create({
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
    await db.transaction.create({
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
    console.error("Error creating bet:", error);
    return NextResponse.json({ error: "Failed to create bet" }, { status: 500 });
  }
}
