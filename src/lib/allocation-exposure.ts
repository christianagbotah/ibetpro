import { prisma } from "./db";
import { getRemainingExposure, money } from "./bet-exposure";

const OPEN_BET_STATUSES = ["pending", "partial_cashout"];

export async function calculateOpenExposure(
  userId: string,
  bettingAccountId: string
) {
  const [standaloneBets, accumulators] = await Promise.all([
    prisma.bet.findMany({
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
    prisma.accumulator.findMany({
      where: {
        userId,
        status: { in: ["pending", "partial_cashout"] },
        bets: { some: { bettingAccountId } },
      },
      select: { stake: true },
    }),
  ]);

  const standaloneExposure = standaloneBets.reduce(
    (sum, bet) => sum + getRemainingExposure(bet).remainingStake,
    0
  );
  const accumulatorExposure = accumulators.reduce(
    (sum, accumulator) => sum + Math.max(0, accumulator.stake),
    0
  );

  return money(standaloneExposure + accumulatorExposure);
}

export async function syncOpenExposureForAccount(
  userId: string,
  bettingAccountId: string
) {
  const usedAmount = await calculateOpenExposure(userId, bettingAccountId);

  await Promise.all([
    prisma.allocation.updateMany({
      where: {
        userId,
        bettingAccountId,
        status: "active",
      },
      data: { usedAmount },
    }),
    prisma.bettingAccount.update({
      where: { id: bettingAccountId },
      data: { allocationLock: usedAmount > 0 },
    }),
  ]);

  return usedAmount;
}
