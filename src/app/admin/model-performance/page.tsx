"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePolling } from "@/lib/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  ArrowLeft,
  Brain,
  CheckCircle,
  Database,
  RefreshCw,
  ShieldCheck,
  Target,
  TrendingUp,
} from "lucide-react";

type Metrics = {
  samples: number;
  winnerAccuracy: number | null;
  brier: number | null;
  logLoss: number | null;
  homeGoalMae: number | null;
  awayGoalMae: number | null;
  teamGoalMae: number | null;
  totalGoalMae: number | null;
  exactScoreAccuracy: number | null;
  over25Accuracy: number | null;
  over25Samples: number;
  bttsAccuracy: number | null;
  bttsSamples: number;
  avgConfidence: number | null;
  avgDataCompleteness: number | null;
  confidenceAccuracyGap: number | null;
};

type StageKey = "pre_match" | "live_20" | "live_60" | "live_latest";

type Snapshot = {
  snapshotId: string;
  stage: StageKey;
  asOf: string;
  minute: number | null;
  predictedLabel: string;
  predictedProbability: number;
  correctWinner: boolean;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  exactScorePredicted: { home: number; away: number } | null;
  over25Probability: number | null;
  bttsProbability: number | null;
  confidence: number;
  dataCompleteness: number;
  modelVersion: string;
  resultMode: string;
};

type Timeline = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  actualScore: string;
  actualOutcome: "home" | "draw" | "away";
  stages: Partial<Record<StageKey, Snapshot>>;
};

type Scorecard = {
  generatedAt: string;
  windowDays: number;
  snapshotCounts: {
    labeledRawSnapshots: number;
    canonicalSnapshots: number;
    settledMatches: number;
  };
  headline: Metrics;
  assessment: {
    level: string;
    label: string;
    note: string;
  };
  stages: Record<StageKey, Metrics>;
  models: Array<{
    modelVersion: string;
    resultMode: string;
    source: string;
    metrics: Metrics;
  }>;
  availableModels: Array<{
    modelVersion: string;
    resultMode: string;
    source: string;
  }>;
  timelines: Timeline[];
};

const EMPTY_METRICS: Metrics = {
  samples: 0,
  winnerAccuracy: null,
  brier: null,
  logLoss: null,
  homeGoalMae: null,
  awayGoalMae: null,
  teamGoalMae: null,
  totalGoalMae: null,
  exactScoreAccuracy: null,
  over25Accuracy: null,
  over25Samples: 0,
  bttsAccuracy: null,
  bttsSamples: 0,
  avgConfidence: null,
  avgDataCompleteness: null,
  confidenceAccuracyGap: null,
};

const EMPTY_SCORECARD: Scorecard = {
  generatedAt: "",
  windowDays: 30,
  snapshotCounts: {
    labeledRawSnapshots: 0,
    canonicalSnapshots: 0,
    settledMatches: 0,
  },
  headline: EMPTY_METRICS,
  assessment: {
    level: "insufficient",
    label: "Insufficient sample",
    note: "Waiting for settled prediction evidence.",
  },
  stages: {
    pre_match: EMPTY_METRICS,
    live_20: EMPTY_METRICS,
    live_60: EMPTY_METRICS,
    live_latest: EMPTY_METRICS,
  },
  models: [],
  availableModels: [],
  timelines: [],
};

const STAGE_LABELS: Record<StageKey, string> = {
  pre_match: "Pre-match",
  live_20: "Around 20′",
  live_60: "Around 60′",
  live_latest: "Latest live",
};

function percent(value: number | null) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function decimal(value: number | null, digits = 3) {
  return value == null ? "—" : value.toFixed(digits);
}

function predictionText(snapshot: Snapshot | undefined) {
  if (!snapshot) return "—";
  const score = snapshot.exactScorePredicted
    ? ` · ${snapshot.exactScorePredicted.home}-${snapshot.exactScorePredicted.away}`
    : "";
  return `${snapshot.predictedLabel} ${percent(snapshot.predictedProbability)}${score}`;
}

export default function ModelPerformancePage() {
  const [days, setDays] = useState("30");
  const [modelVersion, setModelVersion] = useState("all");

  const url = useMemo(() => {
    const params = new URLSearchParams({ days });
    if (modelVersion !== "all") {
      params.set("modelVersion", modelVersion);
    }
    return "/api/admin/ml/performance?" + params.toString();
  }, [days, modelVersion]);

  const { data, loading, refetch } = usePolling<Scorecard>(
    url,
    60_000,
    EMPTY_SCORECARD
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin">
                <ArrowLeft className="h-4 w-4" />
                Admin
              </Link>
            </Button>
            <Badge variant="outline" className="border-primary/30 text-primary">
              <ShieldCheck className="mr-1 h-3 w-3" />
              Admin
            </Badge>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-foreground">
            Prediction Performance
          </h1>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            Evidence-based scorecard comparing stored AI forecasts with
            authoritative finished-match results. Small samples are flagged and
            are never treated as promotion evidence.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[125px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
              <SelectItem value="3650">All evidence</SelectItem>
            </SelectContent>
          </Select>

          <Select value={modelVersion} onValueChange={setModelVersion}>
            <SelectTrigger className="w-[210px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All models</SelectItem>
              {Array.from(
                new Set(data.availableModels.map((row) => row.modelVersion))
              ).map((version) => (
                <SelectItem key={version} value={version}>
                  {version}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={refetch}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Database className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="font-medium">{data.assessment.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.assessment.note}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">
                  Settled matches
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {data.snapshotCounts.settledMatches}
                </p>
              </div>
              <Database className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">
                  Pre-match winner accuracy
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {percent(data.headline.winnerAccuracy)}
                </p>
              </div>
              <Target className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Brier score</p>
                <p className="mt-1 text-2xl font-bold">
                  {decimal(data.headline.brier)}
                </p>
              </div>
              <Brain className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">
                  Total-goals MAE
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {decimal(data.headline.totalGoalMae, 2)}
                </p>
              </div>
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            Performance by prediction stage
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-3 pr-4 font-medium">Stage</th>
                <th className="pb-3 pr-4 font-medium">Samples</th>
                <th className="pb-3 pr-4 font-medium">Winner</th>
                <th className="pb-3 pr-4 font-medium">Brier</th>
                <th className="pb-3 pr-4 font-medium">Log loss</th>
                <th className="pb-3 pr-4 font-medium">Goals MAE</th>
                <th className="pb-3 pr-4 font-medium">Exact score</th>
                <th className="pb-3 pr-4 font-medium">Over 2.5</th>
                <th className="pb-3 pr-4 font-medium">BTTS</th>
                <th className="pb-3 font-medium">Confidence gap</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(STAGE_LABELS) as StageKey[]).map((stage) => {
                const metric = data.stages[stage];
                return (
                  <tr key={stage} className="border-b border-border/60">
                    <td className="py-3 pr-4 font-medium">
                      {STAGE_LABELS[stage]}
                    </td>
                    <td className="py-3 pr-4">{metric.samples}</td>
                    <td className="py-3 pr-4">
                      {percent(metric.winnerAccuracy)}
                    </td>
                    <td className="py-3 pr-4">{decimal(metric.brier)}</td>
                    <td className="py-3 pr-4">{decimal(metric.logLoss)}</td>
                    <td className="py-3 pr-4">
                      {decimal(metric.totalGoalMae, 2)}
                    </td>
                    <td className="py-3 pr-4">
                      {percent(metric.exactScoreAccuracy)}
                    </td>
                    <td className="py-3 pr-4">
                      {percent(metric.over25Accuracy)}
                      {metric.over25Samples > 0 && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({metric.over25Samples})
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {percent(metric.bttsAccuracy)}
                      {metric.bttsSamples > 0 && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({metric.bttsSamples})
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      {metric.confidenceAccuracyGap == null
                        ? "—"
                        : `${metric.confidenceAccuracyGap >= 0 ? "+" : ""}${Math.round(metric.confidenceAccuracyGap * 100)} pp`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Model breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.models.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No settled pre-match model evidence in this window yet.
              </p>
            ) : (
              data.models.map((model) => (
                <div
                  key={`${model.modelVersion}-${model.resultMode}-${model.source}`}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{model.modelVersion}</p>
                      <p className="text-xs text-muted-foreground">
                        {model.resultMode} · {model.source}
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {model.metrics.samples} samples
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Winner</p>
                      <p className="font-semibold">
                        {percent(model.metrics.winnerAccuracy)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Brier</p>
                      <p className="font-semibold">
                        {decimal(model.metrics.brier)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Goals MAE</p>
                      <p className="font-semibold">
                        {decimal(model.metrics.totalGoalMae, 2)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Evidence health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-sm text-muted-foreground">
                Raw settled snapshots
              </span>
              <span className="font-semibold">
                {data.snapshotCounts.labeledRawSnapshots}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-sm text-muted-foreground">
                Canonical stage snapshots
              </span>
              <span className="font-semibold">
                {data.snapshotCounts.canonicalSnapshots}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-sm text-muted-foreground">
                Average confidence
              </span>
              <span className="font-semibold">
                {percent(data.headline.avgConfidence)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-sm text-muted-foreground">
                Average data coverage
              </span>
              <span className="font-semibold">
                {percent(data.headline.avgDataCompleteness)}
              </span>
            </div>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              <CheckCircle className="mr-1 inline h-3.5 w-3.5 text-primary" />
              Lower Brier, log loss and goals MAE are better. Accuracy and
              market hit rates are higher-is-better. These metrics are
              observational until the formal chronological/walk-forward gates
              are satisfied.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Recent prediction timelines
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {data.timelines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Settled prediction timelines will appear here as evidence is
              captured.
            </p>
          ) : (
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Match</th>
                  <th className="pb-3 pr-4 font-medium">Pre-match</th>
                  <th className="pb-3 pr-4 font-medium">~20′</th>
                  <th className="pb-3 pr-4 font-medium">~60′</th>
                  <th className="pb-3 pr-4 font-medium">Latest live</th>
                  <th className="pb-3 font-medium">Actual</th>
                </tr>
              </thead>
              <tbody>
                {data.timelines.map((row) => (
                  <tr
                    key={`${row.matchId}-${row.kickoffAt}`}
                    className="border-b border-border/60"
                  >
                    <td className="py-3 pr-4">
                      <p className="font-medium">
                        {row.homeTeam} vs {row.awayTeam}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(row.kickoffAt).toLocaleString()}
                      </p>
                    </td>
                    {(
                      [
                        "pre_match",
                        "live_20",
                        "live_60",
                        "live_latest",
                      ] as StageKey[]
                    ).map((stage) => {
                      const snapshot = row.stages[stage];
                      return (
                        <td key={stage} className="py-3 pr-4">
                          <p
                            className={
                              snapshot?.correctWinner
                                ? "text-emerald-400"
                                : snapshot
                                  ? "text-red-400"
                                  : "text-muted-foreground"
                            }
                          >
                            {predictionText(snapshot)}
                          </p>
                          {snapshot && (
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {snapshot.minute != null
                                ? `${snapshot.minute}′ · `
                                : ""}
                              conf {percent(snapshot.confidence)}
                            </p>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-3">
                      <Badge
                        className={
                          row.actualOutcome === "home"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : row.actualOutcome === "away"
                              ? "bg-blue-500/15 text-blue-400"
                              : "bg-amber-500/15 text-amber-400"
                        }
                      >
                        {row.actualScore}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {loading
            ? "Updating scorecard…"
            : data.generatedAt
              ? `Generated ${new Date(data.generatedAt).toLocaleString()}`
              : "Waiting for evidence"}
        </span>
        <span>{data.windowDays}-day evidence window</span>
      </div>
    </div>
  );
}
