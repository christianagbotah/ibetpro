import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create admin settings
  const adminSettings = await prisma.adminSettings.create({
    data: {
      defaultCommissionRate: 0.10,
      minCommissionRate: 0.05,
      maxCommissionRate: 0.25,
      platformName: "iBetPro",
      maintenanceMode: false,
      maxUsers: 10000,
      autoApproveAccounts: true,
    },
  });

  // Create demo user
  const user = await prisma.user.create({
    data: {
      email: "demo@ibetpro.com",
      name: "Alex Johnson",
      avatar: null,
      role: "user",
      balance: 5000.0,
      totalProfit: 2847.50,
      totalLoss: 1235.00,
      commissionPaid: 284.75,
      settings: {
        create: {
          autoBettingEnabled: true,
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
        },
      },
    },
  });

  // Create admin user
  const admin = await prisma.user.create({
    data: {
      email: "admin@ibetpro.com",
      name: "Admin",
      role: "admin",
      balance: 0,
      totalProfit: 0,
      totalLoss: 0,
      commissionPaid: 0,
    },
  });

  // Create betting accounts
  const bet365 = await prisma.bettingAccount.create({
    data: {
      userId: user.id,
      platform: "bet365",
      accountId: "bet365_alex_001",
      accountName: "Alex - Bet365",
      balance: 2340.50,
      currency: "USD",
      isConnected: true,
      lastSyncedAt: new Date(),
    },
  });

  const betway = await prisma.bettingAccount.create({
    data: {
      userId: user.id,
      platform: "betway",
      accountId: "betway_alex_002",
      accountName: "Alex - Betway",
      balance: 1560.00,
      currency: "USD",
      isConnected: true,
      lastSyncedAt: new Date(),
    },
  });

  const sportybet = await prisma.bettingAccount.create({
    data: {
      userId: user.id,
      platform: "sportybet",
      accountId: "sportybet_alex_003",
      accountName: "Alex - Sportybet",
      balance: 0,
      currency: "USD",
      isConnected: false,
    },
  });

  // Create team stats
  const teams = [
    { teamName: "Manchester City", sport: "football", league: "Premier League", season: "2024/25", matchesPlayed: 28, wins: 22, draws: 3, losses: 3, goalsFor: 68, goalsAgainst: 22, form: "WWWDW", homeRecord: "12-1-1", awayRecord: "10-2-2", attackRating: 92, defenseRating: 88, overallRating: 90 },
    { teamName: "Arsenal", sport: "football", league: "Premier League", season: "2024/25", matchesPlayed: 28, wins: 20, draws: 5, losses: 3, goalsFor: 60, goalsAgainst: 20, form: "WWDWW", homeRecord: "11-2-1", awayRecord: "9-3-2", attackRating: 87, defenseRating: 90, overallRating: 88 },
    { teamName: "Liverpool", sport: "football", league: "Premier League", season: "2024/25", matchesPlayed: 28, wins: 19, draws: 4, losses: 5, goalsFor: 62, goalsAgainst: 28, form: "WDWLW", homeRecord: "11-2-1", awayRecord: "8-2-4", attackRating: 89, defenseRating: 82, overallRating: 86 },
    { teamName: "Real Madrid", sport: "football", league: "La Liga", season: "2024/25", matchesPlayed: 26, wins: 21, draws: 3, losses: 2, goalsFor: 65, goalsAgainst: 20, form: "WWWWW", homeRecord: "12-1-0", awayRecord: "9-2-2", attackRating: 94, defenseRating: 87, overallRating: 91 },
    { teamName: "Barcelona", sport: "football", league: "La Liga", season: "2024/25", matchesPlayed: 26, wins: 19, draws: 4, losses: 3, goalsFor: 64, goalsAgainst: 25, form: "WWDDW", homeRecord: "11-2-0", awayRecord: "8-2-3", attackRating: 90, defenseRating: 84, overallRating: 87 },
    { teamName: "LA Lakers", sport: "basketball", league: "NBA", season: "2024/25", matchesPlayed: 65, wins: 42, draws: 0, losses: 23, goalsFor: 0, goalsAgainst: 0, form: "WWLWW", homeRecord: "24-8-0", awayRecord: "18-15-0", attackRating: 85, defenseRating: 78, overallRating: 82 },
    { teamName: "Boston Celtics", sport: "basketball", league: "NBA", season: "2024/25", matchesPlayed: 65, wins: 48, draws: 0, losses: 17, goalsFor: 0, goalsAgainst: 0, form: "WWWWW", homeRecord: "27-5-0", awayRecord: "21-12-0", attackRating: 91, defenseRating: 89, overallRating: 90 },
    { teamName: "Golden State Warriors", sport: "basketball", league: "NBA", season: "2024/25", matchesPlayed: 65, wins: 38, draws: 0, losses: 27, goalsFor: 0, goalsAgainst: 0, form: "WLWLW", homeRecord: "22-9-0", awayRecord: "16-18-0", attackRating: 88, defenseRating: 75, overallRating: 81 },
    { teamName: "Novak Djokovic", sport: "tennis", league: "ATP", season: "2025", matchesPlayed: 35, wins: 28, draws: 0, losses: 7, goalsFor: 0, goalsAgainst: 0, form: "WWLWW", attackRating: 92, defenseRating: 90, overallRating: 91 },
    { teamName: "Carlos Alcaraz", sport: "tennis", league: "ATP", season: "2025", matchesPlayed: 40, wins: 34, draws: 0, losses: 6, goalsFor: 0, goalsAgainst: 0, form: "WWWWW", attackRating: 95, defenseRating: 86, overallRating: 93 },
  ];

  for (const team of teams) {
    await prisma.teamStats.create({ data: team });
  }

  // Create matches
  const now = new Date();
  const matches = [
    { sport: "football", league: "Premier League", homeTeam: "Manchester City", awayTeam: "Arsenal", homeOdds: 1.85, drawOdds: 3.40, awayOdds: 4.20, overUnderLine: 2.5, overOdds: 1.90, underOdds: 2.00, commenceTime: new Date(now.getTime() + 2 * 60 * 60 * 1000), status: "upcoming", aiHomeWinProb: 0.52, aiDrawProb: 0.24, aiAwayWinProb: 0.24, aiConfidence: 0.78, aiRecommended: "home", aiAnalysis: "Manchester City have a strong home record (12-1-1) and are in excellent form (WWWDW). Their attack rating (92) is significantly higher than Arsenal's defense (90). Key factor: City's pressing game at Etihad has been dominant this season. Recommended bet: Man City Win with high confidence." },
    { sport: "football", league: "Premier League", homeTeam: "Liverpool", awayTeam: "Manchester City", homeOdds: 2.50, drawOdds: 3.20, awayOdds: 2.80, overUnderLine: 2.5, overOdds: 1.85, underOdds: 2.00, commenceTime: new Date(now.getTime() + 24 * 60 * 60 * 1000), status: "upcoming", aiHomeWinProb: 0.35, aiDrawProb: 0.28, aiAwayWinProb: 0.37, aiConfidence: 0.55, aiRecommended: "under", aiAnalysis: "This is a tight contest between two top teams. Liverpool's home advantage is countered by City's overall quality. The AI suggests a low-scoring affair based on both teams' defensive capabilities. Under 2.5 goals offers the best value at 2.00." },
    { sport: "football", league: "La Liga", homeTeam: "Real Madrid", awayTeam: "Barcelona", homeOdds: 2.10, drawOdds: 3.30, awayOdds: 3.50, overUnderLine: 2.5, overOdds: 1.75, underOdds: 2.15, commenceTime: new Date(now.getTime() + 3 * 60 * 60 * 1000), status: "upcoming", aiHomeWinProb: 0.45, aiDrawProb: 0.23, aiAwayWinProb: 0.32, aiConfidence: 0.72, aiRecommended: "home", aiAnalysis: "El Clasico! Real Madrid's home form is exceptional (12-1-0) and they're on a 5-match winning streak. Their attack rating (94) is the highest in the dataset. Barcelona's away defense (84) may struggle against Madrid's firepower. Recommended: Real Madrid Win." },
    { sport: "basketball", league: "NBA", homeTeam: "Boston Celtics", awayTeam: "LA Lakers", homeOdds: 1.55, awayOdds: 2.50, overUnderLine: 220.5, overOdds: 1.90, underOdds: 1.95, commenceTime: new Date(now.getTime() + 5 * 60 * 60 * 1000), status: "upcoming", aiHomeWinProb: 0.62, aiDrawProb: 0, aiAwayWinProb: 0.38, aiConfidence: 0.81, aiRecommended: "home", aiAnalysis: "Boston Celtics have the best record in the NBA (48-17) and are dominant at home (27-5). Their overall rating (90) surpasses the Lakers (82). The Lakers' away record (18-15) is mediocre. Celtics win is the clear pick here." },
    { sport: "basketball", league: "NBA", homeTeam: "Golden State Warriors", awayTeam: "Boston Celtics", homeOdds: 2.30, awayOdds: 1.60, overUnderLine: 225.0, overOdds: 1.87, underOdds: 1.98, commenceTime: new Date(now.getTime() + 48 * 60 * 60 * 1000), status: "upcoming", aiHomeWinProb: 0.38, aiDrawProb: 0, aiAwayWinProb: 0.62, aiConfidence: 0.70, aiRecommended: "away", aiAnalysis: "Even at Golden State, the Celtics' superior defense (89 vs 75) and overall quality (90 vs 81) should prevail. Warriors' home advantage (22-9) helps but Celtics are the stronger team. Recommended: Celtics ML." },
    { sport: "tennis", league: "ATP", homeTeam: "Carlos Alcaraz", awayTeam: "Novak Djokovic", homeOdds: 1.75, awayOdds: 2.10, overUnderLine: 2.5, overOdds: 1.80, underOdds: 2.05, commenceTime: new Date(now.getTime() + 6 * 60 * 60 * 1000), status: "upcoming", aiHomeWinProb: 0.55, aiDrawProb: 0, aiAwayWinProb: 0.45, aiConfidence: 0.65, aiRecommended: "home", aiAnalysis: "Alcaraz is in phenomenal form (34-6, 5-match winning streak) with the highest attack rating (95). Djokovic's experience (28-7) makes this competitive but Alcaraz's raw power on hard courts gives him the edge. Slight lean to Alcaraz." },
    // Live match
    { sport: "football", league: "Premier League", homeTeam: "Arsenal", awayTeam: "Liverpool", homeOdds: 1.90, drawOdds: 3.50, awayOdds: 3.80, overUnderLine: 2.5, overOdds: 1.85, underOdds: 2.05, commenceTime: new Date(now.getTime() - 45 * 60 * 1000), status: "live", homeScore: 1, awayScore: 0, minute: 34, aiHomeWinProb: 0.58, aiDrawProb: 0.25, aiAwayWinProb: 0.17, aiConfidence: 0.74, aiRecommended: "home", aiAnalysis: "Arsenal leading 1-0 at 34 minutes. Their defensive record at home is excellent. Liverpool need to push forward which could create counter-attack opportunities. Arsenal win looks solid." },
    // Finished matches
    { sport: "football", league: "Premier League", homeTeam: "Manchester City", awayTeam: "Liverpool", homeOdds: 1.70, drawOdds: 3.60, awayOdds: 4.50, overUnderLine: 2.5, overOdds: 1.90, underOdds: 2.05, commenceTime: new Date(now.getTime() - 48 * 60 * 60 * 1000), status: "finished", homeScore: 3, awayScore: 1, aiHomeWinProb: 0.58, aiDrawProb: 0.22, aiAwayWinProb: 0.20, aiConfidence: 0.76, aiRecommended: "home" },
    { sport: "basketball", league: "NBA", homeTeam: "LA Lakers", awayTeam: "Golden State Warriors", homeOdds: 1.80, awayOdds: 2.00, overUnderLine: 228.5, overOdds: 1.90, underOdds: 1.95, commenceTime: new Date(now.getTime() - 24 * 60 * 60 * 1000), status: "finished", homeScore: 112, awayScore: 108, aiHomeWinProb: 0.53, aiDrawProb: 0, aiAwayWinProb: 0.47, aiConfidence: 0.60, aiRecommended: "home" },
  ];

  const matchRecords = [];
  for (const match of matches) {
    const record = await prisma.match.create({ data: match });
    matchRecords.push(record);
  }

  // Create bets
  const bets = [
    { userId: user.id, bettingAccountId: bet365.id, matchId: matchRecords[0].id, betType: "home_win", selection: "Manchester City", odds: 1.85, stake: 100, potentialWin: 185, status: "pending", isAutoPlaced: true, aiConfidence: 0.78, aiReasoning: "AI detected strong value in Man City home win. Their form (WWWDW) and home record (12-1-1) make this a high-confidence pick.", placedAt: new Date() },
    { userId: user.id, bettingAccountId: bet365.id, matchId: matchRecords[2].id, betType: "home_win", selection: "Real Madrid", odds: 2.10, stake: 150, potentialWin: 315, status: "pending", isAutoPlaced: true, aiConfidence: 0.72, aiReasoning: "Real Madrid's exceptional home record and El Clasico dominance. AI recommends this as a value bet.", placedAt: new Date() },
    { userId: user.id, bettingAccountId: betway.id, matchId: matchRecords[3].id, betType: "home_win", selection: "Boston Celtics", odds: 1.55, stake: 200, potentialWin: 310, status: "pending", isAutoPlaced: true, aiConfidence: 0.81, aiReasoning: "Celtics have the best record in NBA and dominate at home. High confidence pick with reasonable odds.", placedAt: new Date() },
    { userId: user.id, bettingAccountId: bet365.id, matchId: matchRecords[6].id, betType: "home_win", selection: "Arsenal", odds: 1.90, stake: 120, potentialWin: 228, status: "pending", isAutoPlaced: true, aiConfidence: 0.74, aiReasoning: "Arsenal leading 1-0 at 34 min. Live bet with strong position. Cashout recommended if lead holds to 70 min.", placedAt: new Date() },
    { userId: user.id, bettingAccountId: bet365.id, matchId: matchRecords[7].id, betType: "home_win", selection: "Manchester City", odds: 1.70, stake: 100, potentialWin: 170, status: "won", profit: 70, isAutoPlaced: true, aiConfidence: 0.76, aiReasoning: "AI prediction was correct. Man City won 3-1.", placedAt: new Date(now.getTime() - 48 * 60 * 60 * 1000), settledAt: new Date(now.getTime() - 47 * 60 * 60 * 1000) },
    { userId: user.id, bettingAccountId: betway.id, matchId: matchRecords[8].id, betType: "home_win", selection: "LA Lakers", odds: 1.80, stake: 80, potentialWin: 144, status: "won", profit: 64, isAutoPlaced: true, aiConfidence: 0.60, aiReasoning: "AI prediction correct. Lakers won 112-108.", placedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000), settledAt: new Date(now.getTime() - 23 * 60 * 60 * 1000) },
    { userId: user.id, bettingAccountId: bet365.id, matchId: matchRecords[1].id, betType: "under", selection: "Under 2.5 Goals", odds: 2.00, stake: 50, potentialWin: 100, status: "pending", isAutoPlaced: false, aiConfidence: 0.55, aiReasoning: "Tight contest expected. Low-scoring game predicted.", placedAt: new Date() },
  ];

  for (const bet of bets) {
    await prisma.bet.create({ data: bet });
  }

  // Create transactions
  const transactions = [
    { userId: user.id, type: "deposit", amount: 5000, currency: "USD", status: "completed", description: "Initial deposit" },
    { userId: user.id, type: "bet_won", amount: 170, currency: "USD", status: "completed", description: "Man City vs Liverpool - Home Win" },
    { userId: user.id, type: "commission", amount: 17, currency: "USD", status: "completed", description: "10% commission on Man City win" },
    { userId: user.id, type: "bet_won", amount: 144, currency: "USD", status: "completed", description: "Lakers vs Warriors - Home Win" },
    { userId: user.id, type: "commission", amount: 14.40, currency: "USD", status: "completed", description: "10% commission on Lakers win" },
    { userId: user.id, type: "bet_placed", amount: -100, currency: "USD", status: "completed", description: "Man City vs Arsenal - Home Win" },
    { userId: user.id, type: "bet_placed", amount: -150, currency: "USD", status: "completed", description: "Real Madrid vs Barcelona - Home Win" },
    { userId: user.id, type: "bet_placed", amount: -200, currency: "USD", status: "completed", description: "Celtics vs Lakers - Home Win" },
  ];

  for (const tx of transactions) {
    await prisma.transaction.create({ data: tx });
  }

  console.log("Database seeded successfully!");
  console.log(`Created: ${teams.length} teams, ${matches.length} matches, ${bets.length} bets, ${transactions.length} transactions`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
