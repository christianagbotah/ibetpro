Loaded Prisma config from prisma.config.ts.

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `avatar` VARCHAR(191) NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'user',
    `balance` DOUBLE NOT NULL DEFAULT 0,
    `totalProfit` DOUBLE NOT NULL DEFAULT 0,
    `totalLoss` DOUBLE NOT NULL DEFAULT 0,
    `commissionPaid` DOUBLE NOT NULL DEFAULT 0,
    `bankroll` DOUBLE NOT NULL DEFAULT 1000,
    `dailyPnl` DOUBLE NOT NULL DEFAULT 0,
    `weeklyPnl` DOUBLE NOT NULL DEFAULT 0,
    `region` VARCHAR(191) NULL DEFAULT 'ng',
    `currency` VARCHAR(191) NULL DEFAULT 'NGN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserSettings` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `autoBettingEnabled` BOOLEAN NOT NULL DEFAULT true,
    `maxBetAmount` DOUBLE NOT NULL DEFAULT 100,
    `minOddsThreshold` DOUBLE NOT NULL DEFAULT 1.5,
    `maxOddsThreshold` DOUBLE NOT NULL DEFAULT 5.0,
    `riskLevel` VARCHAR(191) NOT NULL DEFAULT 'medium',
    `autoCashoutEnabled` BOOLEAN NOT NULL DEFAULT true,
    `cashoutThreshold` DOUBLE NOT NULL DEFAULT 0.7,
    `commissionRate` DOUBLE NOT NULL DEFAULT 0.10,
    `preferredSports` VARCHAR(191) NOT NULL DEFAULT 'football,basketball,tennis',
    `notificationsEnabled` BOOLEAN NOT NULL DEFAULT true,
    `dailyBetLimit` DOUBLE NOT NULL DEFAULT 500,
    `kellyFraction` DOUBLE NOT NULL DEFAULT 0.25,
    `minEdgeThreshold` DOUBLE NOT NULL DEFAULT 0.03,
    `betTypes` VARCHAR(191) NOT NULL DEFAULT 'single,accumulator',
    `maxAccumulatorLegs` INTEGER NOT NULL DEFAULT 5,
    `minAiConfidence` DOUBLE NOT NULL DEFAULT 0.6,
    `stopLossDaily` DOUBLE NOT NULL DEFAULT 200,
    `stopLossWeekly` DOUBLE NOT NULL DEFAULT 500,
    `profitTargetDaily` DOUBLE NOT NULL DEFAULT 300,
    `profitTargetWeekly` DOUBLE NOT NULL DEFAULT 1000,
    `betScheduleStart` VARCHAR(191) NOT NULL DEFAULT '08:00',
    `betScheduleEnd` VARCHAR(191) NOT NULL DEFAULT '22:00',
    `partialCashoutEnabled` BOOLEAN NOT NULL DEFAULT true,
    `partialCashoutPercent` DOUBLE NOT NULL DEFAULT 0.5,
    `waitFullSettlement` BOOLEAN NOT NULL DEFAULT true,
    `brokerMode` VARCHAR(191) NOT NULL DEFAULT 'demo',
    `botMode` VARCHAR(191) NOT NULL DEFAULT 'advisor',
    `telegramChatId` VARCHAR(191) NULL,
    `minTipConfidence` DOUBLE NOT NULL DEFAULT 0.65,
    `tipSports` VARCHAR(191) NOT NULL DEFAULT 'football,basketball,tennis',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserSettings_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BettingAccount` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `accountName` VARCHAR(191) NOT NULL,
    `accessToken` VARCHAR(191) NULL,
    `refreshToken` VARCHAR(191) NULL,
    `balance` DOUBLE NOT NULL DEFAULT 0,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `isConnected` BOOLEAN NOT NULL DEFAULT false,
    `lastSyncedAt` DATETIME(3) NULL,
    `brokerType` VARCHAR(191) NULL DEFAULT 'manual',
    `brokerRegion` VARCHAR(191) NULL,
    `brokerUserId` VARCHAR(191) NULL,
    `allocatedAmount` DOUBLE NOT NULL DEFAULT 0,
    `maxAllocation` DOUBLE NOT NULL DEFAULT 0,
    `allocationLock` BOOLEAN NOT NULL DEFAULT false,
    `sessionToken` VARCHAR(191) NULL,
    `sessionExpiry` DATETIME(3) NULL,
    `lastBetPlacedAt` DATETIME(3) NULL,
    `totalBrokerBets` INTEGER NOT NULL DEFAULT 0,
    `totalBrokerProfit` DOUBLE NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Match` (
    `id` VARCHAR(191) NOT NULL,
    `externalId` VARCHAR(191) NULL,
    `sport` VARCHAR(191) NOT NULL,
    `league` VARCHAR(191) NOT NULL,
    `homeTeam` VARCHAR(191) NOT NULL,
    `awayTeam` VARCHAR(191) NOT NULL,
    `homeOdds` DOUBLE NOT NULL,
    `drawOdds` DOUBLE NULL,
    `awayOdds` DOUBLE NOT NULL,
    `overUnderLine` DOUBLE NULL DEFAULT 2.5,
    `overOdds` DOUBLE NULL,
    `underOdds` DOUBLE NULL,
    `commenceTime` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'upcoming',
    `homeScore` INTEGER NULL,
    `awayScore` INTEGER NULL,
    `minute` INTEGER NULL,
    `apiSource` VARCHAR(191) NULL DEFAULT 'manual',
    `lastSyncedAt` DATETIME(3) NULL,
    `aiHomeWinProb` DOUBLE NULL DEFAULT 0,
    `aiDrawProb` DOUBLE NULL DEFAULT 0,
    `aiAwayWinProb` DOUBLE NULL DEFAULT 0,
    `aiConfidence` DOUBLE NULL DEFAULT 0,
    `aiAnalysis` VARCHAR(191) NULL,
    `aiRecommended` VARCHAR(191) NULL,
    `aiRiskScore` DOUBLE NULL DEFAULT 50,
    `aiRiskLevel` VARCHAR(191) NULL DEFAULT 'medium',
    `aiValueEdge` DOUBLE NULL DEFAULT 0,
    `aiKellyStake` DOUBLE NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Match_externalId_key`(`externalId`),
    INDEX `Match_status_idx`(`status`),
    INDEX `Match_sport_league_idx`(`sport`, `league`),
    INDEX `Match_commenceTime_idx`(`commenceTime`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TeamStats` (
    `id` VARCHAR(191) NOT NULL,
    `teamName` VARCHAR(191) NOT NULL,
    `sport` VARCHAR(191) NOT NULL,
    `league` VARCHAR(191) NOT NULL,
    `season` VARCHAR(191) NOT NULL,
    `matchesPlayed` INTEGER NOT NULL DEFAULT 0,
    `wins` INTEGER NOT NULL DEFAULT 0,
    `draws` INTEGER NOT NULL DEFAULT 0,
    `losses` INTEGER NOT NULL DEFAULT 0,
    `goalsFor` INTEGER NOT NULL DEFAULT 0,
    `goalsAgainst` INTEGER NOT NULL DEFAULT 0,
    `form` VARCHAR(191) NULL DEFAULT '',
    `homeRecord` VARCHAR(191) NULL DEFAULT '',
    `awayRecord` VARCHAR(191) NULL DEFAULT '',
    `attackRating` DOUBLE NOT NULL DEFAULT 0,
    `defenseRating` DOUBLE NOT NULL DEFAULT 0,
    `overallRating` DOUBLE NOT NULL DEFAULT 0,
    `eloRating` DOUBLE NOT NULL DEFAULT 1500,
    `xgFor` DOUBLE NOT NULL DEFAULT 0,
    `xgAgainst` DOUBLE NOT NULL DEFAULT 0,
    `shotsPerGame` DOUBLE NOT NULL DEFAULT 0,
    `shotsOnTargetPerGame` DOUBLE NOT NULL DEFAULT 0,
    `possessionAvg` DOUBLE NOT NULL DEFAULT 50,
    `cornersPerGame` DOUBLE NOT NULL DEFAULT 0,
    `cardsPerGame` DOUBLE NOT NULL DEFAULT 0,
    `keyPlayers` VARCHAR(191) NULL DEFAULT '[]',
    `externalTeamId` INTEGER NULL,
    `apiSource` VARCHAR(191) NULL DEFAULT 'manual',
    `lastUpdated` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TeamStats_teamName_sport_league_season_key`(`teamName`, `sport`, `league`, `season`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Bet` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `bettingAccountId` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `accumulatorId` VARCHAR(191) NULL,
    `betType` VARCHAR(191) NOT NULL,
    `selection` VARCHAR(191) NOT NULL,
    `odds` DOUBLE NOT NULL,
    `stake` DOUBLE NOT NULL,
    `potentialWin` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `cashoutAmount` DOUBLE NULL,
    `cashoutOdds` DOUBLE NULL,
    `partialCashoutAmount` DOUBLE NULL,
    `partialCashoutPercent` DOUBLE NULL,
    `profit` DOUBLE NULL,
    `commission` DOUBLE NULL,
    `isAutoPlaced` BOOLEAN NOT NULL DEFAULT false,
    `aiConfidence` DOUBLE NULL DEFAULT 0,
    `aiReasoning` VARCHAR(191) NULL,
    `aiModelUsed` VARCHAR(191) NULL DEFAULT 'ensemble',
    `kellyStake` DOUBLE NULL DEFAULT 0,
    `valueEdge` DOUBLE NULL DEFAULT 0,
    `riskScore` DOUBLE NULL DEFAULT 50,
    `settlementReason` VARCHAR(191) NULL,
    `placedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `settledAt` DATETIME(3) NULL,
    `cashedOutAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Bet_userId_idx`(`userId`),
    INDEX `Bet_userId_status_idx`(`userId`, `status`),
    INDEX `Bet_matchId_idx`(`matchId`),
    INDEX `Bet_status_idx`(`status`),
    INDEX `Bet_accumulatorId_idx`(`accumulatorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Accumulator` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `totalOdds` DOUBLE NOT NULL,
    `stake` DOUBLE NOT NULL,
    `potentialWin` DOUBLE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `cashoutAmount` DOUBLE NULL,
    `completedLegs` INTEGER NOT NULL DEFAULT 0,
    `totalLegs` INTEGER NOT NULL,
    `isAutoPlaced` BOOLEAN NOT NULL DEFAULT false,
    `bonusPercent` DOUBLE NULL DEFAULT 0,
    `profit` DOUBLE NULL,
    `commission` DOUBLE NULL,
    `placedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `settledAt` DATETIME(3) NULL,
    `cashedOutAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Accumulator_userId_idx`(`userId`),
    INDEX `Accumulator_userId_status_idx`(`userId`, `status`),
    INDEX `Accumulator_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BotLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NULL,
    `betId` VARCHAR(191) NULL,
    `accumulatorId` VARCHAR(191) NULL,
    `details` VARCHAR(191) NULL,
    `reasoning` VARCHAR(191) NULL,
    `confidence` DOUBLE NULL DEFAULT 0,
    `profitImpact` DOUBLE NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BotLog_userId_idx`(`userId`),
    INDEX `BotLog_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `BotLog_action_idx`(`action`),
    INDEX `BotLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BotSession` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'stopped',
    `startedAt` DATETIME(3) NULL,
    `stoppedAt` DATETIME(3) NULL,
    `totalScans` INTEGER NOT NULL DEFAULT 0,
    `totalBetsPlaced` INTEGER NOT NULL DEFAULT 0,
    `totalStakeUsed` DOUBLE NOT NULL DEFAULT 0,
    `totalProfit` DOUBLE NOT NULL DEFAULT 0,
    `lastScanAt` DATETIME(3) NULL,
    `lastBetAt` DATETIME(3) NULL,
    `scanIntervalSec` INTEGER NOT NULL DEFAULT 30,
    `stopReason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BotSession_userId_key`(`userId`),
    INDEX `BotSession_userId_idx`(`userId`),
    INDEX `BotSession_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Transaction` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `status` VARCHAR(191) NOT NULL DEFAULT 'completed',
    `description` VARCHAR(191) NULL,
    `betId` VARCHAR(191) NULL,
    `accumulatorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Transaction_userId_idx`(`userId`),
    INDEX `Transaction_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminSettings` (
    `id` VARCHAR(191) NOT NULL,
    `defaultCommissionRate` DOUBLE NOT NULL DEFAULT 0.10,
    `minCommissionRate` DOUBLE NOT NULL DEFAULT 0.05,
    `maxCommissionRate` DOUBLE NOT NULL DEFAULT 0.25,
    `platformName` VARCHAR(191) NOT NULL DEFAULT 'iBetPro',
    `maintenanceMode` BOOLEAN NOT NULL DEFAULT false,
    `maxUsers` INTEGER NOT NULL DEFAULT 10000,
    `autoApproveAccounts` BOOLEAN NOT NULL DEFAULT true,
    `oddsApiKey` VARCHAR(191) NULL DEFAULT '',
    `apiFootballKey` VARCHAR(191) NULL DEFAULT '',
    `accumulatorBonusThresholds` VARCHAR(191) NULL DEFAULT '[]',
    `adminWalletAddress` VARCHAR(191) NULL DEFAULT '',
    `adminBankName` VARCHAR(191) NULL DEFAULT '',
    `adminAccountNumber` VARCHAR(191) NULL DEFAULT '',
    `autoCommissionTransfer` BOOLEAN NOT NULL DEFAULT true,
    `minimumCommissionPayout` DOUBLE NOT NULL DEFAULT 10,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Allocation` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `bettingAccountId` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `previousAmount` DOUBLE NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `usedAmount` DOUBLE NOT NULL DEFAULT 0,
    `remainingAmount` DOUBLE NOT NULL DEFAULT 0,
    `profitFromAlloc` DOUBLE NOT NULL DEFAULT 0,
    `commissionFromAlloc` DOUBLE NOT NULL DEFAULT 0,
    `activatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `releasedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Allocation_userId_idx`(`userId`),
    INDEX `Allocation_bettingAccountId_idx`(`bettingAccountId`),
    INDEX `Allocation_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CommissionLedger` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `bettingAccountId` VARCHAR(191) NOT NULL,
    `betId` VARCHAR(191) NULL,
    `accumulatorId` VARCHAR(191) NULL,
    `grossProfit` DOUBLE NOT NULL DEFAULT 0,
    `commissionRate` DOUBLE NOT NULL DEFAULT 0.10,
    `commissionAmount` DOUBLE NOT NULL DEFAULT 0,
    `netProfit` DOUBLE NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `transferRef` VARCHAR(191) NULL,
    `transferredAt` DATETIME(3) NULL,
    `failureReason` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CommissionLedger_userId_idx`(`userId`),
    INDEX `CommissionLedger_bettingAccountId_idx`(`bettingAccountId`),
    INDEX `CommissionLedger_status_idx`(`status`),
    INDEX `CommissionLedger_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AIModelPerformance` (
    `id` VARCHAR(191) NOT NULL,
    `modelVersion` VARCHAR(191) NOT NULL DEFAULT 'v2_ensemble',
    `totalPredictions` INTEGER NOT NULL DEFAULT 0,
    `correctPredictions` INTEGER NOT NULL DEFAULT 0,
    `accuracyRate` DOUBLE NOT NULL DEFAULT 0,
    `avgConfidence` DOUBLE NOT NULL DEFAULT 0,
    `avgValueEdge` DOUBLE NOT NULL DEFAULT 0,
    `totalProfit` DOUBLE NOT NULL DEFAULT 0,
    `totalLoss` DOUBLE NOT NULL DEFAULT 0,
    `roi` DOUBLE NOT NULL DEFAULT 0,
    `sharpeRatio` DOUBLE NOT NULL DEFAULT 0,
    `maxDrawdown` DOUBLE NOT NULL DEFAULT 0,
    `sport` VARCHAR(191) NOT NULL DEFAULT 'all',
    `period` VARCHAR(191) NOT NULL DEFAULT 'daily',
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AIModelPerformance_modelVersion_idx`(`modelVersion`),
    INDEX `AIModelPerformance_sport_idx`(`sport`),
    INDEX `AIModelPerformance_period_idx`(`period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordResetToken_token_key`(`token`),
    INDEX `PasswordResetToken_userId_idx`(`userId`),
    INDEX `PasswordResetToken_token_idx`(`token`),
    INDEX `PasswordResetToken_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'info',
    `read` BOOLEAN NOT NULL DEFAULT false,
    `matchId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_idx`(`userId`),
    INDEX `Notification_userId_read_idx`(`userId`, `read`),
    INDEX `Notification_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Tip` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `sport` VARCHAR(191) NOT NULL,
    `league` VARCHAR(191) NOT NULL,
    `homeTeam` VARCHAR(191) NOT NULL,
    `awayTeam` VARCHAR(191) NOT NULL,
    `selection` VARCHAR(191) NOT NULL,
    `odds` DOUBLE NOT NULL,
    `aiConfidence` DOUBLE NOT NULL,
    `valueEdge` DOUBLE NOT NULL,
    `kellyStake` DOUBLE NOT NULL,
    `riskLevel` VARCHAR(191) NOT NULL DEFAULT 'medium',
    `aiReasoning` VARCHAR(191) NULL,
    `tracked` BOOLEAN NOT NULL DEFAULT false,
    `userStake` DOUBLE NULL,
    `userResult` VARCHAR(191) NULL,
    `userProfit` DOUBLE NULL,
    `userResultAt` DATETIME(3) NULL,
    `outcome` VARCHAR(191) NULL,
    `actualOdds` DOUBLE NULL,
    `profit` DOUBLE NULL,
    `commencesAt` DATETIME(3) NOT NULL,
    `settledAt` DATETIME(3) NULL,
    `telegramSent` BOOLEAN NOT NULL DEFAULT false,
    `telegramSentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Tip_userId_idx`(`userId`),
    INDEX `Tip_userId_outcome_idx`(`userId`, `outcome`),
    INDEX `Tip_userId_tracked_idx`(`userId`, `tracked`),
    INDEX `Tip_matchId_idx`(`matchId`),
    INDEX `Tip_commencesAt_idx`(`commencesAt`),
    INDEX `Tip_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserSettings` ADD CONSTRAINT `UserSettings_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BettingAccount` ADD CONSTRAINT `BettingAccount_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Bet` ADD CONSTRAINT `Bet_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Bet` ADD CONSTRAINT `Bet_bettingAccountId_fkey` FOREIGN KEY (`bettingAccountId`) REFERENCES `BettingAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Bet` ADD CONSTRAINT `Bet_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Bet` ADD CONSTRAINT `Bet_accumulatorId_fkey` FOREIGN KEY (`accumulatorId`) REFERENCES `Accumulator`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Accumulator` ADD CONSTRAINT `Accumulator_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BotLog` ADD CONSTRAINT `BotLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BotSession` ADD CONSTRAINT `BotSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Allocation` ADD CONSTRAINT `Allocation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Allocation` ADD CONSTRAINT `Allocation_bettingAccountId_fkey` FOREIGN KEY (`bettingAccountId`) REFERENCES `BettingAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommissionLedger` ADD CONSTRAINT `CommissionLedger_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommissionLedger` ADD CONSTRAINT `CommissionLedger_bettingAccountId_fkey` FOREIGN KEY (`bettingAccountId`) REFERENCES `BettingAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Tip` ADD CONSTRAINT `Tip_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Tip` ADD CONSTRAINT `Tip_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

