import type {
  CanonicalFixture,
  CanonicalLeagueRef,
  CanonicalTeamRef,
} from "./canonical";

function mapStatus(short: string): CanonicalFixture["status"] {
  if (["1H", "HT", "2H", "ET", "BT", "P", "LIVE"].includes(short)) return "live";
  if (["FT", "AET", "PEN", "AWD", "WO"].includes(short)) return "finished";
  if (["PST", "SUSP", "INT"].includes(short)) return "postponed";
  if (["CANC", "ABD"].includes(short)) return "cancelled";
  return "upcoming";
}

export function normalizeApiFootballFixture(item: any): CanonicalFixture {
  const fixture = item?.fixture || {};
  const teams = item?.teams || {};
  const league = item?.league || {};
  const goals = item?.goals || {};
  const status = fixture?.status || {};

  const leagueRef: CanonicalLeagueRef = {
    provider: "api-football",
    providerLeagueId: String(league.id ?? ""),
    name: String(league.name ?? "Unknown league"),
    country: league.country ? String(league.country) : null,
    season: String(league.season ?? ""),
  };

  const home: CanonicalTeamRef = {
    provider: "api-football",
    providerTeamId: String(teams?.home?.id ?? ""),
    name: String(teams?.home?.name ?? "Unknown home team"),
    country: teams?.home?.country ? String(teams.home.country) : null,
  };

  const away: CanonicalTeamRef = {
    provider: "api-football",
    providerTeamId: String(teams?.away?.id ?? ""),
    name: String(teams?.away?.name ?? "Unknown away team"),
    country: teams?.away?.country ? String(teams.away.country) : null,
  };

  return {
    provider: "api-football",
    providerFixtureId: String(fixture.id ?? ""),
    kickoffUtc: String(fixture.date ?? new Date().toISOString()),
    status: mapStatus(String(status.short ?? "NS")),
    minute: status.elapsed == null ? null : Number(status.elapsed),
    league: leagueRef,
    home,
    away,
    score: {
      home: goals.home == null ? null : Number(goals.home),
      away: goals.away == null ? null : Number(goals.away),
    },
    lastProviderUpdate: new Date().toISOString(),
  };
}

export function normalizeApiFootballFixtures(items: unknown[]): CanonicalFixture[] {
  return items
    .map(normalizeApiFootballFixture)
    .filter(
      (fixture) =>
        fixture.providerFixtureId &&
        fixture.home.providerTeamId &&
        fixture.away.providerTeamId
    );
}
