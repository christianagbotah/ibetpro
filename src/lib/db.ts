import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: InstanceType<typeof PrismaClient> | undefined;
};

function createPrismaClient() {
  // PrismaMariaDb constructor accepts: mariadb.PoolConfig | string
  // Use PoolConfig to set timezone explicitly.
  // The MariaDB server may be in a different timezone than the Node.js process.
  // Setting timezone: 'local' ensures the driver converts JS Date (UTC) to
  // the server's local timezone before sending, so date comparisons are correct.
  const url = new URL(process.env.DATABASE_URL!);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: url.username,
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    timezone: 'local', // Match JS Date conversion to server's local timezone
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
