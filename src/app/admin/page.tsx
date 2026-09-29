"use client";

import { useFetch } from "@/lib/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  DollarSign,
  Zap,
  Activity,
  TrendingUp,
  Settings,
  Save,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Brain,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useCurrency } from "@/components/currency-provider";
import { useToast } from "@/components/ui/toast";

interface AdminSettings {
  id: string;
  defaultCommissionRate: number;
  minCommissionRate: number;
  maxCommissionRate: number;
  platformName: string;
  maintenanceMode: boolean;
  maxUsers: number;
  autoApproveAccounts: boolean;
}

interface ShadowEvaluationResponse {
  mode: "baseline" | "shadow" | "active";
  evaluation: {
    settledMatches: number;
    candidateModelVersion: string | null;
    baseline: {
      logLoss: number | null;
      brier: number | null;
      rps: number | null;
      ece: number | null;
      accuracy: number | null;
      homeGoalMae: number | null;
      awayGoalMae: number | null;
    };
    candidate: {
      logLoss: number | null;
      brier: number | null;
      rps: number | null;
      ece: number | null;
      accuracy: number | null;
      homeGoalMae: number | null;
      awayGoalMae: number | null;
    };
    deltas: {
      logLoss: number | null;
      brier: number | null;
      rps: number | null;
      ece: number | null;
    };
    interpretation: {
      candidateLogLossBetter: boolean | null;
      candidateBrierBetter: boolean | null;
      minimumUsefulSampleReached: boolean;
    };
  };
}

interface MarketHistoryReadiness {
  generatedAt: string;
  upcomingMatches: number;
  withConsensus: number;
  withTwoSnapshots: number;
  history6h: number;
  history24h: number;
  history48h: number;
  coverage: {
    consensus: number;
    twoSnapshots: number;
    history6h: number;
    history24h: number;
    history48h: number;
  };
  researchReady: boolean;
  byLeague: Array<{
    league: string;
    matches: number;
    withConsensus: number;
    withTwoSnapshots: number;
    history24h: number;
  }>;
}

interface ProviderReadiness {
  providers: {
    oddsApi: boolean;
    apiFootball: boolean;
    sportmonks: boolean;
  };
  ml: {
    serviceUrlConfigured: boolean;
    serviceReachable: boolean;
    modelConfigured: boolean;
    modelLoaded: boolean;
    modelVersion: string | null;
    reason: string | null;
    modelMode: string;
  };
}

interface Stats {
  totalUsers: number;
  totalBets: number;
  totalCommission: number;
  totalBetVolume: number;
  wonBets: number;
  lostBets: number;
  pendingBets: number;
  totalProfit: number;
  totalLoss: number;
  totalCommissionPaid: number;
  winRate: number;
  liveMatches: number;
  upcomingMatches: number;
  adminSettings: AdminSettings | null;
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    balance: number;
    totalProfit: number;
    totalLoss: number;
    commissionPaid: number;
    createdAt: string;
  }>;
}

export default function AdminPage() {
  const { symbol } = useCurrency();
  const { data: stats, loading } = useFetch<Stats>("/api/stats", {
    totalUsers: 0,
    totalBets: 0,
    totalCommission: 0,
    totalBetVolume: 0,
    wonBets: 0,
    lostBets: 0,
    pendingBets: 0,
    totalProfit: 0,
    totalLoss: 0,
    totalCommissionPaid: 0,
    winRate: 0,
    liveMatches: 0,
    upcomingMatches: 0,
    adminSettings: null,
    users: [],
  });
  const { data: shadow } = useFetch<ShadowEvaluationResponse>(
    "/api/admin/ml/shadow",
    {
      mode: "baseline",
      evaluation: {
        settledMatches: 0,
        candidateModelVersion: null,
        baseline: {
          logLoss: null, brier: null, rps: null, ece: null, accuracy: null,
          homeGoalMae: null, awayGoalMae: null,
        },
        candidate: {
          logLoss: null, brier: null, rps: null, ece: null, accuracy: null,
          homeGoalMae: null, awayGoalMae: null,
        },
        deltas: { logLoss: null, brier: null, rps: null, ece: null },
        interpretation: {
          candidateLogLossBetter: null,
          candidateBrierBetter: null,
          minimumUsefulSampleReached: false,
        },
      },
    }
  );

  const { data: marketHistory } = useFetch<MarketHistoryReadiness>(
    "/api/admin/ml/market-history",
    {
      generatedAt: "",
      upcomingMatches: 0,
      withConsensus: 0,
      withTwoSnapshots: 0,
      history6h: 0,
      history24h: 0,
      history48h: 0,
      coverage: {
        consensus: 0,
        twoSnapshots: 0,
        history6h: 0,
        history24h: 0,
        history48h: 0,
      },
      researchReady: false,
      byLeague: [],
    }
  );

  const { data: providerReadiness } = useFetch<ProviderReadiness>(
    "/api/admin/ml/providers",
    {
      providers: { oddsApi: false, apiFootball: false, sportmonks: false },
      ml: {
        serviceUrlConfigured: false,
        serviceReachable: false,
        modelConfigured: false,
        modelLoaded: false,
        modelVersion: null,
        reason: null,
        modelMode: "baseline",
      },
    }
  );

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commissionRate, setCommissionRate] = useState(10);
  const [researchAction, setResearchAction] = useState<"stats" | "elo" | null>(null);
  const [researchLeague, setResearchLeague] = useState("Premier League");

  // Sync local commissionRate state when adminSettings loads
  useEffect(() => {
    if (stats.adminSettings) {
      setCommissionRate(Math.round(stats.adminSettings.defaultCommissionRate * 100));
    }
  }, [stats.adminSettings]);

  const { addToast } = useToast();

  const handleStatsBackfill = async () => {
    setResearchAction("stats");
    try {
      const res = await fetch("/api/admin/ml/stats-backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fixture-stat backfill failed");
      addToast(
        "success",
        `Processed ${data.matchesProcessed ?? 0} matches and stored ${data.snapshotsUpserted ?? 0} team-stat snapshots`
      );
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        addToast("warning", `${data.errors.length} fixture-stat requests need review`);
      }
    } catch (err) {
      addToast(
        "error",
        err instanceof Error ? err.message : "Fixture-stat backfill failed"
      );
    } finally {
      setResearchAction(null);
    }
  };

  const handleEloRebuild = async () => {
    const league = researchLeague.trim();
    if (!league) {
      addToast("error", "Enter the exact league name first");
      return;
    }

    setResearchAction("elo");
    try {
      const res = await fetch("/api/admin/ml/elo-rebuild", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport: "football", league }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ELO rebuild failed");
      addToast(
        "success",
        `Rebuilt ${data.snapshotsCreated ?? 0} causal ELO snapshots from ${data.matchesProcessed ?? 0} finished matches`
      );
    } catch (err) {
      addToast(
        "error",
        err instanceof Error ? err.message : "ELO rebuild failed"
      );
    } finally {
      setResearchAction(null);
    }
  };

  const handleSaveCommission = async () => {
    setSaving(true);
    setError(null);
    try {
      const rateDecimal = commissionRate / 100;
      const res = await fetch("/api/admin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultCommissionRate: rateDecimal }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save commission rate");
      }

      // Also propagate to all users' settings
      const propagateRes = await fetch("/api/admin/commission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionRate: rateDecimal }),
      });

      if (!propagateRes.ok) {
        // Non-fatal — admin settings saved, but propagation had issues
        console.warn("Commission propagation had issues");
      }

      setSaved(true);
      addToast("success", `Commission rate updated to ${commissionRate}% for all users`);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setError(msg);
      addToast("error", msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading admin panel...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Platform overview and management
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Users</p>
              <p className="text-lg font-bold text-foreground">{stats.totalUsers}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-400/10">
              <Zap className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Bets</p>
              <p className="text-lg font-bold text-foreground">{stats.totalBets}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-400/10">
              <DollarSign className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Commission Earned</p>
              <p className="text-lg font-bold text-emerald-400">
                {symbol}{stats.totalCommission.toFixed(2)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-400/10">
              <TrendingUp className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Bet Volume</p>
              <p className="text-lg font-bold text-foreground">
                {symbol}{stats.totalBetVolume.toFixed(2)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Won Bets</p>
            <p className="text-lg font-bold text-emerald-400">{stats.wonBets}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Lost Bets</p>
            <p className="text-lg font-bold text-red-400">{stats.lostBets}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-lg font-bold text-amber-400">{stats.pendingBets}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Platform Win Rate</p>
            <p className="text-lg font-bold text-primary">{stats.winRate}%</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            Platform Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-400" />
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="text-sm font-medium text-emerald-400">Operational</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Live Matches</p>
                <p className="text-sm font-medium text-foreground">{stats.liveMatches}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <div>
                <p className="text-xs text-muted-foreground">Upcoming</p>
                <p className="text-sm font-medium text-foreground">{stats.upcomingMatches}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {stats.adminSettings?.maintenanceMode ? (
                <AlertTriangle className="h-4 w-4 text-red-400" />
              ) : (
                <CheckCircle className="h-4 w-4 text-emerald-400" />
              )}
              <div>
                <p className="text-xs text-muted-foreground">Maintenance</p>
                <p className={`text-sm font-medium ${stats.adminSettings?.maintenanceMode ? "text-red-400" : "text-emerald-400"}`}>
                  {stats.adminSettings?.maintenanceMode ? "Active" : "None"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-4 w-4 text-primary" />
              Model Research
            </CardTitle>
            <Badge
              variant="secondary"
              className={
                shadow.mode === "active"
                  ? "bg-emerald-400/10 text-emerald-400"
                  : shadow.mode === "shadow"
                    ? "bg-amber-400/10 text-amber-400"
                    : "bg-secondary text-muted-foreground"
              }
            >
              {shadow.mode.toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-lg bg-secondary/50 p-3">
              <p className="text-xs text-muted-foreground">Settled Shadow Matches</p>
              <p className="text-xl font-bold text-foreground">
                {shadow.evaluation.settledMatches}
              </p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-3">
              <p className="text-xs text-muted-foreground">Candidate</p>
              <p className="text-sm font-semibold text-foreground truncate">
                {shadow.evaluation.candidateModelVersion || "Not available"}
              </p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-3">
              <p className="text-xs text-muted-foreground">Candidate Log Loss</p>
              <p className="text-xl font-bold text-foreground">
                {shadow.evaluation.candidate.logLoss == null
                  ? "—"
                  : shadow.evaluation.candidate.logLoss.toFixed(4)}
              </p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-3">
              <p className="text-xs text-muted-foreground">Baseline Log Loss</p>
              <p className="text-xl font-bold text-foreground">
                {shadow.evaluation.baseline.logLoss == null
                  ? "—"
                  : shadow.evaluation.baseline.logLoss.toFixed(4)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Brier comparison</p>
              <p className="mt-1 text-foreground">
                Candidate {shadow.evaluation.candidate.brier == null ? "—" : shadow.evaluation.candidate.brier.toFixed(4)}
                {" · "}
                Baseline {shadow.evaluation.baseline.brier == null ? "—" : shadow.evaluation.baseline.brier.toFixed(4)}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Accuracy comparison</p>
              <p className="mt-1 text-foreground">
                Candidate {shadow.evaluation.candidate.accuracy == null ? "—" : `${Math.round(shadow.evaluation.candidate.accuracy * 100)}%`}
                {" · "}
                Baseline {shadow.evaluation.baseline.accuracy == null ? "—" : `${Math.round(shadow.evaluation.baseline.accuracy * 100)}%`}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Research sample</p>
              <p className={
                `mt-1 font-medium ${shadow.evaluation.interpretation.minimumUsefulSampleReached ? "text-emerald-400" : "text-amber-400"}`
              }>
                {shadow.evaluation.interpretation.minimumUsefulSampleReached
                  ? "Minimum sample reached"
                  : `${Math.max(0, 200 - shadow.evaluation.settledMatches)} more settled matches to 200`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Candidate RPS</p>
              <p className="mt-1 font-semibold text-foreground">
                {shadow.evaluation.candidate.rps == null ? "—" : shadow.evaluation.candidate.rps.toFixed(4)}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Calibration error (ECE)</p>
              <p className="mt-1 font-semibold text-foreground">
                {shadow.evaluation.candidate.ece == null ? "—" : shadow.evaluation.candidate.ece.toFixed(4)}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Home-goal MAE</p>
              <p className="mt-1 font-semibold text-foreground">
                {shadow.evaluation.candidate.homeGoalMae == null ? "—" : shadow.evaluation.candidate.homeGoalMae.toFixed(3)}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Away-goal MAE</p>
              <p className="mt-1 font-semibold text-foreground">
                {shadow.evaluation.candidate.awayGoalMae == null ? "—" : shadow.evaluation.candidate.awayGoalMae.toFixed(3)}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">Odds-movement corpus</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Causal consensus snapshots collected before kickoff for the next research feature family.
                </p>
              </div>
              <Badge
                variant="secondary"
                className={
                  marketHistory.researchReady
                    ? "bg-emerald-400/10 text-emerald-400"
                    : "bg-amber-400/10 text-amber-400"
                }
              >
                {marketHistory.researchReady ? "RESEARCH READY" : "COLLECTING"}
              </Badge>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-lg bg-background/40 p-3">
                <p className="text-xs text-muted-foreground">Fresh consensus</p>
                <p className="text-lg font-bold text-foreground">
                  {marketHistory.withConsensus}/{marketHistory.upcomingMatches}
                </p>
              </div>
              <div className="rounded-lg bg-background/40 p-3">
                <p className="text-xs text-muted-foreground">2+ snapshots</p>
                <p className="text-lg font-bold text-foreground">
                  {Math.round(marketHistory.coverage.twoSnapshots * 100)}%
                </p>
              </div>
              <div className="rounded-lg bg-background/40 p-3">
                <p className="text-xs text-muted-foreground">6h history</p>
                <p className="text-lg font-bold text-foreground">
                  {Math.round(marketHistory.coverage.history6h * 100)}%
                </p>
              </div>
              <div className="rounded-lg bg-background/40 p-3">
                <p className="text-xs text-muted-foreground">24h history</p>
                <p className="text-lg font-bold text-foreground">
                  {Math.round(marketHistory.coverage.history24h * 100)}%
                </p>
              </div>
            </div>
            {marketHistory.byLeague.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {marketHistory.byLeague.map((item) => (
                  <Badge key={item.league} variant="outline">
                    {item.league}: {item.history24h}/{item.matches} with 24h
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">Licensed production data</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Secret-safe readiness for the commercial historical-training path.
                </p>
              </div>
              <Badge variant="secondary">
                {providerReadiness.ml.modelMode.toUpperCase()}
              </Badge>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  label: "Sportmonks",
                  ready: providerReadiness.providers.sportmonks,
                  readyLabel: "Configured",
                  pendingLabel: "Not configured",
                },
                {
                  label: "The Odds API",
                  ready: providerReadiness.providers.oddsApi,
                  readyLabel: "Configured",
                  pendingLabel: "Not configured",
                },
                {
                  label: "API-Football",
                  ready: providerReadiness.providers.apiFootball,
                  readyLabel: "Configured",
                  pendingLabel: "Not configured",
                },
                {
                  label: "ML Service",
                  ready: providerReadiness.ml.serviceReachable,
                  readyLabel: "Reachable",
                  pendingLabel: "Unreachable",
                },
                {
                  label: "Model",
                  ready: providerReadiness.ml.modelLoaded,
                  readyLabel: "Loaded",
                  pendingLabel: "Not promoted",
                },
              ].map((item) => (
                <div key={item.label} className="rounded-lg bg-background/40 p-3">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className={`mt-1 text-sm font-semibold ${item.ready ? "text-emerald-400" : "text-amber-400"}`}>
                    {item.ready ? item.readyLabel : item.pendingLabel}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>
                ML service: {providerReadiness.ml.serviceReachable ? "reachable" : "unreachable"}
              </span>
              <span>·</span>
              <span>
                Model: {providerReadiness.ml.modelVersion || "none promoted"}
              </span>
              {providerReadiness.ml.reason && (
                <>
                  <span>·</span>
                  <span>{providerReadiness.ml.reason}</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Research data maintenance</p>
              <p className="text-xs text-muted-foreground mt-1">
                Fixture-stat backfill calls API-Football and may consume provider quota. ELO rebuild uses only stored finished matches and consumes no provider quota.
              </p>
            </div>
            <div className="flex flex-col lg:flex-row gap-3">
              <Button
                variant="outline"
                onClick={handleStatsBackfill}
                disabled={researchAction !== null}
                className="justify-center"
              >
                {researchAction === "stats" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Activity className="h-4 w-4" />
                )}
                Backfill 20 Fixture Stats
              </Button>
              <div className="flex flex-1 gap-2">
                <Input
                  value={researchLeague}
                  onChange={(event) => setResearchLeague(event.target.value)}
                  placeholder="Exact league name, e.g. Premier League"
                  className="bg-secondary border-border"
                />
                <Button
                  variant="outline"
                  onClick={handleEloRebuild}
                  disabled={researchAction !== null || !researchLeague.trim()}
                  className="whitespace-nowrap"
                >
                  {researchAction === "elo" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <TrendingUp className="h-4 w-4" />
                  )}
                  Rebuild ELO
                </Button>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Shadow results are research evidence only. Candidate output does not become user-facing unless the configured mode is explicitly changed to active after validation.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4 text-amber-400" />
            Commission Rate Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <Label className="text-sm font-medium">Default Commission Rate</Label>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  type="number"
                  min={stats.adminSettings?.minCommissionRate ? Math.round(stats.adminSettings.minCommissionRate * 100) : 5}
                  max={stats.adminSettings?.maxCommissionRate ? Math.round(stats.adminSettings.maxCommissionRate * 100) : 25}
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(parseInt(e.target.value) || 10)}
                  className="bg-secondary border-border w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Range: {stats.adminSettings?.minCommissionRate ? Math.round(stats.adminSettings.minCommissionRate * 100) : 5}% - {stats.adminSettings?.maxCommissionRate ? Math.round(stats.adminSettings.maxCommissionRate * 100) : 25}%
              </p>
            </div>
            <div className="flex flex-col items-center gap-2 rounded-lg bg-secondary/50 p-4 self-start sm:self-auto">
              <span className="text-3xl font-bold text-amber-400">{commissionRate}%</span>
              <span className="text-xs text-muted-foreground">Commission Rate</span>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/80"
            onClick={handleSaveCommission}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Saving..." : saved ? "Saved!" : "Save Commission Rate"}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            Users
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground">Name</TableHead>
                  <TableHead className="text-muted-foreground">Email</TableHead>
                  <TableHead className="text-muted-foreground">Role</TableHead>
                  <TableHead className="text-muted-foreground">Profit/Loss</TableHead>
                  <TableHead className="text-muted-foreground">Commission</TableHead>
                  <TableHead className="text-muted-foreground">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.users.map((user) => (
                  <TableRow key={user.id} className="border-border">
                    <TableCell className="text-sm font-medium text-foreground">
                      {user.name}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          user.role === "admin"
                            ? "bg-primary/10 text-primary"
                            : "bg-secondary text-muted-foreground"
                        }
                      >
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-sm font-medium ${
                          user.totalProfit - user.totalLoss >= 0
                            ? "text-emerald-400"
                            : "text-red-400"
                        }`}
                      >
                        {symbol}{(user.totalProfit - user.totalLoss).toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-amber-400">
                      {symbol}{user.commissionPaid.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      {symbol}{user.balance.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
