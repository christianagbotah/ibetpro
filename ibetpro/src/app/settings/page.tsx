"use client";

import { useState } from "react";
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
} from "lucide-react";

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
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>({
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
    notificationsEnabled: true,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    // Simulate save
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
  ];

  const toggleSport = (sport: string) => {
    const current = settings.preferredSports.split(",");
    const updated = current.includes(sport)
      ? current.filter((s) => s !== sport)
      : [...current, sport];
    setSettings({ ...settings, preferredSports: updated.join(",") });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure your betting preferences and account settings
        </p>
      </div>

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
                This rate is applied to all winning bets
              </p>
            </div>
            <Badge variant="secondary" className="bg-amber-400/10 text-amber-400 text-lg px-3 py-1">
              {(settings.commissionRate * 100).toFixed(0)}%
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Account Info */}
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
            <span className="text-sm text-foreground">Alex Johnson</span>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">Email</Label>
            <span className="text-sm text-foreground">demo@ibetpro.com</span>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">Role</Label>
            <Badge variant="secondary">User</Badge>
          </div>
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
          "Settings Saved!"
        ) : (
          <Save className="h-4 w-4" />
        )}
        {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
      </Button>
    </div>
  );
}
