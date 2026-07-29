"use client";

import { useState } from "react";
import { useFetch } from "@/lib/hooks";
import { AutoBetConfig } from "@/components/betting/auto-bet-config";
import { BetCard } from "@/components/betting/bet-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

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
      }
    } catch (error) {
      console.error("Cashout failed:", error);
    }
  };

  const handleSaveSettings = (newSettings: UserSettings) => {
    setSettings(newSettings);
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
      <div>
        <h1 className="text-2xl font-bold text-foreground">Automated Betting</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure auto-betting and manage your bets
        </p>
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
