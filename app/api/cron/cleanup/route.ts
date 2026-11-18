import { timingSafeEqual } from "node:crypto";
import { errorResponse, json } from "@/lib/api";
import { prisma } from "@/lib/db";
import { purgeExpiredRateLimits } from "@/lib/ratelimit";

const RETENTION_DAYS = Number(process.env.ACTIVITY_RETENTION_DAYS ?? 90);

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return Boolean(secret) && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** Daily (vercel.json): drops activity older than the retention window and stale rate-limit rows. */
export async function GET(request: Request) {
  if (!authorized(request)) return errorResponse(401, "Unauthorized");
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const [generations, bulkRuns, rateLimits] = await Promise.all([
    prisma.generation.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.bulkRun.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    purgeExpiredRateLimits(),
  ]);
  return json({ generations: generations.count, bulkRuns: bulkRuns.count, rateLimits });
}
