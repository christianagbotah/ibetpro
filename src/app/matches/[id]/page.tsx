"use client";

import { useFetch } from "@/lib/hooks";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Brain,
  Shield,
  Target,
  Zap,
  Clock,
  Radio,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { getSportName, getSportShortName } from "@/lib/sports";
import { RichPredictionPanel } from "@/components/ai/rich-prediction-panel";

interface MatchDetail {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  homeOdds: number;
  drawOdds: number | null;
  awayOdds: number;
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
  apiSource: string | null;
  bets: Array<{
    id: string;
    selection: string;
    odds: number;
    stake: number;
    status: string;
    isAutoPlaced: boolean;
  }>;
}

interface TeamStatsData {
  teamName: string;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  form: string;
  homeRecord: string;
  awayRecord: string;
  attackRating: number;
  defenseRating: number;
  overallRating: number;
}

interface DetailedAnalysis {
  keyFactors: string[];
  strengths: { team: string; points: string[] };
  weaknesses: { team: string; points: string[] };
  valueBet: { selection: string; reason: string; edge: number };
  riskAssessment: { level: string; score: number; factors: string[] };
}

interface RelatedMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  homeOdds: number;
  awayOdds: number;
  status: string;
  commenceTime: string;
}

export default function MatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { addToast } = useToast();
  const matchId = params.id as string;

  const {
    data: match,
    loading: matchLoading,
    refetch: refetchMatch,
  } = useFetch<MatchDetail>(`/api/matches?id=${matchId}`, {} as MatchDetail);
  const { data: allMatches, loading: matchesLoading } = useFetch<RelatedMatch[]>("/api/matches", []);
  const [analysisResult, setAnalysisResult] = useState<{
    prediction: { homeWinProb: number; drawProb: number; awayWinProb: number; confidence: number; recommended: string; analysis: string };
    homeTeamStats: TeamStatsData | null;
    awayTeamStats: TeamStatsData | null;
    detailedAnalysis: DetailedAnalysis | null;
    richPrediction?: {
      modelVersion: string;
      source: string;
      resultMode: string;
      generatedAt: string;
      expectedGoals: { home: number; away: number; total: number };
      result: { homeWin: number; draw: number; awayWin: number };
      scorelines: Array<{ home: number; away: number; probability: number }>;
      markets: Array<{ key: string; label: string; probability: number; fairOdds: number | null }>;
      confidence: number;
      dataCompleteness: number;
      warnings: string[];
    };
  } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [placingBet, setPlacingBet] = useState(false);
  const [liveEstimateUpdatedAt, setLiveEstimateUpdatedAt] = useState<Date | null>(null);
  const [liveScoreAvailable, setLiveScoreAvailable] = useState<boolean | null>(null);

  const refreshLiveEstimate = useCallback(async () => {
    try {
      const liveRes = await fetch("/api/matches/live-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      });
      if (!liveRes.ok) return;

      const livePayload = await liveRes.json();
      const refreshedMatch = livePayload.match;
      const hasLiveScore =
        livePayload.scoreAvailable === true ||
        (refreshedMatch?.homeScore != null && refreshedMatch?.awayScore != null);
      setLiveScoreAvailable(hasLiveScore);
      refetchMatch();

      if (refreshedMatch?.status !== "live" || !hasLiveScore) {
        return;
      }

      const predictionRes = await fetch(`/api/predictions/${matchId}`, {
        cache: "no-store",
      });
      if (!predictionRes.ok) return;

      const payload = await predictionRes.json();
      const prediction = payload.prediction;
      const resultEntries: Array<[string, number]> = [
        ["home", prediction.result.homeWin],
        ["draw", prediction.result.draw],
        ["away", prediction.result.awayWin],
      ];
      const recommended = resultEntries.sort((a, b) => b[1] - a[1])[0][0];

      setAnalysisResult((previous) => ({
        prediction: {
          homeWinProb: prediction.result.homeWin,
          drawProb: prediction.result.draw,
          awayWinProb: prediction.result.awayWin,
          confidence: prediction.confidence,
          recommended,
          analysis: `Live ${prediction.modelVersion} estimate · Expected goals ${prediction.expectedGoals.home.toFixed(2)} - ${prediction.expectedGoals.away.toFixed(2)}`,
        },
        homeTeamStats: previous?.homeTeamStats ?? null,
        awayTeamStats: previous?.awayTeamStats ?? null,
        detailedAnalysis: previous?.detailedAnalysis ?? null,
        richPrediction: prediction,
      }));
      setLiveEstimateUpdatedAt(new Date());
    } catch {
      // Keep the last good live estimate if a refresh fails.
    }
  }, [matchId, refetchMatch]);

  useEffect(() => {
    if (match?.status !== "live" || match.apiSource !== "odds-api") return;

    void refreshLiveEstimate();
    const interval = setInterval(() => {
      void refreshLiveEstimate();
    }, 60_000);

    return () => clearInterval(interval);
  }, [match?.status, match?.apiSource, refreshLiveEstimate]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      });
      if (res.ok) {
        const result = await res.json();
        // Generate detailed analysis
        const detailRes = await fetch("/api/ai/detailed-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId }),
        });
        const detailResult = detailRes.ok ? await detailRes.json() : null;
        setAnalysisResult({
          ...result,
          detailedAnalysis: detailResult?.detailedAnalysis || null,
          richPrediction: result.richPrediction,
        });
        addToast("success", "AI analysis completed successfully!");
      }
    } catch {
      addToast("error", "Failed to run AI analysis");
    } finally {
      setAnalyzing(false);
    }
  }, [matchId, addToast]);

  const handleQuickBet = useCallback(async (selection: string, odds: number) => {
    setPlacingBet(true);
    try {
      const res = await fetch("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          betType: "match_winner",
          selection,
          odds,
          stake: 50,
          isAutoPlaced: false,
          aiConfidence: match?.aiConfidence || 0,
        }),
      });
      if (res.ok) {
        addToast("success", `Bet placed on ${selection} @ ${odds}`);
      } else {
        addToast("error", "Failed to place bet");
      }
    } catch {
      addToast("error", "Failed to place bet");
    } finally {
      setPlacingBet(false);
    }
  }, [matchId, match, addToast]);

  const loading = matchLoading || matchesLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Loading match details...
        </div>
      </div>
    );
  }

  if (!match || !match.id) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Match not found</p>
        <Button variant="outline" onClick={() => router.push("/")}>
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const isLive = match.status === "live";
  const isFinished = match.status === "finished";
  const isAwaitingResult = match.status === "awaiting_result";
  const isUpcoming = match.status === "upcoming";
  const hasHomeOdds = Number.isFinite(match.homeOdds) && match.homeOdds > 1;
  const hasDrawOdds = match.drawOdds != null && Number.isFinite(match.drawOdds) && match.drawOdds > 1;
  const hasAwayOdds = Number.isFinite(match.awayOdds) && match.awayOdds > 1;
  const hasMatchWinnerOdds = hasHomeOdds && hasAwayOdds;
  const relatedMatches = allMatches.filter(
    (m) => m.id !== match.id && m.league === match.league
  ).slice(0, 4);

  const homeWinProb = analysisResult?.prediction.homeWinProb ?? match.aiHomeWinProb ?? null;
  const drawProb = analysisResult?.prediction.drawProb ?? match.aiDrawProb ?? null;
  const awayWinProb = analysisResult?.prediction.awayWinProb ?? match.aiAwayWinProb ?? null;
  const displayConfidence =
    analysisResult?.prediction.confidence ?? match.aiConfidence ?? null;
  const displayRecommended =
    analysisResult?.prediction.recommended ?? match.aiRecommended ?? null;
  const predictionSource = analysisResult?.richPrediction?.source ?? null;
  const hasConfirmedLiveScore =
    liveScoreAvailable ??
    (match.homeScore != null && match.awayScore != null);
  const hasAiData = homeWinProb !== null || drawProb !== null || awayWinProb !== null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Match Details</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {match.league || getSportName(match.sport)} &middot; {getSportShortName(match.sport)}
          </p>
        </div>
      </div>

      {/* Main Match Card */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {isLive && (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                  <span className="relative flex h-2 w-2 mr-1.5">
                    <span className="animate-live-pulse absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                  LIVE
                </Badge>
              )}
              {isFinished && (
                <Badge className="bg-secondary text-muted-foreground">Finished</Badge>
              )}
              {isAwaitingResult && (
                <Badge variant="secondary" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  Awaiting result
                </Badge>
              )}
              {isUpcoming && (
                <Badge variant="secondary" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  Upcoming
                </Badge>
              )}
              {isLive && match.minute && (
                <span className="text-sm text-muted-foreground">{match.minute}&apos;</span>
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              {new Date(match.commenceTime).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
              {" "}{new Date(match.commenceTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>

          {/* Score / Teams */}
          <div className="flex items-center justify-center gap-8 my-6">
            <div className="text-center flex-1">
              <p className="text-xl font-bold text-foreground">{match.homeTeam}</p>
              <p className="text-5xl font-bold text-foreground mt-2">
                {match.homeScore ?? "-"}
              </p>
              <div className="flex items-center justify-center gap-1 mt-2">
                <span className="text-sm font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
                  {hasHomeOdds ? match.homeOdds.toFixed(2) : "Odds pending"}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <span className="text-2xl text-muted-foreground">vs</span>
              {hasDrawOdds && (
                <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                  Draw: {match.drawOdds!.toFixed(2)}
                </span>
              )}
            </div>
            <div className="text-center flex-1">
              <p className="text-xl font-bold text-foreground">{match.awayTeam}</p>
              <p className="text-5xl font-bold text-foreground mt-2">
                {match.awayScore ?? "-"}
              </p>
              <div className="flex items-center justify-center gap-1 mt-2">
                <span className="text-sm font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">
                  {hasAwayOdds ? match.awayOdds.toFixed(2) : "Odds pending"}
                </span>
              </div>
            </div>
          </div>

          {/* Match Progress Bar for Live */}
          {isLive && match.minute && (
            <div className="mt-4">
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-red-500 transition-all"
                  style={{ width: `${(match.minute / 90) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>KO</span>
                <span>HT (45&apos;)</span>
                <span>FT (90&apos;)</span>
              </div>
            </div>
          )}

          {/* Quick Bet Buttons */}
          {isUpcoming && hasMatchWinnerOdds && (
            <div className="grid grid-cols-3 gap-3 mt-6">
              <Button
                variant="outline"
                className="border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => handleQuickBet(match.homeTeam, match.homeOdds)}
                disabled={placingBet}
              >
                <Target className="h-3.5 w-3.5 mr-1.5" />
                Home @ {match.homeOdds.toFixed(2)}
              </Button>
              {hasDrawOdds && (
                <Button
                  variant="outline"
                  className="border-muted-foreground/30 text-muted-foreground hover:bg-secondary"
                  onClick={() => handleQuickBet("Draw", match.drawOdds!)}
                  disabled={placingBet}
                >
                  Draw @ {match.drawOdds!.toFixed(2)}
                </Button>
              )}
              <Button
                variant="outline"
                className="border-amber-400/30 text-amber-400 hover:bg-amber-400/10"
                onClick={() => handleQuickBet(match.awayTeam, match.awayOdds)}
                disabled={placingBet}
              >
                Away @ {match.awayOdds.toFixed(2)}
              </Button>
            </div>
          )}
          {isUpcoming && !hasMatchWinnerOdds && (
            <div className="mt-6 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
              Bookmaker odds are pending. AI analysis is available now; betting unlocks only after real market prices are enriched.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Prediction Visualization */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Brain className="h-4 w-4 text-primary" />
                  {isLive
                    ? hasConfirmedLiveScore
                      ? "Live Match Estimate"
                      : "Live Match · Pre-match Estimate"
                    : "AI Prediction"}
                </CardTitle>
                {isLive && (
                  <Badge variant="secondary" className="text-[10px]">
                    {hasConfirmedLiveScore
                      ? predictionSource === "ml-service"
                        ? "ML model"
                        : "Baseline in-play"
                      : "Score feed pending"}
                  </Badge>
                )}
              </div>
              <Button
                size="xs"
                variant="outline"
                onClick={handleAnalyze}
                disabled={analyzing}
                className="border-primary/30 text-primary hover:bg-primary/10"
              >
                {analyzing ? (
                  <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Brain className="h-3 w-3" />
                )}
                {analyzing ? "Analyzing..." : "Run Analysis"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLive && (
              <div className="rounded-lg border border-primary/15 bg-primary/5 p-3">
                <div className="flex items-start gap-2">
                  <Radio className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-foreground">
                      {hasConfirmedLiveScore
                        ? "In-play estimate"
                        : "Live score not confirmed"}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {hasConfirmedLiveScore
                        ? "Uses the current provider score and estimated match clock with pre-kickoff team/market inputs. The qualified first-party ML model is not active yet."
                        : "This competition has not supplied a confirmed live score yet. Any probabilities shown remain the pre-match baseline and are not treated as an in-play signal."}
                    </p>
                    {hasConfirmedLiveScore && liveEstimateUpdatedAt && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Estimate refreshed {liveEstimateUpdatedAt.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Probability Bars */}
            {hasAiData ? (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-foreground font-medium">{match.homeTeam}</span>
                  <span className="text-primary font-bold">{Math.round((homeWinProb || 0) * 100)}%</span>
                </div>
                <div className="h-3 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${(homeWinProb || 0) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-foreground font-medium">Draw</span>
                  <span className="text-muted-foreground font-bold">{Math.round((drawProb || 0) * 100)}%</span>
                </div>
                <div className="h-3 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-muted-foreground/50 transition-all"
                    style={{ width: `${(drawProb || 0) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-foreground font-medium">{match.awayTeam}</span>
                  <span className="text-amber-400 font-bold">{Math.round((awayWinProb || 0) * 100)}%</span>
                </div>
                <div className="h-3 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all"
                    style={{ width: `${(awayWinProb || 0) * 100}%` }}
                  />
                </div>
              </div>
            </div>
            ) : (
              <div className="text-center py-8">
                <Brain className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-3">No AI analysis yet</p>
                <Button
                  size="sm"
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="bg-primary text-primary-foreground hover:bg-primary/80"
                >
                  {analyzing ? (
                    <div className="h-3 w-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Brain className="h-3 w-3" />
                  )}
                  {analyzing ? "Analyzing..." : "Run AI Analysis"}
                </Button>
              </div>
            )}

            {/* Confidence */}
            {displayConfidence != null && (
              <div className="flex items-center gap-2 mt-2">
                <Shield className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">
                  {isLive ? "Estimate confidence:" : "AI Confidence:"}
                </span>
                <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${displayConfidence * 100}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-primary">
                  {Math.round(displayConfidence * 100)}%
                </span>
              </div>
            )}

            {/* AI Recommendation */}
            {displayRecommended && (
              <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <span className="text-sm text-muted-foreground">
                    {isLive ? "Estimate leans:" : "AI recommends:"}
                  </span>
                  <span className="text-sm font-bold text-primary">
                    {displayRecommended === "home" ? match.homeTeam
                      : displayRecommended === "away" ? match.awayTeam
                      : displayRecommended === "draw" ? "Draw"
                      : displayRecommended === "over" ? "Over 2.5"
                      : "Under 2.5"}
                  </span>
                </div>
              </div>
            )}

            {/* AI Analysis Text */}
            {(analysisResult?.prediction.analysis || match.aiAnalysis) && (
              <div className="rounded-lg bg-secondary/50 p-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {analysisResult?.prediction.analysis || match.aiAnalysis}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Evidence and data quality */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-amber-400" />
              Evidence & Data Quality
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {analysisResult?.richPrediction ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-secondary/50 p-3">
                    <p className="text-xs text-muted-foreground">Model</p>
                    <p className="text-sm font-semibold text-foreground truncate">
                      {analysisResult.richPrediction.modelVersion}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {analysisResult.richPrediction.source}
                    </p>
                  </div>
                  <div className="rounded-lg bg-secondary/50 p-3">
                    <p className="text-xs text-muted-foreground">Data completeness</p>
                    <p className="text-xl font-bold text-foreground">
                      {Math.round(analysisResult.richPrediction.dataCompleteness * 100)}%
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[analysisResult.homeTeamStats, analysisResult.awayTeamStats].map((stats, index) => {
                    const teamName = index === 0 ? match.homeTeam : match.awayTeam;
                    return (
                      <div key={teamName} className="rounded-lg border border-border p-3">
                        <p className="text-sm font-semibold text-foreground truncate">{teamName}</p>
                        {stats ? (
                          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                            <div>
                              <p className="text-muted-foreground">Matches</p>
                              <p className="font-medium text-foreground">{stats.matchesPlayed}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">W-D-L</p>
                              <p className="font-medium text-foreground">
                                {stats.wins}-{stats.draws}-{stats.losses}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Goals for</p>
                              <p className="font-medium text-foreground">{stats.goalsFor}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Goals against</p>
                              <p className="font-medium text-foreground">{stats.goalsAgainst}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-2">
                            No provider team-stat snapshot available.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Expected goals</p>
                      <p className="text-sm font-semibold text-foreground mt-1">
                        {match.homeTeam} {analysisResult.richPrediction.expectedGoals.home.toFixed(2)}
                        {" — "}
                        {analysisResult.richPrediction.expectedGoals.away.toFixed(2)} {match.awayTeam}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      Total {analysisResult.richPrediction.expectedGoals.total.toFixed(2)}
                    </Badge>
                  </div>
                </div>

                {analysisResult.richPrediction.warnings.length > 0 ? (
                  <div className="space-y-2">
                    {analysisResult.richPrediction.warnings.map((warning, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 rounded-lg bg-amber-400/5 border border-amber-400/15 p-3"
                      >
                        <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-muted-foreground">{warning}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-400/5 border border-emerald-400/15 p-3">
                    <CheckCircle className="h-4 w-4 text-emerald-400" />
                    <p className="text-xs text-muted-foreground">
                      No model-data warnings were raised for this snapshot.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">
                  Run AI analysis to inspect real model evidence and data quality.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {analysisResult?.richPrediction && (
        <RichPredictionPanel
          prediction={analysisResult.richPrediction}
          homeTeam={match.homeTeam}
          awayTeam={match.awayTeam}
        />
      )}

      {/* Related Matches */}
      {relatedMatches.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio className="h-4 w-4 text-muted-foreground" />
              Related Matches in {match.league}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {relatedMatches.map((rm) => (
                <Link
                  key={rm.id}
                  href={`/matches/${rm.id}`}
                  className="rounded-lg bg-secondary/50 p-3 hover:bg-secondary transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {rm.status === "live" ? "🔴 LIVE" : rm.status}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{getSportShortName(rm.sport)}</span>
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {rm.homeTeam} vs {rm.awayTeam}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-primary">{rm.homeOdds}</span>
                    <span className="text-xs text-muted-foreground">-</span>
                    <span className="text-xs text-amber-400">{rm.awayOdds}</span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
