import { UploadCloud } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LinksManager } from "@/components/app/links-manager";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/session";
import { getOwnedTemplate, listLinks } from "@/lib/templates";

export const metadata: Metadata = { title: "Share links" };

export default async function LinksPage({ params }: PageProps<"/templates/[id]/links">) {
  const { id } = await params;
  const user = await requireUser(`/templates/${id}/links`);
  const template = await getOwnedTemplate(user.id, id);
  if (!template) notFound();
  const links = await listLinks(user.id, id);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow={template.name}
        title="Share links"
        description="Anyone with a link can fill in the fields and download their invite — or upload a spreadsheet to make many at once."
      />
      {!template.publishedVersion ? (
        <div className="mt-8 rounded-lg border border-dashed border-foreground/20 bg-card/60 p-8 text-center">
          <UploadCloud className="mx-auto size-7 text-brand-ink" />
          <h2 className="mt-3 text-lg font-medium">Publish first</h2>
          <p className="mt-1 text-sm text-muted-foreground">Links always serve the latest published version of your design.</p>
          <Button asChild className="mt-4">
            <Link href={`/templates/${id}/edit`}>Open the designer</Link>
          </Button>
        </div>
      ) : (
        <LinksManager
          templateId={id}
          publishedVersion={template.publishedVersion.version}
          links={links.map((l) => ({
            id: l.id,
            token: l.token,
            label: l.label,
            enabled: l.enabled,
            expiresAt: l.expiresAt?.toISOString() ?? null,
            maxGenerations: l.maxGenerations,
            generationsUsed: l.generationsUsed,
            maxBulkRows: l.maxBulkRows,
            createdAt: l.createdAt.toISOString(),
          }))}
        />
      )}
    </div>
  );
}
