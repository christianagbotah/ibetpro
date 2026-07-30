import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { shouldCashout } from "@/lib/ai-engine";

/**
 * Cashout Execution API
 * POST /api/cashout - Execute a cashout (full or partial), update balance, create transaction
 * GET /api/cashout - Get cashout recommendation for a bet
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { betId, cashoutType = "full" } = body; // "full" | "partial"

    if (!betId) {
      return NextResponse.json({ error: "Bet ID required" }, { status: 400 });
    }

    const bet = await prisma.bet.findUnique({
      where: { id: betId },
      include: {
        match: true,
        user: { include: { settings: true } },
      },
    });

    if (!bet) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }

    if (bet.status !== "pending" && bet.status !== "partial_cashout") {
      return NextResponse.json({ error: `Cannot cash out a bet with status: ${bet.status}` }, { status: 400 });
    }

    if (!bet.match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const match = bet.match;
    const userSettings = bet.user.settings;

    // Get cashout recommendation
    const cashoutRec = shouldCashout(
      {
        selection: bet.selection,
        odds: bet.odds,
        stake: bet.stake,
        potentialWin: bet.potentialWin,
        status: bet.status,
        partialCashoutAmount: bet.partialCashoutAmount,
        partialCashoutPercent: bet.partialCashoutPercent,
      },
      {
        homeScore: match.homeScore ?? 0,
        awayScore: match.awayScore ?? 0,
        minute: match.minute ?? 0,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        sport: match.sport,
        status: match.status,
      },
      userSettings ? {
        autoCashoutEnabled: userSettings.autoCashoutEnabled,
        cashoutThreshold: userSettings.cashoutThreshold,
        waitFullSettlement: userSettings.waitFullSettlement,
        partialCashoutEnabled: userSettings.partialCashoutEnabled,
        partialCashoutPercent: userSettings.partialCashoutPercent,
      } : undefined
    );

    const now = new Date();
    const effectiveStake = bet.partialCashoutAmount ? bet.stake - bet.partialCashoutAmount : bet.stake;

    if (cashoutType === "partial" && cashoutRec.partialCashoutAmount > 0 && userSettings?.partialCashoutEnabled) {
      // Partial cashout
      const partialAmount = cashoutRec.partialCashoutAmount;
      const partialPercent = userSettings?.partialCashoutPercent || 0.5;

      // Update bet with partial cashout
      const updatedBet = await prisma.bet.update({
        where: { id: betId },
        data: {
          status: "partial_cashout",
          partialCashoutAmount: (bet.partialCashoutAmount || 0) + partialAmount,
          partialCashoutPercent: partialPercent,
          cashoutAmount: partialAmount,
          cashedOutAt: now,
          settlementReason: "partial_cashout",
        },
      });

      // Update user balance
      await prisma.user.update({
        where: { id: bet.userId },
        data: { balance: { increment: partialAmount } },
      });

      // Create transaction
      await prisma.transaction.create({
        data: {
          userId: bet.userId,
          type: "partial_cashout",
          amount: partialAmount,
          currency: "USD",
          status: "completed",
          description: `Partial cashout: ${match.homeTeam} vs ${match.awayTeam} - ${bet.selection} (${Math.round(partialPercent * 100)}%)`,
          betId: bet.id,
        },
      });

      // Log bot action
      await prisma.botLog.create({
        data: {
          userId: bet.userId,
          action: "cashout_executed",
          betId: bet.id,
          matchId: match.id,
          details: JSON.stringify({ type: "partial", amount: partialAmount, percent: partialPercent }),
          reasoning: cashoutRec.reasoning,
          confidence: cashoutRec.settlementProbability,
          profitImpact: partialAmount - effectiveStake * partialPercent,
        },
      });

      return NextResponse.json({
        success: true,
        cashoutType: "partial",
        amount: partialAmount,
        percent: partialPercent,
        betStatus: updatedBet.status,
        cashoutRec,
      });
    } else {
      // Full cashout
      const cashoutAmount = cashoutRec.cashoutAmount;

      // Calculate profit
      const profit = cashoutAmount - effectiveStake;
      const commission = profit > 0 ? profit * (userSettings?.commissionRate || 0.10) : 0;
      const netProfit = profit - commission;

      // Update bet
      const updatedBet = await prisma.bet.update({
        where: { id: betId },
        data: {
          status: "cashed_out",
          cashoutAmount,
          cashoutOdds: cashoutAmount / effectiveStake,
          profit: Math.round(netProfit * 100) / 100,
          commission: Math.round(commission * 100) / 100,
          settledAt: now,
          cashedOutAt: now,
          settlementReason: "cashout",
        },
      });

      // Update user balance and PnL
      const balanceUpdate = cashoutAmount;
      await prisma.user.update({
        where: { id: bet.userId },
        data: {
          balance: { increment: balanceUpdate },
          totalProfit: netProfit > 0 ? { increment: netProfit } : undefined,
          totalLoss: netProfit < 0 ? { increment: Math.abs(netProfit) } : undefined,
          commissionPaid: { increment: commission },
          dailyPnl: { increment: netProfit },
          weeklyPnl: { increment: netProfit },
        },
      });

      // Create transaction
      await prisma.transaction.create({
        data: {
          userId: bet.userId,
          type: "cashout",
          amount: cashoutAmount,
          currency: "USD",
          status: "completed",
          description: `Cashout: ${match.homeTeam} vs ${match.awayTeam} - ${bet.selection} @ ${bet.odds}`,
          betId: bet.id,
        },
      });

      if (commission > 0) {
        await prisma.transaction.create({
          data: {
            userId: bet.userId,
            type: "commission",
            amount: -commission,
            currency: "USD",
            status: "completed",
            description: `Commission on cashout: ${match.homeTeam} vs ${match.awayTeam}`,
            betId: bet.id,
          },
        });
      }

      // Update accumulator if part of one
      if (bet.accumulatorId) {
        const accumulator = await prisma.accumulator.findUnique({
          where: { id: bet.accumulatorId },
          include: { bets: true },
        });

        if (accumulator) {
          const allLegsCashedOut = accumulator.bets.every(
            (b) => b.status === "cashed_out" || b.id === betId
          );

          await prisma.accumulator.update({
            where: { id: bet.accumulatorId },
            data: {
              status: allLegsCashedOut ? "cashed_out" : accumulator.status,
              cashoutAmount: (accumulator.cashoutAmount || 0) + cashoutAmount,
              profit: allLegsCashedOut ? (accumulator.profit || 0) + netProfit : accumulator.profit,
              settledAt: allLegsCashedOut ? now : undefined,
              cashedOutAt: now,
            },
          });
        }
      }

      // Log bot action
      await prisma.botLog.create({
        data: {
          userId: bet.userId,
          action: "cashout_executed",
          betId: bet.id,
          matchId: match.id,
          accumulatorId: bet.accumulatorId,
          details: JSON.stringify({
            type: "full",
            cashoutAmount,
            profit: netProfit,
            commission,
            urgency: cashoutRec.urgency,
          }),
          reasoning: cashoutRec.reasoning,
          confidence: cashoutRec.settlementProbability,
          profitImpact: netProfit,
        },
      });

      return NextResponse.json({
        success: true,
        cashoutType: "full",
        amount: cashoutAmount,
        profit: netProfit,
        commission,
        betStatus: updatedBet.status,
        cashoutRec,
      });
    }
  } catch (error) {
    console.error("Cashout execution error:", error);
    return NextResponse.json({ error: "Failed to execute cashout" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const betId = searchParams.get("betId");

    if (!betId) {
      return NextResponse.json({ error: "Bet ID required" }, { status: 400 });
    }

    const bet = await prisma.bet.findUnique({
      where: { id: betId },
      include: {
        match: true,
        user: { include: { settings: true } },
      },
    });

    if (!bet) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }

    if (!bet.match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const match = bet.match;
    const userSettings = bet.user.settings;

    const cashoutRec = shouldCashout(
      {
        selection: bet.selection,
        odds: bet.odds,
        stake: bet.stake,
        potentialWin: bet.potentialWin,
        status: bet.status,
        partialCashoutAmount: bet.partialCashoutAmount,
        partialCashoutPercent: bet.partialCashoutPercent,
      },
      {
        homeScore: match.homeScore ?? 0,
        awayScore: match.awayScore ?? 0,
        minute: match.minute ?? 0,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        sport: match.sport,
        status: match.status,
      },
      userSettings ? {
        autoCashoutEnabled: userSettings.autoCashoutEnabled,
        cashoutThreshold: userSettings.cashoutThreshold,
        waitFullSettlement: userSettings.waitFullSettlement,
        partialCashoutEnabled: userSettings.partialCashoutEnabled,
        partialCashoutPercent: userSettings.partialCashoutPercent,
      } : undefined
    );

    return NextResponse.json({
      betId,
      betStatus: bet.status,
      matchStatus: {
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        minute: match.minute,
        status: match.status,
      },
      cashoutRecommendation: cashoutRec,
    });
  } catch (error) {
    console.error("Cashout evaluation error:", error);
    return NextResponse.json({ error: "Failed to evaluate cashout" }, { status: 500 });
  }
}
