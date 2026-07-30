"use client";

import { useState, useCallback } from "react";
import { useFetch } from "@/lib/hooks";
import { PredictionCard } from "@/components/ai/prediction-card";
import { AnalysisPanel } from "@/components/ai/analysis-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Brain, Filter, SortAsc, Loader2, Shield, Zap, Target, AlertTriangle } from "lucide-react";

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
  aiRiskScore: number | null;
  aiRiskLevel: string | null;
  aiValueEdge: number | null;
  aiKellyStake: number | null;
  apiSource: string | null;
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
      modelResults: { modelName: string; homeWinProb: number; drawProb: number; awayWinProb: number; weight: number; confidence: number }[];
      valueBets: { selection: string; aiProb: number; impliedProb: number; odds: number; edge: number; kellyFraction: number; expectedValue: number }[];
      kellyStake: { fraction: number; recommendedStake: number; maxStake: number; expectedValue: number; riskOfRuin: number };
      riskScore: number;
      riskLevel: string;
    };
    poissonResult: { expectedHomeGoals: number; expectedAwayGoals: number; homeWinProb: number; drawProb: number; awayWinProb: number } | null;
    overUnderResult: { line: number; overProb: number; underProb: number; recommendation: string; value: number } | null;
    detailedAnalysis: {
      keyFactors: string[];
      strengths: { team: string; points: string[] };
      weaknesses: { team: string; points: string[] };
      valueBet: { selection: string; reason: string; edge: number };
      riskAssessment: { level: string; score: number; factors: string[] };
      modelConsensus: { agreement: number; dominantModel: string; spread: number };
      xgAnalysis: { homeXg: number; awayXg: number; totalExpected: number };
    } | null;
    homeTeamStats: unknown;
    awayTeamStats: unknown;
  } | null>(null);

  const handleAnalyze = useCallback(async (matchId: string) => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, bankroll: 1000 }),
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
                  aiRiskScore: result.prediction.riskScore,
                  aiRiskLevel: result.prediction.riskLevel,
                  aiValueEdge: result.prediction.valueBets?.[0]?.edge || 0,
                  aiKellyStake: result.prediction.kellyStake?.recommendedStake || 0,
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
        case "value":
          return (b.aiValueEdge || 0) - (a.aiValueEdge || 0);
        case "risk":
          return (a.aiRiskScore || 50) - (b.aiRiskScore || 50);
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
        <h1 className="text-2xl font-bold text-foreground">AI Analysis Engine</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Multi-model prediction system: Poisson + ELO + Monte Carlo + Kelly Criterion
        </p>
      </div>

      {/* Model Info Banner */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Brain className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">4-Model Ensemble</p>
                <p className="text-[10px] text-muted-foreground">Poisson + ELO + MC + Odds</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/10">
                <Shield className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">Kelly Criterion</p>
                <p className="text-[10px] text-muted-foreground">Optimal stake sizing</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10">
                <Target className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">Value Detection</p>
                <p className="text-[10px] text-muted-foreground">Min 3% edge required</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-400/10">
                <AlertTriangle className="h-4 w-4 text-red-400" />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">Risk Management</p>
                <p className="text-[10px] text-muted-foreground">Max 10% bankroll per bet</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={sportFilter} onValueChange={(v) => { if (v) setSportFilter(v); }}>
            <SelectTrigger className="w-36 bg-secondary border-border">
              <SelectValue placeholder="Sport" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sports</SelectItem>
              {sports.map((sport) => (
                <SelectItem key={sport} value={sport}>
                  {sport.charAt(0).toUpperCase() + sport.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <SortAsc className="h-4 w-4 text-muted-foreground" />
          <Select value={sortBy} onValueChange={(v) => { if (v) setSortBy(v); }}>
            <SelectTrigger className="w-40 bg-secondary border-border">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="confidence">Confidence</SelectItem>
              <SelectItem value="value">Value Edge</SelectItem>
              <SelectItem value="risk">Risk Level</SelectItem>
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
              setSelectedMatch(filteredMatches[0]);
              handleAnalyze(filteredMatches[0].id);
            }
          }}
          disabled={analyzing || filteredMatches.length === 0}
        >
          {analyzing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          {analyzing ? "Analyzing..." : "Run Full Analysis"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3 max-h-[calc(100vh-340px)] overflow-y-auto pr-1">
          {filteredMatches.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="p-8 text-center">
                <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {matches.length === 0
                    ? "No matches available. Connect API keys in Admin settings to fetch live odds."
                    : "No upcoming matches found for the selected filters."}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredMatches.map((match) => (
              <div
                key={match.id}
                onClick={() => {
                  setSelectedMatch(match);
                  if (!match.aiConfidence) handleAnalyze(match.id);
                }}
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
          {selectedMatch && analysisResult ? (
            <>
              {/* Multi-Model Results */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" />
                    Model Results
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {analysisResult.prediction.modelResults?.map((model, i) => (
                    <div key={i} className="rounded-lg bg-secondary/50 p-2">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-foreground">{model.modelName}</p>
                        <Badge variant="secondary" className="text-[10px]">
                          Weight: {Math.round(model.weight * 100)}%
                        </Badge>
                      </div>
                      <div className="flex gap-3 text-[10px] text-muted-foreground">
                        <span>Home: {Math.round(model.homeWinProb * 100)}%</span>
                        <span>Draw: {Math.round(model.drawProb * 100)}%</span>
                        <span>Away: {Math.round(model.awayWinProb * 100)}%</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Value Bets */}
              {analysisResult.prediction.valueBets && analysisResult.prediction.valueBets.length > 0 && (
                <Card className="bg-card border-emerald-400/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Target className="h-4 w-4 text-emerald-400" />
                      Value Bets Detected
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {analysisResult.prediction.valueBets.map((vb, i) => (
                      <div key={i} className="rounded-lg bg-emerald-400/5 border border-emerald-400/10 p-2">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-medium text-foreground">{vb.selection}</p>
                          <Badge className="bg-emerald-400/20 text-emerald-400 text-[10px]">
                            {Math.round(vb.edge * 100)}% edge
                          </Badge>
                        </div>
                        <div className="flex gap-3 text-[10px] text-muted-foreground">
                          <span>AI: {Math.round(vb.aiProb * 100)}%</span>
                          <span>Implied: {Math.round(vb.impliedProb * 100)}%</span>
                          <span>Odds: {vb.odds}</span>
                          <span>Kelly: {Math.round(vb.kellyFraction * 100)}%</span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Kelly Criterion */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4 text-amber-400" />
                    Kelly Criterion
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-secondary/50 p-2">
                      <p className="text-[10px] text-muted-foreground">Recommended Stake</p>
                      <p className="text-sm font-bold text-foreground">${analysisResult.prediction.kellyStake?.recommendedStake || 0}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/50 p-2">
                      <p className="text-[10px] text-muted-foreground">Max Stake</p>
                      <p className="text-sm font-bold text-foreground">${analysisResult.prediction.kellyStake?.maxStake || 0}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/50 p-2">
                      <p className="text-[10px] text-muted-foreground">Expected Value</p>
                      <p className="text-sm font-bold text-foreground">{analysisResult.prediction.kellyStake?.expectedValue || 0}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/50 p-2">
                      <p className="text-[10px] text-muted-foreground">Risk of Ruin</p>
                      <p className="text-sm font-bold text-foreground">{Math.round((analysisResult.prediction.kellyStake?.riskOfRuin || 0) * 10000) / 10000}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Poisson & xG */}
              {analysisResult.poissonResult && (
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary" />
                      Poisson & xG Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="rounded-lg bg-secondary/50 p-2">
                        <p className="text-[10px] text-muted-foreground">Expected Goals</p>
                        <p className="text-sm font-bold text-foreground">
                          {selectedMatch.homeTeam}: {analysisResult.poissonResult.expectedHomeGoals} | {selectedMatch.awayTeam}: {analysisResult.poissonResult.expectedAwayGoals}
                        </p>
                      </div>
                      {analysisResult.detailedAnalysis?.xgAnalysis && (
                        <div className="rounded-lg bg-secondary/50 p-2">
                          <p className="text-[10px] text-muted-foreground">xG Analysis</p>
                          <p className="text-sm font-bold text-foreground">
                            Home: {analysisResult.detailedAnalysis.xgAnalysis.homeXg} | Away: {analysisResult.detailedAnalysis.xgAnalysis.awayXg}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Total expected: {analysisResult.detailedAnalysis.xgAnalysis.totalExpected}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Risk Assessment */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className={`h-4 w-4 ${
                      analysisResult.prediction.riskLevel === "low" ? "text-emerald-400" :
                      analysisResult.prediction.riskLevel === "high" ? "text-red-400" :
                      "text-amber-400"
                    }`} />
                    Risk Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Risk Score</span>
                      <Badge className={`text-[10px] ${
                        analysisResult.prediction.riskLevel === "low" ? "bg-emerald-400/20 text-emerald-400" :
                        analysisResult.prediction.riskLevel === "high" ? "bg-red-400/20 text-red-400" :
                        "bg-amber-400/20 text-amber-400"
                      }`}>
                        {analysisResult.prediction.riskScore}/100 - {analysisResult.prediction.riskLevel}
                      </Badge>
                    </div>
                    {analysisResult.detailedAnalysis?.riskAssessment?.factors?.map((f: string, i: number) => (
                      <p key={i} className="text-[10px] text-muted-foreground">• {f}</p>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Original Analysis Panel */}
              <AnalysisPanel
                match={selectedMatch}
                homeTeamStats={analysisResult?.homeTeamStats as { teamName: string; matchesPlayed: number; wins: number; draws: number; losses: number; form: string; homeRecord: string; awayRecord: string; attackRating: number; defenseRating: number; overallRating: number } | null}
                awayTeamStats={analysisResult?.awayTeamStats as { teamName: string; matchesPlayed: number; wins: number; draws: number; losses: number; form: string; homeRecord: string; awayRecord: string; attackRating: number; defenseRating: number; overallRating: number } | null}
              />
            </>
          ) : selectedMatch ? (
            <Card className="bg-card border-border">
              <CardContent className="p-8 text-center">
                <Button
                  onClick={() => handleAnalyze(selectedMatch.id)}
                  disabled={analyzing}
                  className="bg-primary hover:bg-primary/90"
                >
                  {analyzing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
                  {analyzing ? "Running 4-Model Analysis..." : "Run Full AI Analysis"}
                </Button>
                <p className="text-xs text-muted-foreground mt-3">
                  Runs Poisson, ELO, Monte Carlo, and Odds models
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-card border-border">
              <CardContent className="p-8 text-center">
                <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Select a match to view detailed multi-model AI analysis
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
