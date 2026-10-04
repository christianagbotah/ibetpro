import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/session";
import { config } from "@/lib/config";
import { aggregateOverOnlyPlayerLines } from "@/lib/player-line-consensus";

export const dynamic = "force-dynamic";

const SUPPORTED_SPORTS = new Set([
  "soccer_epl",
  "soccer_france_ligue_one",
  "soccer_germany_bundesliga",
  "soccer_italy_serie_a",
  "soccer_spain_la_liga",
  "soccer_usa_mls",
]);

const MARKET_CONFIG = {
  shots: {
    providerKey: "player_shots_alternate",
    label: "Shots",
    preferredLine: 2.5,
  },
  "shots-on-target": {
    providerKey: "player_shots_on_target_alternate",
    label: "Shots on target",
    preferredLine: 0.5,
  },
  assists: {
    providerKey: "player_assists_alternate",
    label: "Assists",
    preferredLine: 0.5,
  },
} as const;

type MarketKey = keyof typeof MARKET_CONFIG;

const CACHE_TTL_UPCOMING_MS = 10 * 60 * 1000;
const CACHE_TTL_LIVE_MS = 2 * 60 * 1000;
const ODDS_API_QUOTA_FLOOR = Math.max(
  0,
  Number(process.env.PLAYER_PROPS_QUOTA_FLOOR || 75)
);

type CachedResult = {
  expiresAt: number;
  payload: {
    market: MarketKey;
    providerMarket: string;
    label: string;
    candidates: ReturnType<
      typeof aggregateOverOnlyPlayerLines
    >["candidates"];
    bookmakerCount: number;
    provider: string;
    remainingRequests: number | null;
    requestCost: number | null;
  };
};

const cache = new Map<string, CachedResult>();

function parseHeader(response: Response, name: string) {
  const raw = response.headers.get(name);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function remainingFromMetadata(metadataJson: string | null) {
  if (!metadataJson) return null;
  try {
    const parsed = JSON.parse(metadataJson) as {
      remainingRequests?: unknown;
    };
    const value = Number(parsed.remainingRequests);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

async function latestKnownQuota() {
  const state = await prisma.providerSyncState.findFirst({
    where: {
      provider: "odds-api",
      metadataJson: { not: null },
    },
    orderBy: [
      { lastSuccessAt: "desc" },
      { lastAttemptAt: "desc" },
    ],
    select: { metadataJson: true },
  });
  return remainingFromMetadata(state?.metadataJson ?? null);
}

function parseMarket(value: string | null): MarketKey | null {
  if (!value) return null;
  return value in MARKET_CONFIG ? (value as MarketKey) : null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ matchId: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const market = parseMarket(
      request.nextUrl.searchParams.get("market")
    );
    if (!market) {
      return NextResponse.json(
        {
          error:
            "Unsupported player market. Use shots, shots-on-target, or assists.",
        },
        { status: 400 }
      );
    }

    const marketConfig = MARKET_CONFIG[market];
    const { matchId } = await context.params;
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        externalId: true,
        apiSource: true,
        sport: true,
        league: true,
        homeTeam: true,
        awayTeam: true,
        status: true,
        commenceTime: true,
      },
    });

    if (!match) {
      return NextResponse.json(
        { error: "Match not found" },
        { status: 404 }
      );
    }

    if (
      match.apiSource !== "odds-api" ||
      !match.externalId ||
      !SUPPORTED_SPORTS.has(match.sport)
    ) {
      return NextResponse.json(
        {
          error:
            "Player stat markets are not supported for this match",
          supported: false,
        },
        { status: 409 }
      );
    }

    if (!["upcoming", "live"].includes(match.status)) {
      return NextResponse.json(
        {
          error: "Player stat markets are closed for this match",
          supported: true,
        },
        { status: 409 }
      );
    }

    const cacheKey =
      match.externalId + ":" + marketConfig.providerKey;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({
        match,
        supported: true,
        cached: true,
        source: "bookmaker-consensus",
        disclaimer:
          "Percentages are average bookmaker-implied Over probabilities for the displayed line. Alternate markets are over-only, so these are not de-vigged model probabilities.",
        ...cached.payload,
      });
    }

    const knownQuota = await latestKnownQuota();
    if (
      knownQuota != null &&
      knownQuota < ODDS_API_QUOTA_FLOOR
    ) {
      return NextResponse.json(
        {
          error:
            "Player-prop lookup paused to preserve provider quota",
          supported: true,
          remainingRequests: knownQuota,
        },
        { status: 429 }
      );
    }

    const apiKey = config.api.oddsApiKey;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Odds provider is not configured" },
        { status: 503 }
      );
    }

    const stateKey =
      "odds-api:player-line:" + marketConfig.providerKey;
    await prisma.providerSyncState.upsert({
      where: { key: stateKey },
      update: { lastAttemptAt: new Date() },
      create: {
        key: stateKey,
        provider: "odds-api",
        lastAttemptAt: new Date(),
      },
    });

    const params = new URLSearchParams({
      apiKey,
      regions: "us",
      markets: marketConfig.providerKey,
      oddsFormat: "decimal",
      dateFormat: "iso",
    });
    const url =
      config.apiUrls.oddsApi +
      "/sports/" +
      match.sport +
      "/events/" +
      match.externalId +
      "/odds?" +
      params.toString();

    const response = await fetch(url, {
      cache: "no-store",
    });
    const requestCost = parseHeader(
      response,
      "x-requests-last"
    );
    const remainingRequests = parseHeader(
      response,
      "x-requests-remaining"
    );

    await prisma.providerSyncState.upsert({
      where: { key: stateKey },
      update: {
        lastSuccessAt: response.ok
          ? new Date()
          : undefined,
        metadataJson: JSON.stringify({
          remainingRequests,
          requestCost,
          status: response.status,
          matchId: match.id,
          sport: match.sport,
          market,
          providerMarket: marketConfig.providerKey,
        }),
      },
      create: {
        key: stateKey,
        provider: "odds-api",
        lastSuccessAt: response.ok
          ? new Date()
          : null,
        metadataJson: JSON.stringify({
          remainingRequests,
          requestCost,
          status: response.status,
          matchId: match.id,
          sport: match.sport,
          market,
          providerMarket: marketConfig.providerKey,
        }),
      },
    });

    if (!response.ok) {
      const providerText = await response.text();
      console.warn(
        "[PlayerLineMarket] Provider market unavailable",
        response.status,
        providerText.slice(0, 240)
      );
      return NextResponse.json(
        {
          error:
            marketConfig.label +
            " player market is unavailable right now",
          supported: true,
          providerStatus: response.status,
          remainingRequests,
          requestCost,
        },
        {
          status:
            response.status === 404 ? 404 : 502,
        }
      );
    }

    const data = await response.json();
    const { candidates, bookmakerCount } =
      aggregateOverOnlyPlayerLines(
        data,
        marketConfig.providerKey,
        marketConfig.preferredLine
      );

    if (
      bookmakerCount === 0 ||
      candidates.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No current " +
            marketConfig.label.toLowerCase() +
            " player prices are available for this match",
          supported: true,
          bookmakerCount,
          candidates: [],
          remainingRequests,
          requestCost,
        },
        { status: 404 }
      );
    }

    const payload = {
      market,
      providerMarket: marketConfig.providerKey,
      label: marketConfig.label,
      candidates,
      bookmakerCount,
      provider: "The Odds API",
      remainingRequests,
      requestCost,
    };

    cache.set(cacheKey, {
      expiresAt:
        Date.now() +
        (match.status === "live"
          ? CACHE_TTL_LIVE_MS
          : CACHE_TTL_UPCOMING_MS),
      payload,
    });

    return NextResponse.json({
      match,
      supported: true,
      cached: false,
      source: "bookmaker-consensus",
      disclaimer:
        "Percentages are average bookmaker-implied Over probabilities for the displayed line. Alternate markets are over-only, so these are not de-vigged model probabilities.",
      ...payload,
    });
  } catch (error) {
    console.error("[PlayerLineMarket] Failed:", error);
    return NextResponse.json(
      { error: "Failed to load player stat market" },
      { status: 500 }
    );
  }
}