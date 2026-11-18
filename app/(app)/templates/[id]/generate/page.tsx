import { UploadCloud } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OwnerGenerate } from "@/components/app/owner-generate";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/session";
import { storage } from "@/lib/storage";
import { getOwnedTemplate, MAX_BULK_ROWS, parseFields } from "@/lib/templates";

export const metadata: Metadata = { title: "Generate" };

export default async function GeneratePage({ params, searchParams }: PageProps<"/templates/[id]/generate">) {
  const { id } = await params;
  const { mode } = await searchParams;
  const user = await requireUser(`/templates/${id}/generate`);
  const template = await getOwnedTemplate(user.id, id);
  if (!template) notFound();

  if (!template.publishedVersion) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16 text-center">
        <UploadCloud className="mx-auto size-7 text-brand-ink" />
        <h1 className="mt-3 text-xl font-medium">Publish your design first</h1>
        <p className="mt-1 text-sm text-muted-foreground">Generation uses the published version, exactly as your guests will see it.</p>
        <Button asChild className="mt-4">
          <Link href={`/templates/${id}/edit`}>Open the designer</Link>
        </Button>
      </div>
    );
  }

  const previewUrl = await storage().presignGet(template.previewKey, { stableFor: 3600 });
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 md:py-10">
      <OwnerGenerate
        initialMode={mode === "bulk" ? "bulk" : "single"}
        template={{
          name: template.name,
          width: template.width,
          height: template.height,
          previewUrl,
          fields: parseFields(template.publishedVersion.fields),
          exportScale: template.publishedVersion.exportScale,
        }}
        claimUrl={`/api/templates/${id}/claim`}
        maxRows={MAX_BULK_ROWS}
      />
    </div>
  );
}
