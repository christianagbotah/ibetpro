"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, Shield, DollarSign, Clock, Target, TrendingUp, Calendar, Layers } from "lucide-react";
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

  const betTypeOptions = [
    { id: "single", label: "Single Bets" },
    { id: "accumulator", label: "Accumulators" },
  ];

  const toggleSport = (sport: string) => {
    const current = config.preferredSports.split(",");
    const updated = current.includes(sport)
      ? current.filter((s) => s !== sport)
      : [...current, sport];
    setConfig({ ...config, preferredSports: updated.join(",") });
  };

  const toggleBetType = (type: string) => {
    const current = config.betTypes.split(",");
    const updated = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    setConfig({ ...config, betTypes: updated.join(",") });
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4 text-primary" />
          Auto-Betting Configuration
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="general" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general" className="text-xs">General</TabsTrigger>
            <TabsTrigger value="risk" className="text-xs">Risk</TabsTrigger>
            <TabsTrigger value="cashout" className="text-xs">Cashout</TabsTrigger>
            <TabsTrigger value="schedule" className="text-xs">Schedule</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4">
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

            {/* Bet Types */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Bet Types</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {betTypeOptions.map((type) => {
                  const isSelected = config.betTypes.split(",").includes(type.id);
                  return (
                    <button
                      key={type.id}
                      onClick={() => toggleBetType(type.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                        isSelected
                          ? "bg-primary/10 text-primary border border-primary/30"
                          : "bg-secondary/50 text-muted-foreground border border-border"
                      }`}
                    >
                      {type.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Max Accumulator Legs */}
            {config.betTypes.includes("accumulator") && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Max Accumulator Legs</Label>
                  <Badge variant="secondary" className="text-xs">{config.maxAccumulatorLegs}</Badge>
                </div>
                <Slider
                  value={[config.maxAccumulatorLegs]}
                  onValueChange={(value) =>
                    setConfig({ ...config, maxAccumulatorLegs: value[0] })
                  }
                  min={2}
                  max={8}
                  step={1}
                />
              </div>
            )}

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

            {/* AI Confidence */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Min AI Confidence</Label>
                <Badge variant="secondary" className="text-xs">{Math.round(config.minAiConfidence * 100)}%</Badge>
              </div>
              <Slider
                value={[config.minAiConfidence * 100]}
                onValueChange={(value) =>
                  setConfig({ ...config, minAiConfidence: value[0] / 100 })
                }
                min={40}
                max={90}
                step={5}
              />
            </div>

            {/* Min Edge Threshold */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Min Value Edge</Label>
                <Badge variant="secondary" className="text-xs">{(config.minEdgeThreshold * 100).toFixed(1)}%</Badge>
              </div>
              <Slider
                value={[config.minEdgeThreshold * 100]}
                onValueChange={(value) =>
                  setConfig({ ...config, minEdgeThreshold: value[0] / 100 })
                }
                min={1}
                max={15}
                step={0.5}
              />
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
          </TabsContent>

          <TabsContent value="risk" className="space-y-4">
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

            {/* Kelly Fraction */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Kelly Fraction</Label>
                <Badge variant="secondary" className="text-xs">{(config.kellyFraction * 100).toFixed(0)}%</Badge>
              </div>
              <Slider
                value={[config.kellyFraction * 100]}
                onValueChange={(value) =>
                  setConfig({ ...config, kellyFraction: value[0] / 100 })
                }
                min={10}
                max={50}
                step={5}
              />
              <p className="text-[10px] text-muted-foreground">Quarter-Kelly (25%) is recommended for conservative staking</p>
            </div>

            <Separator />

            {/* Stop-Loss */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-red-400" />
                <span className="text-sm font-medium">Stop-Loss</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Daily Stop-Loss</Label>
                  <Input
                    type="number"
                    value={config.stopLossDaily}
                    onChange={(e) =>
                      setConfig({ ...config, stopLossDaily: parseFloat(e.target.value) || 0 })
                    }
                    className="bg-secondary border-border mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Weekly Stop-Loss</Label>
                  <Input
                    type="number"
                    value={config.stopLossWeekly}
                    onChange={(e) =>
                      setConfig({ ...config, stopLossWeekly: parseFloat(e.target.value) || 0 })
                    }
                    className="bg-secondary border-border mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Profit Targets */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium">Profit Targets</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Daily Target</Label>
                  <Input
                    type="number"
                    value={config.profitTargetDaily}
                    onChange={(e) =>
                      setConfig({ ...config, profitTargetDaily: parseFloat(e.target.value) || 0 })
                    }
                    className="bg-secondary border-border mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Weekly Target</Label>
                  <Input
                    type="number"
                    value={config.profitTargetWeekly}
                    onChange={(e) =>
                      setConfig({ ...config, profitTargetWeekly: parseFloat(e.target.value) || 0 })
                    }
                    className="bg-secondary border-border mt-1"
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="cashout" className="space-y-4">
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

            <Separator />

            {/* Partial Cashout */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Partial Cashout</Label>
                </div>
                <Switch
                  checked={config.partialCashoutEnabled}
                  onCheckedChange={(checked) =>
                    setConfig({ ...config, partialCashoutEnabled: checked as boolean })
                  }
                />
              </div>
              {config.partialCashoutEnabled && (
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Cashout Portion: {Math.round(config.partialCashoutPercent * 100)}% of bet
                  </Label>
                  <Slider
                    value={[config.partialCashoutPercent * 100]}
                    onValueChange={(value) =>
                      setConfig({ ...config, partialCashoutPercent: value[0] / 100 })
                    }
                    min={20}
                    max={80}
                    step={10}
                    className="mt-2"
                  />
                </div>
              )}
            </div>

            <Separator />

            {/* Wait for Full Settlement */}
            <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-3">
              <div>
                <span className="text-sm font-medium">Wait for Full Settlement</span>
                <p className="text-xs text-muted-foreground">AI waits for match to end for maximum payout when bet is winning</p>
              </div>
              <Switch
                checked={config.waitFullSettlement}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, waitFullSettlement: checked as boolean })
                }
              />
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
          </TabsContent>

          <TabsContent value="schedule" className="space-y-4">
            {/* Bet Schedule */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Betting Schedule</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Bot only places bets within this time window (your local timezone)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Start Time</Label>
                  <Input
                    type="time"
                    value={config.betScheduleStart}
                    onChange={(e) =>
                      setConfig({ ...config, betScheduleStart: e.target.value })
                    }
                    className="bg-secondary border-border mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">End Time</Label>
                  <Input
                    type="time"
                    value={config.betScheduleEnd}
                    onChange={(e) =>
                      setConfig({ ...config, betScheduleEnd: e.target.value })
                    }
                    className="bg-secondary border-border mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Schedule Info */}
            <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
              <p className="text-xs text-muted-foreground">
                Active hours: <span className="text-primary font-medium">{config.betScheduleStart}</span> to <span className="text-primary font-medium">{config.betScheduleEnd}</span>. 
                The bot will only scan and place bets during this window. Matches outside this window will be queued for the next active period.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Save Button */}
        {onSave && (
          <>
            <Separator className="my-4" />
            <Button
              className="w-full bg-primary text-primary-foreground hover:bg-primary/80"
              onClick={() => onSave(config)}
            >
              Save Configuration
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
