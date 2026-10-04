import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/session";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

const SUPPORTED_SPORTS = new Set([
  "soccer_epl",
  "soccer_france_ligue_one",
  "soccer_germany_bundesliga",
  "soccer_italy_serie_a",
  "soccer_spain_la_liga",
  "soccer_usa_mls",
]);

const CACHE_TTL_UPCOMING_MS = 10 * 60 * 1000;
const CACHE_TTL_LIVE_MS = 2 * 60 * 1000;
const ODDS_API_QUOTA_FLOOR = Math.max(
  0,
  Number(process.env.PLAYER_PROPS_QUOTA_FLOOR || 75)
);

type Candidate = {
  name: string;
  probability: number;
  averageOdds: number;
  bookmakerCount: number;
  bookmakers: Array<{
    key: string;
    title: string;
    odds: number;
  }>;
  noScorer: boolean;
};

type CachedResult = {
  expiresAt: number;
  payload: {
    candidates: Candidate[];
    bookmakerCount: number;
    market: string;
    provider: string;
    remainingRequests: number | null;
    requestCost: number | null;
  };
};

const cache = new Map<string, CachedResult>();

function parseHeader(response: Response, name: string): number | null {
  const raw = response.headers.get(name);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function remainingFromMetadata(metadataJson: string | null): number | null {
  if (!metadataJson) return null;
  try {
    const parsed = JSON.parse(metadataJson) as { remainingRequests?: unknown };
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
    orderBy: [{ lastSuccessAt: "desc" }, { lastAttemptAt: "desc" }],
    select: { metadataJson: true },
  });
  return remainingFromMetadata(state?.metadataJson ?? null);
}

function aggregateCandidates(data: any): {
  candidates: Candidate[];
  bookmakerCount: number;
} {
  const bookmakers = Array.isArray(data?.bookmakers) ? data.bookmakers : [];
  const participating = bookmakers
    .map((bookmaker: any) => {
      const markets = Array.isArray(bookmaker?.markets) ? bookmaker.markets : [];
      const market = markets.find(
        (item: any) => item?.key === "player_first_goal_scorer"
      );
      const outcomes = Array.isArray(market?.outcomes) ? market.outcomes : [];
      const rows = outcomes
        .map((outcome: any) => {
          const odds = Number(outcome?.price);
          const description =
            typeof outcome?.description === "string"
              ? outcome.description.trim()
              : "";
          const fallbackName =
            typeof outcome?.name === "string" ? outcome.name.trim() : "";
          const name = description || fallbackName;
          if (!name || !Number.isFinite(odds) || odds <= 1) return null;
          return {
            name,
            odds,
            implied: 1 / odds,
          };
        })
        .filter(Boolean) as Array<{
        name: string;
        odds: number;
        implied: number;
      }>;

      const impliedTotal = rows.reduce((sum, row) => sum + row.implied, 0);
      if (rows.length === 0 || impliedTotal <= 0) return null;

      return {
        key: String(bookmaker?.key || ""),
        title: String(bookmaker?.title || bookmaker?.key || "Bookmaker"),
        rows: rows.map((row) => ({
          ...row,
          normalizedProbability: row.implied / impliedTotal,
        })),
      };
    })
    .filter(Boolean) as Array<{
    key: string;
    title: string;
    rows: Array<{
      name: string;
      odds: number;
      implied: number;
      normalizedProbability: number;
    }>;
  }>;

  const totalBooks = participating.length;
  const accumulator = new Map<
    string,
    {
      name: string;
      probabilitySum: number;
      oddsSum: number;
      books: Array<{ key: string; title: string; odds: number }>;
    }
  >();

  for (const bookmaker of participating) {
    for (const row of bookmaker.rows) {
      const key = row.name.toLocaleLowerCase();
      const current = accumulator.get(key) ?? {
        name: row.name,
        probabilitySum: 0,
        oddsSum: 0,
        books: [],
      };
      current.probabilitySum += row.normalizedProbability;
      current.oddsSum += row.odds;
      current.books.push({
        key: bookmaker.key,
        title: bookmaker.title,
        odds: row.odds,
      });
      accumulator.set(key, current);
    }
  }

  const candidates = [...accumulator.values()]
    .map((entry) => ({
      name: entry.name,
      probability:
        totalBooks > 0 ? entry.probabilitySum / totalBooks : 0,
      averageOdds:
        entry.books.length > 0 ? entry.oddsSum / entry.books.length : 0,
      bookmakerCount: entry.books.length,
      bookmakers: entry.books,
      noScorer: entry.name.toLocaleLowerCase() === "no scorer",
    }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 12);

  return { candidates, bookmakerCount: totalBooks };
}

export async function GET(
  _request: NextRequest,
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
        homeScore: true,
        awayScore: true,
        commenceTime: true,
      },
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    if (
      match.apiSource !== "odds-api" ||
      !match.externalId ||
      !SUPPORTED_SPORTS.has(match.sport)
    ) {
      return NextResponse.json(
        {
          error: "Player first-goalscorer market is not supported for this match",
          supported: false,
        },
        { status: 409 }
      );
    }

    if (!["upcoming", "live"].includes(match.status)) {
      return NextResponse.json(
        { error: "First-goalscorer market is closed for this match" },
        { status: 409 }
      );
    }

    if (
      match.status === "live" &&
      (match.homeScore ?? 0) + (match.awayScore ?? 0) > 0
    ) {
      return NextResponse.json(
        {
          error: "The first goal has already occurred",
          supported: true,
          occurred: true,
        },
        { status: 409 }
      );
    }

    const cacheKey = match.externalId;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({
        match,
        supported: true,
        cached: true,
        source: "bookmaker-consensus",
        disclaimer:
          "Player candidates are current bookmaker-market consensus, not a trained iBetPro player model.",
        ...cached.payload,
      });
    }

    const knownQuota = await latestKnownQuota();
    if (knownQuota != null && knownQuota < ODDS_API_QUOTA_FLOOR) {
      return NextResponse.json(
        {
          error: "Player-prop lookup paused to preserve provider quota",
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

    const playerPropStateKey = "odds-api:player-first-goalscorer";
    await prisma.providerSyncState.upsert({
      where: { key: playerPropStateKey },
      update: { lastAttemptAt: new Date() },
      create: {
        key: playerPropStateKey,
        provider: "odds-api",
        lastAttemptAt: new Date(),
      },
    });

    const params = new URLSearchParams({
      apiKey,
      regions: "us",
      markets: "player_first_goal_scorer",
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

    const response = await fetch(url, { cache: "no-store" });
    const requestCost = parseHeader(response, "x-requests-last");
    const remainingRequests = parseHeader(response, "x-requests-remaining");

    await prisma.providerSyncState.upsert({
      where: { key: playerPropStateKey },
      update: {
        lastSuccessAt: response.ok ? new Date() : undefined,
        metadataJson: JSON.stringify({
          remainingRequests,
          requestCost,
          status: response.status,
          matchId: match.id,
          sport: match.sport,
        }),
      },
      create: {
        key: playerPropStateKey,
        provider: "odds-api",
        lastSuccessAt: response.ok ? new Date() : null,
        metadataJson: JSON.stringify({
          remainingRequests,
          requestCost,
          status: response.status,
          matchId: match.id,
          sport: match.sport,
        }),
      },
    });

    if (!response.ok) {
      const providerText = await response.text();
      console.warn(
        "[FirstGoalscorer] Provider market unavailable",
        response.status,
        providerText.slice(0, 240)
      );
      return NextResponse.json(
        {
          error: "Player first-goalscorer market is unavailable right now",
          supported: true,
          providerStatus: response.status,
          remainingRequests,
          requestCost,
        },
        { status: response.status === 404 ? 404 : 502 }
      );
    }

    const data = await response.json();
    const { candidates, bookmakerCount } = aggregateCandidates(data);

    if (bookmakerCount === 0 || candidates.length === 0) {
      return NextResponse.json(
        {
          error: "No bookmaker first-goalscorer prices are available for this match",
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
      candidates,
      bookmakerCount,
      market: "player_first_goal_scorer",
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
        "Player candidates are current bookmaker-market consensus, not a trained iBetPro player model.",
      ...payload,
    });
  } catch (error) {
    console.error("[FirstGoalscorer] Failed:", error);
    return NextResponse.json(
      { error: "Failed to load player first-goalscorer candidates" },
      { status: 500 }
    );
  }
}
