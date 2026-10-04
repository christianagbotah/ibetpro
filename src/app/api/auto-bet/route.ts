import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import {
  analyzeMatch,
  shouldAutoBet,
  checkRiskLimits,
  isWithinBetSchedule,
} from "@/lib/ai-engine-v2";
import { placeBetOnBroker } from "@/lib/broker-integration";
import { requireAuth } from "@/lib/session";
import {
  AutoPlacementAccountingError,
  recordAutoAccumulatorPlacement,
  recordAutoSinglePlacement,
} from "@/lib/auto-bet-placement";
import { countTickets, sumTicketStake } from "@/lib/bet-accounting";

/**
 * Auto-Bet Bot Engine v2
 * POST /api/auto-bet - Scans matches and places bets automatically using broker allocation
 * GET /api/auto-bet - Get bot status and recent activity
 */

function recommendedSelection(
  recommended: string,
  homeTeam: string,
  awayTeam: string,
  overUnderLine = 2.5
) {
  return recommended === "home"
    ? homeTeam
    : recommended === "away"
      ? awayTeam
      : recommended === "draw"
        ? "Draw"
        : recommended === "over"
          ? `Over ${overUnderLine}`
          : `Under ${overUnderLine}`;
}

export async function POST() {
  try {
    const userId = await requireAuth();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { settings: true },
    });

    if (!user || !user.settings) {
      return NextResponse.json(
        { error: "User or settings not found" },
        { status: 404 }
      );
    }

    const settings = user.settings;

    // Real-money execution is intentionally fail-closed until a verified
    // bookmaker adapter confirms wager acceptance and exposes an immutable
    // external bet id. Real mode remains connectivity/advisor-only.
    if (settings.brokerMode === "real") {
      return NextResponse.json(
        {
          error:
            "Automated Real-mode execution is disabled until verified broker bet execution is enabled.",
          code: "REAL_AUTO_EXECUTION_DISABLED",
          betsPlaced: 0,
        },
        { status: 409 }
      );
    }

    if (!settings.autoBettingEnabled) {
      return NextResponse.json({ error: "Auto-betting is disabled", betsPlaced: 0 });
    }

    if (!isWithinBetSchedule(settings.betScheduleStart, settings.betScheduleEnd)) {
      await prisma.botLog.create({
        data: {
          userId,
          action: "schedule_blocked",
          details: JSON.stringify({
            schedule: `${settings.betScheduleStart}-${settings.betScheduleEnd}`,
          }),
          reasoning: `Current time is outside betting schedule (${settings.betScheduleStart} - ${settings.betScheduleEnd})`,
        },
      });
      return NextResponse.json({ error: "Outside betting schedule", betsPlaced: 0 });
    }

    const riskCheck = checkRiskLimits(user.dailyPnl, user.weeklyPnl, {
      stopLossDaily: settings.stopLossDaily,
      stopLossWeekly: settings.stopLossWeekly,
      profitTargetDaily: settings.profitTargetDaily,
      profitTargetWeekly: settings.profitTargetWeekly,
    });

    if (!riskCheck.canBet) {
      await prisma.botLog.create({
        data: {
          userId,
          action:
            user.dailyPnl <= -settings.stopLossDaily
              ? "stop_loss_hit"
              : "profit_target_hit",
          details: JSON.stringify({
            dailyPnl: user.dailyPnl,
            weeklyPnl: user.weeklyPnl,
          }),
          reasoning: riskCheck.reason,
        },
      });
      return NextResponse.json({ error: riskCheck.reason, betsPlaced: 0 });
    }

    const bettingAccount = await prisma.bettingAccount.findFirst({
      where: { userId, isConnected: true },
      orderBy: { allocatedAmount: "desc" },
    });

    if (!bettingAccount) {
      return NextResponse.json(
        {
          error:
            "No connected betting account found. Please connect a broker and set allocation.",
          betsPlaced: 0,
        },
        { status: 400 }
      );
    }

    if (bettingAccount.allocatedAmount <= 0) {
      return NextResponse.json(
        {
          error: "No allocation set. Please allocate funds from your broker account.",
          betsPlaced: 0,
        },
        { status: 400 }
      );
    }

    const activeAllocation = await prisma.allocation.findFirst({
      where: {
        userId,
        bettingAccountId: bettingAccount.id,
        status: "active",
      },
    });

    const availableAllocation =
      activeAllocation?.remainingAmount ?? bettingAccount.allocatedAmount;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayBets = await prisma.bet.findMany({
      where: {
        userId,
        placedAt: { gte: todayStart },
        status: {
          in: ["pending", "won", "lost", "cashed_out", "partial_cashout"],
        },
      },
      select: { matchId: true, stake: true, accumulatorId: true },
    });

    // Accumulator legs repeat the ticket stake, so count each accumulator only
    // once. Row-level summation previously multiplied daily stake by leg count.
    const dailyStake = sumTicketStake(todayBets);

    if (dailyStake >= settings.dailyBetLimit) {
      await prisma.botLog.create({
        data: {
          userId,
          action: "bet_skipped",
          reasoning: `Daily bet limit reached: ${dailyStake.toFixed(2)} / ${settings.dailyBetLimit.toFixed(2)}`,
        },
      });
      return NextResponse.json({ error: "Daily bet limit reached", betsPlaced: 0 });
    }

    const remainingDailyLimit = Math.min(
      settings.dailyBetLimit - dailyStake,
      availableAllocation,
      user.balance
    );

    if (remainingDailyLimit < 5) {
      return NextResponse.json(
        {
          error:
            "Insufficient bankroll, allocation, or daily limit remaining",
          betsPlaced: 0,
        },
        { status: 409 }
      );
    }

    const existingBetMatchIds = todayBets.map((bet) => bet.matchId);
    const upcomingMatches = await prisma.match.findMany({
      where: {
        status: "upcoming",
        sport: { in: settings.preferredSports.split(",") },
        commenceTime: { gte: new Date() },
        homeOdds: { gt: 1 },
        awayOdds: { gt: 1 },
        id: { notIn: existingBetMatchIds },
      },
      orderBy: { commenceTime: "asc" },
      take: 20,
    });

    if (upcomingMatches.length === 0) {
      return NextResponse.json({ message: "No suitable matches found", betsPlaced: 0 });
    }

    const betsPlaced: Array<{
      matchId: string;
      selection: string;
      odds: number;
      stake: number;
      confidence: number;
      reasoning: string;
      brokerBetId?: string;
    }> = [];

    const accumulatorLegs: Array<{
      matchId: string;
      match: NonNullable<(typeof upcomingMatches)[0]>;
      prediction: ReturnType<typeof analyzeMatch>;
      selection: string;
      odds: number;
    }> = [];

    for (const match of upcomingMatches) {
      const homeTeamStats = await prisma.teamStats.findFirst({
        where: { teamName: match.homeTeam, sport: match.sport },
      });
      const awayTeamStats = await prisma.teamStats.findFirst({
        where: { teamName: match.awayTeam, sport: match.sport },
      });

      const prediction = analyzeMatch(
        {
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          sport: match.sport,
          league: match.league,
          homeOdds: match.homeOdds,
          drawOdds: match.drawOdds ?? undefined,
          awayOdds: match.awayOdds,
          overOdds: match.overOdds ?? undefined,
          underOdds: match.underOdds ?? undefined,
          overUnderLine: match.overUnderLine ?? undefined,
          status: match.status,
          commenceTime: match.commenceTime.toISOString(),
        },
        homeTeamStats,
        awayTeamStats,
        user.bankroll,
        settings.kellyFraction
      );

      const autoBetCheck = shouldAutoBet(
        prediction,
        {
          minOddsThreshold: settings.minOddsThreshold,
          maxOddsThreshold: settings.maxOddsThreshold,
          minAiConfidence: settings.minAiConfidence,
          minEdgeThreshold: settings.minEdgeThreshold,
          riskLevel: settings.riskLevel,
          preferredSports: settings.preferredSports,
        },
        match.sport
      );

      const recOdds =
        prediction.recommended === "home"
          ? match.homeOdds
          : prediction.recommended === "away"
            ? match.awayOdds
            : prediction.recommended === "draw"
              ? match.drawOdds
              : prediction.recommended === "over"
                ? match.overOdds
                : prediction.recommended === "under"
                  ? match.underOdds
                  : null;

      if (recOdds == null || !Number.isFinite(recOdds) || recOdds <= 1) {
        await prisma.botLog.create({
          data: {
            userId,
            action: "bet_skipped",
            matchId: match.id,
            reasoning: "Recommended market odds are not available yet",
            confidence: prediction.confidence,
          },
        });
        continue;
      }

      if (
        recOdds < settings.minOddsThreshold ||
        recOdds > settings.maxOddsThreshold
      ) {
        await prisma.botLog.create({
          data: {
            userId,
            action: "bet_skipped",
            matchId: match.id,
            reasoning: `Odds ${recOdds} outside range ${settings.minOddsThreshold}-${settings.maxOddsThreshold}`,
            confidence: prediction.confidence,
          },
        });
        continue;
      }

      if (!autoBetCheck.shouldPlace) {
        await prisma.botLog.create({
          data: {
            userId,
            action: "bet_skipped",
            matchId: match.id,
            reasoning: autoBetCheck.reason,
            confidence: prediction.confidence,
          },
        });
        continue;
      }

      const betTypes = settings.betTypes.split(",");
      const selection = recommendedSelection(
        prediction.recommended,
        match.homeTeam,
        match.awayTeam,
        match.overUnderLine ?? 2.5
      );

      if (betTypes.includes("single")) {
        const alreadyPlacedStake = betsPlaced.reduce(
          (sum, placed) => sum + placed.stake,
          0
        );
        const stake = Math.min(
          autoBetCheck.suggestedStake || settings.maxBetAmount * 0.5,
          settings.maxBetAmount,
          remainingDailyLimit - alreadyPlacedStake
        );

        if (stake >= 5) {
          const potentialWin = Math.round(stake * recOdds * 100) / 100;

          const brokerResult = await placeBetOnBroker(
            bettingAccount.platform,
            bettingAccount.accessToken || "",
            {
              matchId: match.id,
              selection,
              odds: recOdds,
              stake,
              betType: "single",
            }
          );

          await recordAutoSinglePlacement({
            userId,
            bettingAccountId: bettingAccount.id,
            activeAllocationId: activeAllocation?.id,
            matchId: match.id,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            selection,
            odds: recOdds,
            stake,
            potentialWin,
            brokerBetId: brokerResult.brokerBetId,
            confidence: prediction.confidence,
            reasoning: autoBetCheck.reason,
            aiModelUsed: "v2_ensemble",
            kellyStake: prediction.kellyStake,
            valueEdge: prediction.valueEdge,
            riskScore: prediction.riskScore,
            aiHomeWinProb: prediction.homeWinProb,
            aiDrawProb: prediction.drawProb,
            aiAwayWinProb: prediction.awayWinProb,
            aiRecommended: prediction.recommended,
            aiAnalysis: prediction.analysis,
            aiRiskScore: prediction.riskScore,
            aiValueEdge: prediction.valueEdge,
            aiKellyStake: prediction.kellyStake,
          });

          betsPlaced.push({
            matchId: match.id,
            selection,
            odds: recOdds,
            stake,
            confidence: prediction.confidence,
            reasoning: autoBetCheck.reason,
            brokerBetId: brokerResult.brokerBetId,
          });
        }
      }

      if (betTypes.includes("accumulator") && prediction.confidence > 0.65) {
        accumulatorLegs.push({
          matchId: match.id,
          match,
          prediction,
          selection,
          odds: recOdds,
        });
      }
    }

    if (
      accumulatorLegs.length >= 2 &&
      accumulatorLegs.length <= settings.maxAccumulatorLegs
    ) {
      const singlesStake = betsPlaced.reduce(
        (sum, placed) => sum + placed.stake,
        0
      );
      const accaStake = Math.min(
        settings.maxBetAmount * 0.3,
        remainingDailyLimit - singlesStake,
        Math.max(0, availableAllocation - singlesStake) * 0.3
      );

      if (accaStake >= 5) {
        const totalOdds = accumulatorLegs.reduce(
          (product, leg) => product * leg.odds,
          1
        );
        const roundedTotalOdds = Math.round(totalOdds * 100) / 100;
        const basePotentialWin =
          Math.round(accaStake * totalOdds * 100) / 100;

        const bonusThresholds = [
          { legs: 4, bonus: 5 },
          { legs: 5, bonus: 10 },
          { legs: 6, bonus: 20 },
        ];
        let bonusPercent = 0;
        for (const threshold of bonusThresholds) {
          if (accumulatorLegs.length >= threshold.legs) {
            bonusPercent = threshold.bonus;
          }
        }

        const bonusAmount = basePotentialWin * (bonusPercent / 100);
        const totalPotentialWin =
          Math.round((basePotentialWin + bonusAmount) * 100) / 100;

        const brokerResult = await placeBetOnBroker(
          bettingAccount.platform,
          bettingAccount.accessToken || "",
          {
            matchId: accumulatorLegs[0].matchId,
            selection: `${accumulatorLegs.length}-leg accumulator`,
            odds: roundedTotalOdds,
            stake: accaStake,
            betType: "accumulator",
          }
        );

        const placement = await recordAutoAccumulatorPlacement({
          userId,
          bettingAccountId: bettingAccount.id,
          activeAllocationId: activeAllocation?.id,
          stake: accaStake,
          totalOdds: roundedTotalOdds,
          potentialWin: totalPotentialWin,
          bonusPercent,
          brokerBetId: brokerResult.brokerBetId,
          legs: accumulatorLegs.map((leg) => ({
            matchId: leg.matchId,
            homeTeam: leg.match.homeTeam,
            awayTeam: leg.match.awayTeam,
            selection: leg.selection,
            odds: leg.odds,
            confidence: leg.prediction.confidence,
            reasoning: leg.prediction.analysis,
            kellyStake: leg.prediction.kellyStake,
            valueEdge: leg.prediction.valueEdge,
            riskScore: leg.prediction.riskScore,
          })),
        });

        betsPlaced.push({
          matchId: "accumulator",
          selection: `${accumulatorLegs.length}-leg accumulator`,
          odds: roundedTotalOdds,
          stake: accaStake,
          confidence: placement.averageConfidence,
          reasoning: `Auto-placed ${accumulatorLegs.length}-leg accumulator`,
          brokerBetId: brokerResult.brokerBetId,
        });
      }
    }

    const newStake = betsPlaced.reduce((sum, bet) => sum + bet.stake, 0);

    return NextResponse.json({
      betsPlaced: betsPlaced.length,
      bets: betsPlaced,
      dailyStake: Math.round((dailyStake + newStake) * 100) / 100,
      remainingDailyLimit: Math.max(
        0,
        Math.round((remainingDailyLimit - newStake) * 100) / 100
      ),
      broker: bettingAccount.platform,
      currency: bettingAccount.currency || "USD",
      allocationUsed: newStake,
      remainingAllocation: Math.max(
        0,
        Math.round((availableAllocation - newStake) * 100) / 100
      ),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (error instanceof AutoPlacementAccountingError) {
      return NextResponse.json(
        { error: error.message, code: error.code, betsPlaced: 0 },
        { status: 409 }
      );
    }

    console.error("Auto-bet error:", error);
    return NextResponse.json({ error: "Failed to process auto-bet" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const userId = await requireAuth();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { settings: true },
    });

    if (!user || !user.settings) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const recentLogs = await prisma.botLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayBets = await prisma.bet.findMany({
      where: {
        userId,
        isAutoPlaced: true,
        placedAt: { gte: todayStart },
      },
      include: { match: true, bettingAccount: true },
    });

    const todayAutoBets = countTickets(todayBets);
    const todayAutoStake = sumTicketStake(todayBets);
    const todayAutoProfit = todayBets
      .filter((bet) => bet.status === "won" || bet.status === "cashed_out")
      .reduce((sum, bet) => sum + (bet.profit || 0), 0);

    const activeAllocation = await prisma.allocation.findFirst({
      where: { userId, status: "active" },
      include: { bettingAccount: true },
    });

    const todayCommission = await prisma.commissionLedger.findMany({
      where: {
        userId,
        createdAt: { gte: todayStart },
      },
    });

    return NextResponse.json({
      status: user.settings.autoBettingEnabled ? "active" : "inactive",
      settings: {
        autoBettingEnabled: user.settings.autoBettingEnabled,
        riskLevel: user.settings.riskLevel,
        dailyBetLimit: user.settings.dailyBetLimit,
        stopLossDaily: user.settings.stopLossDaily,
        profitTargetDaily: user.settings.profitTargetDaily,
        betTypes: user.settings.betTypes,
        maxAccumulatorLegs: user.settings.maxAccumulatorLegs,
        waitFullSettlement: user.settings.waitFullSettlement,
      },
      todayStats: {
        betsPlaced: todayAutoBets,
        totalStake: todayAutoStake,
        profit: todayAutoProfit,
        dailyPnl: user.dailyPnl,
        weeklyPnl: user.weeklyPnl,
      },
      allocation: activeAllocation
        ? {
            id: activeAllocation.id,
            amount: activeAllocation.amount,
            usedAmount: activeAllocation.usedAmount,
            remainingAmount: activeAllocation.remainingAmount,
            profitFromAlloc: activeAllocation.profitFromAlloc,
            commissionFromAlloc: activeAllocation.commissionFromAlloc,
            broker: activeAllocation.bettingAccount.platform,
            currency: activeAllocation.bettingAccount.currency || "USD",
          }
        : null,
      commission: {
        todayTotal: todayCommission.reduce(
          (sum, entry) => sum + entry.commissionAmount,
          0
        ),
        todayPending: todayCommission
          .filter((entry) => entry.status === "pending")
          .reduce((sum, entry) => sum + entry.commissionAmount, 0),
        todayTransferred: todayCommission
          .filter((entry) => entry.status === "transferred")
          .reduce((sum, entry) => sum + entry.commissionAmount, 0),
      },
      recentLogs,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    console.error("Error fetching bot status:", error);
    return NextResponse.json({ error: "Failed to fetch bot status" }, { status: 500 });
  }
}
