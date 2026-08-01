"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Zap,
  Shield,
  Bell,
  Percent,
  User,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  FlaskConical,
  Globe,
  Send,
  Unlink,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toast";

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
  notificationsEnabled: boolean;
  kellyFraction: number;
  minEdgeThreshold: number;
  stopLossDaily: number;
  stopLossWeekly: number;
  profitTargetDaily: number;
  profitTargetWeekly: number;
  partialCashoutEnabled: boolean;
  waitFullSettlement: boolean;
  maxAccumulatorLegs: number;
  betScheduleStart: string;
  betScheduleEnd: string;
  botMode: string;
  minTipConfidence: number;
  tipSports: string;
  minAiConfidence: number;
}

interface UserProfile {
  name: string;
  email: string;
  role: string;
  region: string | null;
  currency: string | null;
  balance: number;
  bankroll: number;
  dailyPnl: number;
  weeklyPnl: number;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>({
    autoBettingEnabled: false,
    maxBetAmount: 200,
    minOddsThreshold: 1.5,
    maxOddsThreshold: 5.0,
    riskLevel: "medium",
    autoCashoutEnabled: true,
    cashoutThreshold: 0.7,
    commissionRate: 0.10,
    dailyBetLimit: 500,
    preferredSports: "football,basketball,tennis",
    notificationsEnabled: true,
    kellyFraction: 0.25,
    minEdgeThreshold: 0.03,
    stopLossDaily: 100,
    stopLossWeekly: 300,
    profitTargetDaily: 200,
    profitTargetWeekly: 500,
    partialCashoutEnabled: true,
    waitFullSettlement: false,
    maxAccumulatorLegs: 5,
    betScheduleStart: "08:00",
    betScheduleEnd: "22:00",
    botMode: "advisor",
    minTipConfidence: 0.65,
    tipSports: "football,basketball,tennis",
    minAiConfidence: 0.6,
  });
  const [profile, setProfile] = useState<UserProfile>({
    name: "",
    email: "",
    role: "user",
    region: null,
    currency: null,
    balance: 0,
    bankroll: 0,
    dailyPnl: 0,
    weeklyPnl: 0,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [brokerMode, setBrokerMode] = useState<"demo" | "real">("demo");
  const [switchingMode, setSwitchingMode] = useState(false);
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [telegramDeepLink, setTelegramDeepLink] = useState<string | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const { addToast } = useToast();

  // Switch broker mode
  const handleBrokerModeSwitch = useCallback(async (mode: "demo" | "real") => {
    setSwitchingMode(true);
    try {
      const res = await fetch("/api/user/broker-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brokerMode: mode }),
      });
      if (res.ok) {
        const data = await res.json();
        setBrokerMode(data.brokerMode || mode);
        addToast("success", `Switched to ${mode === "demo" ? "Demo (Sandbox)" : "Live (Real)"} mode`);
      } else {
        addToast("error", "Failed to switch broker mode");
      }
    } catch {
      addToast("error", "Failed to switch broker mode");
    } finally {
      setSwitchingMode(false);
    }
  }, [addToast]);

  // Fetch real user settings from API
  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const [settingsRes, statsRes, brokerModeRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/stats/user"),
        fetch("/api/user/broker-mode"),
      ]);

      if (brokerModeRes.ok) {
        const bmData = await brokerModeRes.json();
        setBrokerMode(bmData.brokerMode || "demo");
      }

      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setSettings({
          autoBettingEnabled: data.autoBettingEnabled ?? false,
          maxBetAmount: data.maxBetAmount ?? 200,
          minOddsThreshold: data.minOddsThreshold ?? 1.5,
          maxOddsThreshold: data.maxOddsThreshold ?? 5.0,
          riskLevel: data.riskLevel ?? "medium",
          autoCashoutEnabled: data.autoCashoutEnabled ?? true,
          cashoutThreshold: data.cashoutThreshold ?? 0.7,
          commissionRate: data.commissionRate ?? 0.10,
          dailyBetLimit: data.dailyBetLimit ?? 500,
          preferredSports: data.preferredSports ?? "football,basketball,tennis",
          notificationsEnabled: data.notificationsEnabled ?? true,
          kellyFraction: data.kellyFraction ?? 0.25,
          minEdgeThreshold: data.minEdgeThreshold ?? 0.03,
          stopLossDaily: data.stopLossDaily ?? 100,
          stopLossWeekly: data.stopLossWeekly ?? 300,
          profitTargetDaily: data.profitTargetDaily ?? 200,
          profitTargetWeekly: data.profitTargetWeekly ?? 500,
          partialCashoutEnabled: data.partialCashoutEnabled ?? true,
          waitFullSettlement: data.waitFullSettlement ?? false,
          maxAccumulatorLegs: data.maxAccumulatorLegs ?? 5,
          betScheduleStart: data.betScheduleStart ?? "08:00",
          betScheduleEnd: data.betScheduleEnd ?? "22:00",
          botMode: data.botMode ?? "advisor",
          minTipConfidence: data.minTipConfidence ?? 0.65,
          tipSports: data.tipSports ?? "football,basketball,tennis",
          minAiConfidence: data.minAiConfidence ?? 0.6,
        });
      }

      if (statsRes.ok) {
        const stats = await statsRes.json();
        setProfile((prev) => ({
          ...prev,
          balance: stats.balance ?? 0,
          bankroll: stats.bankroll ?? 0,
          dailyPnl: stats.dailyPnl ?? 0,
          weeklyPnl: stats.weeklyPnl ?? 0,
        }));
      }

      // Use auth context for profile info
      if (user) {
        setProfile((prev) => ({
          ...prev,
          name: user.name || "",
          email: user.email || "",
          role: user.role || "user",
        }));
      }

      // Fetch Telegram connection status
      try {
        const tgRes = await fetch("/api/telegram/connect");
        if (tgRes.ok) {
          const tgData = await tgRes.json();
          setTelegramConnected(tgData.connected);
          setTelegramDeepLink(tgData.deepLink);
        }
      } catch {}
    } catch (err) {
      console.error("Failed to fetch settings:", err);
      setError("Failed to load settings. Using defaults.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Save settings to API
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save settings");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleTelegramDisconnect = async () => {
    setTelegramLoading(true);
    try {
      const res = await fetch("/api/telegram/connect", { method: "DELETE" });
      if (res.ok) {
        setTelegramConnected(false);
        addToast("success", "Telegram disconnected");
      } else {
        addToast("error", "Failed to disconnect Telegram");
      }
    } catch {
      addToast("error", "Failed to disconnect Telegram");
    } finally {
      setTelegramLoading(false);
    }
  };

  const riskLevels = [
    { value: "low", label: "Low", color: "text-emerald-400", desc: "Conservative bets only" },
    { value: "medium", label: "Medium", color: "text-amber-400", desc: "Balanced approach" },
    { value: "high", label: "High", color: "text-red-400", desc: "Aggressive strategy" },
  ];

  const sportsOptions = [
    { id: "football", label: "Football" },
    { id: "basketball", label: "Basketball" },
    { id: "tennis", label: "Tennis" },
    { id: "cricket", label: "Cricket" },
    { id: "rugby", label: "Rugby" },
    { id: "hockey", label: "Hockey" },
  ];

  const toggleSport = (sport: string) => {
    const current = settings.preferredSports.split(",").filter(Boolean);
    const updated = current.includes(sport)
      ? current.filter((s) => s !== sport)
      : [...current, sport];
    setSettings({ ...settings, preferredSports: updated.join(",") });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading your settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure your betting preferences and account settings
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchSettings}
          className="text-muted-foreground"
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Success Banner */}
      {saved && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Settings saved successfully!
        </div>
      )}

      {/* Account Info - Real Data */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4 text-primary" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">Name</Label>
            <span className="text-sm text-foreground">{profile.name || "Not set"}</span>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">Email</Label>
            <span className="text-sm text-foreground">{profile.email || "Not set"}</span>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">Role</Label>
            <Badge variant="secondary" className={profile.role === "admin" ? "bg-primary/10 text-primary" : ""}>
              {profile.role === "admin" ? "Admin" : "User"}
            </Badge>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground">Region</Label>
              <span className="text-sm text-foreground">{profile.region || "Not set"}</span>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground">Currency</Label>
              <span className="text-sm text-foreground">{profile.currency || "USD"}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground">Bankroll</Label>
              <span className="text-sm font-medium text-foreground">
                {profile.currency === "NGN" ? "₦" : profile.currency === "GBP" ? "£" : profile.currency === "EUR" ? "€" : "$"}
                {profile.bankroll.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground">Balance</Label>
              <span className="text-sm font-medium text-foreground">
                {profile.currency === "NGN" ? "₦" : profile.currency === "GBP" ? "£" : profile.currency === "EUR" ? "€" : "$"}
                {profile.balance.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground">Daily P&L</Label>
              <span className={`text-sm font-medium ${profile.dailyPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {profile.dailyPnl >= 0 ? "+" : ""}
                {profile.dailyPnl.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground">Weekly P&L</Label>
              <span className={`text-sm font-medium ${profile.weeklyPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {profile.weeklyPnl >= 0 ? "+" : ""}
                {profile.weeklyPnl.toFixed(2)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Broker Mode Toggle */}
      <Card className={`bg-card border-2 ${brokerMode === "demo" ? "border-blue-400/30" : "border-emerald-400/30"}`}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-primary" />
            Broker Account Mode
            <Badge className={`text-[10px] ${brokerMode === "demo" ? "bg-blue-400/10 text-blue-400 border-blue-400/30" : "bg-emerald-400/10 text-emerald-400 border-emerald-400/30"}`}>
              {brokerMode === "demo" ? "Sandbox" : "Live"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose how your broker accounts operate. In Demo mode, all broker connections are simulated (no real money at risk).
            In Live mode, connections use real broker APIs with real funds.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleBrokerModeSwitch("demo")}
              disabled={switchingMode || brokerMode === "demo"}
              className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all cursor-pointer ${
                brokerMode === "demo"
                  ? "border-blue-400 bg-blue-400/5 shadow-lg shadow-blue-400/10"
                  : "border-border hover:border-blue-400/50 hover:bg-blue-400/5"
              } ${switchingMode ? "opacity-50" : ""}`}
            >
              {brokerMode === "demo" && (
                <div className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-blue-400 flex items-center justify-center">
                  <CheckCircle2 className="h-3 w-3 text-white" />
                </div>
              )}
              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${brokerMode === "demo" ? "bg-blue-400/10" : "bg-secondary"}`}>
                <FlaskConical className={`h-5 w-5 ${brokerMode === "demo" ? "text-blue-400" : "text-muted-foreground"}`} />
              </div>
              <div className="text-center">
                <p className={`text-sm font-medium ${brokerMode === "demo" ? "text-blue-400" : "text-foreground"}`}>Demo (Sandbox)</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Simulated trades, no real money</p>
              </div>
            </button>

            <button
              onClick={() => handleBrokerModeSwitch("real")}
              disabled={switchingMode || brokerMode === "real"}
              className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all cursor-pointer ${
                brokerMode === "real"
                  ? "border-emerald-400 bg-emerald-400/5 shadow-lg shadow-emerald-400/10"
                  : "border-border hover:border-emerald-400/50 hover:bg-emerald-400/5"
              } ${switchingMode ? "opacity-50" : ""}`}
            >
              {brokerMode === "real" && (
                <div className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="h-3 w-3 text-white" />
                </div>
              )}
              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${brokerMode === "real" ? "bg-emerald-400/10" : "bg-secondary"}`}>
                <Globe className={`h-5 w-5 ${brokerMode === "real" ? "text-emerald-400" : "text-muted-foreground"}`} />
              </div>
              <div className="text-center">
                <p className={`text-sm font-medium ${brokerMode === "real" ? "text-emerald-400" : "text-foreground"}`}>Live (Real)</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Real broker API, real funds</p>
              </div>
            </button>
          </div>

          {brokerMode === "real" && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Live Mode Warning</p>
                <p className="text-amber-400/80 mt-0.5">
                  You are using real broker credentials. All bets, cashouts, and transfers will use real funds.
                  Ensure your broker API credentials are correctly configured.
                </p>
              </div>
            </div>
          )}

          {switchingMode && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Switching mode...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bot Mode: Advisor vs Auto */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-primary" />
            Bot Mode
            <Badge className={`text-[10px] ${
              settings.botMode === "advisor"
                ? "bg-blue-400/10 text-blue-400 border-blue-400/30"
                : "bg-emerald-400/10 text-emerald-400 border-emerald-400/30"
            }`}>
              {settings.botMode === "advisor" ? "Advisor" : "Auto-Bet"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose how the AI bot operates. In <strong>Advisor</strong> mode, the AI sends you tips via Telegram and you place bets yourself.
            In <strong>Auto-Bet</strong> mode, the AI places bets automatically via your connected broker.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setSettings({ ...settings, botMode: "advisor" })}
              className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all cursor-pointer ${
                settings.botMode === "advisor"
                  ? "border-blue-400 bg-blue-400/5 shadow-lg shadow-blue-400/10"
                  : "border-border hover:border-blue-400/50 hover:bg-blue-400/5"
              }`}
            >
              {settings.botMode === "advisor" && (
                <div className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-blue-400 flex items-center justify-center">
                  <CheckCircle2 className="h-3 w-3 text-white" />
                </div>
              )}
              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${settings.botMode === "advisor" ? "bg-blue-400/10" : "bg-secondary"}`}>
                <Send className={`h-5 w-5 ${settings.botMode === "advisor" ? "text-blue-400" : "text-muted-foreground"}`} />
              </div>
              <div className="text-center">
                <p className={`text-sm font-medium ${settings.botMode === "advisor" ? "text-blue-400" : "text-foreground"}`}>Advisor</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">AI tips, you place bets</p>
              </div>
            </button>

            <button
              onClick={() => setSettings({ ...settings, botMode: "auto" })}
              className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all cursor-pointer ${
                settings.botMode === "auto"
                  ? "border-emerald-400 bg-emerald-400/5 shadow-lg shadow-emerald-400/10"
                  : "border-border hover:border-emerald-400/50 hover:bg-emerald-400/5"
              }`}
            >
              {settings.botMode === "auto" && (
                <div className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="h-3 w-3 text-white" />
                </div>
              )}
              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${settings.botMode === "auto" ? "bg-emerald-400/10" : "bg-secondary"}`}>
                <Zap className={`h-5 w-5 ${settings.botMode === "auto" ? "text-emerald-400" : "text-muted-foreground"}`} />
              </div>
              <div className="text-center">
                <p className={`text-sm font-medium ${settings.botMode === "auto" ? "text-emerald-400" : "text-foreground"}`}>Auto-Bet</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">AI places bets for you</p>
              </div>
            </button>
          </div>

          {/* Advisor-specific settings */}
          {settings.botMode === "advisor" && (
            <div className="space-y-4 pt-2">
              <Separator />
              <div>
                <Label className="text-sm font-medium">Min Tip Confidence</Label>
                <div className="flex items-center gap-3 mt-1">
                  <input
                    type="range"
                    min="30"
                    max="95"
                    step="5"
                    value={settings.minTipConfidence * 100}
                    onChange={(e) =>
                      setSettings({ ...settings, minTipConfidence: parseInt(e.target.value) / 100 })
                    }
                    className="flex-1 h-1.5 rounded-full bg-secondary appearance-none cursor-pointer accent-primary"
                  />
                  <span className="text-sm font-medium text-primary w-12 text-right">
                    {(settings.minTipConfidence * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Only send tips with AI confidence above this threshold
                </p>
              </div>

              <div>
                <Label className="text-sm font-medium">Tip Sports</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {sportsOptions.map((sport) => {
                    const isSelected = settings.tipSports.split(",").includes(sport.id);
                    return (
                      <button
                        key={sport.id}
                        onClick={() => {
                          const current = settings.tipSports.split(",").filter(Boolean);
                          const updated = current.includes(sport.id)
                            ? current.filter((s) => s !== sport.id)
                            : [...current, sport.id];
                          setSettings({ ...settings, tipSports: updated.join(",") });
                        }}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                          isSelected
                            ? "bg-primary/10 text-primary border border-primary/30"
                            : "bg-secondary/50 text-muted-foreground border border-border"
                        }`}
                      >
                        {sport.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auto-Betting Settings */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-primary" />
            Auto-Betting
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Enable Auto-Betting</Label>
              <p className="text-xs text-muted-foreground">
                Allow AI to automatically place bets based on your criteria
              </p>
            </div>
            <Switch
              checked={settings.autoBettingEnabled}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, autoBettingEnabled: checked as boolean })
              }
            />
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Max Bet Amount</Label>
              <Input
                type="number"
                value={settings.maxBetAmount}
                onChange={(e) =>
                  setSettings({ ...settings, maxBetAmount: parseFloat(e.target.value) || 0 })
                }
                className="bg-secondary border-border mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Daily Bet Limit</Label>
              <Input
                type="number"
                value={settings.dailyBetLimit}
                onChange={(e) =>
                  setSettings({ ...settings, dailyBetLimit: parseFloat(e.target.value) || 0 })
                }
                className="bg-secondary border-border mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Min Odds Threshold</Label>
              <Input
                type="number"
                step="0.1"
                value={settings.minOddsThreshold}
                onChange={(e) =>
                  setSettings({ ...settings, minOddsThreshold: parseFloat(e.target.value) || 0 })
                }
                className="bg-secondary border-border mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Max Odds Threshold</Label>
              <Input
                type="number"
                step="0.1"
                value={settings.maxOddsThreshold}
                onChange={(e) =>
                  setSettings({ ...settings, maxOddsThreshold: parseFloat(e.target.value) || 0 })
                }
                className="bg-secondary border-border mt-1"
              />
            </div>
          </div>

          {/* Kelly & Edge Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Kelly Fraction</Label>
              <Input
                type="number"
                step="0.05"
                min="0.05"
                max="1.0"
                value={settings.kellyFraction}
                onChange={(e) =>
                  setSettings({ ...settings, kellyFraction: parseFloat(e.target.value) || 0.25 })
                }
                className="bg-secondary border-border mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Fraction of Kelly stake to use (0.05 - 1.0)
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium">Min Edge Threshold</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="0.5"
                value={settings.minEdgeThreshold}
                onChange={(e) =>
                  setSettings({ ...settings, minEdgeThreshold: parseFloat(e.target.value) || 0.03 })
                }
                className="bg-secondary border-border mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Minimum value edge to place a bet (0.03 = 3%)
              </p>
            </div>
          </div>

          {/* Max Accumulator Legs */}
          <div>
            <Label className="text-sm font-medium">Max Accumulator Legs</Label>
            <Input
              type="number"
              min="2"
              max="20"
              value={settings.maxAccumulatorLegs}
              onChange={(e) =>
                setSettings({ ...settings, maxAccumulatorLegs: parseInt(e.target.value) || 5 })
              }
              className="bg-secondary border-border mt-1 max-w-[200px]"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Maximum number of legs in an accumulator/parlay bet
            </p>
          </div>

          {/* Bet Schedule */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Bet Schedule Start</Label>
              <Input
                type="time"
                value={settings.betScheduleStart}
                onChange={(e) =>
                  setSettings({ ...settings, betScheduleStart: e.target.value })
                }
                className="bg-secondary border-border mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Bet Schedule End</Label>
              <Input
                type="time"
                value={settings.betScheduleEnd}
                onChange={(e) =>
                  setSettings({ ...settings, betScheduleEnd: e.target.value })
                }
                className="bg-secondary border-border mt-1"
              />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            AI bot will only place bets during this time window
          </p>

          {/* Preferred Sports */}
          <div>
            <Label className="text-sm font-medium">Preferred Sports</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {sportsOptions.map((sport) => {
                const isSelected = settings.preferredSports.split(",").includes(sport.id);
                return (
                  <button
                    key={sport.id}
                    onClick={() => toggleSport(sport.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      isSelected
                        ? "bg-primary/10 text-primary border border-primary/30"
                        : "bg-secondary/50 text-muted-foreground border border-border"
                    }`}
                  >
                    {sport.label}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Risk Management */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-amber-400" />
            Risk Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium mb-2 block">Risk Level</Label>
            <div className="grid grid-cols-3 gap-2">
              {riskLevels.map((level) => (
                <button
                  key={level.value}
                  onClick={() => setSettings({ ...settings, riskLevel: level.value })}
                  className={`rounded-lg border p-3 text-center transition-all ${
                    settings.riskLevel === level.value
                      ? "border-primary bg-primary/10"
                      : "border-border bg-secondary/50 hover:border-border"
                  }`}
                >
                  <div className={`text-sm font-medium ${level.color}`}>{level.label}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{level.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Stop Loss & Profit Targets */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Daily Stop Loss</Label>
              <Input
                type="number"
                value={settings.stopLossDaily}
                onChange={(e) =>
                  setSettings({ ...settings, stopLossDaily: parseFloat(e.target.value) || 0 })
                }
                className="bg-secondary border-border mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Stop betting if daily losses reach this
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium">Weekly Stop Loss</Label>
              <Input
                type="number"
                value={settings.stopLossWeekly}
                onChange={(e) =>
                  setSettings({ ...settings, stopLossWeekly: parseFloat(e.target.value) || 0 })
                }
                className="bg-secondary border-border mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Stop betting if weekly losses reach this
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Daily Profit Target</Label>
              <Input
                type="number"
                value={settings.profitTargetDaily}
                onChange={(e) =>
                  setSettings({ ...settings, profitTargetDaily: parseFloat(e.target.value) || 0 })
                }
                className="bg-secondary border-border mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Pause betting when daily profit target is hit
              </p>
            </div>
            <div>
              <Label className="text-sm font-medium">Weekly Profit Target</Label>
              <Input
                type="number"
                value={settings.profitTargetWeekly}
                onChange={(e) =>
                  setSettings({ ...settings, profitTargetWeekly: parseFloat(e.target.value) || 0 })
                }
                className="bg-secondary border-border mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Pause betting when weekly profit target is hit
              </p>
            </div>
          </div>

          <Separator />

          {/* Cashout Settings */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Auto Cashout</Label>
              <p className="text-xs text-muted-foreground">
                Automatically cashout when threshold is reached
              </p>
            </div>
            <Switch
              checked={settings.autoCashoutEnabled}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, autoCashoutEnabled: checked as boolean })
              }
            />
          </div>

          {settings.autoCashoutEnabled && (
            <div>
              <Label className="text-sm font-medium">
                Cashout Threshold: {Math.round(settings.cashoutThreshold * 100)}%
              </Label>
              <input
                type="range"
                min="20"
                max="90"
                step="5"
                value={settings.cashoutThreshold * 100}
                onChange={(e) =>
                  setSettings({ ...settings, cashoutThreshold: parseInt(e.target.value) / 100 })
                }
                className="w-full h-1.5 rounded-full bg-secondary appearance-none cursor-pointer mt-2 accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>20%</span>
                <span>50%</span>
                <span>90%</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Partial Cashout</Label>
              <p className="text-xs text-muted-foreground">
                Allow cashing out a portion of the bet while keeping the rest active
              </p>
            </div>
            <Switch
              checked={settings.partialCashoutEnabled}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, partialCashoutEnabled: checked as boolean })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Wait Full Settlement</Label>
              <p className="text-xs text-muted-foreground">
                Wait for all matches to complete before full cashout (for accumulators)
              </p>
            </div>
            <Switch
              checked={settings.waitFullSettlement}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, waitFullSettlement: checked as boolean })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4 text-primary" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Enable Notifications</Label>
              <p className="text-xs text-muted-foreground">
                Get notified about bet results, cashout opportunities, and AI recommendations
              </p>
            </div>
            <Switch
              checked={settings.notificationsEnabled}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, notificationsEnabled: checked as boolean })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Telegram Notifications */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-4 w-4 text-blue-400" />
            Telegram Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {telegramConnected ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-emerald-400/10 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-emerald-400" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Telegram Connected</p>
                    <p className="text-xs text-muted-foreground">You&apos;ll receive AI tip alerts via Telegram</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleTelegramDisconnect}
                  disabled={telegramLoading}
                  className="text-red-400 hover:text-red-300 hover:bg-red-400/10 h-8 text-xs"
                >
                  <Unlink className="h-3 w-3 mr-1" />
                  Disconnect
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Use <span className="text-foreground font-mono">/stop</span> to pause tips or <span className="text-foreground font-mono">/resume</span> to restart directly in Telegram.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg bg-secondary/50 p-4">
                <p className="text-sm text-foreground mb-1">Connect your Telegram to receive AI tips</p>
                <p className="text-xs text-muted-foreground">
                  When the AI finds a value bet, you&apos;ll get an instant alert on Telegram with the selection, odds, confidence, and reasoning.
                </p>
              </div>
              {telegramDeepLink ? (
                <a
                  href={telegramDeepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full rounded-lg bg-blue-500 hover:bg-blue-600 text-white py-2.5 px-4 text-sm font-medium transition-colors"
                >
                  <Send className="h-4 w-4" />
                  Connect Telegram
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <div className="rounded-lg bg-amber-400/10 p-3">
                  <p className="text-xs text-amber-400">
                    Telegram bot not configured yet. Contact admin to set up the bot.
                  </p>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                Clicking the button opens Telegram. Send <span className="text-foreground font-mono">/start</span> to link your account.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Commission Info */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Percent className="h-4 w-4 text-amber-400" />
            Commission Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Your Commission Rate</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                This rate is applied to all winning bets and automatically transferred to admin
              </p>
            </div>
            <Badge variant="secondary" className="bg-amber-400/10 text-amber-400 text-lg px-3 py-1">
              {(settings.commissionRate * 100).toFixed(0)}%
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Commission is deducted automatically from profits and transferred to the admin account.
            Your displayed profit is always net of commission.
          </p>
        </CardContent>
      </Card>

      {/* Save Button */}
      <Button
        className="w-full bg-primary text-primary-foreground hover:bg-primary/80 h-10"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : saved ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
      </Button>
    </div>
  );
}
