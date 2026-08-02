"use client";

import { useState, useCallback } from "react";
import { useFetch } from "@/lib/hooks";
import { getSportName } from "@/lib/sports";
import { PredictionCard } from "@/components/ai/prediction-card";
import { AnalysisPanel } from "@/components/ai/analysis-panel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Brain, Filter, SortAsc, Loader2 } from "lucide-react";

interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  homeOdds: number;
  awayOdds: number;
  drawOdds: number | null;
  overUnderLine: number | null;
  overOdds: number | null;
  underOdds: number | null;
  commenceTime: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  aiHomeWinProb: number | null;
  aiDrawProb: number | null;
  aiAwayWinProb: number | null;
  aiConfidence: number | null;
  aiRecommended: string | null;
  aiAnalysis: string | null;
}

interface TeamStatsData {
  teamName: string;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  form: string;
  homeRecord: string;
  awayRecord: string;
  attackRating: number;
  defenseRating: number;
  overallRating: number;
}

export default function AnalysisPage() {
  const { data: matches, loading, refetch } = useFetch<Match[]>("/api/matches?status=upcoming", []);
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("confidence");
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    prediction: {
      homeWinProb: number;
      drawProb: number;
      awayWinProb: number;
      confidence: number;
      recommended: string;
      analysis: string;
    };
    homeTeamStats: TeamStatsData | null;
    awayTeamStats: TeamStatsData | null;
  } | null>(null);

  const handleAnalyze = useCallback(async (matchId: string) => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      });
      if (res.ok) {
        const result = await res.json();
        setAnalysisResult(result);
        refetch();
        if (selectedMatch?.id === matchId) {
          setSelectedMatch((prev) =>
            prev
              ? {
                  ...prev,
                  aiHomeWinProb: result.prediction.homeWinProb,
                  aiDrawProb: result.prediction.drawProb,
                  aiAwayWinProb: result.prediction.awayWinProb,
                  aiConfidence: result.prediction.confidence,
                  aiRecommended: result.prediction.recommended,
                  aiAnalysis: result.prediction.analysis,
                }
              : prev
          );
        }
      }
    } catch (error) {
      console.error("Analysis failed:", error);
    } finally {
      setAnalyzing(false);
    }
  }, [refetch, selectedMatch]);

  const handleQuickBet = async (matchId: string, selection: string) => {
    console.log("Quick bet:", matchId, selection);
  };

  const filteredMatches = matches
    .filter((m) => sportFilter === "all" || m.sport === sportFilter)
    .sort((a, b) => {
      switch (sortBy) {
        case "confidence":
          return (b.aiConfidence || 0) - (a.aiConfidence || 0);
        case "time":
          return new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime();
        case "odds":
          return a.homeOdds - b.homeOdds;
        default:
          return 0;
      }
    });

  const sports = [...new Set(matches.map((m) => m.sport))];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading matches...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">AI Analysis</h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI-powered match predictions and analysis
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={sportFilter} onValueChange={setSportFilter}>
            <SelectTrigger className="w-36 bg-secondary border-border">
              <SelectValue placeholder="Sport" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sports</SelectItem>
              {sports.map((sport) => (
                <SelectItem key={sport} value={sport}>
                  {getSportName(sport)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <SortAsc className="h-4 w-4 text-muted-foreground" />
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-40 bg-secondary border-border">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="confidence">Confidence</SelectItem>
              <SelectItem value="time">Match Time</SelectItem>
              <SelectItem value="odds">Odds Value</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          className="border-primary/30 text-primary hover:bg-primary/10"
          onClick={() => {
            if (filteredMatches.length > 0) {
              handleAnalyze(filteredMatches[0].id);
            }
          }}
          disabled={analyzing}
        >
          {analyzing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Brain className="h-4 w-4" />
          )}
          {analyzing ? "Analyzing..." : "Run AI Analysis"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3 max-h-[calc(100vh-240px)] overflow-y-auto pr-1">
          {filteredMatches.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="p-8 text-center">
                <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No upcoming matches found for the selected filters.
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredMatches.map((match) => (
              <div
                key={match.id}
                onClick={() => setSelectedMatch(match)}
                className={`cursor-pointer transition-all rounded-lg ${
                  selectedMatch?.id === match.id ? "ring-1 ring-primary" : ""
                }`}
              >
                <PredictionCard match={match} onQuickBet={handleQuickBet} />
              </div>
            ))
          )}
        </div>

        <div className="space-y-4">
          {selectedMatch ? (
            <AnalysisPanel
              match={selectedMatch}
              homeTeamStats={analysisResult?.homeTeamStats || null}
              awayTeamStats={analysisResult?.awayTeamStats || null}
            />
          ) : (
            <Card className="bg-card border-border">
              <CardContent className="p-8 text-center">
                <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Select a match to view detailed AI analysis
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
