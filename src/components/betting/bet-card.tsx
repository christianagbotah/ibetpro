"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Clock, CheckCircle, XCircle, DollarSign } from "lucide-react";

interface BetCardProps {
  bet: {
    id: string;
    betType: string;
    selection: string;
    odds: number;
    stake: number;
    potentialWin: number;
    status: string;
    profit: number | null;
    isAutoPlaced: boolean;
    aiConfidence: number | null;
    aiReasoning: string | null;
    cashoutAmount: number | null;
    placedAt: string;
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
    bettingAccount?: {
      platform: string;
    };
  };
  onCashout?: (betId: string) => void;
}

export function BetCard({ bet, onCashout }: BetCardProps) {
  const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
    pending: { icon: Clock, color: "text-amber-400", label: "Pending" },
    won: { icon: CheckCircle, color: "text-emerald-400", label: "Won" },
    lost: { icon: XCircle, color: "text-red-400", label: "Lost" },
    cashed_out: { icon: DollarSign, color: "text-blue-400", label: "Cashed Out" },
  };

  const config = statusConfig[bet.status] || statusConfig.pending;
  const StatusIcon = config.icon;

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Match Info */}
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-[10px]">
                {bet.match?.sport}
              </Badge>
              <span className="text-xs text-muted-foreground">{bet.match?.league}</span>
              {bet.isAutoPlaced && (
                <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                  <Brain className="h-3 w-3 mr-0.5" />
                  AI
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium text-foreground">
              {bet.match?.homeTeam} vs {bet.match?.awayTeam}
            </p>

            {/* Live Score */}
            {bet.match?.status === "live" && bet.match.homeScore !== null && (
              <div className="flex items-center gap-2 mt-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-live-pulse absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
                <span className="text-sm font-bold text-foreground">
                  {bet.match.homeScore} - {bet.match.awayScore}
                </span>
                <span className="text-xs text-muted-foreground">{bet.match.minute}&apos;</span>
              </div>
            )}

            {/* Bet Details */}
            <div className="mt-2 flex items-center gap-4 text-xs">
              <div>
                <span className="text-muted-foreground">Selection: </span>
                <span className="text-foreground font-medium">{bet.selection}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Odds: </span>
                <span className="text-primary font-medium">{bet.odds}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Stake: </span>
                <span className="text-foreground">${bet.stake.toFixed(2)}</span>
              </div>
            </div>

            {/* AI Reasoning */}
            {bet.aiReasoning && (
              <div className="mt-2 rounded bg-secondary/50 p-2">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {bet.aiReasoning}
                </p>
              </div>
            )}
          </div>

          {/* Status & Profit */}
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-1.5">
              <StatusIcon className={`h-4 w-4 ${config.color}`} />
              <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
            </div>

            {bet.status === "won" && bet.profit !== null && (
              <span className="text-lg font-bold text-emerald-400">
                +${bet.profit.toFixed(2)}
              </span>
            )}
            {bet.status === "lost" && (
              <span className="text-lg font-bold text-red-400">
                -${bet.stake.toFixed(2)}
              </span>
            )}
            {bet.status === "pending" && (
              <span className="text-sm text-muted-foreground">
                Potential: ${bet.potentialWin.toFixed(2)}
              </span>
            )}

            {/* Cashout button */}
            {bet.status === "pending" && bet.cashoutAmount && onCashout && (
              <button
                onClick={() => onCashout(bet.id)}
                className="text-xs bg-amber-400/10 text-amber-400 border border-amber-400/20 rounded px-2 py-1 hover:bg-amber-400/20 transition-colors"
              >
                Cashout ${bet.cashoutAmount.toFixed(2)}
              </button>
            )}
          </div>
        </div>

        {/* Platform */}
        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Platform: {bet.bettingAccount?.platform || "N/A"}</span>
          <span>{new Date(bet.placedAt).toLocaleDateString()}</span>
        </div>
      </CardContent>
    </Card>
  );
}
