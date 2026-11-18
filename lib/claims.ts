import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Field, FieldValues } from "@/lib/fields/schema";
import { buildValuesSchema, validateRows, type RowError } from "@/lib/fields/validate";
import type { Prisma } from "@/lib/generated/prisma/client";
import { rateLimit } from "@/lib/ratelimit";
import type { RenderJob } from "@/lib/render/protocol";
import { hashValues } from "@/lib/security";
import { storage } from "@/lib/storage";
import { MAX_BULK_ROWS, parseFields } from "@/lib/templates";

export const DPI = 300;
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

export const claimSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("single"), values: z.record(z.string(), z.unknown()) }),
  z.object({
    mode: z.literal("bulk"),
    rows: z.array(z.record(z.string(), z.unknown())).min(1).max(MAX_BULK_ROWS),
    filenamePattern: z.string().max(200),
  }),
]);
export type ClaimInput = z.infer<typeof claimSchema>;

export type ClaimResult =
  | {
      ok: true;
      sourceUrl: string;
      job: RenderJob;
      /** Server-cleaned values, in submission order. Render exactly these. */
      rows: FieldValues[];
    }
  | { ok: false; status: number; error: string; rowErrors?: RowError[]; retryAfter?: number };

interface VersionLike {
  id: string;
  fields: Prisma.JsonValue;
  exportScale: number;
}

interface TemplateLike {
  originalKey: string;
  width: number;
  height: number;
}

export async function sourceFor(template: TemplateLike, version: { fields: Field[]; exportScale: number }) {
  const sourceUrl = await storage().presignGet(template.originalKey, { expiresIn: 600, stableFor: 3600 });
  const job: RenderJob = {
    width: template.width,
    height: template.height,
    fields: version.fields,
    scale: version.exportScale,
    dpi: DPI,
  };
  return { sourceUrl, job };
}

function validate(fields: Field[], input: ClaimInput) {
  if (input.mode === "single") {
    const parsed = buildValuesSchema(fields).safeParse(input.values);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Invalid values",
        rowErrors: parsed.error.issues.map((i) => ({ row: 0, fieldKey: String(i.path[0] ?? ""), message: i.message })),
      };
    }
    return { rows: [parsed.data as FieldValues] };
  }
  const { valid, errors } = validateRows(fields, input.rows);
  if (errors.length > 0) {
    return { error: `${new Set(errors.map((e) => e.row)).size} row(s) have problems`, rowErrors: errors };
  }
  return { rows: valid.map((v) => v.values) };
}

/** Reserves `n` generations on a link; false if it's disabled, expired or out of quota. */
async function reserve(tx: Prisma.TransactionClient, linkId: string, n: number): Promise<boolean> {
  const updated = await tx.$executeRaw`
    UPDATE "ShareLink"
    SET "generationsUsed" = "generationsUsed" + ${n}::int
    WHERE "id" = ${linkId}
      AND "enabled"
      AND ("expiresAt" IS NULL OR "expiresAt" > now())
      AND ("maxGenerations" IS NULL OR "generationsUsed" + ${n}::int <= "maxGenerations")`;
  return updated === 1;
}

/**
 * Public claim through a share link: rate-limit, validate, reserve quota and log the
 * generation(s), then hand back a short-lived URL for the full-resolution original.
 */
export async function claimViaLink(
  resolved: {
    link: { id: string; maxBulkRows: number };
    template: TemplateLike;
    version: VersionLike;
    fields: Field[];
  },
  input: ClaimInput,
  ipHash: string,
): Promise<ClaimResult> {
  const { link, template, version, fields } = resolved;
  const limit =
    input.mode === "single"
      ? await rateLimit(`claim:single:${link.id}:${ipHash}`, 20, 60)
      : await rateLimit(`claim:bulk:${link.id}:${ipHash}`, 5, 3600);
  if (!limit.ok) {
    return { ok: false, status: 429, error: "Too many requests — please wait a moment", retryAfter: limit.retryAfter };
  }

  if (input.mode === "bulk") {
    if (link.maxBulkRows === 0) return { ok: false, status: 403, error: "Bulk generation is turned off for this link" };
    if (input.rows.length > link.maxBulkRows) {
      return { ok: false, status: 400, error: `This link allows up to ${link.maxBulkRows} rows per batch` };
    }
  }

  const checked = validate(fields, input);
  if ("error" in checked) return { ok: false, status: 422, error: checked.error!, rowErrors: checked.rowErrors };
  const rows = checked.rows;

  const outcome = await prisma.$transaction(async (tx) => {
    if (input.mode === "single") {
      const valuesHash = hashValues(rows[0]!);
      // The same person regenerating the same invite doesn't use up quota.
      const repeat = await tx.generation.findFirst({
        where: {
          shareLinkId: link.id,
          templateVersionId: version.id,
          valuesHash,
          ipHash,
          createdAt: { gt: new Date(Date.now() - DEDUPE_WINDOW_MS) },
        },
        select: { id: true },
      });
      if (repeat) return true;
      if (!(await reserve(tx, link.id, 1))) return false;
      await tx.generation.create({
        data: {
          templateVersionId: version.id,
          shareLinkId: link.id,
          values: rows[0]!,
          valuesHash,
          source: "LINK",
          ipHash,
        },
      });
      return true;
    }
    if (!(await reserve(tx, link.id, rows.length))) return false;
    const run = await tx.bulkRun.create({
      data: {
        templateVersionId: version.id,
        shareLinkId: link.id,
        rowCount: rows.length,
        filenamePattern: input.filenamePattern,
        ipHash,
      },
    });
    await tx.generation.createMany({
      data: rows.map((values) => ({
        templateVersionId: version.id,
        shareLinkId: link.id,
        bulkRunId: run.id,
        values,
        valuesHash: hashValues(values),
        source: "BULK" as const,
        ipHash,
      })),
    });
    return true;
  });

  if (!outcome) {
    return {
      ok: false,
      status: 409,
      error:
        input.mode === "bulk"
          ? "This link doesn't have enough invites left for that many rows"
          : "This link has reached its limit or is no longer active",
    };
  }
  const { sourceUrl, job } = await sourceFor(template, { fields, exportScale: version.exportScale });
  return { ok: true, sourceUrl, job, rows };
}

/** Owner claim from the dashboard: same validation and logging, no quota. */
export async function claimAsOwner(
  userId: string,
  template: TemplateLike & { id: string },
  version: VersionLike,
  input: ClaimInput,
): Promise<ClaimResult> {
  const limit = await rateLimit(`claim:owner:${userId}`, 120, 60);
  if (!limit.ok) return { ok: false, status: 429, error: "Too many requests", retryAfter: limit.retryAfter };
  const fields = parseFields(version.fields);
  const checked = validate(fields, input);
  if ("error" in checked) return { ok: false, status: 422, error: checked.error!, rowErrors: checked.rowErrors };
  const rows = checked.rows;

  await prisma.$transaction(async (tx) => {
    let bulkRunId: string | undefined;
    if (input.mode === "bulk") {
      const run = await tx.bulkRun.create({
        data: { templateVersionId: version.id, userId, rowCount: rows.length, filenamePattern: input.filenamePattern },
      });
      bulkRunId = run.id;
    }
    await tx.generation.createMany({
      data: rows.map((values) => ({
        templateVersionId: version.id,
        bulkRunId,
        values,
        valuesHash: hashValues(values),
        source: input.mode === "bulk" ? ("BULK" as const) : ("OWNER" as const),
      })),
    });
  });
  const { sourceUrl, job } = await sourceFor(template, { fields, exportScale: version.exportScale });
  return { ok: true, sourceUrl, job, rows };
}
