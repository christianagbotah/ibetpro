import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { analyzeMatch, shouldAutoBet, checkRiskLimits, isWithinBetSchedule } from "@/lib/ai-engine-v2";
import { placeBetOnBroker, calculateCommission } from "@/lib/broker-integration";

/**
 * Auto-Bet Bot Engine v2
 * POST /api/auto-bet - Scans matches and places bets automatically using broker allocation
 * GET /api/auto-bet - Get bot status and recent activity
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { settings: true },
    });

    if (!user || !user.settings) {
      return NextResponse.json({ error: "User or settings not found" }, { status: 404 });
    }

    const settings = user.settings;

    if (!settings.autoBettingEnabled) {
      return NextResponse.json({ error: "Auto-betting is disabled", betsPlaced: 0 });
    }

    // Check if within bet schedule
    if (!isWithinBetSchedule(settings.betScheduleStart, settings.betScheduleEnd)) {
      await prisma.botLog.create({
        data: {
          userId,
          action: "schedule_blocked",
          details: JSON.stringify({ schedule: `${settings.betScheduleStart}-${settings.betScheduleEnd}` }),
          reasoning: `Current time is outside betting schedule (${settings.betScheduleStart} - ${settings.betScheduleEnd})`,
        },
      });
      return NextResponse.json({ error: "Outside betting schedule", betsPlaced: 0 });
    }

    // Check risk limits
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
          action: user.dailyPnl <= -settings.stopLossDaily ? "stop_loss_hit" : "profit_target_hit",
          details: JSON.stringify({ dailyPnl: user.dailyPnl, weeklyPnl: user.weeklyPnl }),
          reasoning: riskCheck.reason,
        },
      });
      return NextResponse.json({ error: riskCheck.reason, betsPlaced: 0 });
    }

    // Get connected betting account with allocation
    const bettingAccount = await prisma.bettingAccount.findFirst({
      where: { userId, isConnected: true },
      orderBy: { allocatedAmount: "desc" },
    });

    if (!bettingAccount) {
      return NextResponse.json({ error: "No connected betting account found. Please connect a broker and set allocation.", betsPlaced: 0 });
    }

    // Check allocation
    if (bettingAccount.allocatedAmount <= 0) {
      return NextResponse.json({ error: "No allocation set. Please allocate funds from your broker account.", betsPlaced: 0 });
    }

    // Check active allocation
    const activeAllocation = await prisma.allocation.findFirst({
      where: { userId, bettingAccountId: bettingAccount.id, status: "active" },
    });

    const availableAllocation = activeAllocation?.remainingAmount || bettingAccount.allocatedAmount;

    // Check daily bet limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayBets = await prisma.bet.findMany({
      where: {
        userId,
        placedAt: { gte: todayStart },
        status: { in: ["pending", "won", "lost", "cashed_out", "partial_cashout"] },
      },
    });
    const dailyStake = todayBets.reduce((sum, b) => sum + b.stake, 0);

    if (dailyStake >= settings.dailyBetLimit) {
      await prisma.botLog.create({
        data: {
          userId,
          action: "bet_skipped",
          reasoning: `Daily bet limit reached: $${dailyStake.toFixed(2)} / $${settings.dailyBetLimit.toFixed(2)}`,
        },
      });
      return NextResponse.json({ error: "Daily bet limit reached", betsPlaced: 0 });
    }

    const remainingDailyLimit = Math.min(
      settings.dailyBetLimit - dailyStake,
      availableAllocation
    );

    if (remainingDailyLimit < 5) {
      return NextResponse.json({ error: "Insufficient allocation or daily limit remaining", betsPlaced: 0 });
    }

    // Get upcoming matches that haven't been bet on yet
    const existingBetMatchIds = todayBets.map((b) => b.matchId);
    const upcomingMatches = await prisma.match.findMany({
      where: {
        status: "upcoming",
        sport: { in: settings.preferredSports.split(",") },
        commenceTime: { gte: new Date() },
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
      match: NonNullable<typeof upcomingMatches[0]>;
      prediction: ReturnType<typeof analyzeMatch>;
      selection: string;
      odds: number;
    }> = [];

    // Analyze each match
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

      const autoBetCheck = shouldAutoBet(prediction, {
        minOddsThreshold: settings.minOddsThreshold,
        maxOddsThreshold: settings.maxOddsThreshold,
        minAiConfidence: settings.minAiConfidence,
        minEdgeThreshold: settings.minEdgeThreshold,
        riskLevel: settings.riskLevel,
        preferredSports: settings.preferredSports,
      }, match.sport);

      const recOdds = prediction.recommended === "home" ? match.homeOdds
        : prediction.recommended === "away" ? match.awayOdds
        : match.drawOdds || 3.0;

      // Check odds range
      if (recOdds < settings.minOddsThreshold || recOdds > settings.maxOddsThreshold) {
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

      // Determine bet type
      const betTypes = settings.betTypes.split(",");

      if (betTypes.includes("single")) {
        const stake = Math.min(
          autoBetCheck.suggestedStake || settings.maxBetAmount * 0.5,
          settings.maxBetAmount,
          remainingDailyLimit - betsPlaced.reduce((s, b) => s + b.stake, 0)
        );

        if (stake < 5) continue;

        const selection = prediction.recommended === "home" ? match.homeTeam
          : prediction.recommended === "away" ? match.awayTeam
          : prediction.recommended === "draw" ? "Draw"
          : prediction.recommended === "over" ? "Over 2.5"
          : "Under 2.5";

        const potentialWin = Math.round(stake * recOdds * 100) / 100;

        // Place bet on broker
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

        const bet = await prisma.bet.create({
          data: {
            userId,
            bettingAccountId: bettingAccount.id,
            matchId: match.id,
            betType: "single",
            selection,
            odds: recOdds,
            stake,
            potentialWin,
            isAutoPlaced: true,
            aiConfidence: prediction.confidence,
            aiReasoning: prediction.analysis,
            aiModelUsed: "v2_ensemble",
            kellyStake: prediction.kellyStake,
            valueEdge: prediction.valueEdge,
            riskScore: prediction.riskScore,
          },
        });

        // Update allocation
        if (activeAllocation) {
          await prisma.allocation.update({
            where: { id: activeAllocation.id },
            data: {
              usedAmount: { increment: stake },
              remainingAmount: { decrement: stake },
            },
          });
        }

        // Update betting account
        await prisma.bettingAccount.update({
          where: { id: bettingAccount.id },
          data: {
            allocatedAmount: { decrement: stake },
            lastBetPlacedAt: new Date(),
            totalBrokerBets: { increment: 1 },
          },
        });

        await prisma.transaction.create({
          data: {
            userId,
            type: "bet_placed",
            amount: -stake,
            currency: "USD",
            status: "completed",
            description: `Auto-bet via ${bettingAccount.platform}: ${match.homeTeam} vs ${match.awayTeam} - ${selection} @ ${recOdds}`,
            betId: bet.id,
          },
        });

        await prisma.user.update({
          where: { id: userId },
          data: { balance: { decrement: stake } },
        });

        // Update match AI data
        await prisma.match.update({
          where: { id: match.id },
          data: {
            aiHomeWinProb: prediction.homeWinProb,
            aiDrawProb: prediction.drawProb,
            aiAwayWinProb: prediction.awayWinProb,
            aiConfidence: prediction.confidence,
            aiRecommended: prediction.recommended,
            aiAnalysis: prediction.analysis,
            aiRiskScore: prediction.riskScore,
            aiValueEdge: prediction.valueEdge,
            aiKellyStake: prediction.kellyStake,
          },
        });

        await prisma.botLog.create({
          data: {
            userId,
            action: "bet_placed",
            matchId: match.id,
            betId: bet.id,
            details: JSON.stringify({
              stake,
              odds: recOdds,
              selection,
              potentialWin,
              broker: bettingAccount.platform,
              brokerBetId: brokerResult.brokerBetId,
              allocationUsed: stake,
            }),
            reasoning: autoBetCheck.reason,
            confidence: prediction.confidence,
            profitImpact: -stake,
          },
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

      // Collect legs for accumulator if enabled
      if (betTypes.includes("accumulator") && prediction.confidence > 0.65) {
        accumulatorLegs.push({
          matchId: match.id,
          match,
          prediction,
          selection: prediction.recommended === "home" ? match.homeTeam
            : prediction.recommended === "away" ? match.awayTeam
            : "Draw",
          odds: recOdds,
        });
      }
    }

    // Create accumulator if enough legs
    if (accumulatorLegs.length >= 2 && accumulatorLegs.length <= settings.maxAccumulatorLegs) {
      const accaStake = Math.min(
        settings.maxBetAmount * 0.3,
        remainingDailyLimit - betsPlaced.reduce((s, b) => s + b.stake, 0),
        availableAllocation * 0.3
      );

      if (accaStake >= 5) {
        const totalOdds = accumulatorLegs.reduce((prod, leg) => prod * leg.odds, 1);
        const potentialWin = Math.round(accaStake * totalOdds * 100) / 100;

        const bonusThresholds = [
          { legs: 4, bonus: 5 },
          { legs: 5, bonus: 10 },
          { legs: 6, bonus: 20 },
        ];
        let bonusPercent = 0;
        for (const t of bonusThresholds) {
          if (accumulatorLegs.length >= t.legs) bonusPercent = t.bonus;
        }

        const bonusAmount = potentialWin * (bonusPercent / 100);

        const accumulator = await prisma.accumulator.create({
          data: {
            userId,
            totalOdds: Math.round(totalOdds * 100) / 100,
            stake: accaStake,
            potentialWin: potentialWin + bonusAmount,
            totalLegs: accumulatorLegs.length,
            completedLegs: 0,
            isAutoPlaced: true,
            bonusPercent,
          },
        });

        for (const leg of accumulatorLegs) {
          await prisma.bet.create({
            data: {
              userId,
              bettingAccountId: bettingAccount.id,
              matchId: leg.matchId,
              accumulatorId: accumulator.id,
              betType: "accumulator_leg",
              selection: leg.selection,
              odds: leg.odds,
              stake: accaStake,
              potentialWin: potentialWin + bonusAmount,
              isAutoPlaced: true,
              aiConfidence: leg.prediction.confidence,
              aiReasoning: leg.prediction.analysis,
              aiModelUsed: "v2_ensemble",
              kellyStake: leg.prediction.kellyStake,
              valueEdge: leg.prediction.valueEdge,
              riskScore: leg.prediction.riskScore,
            },
          });
        }

        // Update allocation
        if (activeAllocation) {
          await prisma.allocation.update({
            where: { id: activeAllocation.id },
            data: {
              usedAmount: { increment: accaStake },
              remainingAmount: { decrement: accaStake },
            },
          });
        }

        await prisma.bettingAccount.update({
          where: { id: bettingAccount.id },
          data: {
            allocatedAmount: { decrement: accaStake },
            lastBetPlacedAt: new Date(),
            totalBrokerBets: { increment: 1 },
          },
        });

        await prisma.transaction.create({
          data: {
            userId,
            type: "bet_placed",
            amount: -accaStake,
            currency: "USD",
            status: "completed",
            description: `Auto-bet via ${bettingAccount.platform}: ${accumulatorLegs.length}-leg accumulator @ ${totalOdds.toFixed(2)}${bonusPercent > 0 ? ` (+${bonusPercent}% bonus)` : ""}`,
            accumulatorId: accumulator.id,
          },
        });

        await prisma.user.update({
          where: { id: userId },
          data: { balance: { decrement: accaStake } },
        });

        await prisma.botLog.create({
          data: {
            userId,
            action: "accumulator_created",
            accumulatorId: accumulator.id,
            details: JSON.stringify({
              legs: accumulatorLegs.length,
              totalOdds,
              stake: accaStake,
              bonusPercent,
              broker: bettingAccount.platform,
              legMatches: accumulatorLegs.map((l) => `${l.match.homeTeam} vs ${l.match.awayTeam}`).join(", "),
            }),
            reasoning: `Created ${accumulatorLegs.length}-leg accumulator with total odds ${totalOdds.toFixed(2)}${bonusPercent > 0 ? ` and ${bonusPercent}% bonus` : ""}`,
            confidence: accumulatorLegs.reduce((s, l) => s + l.prediction.confidence, 0) / accumulatorLegs.length,
            profitImpact: -accaStake,
          },
        });

        betsPlaced.push({
          matchId: "accumulator",
          selection: `${accumulatorLegs.length}-leg accumulator`,
          odds: totalOdds,
          stake: accaStake,
          confidence: accumulatorLegs.reduce((s, l) => s + l.prediction.confidence, 0) / accumulatorLegs.length,
          reasoning: `Auto-placed ${accumulatorLegs.length}-leg accumulator`,
        });
      }
    }

    return NextResponse.json({
      betsPlaced: betsPlaced.length,
      bets: betsPlaced,
      dailyStake: dailyStake + betsPlaced.reduce((s, b) => s + b.stake, 0),
      remainingDailyLimit: remainingDailyLimit - betsPlaced.reduce((s, b) => s + b.stake, 0),
      broker: bettingAccount.platform,
      allocationUsed: betsPlaced.reduce((s, b) => s + b.stake, 0),
      remainingAllocation: (activeAllocation?.remainingAmount || bettingAccount.allocatedAmount) - betsPlaced.reduce((s, b) => s + b.stake, 0),
    });
  } catch (error) {
    console.error("Auto-bet error:", error);
    return NextResponse.json({ error: "Failed to process auto-bet" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

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

    const todayAutoBets = todayBets.length;
    const todayAutoStake = todayBets.reduce((sum, b) => sum + b.stake, 0);
    const todayAutoProfit = todayBets
      .filter((b) => b.status === "won" || b.status === "cashed_out")
      .reduce((sum, b) => sum + (b.profit || 0), 0);

    // Get allocation info
    const activeAllocation = await prisma.allocation.findFirst({
      where: { userId, status: "active" },
      include: { bettingAccount: true },
    });

    // Get commission info
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
      allocation: activeAllocation ? {
        id: activeAllocation.id,
        amount: activeAllocation.amount,
        usedAmount: activeAllocation.usedAmount,
        remainingAmount: activeAllocation.remainingAmount,
        profitFromAlloc: activeAllocation.profitFromAlloc,
        commissionFromAlloc: activeAllocation.commissionFromAlloc,
        broker: activeAllocation.bettingAccount.platform,
      } : null,
      commission: {
        todayTotal: todayCommission.reduce((s, c) => s + c.commissionAmount, 0),
        todayPending: todayCommission.filter((c) => c.status === "pending").reduce((s, c) => s + c.commissionAmount, 0),
        todayTransferred: todayCommission.filter((c) => c.status === "transferred").reduce((s, c) => s + c.commissionAmount, 0),
      },
      recentLogs,
    });
  } catch (error) {
    console.error("Error fetching bot status:", error);
    return NextResponse.json({ error: "Failed to fetch bot status" }, { status: 500 });
  }
}
