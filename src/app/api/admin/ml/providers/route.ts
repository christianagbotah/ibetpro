import { NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

interface MlHealthPayload {
  status?: string;
  model?: {
    configured?: boolean;
    loaded?: boolean;
    modelVersion?: string | null;
    reason?: string | null;
  };
}

async function readMlHealth(serviceUrl: string | undefined) {
  if (!serviceUrl) {
    return {
      serviceUrlConfigured: false,
      serviceReachable: false,
      modelConfigured: false,
      modelLoaded: false,
      modelVersion: null as string | null,
      reason: "ML_SERVICE_URL is not configured",
    };
  }

  try {
    const response = await fetch(`${serviceUrl.replace(/\/$/, "")}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) {
      return {
        serviceUrlConfigured: true,
        serviceReachable: false,
        modelConfigured: false,
        modelLoaded: false,
        modelVersion: null as string | null,
        reason: `ML service health returned HTTP ${response.status}`,
      };
    }

    const payload = (await response.json()) as MlHealthPayload;
    return {
      serviceUrlConfigured: true,
      serviceReachable: payload.status === "ok",
      modelConfigured: Boolean(payload.model?.configured),
      modelLoaded: Boolean(payload.model?.loaded),
      modelVersion: payload.model?.modelVersion || null,
      reason: payload.model?.reason || null,
    };
  } catch {
    return {
      serviceUrlConfigured: true,
      serviceReachable: false,
      modelConfigured: false,
      modelLoaded: false,
      modelVersion: null as string | null,
      reason: "ML service is not reachable",
    };
  }
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const mlHealth = await readMlHealth(process.env.ML_SERVICE_URL);

  return NextResponse.json({
    providers: {
      oddsApi: Boolean(process.env.ODDS_API_KEY),
      apiFootball: Boolean(process.env.API_FOOTBALL_KEY),
      sportmonks: Boolean(
        process.env.SPORTMONKS_API_TOKEN || process.env.SPORTMONKS_API_KEY
      ),
    },
    ml: {
      ...mlHealth,
      modelMode: process.env.ML_MODEL_MODE || "baseline",
    },
    guidance: {
      licensedHistoricalContext: "Sportmonks",
      licensedHistoricalOdds: "The Odds API",
      defaultHistoricalOddsExecution: "dry-run",
    },
  });
}
