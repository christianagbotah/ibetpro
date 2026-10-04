import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { shouldCashout } from "@/lib/ai-engine-v2";
import { executeCashoutOnBroker, calculateCommission } from "@/lib/broker-integration";
import { config } from "@/lib/config";
import { requireAuth } from "@/lib/session";
import {
  getPartialCashoutSlice,
  getRemainingExposure,
  money,
} from "@/lib/bet-exposure";
import { syncOpenExposureForAccount } from "@/lib/allocation-exposure";

/**
 * Cashout Execution API v2
 * POST /api/cashout - Execute a cashout (full or partial) via broker, update allocation, process commission
 * GET /api/cashout - Get cashout recommendation for a bet
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();
    const body = await request.json();
    const { betId, cashoutType = "full" } = body;

    if (!betId) {
      return NextResponse.json({ error: "Bet ID required" }, { status: 400 });
    }

    const bet = await prisma.bet.findFirst({
      where: { id: betId, userId },
      include: {
        match: true,
        user: { include: { settings: true } },
        bettingAccount: true,
      },
    });

    if (!bet) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }

    if (bet.status !== "pending" && bet.status !== "partial_cashout") {
      return NextResponse.json({ error: `Cannot cash out a bet with status: ${bet.status}` }, { status: 400 });
    }

    if (bet.accumulatorId) {
      return NextResponse.json(
        {
          error:
            "Accumulator legs cannot be cashed out individually. The accumulator ticket must be managed as one position.",
        },
        { status: 409 }
      );
    }

    if (!bet.match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const match = bet.match;
    const userSettings = bet.user.settings;
    const bettingAccount = bet.bettingAccount;

    // Get cashout recommendation from AI v2
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
    const exposure = getRemainingExposure(bet);

    if (cashoutType === "partial" && cashoutRec.partialCashoutAmount > 0 && userSettings?.partialCashoutEnabled) {
      if (exposure.cashedOutFraction > 0) {
        return NextResponse.json(
          {
            error:
              "Only one partial cashout is supported per bet. Choose full cashout or wait for settlement.",
          },
          { status: 409 }
        );
      }

      const partialPercent = userSettings?.partialCashoutPercent || 0.5;
      const partialSlice = getPartialCashoutSlice(bet, partialPercent);
      const partialAmount = money(cashoutRec.partialCashoutAmount);
      const realizedGrossProfit = money(
        partialAmount - partialSlice.stakeCashedOutNow
      );
      const commissionCalc = calculateCommission(
        Math.max(0, realizedGrossProfit),
        userSettings?.commissionRate ?? config.commission.defaultRate
      );
      const partialCommission =
        realizedGrossProfit > 0 ? money(commissionCalc.commission) : 0;
      const realizedNetProfit = money(
        realizedGrossProfit - partialCommission
      );
      const netPartialPayout = money(partialAmount - partialCommission);

      // Execute partial cashout on broker
      if (bettingAccount.accessToken) {
        const brokerCashout = await executeCashoutOnBroker(
          bettingAccount.platform,
          bettingAccount.accessToken,
          `bet_${bet.id}`,
          "partial",
          partialPercent
        );

        if (!brokerCashout.success) {
          await prisma.botLog.create({
            data: {
              userId: bet.userId,
              action: "cashout_skipped",
              betId: bet.id,
              matchId: match.id,
              reasoning: `Broker cashout failed: ${brokerCashout.error}`,
            },
          });
          return NextResponse.json(
            {
              error:
                "Broker cashout failed. Local records were not changed.",
              brokerError: brokerCashout.error,
            },
            { status: 502 }
          );
        }
      }

      const cumulativeNetProfit = money(
        (bet.profit || 0) + realizedNetProfit
      );
      const cumulativeCommission = money(
        (bet.commission || 0) + partialCommission
      );

      const updatedBet = await prisma.bet.update({
        where: { id: betId },
        data: {
          status: "partial_cashout",
          partialCashoutAmount: money(
            (bet.partialCashoutAmount || 0) + partialAmount
          ),
          partialCashoutPercent: partialSlice.newCumulativeFraction,
          cashoutAmount: partialAmount,
          profit: cumulativeNetProfit,
          commission: cumulativeCommission,
          cashedOutAt: now,
          settlementReason: "partial_cashout",
        },
      });

      // Realize this partial slice now; only the remaining exposure stays open.
      await prisma.user.update({
        where: { id: bet.userId },
        data: {
          balance: { increment: netPartialPayout },
          totalProfit:
            realizedNetProfit > 0
              ? { increment: realizedNetProfit }
              : undefined,
          totalLoss:
            realizedNetProfit < 0
              ? { increment: Math.abs(realizedNetProfit) }
              : undefined,
          commissionPaid: { increment: partialCommission },
          dailyPnl: { increment: realizedNetProfit },
          weeklyPnl: { increment: realizedNetProfit },
        },
      });

      // Update allocation
      const activeAllocation = await prisma.allocation.findFirst({
        where: { userId: bet.userId, bettingAccountId: bettingAccount.id, status: "active" },
      });
      if (activeAllocation) {
        await prisma.allocation.update({
          where: { id: activeAllocation.id },
          data: {
            remainingAmount: { increment: netPartialPayout },
            profitFromAlloc: {
              increment: realizedNetProfit,
            },
            commissionFromAlloc: { increment: partialCommission },
          },
        });
      }

      // Update betting account
      await prisma.bettingAccount.update({
        where: { id: bettingAccount.id },
        data: {
          allocatedAmount: { increment: netPartialPayout },
          totalBrokerProfit: { increment: realizedNetProfit },
        },
      });

      await prisma.transaction.create({
        data: {
          userId: bet.userId,
          type: "partial_cashout",
          amount: partialAmount,
          currency: bettingAccount.currency || "USD",
          status: "completed",
          description: `Partial cashout via ${bettingAccount.platform}: ${match.homeTeam} vs ${match.awayTeam} - ${bet.selection} (${Math.round(partialSlice.originalStakeFraction * 100)}% of original stake)`,
          betId: bet.id,
        },
      });

      if (partialCommission > 0) {
        await prisma.transaction.create({
          data: {
            userId: bet.userId,
            type: "commission",
            amount: -partialCommission,
            currency: bettingAccount.currency || "USD",
            status: "completed",
            description: `Commission on realized partial-cashout profit: ${match.homeTeam} vs ${match.awayTeam}`,
            betId: bet.id,
          },
        });

        await prisma.commissionLedger.create({
          data: {
            userId: bet.userId,
            bettingAccountId: bettingAccount.id,
            betId: bet.id,
            grossProfit: Math.max(0, realizedGrossProfit),
            commissionRate:
              userSettings?.commissionRate ?? config.commission.defaultRate,
            commissionAmount: partialCommission,
            netProfit: realizedNetProfit,
            status: "pending",
          },
        });
      }

      await prisma.botLog.create({
        data: {
          userId: bet.userId,
          action: "cashout_executed",
          betId: bet.id,
          matchId: match.id,
          details: JSON.stringify({
            type: "partial",
            amount: partialAmount,
            percent: partialPercent,
            broker: bettingAccount.platform,
          }),
          reasoning: cashoutRec.reasoning,
          confidence: cashoutRec.settlementProbability,
          profitImpact: realizedNetProfit,
        },
      });

      await syncOpenExposureForAccount(
        bet.userId,
        bettingAccount.id
      );

      return NextResponse.json({
        success: true,
        cashoutType: "partial",
        amount: partialAmount,
        netAmount: netPartialPayout,
        realizedProfit: realizedNetProfit,
        commission: partialCommission,
        percent: partialSlice.originalStakeFraction,
        remainingStake: money(
          bet.stake * (1 - partialSlice.newCumulativeFraction)
        ),
        remainingPotentialWin: money(
          bet.potentialWin * (1 - partialSlice.newCumulativeFraction)
        ),
        betStatus: updatedBet.status,
        cashoutRec,
      });
    } else {
      // Full cashout
      const cashoutAmount = cashoutRec.cashoutAmount;

      // Execute full cashout on broker
      if (bettingAccount.accessToken) {
        const brokerCashout = await executeCashoutOnBroker(
          bettingAccount.platform,
          bettingAccount.accessToken,
          `bet_${bet.id}`,
          "full"
        );

        if (!brokerCashout.success) {
          await prisma.botLog.create({
            data: {
              userId: bet.userId,
              action: "cashout_skipped",
              betId: bet.id,
              matchId: match.id,
              reasoning: `Broker cashout failed: ${brokerCashout.error}`,
            },
          });
          return NextResponse.json(
            {
              error:
                "Broker cashout failed. Local records were not changed.",
              brokerError: brokerCashout.error,
            },
            { status: 502 }
          );
        }
      }

      // Calculate the result on the remaining open exposure only.
      if (exposure.remainingStake <= 0) {
        return NextResponse.json(
          { error: "No remaining stake is available to cash out" },
          { status: 409 }
        );
      }

      const grossRemainingProfit = money(
        cashoutAmount - exposure.remainingStake
      );
      const commissionCalc = calculateCommission(
        Math.max(0, grossRemainingProfit),
        userSettings?.commissionRate ?? config.commission.defaultRate
      );
      const commission =
        grossRemainingProfit > 0 ? money(commissionCalc.commission) : 0;
      const netRemainingProfit = money(
        grossRemainingProfit - commission
      );
      const netCashoutPayout = money(cashoutAmount - commission);
      const totalBetProfit = money(
        (bet.profit || 0) + netRemainingProfit
      );
      const totalBetCommission = money(
        (bet.commission || 0) + commission
      );

      const updatedBet = await prisma.bet.update({
        where: { id: betId },
        data: {
          status: "cashed_out",
          cashoutAmount,
          cashoutOdds: cashoutAmount / exposure.remainingStake,
          profit: totalBetProfit,
          commission: totalBetCommission,
          settledAt: now,
          cashedOutAt: now,
          settlementReason: "cashout",
        },
      });

      // Realize only the remaining slice. Any prior partial slice was already
      // reflected in balance/P&L when that partial cashout executed.
      await prisma.user.update({
        where: { id: bet.userId },
        data: {
          balance: { increment: netCashoutPayout },
          totalProfit:
            netRemainingProfit > 0
              ? { increment: netRemainingProfit }
              : undefined,
          totalLoss:
            netRemainingProfit < 0
              ? { increment: Math.abs(netRemainingProfit) }
              : undefined,
          commissionPaid: { increment: commission },
          dailyPnl: { increment: netRemainingProfit },
          weeklyPnl: { increment: netRemainingProfit },
        },
      });

      // Update allocation
      const activeAllocation = await prisma.allocation.findFirst({
        where: { userId: bet.userId, bettingAccountId: bettingAccount.id, status: "active" },
      });
      if (activeAllocation) {
        await prisma.allocation.update({
          where: { id: activeAllocation.id },
          data: {
            remainingAmount: { increment: netCashoutPayout },
            profitFromAlloc: {
              increment: netRemainingProfit,
            },
            commissionFromAlloc: { increment: commission },
          },
        });
      }

      // Update betting account
      await prisma.bettingAccount.update({
        where: { id: bettingAccount.id },
        data: {
          allocatedAmount: { increment: netCashoutPayout },
          totalBrokerProfit: { increment: netRemainingProfit },
        },
      });

      await prisma.transaction.create({
        data: {
          userId: bet.userId,
          type: "cashout",
          amount: cashoutAmount,
          currency: bettingAccount.currency || "USD",
          status: "completed",
          description: `Cashout via ${bettingAccount.platform}: ${match.homeTeam} vs ${match.awayTeam} - ${bet.selection} @ ${bet.odds}`,
          betId: bet.id,
        },
      });

      // Process commission if profit was made
      if (commission > 0) {
        await prisma.transaction.create({
          data: {
            userId: bet.userId,
            type: "commission",
            amount: -commission,
            currency: bettingAccount.currency || "USD",
            status: "completed",
            description: `Commission ${Math.round((userSettings?.commissionRate ?? config.commission.defaultRate) * 100)}% on $${Math.max(0, grossRemainingProfit).toFixed(2)} remaining profit via ${bettingAccount.platform}`,
            betId: bet.id,
          },
        });

        // Create commission ledger entry
        await prisma.commissionLedger.create({
          data: {
            userId: bet.userId,
            bettingAccountId: bettingAccount.id,
            betId: bet.id,
            grossProfit: Math.max(0, grossRemainingProfit),
            commissionRate: userSettings?.commissionRate ?? config.commission.defaultRate,
            commissionAmount: commission,
            netProfit: netRemainingProfit,
            status: "pending",
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
              profit: allLegsCashedOut ? (accumulator.profit || 0) + netRemainingProfit : accumulator.profit,
              commission: (accumulator.commission || 0) + commission,
              settledAt: allLegsCashedOut ? now : undefined,
              cashedOutAt: now,
            },
          });
        }
      }

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
            profit: netRemainingProfit,
            commission,
            urgency: cashoutRec.urgency,
            broker: bettingAccount.platform,
            aiDecision: cashoutRec.aiDecision.action,
          }),
          reasoning: cashoutRec.reasoning,
          confidence: cashoutRec.settlementProbability,
          profitImpact: netRemainingProfit,
        },
      });

      await syncOpenExposureForAccount(
        bet.userId,
        bettingAccount.id
      );

      return NextResponse.json({
        success: true,
        cashoutType: "full",
        amount: cashoutAmount,
        netAmount: netCashoutPayout,
        profit: netRemainingProfit,
        totalBetProfit,
        commission,
        totalBetCommission,
        betStatus: updatedBet.status,
        cashoutRec,
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Cashout execution error:", error);
    return NextResponse.json({ error: "Failed to execute cashout" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth();
    const { searchParams } = new URL(request.url);
    const betId = searchParams.get("betId");

    if (!betId) {
      return NextResponse.json({ error: "Bet ID required" }, { status: 400 });
    }

    const bet = await prisma.bet.findFirst({
      where: { id: betId, userId },
      include: {
        match: true,
        user: { include: { settings: true } },
        bettingAccount: true,
      },
    });

    if (!bet) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }

    if (bet.accumulatorId) {
      return NextResponse.json(
        {
          error:
            "Accumulator legs cannot be cashed out individually. The accumulator ticket must be managed as one position.",
          canCashout: false,
        },
        { status: 409 }
      );
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
      broker: bet.bettingAccount?.platform || "unknown",
      matchStatus: {
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        minute: match.minute,
        status: match.status,
      },
      cashoutRecommendation: cashoutRec,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Cashout evaluation error:", error);
    return NextResponse.json({ error: "Failed to evaluate cashout" }, { status: 500 });
  }
}
