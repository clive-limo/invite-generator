"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import {
  createLink,
  deleteLink,
  deleteTemplate,
  duplicateTemplate,
  finalizeUpload,
  finalizeUploadSchema,
  linkInputSchema,
  publishTemplate,
  saveDraft,
  updateLink,
  updateTemplateSettings,
  UserError,
} from "@/lib/templates";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof UserError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "Something went wrong — please try again" };
  }
}

export async function finalizeUploadAction(input: z.infer<typeof finalizeUploadSchema>) {
  const user = await requireUser();
  const parsed = finalizeUploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid upload" } as const;
  return run(async () => {
    const template = await finalizeUpload(user.id, parsed.data);
    revalidatePath("/dashboard");
    return { id: template.id };
  });
}

export async function saveDraftAction(templateId: string, fields: unknown) {
  const user = await requireUser();
  return run(async () => (await saveDraft(user.id, templateId, fields)).toISOString());
}

export async function publishAction(templateId: string, fields: unknown) {
  const user = await requireUser();
  return run(async () => {
    await saveDraft(user.id, templateId, fields);
    const version = await publishTemplate(user.id, templateId);
    revalidatePath(`/templates/${templateId}`, "layout");
    return { version: version.version };
  });
}

const settingsSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  exportScale: z.union([z.literal(1), z.literal(2)]).optional(),
});

export async function updateSettingsAction(templateId: string, input: z.infer<typeof settingsSchema>) {
  const user = await requireUser();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid settings" } as const;
  return run(async () => {
    await updateTemplateSettings(user.id, templateId, parsed.data);
    refresh();
    return undefined;
  });
}

export async function deleteTemplateAction(templateId: string) {
  const user = await requireUser();
  const result = await run(() => deleteTemplate(user.id, templateId));
  if (!result.ok) return result;
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function duplicateTemplateAction(templateId: string) {
  const user = await requireUser();
  const result = await run(() => duplicateTemplate(user.id, templateId));
  if (!result.ok) return result;
  revalidatePath("/dashboard");
  redirect(`/templates/${result.data.id}/edit`);
}

export async function createLinkAction(templateId: string, input: z.input<typeof linkInputSchema>) {
  const user = await requireUser();
  const parsed = linkInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid link" } as const;
  return run(async () => {
    const link = await createLink(user.id, templateId, parsed.data);
    refresh();
    return { id: link.id, token: link.token };
  });
}

const linkPatchSchema = linkInputSchema.partial().extend({ enabled: z.boolean().optional() });

export async function updateLinkAction(linkId: string, input: z.input<typeof linkPatchSchema>) {
  const user = await requireUser();
  const parsed = linkPatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid link" } as const;
  return run(async () => {
    await updateLink(user.id, linkId, parsed.data);
    refresh();
    return undefined;
  });
}

export async function deleteLinkAction(linkId: string) {
  const user = await requireUser();
  return run(async () => {
    await deleteLink(user.id, linkId);
    refresh();
    return undefined;
  });
}
