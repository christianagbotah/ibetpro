import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./prisma/dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding production database...");

  // Create admin settings only - no dummy data
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
    },
  });

  // Create admin user for commission collection
  const admin = await prisma.user.upsert({
    where: { email: "admin@ibetpro.com" },
    update: {},
    create: {
      email: "admin@ibetpro.com",
      name: "Admin",
      role: "admin",
      balance: 0,
      bankroll: 0,
      totalProfit: 0,
      totalLoss: 0,
      commissionPaid: 0,
    },
  });

  // Create a demo user for testing (can be removed in production)
  const demoUser = await prisma.user.upsert({
    where: { email: "demo@ibetpro.com" },
    update: {},
    create: {
      email: "demo@ibetpro.com",
      name: "Demo User",
      role: "user",
      balance: 0,
      bankroll: 1000,
      totalProfit: 0,
      totalLoss: 0,
      commissionPaid: 0,
      settings: {
        create: {
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
        },
      },
    },
  });

  console.log("Database seeded successfully!");
  console.log(`Admin settings: ${adminSettings.platformName}`);
  console.log(`Admin user: ${admin.email}`);
  console.log(`Demo user: ${demoUser.email}`);
  console.log("\nNo dummy data created. All data will come from real API sources.");
  console.log("Configure API keys in Settings > Admin to enable live data.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
