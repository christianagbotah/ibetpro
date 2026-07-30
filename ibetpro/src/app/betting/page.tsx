"use client";

import { useState, useCallback } from "react";
import { useFetch } from "@/lib/hooks";
import { useToast } from "@/components/ui/toast";
import { AutoBetConfig } from "@/components/betting/auto-bet-config";
import { BetCard } from "@/components/betting/bet-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, Brain, Shield } from "lucide-react";

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
  cashoutAmount: number | null;
  placedAt: string;
  bettingAccountId: string;
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
  bettingAccount?: {
    platform: string;
  };
}

interface UserSettings {
  autoBettingEnabled: boolean;
  maxBetAmount: number;
  minOddsThreshold: number;
  maxOddsThreshold: number;
  riskLevel: string;
  autoCashoutEnabled: boolean;
  cashoutThreshold: number;
  commissionRate: number;
  dailyBetLimit: number;
  preferredSports: string;
}

const defaultSettings: UserSettings = {
  autoBettingEnabled: true,
  maxBetAmount: 200,
  minOddsThreshold: 1.5,
  maxOddsThreshold: 5.0,
  riskLevel: "medium",
  autoCashoutEnabled: true,
  cashoutThreshold: 0.7,
  commissionRate: 0.10,
  dailyBetLimit: 500,
  preferredSports: "football,basketball,tennis",
};

export default function BettingPage() {
  const { addToast } = useToast();
  const { data: bets, loading, refetch: refetchBets } = useFetch<Bet[]>("/api/bets?userId=demo-user", []);
  const { data: accounts } = useFetch<Array<{ id: string; platform: string }>>("/api/accounts?userId=demo-user", []);
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [betFilter, setBetFilter] = useState<string>("all");

  const handleCashout = async (betId: string) => {
    try {
      const res = await fetch("/api/ai/cashout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betId }),
      });
      if (res.ok) {
        refetchBets();
        addToast("success", "Cashout processed successfully!");
      }
    } catch (error) {
      console.error("Cashout failed:", error);
      addToast("error", "Cashout failed");
    }
  };

  const handleOneClickBet = useCallback(async (bet: Bet) => {
    try {
      addToast("info", `Placing AI bet on ${bet.selection}...`);
      // Simulate one-click bet (re-place same bet)
      const res = await fetch("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: bet.match?.id,
          betType: bet.betType,
          selection: bet.selection,
          odds: bet.odds,
          stake: 50,
          isAutoPlaced: true,
          aiConfidence: bet.aiConfidence,
        }),
      });
      if (res.ok) {
        addToast("success", `Bet placed on ${bet.selection} @ ${bet.odds}`);
        refetchBets();
      } else {
        addToast("error", "Failed to place bet");
      }
    } catch {
      addToast("error", "Failed to place bet");
    }
  }, [addToast, refetchBets]);

  const handleSaveSettings = (newSettings: UserSettings) => {
    setSettings(newSettings);
    addToast("success", "Settings saved successfully!");
  };

  // Merge betting account info
  const enrichedBets = bets.map((bet) => {
    const account = accounts.find((a) => a.id === bet.bettingAccountId);
    return {
      ...bet,
      bettingAccount: account ? { platform: account.platform } : undefined,
    };
  });

  const filteredBets =
    betFilter === "all"
      ? enrichedBets
      : betFilter === "auto"
      ? enrichedBets.filter((b) => b.isAutoPlaced)
      : betFilter === "manual"
      ? enrichedBets.filter((b) => !b.isAutoPlaced)
      : enrichedBets.filter((b) => b.status === betFilter);

  const autoBets = enrichedBets.filter((b) => b.isAutoPlaced);
  const totalStake = enrichedBets.reduce((sum, b) => sum + b.stake, 0);
  const totalProfit = enrichedBets.reduce((sum, b) => sum + (b.profit || 0), 0);

  // AI recommended bets (pending bets with high AI confidence)
  const aiRecommendedBets = enrichedBets
    .filter((b) => b.status === "pending" && b.aiConfidence && b.aiConfidence > 0.5)
    .sort((a, b) => (b.aiConfidence || 0) - (a.aiConfidence || 0));

  // Daily bet limit progress
  const todayBets = enrichedBets.filter((b) => {
    const today = new Date();
    const placedAt = new Date(b.placedAt);
    return placedAt.toDateString() === today.toDateString();
  });
  const dailyStake = todayBets.reduce((sum, b) => sum + b.stake, 0);
  const dailyLimitProgress = Math.min((dailyStake / settings.dailyBetLimit) * 100, 100);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Automated Betting</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure auto-betting and manage your bets
          </p>
        </div>
        {/* Bot Status Indicator */}
        <div className="flex items-center gap-2">
          <Badge className={`px-3 py-1.5 ${
            settings.autoBettingEnabled
              ? "bg-primary/10 text-primary border-primary/20"
              : "bg-secondary text-muted-foreground border-border"
          }`}>
            <span className="relative flex h-2 w-2 mr-2">
              {settings.autoBettingEnabled && (
                <>
                  <span className="animate-live-pulse absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </>
              )}
              {!settings.autoBettingEnabled && (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-muted-foreground" />
              )}
            </span>
            Bot {settings.autoBettingEnabled ? "Active" : "Inactive"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total Bets</p>
            <p className="text-lg font-bold text-foreground">{enrichedBets.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">AI-Placed</p>
            <p className="text-lg font-bold text-primary">{autoBets.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total Stake</p>
            <p className="text-lg font-bold text-foreground">${totalStake.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Net Profit</p>
            <p className={`text-lg font-bold ${totalProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {totalProfit >= 0 ? "+" : ""}${totalProfit.toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Bet Limit Progress Bar */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-medium text-foreground">Daily Bet Limit</span>
            </div>
            <span className="text-sm text-muted-foreground">
              ${dailyStake.toFixed(0)} / ${settings.dailyBetLimit.toFixed(0)}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                dailyLimitProgress >= 90 ? "bg-red-500" : dailyLimitProgress >= 70 ? "bg-amber-400" : "bg-primary"
              }`}
              style={{ width: `${dailyLimitProgress}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">
              {dailyLimitProgress >= 90 ? "Limit almost reached!" : `${Math.round(dailyLimitProgress)}% of daily limit used`}
            </span>
            <span className="text-[10px] text-muted-foreground">
              ${Math.max(0, settings.dailyBetLimit - dailyStake).toFixed(0)} remaining
            </span>
          </div>
        </CardContent>
      </Card>

      {/* AI Recommended Bets */}
      {aiRecommendedBets.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-4 w-4 text-primary" />
              AI Recommended Bets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {aiRecommendedBets.slice(0, 6).map((bet) => (
                <div
                  key={bet.id}
                  className="rounded-lg bg-primary/5 border border-primary/10 p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Brain className="h-3 w-3 text-primary" />
                      <span className="text-xs font-medium text-foreground">
                        {bet.match?.homeTeam} vs {bet.match?.awayTeam}
                      </span>
                    </div>
                    {/* AI Confidence Meter */}
                    <div className="flex items-center gap-1">
                      <div className="w-12 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            (bet.aiConfidence || 0) >= 0.7 ? "bg-primary" : (bet.aiConfidence || 0) >= 0.5 ? "bg-amber-400" : "bg-red-400"
                          }`}
                          style={{ width: `${(bet.aiConfidence || 0) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-primary">
                        {Math.round((bet.aiConfidence || 0) * 100)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-muted-foreground">
                      {bet.selection} @ {bet.odds}
                    </span>
                    <span className="text-foreground">${bet.stake.toFixed(0)} stake</span>
                  </div>
                  {/* Commission info */}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-2">
                    <span>Commission: {(settings.commissionRate * 100).toFixed(0)}%</span>
                    <span>
                      Projected: ${(bet.potentialWin * settings.commissionRate).toFixed(2)}
                    </span>
                  </div>
                  <Button
                    size="xs"
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/80"
                    onClick={() => handleOneClickBet(bet)}
                  >
                    <Zap className="h-3 w-3" />
                    One-Click Bet
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Your Bets</h2>
            <div className="flex items-center gap-2">
              {["all", "pending", "won", "lost", "auto"].map((filter) => (
                <Button
                  key={filter}
                  size="xs"
                  variant={betFilter === filter ? "default" : "ghost"}
                  onClick={() => setBetFilter(filter)}
                  className={betFilter === filter ? "bg-primary text-primary-foreground" : ""}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto">
            {filteredBets.length === 0 ? (
              <Card className="bg-card border-border">
                <CardContent className="p-8 text-center">
                  <Zap className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No bets found for this filter.
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredBets.map((bet) => (
                <BetCard key={bet.id} bet={bet} onCashout={handleCashout} />
              ))
            )}
          </div>
        </div>

        <div>
          <AutoBetConfig settings={settings} onSave={handleSaveSettings} />
        </div>
      </div>
    </div>
  );
}
