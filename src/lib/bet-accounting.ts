export type TicketStakeRow = {
  stake: number;
  accumulatorId?: string | null;
};

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Sum real ticket stake rather than database rows.
 *
 * Accumulator legs repeat the ticket stake on every leg for settlement/UI
 * context, so row-level summation multiplies one ticket by its leg count.
 * Standalone bets count once; each accumulator id counts once.
 */
export function sumTicketStake(rows: TicketStakeRow[]): number {
  const seenAccumulators = new Set<string>();
  let total = 0;

  for (const row of rows) {
    const stake = Number(row.stake);
    if (!Number.isFinite(stake) || stake <= 0) continue;

    if (row.accumulatorId) {
      if (seenAccumulators.has(row.accumulatorId)) continue;
      seenAccumulators.add(row.accumulatorId);
    }

    total += stake;
  }

  return money(total);
}

/** Count actual wager tickets, not accumulator-leg rows. */
export function countTickets(rows: TicketStakeRow[]): number {
  const seenAccumulators = new Set<string>();
  let count = 0;

  for (const row of rows) {
    if (row.accumulatorId) {
      if (seenAccumulators.has(row.accumulatorId)) continue;
      seenAccumulators.add(row.accumulatorId);
    }
    count++;
  }

  return count;
}
