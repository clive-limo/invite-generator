import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Editor } from "@/components/editor/editor";
import { prisma } from "@/lib/db";
import { MAX_CANVAS_PIXELS } from "@/lib/render/protocol";
import { requireUser } from "@/lib/session";
import { storage } from "@/lib/storage";
import { getOwnedTemplate, parseFields } from "@/lib/templates";

export const metadata: Metadata = { title: "Design" };

export default async function EditPage({ params }: PageProps<"/templates/[id]/edit">) {
  const { id } = await params;
  const user = await requireUser(`/templates/${id}/edit`);
  const template = await getOwnedTemplate(user.id, id);
  if (!template) notFound();
  const [previewUrl, linkCount] = await Promise.all([
    storage().presignGet(template.previewKey, { stableFor: 3600 }),
    prisma.shareLink.count({ where: { templateId: id } }),
  ]);

  return (
    // Fixed height so the stage scrolls internally: viewport minus app header and tabs.
    <div className="flex h-[calc(100dvh-6.5rem)] flex-col">
      <Editor
        template={{
          id: template.id,
          name: template.name,
          width: template.width,
          height: template.height,
          previewUrl,
          exportScale: template.exportScale,
          canExport2x: template.width * template.height * 4 <= MAX_CANVAS_PIXELS,
          hasLinks: linkCount > 0,
        }}
        initialFields={parseFields(template.draftFields)}
        publishedVersion={template.publishedVersion?.version ?? null}
        publishedFields={template.publishedVersion ? parseFields(template.publishedVersion.fields) : null}
      />
    </div>
  );
}
