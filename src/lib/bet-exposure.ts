export type ExposureInput = {
  stake: number;
  potentialWin: number;
  partialCashoutPercent?: number | null;
  partialCashoutAmount?: number | null;
};

export function clampFraction(value: number | null | undefined): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(1, Math.max(0, parsed));
}

export function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getRemainingExposure(bet: ExposureInput) {
  const cashedOutFraction = clampFraction(bet.partialCashoutPercent);
  const remainingFraction = Math.max(0, 1 - cashedOutFraction);
  const remainingStake = money(Math.max(0, bet.stake) * remainingFraction);
  const remainingPotentialWin = money(
    Math.max(0, bet.potentialWin) * remainingFraction
  );

  return {
    cashedOutFraction,
    remainingFraction,
    remainingStake,
    remainingPotentialWin,
    partialCashReceived: money(Math.max(0, bet.partialCashoutAmount ?? 0)),
  };
}

export function getPartialCashoutSlice(
  bet: ExposureInput,
  fractionOfRemaining: number
) {
  const exposure = getRemainingExposure(bet);
  const requestedFraction = clampFraction(fractionOfRemaining);
  const originalStakeFraction =
    exposure.remainingFraction * requestedFraction;

  return {
    ...exposure,
    requestedFraction,
    originalStakeFraction,
    stakeCashedOutNow: money(Math.max(0, bet.stake) * originalStakeFraction),
    newCumulativeFraction: clampFraction(
      exposure.cashedOutFraction + originalStakeFraction
    ),
  };
}
