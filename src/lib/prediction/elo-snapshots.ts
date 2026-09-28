import { prisma } from "@/lib/db";

const DEFAULT_ELO = 1500;
const HOME_ADVANTAGE = 65;
const K_FACTOR = 24;

function expectedHome(homeRating: number, awayRating: number): number {
  return 1 / (1 + 10 ** ((awayRating - (homeRating + HOME_ADVANTAGE)) / 400));
}

function actualScores(homeGoals: number, awayGoals: number): [number, number] {
  if (homeGoals > awayGoals) return [1, 0];
  if (homeGoals < awayGoals) return [0, 1];
  return [0.5, 0.5];
}

export async function rebuildLeagueEloSnapshots(
  sport: string,
  league: string
) {
  const matches = await prisma.match.findMany({
    where: {
      sport,
      league,
      status: "finished",
      homeScore: { not: null },
      awayScore: { not: null },
    },
    orderBy: [{ commenceTime: "asc" }, { id: "asc" }],
    select: {
      id: true,
      commenceTime: true,
      homeTeam: true,
      awayTeam: true,
      homeScore: true,
      awayScore: true,
    },
  });

  const ratings = new Map<string, number>();
  const rows: Array<{
    matchId: string;
    teamName: string;
    sport: string;
    league: string;
    ratingBefore: number;
    ratingAfter: number;
    asOf: Date;
  }> = [];

  for (const match of matches) {
    const homeBefore = ratings.get(match.homeTeam) ?? DEFAULT_ELO;
    const awayBefore = ratings.get(match.awayTeam) ?? DEFAULT_ELO;

    const expectedH = expectedHome(homeBefore, awayBefore);
    const expectedA = 1 - expectedH;
    const [actualH, actualA] = actualScores(match.homeScore!, match.awayScore!);

    const homeAfter = homeBefore + K_FACTOR * (actualH - expectedH);
    const awayAfter = awayBefore + K_FACTOR * (actualA - expectedA);

    rows.push(
      {
        matchId: match.id,
        teamName: match.homeTeam,
        sport,
        league,
        ratingBefore: homeBefore,
        ratingAfter: homeAfter,
        asOf: match.commenceTime,
      },
      {
        matchId: match.id,
        teamName: match.awayTeam,
        sport,
        league,
        ratingBefore: awayBefore,
        ratingAfter: awayAfter,
        asOf: match.commenceTime,
      }
    );

    ratings.set(match.homeTeam, homeAfter);
    ratings.set(match.awayTeam, awayAfter);
  }

  await prisma.$transaction(async (tx) => {
    await tx.teamEloSnapshot.deleteMany({ where: { sport, league } });
    for (const row of rows) {
      await tx.teamEloSnapshot.create({ data: row });
    }
  });

  return {
    sport,
    league,
    matchesProcessed: matches.length,
    snapshotsCreated: rows.length,
    teams: ratings.size,
  };
}

export async function getCausalElo(
  teamName: string,
  sport: string,
  league: string,
  asOf: Date
): Promise<number> {
  const snapshot = await prisma.teamEloSnapshot.findFirst({
    where: {
      teamName,
      sport,
      league,
      asOf: { lt: asOf },
    },
    orderBy: [{ asOf: "desc" }, { createdAt: "desc" }],
    select: { ratingAfter: true },
  });

  return snapshot?.ratingAfter ?? DEFAULT_ELO;
}
