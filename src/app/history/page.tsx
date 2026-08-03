"use client";

import { useState, useMemo, useCallback } from "react";
import { useFetch } from "@/lib/hooks";
import { useToast } from "@/components/ui/toast";
import { getSportShortName, getSportName } from "@/lib/sports";
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
  History,
  Filter,
  SortAsc,
  Download,
  XCircle,
  DollarSign,
  Clock,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Brain,
} from "lucide-react";

interface Bet {
  id: string;
  betType: string;
  selection: string;
  odds: number;
  stake: number;
  potentialWin: number;
  status: string;
  profit: number | null;
  isAutoPlaced: boolean;
  aiConfidence: number | null;
  aiReasoning: string | null;
  placedAt: string;
  settledAt: string | null;
  cashedOutAt: string | null;
  match?: {
    homeTeam: string;
    awayTeam: string;
    sport: string;
    league: string;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
    minute: number | null;
  };
  bettingAccount?: {
    platform: string;
  };
}

export default function HistoryPage() {
  const { addToast } = useToast();
  const { data: bets, loading } = useFetch<Bet[]>("/api/bets", []);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("date");
  const [dateRange, setDateRange] = useState<string>("all");

  const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
    pending: { icon: Clock, color: "text-amber-400", label: "Pending" },
    won: { icon: CheckCircle, color: "text-emerald-400", label: "Won" },
    lost: { icon: XCircle, color: "text-red-400", label: "Lost" },
    cashed_out: { icon: DollarSign, color: "text-blue-400", label: "Cashed Out" },
  };

  const filteredBets = useMemo(() => {
    let result = bets.filter((b) => b.status !== "pending"); // Only show settled bets in history

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((b) => b.status === statusFilter);
    }

    // Sport filter
    if (sportFilter !== "all") {
      result = result.filter((b) => b.match?.sport === sportFilter);
    }

    // Date range filter
    if (dateRange !== "all") {
      const now = new Date();
      const cutoff = new Date();
      switch (dateRange) {
        case "today":
          cutoff.setDate(now.getDate() - 1);
          break;
        case "week":
          cutoff.setDate(now.getDate() - 7);
          break;
        case "month":
          cutoff.setMonth(now.getMonth() - 1);
          break;
      }
      result = result.filter((b) => new Date(b.placedAt) >= cutoff);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case "date":
          return new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime();
        case "profit":
          return (b.profit || 0) - (a.profit || 0);
        case "odds":
          return b.odds - a.odds;
        case "stake":
          return b.stake - a.stake;
        default:
          return 0;
      }
    });

    return result;
  }, [bets, statusFilter, sportFilter, dateRange, sortBy]);

  // Summary stats
  const summaryStats = useMemo(() => {
    const settled = bets.filter((b) => b.status !== "pending");
    const won = settled.filter((b) => b.status === "won");
    const lost = settled.filter((b) => b.status === "lost");
    const cashedOut = settled.filter((b) => b.status === "cashed_out");
    const totalProfit = won.reduce((sum, b) => sum + (b.profit || 0), 0);
    const totalLoss = lost.reduce((sum, b) => sum + b.stake, 0);
    const avgOdds = settled.length > 0
      ? settled.reduce((sum, b) => sum + b.odds, 0) / settled.length
      : 0;

    return {
      total: settled.length,
      won: won.length,
      lost: lost.length,
      cashedOut: cashedOut.length,
      winRate: settled.length > 0 ? Math.round((won.length / settled.length) * 100) : 0,
      totalProfit,
      totalLoss,
      netProfit: totalProfit - totalLoss,
      avgOdds: Math.round(avgOdds * 100) / 100,
    };
  }, [bets]);

  const sports = [...new Set(bets.map((b) => b.match?.sport).filter(Boolean))];

  const handleExportCSV = useCallback(() => {
    const headers = ["Date", "Match", "Selection", "Odds", "Stake", "Status", "Profit", "Sport", "League", "AI Placed"];
    const rows = filteredBets.map((bet) => [
      new Date(bet.placedAt).toLocaleDateString(),
      `${bet.match?.homeTeam} vs ${bet.match?.awayTeam}`,
      bet.selection,
      bet.odds.toString(),
      bet.stake.toFixed(2),
      bet.status,
      (bet.profit || 0).toFixed(2),
      bet.match?.sport || "",
      bet.match?.league || "",
      bet.isAutoPlaced ? "Yes" : "No",
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ibetpro_history_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    addToast("success", "CSV exported successfully!");
  }, [filteredBets, addToast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading history...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Bet History</h1>
        <p className="text-sm text-muted-foreground mt-1">
          View and analyze your past betting performance
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total Bets</p>
            <p className="text-lg font-bold text-foreground">{summaryStats.total}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Won</p>
            <p className="text-lg font-bold text-emerald-400">{summaryStats.won}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Lost</p>
            <p className="text-lg font-bold text-red-400">{summaryStats.lost}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Win Rate</p>
            <p className="text-lg font-bold text-primary">{summaryStats.winRate}%</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Net Profit</p>
            <p className={`text-lg font-bold ${summaryStats.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {summaryStats.netProfit >= 0 ? "+" : ""}${summaryStats.netProfit.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Avg Odds</p>
            <p className="text-lg font-bold text-foreground">{summaryStats.avgOdds}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={(v) => { if (v) setStatusFilter(v); }}>
                <SelectTrigger className="w-28 sm:w-32 bg-secondary border-border">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="won">Won</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                  <SelectItem value="cashed_out">Cashed Out</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Select value={sportFilter} onValueChange={(v) => { if (v) setSportFilter(v); }}>
              <SelectTrigger className="w-28 sm:w-32 bg-secondary border-border">
                <SelectValue placeholder="Sport" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sports</SelectItem>
                {sports.map((sport) => (
                  <SelectItem key={sport} value={sport!}>
                    {getSportName(sport!)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={dateRange} onValueChange={(v) => { if (v) setDateRange(v); }}>
              <SelectTrigger className="w-32 bg-secondary border-border">
                <SelectValue placeholder="Date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <SortAsc className="h-4 w-4 text-muted-foreground" />
              <Select value={sortBy} onValueChange={(v) => { if (v) setSortBy(v); }}>
                <SelectTrigger className="w-28 sm:w-36 bg-secondary border-border">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date (Newest)</SelectItem>
                  <SelectItem value="profit">Profit</SelectItem>
                  <SelectItem value="odds">Odds</SelectItem>
                  <SelectItem value="stake">Stake</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1" />

            <Button
              variant="outline"
              size="sm"
              className="border-primary/30 text-primary hover:bg-primary/10"
              onClick={handleExportCSV}
            >
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bet List */}
      <div className="space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto">
        {filteredBets.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="p-8 text-center">
              <History className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No settled bets found for the selected filters.
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredBets.map((bet) => {
            const config = statusConfig[bet.status] || statusConfig.pending;
            const StatusIcon = config.icon;

            return (
              <Card key={bet.id} className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Match Info */}
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="text-[10px]">
                          {getSportShortName(bet.match?.sport || "")}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{bet.match?.league || getSportName(bet.match?.sport || "")}</span>
                        {bet.isAutoPlaced && (
                          <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                            <Brain className="h-3 w-3 mr-0.5" />
                            AI
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium text-foreground">
                        {bet.match?.homeTeam} vs {bet.match?.awayTeam}
                      </p>

                      {/* Bet Details */}
                      <div className="mt-2 flex items-center gap-4 text-xs">
                        <div>
                          <span className="text-muted-foreground">Selection: </span>
                          <span className="text-foreground font-medium">{bet.selection}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Odds: </span>
                          <span className="text-primary font-medium">{bet.odds}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Stake: </span>
                          <span className="text-foreground">${bet.stake.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* AI Reasoning */}
                      {bet.aiReasoning && (
                        <div className="mt-2 rounded bg-secondary/50 p-2">
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            {bet.aiReasoning}
                          </p>
                        </div>
                      )}

                      {/* Date */}
                      <p className="text-[10px] text-muted-foreground mt-2">
                        Placed: {new Date(bet.placedAt).toLocaleString()}
                        {bet.settledAt && ` | Settled: ${new Date(bet.settledAt).toLocaleString()}`}
                        {bet.cashedOutAt && ` | Cashed out: ${new Date(bet.cashedOutAt).toLocaleString()}`}
                      </p>
                    </div>

                    {/* Status & Profit */}
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-1.5">
                        <StatusIcon className={`h-4 w-4 ${config.color}`} />
                        <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                      </div>

                      {bet.status === "won" && bet.profit !== null && (
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-4 w-4 text-emerald-400" />
                          <span className="text-lg font-bold text-emerald-400">
                            +${bet.profit.toFixed(2)}
                          </span>
                        </div>
                      )}
                      {bet.status === "lost" && (
                        <div className="flex items-center gap-1">
                          <TrendingDown className="h-4 w-4 text-red-400" />
                          <span className="text-lg font-bold text-red-400">
                            -${bet.stake.toFixed(2)}
                          </span>
                        </div>
                      )}
                      {bet.status === "cashed_out" && (
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-4 w-4 text-blue-400" />
                          <span className="text-sm font-bold text-blue-400">
                            Cashed Out
                          </span>
                        </div>
                      )}

                      {/* Platform */}
                      <span className="text-[10px] text-muted-foreground">
                        {bet.bettingAccount?.platform || "N/A"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
