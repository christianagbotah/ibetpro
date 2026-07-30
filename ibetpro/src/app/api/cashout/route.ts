import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/session";
import { checkRateLimit, rateLimitHeaders, RATE_LIMITS } from "@/lib/rate-limit";
import { validateInput, cashoutSchema } from "@/lib/validation";
import { shouldCashout } from "@/lib/ai-engine";
import { broadcastToUser } from "@/lib/sse";

/**
 * POST /api/cashout - Execute a cashout on a pending bet
 * Calculates the real-time cashout value using AI engine and settles the bet
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
    const validation = validateInput(cashoutSchema, body);
    if (!validation.success) return validation.error;

    const { betId, forceCashout } = validation.data;

    // Fetch the bet with match data
    const bet = await prisma.bet.findUnique({
      where: { id: betId },
      include: {
        match: true,
      },
    });

    if (!bet) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }

    // Verify ownership
    if (bet.userId !== user.id) {
      return NextResponse.json({ error: "Not authorized to cashout this bet" }, { status: 403 });
    }

    // Only pending bets can be cashed out
    if (bet.status !== "pending") {
      return NextResponse.json({ error: `Bet is already ${bet.status} — cannot cashout` }, { status: 400 });
    }

    // Only live or upcoming matches can have cashouts
    if (bet.match.status === "finished") {
      return NextResponse.json({ error: "Match has finished — cashout not available" }, { status: 400 });
    }

    // For live matches, use AI cashout analysis
    // For upcoming matches, offer a partial refund cashout
    let cashoutAmount: number;
    let cashoutReasoning: string;
    let cashoutUrgency: "low" | "medium" | "high";

    if (bet.match.status === "live" && bet.match.homeScore !== null && bet.match.awayScore !== null && bet.match.minute !== null) {
      // Live match — use AI cashout analysis
      const cashoutCheck = shouldCashout(
        {
          selection: bet.selection,
          odds: bet.odds,
          stake: bet.stake,
          potentialWin: bet.potentialWin,
          status: bet.status,
        },
        {
          homeScore: bet.match.homeScore,
          awayScore: bet.match.awayScore,
          minute: bet.match.minute,
          homeTeam: bet.match.homeTeam,
          awayTeam: bet.match.awayTeam,
          sport: bet.match.sport,
        }
      );

      if (!cashoutCheck.shouldCashout && !forceCashout) {
        return NextResponse.json({
          error: "Cashout not recommended at this time",
          cashoutAnalysis: cashoutCheck,
          hint: "Set forceCashout=true to override AI recommendation",
        }, { status: 400 });
      }

      cashoutAmount = cashoutCheck.cashoutAmount;
      cashoutReasoning = cashoutCheck.reasoning;
      cashoutUrgency = cashoutCheck.urgency;
    } else {
      // Upcoming match — offer partial refund (bookmaker margin applied)
      cashoutAmount = Math.round(bet.stake * 0.90 * 100) / 100; // 90% of stake returned
      cashoutReasoning = "Match has not started yet. Standard early cashout with 10% bookmaker margin applied.";
      cashoutUrgency = "low";
    }

    if (cashoutAmount <= 0) {
      return NextResponse.json({ error: "Cashout amount is zero — bet has no remaining value" }, { status: 400 });
    }

    // Calculate profit/loss from cashout
    const cashoutProfit = cashoutAmount - bet.stake;

    // Get user's commission rate
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
      select: { commissionRate: true },
    });
    const commissionRate = userSettings?.commissionRate ?? 0.10;

    // Commission only on profitable cashouts
    const commission = cashoutProfit > 0 ? Math.round(cashoutProfit * commissionRate * 100) / 100 : 0;
    const netCashout = cashoutAmount - commission;

    // Settle the bet via transaction
    const updatedBet = await prisma.$transaction(async (tx) => {
      // Update bet status
      const updated = await tx.bet.update({
        where: { id: betId },
        data: {
          status: "cashed_out",
          cashoutAmount: netCashout,
          profit: cashoutProfit,
          commission,
          cashedOutAt: new Date(),
          settledAt: new Date(),
        },
      });

      // Create cashout transaction
      await tx.transaction.create({
        data: {
          userId: user.id,
          type: "cashout",
          amount: netCashout,
          description: `Cashout on ${bet.match.homeTeam} vs ${bet.match.awayTeam} — ${bet.selection} @ ${bet.odds}`,
          betId,
        },
      });

      // Create commission transaction if applicable
      if (commission > 0) {
        await tx.transaction.create({
          data: {
            userId: user.id,
            type: "commission",
            amount: commission,
            description: `${(commissionRate * 100).toFixed(0)}% commission on cashout profit`,
            betId,
          },
        });
      }

      // Update user balance
      await tx.user.update({
        where: { id: user.id },
        data: {
          balance: { increment: netCashout },
          totalProfit: cashoutProfit > 0 ? { increment: cashoutProfit } : undefined,
          totalLoss: cashoutProfit < 0 ? { increment: Math.abs(cashoutProfit) } : undefined,
          commissionPaid: { increment: commission },
        },
      });

      return updated;
    });

    // Broadcast SSE event for real-time update
    broadcastToUser(user.id, {
      event: "cashout",
      data: {
        betId,
        cashoutAmount: netCashout,
        commission,
        profit: cashoutProfit,
      },
      timestamp: Date.now(),
    });

    return NextResponse.json({
      success: true,
      bet: updatedBet,
      cashoutDetails: {
        grossCashout: cashoutAmount,
        commission,
        netCashout,
        profit: cashoutProfit,
        commissionRate: commissionRate * 100,
        reasoning: cashoutReasoning,
        urgency: cashoutUrgency,
      },
    }, { headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    console.error("Cashout error:", error);
    return NextResponse.json({ error: "Failed to process cashout" }, { status: 500 });
  }
}
