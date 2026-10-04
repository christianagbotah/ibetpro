import { prisma } from "./db";
import { config } from "./config";
import { getRemainingExposure, money } from "./bet-exposure";
import type { Prisma } from "@/generated/prisma/client";

export type SettlementStatus = "won" | "lost" | "void";

export type SettlementOutcome = {
  supported: boolean;
  result: SettlementStatus | null;
  reason: string;
};

export type SettlementResult = {
  betId: string;
  userId: string;
  settled: boolean;
  skipped?: boolean;
  result?: SettlementStatus;
  profit?: number;
  commission?: number;
  payout?: number;
  reason?: string;
  accumulatorId?: string | null;
};

type OutcomeBet = {
  betType: string;
  selection: string;
};

type OutcomeMatch = {
  status?: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
};

const OPEN_BET_STATUSES = ["pending", "partial_cashout"];
const READY_MATCH_STATUSES = ["finished", "cancelled", "void"];

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function commissionRate(value: number | null | undefined) {
  const parsed = Number(value ?? config.commission.defaultRate);
  if (!Number.isFinite(parsed)) return config.commission.defaultRate;
  return Math.min(1, Math.max(0, parsed));
}

function supported(
  result: SettlementStatus,
  reason: string
): SettlementOutcome {
  return { supported: true, result, reason };
}

function unsupported(reason: string): SettlementOutcome {
  return { supported: false, result: null, reason };
}

function isHomeSelection(selection: string, match: OutcomeMatch) {
  const value = normalize(selection);
  return (
    value === normalize(match.homeTeam) ||
    value === "home" ||
    value === "1"
  );
}

function isAwaySelection(selection: string, match: OutcomeMatch) {
  const value = normalize(selection);
  return (
    value === normalize(match.awayTeam) ||
    value === "away" ||
    value === "2"
  );
}

function evaluateWinner(selection: string, match: OutcomeMatch) {
  const homeScore = match.homeScore!;
  const awayScore = match.awayScore!;

  if (isHomeSelection(selection, match)) {
    const won = homeScore > awayScore;
    return supported(
      won ? "won" : "lost",
      won
        ? `${match.homeTeam} won ${homeScore}-${awayScore}`
        : `${match.homeTeam} did not win (${homeScore}-${awayScore})`
    );
  }

  if (isAwaySelection(selection, match)) {
    const won = awayScore > homeScore;
    return supported(
      won ? "won" : "lost",
      won
        ? `${match.awayTeam} won ${awayScore}-${homeScore}`
        : `${match.awayTeam} did not win (${homeScore}-${awayScore})`
    );
  }

  if (["draw", "x"].includes(normalize(selection))) {
    const won = homeScore === awayScore;
    return supported(
      won ? "won" : "lost",
      won
        ? `Match drawn ${homeScore}-${awayScore}`
        : `Match not drawn (${homeScore}-${awayScore})`
    );
  }

  return null;
}

function evaluateTotals(selection: string, match: OutcomeMatch) {
  const parsed = selection.match(/^(Over|Under)\s+(\d+(?:\.\d+)?)$/i);
  if (!parsed) return null;

  const totalGoals = match.homeScore! + match.awayScore!;
  const direction = parsed[1].toLowerCase();
  const line = Number(parsed[2]);

  if (totalGoals === line) {
    return supported(
      "void",
      `Total goals ${totalGoals} pushed ${selection}; stake is refunded`
    );
  }

  const won = direction === "over" ? totalGoals > line : totalGoals < line;
  return supported(
    won ? "won" : "lost",
    won
      ? `Total goals ${totalGoals} won ${selection}`
      : `Total goals ${totalGoals} lost ${selection}`
  );
}

function evaluateBtts(selection: string, match: OutcomeMatch) {
  const value = normalize(selection)
    .replace(/^both teams to score\s*/, "")
    .replace(/^btts\s*/, "")
    .replace(/^:\s*/, "");

  if (!["yes", "no"].includes(value)) return null;

  const bothScored = match.homeScore! > 0 && match.awayScore! > 0;
  const wanted = value === "yes";
  return supported(
    wanted === bothScored ? "won" : "lost",
    `BTTS ${wanted ? "Yes" : "No"}: final score ${match.homeScore}-${match.awayScore}`
  );
}

function evaluateDoubleChance(selection: string, match: OutcomeMatch) {
  const value = normalize(selection)
    .replace(/\s+or\s+/g, "/")
    .replace(/\s*\/\s*/g, "/");

  const homeWon = match.homeScore! > match.awayScore!;
  const draw = match.homeScore === match.awayScore;
  const awayWon = match.awayScore! > match.homeScore!;

  let won: boolean | null = null;
  if (["1x", "home/draw", "home/x"].includes(value)) won = homeWon || draw;
  if (["x2", "draw/away", "x/away"].includes(value)) won = draw || awayWon;
  if (["12", "home/away"].includes(value)) won = homeWon || awayWon;

  if (won == null) return null;
  return supported(
    won ? "won" : "lost",
    `Double chance ${selection}: final score ${match.homeScore}-${match.awayScore}`
  );
}

function evaluateDrawNoBet(selection: string, match: OutcomeMatch) {
  if (match.homeScore === match.awayScore) {
    return supported("void", "Draw-no-bet pushed; stake is refunded");
  }
  return evaluateWinner(selection, match);
}

function evaluateHandicap(selection: string, match: OutcomeMatch) {
  const parsed = selection.match(/^(.*?)\s*([+-]\d+(?:\.\d+)?)$/);
  if (!parsed) return null;

  const teamToken = parsed[1].trim();
  const handicap = Number(parsed[2]);
  if (!Number.isFinite(handicap)) return null;

  // Quarter-goal Asian handicaps need split-stake settlement and are left for
  // an explicit implementation rather than being guessed.
  const twiceLine = Math.abs(handicap * 2);
  if (Math.abs(twiceLine - Math.round(twiceLine)) > 1e-9) return null;

  let selectedScore: number;
  let opponentScore: number;

  if (isHomeSelection(teamToken, match)) {
    selectedScore = match.homeScore!;
    opponentScore = match.awayScore!;
  } else if (isAwaySelection(teamToken, match)) {
    selectedScore = match.awayScore!;
    opponentScore = match.homeScore!;
  } else {
    return null;
  }

  const adjusted = selectedScore + handicap;
  if (adjusted === opponentScore) {
    return supported("void", `Handicap ${selection} pushed; stake is refunded`);
  }

  return supported(
    adjusted > opponentScore ? "won" : "lost",
    `Handicap ${selection}: final score ${match.homeScore}-${match.awayScore}`
  );
}

export function evaluateBetOutcome(
  bet: OutcomeBet,
  match: OutcomeMatch
): SettlementOutcome {
  const matchStatus = normalize(match.status || "");
  if (["cancelled", "void"].includes(matchStatus)) {
    return supported(
      "void",
      `Match status is ${match.status}; remaining stake is refunded`
    );
  }

  if (match.homeScore == null || match.awayScore == null) {
    return unsupported("Final score is unavailable.");
  }

  const type = normalize(bet.betType);

  if (type === "match_winner") {
    return (
      evaluateWinner(bet.selection, match) ??
      unsupported(`Unsupported winner selection: ${bet.selection}`)
    );
  }

  if (type === "over_under") {
    return (
      evaluateTotals(bet.selection, match) ??
      unsupported(`Unsupported totals selection: ${bet.selection}`)
    );
  }

  if (type === "both_teams_score") {
    return (
      evaluateBtts(bet.selection, match) ??
      unsupported(`Unsupported BTTS selection: ${bet.selection}`)
    );
  }

  if (type === "double_chance") {
    return (
      evaluateDoubleChance(bet.selection, match) ??
      unsupported(`Unsupported double-chance selection: ${bet.selection}`)
    );
  }

  if (type === "draw_no_bet") {
    return (
      evaluateDrawNoBet(bet.selection, match) ??
      unsupported(`Unsupported draw-no-bet selection: ${bet.selection}`)
    );
  }

  if (type === "handicap") {
    return (
      evaluateHandicap(bet.selection, match) ??
      unsupported(`Unsupported handicap selection: ${bet.selection}`)
    );
  }

  // Legacy bot singles and accumulator legs encode the market in selection.
  if (type === "single" || type === "accumulator_leg") {
    return (
      evaluateWinner(bet.selection, match) ??
      evaluateTotals(bet.selection, match) ??
      evaluateBtts(bet.selection, match) ??
      evaluateDoubleChance(bet.selection, match) ??
      evaluateDrawNoBet(bet.selection, match) ??
      evaluateHandicap(bet.selection, match) ??
      unsupported(
        `Unsupported market/selection: ${bet.betType} · ${bet.selection}`
      )
    );
  }

  return unsupported(
    `Unsupported market/selection: ${bet.betType} · ${bet.selection}`
  );
}

function bonusPercentForLegs(legs: number) {
  if (legs >= 6) return 20;
  if (legs >= 5) return 10;
  if (legs >= 4) return 5;
  return 0;
}

async function currentUsedExposure(
  tx: Prisma.TransactionClient,
  userId: string,
  bettingAccountId: string
) {
  const [standaloneBets, accumulators] = await Promise.all([
    tx.bet.findMany({
      where: {
        userId,
        bettingAccountId,
        accumulatorId: null,
        status: { in: OPEN_BET_STATUSES },
      },
      select: {
        stake: true,
        potentialWin: true,
        partialCashoutPercent: true,
        partialCashoutAmount: true,
      },
    }),
    tx.accumulator.findMany({
      where: {
        userId,
        status: { in: ["pending", "partial_cashout"] },
        bets: { some: { bettingAccountId } },
      },
      select: { stake: true },
    }),
  ]);

  const singlesExposure = standaloneBets.reduce(
    (sum, bet) => sum + getRemainingExposure(bet).remainingStake,
    0
  );
  const accumulatorExposure = accumulators.reduce(
    (sum, accumulator) => sum + Math.max(0, accumulator.stake),
    0
  );

  return money(singlesExposure + accumulatorExposure);
}

async function updateAccountAfterResolution(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    bettingAccountId: string;
    payout: number;
    incrementalProfit: number;
    commission: number;
  }
) {
  const allocation = await tx.allocation.findFirst({
    where: {
      userId: input.userId,
      bettingAccountId: input.bettingAccountId,
      status: "active",
    },
  });

  const usedExposure = await currentUsedExposure(
    tx,
    input.userId,
    input.bettingAccountId
  );

  if (allocation) {
    await tx.allocation.update({
      where: { id: allocation.id },
      data: {
        usedAmount: usedExposure,
        remainingAmount: { increment: money(input.payout) },
        profitFromAlloc: { increment: money(input.incrementalProfit) },
        commissionFromAlloc: { increment: money(input.commission) },
      },
    });
  }

  await tx.bettingAccount.update({
    where: { id: input.bettingAccountId },
    data: {
      allocatedAmount: { increment: money(input.payout) },
      totalBrokerProfit: { increment: money(input.incrementalProfit) },
      allocationLock: usedExposure > 0,
    },
  });
}

async function createCommissionLedger(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    bettingAccountId: string;
    betId?: string | null;
    accumulatorId?: string | null;
    grossProfit: number;
    rate: number;
    commission: number;
    netProfit: number;
  }
) {
  if (input.commission <= 0) return;

  await tx.commissionLedger.create({
    data: {
      userId: input.userId,
      bettingAccountId: input.bettingAccountId,
      betId: input.betId ?? null,
      accumulatorId: input.accumulatorId ?? null,
      grossProfit: money(Math.max(0, input.grossProfit)),
      commissionRate: input.rate,
      commissionAmount: money(input.commission),
      netProfit: money(input.netProfit),
      status: "pending",
    },
  });
}

async function settleStandaloneBet(
  betId: string,
  userId: string,
  outcome: SettlementOutcome,
  rate: number
): Promise<SettlementResult> {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.bet.updateMany({
      where: {
        id: betId,
        userId,
        status: { in: OPEN_BET_STATUSES },
      },
      data: { status: "settling" },
    });

    if (claim.count !== 1) {
      return {
        betId,
        userId,
        settled: false,
        skipped: true,
        reason: "Bet was already claimed or settled.",
      };
    }

    const bet = await tx.bet.findUnique({
      where: { id: betId },
      include: {
        match: true,
        bettingAccount: true,
      },
    });

    if (!bet || !bet.match || !outcome.result) {
      throw new Error("Bet disappeared or lost its settlement outcome");
    }

    const exposure = getRemainingExposure(bet);
    const priorProfit = money(bet.profit || 0);
    const priorCommission = money(bet.commission || 0);
    const now = new Date();

    let payout = 0;
    let grossProfit = 0;
    let incrementalProfit = 0;
    let commission = 0;

    if (outcome.result === "won") {
      grossProfit = money(
        exposure.remainingPotentialWin - exposure.remainingStake
      );
      commission = money(Math.max(0, grossProfit) * rate);
      incrementalProfit = money(grossProfit - commission);
      payout = money(exposure.remainingPotentialWin - commission);
    } else if (outcome.result === "lost") {
      grossProfit = money(-exposure.remainingStake);
      incrementalProfit = grossProfit;
    } else {
      payout = money(exposure.remainingStake);
    }

    const cumulativeProfit = money(priorProfit + incrementalProfit);
    const cumulativeCommission = money(priorCommission + commission);

    await tx.bet.update({
      where: { id: bet.id },
      data: {
        status: outcome.result,
        profit: cumulativeProfit,
        commission: cumulativeCommission,
        settledAt: now,
        settlementReason:
          outcome.result === "void" ? "void_match" : "match_finished",
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        balance: payout > 0 ? { increment: payout } : undefined,
        totalProfit:
          incrementalProfit > 0
            ? { increment: incrementalProfit }
            : undefined,
        totalLoss:
          incrementalProfit < 0
            ? { increment: Math.abs(incrementalProfit) }
            : undefined,
        commissionPaid:
          commission > 0 ? { increment: commission } : undefined,
        dailyPnl:
          incrementalProfit !== 0
            ? { increment: incrementalProfit }
            : undefined,
        weeklyPnl:
          incrementalProfit !== 0
            ? { increment: incrementalProfit }
            : undefined,
      },
    });

    const transactionType =
      outcome.result === "won"
        ? "bet_won"
        : outcome.result === "lost"
          ? "bet_lost"
          : "bet_void";

    await tx.transaction.create({
      data: {
        userId,
        type: transactionType,
        amount:
          outcome.result === "won"
            ? money(exposure.remainingPotentialWin)
            : outcome.result === "void"
              ? payout
              : 0,
        currency: bet.bettingAccount.currency || "USD",
        status: "completed",
        description:
          outcome.result === "void"
            ? `Bet void/refund: ${bet.match.homeTeam} vs ${bet.match.awayTeam} - ${bet.selection}`
            : `Bet ${outcome.result}: ${bet.match.homeTeam} vs ${bet.match.awayTeam} - ${bet.selection} @ ${bet.odds}`,
        betId: bet.id,
      },
    });

    if (commission > 0) {
      await tx.transaction.create({
        data: {
          userId,
          type: "commission",
          amount: -commission,
          currency: bet.bettingAccount.currency || "USD",
          status: "completed",
          description: `Commission ${Math.round(rate * 100)}% on ${grossProfit.toFixed(2)} profit`,
          betId: bet.id,
        },
      });

      await createCommissionLedger(tx, {
        userId,
        bettingAccountId: bet.bettingAccountId,
        betId: bet.id,
        grossProfit,
        rate,
        commission,
        netProfit: incrementalProfit,
      });
    }

    await updateAccountAfterResolution(tx, {
      userId,
      bettingAccountId: bet.bettingAccountId,
      payout,
      incrementalProfit,
      commission,
    });

    await tx.botLog.create({
      data: {
        userId,
        action: "bet_settled",
        betId: bet.id,
        matchId: bet.matchId,
        details: JSON.stringify({
          r: outcome.result,
          rs: exposure.remainingStake,
          rw: exposure.remainingPotentialWin,
          pp: priorProfit,
          ip: incrementalProfit,
          cp: cumulativeProfit,
          c: commission,
          p: payout,
          idem: true,
        }),
        reasoning: outcome.reason,
        profitImpact: incrementalProfit,
      },
    });

    return {
      betId,
      userId,
      settled: true,
      result: outcome.result,
      profit: incrementalProfit,
      commission,
      payout,
      reason: outcome.reason,
    };
  });
}

async function settleAccumulatorIfReady(
  accumulatorId: string,
  userId: string,
  rate: number
): Promise<void> {
  const accumulator = await prisma.accumulator.findFirst({
    where: { id: accumulatorId, userId },
    include: {
      bets: {
        include: { bettingAccount: true },
        orderBy: { placedAt: "asc" },
      },
    },
  });

  if (!accumulator || accumulator.status !== "pending") return;

  const resolvedStatuses = new Set(["won", "lost", "void"]);
  const completedLegs = accumulator.bets.filter((bet) =>
    resolvedStatuses.has(bet.status)
  ).length;

  await prisma.accumulator.update({
    where: { id: accumulator.id },
    data: { completedLegs },
  });

  // Partial cashout of a single accumulator leg is not a valid ticket-level
  // accounting model. Leave any historical mixed ticket for manual review.
  if (
    accumulator.bets.some(
      (bet) =>
        bet.status === "cashed_out" ||
        (bet.partialCashoutAmount ?? 0) > 0
    )
  ) {
    return;
  }

  const anyLost = accumulator.bets.some((bet) => bet.status === "lost");
  const allResolved =
    accumulator.bets.length > 0 &&
    accumulator.bets.every((bet) => resolvedStatuses.has(bet.status));

  if (!anyLost && !allResolved) return;

  await prisma.$transaction(async (tx) => {
    const claim = await tx.accumulator.updateMany({
      where: {
        id: accumulator.id,
        userId,
        status: "pending",
      },
      data: { status: "settling", completedLegs },
    });

    if (claim.count !== 1) return;

    const fresh = await tx.accumulator.findUnique({
      where: { id: accumulator.id },
      include: {
        bets: {
          include: { bettingAccount: true },
          orderBy: { placedAt: "asc" },
        },
      },
    });

    if (!fresh || fresh.bets.length === 0) {
      throw new Error("Accumulator disappeared during settlement");
    }

    const firstLeg = fresh.bets[0];
    const bettingAccountId = firstLeg.bettingAccountId;
    const currency = firstLeg.bettingAccount.currency || "USD";
    const now = new Date();

    let finalStatus: SettlementStatus;
    let grossPayout = 0;
    let grossProfit = 0;
    let commission = 0;
    let incrementalProfit = 0;
    let payout = 0;

    if (fresh.bets.some((bet) => bet.status === "lost")) {
      finalStatus = "lost";
      grossProfit = money(-fresh.stake);
      incrementalProfit = grossProfit;
    } else {
      const winningLegs = fresh.bets.filter((bet) => bet.status === "won");
      if (winningLegs.length === 0) {
        finalStatus = "void";
        payout = money(fresh.stake);
        grossPayout = payout;
      } else {
        finalStatus = "won";
        const effectiveOdds = winningLegs.reduce(
          (product, bet) => product * bet.odds,
          1
        );
        const effectiveBonus = bonusPercentForLegs(winningLegs.length);
        grossPayout = money(
          fresh.stake *
            effectiveOdds *
            (1 + effectiveBonus / 100)
        );
        grossProfit = money(grossPayout - fresh.stake);
        commission = money(Math.max(0, grossProfit) * rate);
        incrementalProfit = money(grossProfit - commission);
        payout = money(grossPayout - commission);
      }
    }

    await tx.accumulator.update({
      where: { id: fresh.id },
      data: {
        status: finalStatus,
        potentialWin:
          finalStatus === "won" ? grossPayout : fresh.potentialWin,
        profit: incrementalProfit,
        commission,
        settledAt: now,
        completedLegs,
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        balance: payout > 0 ? { increment: payout } : undefined,
        totalProfit:
          incrementalProfit > 0
            ? { increment: incrementalProfit }
            : undefined,
        totalLoss:
          incrementalProfit < 0
            ? { increment: Math.abs(incrementalProfit) }
            : undefined,
        commissionPaid:
          commission > 0 ? { increment: commission } : undefined,
        dailyPnl:
          incrementalProfit !== 0
            ? { increment: incrementalProfit }
            : undefined,
        weeklyPnl:
          incrementalProfit !== 0
            ? { increment: incrementalProfit }
            : undefined,
      },
    });

    await tx.transaction.create({
      data: {
        userId,
        type:
          finalStatus === "won"
            ? "bet_won"
            : finalStatus === "lost"
              ? "bet_lost"
              : "bet_void",
        amount: finalStatus === "lost" ? 0 : grossPayout,
        currency,
        status: "completed",
        description:
          finalStatus === "void"
            ? `Accumulator void/refund: ${fresh.totalLegs} legs`
            : `Accumulator ${finalStatus}: ${fresh.totalLegs} legs @ ${fresh.totalOdds.toFixed(2)}`,
        accumulatorId: fresh.id,
      },
    });

    if (commission > 0) {
      await tx.transaction.create({
        data: {
          userId,
          type: "commission",
          amount: -commission,
          currency,
          status: "completed",
          description: `Commission on accumulator profit: ${winningLegsCount(fresh.bets)} effective winning legs`,
          accumulatorId: fresh.id,
        },
      });

      await createCommissionLedger(tx, {
        userId,
        bettingAccountId,
        accumulatorId: fresh.id,
        grossProfit,
        rate,
        commission,
        netProfit: incrementalProfit,
      });
    }

    await updateAccountAfterResolution(tx, {
      userId,
      bettingAccountId,
      payout,
      incrementalProfit,
      commission,
    });

    await tx.botLog.create({
      data: {
        userId,
        action: "accumulator_settled",
        accumulatorId: fresh.id,
        details: JSON.stringify({
          r: finalStatus,
          s: fresh.stake,
          p: payout,
          gp: grossProfit,
          c: commission,
          np: incrementalProfit,
          done: completedLegs,
          voids: fresh.bets.filter((bet) => bet.status === "void").length,
        }),
        reasoning:
          finalStatus === "lost"
            ? "At least one accumulator leg lost."
            : finalStatus === "void"
              ? "All accumulator legs were void; stake refunded."
              : "All non-void accumulator legs won; void legs were removed from effective odds.",
        profitImpact: incrementalProfit,
      },
    });
  });
}

function winningLegsCount(
  bets: Array<{ status: string }>
) {
  return bets.filter((bet) => bet.status === "won").length;
}

async function settleAccumulatorLeg(
  betId: string,
  userId: string,
  outcome: SettlementOutcome,
  rate: number
): Promise<SettlementResult> {
  let accumulatorId: string | null = null;

  const settled = await prisma.$transaction(async (tx) => {
    const claim = await tx.bet.updateMany({
      where: {
        id: betId,
        userId,
        status: { in: OPEN_BET_STATUSES },
      },
      data: { status: "settling" },
    });

    if (claim.count !== 1) return false;

    const bet = await tx.bet.findUnique({
      where: { id: betId },
      select: {
        id: true,
        accumulatorId: true,
        matchId: true,
      },
    });

    if (!bet || !bet.accumulatorId || !outcome.result) {
      throw new Error("Accumulator leg lost its accumulator reference");
    }

    accumulatorId = bet.accumulatorId;

    await tx.bet.update({
      where: { id: bet.id },
      data: {
        status: outcome.result,
        profit: 0,
        commission: 0,
        settledAt: new Date(),
        settlementReason:
          outcome.result === "void" ? "void_match" : "match_finished",
      },
    });

    await tx.botLog.create({
      data: {
        userId,
        action: "accumulator_leg_settled",
        betId: bet.id,
        matchId: bet.matchId,
        accumulatorId: bet.accumulatorId,
        details: JSON.stringify({
          result: outcome.result,
          financialImpact: 0,
        }),
        reasoning: outcome.reason,
        profitImpact: 0,
      },
    });

    return true;
  });

  if (!settled || !accumulatorId) {
    return {
      betId,
      userId,
      settled: false,
      skipped: true,
      reason: "Bet was already claimed or settled.",
    };
  }

  await settleAccumulatorIfReady(accumulatorId, userId, rate);

  return {
    betId,
    userId,
    accumulatorId,
    settled: true,
    result: outcome.result ?? undefined,
    profit: 0,
    commission: 0,
    payout: 0,
    reason: outcome.reason,
  };
}

export async function settleBetById(
  betId: string,
  expectedUserId?: string
): Promise<SettlementResult> {
  const bet = await prisma.bet.findUnique({
    where: { id: betId },
    include: {
      match: true,
      user: { include: { settings: true } },
    },
  });

  if (!bet) {
    return {
      betId,
      userId: expectedUserId || "",
      settled: false,
      skipped: true,
      reason: "Bet not found.",
    };
  }

  if (expectedUserId && bet.userId !== expectedUserId) {
    return {
      betId,
      userId: expectedUserId,
      settled: false,
      skipped: true,
      reason: "Bet does not belong to this user.",
    };
  }

  if (
    !OPEN_BET_STATUSES.includes(bet.status) ||
    !READY_MATCH_STATUSES.includes(normalize(bet.match.status))
  ) {
    return {
      betId,
      userId: bet.userId,
      settled: false,
      skipped: true,
      reason: "Bet is not ready for settlement.",
    };
  }

  const outcome = evaluateBetOutcome(bet, bet.match);
  if (!outcome.supported || !outcome.result) {
    const recentSkip = await prisma.botLog.findFirst({
      where: {
        userId: bet.userId,
        betId: bet.id,
        action: "settlement_skipped",
      },
      orderBy: { createdAt: "desc" },
    });

    if (
      !recentSkip ||
      Date.now() - recentSkip.createdAt.getTime() > 24 * 60 * 60 * 1000
    ) {
      await prisma.botLog.create({
        data: {
          userId: bet.userId,
          action: "settlement_skipped",
          betId: bet.id,
          matchId: bet.matchId,
          accumulatorId: bet.accumulatorId,
          details: JSON.stringify({
            betType: bet.betType,
            selection: bet.selection,
          }),
          reasoning: outcome.reason,
        },
      });
    }

    return {
      betId,
      userId: bet.userId,
      accumulatorId: bet.accumulatorId,
      settled: false,
      skipped: true,
      reason: outcome.reason,
    };
  }

  const rate = commissionRate(bet.user.settings?.commissionRate);

  if (bet.accumulatorId) {
    return settleAccumulatorLeg(
      bet.id,
      bet.userId,
      outcome,
      rate
    );
  }

  return settleStandaloneBet(
    bet.id,
    bet.userId,
    outcome,
    rate
  );
}

export async function settleFinishedBetsForUser(
  userId: string,
  limit = 100
): Promise<SettlementResult[]> {
  const bets = await prisma.bet.findMany({
    where: {
      userId,
      status: { in: OPEN_BET_STATUSES },
      match: { status: { in: READY_MATCH_STATUSES } },
    },
    select: { id: true },
    take: Math.min(500, Math.max(1, limit)),
    orderBy: { placedAt: "asc" },
  });

  const results: SettlementResult[] = [];
  for (const bet of bets) {
    results.push(await settleBetById(bet.id, userId));
  }
  return results;
}

export async function settleAllFinishedBets(
  limit = 500
): Promise<SettlementResult[]> {
  const bets = await prisma.bet.findMany({
    where: {
      status: { in: OPEN_BET_STATUSES },
      match: { status: { in: READY_MATCH_STATUSES } },
    },
    select: { id: true },
    take: Math.min(1000, Math.max(1, limit)),
    orderBy: { placedAt: "asc" },
  });

  const results: SettlementResult[] = [];
  for (const bet of bets) {
    results.push(await settleBetById(bet.id));
  }
  return results;
}
