import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { runtimeDatabaseUrl } from "../env";

// Runtime client: connects as the restricted role (DATABASE_URL). Never use the migration role here.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create() {
  const url = runtimeDatabaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: process.env.VERCEL ? 3 : 10 }) });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? create();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Db = PrismaClient;
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
