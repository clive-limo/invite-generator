import type { NextRequest } from "next/server";
import { errorResponse, handleError, sessionUser } from "@/lib/api";
import { toCsv } from "@/lib/fields/csv-mapping";
import { sanitizeFilename } from "@/lib/fields/filename";
import { exportActivity, getOwnedTemplate, parseFields } from "@/lib/templates";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/templates/[id]/activity.csv">) {
  try {
    const user = await sessionUser(request);
    if (!user) return errorResponse(401, "Sign in first");
    const { id } = await ctx.params;
    if (!(await getOwnedTemplate(user.id, id))) return errorResponse(404, "Template not found");
    const { template, generations } = await exportActivity(user.id, id);

    // Columns: every field key that appears in any version, in first-seen order.
    const keys: string[] = [];
    const labels = new Map<string, string>();
    for (const g of generations) {
      for (const f of parseFields(g.templateVersion.fields)) {
        if (!labels.has(f.key)) {
          keys.push(f.key);
          labels.set(f.key, f.label);
        }
      }
    }
    const header = ["Created at", "Source", "Link", "Version", ...keys.map((k) => labels.get(k)!)];
    const rows = generations.map((g) => {
      const values = g.values as Record<string, string>;
      return [
        g.createdAt.toISOString(),
        g.source.toLowerCase(),
        g.shareLink?.label ?? "",
        String(g.templateVersion.version),
        ...keys.map((k) => values[k] ?? ""),
      ];
    });
    const name = `${sanitizeFilename(template.name) || "invites"}-activity.csv`;
    return new Response(toCsv([header, ...rows]), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
