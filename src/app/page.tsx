"use client";

import { useFetch } from "@/lib/hooks";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { LiveMatches } from "@/components/dashboard/live-matches";
import { ActiveBets } from "@/components/dashboard/active-bets";
import { ProfitChart } from "@/components/dashboard/profit-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Sparkles } from "lucide-react";

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
  const { data: matches, loading: matchesLoading } = useFetch<Match[]>("/api/matches", []);
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

  const user = { balance: 5000, totalProfit: 2847.5, totalLoss: 1235 };
  const activeBets = bets.filter((b) => b.status === "pending").length;
  const wonBets = bets.filter((b) => b.status === "won").length;
  const totalBets = bets.filter((b) => b.status === "won" || b.status === "lost").length;
  const winRate = totalBets > 0 ? Math.round((wonBets / totalBets) * 100) : 0;

  const recommendations = matches
    .filter((m) => m.status === "upcoming" && m.aiConfidence && m.aiConfidence > 0.6)
    .sort((a, b) => (b.aiConfidence || 0) - (a.aiConfidence || 0))
    .slice(0, 3);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome back, Alex! Here&apos;s your betting overview.
        </p>
      </div>

      <StatsCards
        balance={user.balance}
        profit={user.totalProfit - user.totalLoss}
        activeBets={activeBets}
        winRate={winRate}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LiveMatches matches={matches} />
        <ActiveBets bets={bets} />
      </div>

      <ProfitChart />

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
              <div
                key={match.id}
                className="rounded-lg bg-secondary/50 p-3 border border-primary/10"
              >
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
