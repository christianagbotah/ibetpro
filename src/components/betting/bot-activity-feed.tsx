"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Zap, Brain, DollarSign, Shield, Target, Clock, TrendingUp, TrendingDown,
  Layers, Ban, CheckCircle, XCircle, AlertTriangle
} from "lucide-react";

interface BotLog {
  id: string;
  action: string;
  matchId: string | null;
  betId: string | null;
  accumulatorId: string | null;
  details: string | null;
  reasoning: string | null;
  confidence: number | null;
  profitImpact: number | null;
  createdAt: string;
}

interface BotActivityFeedProps {
  userId: string;
  compact?: boolean;
}

const actionConfig: Record<string, { icon: typeof Zap; color: string; label: string; bg: string }> = {
  bet_placed: { icon: Zap, color: "text-primary", label: "Bet Placed", bg: "bg-primary/10" },
  bet_skipped: { icon: XCircle, color: "text-muted-foreground", label: "Bet Skipped", bg: "bg-secondary/50" },
  cashout_executed: { icon: DollarSign, color: "text-amber-400", label: "Cashout", bg: "bg-amber-400/10" },
  cashout_skipped: { icon: Clock, color: "text-muted-foreground", label: "Cashout Skipped", bg: "bg-secondary/50" },
  bet_settled: { icon: CheckCircle, color: "text-emerald-400", label: "Settled", bg: "bg-emerald-400/10" },
  accumulator_created: { icon: Layers, color: "text-purple-400", label: "Accumulator", bg: "bg-purple-400/10" },
  stop_loss_hit: { icon: Shield, color: "text-red-400", label: "Stop-Loss", bg: "bg-red-400/10" },
  profit_target_hit: { icon: Target, color: "text-emerald-400", label: "Target Hit", bg: "bg-emerald-400/10" },
  schedule_blocked: { icon: Ban, color: "text-muted-foreground", label: "Scheduled", bg: "bg-secondary/50" },
};

export function BotActivityFeed({ userId, compact = false }: BotActivityFeedProps) {
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Record<string, number>>({});

  useEffect(() => {
    async function fetchLogs() {
      try {
        const res = await fetch(`/api/bot-logs?userId=${userId}&limit=${compact ? 10 : 50}`);
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
          setSummary(data.summary || {});
        }
      } catch {
        // Silently ignore
      } finally {
        setLoading(false);
      }
    }

    fetchLogs();
    const interval = setInterval(fetchLogs, 30000);
    return () => clearInterval(interval);
  }, [userId, compact]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const parseDetails = (details: string | null) => {
    if (!details) return null;
    try {
      return JSON.parse(details);
    } catch {
      return null;
    }
  };

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6 text-center">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Loading bot activity...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-primary" />
            Bot Activity
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {logs.length} events
          </Badge>
        </div>
        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          <div className="rounded-md bg-primary/5 p-2 text-center">
            <p className="text-xs text-muted-foreground">Bets</p>
            <p className="text-sm font-bold text-primary">{summary.betsPlaced || 0}</p>
          </div>
          <div className="rounded-md bg-amber-400/5 p-2 text-center">
            <p className="text-xs text-muted-foreground">Cashouts</p>
            <p className="text-sm font-bold text-amber-400">{summary.cashoutsExecuted || 0}</p>
          </div>
          <div className="rounded-md bg-purple-400/5 p-2 text-center">
            <p className="text-xs text-muted-foreground">Accas</p>
            <p className="text-sm font-bold text-purple-400">{summary.accumulatorsCreated || 0}</p>
          </div>
          <div className="rounded-md bg-secondary/50 p-2 text-center">
            <p className="text-xs text-muted-foreground">Skipped</p>
            <p className="text-sm font-bold text-muted-foreground">{summary.betsSkipped || 0}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className={compact ? "h-48" : "h-96"}>
          <div className="space-y-2">
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No bot activity yet. Enable auto-betting to get started.
              </p>
            ) : (
              logs.map((log) => {
                const config = actionConfig[log.action] || actionConfig.bet_skipped;
                const Icon = config.icon;
                const details = parseDetails(log.details);

                return (
                  <div
                    key={log.id}
                    className={`rounded-lg border border-border p-3 hover:bg-secondary/30 transition-colors ${
                      log.action === "bet_placed" || log.action === "cashout_executed"
                        ? "border-l-2 border-l-primary"
                        : log.action === "stop_loss_hit"
                        ? "border-l-2 border-l-red-400"
                        : log.action === "profit_target_hit"
                        ? "border-l-2 border-l-emerald-400"
                        : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex h-7 w-7 items-center justify-center rounded-full ${config.bg} shrink-0 mt-0.5`}>
                        <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {config.label}
                            </Badge>
                            {log.confidence && (
                              <span className="text-[10px] text-muted-foreground">
                                {Math.round(log.confidence * 100)}% conf
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatTime(log.createdAt)}
                          </span>
                        </div>

                        {/* Reasoning */}
                        {log.reasoning && (
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed truncate">
                            {log.reasoning}
                          </p>
                        )}

                        {/* Profit impact */}
                        {log.profitImpact !== null && log.profitImpact !== 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            {log.profitImpact > 0 ? (
                              <TrendingUp className="h-3 w-3 text-emerald-400" />
                            ) : (
                              <TrendingDown className="h-3 w-3 text-red-400" />
                            )}
                            <span className={`text-xs font-medium ${log.profitImpact > 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {log.profitImpact > 0 ? "+" : ""}${log.profitImpact.toFixed(2)}
                            </span>
                          </div>
                        )}

                        {/* Details */}
                        {details && !compact && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {details.stake && (
                              <span className="text-[10px] bg-secondary/50 rounded px-1.5 py-0.5">
                                Stake: ${details.stake}
                              </span>
                            )}
                            {details.odds && (
                              <span className="text-[10px] bg-secondary/50 rounded px-1.5 py-0.5">
                                Odds: {details.odds}
                              </span>
                            )}
                            {details.selection && (
                              <span className="text-[10px] bg-primary/5 rounded px-1.5 py-0.5 text-primary">
                                {details.selection}
                              </span>
                            )}
                            {details.type && (
                              <span className="text-[10px] bg-secondary/50 rounded px-1.5 py-0.5">
                                {details.type}
                              </span>
                            )}
                            {details.legs && (
                              <span className="text-[10px] bg-purple-400/5 rounded px-1.5 py-0.5 text-purple-400">
                                {details.legs} legs
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
