"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Activity, Brain, Clock, Zap, Shield, AlertTriangle,
  CheckCircle, Server, RefreshCw, Radio, TrendingUp, TrendingDown,
} from "lucide-react";
import { useCurrency } from "@/components/currency-provider";

interface EngineStats {
  userId: string;
  status: "running" | "stopped" | "paused";
  scanIntervalSec: number;
  totalScans: number;
  totalBetsPlaced: number;
  totalStakeUsed: number;
  totalProfit: number;
  lastScanAt: string | null;
  lastBetAt: string | null;
  startedAt: string | null;
  errorCount: number;
  lastError: string | null;
}

interface BotHealthPanelProps {
  userId: string;
  compact?: boolean;
}

export function BotHealthPanel({ userId, compact = false }: BotHealthPanelProps) {
  const { symbol } = useCurrency();
  const [engineStats, setEngineStats] = useState<EngineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionInfo, setSessionInfo] = useState<{
    botStatus: string;
    engineRunning: boolean;
    settings: Record<string, unknown>;
    todayStats: { betsPlaced: number; totalStake: number; profit: number };
  } | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/bot/control");
      if (res.ok) {
        const data = await res.json();
        setEngineStats(data.engineStats || null);
        setSessionInfo({
          botStatus: data.botStatus,
          engineRunning: data.engineRunning || false,
          settings: data.settings || {},
          todayStats: data.todayStats || { betsPlaced: 0, totalStake: 0, profit: 0 },
        });
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [userId]);

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Loading engine status...
          </div>
        </CardContent>
      </Card>
    );
  }

  const isRunning = sessionInfo?.engineRunning || false;
  const uptime = engineStats?.startedAt
    ? Math.round((Date.now() - new Date(engineStats.startedAt).getTime()) / 60000)
    : 0;

  const scanRate = engineStats?.totalScans && uptime > 0
    ? (engineStats.totalScans / uptime).toFixed(1)
    : "0";

  const profitRate = engineStats?.totalStakeUsed && engineStats.totalStakeUsed > 0
    ? ((engineStats.totalProfit / engineStats.totalStakeUsed) * 100).toFixed(1)
    : "0";

  const healthScore = isRunning
    ? Math.max(0, 100 - (engineStats?.errorCount || 0) * 10)
    : 0;

  const healthColor = healthScore >= 80 ? "text-emerald-400"
    : healthScore >= 50 ? "text-amber-400"
    : "text-red-400";

  const healthBg = healthScore >= 80 ? "bg-emerald-400/10"
    : healthScore >= 50 ? "bg-amber-400/10"
    : "bg-red-400/10";

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${isRunning ? "bg-red-500/10" : "bg-secondary/50"}`}>
          <Activity className={`h-4 w-4 ${isRunning ? "text-red-500 animate-pulse" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Engine</span>
            <Badge className={`text-[10px] ${
              isRunning ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-secondary text-muted-foreground"
            }`}>
              {isRunning ? "Live" : "Off"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {isRunning
              ? `${engineStats?.totalScans || 0} scans, ${engineStats?.totalBetsPlaced || 0} bets`
              : "Bot engine not running"
            }
          </p>
        </div>
        {engineStats?.lastScanAt && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {new Date(engineStats.lastScanAt).toLocaleTimeString()}
          </span>
        )}
      </div>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4 text-primary" />
            Bot Engine Health
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className={`text-xs ${
              isRunning ? "bg-red-500/10 text-red-400 border-red-500/20 animate-pulse" : "bg-secondary text-muted-foreground"
            }`}>
              <Activity className="h-3 w-3 mr-1" />
              {isRunning ? "Running" : "Stopped"}
            </Badge>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchStatus}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Health Score */}
        <div className="flex items-center gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${healthBg}`}>
            {healthScore >= 80 ? (
              <CheckCircle className={`h-6 w-6 ${healthColor}`} />
            ) : healthScore >= 50 ? (
              <AlertTriangle className={`h-6 w-6 ${healthColor}`} />
            ) : (
              <AlertTriangle className={`h-6 w-6 ${healthColor}`} />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Health Score</p>
            <div className="flex items-center gap-2 mt-1">
              <Progress value={healthScore} className="h-2 flex-1" />
              <span className={`text-sm font-bold ${healthColor}`}>{healthScore}%</span>
            </div>
          </div>
        </div>

        {/* Engine Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-secondary/30 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Radio className="h-3 w-3 text-red-400" />
              <span className="text-[10px] text-muted-foreground">Total Scans</span>
            </div>
            <p className="text-lg font-bold text-foreground">{engineStats?.totalScans || 0}</p>
            <p className="text-[10px] text-muted-foreground">{scanRate} scans/min</p>
          </div>

          <div className="rounded-lg bg-secondary/30 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="h-3 w-3 text-primary" />
              <span className="text-[10px] text-muted-foreground">Bets Placed</span>
            </div>
            <p className="text-lg font-bold text-foreground">{engineStats?.totalBetsPlaced || 0}</p>
            <p className="text-[10px] text-muted-foreground">{symbol}{(engineStats?.totalStakeUsed || 0).toFixed(0)} staked</p>
          </div>

          <div className="rounded-lg bg-secondary/30 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              {(engineStats?.totalProfit || 0) >= 0 ? (
                <TrendingUp className="h-3 w-3 text-emerald-400" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-400" />
              )}
              <span className="text-[10px] text-muted-foreground">Profit</span>
            </div>
            <p className={`text-lg font-bold ${(engineStats?.totalProfit || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {symbol}{(engineStats?.totalProfit || 0).toFixed(2)}
            </p>
            <p className="text-[10px] text-muted-foreground">{profitRate}% ROI</p>
          </div>

          <div className="rounded-lg bg-secondary/30 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Shield className="h-3 w-3 text-amber-400" />
              <span className="text-[10px] text-muted-foreground">Errors</span>
            </div>
            <p className={`text-lg font-bold ${(engineStats?.errorCount || 0) > 0 ? "text-amber-400" : "text-foreground"}`}>
              {engineStats?.errorCount || 0}
            </p>
            <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">
              {engineStats?.lastError || "No errors"}
            </p>
          </div>
        </div>

        {/* Timing Info */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Uptime
            </span>
            <span className="text-foreground font-medium">
              {uptime < 60 ? `${uptime}m` : `${Math.floor(uptime / 60)}h ${uptime % 60}m`}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <Brain className="h-3 w-3" /> Scan Interval
            </span>
            <span className="text-foreground font-medium">
              {engineStats?.scanIntervalSec || 30}s
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <Activity className="h-3 w-3" /> Last Scan
            </span>
            <span className="text-foreground font-medium">
              {engineStats?.lastScanAt
                ? new Date(engineStats.lastScanAt).toLocaleTimeString()
                : "Never"
              }
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <Zap className="h-3 w-3" /> Last Bet
            </span>
            <span className="text-foreground font-medium">
              {engineStats?.lastBetAt
                ? new Date(engineStats.lastBetAt).toLocaleTimeString()
                : "Never"
              }
            </span>
          </div>
        </div>

        {/* Today's Stats */}
        {sessionInfo?.todayStats && (
          <div className="rounded-lg border border-border p-3 bg-secondary/20">
            <p className="text-xs font-medium text-muted-foreground mb-2">Today</p>
            <div className="flex items-center justify-between">
              <div className="text-center">
                <p className="text-sm font-bold text-foreground">{sessionInfo.todayStats.betsPlaced}</p>
                <p className="text-[10px] text-muted-foreground">Bets</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-foreground">{symbol}{sessionInfo.todayStats.totalStake.toFixed(0)}</p>
                <p className="text-[10px] text-muted-foreground">Stake</p>
              </div>
              <div className="text-center">
                <p className={`text-sm font-bold ${sessionInfo.todayStats.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {symbol}{sessionInfo.todayStats.profit.toFixed(2)}
                </p>
                <p className="text-[10px] text-muted-foreground">Profit</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
