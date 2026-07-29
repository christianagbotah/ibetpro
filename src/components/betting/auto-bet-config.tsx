"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Zap, Shield, DollarSign, Clock } from "lucide-react";
import { useState } from "react";

interface AutoBetConfigProps {
  settings: {
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
  };
  onSave?: (settings: AutoBetConfigProps["settings"]) => void;
}

export function AutoBetConfig({ settings, onSave }: AutoBetConfigProps) {
  const [config, setConfig] = useState(settings);

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
    const current = config.preferredSports.split(",");
    const updated = current.includes(sport)
      ? current.filter((s) => s !== sport)
      : [...current, sport];
    setConfig({ ...config, preferredSports: updated.join(",") });
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4 text-primary" />
          Auto-Betting Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Main Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <Label className="text-sm font-medium">Auto-Betting</Label>
          </div>
          <Switch
            checked={config.autoBettingEnabled}
            onCheckedChange={(checked) =>
              setConfig({ ...config, autoBettingEnabled: checked as boolean })
            }
          />
        </div>

        <Separator />

        {/* Bet Amounts */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Bet Amounts</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Max Bet Amount</Label>
              <Input
                type="number"
                value={config.maxBetAmount}
                onChange={(e) =>
                  setConfig({ ...config, maxBetAmount: parseFloat(e.target.value) || 0 })
                }
                className="bg-secondary border-border mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Daily Bet Limit</Label>
              <Input
                type="number"
                value={config.dailyBetLimit}
                onChange={(e) =>
                  setConfig({ ...config, dailyBetLimit: parseFloat(e.target.value) || 0 })
                }
                className="bg-secondary border-border mt-1"
              />
            </div>
          </div>
        </div>

        {/* Odds Threshold */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Odds Range</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Min Odds</Label>
              <Input
                type="number"
                step="0.1"
                value={config.minOddsThreshold}
                onChange={(e) =>
                  setConfig({ ...config, minOddsThreshold: parseFloat(e.target.value) || 0 })
                }
                className="bg-secondary border-border mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Max Odds</Label>
              <Input
                type="number"
                step="0.1"
                value={config.maxOddsThreshold}
                onChange={(e) =>
                  setConfig({ ...config, maxOddsThreshold: parseFloat(e.target.value) || 0 })
                }
                className="bg-secondary border-border mt-1"
              />
            </div>
          </div>
        </div>

        {/* Risk Level */}
        <div className="space-y-3">
          <span className="text-sm font-medium">Risk Level</span>
          <div className="grid grid-cols-3 gap-2">
            {riskLevels.map((level) => (
              <button
                key={level.value}
                onClick={() => setConfig({ ...config, riskLevel: level.value })}
                className={`rounded-lg border p-3 text-center transition-all ${
                  config.riskLevel === level.value
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

        {/* Preferred Sports */}
        <div className="space-y-3">
          <span className="text-sm font-medium">Preferred Sports</span>
          <div className="flex flex-wrap gap-2">
            {sportsOptions.map((sport) => {
              const isSelected = config.preferredSports.split(",").includes(sport.id);
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

        <Separator />

        {/* Auto Cashout */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Auto Cashout</Label>
            </div>
            <Switch
              checked={config.autoCashoutEnabled}
              onCheckedChange={(checked) =>
                setConfig({ ...config, autoCashoutEnabled: checked as boolean })
              }
            />
          </div>
          {config.autoCashoutEnabled && (
            <div>
              <Label className="text-xs text-muted-foreground">
                Cashout Threshold: {Math.round(config.cashoutThreshold * 100)}% of potential win
              </Label>
              <Slider
                value={[config.cashoutThreshold * 100]}
                onValueChange={(value) =>
                  setConfig({ ...config, cashoutThreshold: value[0] / 100 })
                }
                min={20}
                max={90}
                step={5}
                className="mt-2"
              />
            </div>
          )}
        </div>

        {/* Commission Rate */}
        <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
          <div>
            <span className="text-sm font-medium">Commission Rate</span>
            <p className="text-xs text-muted-foreground">Deducted from winning bets</p>
          </div>
          <Badge variant="secondary" className="bg-amber-400/10 text-amber-400">
            {(config.commissionRate * 100).toFixed(0)}%
          </Badge>
        </div>

        {/* Save Button */}
        {onSave && (
          <Button
            className="w-full bg-primary text-primary-foreground hover:bg-primary/80"
            onClick={() => onSave(config)}
          >
            Save Configuration
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
