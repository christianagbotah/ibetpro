import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

const adapter = new PrismaBetterSqlite3({ url: "file:./prisma/dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding production database...");

  // Create admin settings
  const adminSettings = await prisma.adminSettings.upsert({
    where: { id: "admin-settings" },
    update: {},
    create: {
      id: "admin-settings",
      defaultCommissionRate: 0.10,
      minCommissionRate: 0.05,
      maxCommissionRate: 0.25,
      platformName: "iBetPro",
      maintenanceMode: false,
      maxUsers: 10000,
      autoApproveAccounts: true,
      oddsApiKey: "",
      apiFootballKey: "",
      accumulatorBonusThresholds: JSON.stringify([
        { legs: 4, bonus: 5 },
        { legs: 5, bonus: 10 },
        { legs: 6, bonus: 20 },
      ]),
    },
  });

  // Create admin user with hashed password
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin@2024";
  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@ibetpro.com" },
    update: {},
    create: {
      email: "admin@ibetpro.com",
      name: "Admin",
      passwordHash: hashedPassword,
      role: "admin",
      balance: 0,
      bankroll: 1000,
      totalProfit: 0,
      totalLoss: 0,
      commissionPaid: 0,
      dailyPnl: 0,
      weeklyPnl: 0,
    },
  });

  // Create admin user settings with enhanced auto-bet config
  await prisma.userSettings.upsert({
    where: { userId: admin.id },
    update: {},
    create: {
      userId: admin.id,
      autoBettingEnabled: false,
      maxBetAmount: 200,
      minOddsThreshold: 1.5,
      maxOddsThreshold: 5.0,
      riskLevel: "medium",
      autoCashoutEnabled: true,
      cashoutThreshold: 0.7,
      commissionRate: 0.10,
      preferredSports: "football,basketball,tennis",
      notificationsEnabled: true,
      dailyBetLimit: 500,
      kellyFraction: 0.25,
      minEdgeThreshold: 0.03,
      betTypes: "single,accumulator",
      maxAccumulatorLegs: 5,
      minAiConfidence: 0.6,
      stopLossDaily: 200,
      stopLossWeekly: 500,
      profitTargetDaily: 300,
      profitTargetWeekly: 1000,
      betScheduleStart: "08:00",
      betScheduleEnd: "22:00",
      partialCashoutEnabled: true,
      partialCashoutPercent: 0.5,
      waitFullSettlement: true,
    },
  });

  // Create a demo betting account for the admin
  await prisma.bettingAccount.upsert({
    where: { id: "demo-account" },
    update: {},
    create: {
      id: "demo-account",
      userId: admin.id,
      platform: "Bet365",
      accountId: "DEMO-001",
      accountName: "Demo Account",
      balance: 1000,
      isConnected: true,
      lastSyncedAt: new Date(),
    },
  });

  // Create sample upcoming matches for testing
  const sampleMatches = [
    {
      sport: "football",
      league: "Premier League",
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      homeOdds: 2.10,
      drawOdds: 3.40,
      awayOdds: 3.50,
      overUnderLine: 2.5,
      overOdds: 1.90,
      underOdds: 1.95,
      commenceTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
      status: "upcoming",
      aiHomeWinProb: 0.45,
      aiDrawProb: 0.28,
      aiAwayWinProb: 0.27,
      aiConfidence: 0.72,
      aiRecommended: "home",
      aiRiskScore: 35,
      aiRiskLevel: "low",
      aiValueEdge: 0.05,
      aiKellyStake: 25,
    },
    {
      sport: "football",
      league: "La Liga",
      homeTeam: "Real Madrid",
      awayTeam: "Barcelona",
      homeOdds: 2.30,
      drawOdds: 3.30,
      awayOdds: 3.10,
      overUnderLine: 2.5,
      overOdds: 1.85,
      underOdds: 2.00,
      commenceTime: new Date(Date.now() + 4 * 60 * 60 * 1000),
      status: "upcoming",
      aiHomeWinProb: 0.40,
      aiDrawProb: 0.27,
      aiAwayWinProb: 0.33,
      aiConfidence: 0.68,
      aiRecommended: "home",
      aiRiskScore: 45,
      aiRiskLevel: "medium",
      aiValueEdge: 0.04,
      aiKellyStake: 20,
    },
    {
      sport: "football",
      league: "Serie A",
      homeTeam: "AC Milan",
      awayTeam: "Inter Milan",
      homeOdds: 2.80,
      drawOdds: 3.20,
      awayOdds: 2.60,
      overUnderLine: 2.5,
      overOdds: 1.88,
      underOdds: 1.95,
      commenceTime: new Date(Date.now() + 6 * 60 * 60 * 1000),
      status: "upcoming",
      aiHomeWinProb: 0.33,
      aiDrawProb: 0.28,
      aiAwayWinProb: 0.39,
      aiConfidence: 0.65,
      aiRecommended: "away",
      aiRiskScore: 50,
      aiRiskLevel: "medium",
      aiValueEdge: 0.03,
      aiKellyStake: 15,
    },
    {
      sport: "football",
      league: "Premier League",
      homeTeam: "Liverpool",
      awayTeam: "Man City",
      homeOdds: 2.50,
      drawOdds: 3.30,
      awayOdds: 2.90,
      overUnderLine: 2.5,
      overOdds: 1.80,
      underOdds: 2.00,
      commenceTime: new Date(Date.now() + 8 * 60 * 60 * 1000),
      status: "upcoming",
      aiHomeWinProb: 0.38,
      aiDrawProb: 0.27,
      aiAwayWinProb: 0.35,
      aiConfidence: 0.62,
      aiRecommended: "home",
      aiRiskScore: 55,
      aiRiskLevel: "medium",
      aiValueEdge: 0.02,
      aiKellyStake: 10,
    },
    {
      sport: "basketball",
      league: "NBA",
      homeTeam: "Lakers",
      awayTeam: "Warriors",
      homeOdds: 1.90,
      awayOdds: 1.95,
      commenceTime: new Date(Date.now() + 3 * 60 * 60 * 1000),
      status: "upcoming",
      aiHomeWinProb: 0.52,
      aiDrawProb: 0,
      aiAwayWinProb: 0.48,
      aiConfidence: 0.70,
      aiRecommended: "home",
      aiRiskScore: 40,
      aiRiskLevel: "low",
      aiValueEdge: 0.04,
      aiKellyStake: 22,
    },
    {
      sport: "football",
      league: "Premier League",
      homeTeam: "Man United",
      awayTeam: "Tottenham",
      homeOdds: 1.85,
      drawOdds: 3.80,
      awayOdds: 4.20,
      overUnderLine: 2.5,
      overOdds: 1.92,
      underOdds: 1.92,
      commenceTime: new Date(Date.now() - 30 * 60 * 1000),
      status: "live",
      homeScore: 1,
      awayScore: 0,
      minute: 35,
      aiHomeWinProb: 0.55,
      aiDrawProb: 0.25,
      aiAwayWinProb: 0.20,
      aiConfidence: 0.75,
      aiRecommended: "home",
      aiRiskScore: 30,
      aiRiskLevel: "low",
      aiValueEdge: 0.06,
      aiKellyStake: 30,
    },
  ];

  for (const match of sampleMatches) {
    await prisma.match.create({ data: match });
  }

  // Create sample team stats
  const sampleTeamStats = [
    { teamName: "Arsenal", sport: "football", league: "Premier League", season: "2024-25", matchesPlayed: 28, wins: 19, draws: 5, losses: 4, goalsFor: 58, goalsAgainst: 22, form: "WWWDW", homeRecord: "12-2-1", awayRecord: "7-3-3", attackRating: 78, defenseRating: 82, overallRating: 80, eloRating: 1750, xgFor: 52, xgAgainst: 24, shotsPerGame: 15.2, shotsOnTargetPerGame: 5.8, possessionAvg: 58, cornersPerGame: 6.5, cardsPerGame: 1.8 },
    { teamName: "Chelsea", sport: "football", league: "Premier League", season: "2024-25", matchesPlayed: 28, wins: 14, draws: 7, losses: 7, goalsFor: 45, goalsAgainst: 32, form: "WDWLW", homeRecord: "9-3-2", awayRecord: "5-4-5", attackRating: 68, defenseRating: 65, overallRating: 66, eloRating: 1620, xgFor: 42, xgAgainst: 34, shotsPerGame: 13.1, shotsOnTargetPerGame: 4.5, possessionAvg: 54, cornersPerGame: 5.8, cardsPerGame: 2.1 },
    { teamName: "Real Madrid", sport: "football", league: "La Liga", season: "2024-25", matchesPlayed: 27, wins: 20, draws: 4, losses: 3, goalsFor: 62, goalsAgainst: 20, form: "WWWWW", homeRecord: "12-1-1", awayRecord: "8-3-2", attackRating: 85, defenseRating: 80, overallRating: 82, eloRating: 1780, xgFor: 58, xgAgainst: 22, shotsPerGame: 16.0, shotsOnTargetPerGame: 6.2, possessionAvg: 60, cornersPerGame: 7.0, cardsPerGame: 1.5 },
    { teamName: "Barcelona", sport: "football", league: "La Liga", season: "2024-25", matchesPlayed: 27, wins: 18, draws: 5, losses: 4, goalsFor: 55, goalsAgainst: 28, form: "WWDWL", homeRecord: "11-2-1", awayRecord: "7-3-3", attackRating: 80, defenseRating: 72, overallRating: 76, eloRating: 1720, xgFor: 52, xgAgainst: 30, shotsPerGame: 14.5, shotsOnTargetPerGame: 5.5, possessionAvg: 62, cornersPerGame: 6.2, cardsPerGame: 1.9 },
    { teamName: "Liverpool", sport: "football", league: "Premier League", season: "2024-25", matchesPlayed: 28, wins: 18, draws: 6, losses: 4, goalsFor: 60, goalsAgainst: 25, form: "WDWWL", homeRecord: "11-2-1", awayRecord: "7-4-3", attackRating: 82, defenseRating: 78, overallRating: 80, eloRating: 1740, xgFor: 56, xgAgainst: 27, shotsPerGame: 15.8, shotsOnTargetPerGame: 6.0, possessionAvg: 57, cornersPerGame: 6.8, cardsPerGame: 1.6 },
    { teamName: "Man City", sport: "football", league: "Premier League", season: "2024-25", matchesPlayed: 28, wins: 17, draws: 6, losses: 5, goalsFor: 56, goalsAgainst: 28, form: "WLDWW", homeRecord: "10-3-1", awayRecord: "7-3-4", attackRating: 80, defenseRating: 75, overallRating: 78, eloRating: 1730, xgFor: 54, xgAgainst: 29, shotsPerGame: 15.0, shotsOnTargetPerGame: 5.7, possessionAvg: 63, cornersPerGame: 7.2, cardsPerGame: 1.4 },
    { teamName: "Man United", sport: "football", league: "Premier League", season: "2024-25", matchesPlayed: 28, wins: 16, draws: 5, losses: 7, goalsFor: 48, goalsAgainst: 30, form: "WLWWL", homeRecord: "10-2-2", awayRecord: "6-3-5", attackRating: 72, defenseRating: 70, overallRating: 71, eloRating: 1680, xgFor: 46, xgAgainst: 32, shotsPerGame: 13.5, shotsOnTargetPerGame: 4.8, possessionAvg: 52, cornersPerGame: 5.5, cardsPerGame: 2.3 },
    { teamName: "Tottenham", sport: "football", league: "Premier League", season: "2024-25", matchesPlayed: 28, wins: 12, draws: 4, losses: 12, goalsFor: 50, goalsAgainst: 45, form: "LWLWL", homeRecord: "8-2-4", awayRecord: "4-2-8", attackRating: 70, defenseRating: 58, overallRating: 64, eloRating: 1580, xgFor: 48, xgAgainst: 46, shotsPerGame: 13.8, shotsOnTargetPerGame: 4.6, possessionAvg: 50, cornersPerGame: 5.2, cardsPerGame: 2.5 },
  ];

  for (const stats of sampleTeamStats) {
    await prisma.teamStats.create({ data: stats });
  }

  console.log("Database seeded successfully!");
  console.log(`Admin settings: ${adminSettings.platformName}`);
  console.log(`Admin user: ${admin.email}`);
  console.log(`Created ${sampleMatches.length} sample matches (6 matches including 1 live)`);
  console.log(`Created ${sampleTeamStats.length} sample team stats`);
  console.log(`Created demo betting account (Bet365, $1000 balance)`);
  console.log("\nConfigure API keys in Admin > API Keys to enable live data.");
  console.log("Register new users via the Sign Up page.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
