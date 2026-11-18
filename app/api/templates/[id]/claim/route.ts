import type { NextRequest } from "next/server";
import { errorResponse, handleError, json, readJson, sessionUser } from "@/lib/api";
import { claimAsOwner, claimSchema } from "@/lib/claims";
import { getOwnedTemplate } from "@/lib/templates";

/** The owner generating from their dashboard: logged, but not counted against any link. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/templates/[id]/claim">) {
  try {
    const user = await sessionUser(request);
    if (!user) return errorResponse(401, "Sign in first");
    const { id } = await ctx.params;
    const template = await getOwnedTemplate(user.id, id);
    if (!template) return errorResponse(404, "Template not found");
    if (!template.publishedVersion) return errorResponse(409, "Publish the template first");
    const input = claimSchema.safeParse(await readJson(request));
    if (!input.success) return errorResponse(400, "Invalid request");

    const result = await claimAsOwner(user.id, template, template.publishedVersion, input.data);
    if (!result.ok) {
      return errorResponse(result.status, result.error, { rowErrors: result.rowErrors, retryAfter: result.retryAfter });
    }
    return json(result);
  } catch (error) {
    return handleError(error);
  }
}
