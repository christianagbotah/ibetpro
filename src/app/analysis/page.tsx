"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePolling } from "@/lib/hooks";
import { getSportName, getSportShortName } from "@/lib/sports";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Brain,
  Clock3,
  Database,
  Filter,
  Goal,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  UserRoundSearch,
  Loader2,
} from "lucide-react";

type ProbabilityMarket = {
  key: string;
  label: string;
  probability: number;
  fairOdds: number | null;
};

type PredictionFeedItem = {
  match: {
    id: string;
    externalId: string | null;
    sport: string;
    league: string;
    homeTeam: string;
    awayTeam: string;
    commenceTime: string;
    status: string;
    minute: number | null;
    homeScore: number | null;
    awayScore: number | null;
    homeOdds: number | null;
    drawOdds: number | null;
    awayOdds: number | null;
    apiSource: string | null;
  };
  prediction: {
    resultMode: "baseline" | "market-consensus" | "selective-model";
    modelVersion: string;
    source: string;
    generatedAt: string;
    expectedGoals: {
      home: number;
      away: number;
      total: number;
    };
    result: {
      homeWin: number;
      draw: number;
      awayWin: number;
    };
    scorelines: Array<{
      home: number;
      away: number;
      probability: number;
    }>;
    markets: ProbabilityMarket[];
    confidence: number;
    dataCompleteness: number;
    warnings: string[];
  };
  summary: {
    winner: {
      key: "home" | "draw" | "away";
      label: string;
      probability: number;
    };
    likelyScore: {
      home: number;
      away: number;
      probability: number;
    } | null;
    expectedTotalGoals: number;
    over25Probability: number | null;
    bttsYesProbability: number | null;
    firstGoal: {
      state: "forecast" | "already-scored" | "unavailable";
      team: "home" | "away" | "none" | null;
      label: string;
      note: string;
      homeProbability: number | null;
      awayProbability: number | null;
      noGoalProbability: number | null;
    };
  };
};

type PlayerFirstGoalscorerCandidate = {
  name: string;
  probability: number;
  averageOdds: number;
  bookmakerCount: number;
  noScorer: boolean;
};

type PlayerFirstGoalscorerResponse = {
  supported?: boolean;
  cached?: boolean;
  source?: string;
  disclaimer?: string;
  bookmakerCount?: number;
  candidates?: PlayerFirstGoalscorerCandidate[];
  error?: string;
};

type PlayerPropState = {
  loading: boolean;
  data: PlayerFirstGoalscorerResponse | null;
  error: string | null;
};

type PlayerStatMarketKey = "shots" | "shots-on-target" | "assists";

type PlayerLineCandidate = {
  name: string;
  line: number;
  probability: number;
  averageOdds: number;
  bookmakerCount: number;
};

type PlayerLineResponse = {
  supported?: boolean;
  cached?: boolean;
  source?: string;
  disclaimer?: string;
  market?: PlayerStatMarketKey;
  label?: string;
  bookmakerCount?: number;
  candidates?: PlayerLineCandidate[];
  error?: string;
};

type PlayerLineState = {
  loading: boolean;
  data: PlayerLineResponse | null;
  error: string | null;
};

const PLAYER_STAT_LABELS: Record<PlayerStatMarketKey, string> = {
  shots: "Shots",
  "shots-on-target": "Shots on target",
  assists: "Assists",
};

const PLAYER_FIRST_GOALSCORER_SPORTS = new Set([
  "soccer_epl",
  "soccer_france_ligue_one",
  "soccer_germany_bundesliga",
  "soccer_italy_serie_a",
  "soccer_spain_la_liga",
  "soccer_usa_mls",
]);

type PredictionFeedResponse = {
  generatedAt: string;
  status: string;
  sport: string;
  horizonHours: number;
  page: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  liveCount: number;
  confirmedLiveCount: number;
  pendingLiveScoreCount: number;
  upcomingCount: number;
  count: number;
  availableSports: string[];
  predictions: PredictionFeedItem[];
};

const EMPTY_FEED: PredictionFeedResponse = {
  generatedAt: "",
  status: "all",
  sport: "all",
  horizonHours: 48,
  page: 1,
  pageSize: 24,
  totalPages: 1,
  totalCount: 0,
  hasPreviousPage: false,
  hasNextPage: false,
  liveCount: 0,
  confirmedLiveCount: 0,
  pendingLiveScoreCount: 0,
  upcomingCount: 0,
  count: 0,
  availableSports: [],
  predictions: [],
};

function pct(value: number | null | undefined) {
  return value == null ? "—" : Math.round(value * 100) + "%";
}

function modelLabel(item: PredictionFeedItem) {
  if (item.prediction.resultMode === "selective-model") return "Qualified model";

  const completeness = item.prediction.dataCompleteness;
  const hasConfirmedLiveScore =
    item.match.status === "live" &&
    item.match.homeScore != null &&
    item.match.awayScore != null;

  if (hasConfirmedLiveScore) return "Score-aware live baseline";

  if (item.prediction.resultMode === "market-consensus") {
    return completeness < 0.25
      ? "Market supported · sparse stats"
      : "Market + baseline";
  }

  if (completeness < 0.25) return "Sparse-data baseline";
  if (completeness < 0.65) return "Limited-data baseline";
  return "Stat-supported baseline";
}

function firstGoalProbability(item: PredictionFeedItem) {
  const firstGoal = item.summary.firstGoal;
  if (firstGoal.team === "home") return firstGoal.homeProbability;
  if (firstGoal.team === "away") return firstGoal.awayProbability;
  if (firstGoal.team === "none") return firstGoal.noGoalProbability;
  return null;
}

function strongestMarket(
  markets: ProbabilityMarket[],
  keys: string[]
): ProbabilityMarket | null {
  return (
    markets
      .filter((market) => keys.includes(market.key))
      .sort((a, b) => b.probability - a.probability)[0] ?? null
  );
}

function marketDisplayLabel(
  market: ProbabilityMarket | null,
  match: PredictionFeedItem["match"]
) {
  if (!market) return "Unavailable";
  if (market.key === "1x") return match.homeTeam + " or Draw";
  if (market.key === "x2") return match.awayTeam + " or Draw";
  if (market.key === "12") return "Either team wins";
  if (market.key.startsWith("home-")) {
    return market.label.replace(/^Home/, match.homeTeam);
  }
  if (market.key.startsWith("away-")) {
    return market.label.replace(/^Away/, match.awayTeam);
  }
  return market.label;
}

function playerLineStateKey(
  matchId: string,
  market: PlayerStatMarketKey
) {
  return matchId + ":" + market;
}

function PlayerCandidatePanel({
  title,
  state,
  onLoad,
}: {
  title: string;
  state: PlayerPropState | undefined;
  onLoad: () => void;
}) {
  return (
    <div className="rounded-lg border border-primary/15 bg-primary/5 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <UserRoundSearch className="h-4 w-4 text-primary" />
            {title}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            On-demand bookmaker consensus · supported major leagues only.
          </p>
        </div>

        {!state?.data && (
          <Button
            size="sm"
            variant="outline"
            className="border-primary/30 text-primary"
            disabled={state?.loading}
            onClick={onLoad}
          >
            {state?.loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserRoundSearch className="h-3.5 w-3.5" />
            )}
            {state?.loading ? "Loading..." : "View candidates"}
          </Button>
        )}
      </div>

      {state?.error && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-destructive/5 px-2.5 py-2">
          <p className="text-[11px] text-destructive">{state.error}</p>
          <Button size="xs" variant="ghost" onClick={onLoad}>
            Retry
          </Button>
        </div>
      )}

      {state?.data?.candidates && state.data.candidates.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {state.data.candidates
              .filter((candidate) => !candidate.noScorer)
              .slice(0, 6)
              .map((candidate, index) => (
                <div
                  key={candidate.name}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-background/40 px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">
                      {index + 1}. {candidate.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {candidate.bookmakerCount} bookmaker
                      {candidate.bookmakerCount === 1 ? "" : "s"} · avg odds{" "}
                      {candidate.averageOdds.toFixed(2)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-primary">
                    {pct(candidate.probability)}
                  </span>
                </div>
              ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {state.data.disclaimer ||
              "Current bookmaker consensus; not yet a trained iBetPro player model."}
          </p>
        </div>
      )}
    </div>
  );
}

function PlayerLineMarketPanel({
  activeMarket,
  state,
  onSelect,
}: {
  activeMarket: PlayerStatMarketKey | null;
  state: PlayerLineState | undefined;
  onSelect: (market: PlayerStatMarketKey) => void;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-secondary/10 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Target className="h-4 w-4 text-primary" />
            Player stat markets
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Choose one market to load current bookmaker-implied Over lines.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(PLAYER_STAT_LABELS) as PlayerStatMarketKey[]).map(
            (market) => (
              <Button
                key={market}
                size="xs"
                variant={activeMarket === market ? "default" : "outline"}
                disabled={state?.loading && activeMarket === market}
                onClick={() => onSelect(market)}
              >
                {state?.loading && activeMarket === market && (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
                {PLAYER_STAT_LABELS[market]}
              </Button>
            )
          )}
        </div>
      </div>

      {state?.error && (
        <p className="mt-2 rounded-md bg-destructive/5 px-2.5 py-2 text-[11px] text-destructive">
          {state.error}
        </p>
      )}

      {state?.data?.candidates && state.data.candidates.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {state.data.candidates.slice(0, 6).map((candidate, index) => (
              <div
                key={
                  candidate.name +
                  "-" +
                  candidate.line.toFixed(2)
                }
                className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-background/40 px-2.5 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">
                    {index + 1}. {candidate.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Over {candidate.line.toFixed(1)} ·{" "}
                    {candidate.bookmakerCount} bookmaker
                    {candidate.bookmakerCount === 1 ? "" : "s"} · avg odds{" "}
                    {candidate.averageOdds.toFixed(2)}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-bold text-primary">
                  {pct(candidate.probability)}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {state.data.disclaimer ||
              "Bookmaker-implied Over probability; not yet a trained iBetPro player model."}
          </p>
        </div>
      )}
    </div>
  );
}

export default function AnalysisPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [sportFilter, setSportFilter] = useState("all");
  const [hours, setHours] = useState("48");
  const [sortBy, setSortBy] = useState("kickoff");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [playerProps, setPlayerProps] = useState<Record<string, PlayerPropState>>({});
  const [anytimeProps, setAnytimeProps] = useState<Record<string, PlayerPropState>>({});
  const [playerLineProps, setPlayerLineProps] = useState<Record<string, PlayerLineState>>({});
  const [activePlayerLineMarkets, setActivePlayerLineMarkets] = useState<
    Record<string, PlayerStatMarketKey>
  >({});

  useEffect(() => {
    setPage(1);
  }, [statusFilter, sportFilter, hours]);

  const feedUrl = useMemo(() => {
    const params = new URLSearchParams({
      status: statusFilter,
      hours,
      page: String(page),
      pageSize: "24",
    });
    if (sportFilter !== "all") params.set("sport", sportFilter);
    return "/api/predictions/feed?" + params.toString();
  }, [statusFilter, sportFilter, hours, page]);

  const pollMs = statusFilter === "upcoming" ? 300_000 : 60_000;
  const {
    data: feed,
    loading,
    refetch,
  } = usePolling<PredictionFeedResponse>(feedUrl, pollMs, EMPTY_FEED);

  const loadPlayerFirstGoalscorer = async (matchId: string) => {
    setPlayerProps((current) => ({
      ...current,
      [matchId]: {
        loading: true,
        data: current[matchId]?.data ?? null,
        error: null,
      },
    }));

    try {
      const response = await fetch(
        "/api/predictions/" + matchId + "/first-goalscorer",
        { cache: "no-store" }
      );
      const payload = (await response.json()) as PlayerFirstGoalscorerResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Player market is unavailable");
      }

      setPlayerProps((current) => ({
        ...current,
        [matchId]: {
          loading: false,
          data: payload,
          error: null,
        },
      }));
    } catch (error) {
      setPlayerProps((current) => ({
        ...current,
        [matchId]: {
          loading: false,
          data: current[matchId]?.data ?? null,
          error:
            error instanceof Error
              ? error.message
              : "Player market is unavailable",
        },
      }));
    }
  };

  const loadPlayerAnytimeGoalscorer = async (matchId: string) => {
    setAnytimeProps((current) => ({
      ...current,
      [matchId]: {
        loading: true,
        data: current[matchId]?.data ?? null,
        error: null,
      },
    }));

    try {
      const response = await fetch(
        "/api/predictions/" + matchId + "/anytime-goalscorer",
        { cache: "no-store" }
      );
      const payload = (await response.json()) as PlayerFirstGoalscorerResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Anytime goalscorer market is unavailable");
      }

      setAnytimeProps((current) => ({
        ...current,
        [matchId]: {
          loading: false,
          data: payload,
          error: null,
        },
      }));
    } catch (error) {
      setAnytimeProps((current) => ({
        ...current,
        [matchId]: {
          loading: false,
          data: current[matchId]?.data ?? null,
          error:
            error instanceof Error
              ? error.message
              : "Anytime goalscorer market is unavailable",
        },
      }));
    }
  };

  const loadPlayerLineMarket = async (
    matchId: string,
    market: PlayerStatMarketKey
  ) => {
    setActivePlayerLineMarkets((current) => ({
      ...current,
      [matchId]: market,
    }));

    const key = playerLineStateKey(matchId, market);
    setPlayerLineProps((current) => ({
      ...current,
      [key]: {
        loading: true,
        data: current[key]?.data ?? null,
        error: null,
      },
    }));

    try {
      const response = await fetch(
        "/api/predictions/" +
          matchId +
          "/player-markets?market=" +
          encodeURIComponent(market),
        { cache: "no-store" }
      );
      const payload = (await response.json()) as PlayerLineResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Player stat market is unavailable");
      }

      setPlayerLineProps((current) => ({
        ...current,
        [key]: {
          loading: false,
          data: payload,
          error: null,
        },
      }));
    } catch (error) {
      setPlayerLineProps((current) => ({
        ...current,
        [key]: {
          loading: false,
          data: current[key]?.data ?? null,
          error:
            error instanceof Error
              ? error.message
              : "Player stat market is unavailable",
        },
      }));
    }
  };

  const filteredPredictions = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = feed.predictions.filter((item) => {
      if (!query) return true;
      return [
        item.match.homeTeam,
        item.match.awayTeam,
        item.match.league,
        getSportName(item.match.sport),
      ].some((value) => value.toLowerCase().includes(query));
    });

    return [...rows].sort((a, b) => {
      if (a.match.status === "live" && b.match.status !== "live") return -1;
      if (b.match.status === "live" && a.match.status !== "live") return 1;

      if (sortBy === "confidence") {
        return b.prediction.confidence - a.prediction.confidence;
      }
      if (sortBy === "goals") {
        return b.prediction.expectedGoals.total - a.prediction.expectedGoals.total;
      }
      return (
        new Date(a.match.commenceTime).getTime() -
        new Date(b.match.commenceTime).getTime()
      );
    });
  }, [feed.predictions, search, sortBy]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">
              Live & Upcoming AI Predictions
            </h1>
            {feed.confirmedLiveCount > 0 && (
              <Badge className="border-red-500/30 bg-red-500/15 text-red-400">
                <Radio className="mr-1 h-3 w-3" />
                {feed.confirmedLiveCount} LIVE SCORED
              </Badge>
            )}
            {feed.pendingLiveScoreCount > 0 && (
              <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-400">
                {feed.pendingLiveScoreCount} SCORE PENDING
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Live-window fixtures appear first, with confirmed-score matches clearly
            separated from score-pending fixtures, followed by upcoming forecasts.
          </p>
          <p className="mt-1 max-w-4xl text-xs text-muted-foreground">
            “First goal” always includes the team most likely to score first. For
            supported EPL, Ligue 1, Bundesliga, Serie A, La Liga and MLS fixtures,
            first- and anytime-goalscorer candidates plus selected player stat markets are available on demand.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5" />
          {feed.generatedAt
            ? "Updated " +
              new Date(feed.generatedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })
            : "Loading predictions"}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Confirmed live scores</p>
                <p className="mt-1 text-2xl font-bold">{feed.confirmedLiveCount}</p>
                {feed.pendingLiveScoreCount > 0 && (
                  <p className="mt-0.5 text-[10px] text-amber-400">
                    +{feed.pendingLiveScoreCount} live-window score pending
                  </p>
                )}
              </div>
              <Radio className="h-5 w-5 text-red-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">
                  Upcoming · next {feed.horizonHours}h
                </p>
                <p className="mt-1 text-2xl font-bold">{feed.upcomingCount}</p>
              </div>
              <Clock3 className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Predictions on this page</p>
                <p className="mt-1 text-2xl font-bold">
                  {feed.count}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    / {feed.totalCount}
                  </span>
                </p>
              </div>
              <Brain className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search team or league..."
                className="h-10 w-full rounded-md border border-border bg-secondary/50 pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[135px] bg-secondary/50">
                <Filter className="mr-1 h-3.5 w-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Live + Upcoming</SelectItem>
                <SelectItem value="live">Live only</SelectItem>
                <SelectItem value="upcoming">Upcoming only</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sportFilter} onValueChange={setSportFilter}>
              <SelectTrigger className="w-[155px] bg-secondary/50">
                <SelectValue placeholder="All sports" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All football</SelectItem>
                {feed.availableSports.map((sport) => (
                  <SelectItem key={sport} value={sport}>
                    {getSportName(sport)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={hours} onValueChange={setHours}>
              <SelectTrigger className="w-[125px] bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24">Next 24h</SelectItem>
                <SelectItem value="48">Next 48h</SelectItem>
                <SelectItem value="72">Next 72h</SelectItem>
                <SelectItem value="168">Next 7 days</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[145px] bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kickoff">Kickoff time</SelectItem>
                <SelectItem value="confidence">Confidence</SelectItem>
                <SelectItem value="goals">Expected goals</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              onClick={refetch}
              className="border-primary/30 text-primary"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && feed.predictions.length === 0 ? (
        <div className="flex h-64 items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Building match predictions...
          </div>
        </div>
      ) : filteredPredictions.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="p-10 text-center">
            <Brain className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-3 font-medium">No matches in this view</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try Live + Upcoming, a wider time window, or another competition.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredPredictions.map((item) => {
            const match = item.match;
            const prediction = item.prediction;
            const summary = item.summary;
            const firstGoalPct = firstGoalProbability(item);
            const hasConfirmedLiveScore =
              match.status === "live" &&
              match.homeScore != null &&
              match.awayScore != null;
            const currentGoalTotal =
              (match.homeScore ?? 0) + (match.awayScore ?? 0);
            const playerPropSupported =
              PLAYER_FIRST_GOALSCORER_SPORTS.has(match.sport) &&
              Boolean(match.externalId);
            const playerFirstGoalscorerSupported =
              playerPropSupported &&
              (match.status === "upcoming" ||
                (match.status === "live" && currentGoalTotal === 0));
            const playerAnytimeGoalscorerSupported =
              playerPropSupported &&
              (match.status === "upcoming" || match.status === "live");
            const playerPropState = playerProps[match.id];
            const anytimePropState = anytimeProps[match.id];
            const activePlayerLineMarket =
              activePlayerLineMarkets[match.id] ?? null;
            const activePlayerLineState = activePlayerLineMarket
              ? playerLineProps[
                  playerLineStateKey(match.id, activePlayerLineMarket)
                ]
              : undefined;
            const kickoff = new Date(match.commenceTime);
            const winnerProbabilities = [
              ["Home", prediction.result.homeWin],
              ["Draw", prediction.result.draw],
              ["Away", prediction.result.awayWin],
            ] as const;
            const doubleChance = strongestMarket(prediction.markets, [
              "1x",
              "x2",
              "12",
            ]);
            const drawNoBet = strongestMarket(prediction.markets, [
              "home-dnb",
              "away-dnb",
            ]);
            const cleanSheet = strongestMarket(prediction.markets, [
              "home-clean-sheet",
              "away-clean-sheet",
            ]);
            const winGoals = strongestMarket(prediction.markets, [
              "home-win-over-1.5",
              "away-win-over-1.5",
              "home-win-over-2.5",
              "away-win-over-2.5",
            ]);

            return (
              <Card
                key={match.id}
                className="overflow-hidden border-border bg-card transition-colors hover:border-primary/30"
              >
                <CardContent className="p-0">
                  <div className="border-b border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">
                            {getSportShortName(match.sport)}
                          </Badge>
                          <span className="truncate text-xs text-muted-foreground">
                            {match.league}
                          </span>
                          {match.status === "live" ? (
                            hasConfirmedLiveScore ? (
                              <Badge className="border-red-500/30 bg-red-500/15 text-[10px] text-red-400">
                                LIVE{match.minute != null ? " · " + match.minute + "'" : ""}
                              </Badge>
                            ) : (
                              <Badge className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-400">
                                LIVE WINDOW · SCORE PENDING
                              </Badge>
                            )
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              UPCOMING
                            </Badge>
                          )}
                        </div>

                        <h2 className="mt-2 text-base font-semibold text-foreground sm:text-lg">
                          {match.homeTeam} <span className="text-muted-foreground">vs</span>{" "}
                          {match.awayTeam}
                        </h2>

                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {hasConfirmedLiveScore ? (
                            <span className="font-semibold text-foreground">
                              Score {match.homeScore}–{match.awayScore}
                            </span>
                          ) : (
                            <span>
                              {kickoff.toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                              })}{" "}
                              ·{" "}
                              {kickoff.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                          <span>{modelLabel(item)}</span>
                          <span>{prediction.modelVersion}</span>
                        </div>
                      </div>

                      <div className="shrink-0 rounded-xl bg-primary/5 px-3 py-2 text-center">
                        <p className="text-[10px] text-muted-foreground">Confidence</p>
                        <p className="text-lg font-bold text-primary">
                          {pct(prediction.confidence)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 p-4">
                    <div className="grid grid-cols-3 gap-2">
                      {winnerProbabilities.map(([label, probability]) => (
                        <div
                          key={label}
                          className="rounded-lg border border-border bg-secondary/30 p-2 text-center"
                        >
                          <p className="text-[10px] text-muted-foreground">{label}</p>
                          <p className="mt-0.5 text-base font-bold">{pct(probability)}</p>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-lg border border-border p-3">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <Trophy className="h-3.5 w-3.5" />
                          Winner lean
                        </div>
                        <p className="mt-1 truncate text-sm font-semibold text-primary">
                          {summary.winner.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {pct(summary.winner.probability)}
                        </p>
                      </div>

                      <div className="rounded-lg border border-border p-3">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <Target className="h-3.5 w-3.5" />
                          Likely score
                        </div>
                        <p className="mt-1 text-sm font-semibold">
                          {summary.likelyScore
                            ? summary.likelyScore.home +
                              " – " +
                              summary.likelyScore.away
                            : "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {summary.likelyScore
                            ? pct(summary.likelyScore.probability)
                            : "Unavailable"}
                        </p>
                      </div>

                      <div className="rounded-lg border border-border p-3">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <Goal className="h-3.5 w-3.5" />
                          Expected goals
                        </div>
                        <p className="mt-1 text-sm font-semibold">
                          {summary.expectedTotalGoals.toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {prediction.expectedGoals.home.toFixed(2)} –{" "}
                          {prediction.expectedGoals.away.toFixed(2)}
                        </p>
                      </div>

                      <div className="rounded-lg border border-border p-3">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <Sparkles className="h-3.5 w-3.5" />
                          First goal
                        </div>
                        <p className="mt-1 truncate text-sm font-semibold">
                          {summary.firstGoal.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {firstGoalPct != null
                            ? pct(firstGoalPct)
                            : summary.firstGoal.state === "already-scored"
                              ? "Occurred"
                              : "Unavailable"}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-lg bg-secondary/30 px-3 py-2">
                        <p className="text-[10px] text-muted-foreground">Over 2.5</p>
                        <p className="text-sm font-semibold">
                          {pct(summary.over25Probability)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-secondary/30 px-3 py-2">
                        <p className="text-[10px] text-muted-foreground">BTTS Yes</p>
                        <p className="text-sm font-semibold">
                          {pct(summary.bttsYesProbability)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-secondary/30 px-3 py-2">
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <ShieldCheck className="h-3 w-3" />
                          Confidence
                        </div>
                        <p className="text-sm font-semibold">
                          {pct(prediction.confidence)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-secondary/30 px-3 py-2">
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Database className="h-3 w-3" />
                          Data coverage
                        </div>
                        <p className="text-sm font-semibold">
                          {pct(prediction.dataCompleteness)}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border/70 bg-secondary/15 p-3">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        More markets
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[
                          ["Double chance", doubleChance],
                          ["Draw no bet", drawNoBet],
                          ["Clean sheet", cleanSheet],
                          ["Win + goals", winGoals],
                        ].map(([label, market]) => {
                          const typedMarket = market as ProbabilityMarket | null;
                          return (
                            <div
                              key={String(label)}
                              className="rounded-md border border-border/60 bg-background/40 px-2.5 py-2"
                            >
                              <p className="text-[10px] text-muted-foreground">
                                {String(label)}
                              </p>
                              <p className="mt-0.5 truncate text-xs font-semibold">
                                {marketDisplayLabel(typedMarket, match)}
                              </p>
                              <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                                <span>{pct(typedMarket?.probability)}</span>
                                <span>
                                  Fair{" "}
                                  {typedMarket?.fairOdds != null
                                    ? typedMarket.fairOdds.toFixed(2)
                                    : "—"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {playerFirstGoalscorerSupported && (
                      <PlayerCandidatePanel
                        title="Player first-goalscorer candidates"
                        state={playerPropState}
                        onLoad={() => void loadPlayerFirstGoalscorer(match.id)}
                      />
                    )}

                    {playerAnytimeGoalscorerSupported && (
                      <PlayerCandidatePanel
                        title="Player anytime-goalscorer candidates"
                        state={anytimePropState}
                        onLoad={() => void loadPlayerAnytimeGoalscorer(match.id)}
                      />
                    )}

                    {playerPropSupported && (
                      <PlayerLineMarketPanel
                        activeMarket={activePlayerLineMarket}
                        state={activePlayerLineState}
                        onSelect={(market) =>
                          void loadPlayerLineMarket(match.id, market)
                        }
                      />
                    )}

                    <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">
                          {summary.firstGoal.note}
                        </p>
                        {prediction.warnings[0] && (
                          <p className="mt-1 truncate text-[10px] text-amber-500">
                            {prediction.warnings[0]}
                          </p>
                        )}
                      </div>

                      <Button asChild size="sm" className="shrink-0">
                        <Link href={"/matches/" + match.id}>Open match details</Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {feed.totalPages > 1 && (
        <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            Showing page {feed.page} of {feed.totalPages} · {feed.totalCount} matches
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!feed.hasPreviousPage || loading}
              onClick={() => {
                setPage((current) => Math.max(1, current - 1));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              Previous
            </Button>
            <span className="min-w-[72px] text-center text-xs font-medium">
              {feed.page} / {feed.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!feed.hasNextPage || loading}
              onClick={() => {
                setPage((current) => current + 1);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
