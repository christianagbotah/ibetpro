import { prisma } from "@/lib/db";
import type { CanonicalFixture, FootballProvider } from "./canonical";

export async function resolveProviderTeam(
  provider: FootballProvider,
  providerTeamId: string,
  name: string,
  country?: string | null
) {
  return prisma.providerTeamMap.upsert({
    where: {
      provider_providerTeamId: {
        provider,
        providerTeamId,
      },
    },
    update: {
      canonicalName: name,
      country: country ?? null,
    },
    create: {
      provider,
      providerTeamId,
      canonicalName: name,
      country: country ?? null,
    },
  });
}

export async function resolveProviderLeague(
  provider: FootballProvider,
  providerLeagueId: string,
  name: string,
  country?: string | null,
  season?: string | null
) {
  return prisma.providerLeagueMap.upsert({
    where: {
      provider_providerLeagueId: {
        provider,
        providerLeagueId,
      },
    },
    update: {
      canonicalName: name,
      country: country ?? null,
      season: season ?? null,
    },
    create: {
      provider,
      providerLeagueId,
      canonicalName: name,
      country: country ?? null,
      season: season ?? null,
    },
  });
}

export async function ensureFixtureIdentity(fixture: CanonicalFixture) {
  const [home, away, league] = await Promise.all([
    resolveProviderTeam(
      fixture.provider,
      fixture.home.providerTeamId,
      fixture.home.name,
      fixture.home.country
    ),
    resolveProviderTeam(
      fixture.provider,
      fixture.away.providerTeamId,
      fixture.away.name,
      fixture.away.country
    ),
    resolveProviderLeague(
      fixture.provider,
      fixture.league.providerLeagueId,
      fixture.league.name,
      fixture.league.country,
      fixture.league.season
    ),
  ]);

  return { home, away, league };
}
