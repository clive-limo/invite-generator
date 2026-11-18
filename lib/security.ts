import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";

/** 128-bit random, URL-safe (22 chars). Used for share-link tokens and upload ids. */
export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}

/** Client IP as seen by Vercel's edge (first x-forwarded-for hop). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}

/**
 * Keyed hash of the IP, so rate limits and the activity log never store raw
 * addresses. Rotating IP_HASH_SECRET simply resets those associations.
 */
export function hashIp(ip: string): string {
  const secret = process.env.IP_HASH_SECRET ?? process.env.BETTER_AUTH_SECRET ?? "dev-only";
  return createHmac("sha256", secret).update(ip).digest("base64url").slice(0, 22);
}

/** Stable hash of submitted values, for "same invite again" de-duplication. */
export function hashValues(values: Record<string, string>): string {
  const canonical = JSON.stringify(Object.keys(values).sort().map((k) => [k, values[k]]));
  return createHash("sha256").update(canonical).digest("base64url").slice(0, 32);
}
