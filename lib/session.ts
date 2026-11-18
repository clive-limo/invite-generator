import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";

/** The current session, deduplicated per request. Reads cookies, so call it inside a Suspense boundary. */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/**
 * The signed-in user, or a redirect to sign-in. This is the auth gate for pages and
 * server actions — layouts don't re-render on navigation, so they can't be one.
 */
export async function requireUser(returnTo?: string) {
  const session = await getSession();
  if (!session) {
    redirect(returnTo ? `/sign-in?next=${encodeURIComponent(returnTo)}` : "/sign-in");
  }
  return session.user;
}
