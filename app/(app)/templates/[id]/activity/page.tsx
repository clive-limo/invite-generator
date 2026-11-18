import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityTable } from "@/components/app/activity-table";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/session";
import { ACTIVITY_PAGE_SIZE, getOwnedTemplate, listActivity, parseFields } from "@/lib/templates";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage({ params, searchParams }: PageProps<"/templates/[id]/activity">) {
  const { id } = await params;
  const { page: pageParam } = await searchParams;
  const user = await requireUser(`/templates/${id}/activity`);
  const template = await getOwnedTemplate(user.id, id);
  if (!template) notFound();
  const page = Math.max(1, Number(pageParam) || 1);
  const { total, generations, versions } = await listActivity(user.id, id, page);
  const pages = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow={template.name}
        title="Activity"
        description={
          <>
            {total} invite{total === 1 ? "" : "s"} created. Images aren&apos;t stored — re-download rebuilds one from its details.
          </>
        }
        actions={
          total > 0 && (
            <Button variant="outline" asChild>
              <a href={`/api/templates/${id}/activity.csv`} download>
                <Download /> Export CSV
              </a>
            </Button>
          )
        }
      />

      <ActivityTable
        templateId={id}
        templateName={template.name}
        width={template.width}
        height={template.height}
        versions={Object.fromEntries(versions.map((v) => [v.id, { fields: parseFields(v.fields), exportScale: v.exportScale, version: v.version }]))}
        rows={generations.map((g) => ({
          id: g.id,
          versionId: g.templateVersionId,
          values: g.values as Record<string, string>,
          source: g.source,
          linkLabel: g.shareLink?.label ?? null,
          createdAt: g.createdAt.toISOString(),
        }))}
      />

      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Pages">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/templates/${id}/activity?page=${page - 1}`} aria-disabled={page <= 1} className={page <= 1 ? "pointer-events-none opacity-50" : ""}>
              Newer
            </Link>
          </Button>
          <span className="font-mono text-xs text-muted-foreground">
            Page {page} of {pages}
          </span>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/templates/${id}/activity?page=${page + 1}`} aria-disabled={page >= pages} className={page >= pages ? "pointer-events-none opacity-50" : ""}>
              Older
            </Link>
          </Button>
        </nav>
      )}
    </div>
  );
}
