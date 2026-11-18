import "server-only";
import { imageSize } from "image-size";
import { nanoid } from "nanoid";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { fieldsSchema, type Field } from "@/lib/fields/schema";
import { MAX_CANVAS_PIXELS } from "@/lib/render/protocol";
import { randomToken } from "@/lib/security";
import { pendingKeys, storage, templateKeys } from "@/lib/storage";
import { UPLOAD_LIMITS } from "@/lib/upload/limits";

export class UserError extends Error {}

// ── Templates ───────────────────────────────────────────────────────────────

export function listTemplates(ownerId: string) {
  return prisma.template.findMany({
    where: { ownerId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { links: true } },
      versions: { select: { _count: { select: { generations: true } } } },
    },
  });
}

export async function getOwnedTemplate(ownerId: string, id: string) {
  const template = await prisma.template.findFirst({
    where: { id, ownerId, deletedAt: null },
    include: { publishedVersion: true },
  });
  return template;
}

export async function requireOwnedTemplate(ownerId: string, id: string) {
  const template = await getOwnedTemplate(ownerId, id);
  if (!template) throw new UserError("Template not found");
  return template;
}

export function parseFields(json: unknown): Field[] {
  const parsed = fieldsSchema.safeParse(json);
  return parsed.success ? parsed.data : [];
}

/** Reads an uploaded image's real type and (EXIF-oriented) size from its first bytes. */
async function sniffImage(key: string) {
  for (const length of [65_536, 2_097_152]) {
    const bytes = await storage().readObjectStart(key, length);
    try {
      const info = imageSize(bytes);
      const rotated = info.orientation !== undefined && info.orientation >= 5 && info.orientation <= 8;
      return {
        type: info.type,
        width: rotated ? info.height : info.width,
        height: rotated ? info.width : info.height,
      };
    } catch {
      // Large metadata blocks can push the dimensions past the first read.
    }
  }
  throw new UserError("That file doesn't look like a PNG, JPEG or WebP image");
}

const MIME_BY_TYPE: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

export const finalizeUploadSchema = z.object({
  uploadId: z.string().regex(/^[A-Za-z0-9_-]{16,32}$/),
  name: z.string().trim().min(1).max(80),
  previewWidth: z.number().int().positive().max(UPLOAD_LIMITS.previewMaxSide),
  previewHeight: z.number().int().positive().max(UPLOAD_LIMITS.previewMaxSide),
});

/**
 * Turns a browser upload in pending/ into a template: checks every object, sniffs the
 * original's real type and size, then copies the files into templates/{id}/.
 */
export async function finalizeUpload(ownerId: string, input: z.infer<typeof finalizeUploadSchema>) {
  const pending = pendingKeys(input.uploadId);
  const [original, preview, thumb] = await Promise.all([
    storage().headObject(pending.original),
    storage().headObject(pending.preview),
    storage().headObject(pending.thumb),
  ]);
  if (!original || !preview || !thumb) throw new UserError("Upload incomplete — please try again");
  if (original.size > UPLOAD_LIMITS.maxBytes) throw new UserError("Image is larger than 25 MB");
  if (preview.size > 5 * 1024 * 1024 || thumb.size > 2 * 1024 * 1024) throw new UserError("Preview files are too large");

  const info = await sniffImage(pending.original);
  const mimeType = info.type ? MIME_BY_TYPE[info.type] : undefined;
  if (!mimeType) throw new UserError("Only PNG, JPEG and WebP images are supported");
  if (info.width * info.height > MAX_CANVAS_PIXELS) {
    throw new UserError("Image is larger than 16 megapixels — please resize it (e.g. 4000 × 4000)");
  }

  const id = nanoid(16);
  const keys = templateKeys(id);
  await Promise.all([
    storage().copyObject(pending.original, keys.original),
    storage().copyObject(pending.preview, keys.preview),
    storage().copyObject(pending.thumb, keys.thumb),
  ]);
  const template = await prisma.template.create({
    data: {
      id,
      ownerId,
      name: input.name,
      originalKey: keys.original,
      previewKey: keys.preview,
      thumbKey: keys.thumb,
      width: info.width,
      height: info.height,
      previewWidth: input.previewWidth,
      previewHeight: input.previewHeight,
      mimeType,
      bytes: original.size,
    },
  });
  // Pending objects also expire via the bucket's lifecycle rule; this is just tidier.
  await Promise.allSettled(Object.values(pending).map((key) => storage().deleteObject(key)));
  return template;
}

export async function saveDraft(ownerId: string, id: string, fields: unknown) {
  const parsed = fieldsSchema.safeParse(fields);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Invalid fields");
  const template = await requireOwnedTemplate(ownerId, id);
  const { draftUpdatedAt } = await prisma.template.update({
    where: { id: template.id },
    data: { draftFields: parsed.data, draftUpdatedAt: new Date() },
    select: { draftUpdatedAt: true },
  });
  return draftUpdatedAt;
}

export async function publishTemplate(ownerId: string, id: string) {
  const template = await requireOwnedTemplate(ownerId, id);
  const fields = parseFields(template.draftFields);
  if (fields.length === 0) throw new UserError("Add at least one field before publishing");
  return prisma.$transaction(async (tx) => {
    const last = await tx.templateVersion.findFirst({
      where: { templateId: id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = await tx.templateVersion.create({
      data: { templateId: id, version: (last?.version ?? 0) + 1, fields, exportScale: template.exportScale },
    });
    await tx.template.update({ where: { id }, data: { publishedVersionId: version.id } });
    return version;
  });
}

export async function updateTemplateSettings(ownerId: string, id: string, data: { name?: string; exportScale?: 1 | 2 }) {
  const template = await requireOwnedTemplate(ownerId, id);
  if (data.exportScale === 2 && template.width * template.height * 4 > MAX_CANVAS_PIXELS) {
    throw new UserError("This template is already too large to export at 2×");
  }
  return prisma.template.update({ where: { id }, data });
}

export async function deleteTemplate(ownerId: string, id: string) {
  const template = await requireOwnedTemplate(ownerId, id);
  await prisma.$transaction([
    prisma.template.update({ where: { id }, data: { deletedAt: new Date() } }),
    prisma.shareLink.updateMany({ where: { templateId: id }, data: { enabled: false } }),
  ]);
  await Promise.allSettled(
    [template.originalKey, template.previewKey, template.thumbKey].map((key) => storage().deleteObject(key)),
  );
}

/** Duplicates the template's draft. The image objects are copied so either can be deleted independently. */
export async function duplicateTemplate(ownerId: string, id: string) {
  const source = await requireOwnedTemplate(ownerId, id);
  const newId = nanoid(16);
  const keys = templateKeys(newId);
  await Promise.all([
    storage().copyObject(source.originalKey, keys.original),
    storage().copyObject(source.previewKey, keys.preview),
    storage().copyObject(source.thumbKey, keys.thumb),
  ]);
  return prisma.template.create({
    data: {
      id: newId,
      ownerId,
      name: `${source.name} (copy)`.slice(0, 80),
      originalKey: keys.original,
      previewKey: keys.preview,
      thumbKey: keys.thumb,
      width: source.width,
      height: source.height,
      previewWidth: source.previewWidth,
      previewHeight: source.previewHeight,
      mimeType: source.mimeType,
      bytes: source.bytes,
      exportScale: source.exportScale,
      draftFields: source.draftFields ?? [],
    },
  });
}

// ── Share links ─────────────────────────────────────────────────────────────

export const MAX_BULK_ROWS = 1000;

export const linkInputSchema = z.object({
  label: z.string().trim().min(1).max(60),
  expiresAt: z.coerce.date().nullable(),
  maxGenerations: z.number().int().positive().max(1_000_000).nullable(),
  maxBulkRows: z.number().int().min(0).max(MAX_BULK_ROWS),
});

export async function listLinks(ownerId: string, templateId: string) {
  await requireOwnedTemplate(ownerId, templateId);
  return prisma.shareLink.findMany({ where: { templateId }, orderBy: { createdAt: "desc" } });
}

export async function createLink(ownerId: string, templateId: string, input: z.infer<typeof linkInputSchema>) {
  const template = await requireOwnedTemplate(ownerId, templateId);
  if (!template.publishedVersionId) throw new UserError("Publish the template before sharing it");
  return prisma.shareLink.create({ data: { templateId, token: randomToken(), ...input } });
}

async function requireOwnedLink(ownerId: string, linkId: string) {
  const link = await prisma.shareLink.findFirst({
    where: { id: linkId, template: { ownerId, deletedAt: null } },
  });
  if (!link) throw new UserError("Link not found");
  return link;
}

export async function updateLink(
  ownerId: string,
  linkId: string,
  data: Partial<z.infer<typeof linkInputSchema>> & { enabled?: boolean },
) {
  await requireOwnedLink(ownerId, linkId);
  return prisma.shareLink.update({ where: { id: linkId }, data });
}

export async function deleteLink(ownerId: string, linkId: string) {
  await requireOwnedLink(ownerId, linkId);
  await prisma.shareLink.delete({ where: { id: linkId } });
}

export type LinkProblem = "not_found" | "disabled" | "expired" | "exhausted" | "unpublished";

/** Resolves a public token to its live template version, or says why it can't be used. */
export async function resolveLink(token: string) {
  if (!/^[A-Za-z0-9_-]{16,32}$/.test(token)) return { problem: "not_found" as const };
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: { template: { include: { publishedVersion: true } } },
  });
  if (!link || link.template.deletedAt) return { problem: "not_found" as const };
  if (!link.enabled) return { problem: "disabled" as const };
  if (link.expiresAt && link.expiresAt <= new Date()) return { problem: "expired" as const };
  if (link.maxGenerations !== null && link.generationsUsed >= link.maxGenerations) {
    return { problem: "exhausted" as const };
  }
  const version = link.template.publishedVersion;
  if (!version) return { problem: "unpublished" as const };
  return { link, template: link.template, version, fields: parseFields(version.fields) };
}

// ── Activity ────────────────────────────────────────────────────────────────

export const ACTIVITY_PAGE_SIZE = 50;

export async function listActivity(ownerId: string, templateId: string, page: number) {
  await requireOwnedTemplate(ownerId, templateId);
  const where = { templateVersion: { templateId } };
  const [total, generations, versions] = await Promise.all([
    prisma.generation.count({ where }),
    prisma.generation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ACTIVITY_PAGE_SIZE,
      take: ACTIVITY_PAGE_SIZE,
      include: { shareLink: { select: { label: true } }, templateVersion: { select: { version: true } } },
    }),
    prisma.templateVersion.findMany({ where: { templateId }, select: { id: true, version: true, fields: true, exportScale: true } }),
  ]);
  return { total, generations, versions };
}

/** Every generation for a template, oldest first, for the CSV export. */
export async function exportActivity(ownerId: string, templateId: string) {
  const template = await requireOwnedTemplate(ownerId, templateId);
  const generations = await prisma.generation.findMany({
    where: { templateVersion: { templateId } },
    orderBy: { createdAt: "asc" },
    include: { shareLink: { select: { label: true } }, templateVersion: { select: { version: true, fields: true } } },
  });
  return { template, generations };
}
