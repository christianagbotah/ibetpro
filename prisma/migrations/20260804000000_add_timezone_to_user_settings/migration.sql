-- AlterTable: Add timezone column to UserSettings
-- This column stores the IANA timezone name (e.g. "Africa/Accra", "Europe/London")
-- Used for bet schedule & display times. Africa/Accra = UTC+0, no DST.

ALTER TABLE `UserSettings` ADD COLUMN `timezone` VARCHAR(191) NOT NULL DEFAULT 'Africa/Accra';
