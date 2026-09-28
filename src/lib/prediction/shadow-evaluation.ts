import { prisma } from "@/lib/db";

type ResultVector = [number, number, number];

function actualClass(homeScore: number, awayScore: number): 0 | 1 | 2 {
  if (homeScore > awayScore) return 0;
  if (homeScore < awayScore) return 2;
  return 1;
}

function logLoss(probabilities: ResultVector, actual: number): number {
  const probability = Math.min(1 - 1e-12, Math.max(1e-12, probabilities[actual]));
  return -Math.log(probability);
}

function brier(probabilities: ResultVector, actual: number): number {
  return probabilities.reduce((sum, probability, index) => {
    const observed = index === actual ? 1 : 0;
    return sum + (probability - observed) ** 2;
  }, 0);
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function evaluateShadowPerformance(candidateModelVersion?: string) {
  const comparisons = await prisma.shadowPredictionComparison.findMany({
    where: {
      ...(candidateModelVersion ? { candidateModelVersion } : {}),
      match: {
        status: "finished",
        homeScore: { not: null },
        awayScore: { not: null },
      },
    },
    include: {
      match: {
        select: {
          homeScore: true,
          awayScore: true,
          league: true,
          commenceTime: true,
        },
      },
    },
    orderBy: { asOf: "asc" },
  });

  const settled = comparisons.filter(
    (row) => row.match.homeScore != null && row.match.awayScore != null
  );

  const baselineLogLoss: number[] = [];
  const candidateLogLoss: number[] = [];
  const baselineBrier: number[] = [];
  const candidateBrier: number[] = [];
  const baselineCorrect: number[] = [];
  const candidateCorrect: number[] = [];

  for (const row of settled) {
    const actual = actualClass(row.match.homeScore!, row.match.awayScore!);
    const baseline: ResultVector = [
      row.baselineHomeWin,
      row.baselineDraw,
      row.baselineAwayWin,
    ];
    const candidate: ResultVector = [
      row.candidateHomeWin,
      row.candidateDraw,
      row.candidateAwayWin,
    ];

    baselineLogLoss.push(logLoss(baseline, actual));
    candidateLogLoss.push(logLoss(candidate, actual));
    baselineBrier.push(brier(baseline, actual));
    candidateBrier.push(brier(candidate, actual));
    baselineCorrect.push(
      baseline.indexOf(Math.max(...baseline)) === actual ? 1 : 0
    );
    candidateCorrect.push(
      candidate.indexOf(Math.max(...candidate)) === actual ? 1 : 0
    );
  }

  const baselineLog = average(baselineLogLoss);
  const candidateLog = average(candidateLogLoss);
  const baselineBr = average(baselineBrier);
  const candidateBr = average(candidateBrier);

  return {
    settledMatches: settled.length,
    candidateModelVersion:
      candidateModelVersion ||
      settled.at(-1)?.candidateModelVersion ||
      null,
    baseline: {
      logLoss: baselineLog,
      brier: baselineBr,
      accuracy: average(baselineCorrect),
    },
    candidate: {
      logLoss: candidateLog,
      brier: candidateBr,
      accuracy: average(candidateCorrect),
    },
    deltas: {
      logLoss:
        candidateLog != null && baselineLog != null
          ? candidateLog - baselineLog
          : null,
      brier:
        candidateBr != null && baselineBr != null
          ? candidateBr - baselineBr
          : null,
    },
    interpretation: {
      candidateLogLossBetter:
        candidateLog != null && baselineLog != null
          ? candidateLog < baselineLog
          : null,
      candidateBrierBetter:
        candidateBr != null && baselineBr != null
          ? candidateBr < baselineBr
          : null,
      minimumUsefulSampleReached: settled.length >= 200,
    },
  };
}
