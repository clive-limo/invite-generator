import type { NextRequest } from "next/server";
import { errorResponse, handleError, json, readJson } from "@/lib/api";
import { claimSchema, claimViaLink } from "@/lib/claims";
import { clientIp, hashIp } from "@/lib/security";
import { resolveLink } from "@/lib/templates";

const PROBLEM_MESSAGES = {
  not_found: "This link doesn't exist",
  disabled: "This link has been turned off",
  expired: "This link has expired",
  exhausted: "This link has reached its limit",
  unpublished: "This invite isn't ready yet",
} as const;

export async function POST(request: NextRequest, ctx: RouteContext<"/api/i/[token]/claim">) {
  try {
    const { token } = await ctx.params;
    const resolved = await resolveLink(token);
    if ("problem" in resolved) {
      return errorResponse(resolved.problem === "not_found" ? 404 : 410, PROBLEM_MESSAGES[resolved.problem!]);
    }
    const input = claimSchema.safeParse(await readJson(request));
    if (!input.success) return errorResponse(400, "Invalid request");

    const result = await claimViaLink(resolved, input.data, hashIp(clientIp(request.headers)));
    if (!result.ok) {
      return errorResponse(result.status, result.error, { rowErrors: result.rowErrors, retryAfter: result.retryAfter });
    }
    return json(result);
  } catch (error) {
    return handleError(error);
  }
}
