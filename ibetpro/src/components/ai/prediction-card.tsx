"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brain, ChevronDown, ChevronUp, Zap } from "lucide-react";
import { useState } from "react";

interface PredictionCardProps {
  match: {
    id: string;
    homeTeam: string;
    awayTeam: string;
    sport: string;
    league: string;
    homeOdds: number;
    awayOdds: number;
    drawOdds: number | null;
    commenceTime: string;
    aiHomeWinProb: number | null;
    aiDrawProb: number | null;
    aiAwayWinProb: number | null;
    aiConfidence: number | null;
    aiRecommended: string | null;
    aiAnalysis: string | null;
    status: string;
  };
  onQuickBet?: (matchId: string, selection: string) => void;
}

export function PredictionCard({ match, onQuickBet }: PredictionCardProps) {
  const [expanded, setExpanded] = useState(false);

  const confidencePct = match.aiConfidence ? Math.round(match.aiConfidence * 100) : 0;
  const confidenceColor =
    confidencePct >= 75
      ? "text-emerald-400"
      : confidencePct >= 50
      ? "text-amber-400"
      : "text-red-400";

  const confidenceBg =
    confidencePct >= 75
      ? "bg-emerald-400/10"
      : confidencePct >= 50
      ? "bg-amber-400/10"
      : "bg-red-400/10";

  const getRecommendationLabel = (rec: string | null) => {
    if (!rec) return "N/A";
    switch (rec) {
      case "home": return match.homeTeam;
      case "away": return match.awayTeam;
      case "draw": return "Draw";
      case "over": return "Over 2.5";
      case "under": return "Under 2.5";
      default: return rec;
    }
  };

  return (
    <Card className="bg-card border-border overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-[10px]">
                {match.sport}
              </Badge>
              <span className="text-xs text-muted-foreground">{match.league}</span>
              {match.status === "live" && (
                <Badge className="text-[10px] bg-red-500/20 text-red-400 border-red-500/30">
                  LIVE
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium text-foreground">
              {match.homeTeam} vs {match.awayTeam}
            </p>

            {/* AI Probabilities */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="text-center">
                <div className="text-[10px] text-muted-foreground mb-1">Home</div>
                <div className="text-sm font-bold text-foreground">
                  {match.aiHomeWinProb ? `${Math.round(match.aiHomeWinProb * 100)}%` : "N/A"}
                </div>
                <div className="text-[10px] text-primary">{match.homeOdds}</div>
              </div>
              {match.drawOdds && (
                <div className="text-center">
                  <div className="text-[10px] text-muted-foreground mb-1">Draw</div>
                  <div className="text-sm font-bold text-foreground">
                    {match.aiDrawProb ? `${Math.round(match.aiDrawProb * 100)}%` : "N/A"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{match.drawOdds}</div>
                </div>
              )}
              <div className="text-center">
                <div className="text-[10px] text-muted-foreground mb-1">Away</div>
                <div className="text-sm font-bold text-foreground">
                  {match.aiAwayWinProb ? `${Math.round(match.aiAwayWinProb * 100)}%` : "N/A"}
                </div>
                <div className="text-[10px] text-amber-400">{match.awayOdds}</div>
              </div>
            </div>
          </div>

          {/* Confidence Badge */}
          <div className={`flex flex-col items-center gap-1 rounded-lg px-3 py-2 ${confidenceBg}`}>
            <Brain className={`h-5 w-5 ${confidenceColor}`} />
            <span className={`text-lg font-bold ${confidenceColor}`}>{confidencePct}%</span>
            <span className="text-[10px] text-muted-foreground">Confidence</span>
          </div>
        </div>

        {/* Recommendation */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">AI recommends:</span>
            <span className="text-sm font-medium text-primary">
              {getRecommendationLabel(match.aiRecommended)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onQuickBet && match.aiRecommended && (
              <Button
                size="xs"
                variant="default"
                className="bg-primary text-primary-foreground hover:bg-primary/80"
                onClick={() => onQuickBet(match.id, match.aiRecommended!)}
              >
                <Zap className="h-3 w-3" />
                Quick Bet
              </Button>
            )}
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              {expanded ? "Less" : "More"}
            </Button>
          </div>
        </div>

        {/* Expanded Analysis */}
        {expanded && match.aiAnalysis && (
          <div className="mt-3 rounded-lg bg-secondary/50 p-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {match.aiAnalysis}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
