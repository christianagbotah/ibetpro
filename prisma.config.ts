import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  migrations: {
    seed: "npx tsx ./prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL || "mysql://lightworld_db_user:myjesus4mE2018@localhost:3306/lightworld_ibetpro_db",
  },
});
