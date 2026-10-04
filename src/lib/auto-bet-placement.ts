import { prisma } from "./db";

export type AutoSinglePlacementInput = {
  userId: string;
  bettingAccountId: string;
  activeAllocationId?: string | null;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  selection: string;
  odds: number;
  stake: number;
  potentialWin: number;
  brokerBetId?: string;
  confidence: number;
  reasoning: string;
  aiModelUsed?: string;
  kellyStake?: number | null;
  valueEdge?: number | null;
  riskScore?: number | null;
  aiHomeWinProb?: number | null;
  aiDrawProb?: number | null;
  aiAwayWinProb?: number | null;
  aiRecommended?: string | null;
  aiAnalysis?: string | null;
  aiRiskScore?: number | null;
  aiValueEdge?: number | null;
  aiKellyStake?: number | null;
};

export type AutoAccumulatorLegInput = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  selection: string;
  odds: number;
  confidence: number;
  reasoning: string;
  kellyStake?: number | null;
  valueEdge?: number | null;
  riskScore?: number | null;
};

export type AutoAccumulatorPlacementInput = {
  userId: string;
  bettingAccountId: string;
  activeAllocationId?: string | null;
  stake: number;
  totalOdds: number;
  potentialWin: number;
  bonusPercent: number;
  legs: AutoAccumulatorLegInput[];
  brokerBetId?: string;
};

export class AutoPlacementAccountingError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "AutoPlacementAccountingError";
  }
}

function assertPositiveMoney(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new AutoPlacementAccountingError(
      "INVALID_PLACEMENT_AMOUNT",
      `${label} must be a positive finite number`
    );
  }
}

async function debitPlacementFunds(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  input: {
    userId: string;
    bettingAccountId: string;
    activeAllocationId?: string | null;
    stake: number;
  }
) {
  const userDebit = await tx.user.updateMany({
    where: {
      id: input.userId,
      balance: { gte: input.stake },
    },
    data: { balance: { decrement: input.stake } },
  });

  if (userDebit.count !== 1) {
    throw new AutoPlacementAccountingError(
      "INSUFFICIENT_INTERNAL_BALANCE",
      "Internal bankroll is insufficient for this auto-bet stake"
    );
  }

  if (input.activeAllocationId) {
    const allocationDebit = await tx.allocation.updateMany({
      where: {
        id: input.activeAllocationId,
        userId: input.userId,
        bettingAccountId: input.bettingAccountId,
        status: "active",
        remainingAmount: { gte: input.stake },
      },
      data: {
        usedAmount: { increment: input.stake },
        remainingAmount: { decrement: input.stake },
      },
    });

    if (allocationDebit.count !== 1) {
      throw new AutoPlacementAccountingError(
        "INSUFFICIENT_ALLOCATION",
        "Active allocation no longer has enough remaining funds"
      );
    }
  }

  const accountDebit = await tx.bettingAccount.updateMany({
    where: {
      id: input.bettingAccountId,
      userId: input.userId,
      isConnected: true,
      allocatedAmount: { gte: input.stake },
    },
    data: {
      allocatedAmount: { decrement: input.stake },
      allocationLock: true,
      lastBetPlacedAt: new Date(),
      totalBrokerBets: { increment: 1 },
    },
  });

  if (accountDebit.count !== 1) {
    throw new AutoPlacementAccountingError(
      "INSUFFICIENT_BROKER_ALLOCATION",
      "Connected betting account no longer has enough allocated funds"
    );
  }

  const account = await tx.bettingAccount.findUnique({
    where: { id: input.bettingAccountId },
    select: { currency: true, platform: true },
  });

  if (!account) {
    throw new AutoPlacementAccountingError(
      "BETTING_ACCOUNT_MISSING",
      "Betting account disappeared during placement"
    );
  }

  return account;
}

/**
 * Commit one accepted auto-bet as a single local accounting transaction.
 *
 * The broker/simulator call happens before this function. Every local money
 * mutation then succeeds together or rolls back together: user bankroll,
 * allocation, betting account, bet row, transaction ledger, match telemetry
 * and bot audit log.
 */
export async function recordAutoSinglePlacement(
  input: AutoSinglePlacementInput
) {
  assertPositiveMoney(input.stake, "Stake");
  assertPositiveMoney(input.odds, "Odds");
  assertPositiveMoney(input.potentialWin, "Potential win");

  return prisma.$transaction(async (tx) => {
    const account = await debitPlacementFunds(tx, input);

    const bet = await tx.bet.create({
      data: {
        userId: input.userId,
        bettingAccountId: input.bettingAccountId,
        matchId: input.matchId,
        betType: "single",
        selection: input.selection,
        odds: input.odds,
        stake: input.stake,
        potentialWin: input.potentialWin,
        isAutoPlaced: true,
        aiConfidence: input.confidence,
        aiReasoning: input.reasoning,
        aiModelUsed: input.aiModelUsed || "v2_ensemble",
        kellyStake: input.kellyStake ?? undefined,
        valueEdge: input.valueEdge ?? undefined,
        riskScore: input.riskScore ?? undefined,
      },
    });

    await tx.transaction.create({
      data: {
        userId: input.userId,
        type: "bet_placed",
        amount: -input.stake,
        currency: account.currency || "USD",
        status: "completed",
        description: `Auto-bet via ${account.platform}: ${input.homeTeam} vs ${input.awayTeam} - ${input.selection} @ ${input.odds}`,
        betId: bet.id,
      },
    });

    await tx.match.update({
      where: { id: input.matchId },
      data: {
        aiHomeWinProb: input.aiHomeWinProb ?? undefined,
        aiDrawProb: input.aiDrawProb ?? undefined,
        aiAwayWinProb: input.aiAwayWinProb ?? undefined,
        aiConfidence: input.confidence,
        aiRecommended: input.aiRecommended ?? undefined,
        aiAnalysis: input.aiAnalysis ?? undefined,
        aiRiskScore: input.aiRiskScore ?? undefined,
        aiValueEdge: input.aiValueEdge ?? undefined,
        aiKellyStake: input.aiKellyStake ?? undefined,
      },
    });

    await tx.botLog.create({
      data: {
        userId: input.userId,
        action: "bet_placed",
        matchId: input.matchId,
        betId: bet.id,
        details: JSON.stringify({
          stake: input.stake,
          odds: input.odds,
          selection: input.selection,
          potentialWin: input.potentialWin,
          broker: account.platform,
          brokerBetId: input.brokerBetId,
          accounting: "atomic",
        }),
        reasoning: input.reasoning,
        confidence: input.confidence,
        profitImpact: -input.stake,
      },
    });

    return {
      bet,
      currency: account.currency || "USD",
      platform: account.platform,
    };
  });
}

/**
 * Commit one accumulator ticket and all of its legs atomically. The ticket
 * stake is debited exactly once; leg rows retain that stake only as ticket
 * context and must never be row-summed for exposure or daily-limit accounting.
 */
export async function recordAutoAccumulatorPlacement(
  input: AutoAccumulatorPlacementInput
) {
  assertPositiveMoney(input.stake, "Accumulator stake");
  assertPositiveMoney(input.totalOdds, "Accumulator odds");
  assertPositiveMoney(input.potentialWin, "Accumulator potential win");

  if (input.legs.length < 2) {
    throw new AutoPlacementAccountingError(
      "INVALID_ACCUMULATOR",
      "Accumulator requires at least two legs"
    );
  }

  for (const leg of input.legs) {
    assertPositiveMoney(leg.odds, "Accumulator leg odds");
  }

  return prisma.$transaction(async (tx) => {
    const account = await debitPlacementFunds(tx, input);

    const accumulator = await tx.accumulator.create({
      data: {
        userId: input.userId,
        totalOdds: input.totalOdds,
        stake: input.stake,
        potentialWin: input.potentialWin,
        totalLegs: input.legs.length,
        completedLegs: 0,
        isAutoPlaced: true,
        bonusPercent: input.bonusPercent,
      },
    });

    for (const leg of input.legs) {
      await tx.bet.create({
        data: {
          userId: input.userId,
          bettingAccountId: input.bettingAccountId,
          matchId: leg.matchId,
          accumulatorId: accumulator.id,
          betType: "accumulator_leg",
          selection: leg.selection,
          odds: leg.odds,
          stake: input.stake,
          potentialWin: input.potentialWin,
          isAutoPlaced: true,
          aiConfidence: leg.confidence,
          aiReasoning: leg.reasoning,
          aiModelUsed: "v2_ensemble",
          kellyStake: leg.kellyStake ?? undefined,
          valueEdge: leg.valueEdge ?? undefined,
          riskScore: leg.riskScore ?? undefined,
        },
      });
    }

    await tx.transaction.create({
      data: {
        userId: input.userId,
        type: "bet_placed",
        amount: -input.stake,
        currency: account.currency || "USD",
        status: "completed",
        description: `Auto-bet via ${account.platform}: ${input.legs.length}-leg accumulator @ ${input.totalOdds.toFixed(2)}${input.bonusPercent > 0 ? ` (+${input.bonusPercent}% bonus)` : ""}`,
        accumulatorId: accumulator.id,
      },
    });

    const averageConfidence =
      input.legs.reduce((sum, leg) => sum + leg.confidence, 0) /
      input.legs.length;

    await tx.botLog.create({
      data: {
        userId: input.userId,
        action: "accumulator_created",
        accumulatorId: accumulator.id,
        details: JSON.stringify({
          legs: input.legs.length,
          totalOdds: input.totalOdds,
          stake: input.stake,
          bonusPercent: input.bonusPercent,
          broker: account.platform,
          brokerBetId: input.brokerBetId,
          accounting: "atomic",
          legMatches: input.legs.map(
            (leg) => `${leg.homeTeam} vs ${leg.awayTeam}`
          ),
        }),
        reasoning: `Created ${input.legs.length}-leg accumulator with total odds ${input.totalOdds.toFixed(2)}${input.bonusPercent > 0 ? ` and ${input.bonusPercent}% bonus` : ""}`,
        confidence: averageConfidence,
        profitImpact: -input.stake,
      },
    });

    return {
      accumulator,
      currency: account.currency || "USD",
      platform: account.platform,
      averageConfidence,
    };
  });
}
