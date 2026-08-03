"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, CheckCircle2, Circle, Loader2, Copy } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useCurrency } from "@/components/currency-provider";

interface TipMatch {
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  commenceTime: string;
}

interface Tip {
  id: string;
  matchId: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  selection: string;
  odds: number;
  aiConfidence: number;
  valueEdge: number;
  kellyStake: number;
  riskLevel: string;
  aiReasoning: string | null;
  tracked: boolean;
  userStake: number | null;
  userResult: string | null;
  userProfit: number | null;
  outcome: string | null;
  profit: number | null;
  commencesAt: string;
  createdAt: string;
  match?: TipMatch;
}

interface Performance {
  totalSettled: number;
  won: number;
  lost: number;
  winRate: number;
  totalProfit: number;
  roi: number;
  trackedSettled: number;
  trackedWon: number;
  trackedWinRate: number;
  trackedProfit: number;
}

const sportEmoji: Record<string, string> = {
  football: "⚽", basketball: "🏀", tennis: "🎾", cricket: "🏏", rugby: "🏉",
};

const riskColors: Record<string, string> = {
  low: "bg-emerald-400", medium: "bg-amber-400", high: "bg-red-400",
};

export default function TipsPage() {
  const { user } = useAuth();
  const { symbol } = useCurrency();
  const [tips, setTips] = useState<Tip[]>([]);
  const [performance, setPerformance] = useState<Performance>({
    totalSettled: 0, won: 0, lost: 0, winRate: 0, totalProfit: 0, roi: 0,
    trackedSettled: 0, trackedWon: 0, trackedWinRate: 0, trackedProfit: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchTips = useCallback(async () => {
    try {
      const res = await fetch(`/api/tips?filter=${filter}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setTips(data.tips || []);
        setPerformance(data.performance || performance);
      }
    } catch {
      // Use existing data
    } finally {
      setLoading(false);
    }
  }, [filter, performance]);

  useEffect(() => {
    fetchTips();
  }, [fetchTips]);

  const handleTrack = async (tipId: string, tracked: boolean) => {
    try {
      const res = await fetch("/api/tips/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipId, tracked }),
      });
      if (res.ok) {
        setTips((prev) =>
          prev.map((t) => (t.id === tipId ? { ...t, tracked } : t))
        );
      }
    } catch {
      // Ignore
    }
  };

  const handleReportResult = async (tipId: string, userResult: "won" | "lost" | "void") => {
    try {
      const tip = tips.find(t => t.id === tipId);
      const res = await fetch("/api/tips/track", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipId,
          userResult,
          userStake: tip?.userStake || undefined,
          userProfit: userResult === "won" ? (tip?.userStake || 0) * (tip?.odds || 0) - (tip?.userStake || 0) : userResult === "lost" ? -(tip?.userStake || 0) : 0,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTips((prev) =>
          prev.map((t) => (t.id === tipId ? { ...t, userResult: updated.userResult, userProfit: updated.userProfit } : t))
        );
      }
    } catch {
      // Ignore
    }
  };

  const handleCopySelection = (tip: Tip) => {
    const text = `${tip.homeTeam} vs ${tip.awayTeam} — ${tip.selection} @ ${tip.odds.toFixed(2)}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(tip.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const formatMatchTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();
    const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    if (isToday) return `Today ${time}`;
    if (isTomorrow) return `Tomorrow ${time}`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ` ${time}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            AI Tips
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Value bet recommendations from the 4-model ensemble AI. Track the ones you follow and report your results.
          </p>
        </div>
      </div>

      {/* Performance Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">AI Settled</p>
            <p className="text-lg font-bold text-foreground">{performance.totalSettled}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">AI Win Rate</p>
            <p className="text-lg font-bold text-emerald-400">{performance.winRate}%</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">AI Profit</p>
            <p className={`text-lg font-bold ${performance.totalProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {performance.totalProfit >= 0 ? "+" : ""}{symbol}{performance.totalProfit.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Your Win Rate</p>
            <p className="text-lg font-bold text-primary">{performance.trackedWinRate}%</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Your Profit</p>
            <p className={`text-lg font-bold ${performance.trackedProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {performance.trackedProfit >= 0 ? "+" : ""}{symbol}{performance.trackedProfit.toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList className="bg-secondary">
          <TabsTrigger value="all">All Tips</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="tracked">Tracked</TabsTrigger>
          <TabsTrigger value="settled">Settled</TabsTrigger>
        </TabsList>

        <TabsContent value={filter} className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : tips.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="p-8 text-center">
                <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No tips yet. The AI will generate recommendations when value bets are found.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {tips.map((tip) => (
                <Card key={tip.id} className={`bg-card border-border ${tip.tracked ? "ring-1 ring-primary/30" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      {/* Left: Match info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm">{sportEmoji[tip.sport.toLowerCase()] || "🎯"}</span>
                          <span className="text-xs text-muted-foreground">{tip.league}</span>
                          <div className={`h-2 w-2 rounded-full ${riskColors[tip.riskLevel] || "bg-amber-400"}`} />
                          <span className="text-[10px] text-muted-foreground capitalize">{tip.riskLevel}</span>
                          {tip.outcome && (
                            <Badge variant={tip.outcome === "won" ? "default" : "destructive"} className="text-[10px] h-4 px-1.5">
                              AI: {tip.outcome === "won" ? "WON" : tip.outcome === "lost" ? "LOST" : "VOID"}
                            </Badge>
                          )}
                          {tip.userResult && (
                            <Badge variant={tip.userResult === "won" ? "default" : "destructive"} className="text-[10px] h-4 px-1.5 bg-blue-500/20 text-blue-400 border-blue-500/30">
                              You: {tip.userResult === "won" ? "WON" : tip.userResult === "lost" ? "LOST" : "VOID"}
                            </Badge>
                          )}
                          {/* Match status badge — shows when match hasn't ended yet */}
                          {!tip.outcome && tip.match?.status && tip.match.status !== "finished" && (
                            <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${tip.match.status === "live" ? "text-emerald-400 border-emerald-400/30" : "text-muted-foreground"}`}>
                              {tip.match.status === "live" ? "LIVE" : tip.match.status === "upcoming" ? "UPCOMING" : tip.match.status.toUpperCase()}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-foreground">
                          {tip.homeTeam} vs {tip.awayTeam}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatMatchTime(tip.commencesAt)}
                        </p>
                      </div>

                      {/* Middle: Tip details */}
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        <div className="text-center">
                          <p className="text-[10px] text-muted-foreground">Selection</p>
                          <p className="text-sm font-bold text-primary">{tip.selection}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-muted-foreground">Odds</p>
                          <p className="text-sm font-bold text-foreground">{tip.odds.toFixed(2)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-muted-foreground">Confidence</p>
                          <p className="text-sm font-bold text-foreground">{(tip.aiConfidence * 100).toFixed(0)}%</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-muted-foreground">Edge</p>
                          <p className="text-sm font-bold text-emerald-400">+{(tip.valueEdge * 100).toFixed(1)}%</p>
                        </div>
                        {tip.userProfit !== null && tip.userProfit !== undefined && (
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground">Your P/L</p>
                            <p className={`text-sm font-bold ${tip.userProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {tip.userProfit >= 0 ? "+" : ""}{symbol}{tip.userProfit.toFixed(2)}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Right: Actions */}
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {/* Won/Lost buttons: only show after match has ended (finished status or AI outcome settled) */}
                        {!tip.userResult && tip.tracked && (tip.outcome || tip.match?.status === "finished") && (
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReportResult(tip.id, "won")}
                              className="h-8 text-xs text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/10"
                            >
                              Won
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReportResult(tip.id, "lost")}
                              className="h-8 text-xs text-red-400 border-red-400/30 hover:bg-red-400/10"
                            >
                              Lost
                            </Button>
                          </div>
                        )}
                        {!tip.userResult && (
                          <Button
                            variant={tip.tracked ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleTrack(tip.id, !tip.tracked)}
                            className={tip.tracked ? "bg-primary text-primary-foreground h-8 text-xs" : "h-8 text-xs"}
                          >
                            {tip.tracked ? (
                              <><CheckCircle2 className="h-3 w-3 mr-1" /> Tracking</>
                            ) : (
                              <><Circle className="h-3 w-3 mr-1" /> I&apos;ll Bet This</>
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopySelection(tip)}
                          className="h-8 text-xs"
                        >
                          {copiedId === tip.id ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* AI Reasoning */}
                    {tip.aiReasoning && (
                      <div className="mt-2 rounded-lg bg-secondary/50 p-2">
                        <p className="text-[10px] text-muted-foreground">
                          <Brain className="h-3 w-3 inline mr-1" />
                          {tip.aiReasoning}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
