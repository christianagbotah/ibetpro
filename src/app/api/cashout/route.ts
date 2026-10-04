import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { shouldCashout } from "@/lib/ai-engine-v2";
import {
  executeCashoutOnBroker,
  calculateCommission,
} from "@/lib/broker-integration";
import { config } from "@/lib/config";
import { requireAuth } from "@/lib/session";
import {
  getPartialCashoutSlice,
  getRemainingExposure,
  money,
} from "@/lib/bet-exposure";
import { syncOpenExposureForAccount } from "@/lib/allocation-exposure";

const OPEN_CASHOUT_STATUSES = ["pending", "partial_cashout"];
const CASHOUT_CLAIM_STATUS = "cashout_settling";

type CashoutType = "full" | "partial";

async function releaseCashoutClaim(
  betId: string,
  userId: string,
  previousStatus: string
) {
  await prisma.bet.updateMany({
    where: {
      id: betId,
      userId,
      status: CASHOUT_CLAIM_STATUS,
    },
    data: { status: previousStatus },
  });
}

async function logCashoutFailure(input: {
  userId: string;
  betId: string;
  matchId: string;
  action: string;
  reasoning: string;
  details?: Record<string, unknown>;
}) {
  try {
    await prisma.botLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        betId: input.betId,
        matchId: input.matchId,
        details: input.details ? JSON.stringify(input.details) : undefined,
        reasoning: input.reasoning,
      },
    });
  } catch (error) {
    console.error("[Cashout] Failed to write recovery log:", error);
  }
}

async function syncExposureBestEffort(userId: string, bettingAccountId: string) {
  try {
    await syncOpenExposureForAccount(userId, bettingAccountId);
  } catch (error) {
    console.error("[Cashout] Exposure sync failed after committed cashout:", error);
  }
}

/**
 * Cashout Execution API v3
 *
 * Safety model:
 * 1. Real-money cashout is fail-closed until a verified broker adapter is wired.
 * 2. A conditional status update claims the bet before broker execution.
 * 3. Broker failure releases the claim without changing local money state.
 * 4. After broker acceptance, all local financial writes commit in one DB transaction.
 * 5. If that local transaction fails after broker acceptance, the claim remains locked
 *    for reconciliation so a retry cannot double-cashout or double-credit the user.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();
    const body = await request.json().catch(() => ({}));
    const betId = typeof body?.betId === "string" ? body.betId : "";
    const requestedType = body?.cashoutType ?? "full";

    if (!betId) {
      return NextResponse.json({ error: "Bet ID required" }, { status: 400 });
    }

    if (requestedType !== "full" && requestedType !== "partial") {
      return NextResponse.json(
        { error: "cashoutType must be 'full' or 'partial'" },
        { status: 400 }
      );
    }
    const cashoutType: CashoutType = requestedType;

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

    if (!OPEN_CASHOUT_STATUSES.includes(bet.status)) {
      return NextResponse.json(
        { error: `Cannot cash out a bet with status: ${bet.status}` },
        { status: bet.status === CASHOUT_CLAIM_STATUS ? 409 : 400 }
      );
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

    if (userSettings?.brokerMode === "real") {
      return NextResponse.json(
        {
          error:
            "Real-money cashout is disabled until a verified broker cashout adapter confirms the external cashout.",
          code: "REAL_CASHOUT_DISABLED",
        },
        { status: 409 }
      );
    }

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
      userSettings
        ? {
            autoCashoutEnabled: userSettings.autoCashoutEnabled,
            cashoutThreshold: userSettings.cashoutThreshold,
            waitFullSettlement: userSettings.waitFullSettlement,
            partialCashoutEnabled: userSettings.partialCashoutEnabled,
            partialCashoutPercent: userSettings.partialCashoutPercent,
          }
        : undefined
    );

    const exposure = getRemainingExposure(bet);
    const previousStatus = bet.status;
    const now = new Date();
    const commissionRate =
      userSettings?.commissionRate ?? config.commission.defaultRate;

    let partialPercent = 0;
    let partialAmount = 0;
    let partialStakeCashedOut = 0;
    let partialNewFraction = exposure.cashedOutFraction;
    let partialOriginalFraction = 0;
    let realizedGrossProfit = 0;
    let partialCommission = 0;
    let realizedNetProfit = 0;
    let netPartialPayout = 0;

    let cashoutAmount = 0;
    let grossRemainingProfit = 0;
    let commission = 0;
    let netRemainingProfit = 0;
    let netCashoutPayout = 0;
    let totalBetProfit = 0;
    let totalBetCommission = 0;

    if (cashoutType === "partial") {
      if (!userSettings?.partialCashoutEnabled) {
        return NextResponse.json(
          { error: "Partial cashout is not enabled for this account" },
          { status: 409 }
        );
      }

      if (exposure.cashedOutFraction > 0) {
        return NextResponse.json(
          {
            error:
              "Only one partial cashout is supported per bet. Choose full cashout or wait for settlement.",
          },
          { status: 409 }
        );
      }

      partialAmount = money(Number(cashoutRec.partialCashoutAmount || 0));
      if (!Number.isFinite(partialAmount) || partialAmount <= 0) {
        return NextResponse.json(
          {
            error:
              "No partial-cashout quote is currently available. The request was not converted to a full cashout.",
          },
          { status: 409 }
        );
      }

      partialPercent = userSettings.partialCashoutPercent || 0.5;
      const partialSlice = getPartialCashoutSlice(bet, partialPercent);
      partialStakeCashedOut = partialSlice.stakeCashedOutNow;
      partialNewFraction = partialSlice.newCumulativeFraction;
      partialOriginalFraction = partialSlice.originalStakeFraction;
      realizedGrossProfit = money(partialAmount - partialStakeCashedOut);
      const commissionCalc = calculateCommission(
        Math.max(0, realizedGrossProfit),
        commissionRate
      );
      partialCommission =
        realizedGrossProfit > 0 ? money(commissionCalc.commission) : 0;
      realizedNetProfit = money(realizedGrossProfit - partialCommission);
      netPartialPayout = money(partialAmount - partialCommission);
    } else {
      if (exposure.remainingStake <= 0) {
        return NextResponse.json(
          { error: "No remaining stake is available to cash out" },
          { status: 409 }
        );
      }

      cashoutAmount = money(Number(cashoutRec.cashoutAmount || 0));
      if (!Number.isFinite(cashoutAmount) || cashoutAmount <= 0) {
        return NextResponse.json(
          { error: "No full-cashout quote is currently available" },
          { status: 409 }
        );
      }

      grossRemainingProfit = money(cashoutAmount - exposure.remainingStake);
      const commissionCalc = calculateCommission(
        Math.max(0, grossRemainingProfit),
        commissionRate
      );
      commission =
        grossRemainingProfit > 0 ? money(commissionCalc.commission) : 0;
      netRemainingProfit = money(grossRemainingProfit - commission);
      netCashoutPayout = money(cashoutAmount - commission);
      totalBetProfit = money((bet.profit || 0) + netRemainingProfit);
      totalBetCommission = money((bet.commission || 0) + commission);
    }

    const claim = await prisma.bet.updateMany({
      where: {
        id: bet.id,
        userId,
        status: previousStatus,
      },
      data: { status: CASHOUT_CLAIM_STATUS },
    });

    if (claim.count !== 1) {
      return NextResponse.json(
        {
          error:
            "This bet is already being settled or cashed out. No duplicate cashout was executed.",
        },
        { status: 409 }
      );
    }

    let brokerAccepted = false;
    if (bettingAccount.accessToken) {
      try {
        const brokerCashout = await executeCashoutOnBroker(
          bettingAccount.platform,
          bettingAccount.accessToken,
          `bet_${bet.id}`,
          cashoutType,
          cashoutType === "partial" ? partialPercent : undefined
        );

        if (!brokerCashout.success) {
          await releaseCashoutClaim(bet.id, userId, previousStatus);
          await logCashoutFailure({
            userId,
            betId: bet.id,
            matchId: match.id,
            action: "cashout_skipped",
            reasoning: `Broker cashout failed: ${brokerCashout.error || "unknown broker error"}`,
            details: { cashoutType },
          });
          return NextResponse.json(
            {
              error: "Broker cashout failed. Local records were not changed.",
              brokerError: brokerCashout.error,
            },
            { status: 502 }
          );
        }
        brokerAccepted = true;
      } catch (error) {
        await releaseCashoutClaim(bet.id, userId, previousStatus);
        const reason =
          error instanceof Error ? error.message : "Unknown broker cashout error";
        await logCashoutFailure({
          userId,
          betId: bet.id,
          matchId: match.id,
          action: "cashout_skipped",
          reasoning: `Broker cashout failed: ${reason}`,
          details: { cashoutType },
        });
        return NextResponse.json(
          {
            error: "Broker cashout failed. Local records were not changed.",
            brokerError: reason,
          },
          { status: 502 }
        );
      }
    }

    try {
      if (cashoutType === "partial") {
        const updatedBet = await prisma.$transaction(async (tx) => {
          const claimedBet = await tx.bet.findFirst({
            where: {
              id: bet.id,
              userId,
              status: CASHOUT_CLAIM_STATUS,
            },
            select: { id: true },
          });
          if (!claimedBet) {
            throw new Error("Cashout claim was lost before local commit");
          }

          const cumulativeNetProfit = money(
            (bet.profit || 0) + realizedNetProfit
          );
          const cumulativeCommission = money(
            (bet.commission || 0) + partialCommission
          );

          const updated = await tx.bet.update({
            where: { id: bet.id },
            data: {
              status: "partial_cashout",
              partialCashoutAmount: money(
                (bet.partialCashoutAmount || 0) + partialAmount
              ),
              partialCashoutPercent: partialNewFraction,
              cashoutAmount: partialAmount,
              profit: cumulativeNetProfit,
              commission: cumulativeCommission,
              cashedOutAt: now,
              settlementReason: "partial_cashout",
            },
          });

          await tx.user.update({
            where: { id: userId },
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
              commissionPaid:
                partialCommission > 0
                  ? { increment: partialCommission }
                  : undefined,
              dailyPnl:
                realizedNetProfit !== 0
                  ? { increment: realizedNetProfit }
                  : undefined,
              weeklyPnl:
                realizedNetProfit !== 0
                  ? { increment: realizedNetProfit }
                  : undefined,
            },
          });

          const activeAllocation = await tx.allocation.findFirst({
            where: {
              userId,
              bettingAccountId: bettingAccount.id,
              status: "active",
            },
          });
          if (activeAllocation) {
            await tx.allocation.update({
              where: { id: activeAllocation.id },
              data: {
                remainingAmount: { increment: netPartialPayout },
                profitFromAlloc:
                  realizedNetProfit !== 0
                    ? { increment: realizedNetProfit }
                    : undefined,
                commissionFromAlloc:
                  partialCommission > 0
                    ? { increment: partialCommission }
                    : undefined,
              },
            });
          }

          await tx.bettingAccount.update({
            where: { id: bettingAccount.id },
            data: {
              allocatedAmount: { increment: netPartialPayout },
              totalBrokerProfit:
                realizedNetProfit !== 0
                  ? { increment: realizedNetProfit }
                  : undefined,
            },
          });

          await tx.transaction.create({
            data: {
              userId,
              type: "partial_cashout",
              amount: partialAmount,
              currency: bettingAccount.currency || "USD",
              status: "completed",
              description: `Partial cashout via ${bettingAccount.platform}: ${match.homeTeam} vs ${match.awayTeam} - ${bet.selection} (${Math.round(partialOriginalFraction * 100)}% of original stake)`,
              betId: bet.id,
            },
          });

          if (partialCommission > 0) {
            await tx.transaction.create({
              data: {
                userId,
                type: "commission",
                amount: -partialCommission,
                currency: bettingAccount.currency || "USD",
                status: "completed",
                description: `Commission on realized partial-cashout profit: ${match.homeTeam} vs ${match.awayTeam}`,
                betId: bet.id,
              },
            });

            await tx.commissionLedger.create({
              data: {
                userId,
                bettingAccountId: bettingAccount.id,
                betId: bet.id,
                grossProfit: Math.max(0, realizedGrossProfit),
                commissionRate,
                commissionAmount: partialCommission,
                netProfit: realizedNetProfit,
                status: "pending",
              },
            });
          }

          await tx.botLog.create({
            data: {
              userId,
              action: "cashout_executed",
              betId: bet.id,
              matchId: match.id,
              details: JSON.stringify({
                type: "partial",
                amount: partialAmount,
                percent: partialPercent,
                broker: bettingAccount.platform,
                atomic: true,
              }),
              reasoning: cashoutRec.reasoning,
              confidence: cashoutRec.settlementProbability,
              profitImpact: realizedNetProfit,
            },
          });

          return updated;
        });

        await syncExposureBestEffort(userId, bettingAccount.id);

        return NextResponse.json({
          success: true,
          cashoutType: "partial",
          amount: partialAmount,
          netAmount: netPartialPayout,
          realizedProfit: realizedNetProfit,
          commission: partialCommission,
          percent: partialOriginalFraction,
          remainingStake: money(
            bet.stake * (1 - partialNewFraction)
          ),
          remainingPotentialWin: money(
            bet.potentialWin * (1 - partialNewFraction)
          ),
          betStatus: updatedBet.status,
          cashoutRec,
        });
      }

      const updatedBet = await prisma.$transaction(async (tx) => {
        const claimedBet = await tx.bet.findFirst({
          where: {
            id: bet.id,
            userId,
            status: CASHOUT_CLAIM_STATUS,
          },
          select: { id: true },
        });
        if (!claimedBet) {
          throw new Error("Cashout claim was lost before local commit");
        }

        const updated = await tx.bet.update({
          where: { id: bet.id },
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

        await tx.user.update({
          where: { id: userId },
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
            commissionPaid:
              commission > 0 ? { increment: commission } : undefined,
            dailyPnl:
              netRemainingProfit !== 0
                ? { increment: netRemainingProfit }
                : undefined,
            weeklyPnl:
              netRemainingProfit !== 0
                ? { increment: netRemainingProfit }
                : undefined,
          },
        });

        const activeAllocation = await tx.allocation.findFirst({
          where: {
            userId,
            bettingAccountId: bettingAccount.id,
            status: "active",
          },
        });
        if (activeAllocation) {
          await tx.allocation.update({
            where: { id: activeAllocation.id },
            data: {
              remainingAmount: { increment: netCashoutPayout },
              profitFromAlloc:
                netRemainingProfit !== 0
                  ? { increment: netRemainingProfit }
                  : undefined,
              commissionFromAlloc:
                commission > 0 ? { increment: commission } : undefined,
            },
          });
        }

        await tx.bettingAccount.update({
          where: { id: bettingAccount.id },
          data: {
            allocatedAmount: { increment: netCashoutPayout },
            totalBrokerProfit:
              netRemainingProfit !== 0
                ? { increment: netRemainingProfit }
                : undefined,
          },
        });

        await tx.transaction.create({
          data: {
            userId,
            type: "cashout",
            amount: cashoutAmount,
            currency: bettingAccount.currency || "USD",
            status: "completed",
            description: `Cashout via ${bettingAccount.platform}: ${match.homeTeam} vs ${match.awayTeam} - ${bet.selection} @ ${bet.odds}`,
            betId: bet.id,
          },
        });

        if (commission > 0) {
          await tx.transaction.create({
            data: {
              userId,
              type: "commission",
              amount: -commission,
              currency: bettingAccount.currency || "USD",
              status: "completed",
              description: `Commission ${Math.round(commissionRate * 100)}% on ${Math.max(0, grossRemainingProfit).toFixed(2)} remaining profit via ${bettingAccount.platform}`,
              betId: bet.id,
            },
          });

          await tx.commissionLedger.create({
            data: {
              userId,
              bettingAccountId: bettingAccount.id,
              betId: bet.id,
              grossProfit: Math.max(0, grossRemainingProfit),
              commissionRate,
              commissionAmount: commission,
              netProfit: netRemainingProfit,
              status: "pending",
            },
          });
        }

        await tx.botLog.create({
          data: {
            userId,
            action: "cashout_executed",
            betId: bet.id,
            matchId: match.id,
            details: JSON.stringify({
              type: "full",
              cashoutAmount,
              profit: netRemainingProfit,
              commission,
              urgency: cashoutRec.urgency,
              broker: bettingAccount.platform,
              aiDecision: cashoutRec.aiDecision.action,
              atomic: true,
            }),
            reasoning: cashoutRec.reasoning,
            confidence: cashoutRec.settlementProbability,
            profitImpact: netRemainingProfit,
          },
        });

        return updated;
      });

      await syncExposureBestEffort(userId, bettingAccount.id);

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
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Unknown local cashout error";

      if (!brokerAccepted) {
        await releaseCashoutClaim(bet.id, userId, previousStatus);
      } else {
        await logCashoutFailure({
          userId,
          betId: bet.id,
          matchId: match.id,
          action: "cashout_reconciliation_required",
          reasoning:
            "Broker accepted cashout but the local accounting transaction failed. The bet remains locked to prevent duplicate cashout.",
          details: { cashoutType, localError: reason },
        });
      }

      return NextResponse.json(
        {
          error: brokerAccepted
            ? "Broker accepted the cashout, but local accounting requires reconciliation. The bet is locked and cannot be cashed out again."
            : "Cashout accounting failed. The claim was released and no local money change was committed.",
          code: brokerAccepted
            ? "CASHOUT_RECONCILIATION_REQUIRED"
            : "CASHOUT_LOCAL_COMMIT_FAILED",
        },
        { status: 500 }
      );
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

    if (bet.user.settings?.brokerMode === "real") {
      return NextResponse.json({
        betId,
        canCashout: false,
        reason:
          "Real-money cashout is disabled until verified broker cashout execution is enabled.",
        realExecutionEnabled: false,
      });
    }

    if (!OPEN_CASHOUT_STATUSES.includes(bet.status)) {
      return NextResponse.json({
        betId,
        betStatus: bet.status,
        canCashout: false,
        reason:
          bet.status === CASHOUT_CLAIM_STATUS
            ? "Cashout is already in progress or awaiting reconciliation."
            : `Bet status ${bet.status} is not cashout-eligible.`,
      });
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
      userSettings
        ? {
            autoCashoutEnabled: userSettings.autoCashoutEnabled,
            cashoutThreshold: userSettings.cashoutThreshold,
            waitFullSettlement: userSettings.waitFullSettlement,
            partialCashoutEnabled: userSettings.partialCashoutEnabled,
            partialCashoutPercent: userSettings.partialCashoutPercent,
          }
        : undefined
    );

    return NextResponse.json({
      betId,
      betStatus: bet.status,
      broker: bet.bettingAccount?.platform || "unknown",
      canCashout: Number(cashoutRec.cashoutAmount || 0) > 0,
      partialCashoutAvailable:
        Boolean(userSettings?.partialCashoutEnabled) &&
        Number(cashoutRec.partialCashoutAmount || 0) > 0 &&
        getRemainingExposure(bet).cashedOutFraction === 0,
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
    return NextResponse.json(
      { error: "Failed to evaluate cashout" },
      { status: 500 }
    );
  }
}
