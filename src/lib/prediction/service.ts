import { PredictionInput, MatchPrediction } from "./contracts";
import { poissonBaselinePredict } from "./poisson-baseline";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "";
const ML_SERVICE_TIMEOUT_MS = Number(process.env.ML_SERVICE_TIMEOUT_MS || 2500);

async function predictWithMlService(input: PredictionInput): Promise<MatchPrediction | null> {
  if (!ML_SERVICE_URL) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ML_SERVICE_TIMEOUT_MS);

  try {
    const response = await fetch(`${ML_SERVICE_URL.replace(/\/$/, "")}/v1/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn("[Prediction] ML service returned", response.status);
      return null;
    }

    const prediction = (await response.json()) as MatchPrediction;
    if (
      prediction?.schemaVersion !== "1.0" ||
      prediction?.matchId !== input.matchId ||
      !prediction?.result
    ) {
      console.warn("[Prediction] ML service returned an invalid contract");
      return null;
    }

    return prediction;
  } catch (error) {
    console.warn(
      "[Prediction] ML service unavailable, falling back to local baseline:",
      error instanceof Error ? error.message : error
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function predictMatch(input: PredictionInput): Promise<MatchPrediction> {
  const mlPrediction = await predictWithMlService(input);
  if (mlPrediction) return mlPrediction;

  return poissonBaselinePredict(input);
}
