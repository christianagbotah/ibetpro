import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { calculateCommission, transferCommissionToAdmin } from "@/lib/broker-integration";

/**
 * Bet Settlement Engine
 * POST /api/settle - Settle bets for finished matches (auto-settle won/lost, calculate commission, update balance)
 * GET /api/settle - Get settlement status for pending bets
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, matchId } = body;

    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    // Get user settings for commission rate
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { settings: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const commissionRate = user.settings?.commissionRate || 0.10;

    // Find finished matches with unsettled bets
    const whereClause: Record<string, unknown> = {
      userId,
      status: "pending",
      match: { status: "finished" },
    };

    if (matchId) {
      whereClause.matchId = matchId;
    }

    const unsettledBets = await prisma.bet.findMany({
      where: whereClause,
      include: { match: true, bettingAccount: true },
    });

    if (unsettledBets.length === 0) {
      return NextResponse.json({ message: "No bets to settle", settled: 0 });
    }

    const settledBets: Array<{
      betId: string;
      matchId: string;
      result: string;
      profit: number;
      commission: number;
    }> = [];

    for (const bet of unsettledBets) {
      if (!bet.match) continue;

      const match = bet.match;
      const homeScore = match.homeScore ?? 0;
      const awayScore = match.awayScore ?? 0;

      // Determine bet result
      let betWon = false;
      let resultReason = "";

      if (bet.betType === "single" || bet.betType === "accumulator_leg") {
        if (bet.selection === match.homeTeam) {
          betWon = homeScore > awayScore;
          resultReason = betWon
            ? `${match.homeTeam} won ${homeScore}-${awayScore}`
            : `${match.homeTeam} did not win (${homeScore}-${awayScore})`;
        } else if (bet.selection === match.awayTeam) {
          betWon = awayScore > homeScore;
          resultReason = betWon
            ? `${match.awayTeam} won ${awayScore}-${homeScore}`
            : `${match.awayTeam} did not win (${awayScore}-${homeScore})`;
        } else if (bet.selection === "Draw") {
          betWon = homeScore === awayScore;
          resultReason = betWon
            ? `Match drawn ${homeScore}-${awayScore}`
            : `Match not drawn (${homeScore}-${awayScore})`;
        } else if (bet.selection === "Over 2.5") {
          const totalGoals = homeScore + awayScore;
          betWon = totalGoals > 2.5;
          resultReason = betWon
            ? `Total goals ${totalGoals} > 2.5`
            : `Total goals ${totalGoals} <= 2.5`;
        } else if (bet.selection === "Under 2.5") {
          const totalGoals = homeScore + awayScore;
          betWon = totalGoals < 2.5;
          resultReason = betWon
            ? `Total goals ${totalGoals} < 2.5`
            : `Total goals ${totalGoals} >= 2.5`;
        }
      }

      const now = new Date();

      if (betWon) {
        // Calculate profit and commission
        const effectiveStake = bet.partialCashoutAmount ? bet.stake - bet.partialCashoutAmount : bet.stake;
        const grossProfit = bet.potentialWin - effectiveStake;
        const commission = grossProfit * commissionRate;
        const netProfit = grossProfit - commission;

        // Update bet
        await prisma.bet.update({
          where: { id: bet.id },
          data: {
            status: "won",
            profit: Math.round(netProfit * 100) / 100,
            commission: Math.round(commission * 100) / 100,
            settledAt: now,
            settlementReason: "match_finished",
          },
        });

        // Update user balance and PnL
        const winnings = bet.potentialWin;
        await prisma.user.update({
          where: { id: userId },
          data: {
            balance: { increment: winnings },
            totalProfit: { increment: netProfit },
            commissionPaid: { increment: commission },
            dailyPnl: { increment: netProfit },
            weeklyPnl: { increment: netProfit },
          },
        });

        // Create transaction
        await prisma.transaction.create({
          data: {
            userId,
            type: "bet_won",
            amount: winnings,
            currency: "USD",
            status: "completed",
            description: `Bet won: ${match.homeTeam} vs ${match.awayTeam} - ${bet.selection} @ ${bet.odds} (profit: $${netProfit.toFixed(2)}, commission: $${commission.toFixed(2)})`,
            betId: bet.id,
          },
        });

        if (commission > 0) {
          await prisma.transaction.create({
            data: {
              userId,
              type: "commission",
              amount: -commission,
              currency: "USD",
              status: "completed",
              description: `Commission ${Math.round(commissionRate * 100)}% on $${grossProfit.toFixed(2)} profit: ${match.homeTeam} vs ${match.awayTeam}`,
              betId: bet.id,
            },
          });

          // Create commission ledger entry for auto-transfer to admin
          if (bet.bettingAccountId) {
            await prisma.commissionLedger.create({
              data: {
                userId,
                bettingAccountId: bet.bettingAccountId,
                betId: bet.id,
                accumulatorId: bet.accumulatorId,
                grossProfit,
                commissionRate,
                commissionAmount: commission,
                netProfit,
                status: "pending",
              },
            });

            // Update allocation
            const activeAllocation = await prisma.allocation.findFirst({
              where: { userId, bettingAccountId: bet.bettingAccountId, status: "active" },
            });
            if (activeAllocation) {
              await prisma.allocation.update({
                where: { id: activeAllocation.id },
                data: {
                  remainingAmount: { increment: bet.potentialWin },
                  profitFromAlloc: { increment: grossProfit },
                  commissionFromAlloc: { increment: commission },
                },
              });
            }

            // Update betting account broker profit
            await prisma.bettingAccount.update({
              where: { id: bet.bettingAccountId },
              data: {
                allocatedAmount: { increment: bet.potentialWin },
                totalBrokerProfit: { increment: netProfit },
              },
            });

            // Try auto-transfer commission to admin
            const adminSettings = await prisma.adminSettings.findFirst();
            if (adminSettings?.autoCommissionTransfer && adminSettings.adminWalletAddress && bet.bettingAccount?.accessToken) {
              const transferResult = await transferCommissionToAdmin(
                bet.bettingAccount.platform,
                bet.bettingAccount.accessToken,
                commission,
                adminSettings.adminWalletAddress,
                `settle_${bet.id}`
              );
              if (transferResult.success) {
                await prisma.commissionLedger.updateMany({
                  where: { betId: bet.id, status: "pending" },
                  data: {
                    status: "transferred",
                    transferRef: transferResult.transferRef,
                    transferredAt: new Date(),
                  },
                });
              }
            }
          }
        }

        // Log
        await prisma.botLog.create({
          data: {
            userId,
            action: "bet_settled",
            betId: bet.id,
            matchId: match.id,
            accumulatorId: bet.accumulatorId,
            details: JSON.stringify({ result: "won", profit: netProfit, commission }),
            reasoning: resultReason,
            profitImpact: netProfit,
          },
        });

        settledBets.push({
          betId: bet.id,
          matchId: match.id,
          result: "won",
          profit: netProfit,
          commission,
        });
      } else {
        // Bet lost
        const effectiveStake = bet.partialCashoutAmount ? bet.stake - bet.partialCashoutAmount : bet.stake;

        await prisma.bet.update({
          where: { id: bet.id },
          data: {
            status: "lost",
            profit: -effectiveStake,
            settledAt: now,
            settlementReason: "match_finished",
          },
        });

        // Update user PnL (stake already deducted when bet was placed)
        await prisma.user.update({
          where: { id: userId },
          data: {
            totalLoss: { increment: effectiveStake },
            dailyPnl: { decrement: effectiveStake },
            weeklyPnl: { decrement: effectiveStake },
          },
        });

        // Create transaction
        await prisma.transaction.create({
          data: {
            userId,
            type: "bet_lost",
            amount: 0,
            currency: "USD",
            status: "completed",
            description: `Bet lost: ${match.homeTeam} vs ${match.awayTeam} - ${bet.selection} @ ${bet.odds}`,
            betId: bet.id,
          },
        });

        // Log
        await prisma.botLog.create({
          data: {
            userId,
            action: "bet_settled",
            betId: bet.id,
            matchId: match.id,
            accumulatorId: bet.accumulatorId,
            details: JSON.stringify({ result: "lost", loss: effectiveStake }),
            reasoning: resultReason,
            profitImpact: -effectiveStake,
          },
        });

        settledBets.push({
          betId: bet.id,
          matchId: match.id,
          result: "lost",
          profit: -effectiveStake,
          commission: 0,
        });
      }

      // Update accumulator if part of one
      if (bet.accumulatorId) {
        await updateAccumulatorStatus(bet.accumulatorId, userId, commissionRate);
      }
    }

    return NextResponse.json({
      settled: settledBets.length,
      bets: settledBets,
      totalProfit: settledBets.reduce((sum, b) => sum + b.profit, 0),
      totalCommission: settledBets.reduce((sum, b) => sum + b.commission, 0),
    });
  } catch (error) {
    console.error("Settlement error:", error);
    return NextResponse.json({ error: "Failed to settle bets" }, { status: 500 });
  }
}

async function updateAccumulatorStatus(
  accumulatorId: string,
  userId: string,
  commissionRate: number
) {
  const accumulator = await prisma.accumulator.findUnique({
    where: { id: accumulatorId },
    include: { bets: true },
  });

  if (!accumulator) return;

  const allSettled = accumulator.bets.every(
    (b) => b.status === "won" || b.status === "lost" || b.status === "cashed_out"
  );

  if (!allSettled) return;

  const allWon = accumulator.bets.every((b) => b.status === "won");
  const anyLost = accumulator.bets.some((b) => b.status === "lost");

  if (allWon) {
    // Accumulator won - apply bonus
    const totalProfit = accumulator.bets.reduce((sum, b) => sum + (b.profit || 0), 0);
    const bonusAmount = totalProfit * (accumulator.bonusPercent || 0) / 100;
    const commission = (totalProfit + bonusAmount) * commissionRate;
    const netProfit = totalProfit + bonusAmount - commission;

    await prisma.accumulator.update({
      where: { id: accumulatorId },
      data: {
        status: "won",
        profit: Math.round(netProfit * 100) / 100,
        commission: Math.round(commission * 100) / 100,
        settledAt: new Date(),
      },
    });

    // Apply bonus to user
    if (bonusAmount > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          balance: { increment: bonusAmount },
          totalProfit: { increment: bonusAmount },
        },
      });

      await prisma.transaction.create({
        data: {
          userId,
          type: "accumulator_bonus",
          amount: bonusAmount,
          currency: "USD",
          status: "completed",
          description: `Accumulator bonus: ${accumulator.totalLegs} legs, ${accumulator.bonusPercent}% bonus`,
          accumulatorId,
        },
      });
    }
  } else if (anyLost) {
    // Accumulator lost
    await prisma.accumulator.update({
      where: { id: accumulatorId },
      data: {
        status: "lost",
        profit: -accumulator.stake,
        settledAt: new Date(),
      },
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    // Find bets that can be settled (match finished, bet still pending)
    const settleableBets = await prisma.bet.findMany({
      where: {
        userId,
        status: { in: ["pending", "partial_cashout"] },
        match: { status: "finished" },
      },
      include: { match: true },
    });

    // Find bets that need cashout evaluation (live matches)
    const liveBets = await prisma.bet.findMany({
      where: {
        userId,
        status: { in: ["pending", "partial_cashout"] },
        match: { status: "live" },
      },
      include: { match: true },
    });

    return NextResponse.json({
      settleable: settleableBets.length,
      settleableBets: settleableBets.map((b) => ({
        id: b.id,
        matchId: b.matchId,
        selection: b.selection,
        odds: b.odds,
        stake: b.stake,
        match: {
          homeTeam: b.match.homeTeam,
          awayTeam: b.match.awayTeam,
          homeScore: b.match.homeScore,
          awayScore: b.match.awayScore,
          status: b.match.status,
        },
      })),
      liveBets: liveBets.length,
      liveBetsList: liveBets.map((b) => ({
        id: b.id,
        matchId: b.matchId,
        selection: b.selection,
        odds: b.odds,
        stake: b.stake,
        match: {
          homeTeam: b.match.homeTeam,
          awayTeam: b.match.awayTeam,
          homeScore: b.match.homeScore,
          awayScore: b.match.awayScore,
          minute: b.match.minute,
          status: b.match.status,
        },
      })),
    });
  } catch (error) {
    console.error("Error fetching settlement status:", error);
    return NextResponse.json({ error: "Failed to fetch settlement status" }, { status: 500 });
  }
}
