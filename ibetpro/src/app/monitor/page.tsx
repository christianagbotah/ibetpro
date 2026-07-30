"use client";

import { useState, useCallback } from "react";
import { useFetch, useSSE, usePolling } from "@/lib/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Eye,
  DollarSign,
  RefreshCw,
  Loader2,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";

interface Bet {
  id: string;
  betType: string;
  selection: string;
  odds: number;
  stake: number;
  potentialWin: number;
  status: string;
  cashoutAmount: number | null;
  isAutoPlaced: boolean;
  aiConfidence: number | null;
  aiReasoning: string | null;
  valueEdge: number | null;
  riskScore: number | null;
  placedAt: string;
  match: {
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
  bettingAccount: {
    platform: string;
  };
}

export default function MonitorPage() {
  const { data: bets, loading, refetch } = useFetch<Bet[]>("/api/bets?status=pending", []);
  const { data: liveBets } = usePolling<Bet[]>("/api/bets?status=pending", 30000, []);
  const [cashingOut, setCashingOut] = useState<string | null>(null);
  const [cashoutResult, setCashoutResult] = useState<{ betId: string; amount: number; success: boolean } | null>(null);

  // Real-time SSE updates
  const { connected: sseConnected } = useSSE({
    match_update: () => refetch(),
    cashout: () => refetch(),
    auto_bet_placed: () => refetch(),
    cashout_opportunity: () => refetch(),
  }, []);

  const activeBets = bets.length > 0 ? bets : liveBets;

  const handleCashout = useCallback(async (betId: string) => {
    setCashingOut(betId);
    setCashoutResult(null);
    try {
      const res = await fetch("/api/cashout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCashoutResult({
          betId,
          amount: data.cashoutDetails?.netCashout || data.cashoutDetails?.grossCashout || 0,
          success: true,
        });
        refetch();
      } else {
        setCashoutResult({
          betId,
          amount: 0,
          success: false,
        });
      }
    } catch {
      setCashoutResult({ betId, amount: 0, success: false });
    } finally {
      setCashingOut(null);
    }
  }, [refetch]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "live":
        return <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />;
      case "upcoming":
        return <Clock className="h-3.5 w-3.5 text-amber-400" />;
      case "finished":
        return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const getMatchStatusBadge = (status: string, homeScore: number | null, awayScore: number | null, minute: number | null) => {
    if (status === "live") {
      return (
        <Badge className="bg-red-500/10 text-red-400 text-[10px]">
          LIVE {minute !== null ? `${minute}'` : ""} {homeScore !== null ? `${homeScore}-${awayScore}` : ""}
        </Badge>
      );
    }
    if (status === "upcoming") {
      return <Badge className="bg-amber-400/10 text-amber-400 text-[10px]">UPCOMING</Badge>;
    }
    return <Badge className="bg-secondary text-muted-foreground text-[10px]">{status.toUpperCase()}</Badge>;
  };

  const getRiskBadge = (riskScore: number | null) => {
    if (riskScore === null) return null;
    if (riskScore >= 70) return <Badge className="bg-red-400/10 text-red-400 text-[10px]">High Risk</Badge>;
    if (riskScore >= 40) return <Badge className="bg-amber-400/10 text-amber-400 text-[10px]">Medium</Badge>;
    return <Badge className="bg-emerald-400/10 text-emerald-400 text-[10px]">Low Risk</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading bets...
        </div>
      </div>
    );
  }

  const liveMatchBets = activeBets.filter(b => b.match.status === "live");
  const upcomingBets = activeBets.filter(b => b.match.status === "upcoming");
  const otherBets = activeBets.filter(b => b.match.status !== "live" && b.match.status !== "upcoming");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Live Monitor</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track your active bets and cashout opportunities in real-time
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {sseConnected ? (
              <Wifi className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-red-400" />
            )}
            {sseConnected ? "Live" : "Offline"}
          </div>
          <Button variant="outline" size="sm" onClick={refetch} className="border-border">
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Active Bets</span>
              <Eye className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-foreground">{activeBets.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Live Matches</span>
              <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            </div>
            <p className="text-2xl font-bold text-foreground">{liveMatchBets.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Total Stake</span>
              <DollarSign className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-foreground">
              ${activeBets.reduce((sum, b) => sum + b.stake, 0).toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Potential Win</span>
              <DollarSign className="h-4 w-4 text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-amber-400">
              ${activeBets.reduce((sum, b) => sum + b.potentialWin, 0).toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cashout Result Toast */}
      {cashoutResult && (
        <div className={`flex items-center gap-2 p-3 rounded-lg border ${
          cashoutResult.success
            ? "bg-emerald-400/10 border-emerald-400/20 text-emerald-400"
            : "bg-red-400/10 border-red-400/20 text-red-400"
        }`}>
          {cashoutResult.success ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          <span className="text-sm">
            {cashoutResult.success
              ? `Cashout successful! $${cashoutResult.amount.toFixed(2)} returned to your balance.`
              : "Cashout failed. The AI may not recommend cashing out at this time. Try force-cashout if needed."}
          </span>
          <button onClick={() => setCashoutResult(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Live Match Bets */}
      {liveMatchBets.length > 0 && (
        <Card className="bg-card border-red-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              Live Bets ({liveMatchBets.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground">Match</TableHead>
                  <TableHead className="text-muted-foreground">Selection</TableHead>
                  <TableHead className="text-muted-foreground">Score</TableHead>
                  <TableHead className="text-muted-foreground">Odds</TableHead>
                  <TableHead className="text-muted-foreground">Stake</TableHead>
                  <TableHead className="text-muted-foreground">Risk</TableHead>
                  <TableHead className="text-muted-foreground">AI</TableHead>
                  <TableHead className="text-muted-foreground">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liveMatchBets.map((bet) => (
                  <TableRow key={bet.id} className="border-border">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(bet.match.status)}
                        <div>
                          <p className="text-sm font-medium text-foreground">{bet.match.homeTeam} vs {bet.match.awayTeam}</p>
                          <p className="text-[10px] text-muted-foreground">{bet.match.league}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <Badge className="bg-primary/10 text-primary text-[10px]">{bet.selection}</Badge>
                        <p className="text-[10px] text-muted-foreground mt-1">{bet.betType.replace("_", " ")}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-bold text-foreground">
                        {bet.match.homeScore ?? 0} - {bet.match.awayScore ?? 0}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{bet.match.minute ?? 0}&apos;</p>
                    </TableCell>
                    <TableCell className="text-sm font-medium text-foreground">{bet.odds}</TableCell>
                    <TableCell className="text-sm text-foreground">${bet.stake.toFixed(2)}</TableCell>
                    <TableCell>{getRiskBadge(bet.riskScore)}</TableCell>
                    <TableCell>
                      {bet.aiConfidence !== null && (
                        <p className="text-[10px] text-muted-foreground">
                          {(bet.aiConfidence * 100).toFixed(0)}%
                          {bet.valueEdge !== null && ` | ${(bet.valueEdge * 100).toFixed(1)}% edge`}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/10 text-xs"
                        onClick={() => handleCashout(bet.id)}
                        disabled={cashingOut === bet.id}
                      >
                        {cashingOut === bet.id ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <DollarSign className="h-3 w-3 mr-1" />
                        )}
                        Cashout
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Bets */}
      {upcomingBets.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-amber-400" />
              Upcoming Bets ({upcomingBets.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground">Match</TableHead>
                  <TableHead className="text-muted-foreground">Selection</TableHead>
                  <TableHead className="text-muted-foreground">Odds</TableHead>
                  <TableHead className="text-muted-foreground">Stake</TableHead>
                  <TableHead className="text-muted-foreground">Risk</TableHead>
                  <TableHead className="text-muted-foreground">AI</TableHead>
                  <TableHead className="text-muted-foreground">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingBets.map((bet) => (
                  <TableRow key={bet.id} className="border-border">
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium text-foreground">{bet.match.homeTeam} vs {bet.match.awayTeam}</p>
                        <p className="text-[10px] text-muted-foreground">{bet.match.league} • {new Date(bet.placedAt).toLocaleDateString()}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-primary/10 text-primary text-[10px]">{bet.selection}</Badge>
                    </TableCell>
                    <TableCell className="text-sm font-medium text-foreground">{bet.odds}</TableCell>
                    <TableCell className="text-sm text-foreground">${bet.stake.toFixed(2)}</TableCell>
                    <TableCell>{getRiskBadge(bet.riskScore)}</TableCell>
                    <TableCell>
                      {bet.aiConfidence !== null && (
                        <p className="text-[10px] text-muted-foreground">
                          {(bet.aiConfidence * 100).toFixed(0)}% conf
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-amber-400/30 text-amber-400 hover:bg-amber-400/10 text-xs"
                        onClick={() => handleCashout(bet.id)}
                        disabled={cashingOut === bet.id}
                      >
                        {cashingOut === bet.id ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <DollarSign className="h-3 w-3 mr-1" />
                        )}
                        Early Cashout
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Other Bets */}
      {otherBets.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Other Pending Bets ({otherBets.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground">Match</TableHead>
                  <TableHead className="text-muted-foreground">Selection</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">Odds</TableHead>
                  <TableHead className="text-muted-foreground">Stake</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {otherBets.map((bet) => (
                  <TableRow key={bet.id} className="border-border">
                    <TableCell>
                      <p className="text-sm font-medium text-foreground">{bet.match.homeTeam} vs {bet.match.awayTeam}</p>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-primary/10 text-primary text-[10px]">{bet.selection}</Badge>
                    </TableCell>
                    <TableCell>
                      {getMatchStatusBadge(bet.match.status, bet.match.homeScore, bet.match.awayScore, bet.match.minute)}
                    </TableCell>
                    <TableCell className="text-sm font-medium text-foreground">{bet.odds}</TableCell>
                    <TableCell className="text-sm text-foreground">${bet.stake.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeBets.length === 0 && (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No active bets to monitor. Place a bet to see it here.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
