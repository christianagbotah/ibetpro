"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Zap } from "lucide-react";

interface Bet {
  id: string;
  betType: string;
  selection: string;
  odds: number;
  stake: number;
  potentialWin: number;
  status: string;
  isAutoPlaced: boolean;
  aiConfidence: number | null;
  aiReasoning: string | null;
  match?: {
    homeTeam: string;
    awayTeam: string;
    sport: string;
    league: string;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
    minute: number | null;
  };
}

interface ActiveBetsProps {
  bets: Bet[];
}

export function ActiveBets({ bets }: ActiveBetsProps) {
  const pendingBets = bets.filter((b) => b.status === "pending");

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4 text-amber-400" />
          Active Bets
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 max-h-96 overflow-y-auto">
        {pendingBets.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No active bets
          </p>
        ) : (
          pendingBets.map((bet) => (
            <div
              key={bet.id}
              className="rounded-lg bg-secondary/50 p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {bet.isAutoPlaced && (
                    <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">
                      <Brain className="h-3 w-3 mr-0.5" />
                      AI
                    </Badge>
                  )}
                  <span className="text-sm font-medium text-foreground">
                    {bet.match?.homeTeam} vs {bet.match?.awayTeam}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className={
                    bet.status === "pending"
                      ? "border-amber-400/30 text-amber-400"
                      : "border-border"
                  }
                >
                  {bet.status}
                </Badge>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="text-muted-foreground">Selection: </span>
                  <span className="text-foreground font-medium">{bet.selection}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Odds: </span>
                  <span className="text-primary font-medium">{bet.odds}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="text-muted-foreground">Stake: </span>
                  <span className="text-foreground">${bet.stake.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Potential: </span>
                  <span className="text-emerald-400 font-medium">
                    ${bet.potentialWin.toFixed(2)}
                  </span>
                </div>
              </div>

              {bet.aiConfidence !== null && bet.aiConfidence > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${bet.aiConfidence * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {Math.round(bet.aiConfidence * 100)}% confidence
                  </span>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
