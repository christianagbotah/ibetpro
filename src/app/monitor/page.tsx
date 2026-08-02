"use client";

import { useState, useEffect, useCallback } from "react";
import { usePolling, useFetch } from "@/lib/hooks";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Radio, Eye, DollarSign, Clock, Zap, Volume2, VolumeX, Play, TrendingUp, RefreshCw, Layers, Brain } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { getSportShortName, getSportName } from "@/lib/sports";
import Link from "next/link";

interface LiveMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  homeOdds: number;
  awayOdds: number;
  drawOdds: number | null;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  status: string;
  commenceTime: string;
  aiHomeWinProb: number | null;
  aiAwayWinProb: number | null;
  aiConfidence: number | null;
  aiRecommended: string | null;
  aiAnalysis: string | null;
}

interface ActiveBet {
  id: string;
  betType: string;
  selection: string;
  odds: number;
  stake: number;
  potentialWin: number;
  status: string;
  isAutoPlaced: boolean;
  aiConfidence: number | null;
  aiReasoning: string | null;
  accumulatorId: string | null;
  partialCashoutAmount: number | null;
  match?: {
    id: string;
    homeTeam: string;
    awayTeam: string;
    sport: string;
    league: string;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
    minute: number | null;
  };
}

interface CashoutRec {
  shouldCashout: boolean;
  cashoutAmount: number;
  partialCashoutAmount: number;
  reasoning: string;
  urgency: "low" | "medium" | "high";
  waitOrCashout: "wait" | "cashout_partial" | "cashout_full" | "wait_for_settlement";
  settlementProbability: number;
}

interface MatchEvent {
  matchId: string;
  text: string;
  timestamp: number;
}

export default function MonitorPage() {
  const { addToast } = useToast();
  const { user } = useAuth();
  const { data: allMatches, loading: matchesLoading, refetch: refetchMatches } = usePolling<LiveMatch[]>("/api/matches", 15000, []);
  const { data: bets, loading: betsLoading, refetch: refetchBets } = usePolling<ActiveBet[]>("/api/bets?status=pending", 15000, []);
  const [cashoutRecs, setCashoutRecs] = useState<Record<string, CashoutRec>>({});
  const [cashedOutBets, setCashedOutBets] = useState<Set<string>>(new Set());
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [simulating, setSimulating] = useState<string | null>(null);
  const [matchEvents, setMatchEvents] = useState<MatchEvent[]>([]);
  const [autoSettleRunning, setAutoSettleRunning] = useState(false);

  const loading = matchesLoading || betsLoading;

  // Fetch cashout recommendations for live bets
  useEffect(() => {
    const liveBets = bets.filter((b) => b.match?.status === "live" && !cashedOutBets.has(b.id));
    let cancelled = false;

    async function fetchCashouts() {
      for (const bet of liveBets) {
        if (cancelled) break;
        try {
          const res = await fetch(`/api/cashout?betId=${bet.id}`);
          if (res.ok && !cancelled) {
            const result = await res.json();
            setCashoutRecs((prev) => ({
              ...prev,
              [bet.id]: result.cashoutRecommendation,
            }));
          }
        } catch {
          // Ignore cashout errors
        }
      }
    }

    if (liveBets.length > 0) {
      fetchCashouts();
    }

    return () => {
      cancelled = true;
    };
  }, [bets, cashedOutBets]);

  const handleCashout = useCallback(async (betId: string, type: "full" | "partial" = "full") => {
    setCashedOutBets((prev) => new Set(prev).add(betId));
    try {
      const res = await fetch("/api/cashout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betId, cashoutType: type }),
      });
      if (res.ok) {
        const result = await res.json();
        addToast("success", `${type === "partial" ? "Partial" : "Full"} cashout: $${result.amount?.toFixed(2)}`);
      } else {
        const data = await res.json();
        addToast("error", data.error || "Cashout failed");
      }
    } catch {
      addToast("error", "Cashout failed");
    }
    refetchBets();
  }, [addToast, refetchBets]);

  const handleSimulate = useCallback(async (matchId: string) => {
    setSimulating(matchId);
    try {
      const res = await fetch("/api/matches/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.events && result.events.length > 0) {
          result.events.forEach((event: string) => {
            setMatchEvents((prev) => [
              { matchId, text: event, timestamp: Date.now() },
              ...prev,
            ].slice(0, 20));
          });
          addToast("info", `Match progressed: ${result.events.join(", ")}`);
        } else {
          addToast("info", "Match progressed, no goals scored");
        }
        refetchMatches();
        refetchBets();
      } else {
        addToast("error", "Failed to simulate match progress");
      }
    } catch {
      addToast("error", "Failed to simulate match progress");
    } finally {
      setSimulating(null);
    }
  }, [addToast, refetchMatches, refetchBets]);

  const handleAutoSettle = useCallback(async () => {
    if (!user?.id) return;
    setAutoSettleRunning(true);
    try {
      const res = await fetch("/api/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.settled > 0) {
          addToast("success", `Settled ${result.settled} bet(s). Profit: $${result.totalProfit?.toFixed(2)}`);
        } else {
          addToast("info", "No bets to settle");
        }
        refetchBets();
      }
    } catch {
      addToast("error", "Settlement failed");
    } finally {
      setAutoSettleRunning(false);
    }
  }, [user?.id, addToast, refetchBets]);

  const liveMatches = allMatches.filter((m) => m.status === "live" || m.status === "upcoming");
  const liveMatchesList = liveMatches.filter((m) => m.status === "live");
  const upcomingMatchesList = liveMatches.filter((m) => m.status === "upcoming");
  const activeBets = bets.filter((b) => !cashedOutBets.has(b.id));
  const accumulatorBets = activeBets.filter((b) => b.accumulatorId);
  const singleBets = activeBets.filter((b) => !b.accumulatorId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading monitor...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Live Monitor</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track live matches and manage active bets in real-time
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`${soundEnabled ? "border-primary/30 text-primary" : "border-border text-muted-foreground"}`}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4 mr-1.5" /> : <VolumeX className="h-4 w-4 mr-1.5" />}
            {soundEnabled ? "Sound On" : "Sound Off"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleAutoSettle}
            disabled={autoSettleRunning}
            className="border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/10"
          >
            {autoSettleRunning ? (
              <div className="h-4 w-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1.5" />
            )}
            Settle Bets
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10">
              <Radio className="h-4 w-4 text-red-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Live Matches</p>
              <p className="text-lg font-bold text-foreground">{liveMatchesList.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active Bets</p>
              <p className="text-lg font-bold text-foreground">{activeBets.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-400/10">
              <Layers className="h-4 w-4 text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Accumulators</p>
              <p className="text-lg font-bold text-foreground">{accumulatorBets.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-400/10">
              <DollarSign className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cashout Offers</p>
              <p className="text-lg font-bold text-foreground">
                {Object.keys(cashoutRecs).length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10">
              <Eye className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Upcoming</p>
              <p className="text-lg font-bold text-foreground">{upcomingMatchesList.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Matches with Simulate */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio className="h-4 w-4 text-red-500" />
              Live Matches
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[calc(100vh-360px)] overflow-y-auto">
            {liveMatchesList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No live matches at the moment
              </p>
            ) : (
              liveMatchesList.map((match) => (
                <div
                  key={match.id}
                  className="rounded-lg border border-red-500/20 bg-red-500/5 p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-live-pulse absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                      </span>
                      <Badge className="text-[10px] bg-red-500/20 text-red-400 border-red-500/30">
                        LIVE
                      </Badge>
                      <span className="text-xs text-muted-foreground">{match.minute}&apos;</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{match.league || getSportShortName(match.sport)}</span>
                      <Button
                        size="xs"
                        variant="outline"
                        className="border-primary/30 text-primary hover:bg-primary/10"
                        onClick={() => handleSimulate(match.id)}
                        disabled={simulating === match.id}
                      >
                        {simulating === match.id ? (
                          <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                        Simulate
                      </Button>
                    </div>
                  </div>

                  <Link href={`/matches/${match.id}`} className="block">
                    <div className="flex items-center justify-center gap-6 my-3">
                      <div className="text-center">
                        <p className="text-sm font-medium text-foreground">{match.homeTeam}</p>
                        <p className="text-3xl font-bold text-foreground">{match.homeScore}</p>
                      </div>
                      <div className="text-lg text-muted-foreground">-</div>
                      <div className="text-center">
                        <p className="text-sm font-medium text-foreground">{match.awayTeam}</p>
                        <p className="text-3xl font-bold text-foreground">{match.awayScore}</p>
                      </div>
                    </div>
                  </Link>

                  <div className="mt-2">
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-red-500 transition-all"
                        style={{ width: `${((match.minute || 0) / 90) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>KO</span>
                      <span>HT</span>
                      <span>FT</span>
                    </div>
                  </div>

                  {match.aiRecommended && (
                    <div className="mt-3 rounded bg-primary/5 border border-primary/10 p-2">
                      <div className="flex items-center gap-1">
                        <Brain className="h-3 w-3 text-primary" />
                        <span className="text-[10px] text-muted-foreground">AI recommends:</span>
                        <span className="text-xs font-medium text-primary">
                          {match.aiRecommended === "home" ? match.homeTeam : match.aiRecommended === "away" ? match.awayTeam : match.aiRecommended}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}

            {upcomingMatchesList.length > 0 && (
              <>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-4">
                  Upcoming
                </div>
                {upcomingMatchesList.slice(0, 3).map((match) => (
                  <Link key={match.id} href={`/matches/${match.id}`} className="block">
                    <div className="rounded-lg bg-secondary/50 p-3 hover:bg-secondary transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {match.homeTeam} vs {match.awayTeam}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {match.league || getSportName(match.sport)} &middot; {new Date(match.commenceTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Upcoming</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        {/* Active Bets & Cashout */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-amber-400" />
              Active Bets & Cashout
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[calc(100vh-360px)] overflow-y-auto">
            {activeBets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No active bets
              </p>
            ) : (
              activeBets.map((bet) => {
                const cashoutRec = cashoutRecs[bet.id];
                const isSelectedOnLiveMatch = bet.match?.status === "live";
                const isWinning =
                  isSelectedOnLiveMatch &&
                  ((bet.selection === bet.match?.homeTeam && (bet.match?.homeScore ?? 0) > (bet.match?.awayScore ?? 0)) ||
                    (bet.selection === bet.match?.awayTeam && (bet.match?.awayScore ?? 0) > (bet.match?.homeScore ?? 0)));
                const isAcca = !!bet.accumulatorId;

                return (
                  <div
                    key={bet.id}
                    className={`rounded-lg border p-4 ${
                      isSelectedOnLiveMatch
                        ? isWinning
                          ? "border-emerald-400/20 bg-emerald-400/5"
                          : "border-red-400/20 bg-red-400/5"
                        : isAcca
                        ? "border-purple-400/20 bg-purple-400/5"
                        : "border-border bg-secondary/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {bet.isAutoPlaced && (
                          <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                            AI
                          </Badge>
                        )}
                        {isAcca && (
                          <Badge className="text-[10px] bg-purple-400/10 text-purple-400 border-purple-400/20">
                            <Layers className="h-3 w-3 mr-0.5" />
                            Acca
                          </Badge>
                        )}
                        <span className="text-sm font-medium text-foreground">
                          {bet.match?.homeTeam} vs {bet.match?.awayTeam}
                        </span>
                      </div>
                      {isSelectedOnLiveMatch && (
                        <Badge
                          className={`text-[10px] ${
                            isWinning
                              ? "bg-emerald-400/10 text-emerald-400"
                              : "bg-red-400/10 text-red-400"
                          }`}
                        >
                          {isWinning ? "WINNING" : "LOSING"}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-muted-foreground">
                        {bet.selection} @ {bet.odds}
                      </span>
                      <span className="text-foreground font-medium">
                        ${bet.stake.toFixed(2)} stake
                      </span>
                    </div>

                    {isSelectedOnLiveMatch && bet.match?.homeScore != null && (
                      <div className="flex items-center justify-center gap-4 my-2">
                        <span className="text-lg font-bold text-foreground">
                          {bet.match.homeScore} - {bet.match.awayScore}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {bet.match.minute}&apos;
                        </span>
                      </div>
                    )}

                    {/* Cashout visualization with progress bar */}
                    {cashoutRec && (
                      <div className="mt-2 rounded-lg bg-secondary/50 p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground">
                            {cashoutRec.waitOrCashout === "wait_for_settlement" ? "Settlement" : "Cashout Offer"}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-amber-400">
                              ${cashoutRec.cashoutAmount.toFixed(2)}
                            </span>
                            {cashoutRec.settlementProbability > 0 && (
                              <Badge variant="secondary" className="text-[10px]">
                                {Math.round(cashoutRec.settlementProbability * 100)}% win
                              </Badge>
                            )}
                          </div>
                        </div>
                        {/* Cashout progress bar */}
                        <div className="h-1.5 rounded-full bg-secondary overflow-hidden mb-2">
                          <div
                            className={`h-full rounded-full transition-all ${
                              cashoutRec.urgency === "high"
                                ? "bg-red-500"
                                : cashoutRec.urgency === "medium"
                                ? "bg-amber-400"
                                : cashoutRec.waitOrCashout === "wait_for_settlement"
                                ? "bg-emerald-400"
                                : "bg-primary"
                            }`}
                            style={{ width: `${Math.min((cashoutRec.cashoutAmount / bet.potentialWin) * 100, 100)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mb-2">
                          {cashoutRec.reasoning}
                        </p>
                        {/* Action buttons */}
                        <div className="flex gap-2">
                          {cashoutRec.shouldCashout && cashoutRec.waitOrCashout === "cashout_partial" && cashoutRec.partialCashoutAmount > 0 && (
                            <Button
                              size="xs"
                              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/80"
                              onClick={() => handleCashout(bet.id, "partial")}
                            >
                              <DollarSign className="h-3 w-3" />
                              Partial ${cashoutRec.partialCashoutAmount.toFixed(2)}
                            </Button>
                          )}
                          {cashoutRec.shouldCashout && cashoutRec.waitOrCashout !== "wait_for_settlement" && (
                            <Button
                              size="xs"
                              className="flex-1 bg-amber-400 text-black hover:bg-amber-400/80"
                              onClick={() => handleCashout(bet.id, "full")}
                            >
                              <DollarSign className="h-3 w-3" />
                              Cashout ${cashoutRec.cashoutAmount.toFixed(2)}
                            </Button>
                          )}
                          {cashoutRec.waitOrCashout === "wait_for_settlement" && (
                            <div className="flex items-center gap-2 text-xs text-emerald-400 w-full">
                              <TrendingUp className="h-3 w-3" />
                              <span>Waiting for full settlement for maximum payout</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs mt-2">
                      <span className="text-muted-foreground">Potential Win</span>
                      <span className="text-emerald-400 font-medium">
                        ${bet.potentialWin.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Match Events Timeline */}
      {matchEvents.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-primary" />
                Match Events Timeline
              </CardTitle>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setMatchEvents([])}
              >
                Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {matchEvents.map((event, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 shrink-0 mt-0.5">
                    <Radio className="h-3 w-3 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-foreground">{event.text}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
