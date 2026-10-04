import { prisma } from "@/lib/db";

export type ScorecardStage =
  | "pre_match"
  | "live_20"
  | "live_60"
  | "live_latest";

type MetricSummary = {
  samples: number;
  winnerAccuracy: number | null;
  brier: number | null;
  logLoss: number | null;
  homeGoalMae: number | null;
  awayGoalMae: number | null;
  teamGoalMae: number | null;
  totalGoalMae: number | null;
  exactScoreAccuracy: number | null;
  over25Accuracy: number | null;
  over25Samples: number;
  bttsAccuracy: number | null;
  bttsSamples: number;
  avgConfidence: number | null;
  avgDataCompleteness: number | null;
  confidenceAccuracyGap: number | null;
};

type EvaluatedSnapshot = {
  snapshotId: string;
  matchId: string;
  modelVersion: string;
  resultMode: string;
  source: string;
  stage: ScorecardStage;
  asOf: string;
  minute: number | null;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  actualHomeScore: number;
  actualAwayScore: number;
  actualOutcome: "home" | "draw" | "away";
  predictedOutcome: "home" | "draw" | "away";
  predictedLabel: string;
  predictedProbability: number;
  correctWinner: boolean;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  brier: number;
  logLoss: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  homeGoalError: number;
  awayGoalError: number;
  totalGoalError: number;
  exactScorePredicted: { home: number; away: number } | null;
  exactScoreCorrect: boolean | null;
  over25Probability: number | null;
  over25Predicted: boolean | null;
  over25Actual: boolean;
  over25Correct: boolean | null;
  bttsProbability: number | null;
  bttsPredicted: boolean | null;
  bttsActual: boolean;
  bttsCorrect: boolean | null;
  confidence: number;
  dataCompleteness: number;
};

type TimelineRow = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  actualScore: string;
  actualOutcome: "home" | "draw" | "away";
  stages: Partial<Record<ScorecardStage, EvaluatedSnapshot>>;
};

const STAGES: ScorecardStage[] = [
  "pre_match",
  "live_20",
  "live_60",
  "live_latest",
];

function mean(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function safeProbability(value: number) {
  return Math.min(1 - 1e-12, Math.max(1e-12, value));
}

function actualOutcome(home: number, away: number) {
  if (home > away) return "home" as const;
  if (away > home) return "away" as const;
  return "draw" as const;
}

function predictedOutcome(
  home: number,
  draw: number,
  away: number
) {
  const ranked = [
    ["home" as const, home],
    ["draw" as const, draw],
    ["away" as const, away],
  ].sort((a, b) => b[1] - a[1]);
  return ranked[0][0];
}

function probabilityForOutcome(
  outcome: "home" | "draw" | "away",
  home: number,
  draw: number,
  away: number
) {
  if (outcome === "home") return home;
  if (outcome === "away") return away;
  return draw;
}

function predictedLabel(
  outcome: "home" | "draw" | "away",
  homeTeam: string,
  awayTeam: string
) {
  if (outcome === "home") return homeTeam;
  if (outcome === "away") return awayTeam;
  return "Draw";
}

function parseJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function marketProbability(marketsJson: string, keys: string[]) {
  const markets = parseJsonArray(marketsJson) as Array<{
    key?: unknown;
    probability?: unknown;
  }>;

  for (const key of keys) {
    const market = markets.find((item) => item?.key === key);
    const probability = Number(market?.probability);
    if (Number.isFinite(probability)) return probability;
  }
  return null;
}

function topScoreline(scorelinesJson: string) {
  const rows = parseJsonArray(scorelinesJson) as Array<{
    home?: unknown;
    away?: unknown;
    probability?: unknown;
  }>;

  let best: { home: number; away: number; probability: number } | null = null;
  for (const row of rows) {
    const home = Number(row?.home);
    const away = Number(row?.away);
    const probability = Number(row?.probability);
    if (
      !Number.isFinite(home) ||
      !Number.isFinite(away) ||
      !Number.isFinite(probability)
    ) {
      continue;
    }
    if (!best || probability > best.probability) {
      best = { home, away, probability };
    }
  }

  return best ? { home: best.home, away: best.away } : null;
}

function evaluateSnapshot(
  row: {
    id: string;
    matchId: string;
    modelVersion: string;
    resultMode: string;
    source: string;
    asOf: Date;
    minute: number | null;
    homeWinProb: number;
    drawProb: number;
    awayWinProb: number;
    expectedHomeGoals: number;
    expectedAwayGoals: number;
    confidence: number;
    dataCompleteness: number;
    scorelinesJson: string;
    marketsJson: string;
    match: {
      homeTeam: string;
      awayTeam: string;
      commenceTime: Date;
      homeScore: number | null;
      awayScore: number | null;
    };
  },
  stage: ScorecardStage
): EvaluatedSnapshot | null {
  const actualHome = row.match.homeScore;
  const actualAway = row.match.awayScore;
  if (actualHome == null || actualAway == null) return null;

  const actual = actualOutcome(actualHome, actualAway);
  const predicted = predictedOutcome(
    row.homeWinProb,
    row.drawProb,
    row.awayWinProb
  );
  const yHome = actual === "home" ? 1 : 0;
  const yDraw = actual === "draw" ? 1 : 0;
  const yAway = actual === "away" ? 1 : 0;
  const brier =
    ((row.homeWinProb - yHome) ** 2 +
      (row.drawProb - yDraw) ** 2 +
      (row.awayWinProb - yAway) ** 2) /
    3;
  const actualProbability = safeProbability(
    probabilityForOutcome(
      actual,
      row.homeWinProb,
      row.drawProb,
      row.awayWinProb
    )
  );
  const predictedProbability = probabilityForOutcome(
    predicted,
    row.homeWinProb,
    row.drawProb,
    row.awayWinProb
  );

  const over25Probability = marketProbability(row.marketsJson, [
    "over-2.5",
    "over_2_5",
  ]);
  const bttsProbability = marketProbability(row.marketsJson, [
    "btts-yes",
    "btts_yes",
  ]);
  const exactScorePredicted = topScoreline(row.scorelinesJson);
  const over25Actual = actualHome + actualAway > 2.5;
  const bttsActual = actualHome > 0 && actualAway > 0;

  return {
    snapshotId: row.id,
    matchId: row.matchId,
    modelVersion: row.modelVersion,
    resultMode: row.resultMode,
    source: row.source,
    stage,
    asOf: row.asOf.toISOString(),
    minute: row.minute,
    homeTeam: row.match.homeTeam,
    awayTeam: row.match.awayTeam,
    kickoffAt: row.match.commenceTime.toISOString(),
    actualHomeScore: actualHome,
    actualAwayScore: actualAway,
    actualOutcome: actual,
    predictedOutcome: predicted,
    predictedLabel: predictedLabel(
      predicted,
      row.match.homeTeam,
      row.match.awayTeam
    ),
    predictedProbability,
    correctWinner: predicted === actual,
    homeWinProb: row.homeWinProb,
    drawProb: row.drawProb,
    awayWinProb: row.awayWinProb,
    brier,
    logLoss: -Math.log(actualProbability),
    expectedHomeGoals: row.expectedHomeGoals,
    expectedAwayGoals: row.expectedAwayGoals,
    homeGoalError: Math.abs(row.expectedHomeGoals - actualHome),
    awayGoalError: Math.abs(row.expectedAwayGoals - actualAway),
    totalGoalError: Math.abs(
      row.expectedHomeGoals +
        row.expectedAwayGoals -
        (actualHome + actualAway)
    ),
    exactScorePredicted,
    exactScoreCorrect: exactScorePredicted
      ? exactScorePredicted.home === actualHome &&
        exactScorePredicted.away === actualAway
      : null,
    over25Probability,
    over25Predicted:
      over25Probability == null ? null : over25Probability >= 0.5,
    over25Actual,
    over25Correct:
      over25Probability == null
        ? null
        : (over25Probability >= 0.5) === over25Actual,
    bttsProbability,
    bttsPredicted:
      bttsProbability == null ? null : bttsProbability >= 0.5,
    bttsActual,
    bttsCorrect:
      bttsProbability == null
        ? null
        : (bttsProbability >= 0.5) === bttsActual,
    confidence: row.confidence,
    dataCompleteness: row.dataCompleteness,
  };
}

function metrics(rows: EvaluatedSnapshot[]): MetricSummary {
  const over25 = rows.filter((row) => row.over25Correct != null);
  const btts = rows.filter((row) => row.bttsCorrect != null);
  const exact = rows.filter((row) => row.exactScoreCorrect != null);
  const winnerAccuracy =
    rows.length > 0
      ? rows.filter((row) => row.correctWinner).length / rows.length
      : null;
  const avgConfidence = mean(rows.map((row) => row.confidence));

  return {
    samples: rows.length,
    winnerAccuracy,
    brier: mean(rows.map((row) => row.brier)),
    logLoss: mean(rows.map((row) => row.logLoss)),
    homeGoalMae: mean(rows.map((row) => row.homeGoalError)),
    awayGoalMae: mean(rows.map((row) => row.awayGoalError)),
    teamGoalMae: mean(
      rows.map((row) => (row.homeGoalError + row.awayGoalError) / 2)
    ),
    totalGoalMae: mean(rows.map((row) => row.totalGoalError)),
    exactScoreAccuracy:
      exact.length > 0
        ? exact.filter((row) => row.exactScoreCorrect).length / exact.length
        : null,
    over25Accuracy:
      over25.length > 0
        ? over25.filter((row) => row.over25Correct).length / over25.length
        : null,
    over25Samples: over25.length,
    bttsAccuracy:
      btts.length > 0
        ? btts.filter((row) => row.bttsCorrect).length / btts.length
        : null,
    bttsSamples: btts.length,
    avgConfidence,
    avgDataCompleteness: mean(
      rows.map((row) => row.dataCompleteness)
    ),
    confidenceAccuracyGap:
      avgConfidence != null && winnerAccuracy != null
        ? avgConfidence - winnerAccuracy
        : null,
  };
}

function sampleAssessment(samples: number) {
  if (samples < 10) {
    return {
      level: "insufficient" as const,
      label: "Insufficient sample",
      note:
        "Fewer than 10 settled fixtures. Treat all accuracy metrics as descriptive only.",
    };
  }
  if (samples < 30) {
    return {
      level: "very-small" as const,
      label: "Very small sample",
      note:
        "Fewer than 30 settled fixtures. Results are highly unstable and not promotion evidence.",
    };
  }
  if (samples < 100) {
    return {
      level: "early" as const,
      label: "Early evidence",
      note:
        "Useful for debugging directionally, but still too small for strong model conclusions.",
    };
  }
  if (samples < 300) {
    return {
      level: "developing" as const,
      label: "Developing sample",
      note:
        "Performance is becoming informative, but model qualification still needs the formal validation gates.",
    };
  }
  return {
    level: "useful" as const,
    label: "Useful evaluation sample",
    note:
      "Sample size is useful for evaluation; promotion still depends on chronological and walk-forward validation.",
  };
}

function snapshotStage(
  row: { asOf: Date; minute: number | null; matchStatus: string },
  kickoff: Date
): ScorecardStage | null {
  if (
    row.asOf.getTime() <= kickoff.getTime() &&
    normalizeStatus(row.matchStatus) === "upcoming"
  ) {
    return "pre_match";
  }

  const minute = row.minute;
  if (minute == null || minute < 0) return null;
  if (minute >= 5 && minute <= 35) return "live_20";
  if (minute >= 40 && minute <= 75) return "live_60";
  if (minute >= 1) return "live_latest";
  return null;
}

function normalizeStatus(value: string) {
  return value.trim().toLowerCase();
}

function stageDistance(stage: ScorecardStage, minute: number | null) {
  if (stage === "live_20") return Math.abs((minute ?? 20) - 20);
  if (stage === "live_60") return Math.abs((minute ?? 60) - 60);
  return 0;
}

function shouldReplaceCanonical(
  current: {
    asOf: Date;
    minute: number | null;
  },
  candidate: {
    asOf: Date;
    minute: number | null;
  },
  stage: ScorecardStage
) {
  if (stage === "pre_match") {
    return candidate.asOf.getTime() > current.asOf.getTime();
  }

  if (stage === "live_latest") {
    const currentMinute = current.minute ?? -1;
    const candidateMinute = candidate.minute ?? -1;
    if (candidateMinute !== currentMinute) {
      return candidateMinute > currentMinute;
    }
    return candidate.asOf.getTime() > current.asOf.getTime();
  }

  const currentDistance = stageDistance(stage, current.minute);
  const candidateDistance = stageDistance(stage, candidate.minute);
  if (candidateDistance !== currentDistance) {
    return candidateDistance < currentDistance;
  }
  return candidate.asOf.getTime() > current.asOf.getTime();
}

export async function buildPredictionPerformanceScorecard(input?: {
  days?: number;
  modelVersion?: string;
}) {
  const days = Math.min(3650, Math.max(1, input?.days ?? 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await prisma.predictionSnapshot.findMany({
    where: {
      asOf: { gte: since },
      ...(input?.modelVersion
        ? { modelVersion: input.modelVersion }
        : {}),
      match: {
        status: "finished",
        homeScore: { not: null },
        awayScore: { not: null },
      },
    },
    select: {
      id: true,
      matchId: true,
      modelVersion: true,
      resultMode: true,
      source: true,
      asOf: true,
      minute: true,
      matchStatus: true,
      homeWinProb: true,
      drawProb: true,
      awayWinProb: true,
      expectedHomeGoals: true,
      expectedAwayGoals: true,
      confidence: true,
      dataCompleteness: true,
      scorelinesJson: true,
      marketsJson: true,
      match: {
        select: {
          homeTeam: true,
          awayTeam: true,
          commenceTime: true,
          homeScore: true,
          awayScore: true,
        },
      },
    },
    orderBy: { asOf: "asc" },
    take: 10000,
  });

  const canonical = new Map<
    string,
    {
      stage: ScorecardStage;
      row: (typeof rows)[number];
    }
  >();

  for (const row of rows) {
    const stages = new Set<ScorecardStage>();
    const direct = snapshotStage(row, row.match.commenceTime);
    if (direct) stages.add(direct);

    // Every live snapshot is also a candidate for the latest-live stage.
    if (
      row.minute != null &&
      row.minute >= 1 &&
      normalizeStatus(row.matchStatus) === "live"
    ) {
      stages.add("live_latest");
    }

    for (const stage of stages) {
      const key = [
        row.matchId,
        row.modelVersion,
        row.resultMode,
        stage,
      ].join("|");
      const current = canonical.get(key);
      if (
        !current ||
        shouldReplaceCanonical(current.row, row, stage)
      ) {
        canonical.set(key, { stage, row });
      }
    }
  }

  const evaluated = Array.from(canonical.values())
    .map(({ stage, row }) => evaluateSnapshot(row, stage))
    .filter((row): row is EvaluatedSnapshot => row != null);

  const stages = Object.fromEntries(
    STAGES.map((stage) => [
      stage,
      metrics(evaluated.filter((row) => row.stage === stage)),
    ])
  ) as Record<ScorecardStage, MetricSummary>;

  const preMatch = evaluated.filter((row) => row.stage === "pre_match");

  const modelKeys = Array.from(
    new Set(
      preMatch.map(
        (row) =>
          `${row.modelVersion}|${row.resultMode}|${row.source}`
      )
    )
  );

  const models = modelKeys
    .map((key) => {
      const [modelVersion, resultMode, source] = key.split("|");
      const modelRows = preMatch.filter(
        (row) =>
          row.modelVersion === modelVersion &&
          row.resultMode === resultMode &&
          row.source === source
      );
      return {
        modelVersion,
        resultMode,
        source,
        metrics: metrics(modelRows),
      };
    })
    .sort(
      (a, b) => b.metrics.samples - a.metrics.samples
    );

  const timelineMap = new Map<string, TimelineRow>();
  for (const row of evaluated) {
    const timelineKey = `${row.matchId}|${row.modelVersion}|${row.resultMode}`;
    let timeline = timelineMap.get(timelineKey);
    if (!timeline) {
      timeline = {
        matchId: row.matchId,
        homeTeam: row.homeTeam,
        awayTeam: row.awayTeam,
        kickoffAt: row.kickoffAt,
        actualScore: `${row.actualHomeScore}-${row.actualAwayScore}`,
        actualOutcome: row.actualOutcome,
        stages: {},
      };
      timelineMap.set(timelineKey, timeline);
    }
    timeline.stages[row.stage] = row;
  }

  const timelines = Array.from(timelineMap.values())
    .sort(
      (a, b) =>
        new Date(b.kickoffAt).getTime() -
        new Date(a.kickoffAt).getTime()
    )
    .slice(0, 50);

  const distinctModels = await prisma.predictionSnapshot.findMany({
    select: {
      modelVersion: true,
      resultMode: true,
      source: true,
    },
    distinct: ["modelVersion", "resultMode", "source"],
    orderBy: { modelVersion: "asc" },
  });

  const distinctFinishedMatches = new Set(
    evaluated.map((row) => row.matchId)
  ).size;

  return {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    filter: {
      modelVersion: input?.modelVersion ?? null,
    },
    snapshotCounts: {
      labeledRawSnapshots: rows.length,
      canonicalSnapshots: evaluated.length,
      settledMatches: distinctFinishedMatches,
    },
    headline: stages.pre_match,
    assessment: sampleAssessment(stages.pre_match.samples),
    stages,
    models,
    availableModels: distinctModels,
    timelines,
  };
}
