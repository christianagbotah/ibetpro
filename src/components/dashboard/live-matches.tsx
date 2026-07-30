"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radio } from "lucide-react";

interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  league: string;
  homeOdds: number;
  awayOdds: number;
  drawOdds: number | null;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  commenceTime: string;
  aiRecommended: string | null;
  aiConfidence: number | null;
}

interface LiveMatchesProps {
  matches: Match[];
}

export function LiveMatches({ matches }: LiveMatchesProps) {
  const liveMatches = matches.filter((m) => m.status === "live");
  const upcomingMatches = matches.filter((m) => m.status === "upcoming").slice(0, 4);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Radio className="h-4 w-4 text-red-500" />
          Live & Upcoming
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 max-h-96 overflow-y-auto">
        {liveMatches.length > 0 && (
          <>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Live Now
            </div>
            {liveMatches.map((match) => (
              <div
                key={match.id}
                className="flex items-center justify-between rounded-lg bg-red-500/5 border border-red-500/20 p-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-live-pulse absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                    </span>
                    <span className="text-xs text-red-400 font-medium">{match.minute}&apos;</span>
                  </div>
                  <p className="text-sm font-medium text-foreground mt-1">
                    {match.homeTeam} vs {match.awayTeam}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-lg font-bold text-foreground">
                      {match.homeScore} - {match.awayScore}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="secondary" className="text-[10px]">
                    {match.league}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1">
                    {match.sport}
                  </p>
                </div>
              </div>
            ))}
          </>
        )}

        {upcomingMatches.length > 0 && (
          <>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-4 mb-2">
              Upcoming
            </div>
            {upcomingMatches.map((match) => (
              <div
                key={match.id}
                className="flex items-center justify-between rounded-lg bg-secondary/50 p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {match.homeTeam} vs {match.awayTeam}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {match.league} &middot; {match.sport}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-right">
                  <div>
                    <div className="text-xs text-muted-foreground">Odds</div>
                    <div className="flex gap-1.5">
                      <span className="text-xs font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                        {match.homeOdds}
                      </span>
                      {match.drawOdds && (
                        <span className="text-xs font-medium text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                          {match.drawOdds}
                        </span>
                      )}
                      <span className="text-xs font-medium text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                        {match.awayOdds}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {liveMatches.length === 0 && upcomingMatches.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No matches available
          </p>
        )}
      </CardContent>
    </Card>
  );
}
