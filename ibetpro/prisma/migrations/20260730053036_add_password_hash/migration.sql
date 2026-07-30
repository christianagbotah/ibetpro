-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "avatar" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "balance" REAL NOT NULL DEFAULT 0,
    "totalProfit" REAL NOT NULL DEFAULT 0,
    "totalLoss" REAL NOT NULL DEFAULT 0,
    "commissionPaid" REAL NOT NULL DEFAULT 0,
    "bankroll" REAL NOT NULL DEFAULT 1000,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "autoBettingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxBetAmount" REAL NOT NULL DEFAULT 100,
    "minOddsThreshold" REAL NOT NULL DEFAULT 1.5,
    "maxOddsThreshold" REAL NOT NULL DEFAULT 5.0,
    "riskLevel" TEXT NOT NULL DEFAULT 'medium',
    "autoCashoutEnabled" BOOLEAN NOT NULL DEFAULT true,
    "cashoutThreshold" REAL NOT NULL DEFAULT 0.7,
    "commissionRate" REAL NOT NULL DEFAULT 0.10,
    "preferredSports" TEXT NOT NULL DEFAULT 'football,basketball,tennis',
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyBetLimit" REAL NOT NULL DEFAULT 500,
    "kellyFraction" REAL NOT NULL DEFAULT 0.25,
    "minEdgeThreshold" REAL NOT NULL DEFAULT 0.03,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BettingAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "balance" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isConnected" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BettingAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT,
    "sport" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "homeOdds" REAL NOT NULL,
    "drawOdds" REAL,
    "awayOdds" REAL NOT NULL,
    "overUnderLine" REAL DEFAULT 2.5,
    "overOdds" REAL,
    "underOdds" REAL,
    "commenceTime" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'upcoming',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "minute" INTEGER,
    "apiSource" TEXT DEFAULT 'manual',
    "lastSyncedAt" DATETIME,
    "aiHomeWinProb" REAL DEFAULT 0,
    "aiDrawProb" REAL DEFAULT 0,
    "aiAwayWinProb" REAL DEFAULT 0,
    "aiConfidence" REAL DEFAULT 0,
    "aiAnalysis" TEXT,
    "aiRecommended" TEXT,
    "aiRiskScore" REAL DEFAULT 50,
    "aiRiskLevel" TEXT DEFAULT 'medium',
    "aiValueEdge" REAL DEFAULT 0,
    "aiKellyStake" REAL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TeamStats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamName" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "goalsFor" INTEGER NOT NULL DEFAULT 0,
    "goalsAgainst" INTEGER NOT NULL DEFAULT 0,
    "form" TEXT DEFAULT '',
    "homeRecord" TEXT DEFAULT '',
    "awayRecord" TEXT DEFAULT '',
    "attackRating" REAL NOT NULL DEFAULT 0,
    "defenseRating" REAL NOT NULL DEFAULT 0,
    "overallRating" REAL NOT NULL DEFAULT 0,
    "eloRating" REAL NOT NULL DEFAULT 1500,
    "xgFor" REAL NOT NULL DEFAULT 0,
    "xgAgainst" REAL NOT NULL DEFAULT 0,
    "shotsPerGame" REAL NOT NULL DEFAULT 0,
    "shotsOnTargetPerGame" REAL NOT NULL DEFAULT 0,
    "possessionAvg" REAL NOT NULL DEFAULT 50,
    "cornersPerGame" REAL NOT NULL DEFAULT 0,
    "cardsPerGame" REAL NOT NULL DEFAULT 0,
    "keyPlayers" TEXT DEFAULT '[]',
    "externalTeamId" INTEGER,
    "apiSource" TEXT DEFAULT 'manual',
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Bet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "bettingAccountId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "betType" TEXT NOT NULL,
    "selection" TEXT NOT NULL,
    "odds" REAL NOT NULL,
    "stake" REAL NOT NULL,
    "potentialWin" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "cashoutAmount" REAL,
    "cashoutOdds" REAL,
    "profit" REAL,
    "commission" REAL,
    "isAutoPlaced" BOOLEAN NOT NULL DEFAULT false,
    "aiConfidence" REAL DEFAULT 0,
    "aiReasoning" TEXT,
    "aiModelUsed" TEXT DEFAULT 'ensemble',
    "kellyStake" REAL DEFAULT 0,
    "valueEdge" REAL DEFAULT 0,
    "riskScore" REAL DEFAULT 50,
    "placedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" DATETIME,
    "cashedOutAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Bet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Bet_bettingAccountId_fkey" FOREIGN KEY ("bettingAccountId") REFERENCES "BettingAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Bet_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'completed',
    "description" TEXT,
    "betId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdminSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "defaultCommissionRate" REAL NOT NULL DEFAULT 0.10,
    "minCommissionRate" REAL NOT NULL DEFAULT 0.05,
    "maxCommissionRate" REAL NOT NULL DEFAULT 0.25,
    "platformName" TEXT NOT NULL DEFAULT 'iBetPro',
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maxUsers" INTEGER NOT NULL DEFAULT 10000,
    "autoApproveAccounts" BOOLEAN NOT NULL DEFAULT true,
    "oddsApiKey" TEXT DEFAULT '',
    "apiFootballKey" TEXT DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Match_externalId_key" ON "Match"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamStats_teamName_sport_league_season_key" ON "TeamStats"("teamName", "sport", "league", "season");
