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

function rankedProbabilityScore(
  probabilities: ResultVector,
  actual: number
): number {
  const observed: ResultVector = [
    actual === 0 ? 1 : 0,
    actual === 1 ? 1 : 0,
    actual === 2 ? 1 : 0,
  ];
  const predictedCdf = [
    probabilities[0],
    probabilities[0] + probabilities[1],
  ];
  const observedCdf = [observed[0], observed[0] + observed[1]];
  return (
    ((predictedCdf[0] - observedCdf[0]) ** 2 +
      (predictedCdf[1] - observedCdf[1]) ** 2) /
    2
  );
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function expectedCalibrationError(
  observations: Array<{ confidence: number; correct: boolean }>,
  bins = 10
): number | null {
  if (!observations.length) return null;

  let ece = 0;
  for (let bin = 0; bin < bins; bin++) {
    const lower = bin / bins;
    const upper = (bin + 1) / bins;
    const rows = observations.filter(({ confidence }) =>
      bin === bins - 1
        ? confidence >= lower && confidence <= upper
        : confidence >= lower && confidence < upper
    );

    if (!rows.length) continue;

    const accuracy =
      rows.filter((row) => row.correct).length / rows.length;
    const meanConfidence =
      rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length;
    ece += (rows.length / observations.length) * Math.abs(accuracy - meanConfidence);
  }

  return ece;
}

function predictedClass(probabilities: ResultVector): number {
  return probabilities.indexOf(Math.max(...probabilities));
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
  const baselineRps: number[] = [];
  const candidateRps: number[] = [];
  const baselineCorrect: number[] = [];
  const candidateCorrect: number[] = [];
  const baselineCalibration: Array<{ confidence: number; correct: boolean }> = [];
  const candidateCalibration: Array<{ confidence: number; correct: boolean }> = [];
  const baselineHomeGoalError: number[] = [];
  const baselineAwayGoalError: number[] = [];
  const candidateHomeGoalError: number[] = [];
  const candidateAwayGoalError: number[] = [];

  for (const row of settled) {
    const homeScore = row.match.homeScore!;
    const awayScore = row.match.awayScore!;
    const actual = actualClass(homeScore, awayScore);

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

    const baselinePrediction = predictedClass(baseline);
    const candidatePrediction = predictedClass(candidate);

    baselineLogLoss.push(logLoss(baseline, actual));
    candidateLogLoss.push(logLoss(candidate, actual));
    baselineBrier.push(brier(baseline, actual));
    candidateBrier.push(brier(candidate, actual));
    baselineRps.push(rankedProbabilityScore(baseline, actual));
    candidateRps.push(rankedProbabilityScore(candidate, actual));
    baselineCorrect.push(baselinePrediction === actual ? 1 : 0);
    candidateCorrect.push(candidatePrediction === actual ? 1 : 0);
    baselineCalibration.push({
      confidence: Math.max(...baseline),
      correct: baselinePrediction === actual,
    });
    candidateCalibration.push({
      confidence: Math.max(...candidate),
      correct: candidatePrediction === actual,
    });
    baselineHomeGoalError.push(Math.abs(row.baselineHomeXg - homeScore));
    baselineAwayGoalError.push(Math.abs(row.baselineAwayXg - awayScore));
    candidateHomeGoalError.push(Math.abs(row.candidateHomeXg - homeScore));
    candidateAwayGoalError.push(Math.abs(row.candidateAwayXg - awayScore));
  }

  const baselineLog = average(baselineLogLoss);
  const candidateLog = average(candidateLogLoss);
  const baselineBr = average(baselineBrier);
  const candidateBr = average(candidateBrier);
  const baselineRpsValue = average(baselineRps);
  const candidateRpsValue = average(candidateRps);
  const baselineEce = expectedCalibrationError(baselineCalibration);
  const candidateEce = expectedCalibrationError(candidateCalibration);

  return {
    settledMatches: settled.length,
    candidateModelVersion:
      candidateModelVersion || settled.at(-1)?.candidateModelVersion || null,
    baseline: {
      logLoss: baselineLog,
      brier: baselineBr,
      rps: baselineRpsValue,
      ece: baselineEce,
      accuracy: average(baselineCorrect),
      homeGoalMae: average(baselineHomeGoalError),
      awayGoalMae: average(baselineAwayGoalError),
    },
    candidate: {
      logLoss: candidateLog,
      brier: candidateBr,
      rps: candidateRpsValue,
      ece: candidateEce,
      accuracy: average(candidateCorrect),
      homeGoalMae: average(candidateHomeGoalError),
      awayGoalMae: average(candidateAwayGoalError),
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
      rps:
        candidateRpsValue != null && baselineRpsValue != null
          ? candidateRpsValue - baselineRpsValue
          : null,
      ece:
        candidateEce != null && baselineEce != null
          ? candidateEce - baselineEce
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
      candidateRpsBetter:
        candidateRpsValue != null && baselineRpsValue != null
          ? candidateRpsValue < baselineRpsValue
          : null,
      candidateCalibrationBetter:
        candidateEce != null && baselineEce != null
          ? candidateEce < baselineEce
          : null,
      minimumUsefulSampleReached: settled.length >= 200,
    },
  };
}
