import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

const adapter = new PrismaBetterSqlite3({ url: "file:./prisma/dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding production database...");

  // Create admin settings only
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

  // Create admin user with hashed password
  // The actual password comes from the ADMIN_PASSWORD env var
  const adminPassword = process.env.ADMIN_PASSWORD || "changeme-admin-2024";
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
      bankroll: 0,
      totalProfit: 0,
      totalLoss: 0,
      commissionPaid: 0,
    },
  });

  console.log("Database seeded successfully!");
  console.log(`Admin settings: ${adminSettings.platformName}`);
  console.log(`Admin user: ${admin.email}`);
  console.log("\nNo dummy data created. All data will come from real API sources.");
  console.log("Configure API keys in Admin > API Keys to enable live data.");
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
