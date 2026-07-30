"use client";

import { useFetch } from "@/lib/hooks";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { useState, useCallback } from "react";

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

  const { data: match, loading: matchLoading } = useFetch<MatchDetail>(`/api/matches?id=${matchId}`, {} as MatchDetail);
  const { data: allMatches, loading: matchesLoading } = useFetch<RelatedMatch[]>("/api/matches", []);
  const [analysisResult, setAnalysisResult] = useState<{
    prediction: { homeWinProb: number; drawProb: number; awayWinProb: number; confidence: number; recommended: string; analysis: string };
    homeTeamStats: TeamStatsData | null;
    awayTeamStats: TeamStatsData | null;
    detailedAnalysis: DetailedAnalysis | null;
  } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [placingBet, setPlacingBet] = useState(false);

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
  const relatedMatches = allMatches.filter(
    (m) => m.id !== match.id && m.league === match.league
  ).slice(0, 4);

  const homeWinProb = match.aiHomeWinProb || analysisResult?.prediction.homeWinProb || 0;
  const drawProb = match.aiDrawProb || analysisResult?.prediction.drawProb || 0;
  const awayWinProb = match.aiAwayWinProb || analysisResult?.prediction.awayWinProb || 0;

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
            {match.league} &middot; {match.sport.charAt(0).toUpperCase() + match.sport.slice(1)}
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
              {!isLive && !isFinished && (
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
                  {match.homeOdds}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <span className="text-2xl text-muted-foreground">vs</span>
              {match.drawOdds && (
                <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                  Draw: {match.drawOdds}
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
                  {match.awayOdds}
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
          {!isFinished && (
            <div className="grid grid-cols-3 gap-3 mt-6">
              <Button
                variant="outline"
                className="border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => handleQuickBet(match.homeTeam, match.homeOdds)}
                disabled={placingBet}
              >
                <Target className="h-3.5 w-3.5 mr-1.5" />
                Home @ {match.homeOdds}
              </Button>
              {match.drawOdds && (
                <Button
                  variant="outline"
                  className="border-muted-foreground/30 text-muted-foreground hover:bg-secondary"
                  onClick={() => handleQuickBet("Draw", match.drawOdds)}
                  disabled={placingBet}
                >
                  Draw @ {match.drawOdds}
                </Button>
              )}
              <Button
                variant="outline"
                className="border-amber-400/30 text-amber-400 hover:bg-amber-400/10"
                onClick={() => handleQuickBet(match.awayTeam, match.awayOdds)}
                disabled={placingBet}
              >
                Away @ {match.awayOdds}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Prediction Visualization */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Brain className="h-4 w-4 text-primary" />
                AI Prediction
              </CardTitle>
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
            {/* Probability Bars */}
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-foreground font-medium">{match.homeTeam}</span>
                  <span className="text-primary font-bold">{Math.round(homeWinProb * 100)}%</span>
                </div>
                <div className="h-3 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${homeWinProb * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-foreground font-medium">Draw</span>
                  <span className="text-muted-foreground font-bold">{Math.round(drawProb * 100)}%</span>
                </div>
                <div className="h-3 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-muted-foreground/50 transition-all"
                    style={{ width: `${drawProb * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-foreground font-medium">{match.awayTeam}</span>
                  <span className="text-amber-400 font-bold">{Math.round(awayWinProb * 100)}%</span>
                </div>
                <div className="h-3 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all"
                    style={{ width: `${awayWinProb * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Confidence */}
            {match.aiConfidence && (
              <div className="flex items-center gap-2 mt-2">
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

            {/* AI Recommendation */}
            {match.aiRecommended && (
              <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <span className="text-sm text-muted-foreground">AI recommends:</span>
                  <span className="text-sm font-bold text-primary">
                    {match.aiRecommended === "home" ? match.homeTeam
                      : match.aiRecommended === "away" ? match.awayTeam
                      : match.aiRecommended === "draw" ? "Draw"
                      : match.aiRecommended === "over" ? "Over 2.5"
                      : "Under 2.5"}
                  </span>
                </div>
              </div>
            )}

            {/* AI Analysis Text */}
            {match.aiAnalysis && (
              <div className="rounded-lg bg-secondary/50 p-3">
                <p className="text-xs text-muted-foreground leading-relaxed">{match.aiAnalysis}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team Comparison */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-amber-400" />
              Team Comparison
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Attack", home: homeWinProb * 100, away: awayWinProb * 100, homeLabel: `${Math.round(homeWinProb * 100)}`, awayLabel: `${Math.round(awayWinProb * 100)}` },
              { label: "Defense", home: (1 - awayWinProb) * 50, away: (1 - homeWinProb) * 50, homeLabel: `${Math.round((1 - awayWinProb) * 50)}`, awayLabel: `${Math.round((1 - homeWinProb) * 50)}` },
              { label: "Overall", home: homeWinProb * 80, away: awayWinProb * 80, homeLabel: `${Math.round(homeWinProb * 80)}`, awayLabel: `${Math.round(awayWinProb * 80)}` },
              { label: "Form", home: homeWinProb * 90, away: awayWinProb * 90, homeLabel: `${Math.round(homeWinProb * 90)}`, awayLabel: `${Math.round(awayWinProb * 90)}` },
            ].map((stat) => {
              const maxVal = Math.max(stat.home, stat.away, 1);
              return (
                <div key={stat.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-foreground font-medium w-8 text-right">{stat.homeLabel}</span>
                    <span className="text-muted-foreground">{stat.label}</span>
                    <span className="text-foreground font-medium w-8">{stat.awayLabel}</span>
                  </div>
                  <div className="flex gap-1">
                    <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${(stat.home / maxVal) * 100}%` }}
                      />
                    </div>
                    <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all ml-auto"
                        style={{ width: `${(stat.away / maxVal) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            <Separator className="my-3" />

            {/* Detailed Analysis Sections */}
            {analysisResult?.detailedAnalysis && (
              <div className="space-y-4">
                {/* Key Factors */}
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Key Factors
                  </div>
                  {analysisResult.detailedAnalysis.keyFactors.map((factor, i) => (
                    <div key={i} className="flex items-start gap-2 mb-1">
                      <ChevronRight className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                      <span className="text-xs text-foreground">{factor}</span>
                    </div>
                  ))}
                </div>

                {/* Strengths */}
                <div>
                  <div className="flex items-center gap-1 text-xs font-medium text-emerald-400 uppercase tracking-wider mb-2">
                    <CheckCircle className="h-3 w-3" />
                    Strengths
                  </div>
                  {analysisResult.detailedAnalysis.strengths.points.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 mb-1">
                      <CheckCircle className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
                      <span className="text-xs text-foreground">{s}</span>
                    </div>
                  ))}
                </div>

                {/* Weaknesses */}
                <div>
                  <div className="flex items-center gap-1 text-xs font-medium text-red-400 uppercase tracking-wider mb-2">
                    <XCircle className="h-3 w-3" />
                    Weaknesses
                  </div>
                  {analysisResult.detailedAnalysis.weaknesses.points.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 mb-1">
                      <XCircle className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />
                      <span className="text-xs text-foreground">{w}</span>
                    </div>
                  ))}
                </div>

                {/* Risk Assessment */}
                <div className="rounded-lg bg-secondary/50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className={`h-4 w-4 ${
                      analysisResult.detailedAnalysis.riskAssessment.level === "low" ? "text-emerald-400" :
                      analysisResult.detailedAnalysis.riskAssessment.level === "medium" ? "text-amber-400" : "text-red-400"
                    }`} />
                    <span className="text-xs font-medium text-foreground">Risk Assessment</span>
                    <Badge className={`text-[10px] ${
                      analysisResult.detailedAnalysis.riskAssessment.level === "low" ? "bg-emerald-400/10 text-emerald-400" :
                      analysisResult.detailedAnalysis.riskAssessment.level === "medium" ? "bg-amber-400/10 text-amber-400" : "bg-red-400/10 text-red-400"
                    }`}>
                      {analysisResult.detailedAnalysis.riskAssessment.level.toUpperCase()}
                    </Badge>
                  </div>
                  {analysisResult.detailedAnalysis.riskAssessment.factors.map((f, i) => (
                    <p key={i} className="text-[11px] text-muted-foreground">{f}</p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
                    <span className="text-[10px] text-muted-foreground">{rm.sport}</span>
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
