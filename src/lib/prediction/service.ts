import { PredictionInput, MatchPrediction } from "./contracts";
import { poissonBaselinePredict } from "./poisson-baseline";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "";
const ML_SERVICE_TIMEOUT_MS = Number(process.env.ML_SERVICE_TIMEOUT_MS || 2500);

export type PredictionMode = "baseline" | "shadow" | "active";

export function getPredictionMode(): PredictionMode {
  const mode = String(process.env.ML_MODEL_MODE || "baseline").toLowerCase();
  if (mode === "active" || mode === "shadow") return mode;
  return "baseline";
}

async function requestMl(
  path: "/v1/predict" | "/v1/predict/candidate",
  input: PredictionInput
): Promise<MatchPrediction | null> {
  if (!ML_SERVICE_URL) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ML_SERVICE_TIMEOUT_MS);

  try {
    const response = await fetch(`${ML_SERVICE_URL.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn("[Prediction] ML service returned", response.status, "for", path);
      return null;
    }

    const prediction = (await response.json()) as MatchPrediction;
    if (
      prediction?.schemaVersion !== "1.0" ||
      prediction?.matchId !== input.matchId ||
      !prediction?.result
    ) {
      console.warn("[Prediction] ML service returned an invalid contract for", path);
      return null;
    }

    return prediction;
  } catch (error) {
    console.warn(
      "[Prediction] ML service unavailable:",
      error instanceof Error ? error.message : error
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function predictShadowCandidate(
  input: PredictionInput
): Promise<MatchPrediction | null> {
  if (getPredictionMode() !== "shadow") return null;
  return requestMl("/v1/predict/candidate", input);
}

export async function predictMatch(input: PredictionInput): Promise<MatchPrediction> {
  const mode = getPredictionMode();

  if (mode === "baseline" || mode === "shadow") {
    return poissonBaselinePredict(input);
  }

  const mlPrediction = await requestMl("/v1/predict", input);
  if (mlPrediction) return mlPrediction;

  return poissonBaselinePredict(input);
}
