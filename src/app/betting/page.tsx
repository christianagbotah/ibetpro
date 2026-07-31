"use client";

import { useState, useCallback, useEffect } from "react";
import { useFetch } from "@/lib/hooks";
import { useToast } from "@/components/ui/toast";
import { AutoBetConfig } from "@/components/betting/auto-bet-config";
import { BotActivityFeed } from "@/components/betting/bot-activity-feed";
import { BetCard } from "@/components/betting/bet-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, Brain, Shield, DollarSign, Clock, TrendingUp, Play, Square, RefreshCw, Layers, Target } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";

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
  partialCashoutAmount: number | null;
  accumulatorId: string | null;
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
  accumulator?: {
    id: string;
    totalOdds: number;
    totalLegs: number;
    completedLegs: number;
    status: string;
    bonusPercent: number | null;
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
  betTypes: string;
  maxAccumulatorLegs: number;
  minAiConfidence: number;
  stopLossDaily: number;
  stopLossWeekly: number;
  profitTargetDaily: number;
  profitTargetWeekly: number;
  betScheduleStart: string;
  betScheduleEnd: string;
  partialCashoutEnabled: boolean;
  partialCashoutPercent: number;
  waitFullSettlement: boolean;
  kellyFraction: number;
  minEdgeThreshold: number;
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
  betTypes: "single,accumulator",
  maxAccumulatorLegs: 5,
  minAiConfidence: 0.6,
  stopLossDaily: 200,
  stopLossWeekly: 500,
  profitTargetDaily: 300,
  profitTargetWeekly: 1000,
  betScheduleStart: "08:00",
  betScheduleEnd: "22:00",
  partialCashoutEnabled: true,
  partialCashoutPercent: 0.5,
  waitFullSettlement: true,
  kellyFraction: 0.25,
  minEdgeThreshold: 0.03,
};

export default function BettingPage() {
  const { addToast } = useToast();
  const { user } = useAuth();
  const { data: bets, loading, refetch: refetchBets } = useFetch<Bet[]>("/api/bets", []);
  const { data: accounts } = useFetch<Array<{ id: string; platform: string }>>("/api/accounts", []);
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [betFilter, setBetFilter] = useState<string>("all");
  const [botRunning, setBotRunning] = useState(false);
  const [settleLoading, setSettleLoading] = useState(false);

  // Load user settings
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          if (data) {
            setSettings({
              ...defaultSettings,
              ...data,
            });
          }
        }
      } catch {
        // Use defaults
      }
    }
    loadSettings();
  }, []);

  const handleCashout = async (betId: string, type: "full" | "partial" = "full") => {
    try {
      const res = await fetch("/api/cashout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betId, cashoutType: type }),
      });
      if (res.ok) {
        const result = await res.json();
        refetchBets();
        addToast("success", `${type === "partial" ? "Partial" : "Full"} cashout processed: $${result.amount?.toFixed(2)}`);
      } else {
        const data = await res.json();
        addToast("error", data.error || "Cashout failed");
      }
    } catch (error) {
      console.error("Cashout failed:", error);
      addToast("error", "Cashout failed");
    }
  };

  const handleRunBot = async () => {
    if (!user?.id) {
      addToast("error", "Please log in to run the bot");
      return;
    }

    setBotRunning(true);
    try {
      const res = await fetch("/api/auto-bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.betsPlaced > 0) {
          addToast("success", `Bot placed ${result.betsPlaced} bet(s)`);
        } else {
          addToast("info", result.error || result.message || "No suitable matches found for betting");
        }
        refetchBets();
      } else {
        const data = await res.json();
        addToast("error", data.error || "Bot failed");
      }
    } catch {
      addToast("error", "Bot execution failed");
    } finally {
      setBotRunning(false);
    }
  };

  const handleSettle = async () => {
    if (!user?.id) return;
    setSettleLoading(true);
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
      setSettleLoading(false);
    }
  };

  const handleSaveSettings = async (newSettings: UserSettings) => {
    setSettings(newSettings);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings),
      });
      addToast("success", "Settings saved successfully!");
    } catch {
      addToast("error", "Failed to save settings");
    }
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
      : betFilter === "accumulator"
      ? enrichedBets.filter((b) => b.accumulatorId)
      : enrichedBets.filter((b) => b.status === betFilter);

  const autoBets = enrichedBets.filter((b) => b.isAutoPlaced);
  const accumulatorBets = enrichedBets.filter((b) => b.accumulatorId);
  const totalStake = enrichedBets.reduce((sum, b) => sum + b.stake, 0);
  const totalProfit = enrichedBets.reduce((sum, b) => sum + (b.profit || 0), 0);

  // AI recommended bets
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
      {/* Auto-Betting Disabled Banner */}
      {!settings.autoBettingEnabled && (
        <div className="rounded-xl border-2 border-amber-400/30 bg-amber-400/5 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400/10">
                <Zap className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-amber-400">AI Auto-Betting is Disabled</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Toggle the switch to enable the AI bot, then click "Run Bot" to start placing bets automatically.
                  You can also configure advanced settings in the Auto-Betting Configuration panel below.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground">Enable</span>
              <Switch
                checked={settings.autoBettingEnabled}
                onCheckedChange={async (checked) => {
                  const updated = { ...settings, autoBettingEnabled: checked as boolean };
                  setSettings(updated);
                  try {
                    await fetch("/api/settings", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ autoBettingEnabled: checked }),
                    });
                    addToast("success", checked ? "Auto-betting enabled! You can now run the bot." : "Auto-betting disabled");
                  } catch {
                    addToast("error", "Failed to update setting");
                    setSettings(settings); // revert
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Automated Betting</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure auto-betting and manage your bets
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Bot Status Indicator */}
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

          {/* Run Bot Button */}
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/80"
            onClick={handleRunBot}
            disabled={botRunning || !settings.autoBettingEnabled}
          >
            {botRunning ? (
              <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {botRunning ? "Running..." : "Run Bot"}
          </Button>

          {/* Settle Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleSettle}
            disabled={settleLoading}
            className="border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/10"
          >
            {settleLoading ? (
              <div className="h-4 w-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Settle
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
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
            <p className="text-xs text-muted-foreground">Accumulators</p>
            <p className="text-lg font-bold text-purple-400">{accumulatorBets.length}</p>
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

      {/* Risk Limits Display */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg bg-red-400/5 border border-red-400/10 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Shield className="h-3 w-3 text-red-400" />
            <span className="text-xs text-muted-foreground">Daily Stop-Loss</span>
          </div>
          <p className="text-sm font-bold text-red-400">-${settings.stopLossDaily}</p>
        </div>
        <div className="rounded-lg bg-red-400/5 border border-red-400/10 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Shield className="h-3 w-3 text-red-400" />
            <span className="text-xs text-muted-foreground">Weekly Stop-Loss</span>
          </div>
          <p className="text-sm font-bold text-red-400">-${settings.stopLossWeekly}</p>
        </div>
        <div className="rounded-lg bg-emerald-400/5 border border-emerald-400/10 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Target className="h-3 w-3 text-emerald-400" />
            <span className="text-xs text-muted-foreground">Daily Target</span>
          </div>
          <p className="text-sm font-bold text-emerald-400">+${settings.profitTargetDaily}</p>
        </div>
        <div className="rounded-lg bg-emerald-400/5 border border-emerald-400/10 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Target className="h-3 w-3 text-emerald-400" />
            <span className="text-xs text-muted-foreground">Weekly Target</span>
          </div>
          <p className="text-sm font-bold text-emerald-400">+${settings.profitTargetWeekly}</p>
        </div>
      </div>

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
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-2">
                    <span>Commission: {(settings.commissionRate * 100).toFixed(0)}%</span>
                    <span>Projected: ${(bet.potentialWin * (1 - settings.commissionRate)).toFixed(2)}</span>
                  </div>
                  {/* Cashout buttons */}
                  <div className="flex gap-2">
                    {bet.cashoutAmount && (
                      <button
                        onClick={() => handleCashout(bet.id, "partial")}
                        className="flex-1 text-[10px] bg-primary/10 text-primary border border-primary/20 rounded px-2 py-1 hover:bg-primary/20 transition-colors"
                      >
                        <DollarSign className="h-3 w-3 inline" />
                        Partial ${((bet.cashoutAmount || 0) * settings.partialCashoutPercent).toFixed(2)}
                      </button>
                    )}
                    {bet.cashoutAmount && (
                      <button
                        onClick={() => handleCashout(bet.id, "full")}
                        className="flex-1 text-[10px] bg-amber-400/10 text-amber-400 border border-amber-400/20 rounded px-2 py-1 hover:bg-amber-400/20 transition-colors"
                      >
                        <DollarSign className="h-3 w-3 inline" />
                        Full ${bet.cashoutAmount.toFixed(2)}
                      </button>
                    )}
                  </div>
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
              {["all", "pending", "won", "lost", "auto", "accumulator"].map((filter) => (
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
                <EnhancedBetCard
                  key={bet.id}
                  bet={bet}
                  onCashout={handleCashout}
                  settings={settings}
                />
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <AutoBetConfig settings={settings} onSave={handleSaveSettings} />
          {user?.id && <BotActivityFeed userId={user.id} compact />}
        </div>
      </div>
    </div>
  );
}

// Enhanced Bet Card with accumulator support and partial cashout
function EnhancedBetCard({
  bet,
  onCashout,
  settings,
}: {
  bet: Bet;
  onCashout: (betId: string, type: "full" | "partial") => void;
  settings: UserSettings;
}) {
  const statusConfig: Record<string, { icon: typeof Zap; color: string; label: string }> = {
    pending: { icon: Clock, color: "text-amber-400", label: "Pending" },
    won: { icon: TrendingUp, color: "text-emerald-400", label: "Won" },
    lost: { icon: Zap, color: "text-red-400", label: "Lost" },
    cashed_out: { icon: DollarSign, color: "text-blue-400", label: "Cashed Out" },
    partial_cashout: { icon: DollarSign, color: "text-amber-400", label: "Partial Cashout" },
  };

  const config = statusConfig[bet.status] || statusConfig.pending;
  const StatusIcon = config.icon;
  const isAccumulatorLeg = !!bet.accumulatorId;

  return (
    <Card className={`bg-card border-border ${isAccumulatorLeg ? "border-l-2 border-l-purple-400" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Match Info */}
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-[10px]">
                {bet.match?.sport}
              </Badge>
              <span className="text-xs text-muted-foreground">{bet.match?.league}</span>
              {bet.isAutoPlaced && (
                <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                  <Brain className="h-3 w-3 mr-0.5" />
                  AI
                </Badge>
              )}
              {isAccumulatorLeg && (
                <Badge className="text-[10px] bg-purple-400/10 text-purple-400 border-purple-400/20">
                  <Layers className="h-3 w-3 mr-0.5" />
                  Acca
                </Badge>
              )}
              {bet.status === "partial_cashout" && (
                <Badge className="text-[10px] bg-amber-400/10 text-amber-400 border-amber-400/20">
                  Partial
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium text-foreground">
              {bet.match?.homeTeam} vs {bet.match?.awayTeam}
            </p>

            {/* Live Score */}
            {bet.match?.status === "live" && bet.match.homeScore !== null && (
              <div className="flex items-center gap-2 mt-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-live-pulse absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
                <span className="text-sm font-bold text-foreground">
                  {bet.match.homeScore} - {bet.match.awayScore}
                </span>
                <span className="text-xs text-muted-foreground">{bet.match.minute}&apos;</span>
              </div>
            )}

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
          </div>

          {/* Status & Profit */}
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-1.5">
              <StatusIcon className={`h-4 w-4 ${config.color}`} />
              <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
            </div>

            {bet.status === "won" && bet.profit !== null && (
              <span className="text-lg font-bold text-emerald-400">
                +${bet.profit.toFixed(2)}
              </span>
            )}
            {bet.status === "lost" && (
              <span className="text-lg font-bold text-red-400">
                -${bet.stake.toFixed(2)}
              </span>
            )}
            {bet.status === "pending" && (
              <span className="text-sm text-muted-foreground">
                Potential: ${bet.potentialWin.toFixed(2)}
              </span>
            )}
            {bet.status === "cashed_out" && bet.cashoutAmount && (
              <span className="text-sm font-bold text-blue-400">
                Cashed: ${bet.cashoutAmount.toFixed(2)}
              </span>
            )}
            {bet.status === "partial_cashout" && bet.partialCashoutAmount && (
              <span className="text-xs text-amber-400">
                Partial: ${bet.partialCashoutAmount.toFixed(2)}
              </span>
            )}

            {/* Cashout buttons */}
            {bet.status === "pending" && bet.cashoutAmount && (
              <div className="flex flex-col gap-1">
                {settings.partialCashoutEnabled && (
                  <button
                    onClick={() => onCashout(bet.id, "partial")}
                    className="text-[10px] bg-primary/10 text-primary border border-primary/20 rounded px-2 py-1 hover:bg-primary/20 transition-colors"
                  >
                    Partial ${((bet.cashoutAmount || 0) * settings.partialCashoutPercent).toFixed(2)}
                  </button>
                )}
                <button
                  onClick={() => onCashout(bet.id, "full")}
                  className="text-[10px] bg-amber-400/10 text-amber-400 border border-amber-400/20 rounded px-2 py-1 hover:bg-amber-400/20 transition-colors"
                >
                  Cashout ${bet.cashoutAmount.toFixed(2)}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Platform & Time */}
        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Platform: {bet.bettingAccount?.platform || "N/A"}</span>
          <span>{new Date(bet.placedAt).toLocaleDateString()}</span>
        </div>
      </CardContent>
    </Card>
  );
}
