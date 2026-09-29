export type FootballProvider = "api-football" | "sportmonks" | "odds-api";

export interface CanonicalTeamRef {
  provider: FootballProvider;
  providerTeamId: string;
  name: string;
  country?: string | null;
}

export interface CanonicalLeagueRef {
  provider: FootballProvider;
  providerLeagueId: string;
  name: string;
  country?: string | null;
  season: string;
}

export interface CanonicalFixture {
  provider: FootballProvider;
  providerFixtureId: string;
  kickoffUtc: string;
  status: "upcoming" | "live" | "finished" | "postponed" | "cancelled";
  minute?: number | null;
  league: CanonicalLeagueRef;
  home: CanonicalTeamRef;
  away: CanonicalTeamRef;
  score: {
    home: number | null;
    away: number | null;
  };
  lastProviderUpdate?: string | null;
}

export interface CanonicalOddsSnapshot {
  provider: FootballProvider;
  providerFixtureId: string;
  capturedAt: string;
  bookmaker?: string | null;
  home?: number | null;
  draw?: number | null;
  away?: number | null;
  over25?: number | null;
  under25?: number | null;
}

export interface CanonicalTeamMatchStats {
  provider: FootballProvider;
  providerFixtureId: string;
  providerTeamId: string;
  capturedAt: string;
  xg?: number | null;
  possession?: number | null;
  shots?: number | null;
  shotsOnTarget?: number | null;
  corners?: number | null;
  yellowCards?: number | null;
  redCards?: number | null;
}

export interface HistoricalFixtureRow {
  fixture_id: string;
  kickoff_utc: string;
  league: string;
  season: string;
  home_team_id: string;
  away_team_id: string;
  home_goals: number;
  away_goals: number;
  home_xg?: number | null;
  away_xg?: number | null;
  home_shots?: number | null;
  away_shots?: number | null;
  home_sot?: number | null;
  away_sot?: number | null;
  home_odds?: number | null;
  draw_odds?: number | null;
  away_odds?: number | null;
}

export function canonicalFixtureKey(
  provider: FootballProvider,
  providerFixtureId: string
): string {
  return `${provider}:${providerFixtureId}`;
}

export function canonicalTeamKey(
  provider: FootballProvider,
  providerTeamId: string
): string {
  return `${provider}:${providerTeamId}`;
}
