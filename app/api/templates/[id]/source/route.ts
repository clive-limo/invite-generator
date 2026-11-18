import type { NextRequest } from "next/server";
import { errorResponse, handleError, json, sessionUser } from "@/lib/api";
import { storage } from "@/lib/storage";
import { getOwnedTemplate } from "@/lib/templates";

/**
 * Signed URL for the owner's full-resolution original: used by the editor's
 * "test full-size download" and by re-downloads from the activity log.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/templates/[id]/source">) {
  try {
    const user = await sessionUser(request);
    if (!user) return errorResponse(401, "Sign in first");
    const { id } = await ctx.params;
    const template = await getOwnedTemplate(user.id, id);
    if (!template) return errorResponse(404, "Template not found");
    const sourceUrl = await storage().presignGet(template.originalKey, { expiresIn: 600, stableFor: 3600 });
    return json({ sourceUrl });
  } catch (error) {
    return handleError(error);
  }
}
