"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brain, Loader2, Shield } from "lucide-react";
import { useState } from "react";

interface AnalysisPanelProps {
  match: {
    id: string;
    homeTeam: string;
    awayTeam: string;
    sport: string;
    league: string;
    aiHomeWinProb: number | null;
    aiDrawProb: number | null;
    aiAwayWinProb: number | null;
    aiConfidence: number | null;
    aiRecommended: string | null;
    aiAnalysis: string | null;
  };
  homeTeamStats?: {
    teamName: string;
    matchesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
    form: string;
    homeRecord: string;
    attackRating: number;
    defenseRating: number;
    overallRating: number;
  } | null;
  awayTeamStats?: {
    teamName: string;
    matchesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
    form: string;
    awayRecord: string;
    attackRating: number;
    defenseRating: number;
    overallRating: number;
  } | null;
}

export function AnalysisPanel({ match, homeTeamStats, awayTeamStats }: AnalysisPanelProps) {
  const [analyzing, setAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: match.id }),
      });
      if (res.ok) {
        // Could trigger a refresh here
      }
    } catch (error) {
      console.error("Analysis failed:", error);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-primary" />
            AI Analysis
          </CardTitle>
          <Button
            size="xs"
            variant="outline"
            onClick={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Brain className="h-3 w-3" />
            )}
            {analyzing ? "Analyzing..." : "Re-analyze"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* AI Analysis Text */}
        {match.aiAnalysis && (
          <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
            <p className="text-xs text-foreground leading-relaxed">
              {match.aiAnalysis}
            </p>
          </div>
        )}

        {/* Head-to-Head Comparison */}
        {homeTeamStats && awayTeamStats && (
          <div className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Team Comparison
            </div>
            {[
              { label: "Overall Rating", home: homeTeamStats.overallRating, away: awayTeamStats.overallRating },
              { label: "Attack Rating", home: homeTeamStats.attackRating, away: awayTeamStats.attackRating },
              { label: "Defense Rating", home: homeTeamStats.defenseRating, away: awayTeamStats.defenseRating },
              { label: "Win Rate", home: homeTeamStats.matchesPlayed > 0 ? Math.round((homeTeamStats.wins / homeTeamStats.matchesPlayed) * 100) : 0, away: awayTeamStats.matchesPlayed > 0 ? Math.round((awayTeamStats.wins / awayTeamStats.matchesPlayed) * 100) : 0 },
            ].map((stat) => {
              const maxVal = Math.max(stat.home, stat.away);
              return (
                <div key={stat.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-foreground font-medium">{stat.home}</span>
                    <span className="text-muted-foreground">{stat.label}</span>
                    <span className="text-foreground font-medium">{stat.away}</span>
                  </div>
                  <div className="flex gap-1">
                    <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${maxVal > 0 ? (stat.home / maxVal) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all ml-auto"
                        style={{ width: `${maxVal > 0 ? (stat.away / maxVal) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Form */}
        {homeTeamStats && awayTeamStats && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Recent Form
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {homeTeamStats.form.split("").map((c, i) => (
                  <Badge
                    key={i}
                    variant="secondary"
                    className={
                      c === "W"
                        ? "bg-emerald-400/10 text-emerald-400 text-[10px]"
                        : c === "D"
                        ? "bg-amber-400/10 text-amber-400 text-[10px]"
                        : "bg-red-400/10 text-red-400 text-[10px]"
                    }
                  >
                    {c}
                  </Badge>
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground">vs</span>
              <div className="flex gap-1">
                {awayTeamStats.form.split("").map((c, i) => (
                  <Badge
                    key={i}
                    variant="secondary"
                    className={
                      c === "W"
                        ? "bg-emerald-400/10 text-emerald-400 text-[10px]"
                        : c === "D"
                        ? "bg-amber-400/10 text-amber-400 text-[10px]"
                        : "bg-red-400/10 text-red-400 text-[10px]"
                    }
                  >
                    {c}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Confidence Indicator */}
        {match.aiConfidence && (
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">AI Confidence:</span>
            <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${match.aiConfidence * 100}%` }}
              />
            </div>
            <span className="text-xs font-bold text-primary">
              {Math.round(match.aiConfidence * 100)}%
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
