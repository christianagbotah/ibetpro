"use client";

import { usePolling, useFetch } from "@/lib/hooks";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { LiveMatches } from "@/components/dashboard/live-matches";
import { ActiveBets } from "@/components/dashboard/active-bets";
import { ProfitChart } from "@/components/dashboard/profit-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Sparkles, Zap, Radio, TrendingUp, DollarSign, Activity, ArrowRight } from "lucide-react";
import Link from "next/link";

interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  homeOdds: number;
  awayOdds: number;
  drawOdds: number | null;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  commenceTime: string;
  aiRecommended: string | null;
  aiConfidence: number | null;
}

interface Bet {
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
  profit: number | null;
  placedAt: string;
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
}

export default function DashboardPage() {
  // Use polling for live match updates every 30 seconds
  const { data: matches, loading: matchesLoading } = usePolling<Match[]>("/api/matches", 30000, []);
  const { data: bets, loading: betsLoading } = useFetch<Bet[]>("/api/bets?userId=demo-user", []);

  const loading = matchesLoading || betsLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading dashboard...
        </div>
      </div>
    );
  }

  const user = { balance: 5000, totalProfit: 2847.5, totalLoss: 1235, commissionPaid: 284.75 };
  const activeBets = bets.filter((b) => b.status === "pending").length;
  const wonBets = bets.filter((b) => b.status === "won").length;
  const totalBets = bets.filter((b) => b.status === "won" || b.status === "lost").length;
  const winRate = totalBets > 0 ? Math.round((wonBets / totalBets) * 100) : 0;

  const recommendations = matches
    .filter((m) => m.status === "upcoming" && m.aiConfidence && m.aiConfidence > 0.6)
    .sort((a, b) => (b.aiConfidence || 0) - (a.aiConfidence || 0))
    .slice(0, 3);

  // Live matches count
  const liveMatches = matches.filter((m) => m.status === "live");

  // Recent activity feed
  const recentSettled = bets
    .filter((b) => b.status === "won" || b.status === "lost" || b.status === "cashed_out")
    .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime())
    .slice(0, 5);

  // Commission summary
  const totalCommission = bets
    .filter((b) => b.status === "won")
    .reduce((sum, b) => sum + (b.profit || 0) * 0.10, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back, Alex! Here&apos;s your betting overview.
          </p>
        </div>
        {liveMatches.length > 0 && (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 px-3 py-1.5">
            <span className="relative flex h-2 w-2 mr-2">
              <span className="animate-live-pulse absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            {liveMatches.length} Live
          </Badge>
        )}
      </div>

      <StatsCards
        balance={user.balance}
        profit={user.totalProfit - user.totalLoss}
        activeBets={activeBets}
        winRate={winRate}
      />

      {/* Quick Actions */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-amber-400" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link href="/analysis" className="block">
              <div className="rounded-lg bg-primary/5 border border-primary/10 p-4 hover:bg-primary/10 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Brain className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">AI Analysis</p>
                    <p className="text-xs text-muted-foreground">Run predictions on upcoming matches</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-primary" />
                </div>
              </div>
            </Link>
            <Link href="/betting" className="block">
              <div className="rounded-lg bg-amber-400/5 border border-amber-400/10 p-4 hover:bg-amber-400/10 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-400/10">
                    <Zap className="h-5 w-5 text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Place Bets</p>
                    <p className="text-xs text-muted-foreground">Automated & manual betting</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-amber-400" />
                </div>
              </div>
            </Link>
            <Link href="/monitor" className="block">
              <div className="rounded-lg bg-red-500/5 border border-red-500/10 p-4 hover:bg-red-500/10 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
                    <Radio className="h-5 w-5 text-red-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Live Monitor</p>
                    <p className="text-xs text-muted-foreground">Track live matches & cashouts</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-red-500" />
                </div>
              </div>
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LiveMatches matches={matches} />
        <ActiveBets bets={bets} />
      </div>

      <ProfitChart />

      {/* Recent Activity & Commission Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity Feed */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-64 overflow-y-auto">
            {recentSettled.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No recent activity
              </p>
            ) : (
              recentSettled.map((bet) => (
                <div
                  key={bet.id}
                  className="flex items-center justify-between rounded-lg bg-secondary/50 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      bet.status === "won" ? "bg-emerald-400/10" : "bg-red-400/10"
                    }`}>
                      {bet.status === "won" ? (
                        <TrendingUp className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <TrendingUp className="h-4 w-4 text-red-400 rotate-180" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {bet.match?.homeTeam} vs {bet.match?.awayTeam}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {bet.selection} @ {bet.odds}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${
                      bet.status === "won" ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {bet.status === "won" ? "+" : "-"}${Math.abs(bet.profit || bet.stake).toFixed(2)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(bet.placedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Commission Summary */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-4 w-4 text-amber-400" />
              Commission Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-secondary/50 p-4">
                <p className="text-xs text-muted-foreground">Total Commission Paid</p>
                <p className="text-xl font-bold text-amber-400 mt-1">
                  ${user.commissionPaid.toFixed(2)}
                </p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-4">
                <p className="text-xs text-muted-foreground">Commission Rate</p>
                <p className="text-xl font-bold text-foreground mt-1">10%</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-4">
                <p className="text-xs text-muted-foreground">Commission This Session</p>
                <p className="text-xl font-bold text-amber-400 mt-1">
                  ${totalCommission.toFixed(2)}
                </p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-4">
                <p className="text-xs text-muted-foreground">Net After Commission</p>
                <p className="text-xl font-bold text-emerald-400 mt-1">
                  ${(user.totalProfit - user.totalLoss - user.commissionPaid).toFixed(2)}
                </p>
              </div>
            </div>
            <div className="rounded-lg bg-amber-400/5 border border-amber-400/10 p-3">
              <p className="text-xs text-muted-foreground">
                10% commission is deducted from winning bet profits. This fee covers platform maintenance and AI model improvements.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-amber-400" />
            AI Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {recommendations.map((match) => (
              <Link key={match.id} href={`/matches/${match.id}`} className="block">
                <div className="rounded-lg bg-secondary/50 p-3 border border-primary/10 hover:bg-secondary transition-colors cursor-pointer">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {match.sport}
                    </Badge>
                    <div className="flex items-center gap-1">
                      <Brain className="h-3 w-3 text-primary" />
                      <span className="text-xs font-bold text-primary">
                        {Math.round((match.aiConfidence || 0) * 100)}%
                      </span>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {match.homeTeam} vs {match.awayTeam}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    AI recommends: <span className="text-primary font-medium">{match.aiRecommended === "home" ? match.homeTeam : match.aiRecommended === "away" ? match.awayTeam : match.aiRecommended}</span>
                  </p>
                </div>
              </Link>
            ))}
            {recommendations.length === 0 && (
              <p className="text-sm text-muted-foreground col-span-3 text-center py-4">
                No AI recommendations available
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
