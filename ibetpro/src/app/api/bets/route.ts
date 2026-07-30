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
      aiModelUsed,
      kellyStake,
      valueEdge,
      riskScore,
    } = body;

    const uid = userId || await getDemoUserId();

    if (!uid || !bettingAccountId || !matchId || !betType || !selection || !odds || !stake) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Validate stake against user's bankroll
    const user = await prisma.user.findUnique({
      where: { id: uid },
      include: { settings: true },
    });
    if (user && stake > user.bankroll * 0.10) {
      return NextResponse.json({
        error: `Stake exceeds 10% of bankroll. Maximum allowed: $${Math.round(user.bankroll * 0.10 * 100) / 100}`,
        maxStake: Math.round(user.bankroll * 0.10 * 100) / 100,
      }, { status: 400 });
    }

    const potentialWin = Math.round(odds * stake * 100) / 100;

    // Calculate commission on profit
    const potentialProfit = potentialWin - stake;
    const commissionRate = user?.settings?.commissionRate || 0.10;
    const commission = potentialProfit > 0 ? Math.round(potentialProfit * commissionRate * 100) / 100 : 0;

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
        commission,
        isAutoPlaced,
        aiConfidence: aiConfidence || 0,
        aiReasoning: aiReasoning || null,
        aiModelUsed: aiModelUsed || "ensemble",
        kellyStake: kellyStake || 0,
        valueEdge: valueEdge || 0,
        riskScore: riskScore || 50,
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

    // Update user balance
    if (user) {
      await prisma.user.update({
        where: { id: uid },
        data: { balance: { decrement: stake } },
      });
    }

    return NextResponse.json(bet, { status: 201 });
  } catch (error) {
    console.error("Error creating bet:", error);
    return NextResponse.json({ error: "Failed to create bet" }, { status: 500 });
  }
}

/**
 * Settle a bet - called when a match finishes
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { betId, status, profit } = body;

    if (!betId || !status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const bet = await prisma.bet.findUnique({
      where: { id: betId },
      include: { user: { include: { settings: true } } },
    });

    if (!bet) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }

    const commissionRate = bet.user.settings?.commissionRate || 0.10;
    const actualProfit = profit || (status === "won" ? bet.potentialWin - bet.stake : 0);
    const commission = actualProfit > 0 ? Math.round(actualProfit * commissionRate * 100) / 100 : 0;
    const netProfit = actualProfit - commission;

    // Update bet
    const updatedBet = await prisma.bet.update({
      where: { id: betId },
      data: {
        status,
        profit: netProfit,
        commission,
        settledAt: new Date(),
      },
    });

    // Update user stats
    if (status === "won") {
      await prisma.user.update({
        where: { id: bet.userId },
        data: {
          balance: { increment: bet.stake + netProfit },
          totalProfit: { increment: actualProfit },
          commissionPaid: { increment: commission },
        },
      });

      // Create transaction for winnings
      await prisma.transaction.create({
        data: {
          userId: bet.userId,
          type: "bet_won",
          amount: netProfit,
          currency: "USD",
          status: "completed",
          description: `Bet won - ${bet.selection}`,
          betId: bet.id,
        },
      });

      // Create commission transaction
      if (commission > 0) {
        await prisma.transaction.create({
          data: {
            userId: bet.userId,
            type: "commission",
            amount: commission,
            currency: "USD",
            status: "completed",
            description: `${Math.round(commissionRate * 100)}% commission on profit`,
            betId: bet.id,
          },
        });

        // Credit commission to admin
        const admin = await prisma.user.findFirst({ where: { role: "admin" } });
        if (admin) {
          await prisma.user.update({
            where: { id: admin.id },
            data: {
              balance: { increment: commission },
              totalProfit: { increment: commission },
            },
          });
        }
      }
    } else if (status === "lost") {
      await prisma.user.update({
        where: { id: bet.userId },
        data: {
          totalLoss: { increment: bet.stake },
        },
      });
    } else if (status === "cashed_out") {
      const cashoutAmount = bet.cashoutAmount || bet.stake * 0.5;
      const cashoutProfit = cashoutAmount - bet.stake;
      const cashoutCommission = cashoutProfit > 0 ? Math.round(cashoutProfit * commissionRate * 100) / 100 : 0;

      await prisma.user.update({
        where: { id: bet.userId },
        data: {
          balance: { increment: cashoutAmount - cashoutCommission },
          totalProfit: cashoutProfit > 0 ? { increment: cashoutProfit } : undefined,
          totalLoss: cashoutProfit < 0 ? { increment: Math.abs(cashoutProfit) } : undefined,
          commissionPaid: cashoutCommission > 0 ? { increment: cashoutCommission } : undefined,
        },
      });
    }

    return NextResponse.json(updatedBet);
  } catch (error) {
    console.error("Error settling bet:", error);
    return NextResponse.json({ error: "Failed to settle bet" }, { status: 500 });
  }
}
