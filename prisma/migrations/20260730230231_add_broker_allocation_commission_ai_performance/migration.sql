-- CreateTable
CREATE TABLE "Allocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "bettingAccountId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "previousAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "usedAmount" REAL NOT NULL DEFAULT 0,
    "remainingAmount" REAL NOT NULL DEFAULT 0,
    "profitFromAlloc" REAL NOT NULL DEFAULT 0,
    "commissionFromAlloc" REAL NOT NULL DEFAULT 0,
    "activatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Allocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Allocation_bettingAccountId_fkey" FOREIGN KEY ("bettingAccountId") REFERENCES "BettingAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommissionLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "bettingAccountId" TEXT NOT NULL,
    "betId" TEXT,
    "accumulatorId" TEXT,
    "grossProfit" REAL NOT NULL DEFAULT 0,
    "commissionRate" REAL NOT NULL DEFAULT 0.10,
    "commissionAmount" REAL NOT NULL DEFAULT 0,
    "netProfit" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "transferRef" TEXT,
    "transferredAt" DATETIME,
    "failureReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommissionLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommissionLedger_bettingAccountId_fkey" FOREIGN KEY ("bettingAccountId") REFERENCES "BettingAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AIModelPerformance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modelVersion" TEXT NOT NULL DEFAULT 'v2_ensemble',
    "totalPredictions" INTEGER NOT NULL DEFAULT 0,
    "correctPredictions" INTEGER NOT NULL DEFAULT 0,
    "accuracyRate" REAL NOT NULL DEFAULT 0,
    "avgConfidence" REAL NOT NULL DEFAULT 0,
    "avgValueEdge" REAL NOT NULL DEFAULT 0,
    "totalProfit" REAL NOT NULL DEFAULT 0,
    "totalLoss" REAL NOT NULL DEFAULT 0,
    "roi" REAL NOT NULL DEFAULT 0,
    "sharpeRatio" REAL NOT NULL DEFAULT 0,
    "maxDrawdown" REAL NOT NULL DEFAULT 0,
    "sport" TEXT NOT NULL DEFAULT 'all',
    "period" TEXT NOT NULL DEFAULT 'daily',
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AdminSettings" (
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
    "accumulatorBonusThresholds" TEXT DEFAULT '[]',
    "adminWalletAddress" TEXT DEFAULT '',
    "adminBankName" TEXT DEFAULT '',
    "adminAccountNumber" TEXT DEFAULT '',
    "autoCommissionTransfer" BOOLEAN NOT NULL DEFAULT true,
    "minimumCommissionPayout" REAL NOT NULL DEFAULT 10,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AdminSettings" ("accumulatorBonusThresholds", "apiFootballKey", "autoApproveAccounts", "createdAt", "defaultCommissionRate", "id", "maintenanceMode", "maxCommissionRate", "maxUsers", "minCommissionRate", "oddsApiKey", "platformName", "updatedAt") SELECT "accumulatorBonusThresholds", "apiFootballKey", "autoApproveAccounts", "createdAt", "defaultCommissionRate", "id", "maintenanceMode", "maxCommissionRate", "maxUsers", "minCommissionRate", "oddsApiKey", "platformName", "updatedAt" FROM "AdminSettings";
DROP TABLE "AdminSettings";
ALTER TABLE "new_AdminSettings" RENAME TO "AdminSettings";
CREATE TABLE "new_BettingAccount" (
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
    "brokerType" TEXT DEFAULT 'manual',
    "brokerRegion" TEXT,
    "brokerUserId" TEXT,
    "allocatedAmount" REAL NOT NULL DEFAULT 0,
    "maxAllocation" REAL NOT NULL DEFAULT 0,
    "allocationLock" BOOLEAN NOT NULL DEFAULT false,
    "sessionToken" TEXT,
    "sessionExpiry" DATETIME,
    "lastBetPlacedAt" DATETIME,
    "totalBrokerBets" INTEGER NOT NULL DEFAULT 0,
    "totalBrokerProfit" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BettingAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BettingAccount" ("accessToken", "accountId", "accountName", "balance", "createdAt", "currency", "id", "isConnected", "lastSyncedAt", "platform", "refreshToken", "updatedAt", "userId") SELECT "accessToken", "accountId", "accountName", "balance", "createdAt", "currency", "id", "isConnected", "lastSyncedAt", "platform", "refreshToken", "updatedAt", "userId" FROM "BettingAccount";
DROP TABLE "BettingAccount";
ALTER TABLE "new_BettingAccount" RENAME TO "BettingAccount";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Allocation_userId_idx" ON "Allocation"("userId");

-- CreateIndex
CREATE INDEX "Allocation_bettingAccountId_idx" ON "Allocation"("bettingAccountId");

-- CreateIndex
CREATE INDEX "Allocation_status_idx" ON "Allocation"("status");

-- CreateIndex
CREATE INDEX "CommissionLedger_userId_idx" ON "CommissionLedger"("userId");

-- CreateIndex
CREATE INDEX "CommissionLedger_bettingAccountId_idx" ON "CommissionLedger"("bettingAccountId");

-- CreateIndex
CREATE INDEX "CommissionLedger_status_idx" ON "CommissionLedger"("status");

-- CreateIndex
CREATE INDEX "CommissionLedger_createdAt_idx" ON "CommissionLedger"("createdAt");

-- CreateIndex
CREATE INDEX "AIModelPerformance_modelVersion_idx" ON "AIModelPerformance"("modelVersion");

-- CreateIndex
CREATE INDEX "AIModelPerformance_sport_idx" ON "AIModelPerformance"("sport");

-- CreateIndex
CREATE INDEX "AIModelPerformance_period_idx" ON "AIModelPerformance"("period");
