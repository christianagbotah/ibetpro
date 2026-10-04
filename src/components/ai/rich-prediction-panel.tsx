"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, Database, Goal, ShieldCheck, TrendingUp } from "lucide-react";

interface RichPrediction {
  resultMode: "baseline" | "market-consensus" | "selective-model";
  modelVersion: string;
  source: string;
  generatedAt: string;
  expectedGoals: { home: number; away: number; total: number };
  result: { homeWin: number; draw: number; awayWin: number };
  scorelines: Array<{ home: number; away: number; probability: number }>;
  markets: Array<{ key: string; label: string; probability: number; fairOdds: number | null }>;
  confidence: number;
  dataCompleteness: number;
  warnings: string[];
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function RichPredictionPanel({
  prediction,
  homeTeam,
  awayTeam,
}: {
  prediction: RichPrediction;
  homeTeam: string;
  awayTeam: string;
}) {
  const goalMarkets = prediction.markets.filter((m) =>
    ["over-1.5", "over-2.5", "under-2.5", "over-3.5", "btts-yes", "btts-no"].includes(m.key)
  );
  const teamMarkets = prediction.markets.filter((m) =>
    ["home-over-0.5", "home-over-1.5", "away-over-0.5", "away-over-1.5"].includes(m.key)
  );

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-card">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-4 w-4 text-primary" />
              Model Forecast
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant="secondary"
                className={
                  prediction.resultMode === "selective-model"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : prediction.resultMode === "market-consensus"
                      ? "bg-amber-500/10 text-amber-400"
                      : undefined
                }
              >
                {prediction.resultMode === "selective-model"
                  ? "Selective model edge"
                  : prediction.resultMode === "market-consensus"
                    ? "Market consensus"
                    : "Baseline"}
              </Badge>
              <Badge variant="secondary">{prediction.modelVersion}</Badge>
              <Badge variant="outline">{prediction.source}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-3 gap-2">
            {[
              [homeTeam, prediction.result.homeWin],
              ["Draw", prediction.result.draw],
              [awayTeam, prediction.result.awayWin],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-border bg-secondary/30 p-3 text-center">
                <p className="truncate text-xs text-muted-foreground">{String(label)}</p>
                <p className="mt-1 text-xl font-bold">{pct(Number(value))}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Goal className="h-3.5 w-3.5" /> {homeTeam} xG
              </div>
              <p className="mt-1 text-2xl font-bold">{prediction.expectedGoals.home.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" /> Expected total
              </div>
              <p className="mt-1 text-2xl font-bold">{prediction.expectedGoals.total.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Goal className="h-3.5 w-3.5" /> {awayTeam} xG
              </div>
              <p className="mt-1 text-2xl font-bold">{prediction.expectedGoals.away.toFixed(2)}</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Most likely scores
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {prediction.scorelines.slice(0, 5).map((score) => (
                <div key={`${score.home}-${score.away}`} className="rounded-lg bg-secondary/50 p-2 text-center">
                  <div className="font-bold">{score.home} - {score.away}</div>
                  <div className="text-xs text-muted-foreground">{pct(score.probability)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Goals & BTTS
              </p>
              <div className="space-y-2">
                {goalMarkets.map((market) => (
                  <div key={market.key} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                    <span className="text-sm">{market.label}</span>
                    <div className="text-right">
                      <span className="font-semibold">{pct(market.probability)}</span>
                      {market.fairOdds && (
                        <span className="ml-2 text-xs text-muted-foreground">fair {market.fairOdds.toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Team goals
              </p>
              <div className="space-y-2">
                {teamMarkets.map((market) => (
                  <div key={market.key} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                    <span className="text-sm">
                      {market.label.replace("Home", homeTeam).replace("Away", awayTeam)}
                    </span>
                    <span className="font-semibold">{pct(market.probability)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-primary/5 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Model confidence
              </div>
              <p className="mt-1 text-lg font-bold text-primary">{pct(prediction.confidence)}</p>
            </div>
            <div className="rounded-xl bg-secondary/50 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Database className="h-3.5 w-3.5" /> Data completeness
              </div>
              <p className="mt-1 text-lg font-bold">{pct(prediction.dataCompleteness)}</p>
            </div>
          </div>

          {prediction.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              {prediction.warnings.map((warning) => (
                <p key={warning} className="text-xs text-amber-500">{warning}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
