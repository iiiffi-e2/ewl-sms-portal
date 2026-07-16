import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

// Applying withAccelerate() routes queries through Prisma Accelerate's managed
// connection pooler when DATABASE_URL is a `prisma+postgres://` / `prisma://`
// URL. On serverless (Vercel) this absorbs connection storms that previously
// exhausted the tiny per-instance pool on a direct db.prisma.io connection. For
// a direct `postgresql://` URL (e.g. local dev) it behaves as a normal client.
const createPrismaClient = () =>
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  }).$extends(withAccelerate());

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma?: ExtendedPrismaClient;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
