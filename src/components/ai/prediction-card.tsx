"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brain, ChevronDown, ChevronUp, Zap, Loader2 } from "lucide-react";
import { getSportShortName, getSportName } from "@/lib/sports";
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
  onAnalyze?: (matchId: string) => void;
  analyzing?: boolean;
}

export function PredictionCard({ match, onQuickBet, onAnalyze, analyzing }: PredictionCardProps) {
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
    if (!rec) return null;
    switch (rec) {
      case "home": return match.homeTeam;
      case "away": return match.awayTeam;
      case "draw": return "Draw";
      case "over": return "Over 2.5";
      case "under": return "Under 2.5";
      default: return rec;
    }
  };

  const hasAnalysis = match.aiRecommended && match.aiConfidence;

  return (
    <Card className="bg-card border-border overflow-hidden">
      <CardContent className="p-3 sm:p-4">
        {/* Top row: Sport badge + League + Confidence */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
            <Badge variant="secondary" className="text-[10px] shrink-0">
              {getSportShortName(match.sport)}
            </Badge>
            <span className="text-[10px] sm:text-xs text-muted-foreground truncate">
              {match.league || getSportName(match.sport)}
            </span>
            {match.status === "live" && (
              <Badge className="text-[10px] bg-red-500/20 text-red-400 border-red-500/30 shrink-0">
                LIVE
              </Badge>
            )}
          </div>
          {/* Confidence Badge — compact on mobile */}
          <div className={`flex items-center gap-1.5 rounded-lg px-2 py-1 sm:px-3 sm:py-2 shrink-0 ${confidenceBg}`}>
            <Brain className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${confidenceColor}`} />
            <span className={`text-sm sm:text-base font-bold ${confidenceColor}`}>{confidencePct}%</span>
            <span className="text-[9px] text-muted-foreground hidden sm:inline">Confidence</span>
          </div>
        </div>

        {/* Match title */}
        <p className="text-sm font-medium text-foreground mb-2">
          {match.homeTeam} vs {match.awayTeam}
        </p>

        {/* AI Probabilities — 3 columns */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center rounded-lg bg-secondary/30 p-1.5 sm:p-2">
            <div className="text-[9px] sm:text-[10px] text-muted-foreground mb-0.5">Home</div>
            <div className="text-xs sm:text-sm font-bold text-foreground">
              {match.aiHomeWinProb ? `${Math.round(match.aiHomeWinProb * 100)}%` : "\u2014"}
            </div>
            <div className="text-[10px] text-primary font-medium">{match.homeOdds}</div>
          </div>
          {match.drawOdds ? (
            <div className="text-center rounded-lg bg-secondary/30 p-1.5 sm:p-2">
              <div className="text-[9px] sm:text-[10px] text-muted-foreground mb-0.5">Draw</div>
              <div className="text-xs sm:text-sm font-bold text-foreground">
                {match.aiDrawProb ? `${Math.round(match.aiDrawProb * 100)}%` : "\u2014"}
              </div>
              <div className="text-[10px] text-muted-foreground font-medium">{match.drawOdds}</div>
            </div>
          ) : (
            <div className="text-center rounded-lg bg-secondary/30 p-1.5 sm:p-2">
              <div className="text-[9px] sm:text-[10px] text-muted-foreground mb-0.5">Draw</div>
              <div className="text-xs sm:text-sm font-bold text-foreground">{"\u2014"}</div>
              <div className="text-[10px] text-muted-foreground font-medium">{"\u2014"}</div>
            </div>
          )}
          <div className="text-center rounded-lg bg-secondary/30 p-1.5 sm:p-2">
            <div className="text-[9px] sm:text-[10px] text-muted-foreground mb-0.5">Away</div>
            <div className="text-xs sm:text-sm font-bold text-foreground">
              {match.aiAwayWinProb ? `${Math.round(match.aiAwayWinProb * 100)}%` : "\u2014"}
            </div>
            <div className="text-[10px] text-amber-400 font-medium">{match.awayOdds}</div>
          </div>
        </div>

        {/* Recommendation + Action row — stacks on mobile */}
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          {/* AI Recommendation */}
          <div className="flex items-center gap-1.5 min-w-0">
            <Brain className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-[10px] sm:text-xs text-muted-foreground shrink-0">AI recommends:</span>
            <span className="text-xs sm:text-sm font-medium text-primary truncate">
              {getRecommendationLabel(match.aiRecommended) || "Run analysis"}
            </span>
          </div>
          {/* Action buttons — always on their own row on mobile, inline on desktop */}
          <div className="flex items-center gap-1.5 shrink-0">
            {hasAnalysis && onQuickBet && match.aiRecommended && (
              <Button
                size="xs"
                variant="default"
                className="bg-primary text-primary-foreground hover:bg-primary/80"
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickBet(match.id, match.aiRecommended!);
                }}
              >
                <Zap className="h-3 w-3" />
                Quick Bet
              </Button>
            )}
            {!hasAnalysis && onAnalyze && (
              <Button
                size="xs"
                variant="default"
                className="bg-primary text-primary-foreground hover:bg-primary/80"
                disabled={analyzing}
                onClick={(e) => {
                  e.stopPropagation();
                  onAnalyze(match.id);
                }}
              >
                {analyzing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Brain className="h-3 w-3" />
                )}
                {analyzing ? "Analyzing..." : "Analyze"}
              </Button>
            )}
            {hasAnalysis && (
              <Button
                size="xs"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(!expanded);
                }}
              >
                {expanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                {expanded ? "Less" : "More"}
              </Button>
            )}
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
