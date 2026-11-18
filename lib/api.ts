import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { UserError } from "@/lib/templates";

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function errorResponse(status: number, error: string, extra: Record<string, unknown> = {}) {
  const headers: HeadersInit = {};
  if (typeof extra.retryAfter === "number") headers["retry-after"] = String(extra.retryAfter);
  return NextResponse.json({ error, ...extra }, { status, headers });
}

export async function sessionUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ?? null;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** Maps thrown UserErrors to 400s; anything else is logged and becomes a 500. */
export function handleError(error: unknown) {
  if (error instanceof UserError) return errorResponse(400, error.message);
  console.error(error);
  return errorResponse(500, "Something went wrong");
}
