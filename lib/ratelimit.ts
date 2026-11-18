import "server-only";
import { prisma } from "@/lib/db";

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets (when blocked). */
  retryAfter: number;
}

/**
 * Fixed-window limiter backed by Postgres: one upsert per call, no extra service.
 * Fine for the low request rates of claims and upload presigning.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt")
    VALUES (${key}, 1, now() + ${windowSeconds}::int * interval '1 second')
    ON CONFLICT ("key") DO UPDATE SET
      "count"   = CASE WHEN "RateLimit"."resetAt" <= now() THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" <= now()
                       THEN now() + ${windowSeconds}::int * interval '1 second'
                       ELSE "RateLimit"."resetAt" END
    RETURNING "count", "resetAt"`;
  const row = rows[0]!;
  const retryAfter = Math.max(1, Math.ceil((row.resetAt.getTime() - Date.now()) / 1000));
  return { ok: row.count <= limit, retryAfter };
}

export async function purgeExpiredRateLimits(): Promise<number> {
  const { count } = await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: new Date() } } });
  return count;
}
