export type PaidOddsPolicyInput = {
  quotaRemaining: number | null;
  force: boolean;
  normalLimit: number;
  conserveThreshold: number;
  captureOnlyThreshold: number;
  capturePrioritySports: string[];
  nearTermSports: string[];
  configuredPrioritySports: string[];
};

export function selectPaidOddsSports(input: PaidOddsPolicyInput) {
  const captureOnlyMode =
    !input.force &&
    input.quotaRemaining !== null &&
    input.quotaRemaining < input.captureOnlyThreshold;

  const paidLimit =
    !input.force &&
    input.quotaRemaining !== null &&
    input.quotaRemaining < input.conserveThreshold
      ? 1
      : Math.max(1, input.normalLimit);

  const candidates = captureOnlyMode
    ? input.capturePrioritySports
    : [
        ...input.capturePrioritySports,
        ...input.nearTermSports,
        ...input.configuredPrioritySports,
      ];

  return {
    captureOnlyMode,
    paidLimit,
    sportsToFetch: Array.from(new Set(candidates.filter(Boolean))).slice(
      0,
      paidLimit
    ),
  };
}
