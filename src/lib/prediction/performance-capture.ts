import { prisma } from "@/lib/db";
import { buildPredictionInput } from "./input-builder";
import { predictMatch } from "./service";
import { persistPredictionSnapshot } from "./store";

type EvidenceStage = "pre_match" | "live_20" | "live_60" | "live_latest";

type EvidenceResult = {
  matchId: string;
  stage: EvidenceStage;
  captured: boolean;
  reason?: string;
  snapshotId?: string;
  modelVersion?: string;
  resultMode?: string;
};

function stageForMatch(match: {
  status: string;
  minute: number | null;
  commenceTime: Date;
}, now: Date): EvidenceStage | null {
  if (match.status === "upcoming") {
    const minutesToKickoff =
      (match.commenceTime.getTime() - now.getTime()) / 60_000;
    return minutesToKickoff >= 0 && minutesToKickoff <= 90
      ? "pre_match"
      : null;
  }

  if (match.status !== "live" || match.minute == null) return null;
  if (match.minute >= 5 && match.minute <= 35) return "live_20";
  if (match.minute >= 40 && match.minute <= 75) return "live_60";
  if (match.minute >= 76) return "live_latest";
  return null;
}

function stageMinuteWhere(stage: EvidenceStage) {
  if (stage === "live_20") return { gte: 5, lte: 35 };
  if (stage === "live_60") return { gte: 40, lte: 75 };
  if (stage === "live_latest") return { gte: 76 };
  return undefined;
}

async function captureOne(
  match: {
    id: string;
    status: string;
    minute: number | null;
    commenceTime: Date;
  },
  stage: EvidenceStage
): Promise<EvidenceResult> {
  const input = await buildPredictionInput(match.id);
  if (!input) {
    return {
      matchId: match.id,
      stage,
      captured: false,
      reason: "Prediction input unavailable",
    };
  }

  const prediction = await predictMatch(input);

  const existing = await prisma.predictionSnapshot.findFirst({
    where: {
      matchId: match.id,
      modelVersion: prediction.modelVersion,
      resultMode: prediction.resultMode,
      ...(stage === "pre_match"
        ? { matchStatus: "upcoming" }
        : {
            matchStatus: "live",
            minute: stageMinuteWhere(stage),
          }),
    },
    select: { id: true },
  });

  if (existing) {
    return {
      matchId: match.id,
      stage,
      captured: false,
      reason: "Stage already captured",
      snapshotId: existing.id,
      modelVersion: prediction.modelVersion,
      resultMode: prediction.resultMode,
    };
  }

  const snapshotId = await persistPredictionSnapshot(input, prediction);
  return {
    matchId: match.id,
    stage,
    captured: true,
    snapshotId,
    modelVersion: prediction.modelVersion,
    resultMode: prediction.resultMode,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
) {
  const output = new Array<R>(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(1, items.length)) },
      () => run()
    )
  );
  return output;
}

export async function capturePredictionPerformanceEvidence(
  now = new Date(),
  limit = 32
) {
  const upcomingUntil = new Date(now.getTime() + 90 * 60 * 1000);

  const [upcoming, live] = await Promise.all([
    prisma.match.findMany({
      where: {
        status: "upcoming",
        commenceTime: { gte: now, lte: upcomingUntil },
      },
      select: {
        id: true,
        status: true,
        minute: true,
        commenceTime: true,
      },
      orderBy: { commenceTime: "asc" },
      take: limit,
    }),
    prisma.match.findMany({
      where: {
        status: "live",
        minute: { not: null },
      },
      select: {
        id: true,
        status: true,
        minute: true,
        commenceTime: true,
      },
      orderBy: [{ minute: "desc" }, { commenceTime: "asc" }],
      take: limit,
    }),
  ]);

  const candidates = [...live, ...upcoming]
    .map((match) => ({
      match,
      stage: stageForMatch(match, now),
    }))
    .filter(
      (
        row
      ): row is {
        match: (typeof upcoming)[number];
        stage: EvidenceStage;
      } => row.stage != null
    )
    .slice(0, limit);

  const results = await mapWithConcurrency(candidates, 4, async (row) => {
    try {
      return await captureOne(row.match, row.stage);
    } catch (error) {
      return {
        matchId: row.match.id,
        stage: row.stage,
        captured: false,
        reason: error instanceof Error ? error.message : "Capture failed",
      } satisfies EvidenceResult;
    }
  });

  return {
    generatedAt: new Date().toISOString(),
    checked: results.length,
    captured: results.filter((row) => row.captured).length,
    skipped: results.filter((row) => !row.captured).length,
    byStage: {
      pre_match: results.filter(
        (row) => row.captured && row.stage === "pre_match"
      ).length,
      live_20: results.filter(
        (row) => row.captured && row.stage === "live_20"
      ).length,
      live_60: results.filter(
        (row) => row.captured && row.stage === "live_60"
      ).length,
      live_latest: results.filter(
        (row) => row.captured && row.stage === "live_latest"
      ).length,
    },
    results,
  };
}
