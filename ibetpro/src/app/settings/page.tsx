"use client";

import { useState, useCallback } from "react";
import { useFetch } from "@/lib/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield,
  Zap,
  DollarSign,
  Target,
  Save,
  Loader2,
  CheckCircle2,
  Brain,
  AlertTriangle,
} from "lucide-react";

interface UserSettings {
  id: string;
  autoBettingEnabled: boolean;
  maxBetAmount: number;
  minOddsThreshold: number;
  maxOddsThreshold: number;
  riskLevel: string;
  autoCashoutEnabled: boolean;
  cashoutThreshold: number;
  commissionRate: number;
  preferredSports: string;
  notificationsEnabled: boolean;
  dailyBetLimit: number;
  kellyFraction: number;
  minEdgeThreshold: number;
}

export default function SettingsPage() {
  const { data: settings, loading, refetch } = useFetch<UserSettings>("/api/settings", {
    id: "",
    autoBettingEnabled: false,
    maxBetAmount: 200,
    minOddsThreshold: 1.5,
    maxOddsThreshold: 5.0,
    riskLevel: "medium",
    autoCashoutEnabled: true,
    cashoutThreshold: 0.7,
    commissionRate: 0.10,
    preferredSports: "football,basketball,tennis",
    notificationsEnabled: true,
    dailyBetLimit: 500,
    kellyFraction: 0.25,
    minEdgeThreshold: 0.03,
  });

  const [form, setForm] = useState<Partial<UserSettings>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [runningAutoBet, setRunningAutoBet] = useState(false);
  const [autoBetResult, setAutoBetResult] = useState<string | null>(null);

  const currentSettings = { ...settings, ...form };

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setSaved(true);
        setForm({});
        refetch();
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // Handle error silently
    } finally {
      setSaving(false);
    }
  }, [form, refetch]);

  const handleRunAutoBet = useCallback(async () => {
    setRunningAutoBet(true);
    setAutoBetResult(null);
    try {
      const res = await fetch("/api/auto-bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok) {
        setAutoBetResult(
          `Scanned ${data.summary.matchesAnalyzed} matches, placed ${data.summary.betsPlaced} bets, skipped ${data.summary.betsSkipped}, ${data.summary.errors} errors.`
        );
      } else {
        setAutoBetResult(`Error: ${data.error}`);
      }
    } catch {
      setAutoBetResult("Failed to run auto-bet engine.");
    } finally {
      setRunningAutoBet(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading settings...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure your auto-betting, risk management, and AI preferences
        </p>
      </div>

      {/* Auto-Bet Engine */}
      <Card className="bg-card border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-primary" />
            Auto-Betting Engine
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
            <div>
              <p className="text-sm font-medium text-foreground">Auto-Betting</p>
              <p className="text-xs text-muted-foreground">Let AI scan matches and place bets automatically</p>
            </div>
            <button
              onClick={() => setForm({ ...form, autoBettingEnabled: !currentSettings.autoBettingEnabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                currentSettings.autoBettingEnabled ? "bg-primary" : "bg-secondary"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  currentSettings.autoBettingEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Max Bet Amount ($)</label>
              <Input
                type="number"
                value={currentSettings.maxBetAmount}
                onChange={(e) => setForm({ ...form, maxBetAmount: parseFloat(e.target.value) || 0 })}
                className="bg-secondary border-border mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Daily Bet Limit ($)</label>
              <Input
                type="number"
                value={currentSettings.dailyBetLimit}
                onChange={(e) => setForm({ ...form, dailyBetLimit: parseFloat(e.target.value) || 0 })}
                className="bg-secondary border-border mt-1"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleRunAutoBet}
              disabled={runningAutoBet || !currentSettings.autoBettingEnabled}
              className="bg-primary hover:bg-primary/90"
            >
              {runningAutoBet ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Brain className="h-4 w-4 mr-2" />
              )}
              {runningAutoBet ? "Running AI Scan..." : "Run Auto-Bet Now"}
            </Button>
            {!currentSettings.autoBettingEnabled && (
              <p className="text-xs text-muted-foreground">Enable auto-betting first</p>
            )}
          </div>

          {autoBetResult && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm text-foreground">
              {autoBetResult}
            </div>
          )}
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Risk Level</label>
              <Select
                value={currentSettings.riskLevel}
                onValueChange={(v) => { if (v) setForm({ ...form, riskLevel: v }); }}
              >
                <SelectTrigger className="bg-secondary border-border mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low (Conservative)</SelectItem>
                  <SelectItem value="medium">Medium (Balanced)</SelectItem>
                  <SelectItem value="high">High (Aggressive)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Kelly Fraction</label>
              <Input
                type="number"
                step="0.01"
                value={currentSettings.kellyFraction}
                onChange={(e) => setForm({ ...form, kellyFraction: parseFloat(e.target.value) || 0.25 })}
                className="bg-secondary border-border mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">0.25 = Quarter Kelly (recommended)</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Min Odds Threshold</label>
              <Input
                type="number"
                step="0.1"
                value={currentSettings.minOddsThreshold}
                onChange={(e) => setForm({ ...form, minOddsThreshold: parseFloat(e.target.value) || 1.0 })}
                className="bg-secondary border-border mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Max Odds Threshold</label>
              <Input
                type="number"
                step="0.1"
                value={currentSettings.maxOddsThreshold}
                onChange={(e) => setForm({ ...form, maxOddsThreshold: parseFloat(e.target.value) || 5.0 })}
                className="bg-secondary border-border mt-1"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Min Value Edge (AI will skip bets below this)</label>
            <Input
              type="number"
              step="0.01"
              value={currentSettings.minEdgeThreshold}
              onChange={(e) => setForm({ ...form, minEdgeThreshold: parseFloat(e.target.value) || 0.03 })}
              className="bg-secondary border-border mt-1"
            />
            <p className="text-[10px] text-muted-foreground mt-1">0.03 = 3% minimum edge (recommended)</p>
          </div>
        </CardContent>
      </Card>

      {/* Cashout Settings */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-emerald-400" />
            Auto-Cashout
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
            <div>
              <p className="text-sm font-medium text-foreground">Auto-Cashout</p>
              <p className="text-xs text-muted-foreground">Automatically cashout when AI recommends</p>
            </div>
            <button
              onClick={() => setForm({ ...form, autoCashoutEnabled: !currentSettings.autoCashoutEnabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                currentSettings.autoCashoutEnabled ? "bg-emerald-500" : "bg-secondary"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  currentSettings.autoCashoutEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Cashout Threshold</label>
            <Input
              type="number"
              step="0.05"
              value={currentSettings.cashoutThreshold}
              onChange={(e) => setForm({ ...form, cashoutThreshold: parseFloat(e.target.value) || 0.7 })}
              className="bg-secondary border-border mt-1"
            />
            <p className="text-[10px] text-muted-foreground mt-1">0.7 = Cashout when 70% of potential profit is secured</p>
          </div>
        </CardContent>
      </Card>

      {/* Commission & Preferences */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-primary" />
            Commission & Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Commission Rate</label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="number"
                  step="0.01"
                  value={currentSettings.commissionRate}
                  disabled
                  className="bg-secondary border-border"
                />
                <Badge className="bg-amber-400/10 text-amber-400 text-[10px]">
                  {(currentSettings.commissionRate * 100).toFixed(0)}%
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Set by admin — deducted from profits</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Preferred Sports</label>
              <Input
                value={currentSettings.preferredSports}
                onChange={(e) => setForm({ ...form, preferredSports: e.target.value })}
                className="bg-secondary border-border mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Comma-separated: football,basketball,tennis</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
            <div>
              <p className="text-sm font-medium text-foreground">Notifications</p>
              <p className="text-xs text-muted-foreground">Receive alerts for bet results and cashout opportunities</p>
            </div>
            <button
              onClick={() => setForm({ ...form, notificationsEnabled: !currentSettings.notificationsEnabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                currentSettings.notificationsEnabled ? "bg-primary" : "bg-secondary"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  currentSettings.notificationsEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={saving || Object.keys(form).length === 0}
          className="bg-primary hover:bg-primary/90"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : saved ? (
            <CheckCircle2 className="h-4 w-4 mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
        </Button>
        {Object.keys(form).length > 0 && !saved && (
          <p className="text-xs text-amber-400 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Unsaved changes
          </p>
        )}
      </div>
    </div>
  );
}
