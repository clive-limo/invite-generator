import { Suspense } from "react";
import { BulkGenerator } from "@/components/bulk/bulk-generator";
import { LinkProblem } from "@/components/invite/link-problem";
import { PublicSkeleton } from "@/components/invite/public-skeleton";
import { storage } from "@/lib/storage";
import { resolveLink } from "@/lib/templates";

async function PublicBulk({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveLink(token);
  if ("problem" in resolved) return <LinkProblem problem={resolved.problem!} />;
  const { template, version, fields, link } = resolved;
  if (link.maxBulkRows === 0) {
    return (
      <div className="mx-auto mt-16 max-w-sm text-center">
        <h1 className="text-2xl font-medium">Bulk generation is off</h1>
        <p className="mt-2 text-muted-foreground">This link only makes one invite at a time.</p>
        <a href={`/i/${token}`} className="mt-4 inline-block font-semibold text-brand-ink hover:underline">
          Create a single invite
        </a>
      </div>
    );
  }
  const previewUrl = await storage().presignGet(template.previewKey, { stableFor: 3600 });
  const remaining = link.maxGenerations === null ? null : link.maxGenerations - link.generationsUsed;

  return (
    <>
      <div className="mb-8">
        <p className="eyebrow">Invites from a guest list</p>
        <h1 className="mt-2 text-3xl font-medium tracking-[-0.03em] text-balance sm:text-4xl">{template.name}</h1>
        <p className="mt-2 text-muted-foreground">
          Create invites for a whole list from a spreadsheet.
          {remaining !== null && ` This link has ${remaining} invite${remaining === 1 ? "" : "s"} left.`}
        </p>
      </div>
      <BulkGenerator
        template={{ name: template.name, width: template.width, height: template.height, previewUrl, fields, exportScale: version.exportScale }}
        claimUrl={`/api/i/${token}/claim`}
        maxRows={remaining === null ? link.maxBulkRows : Math.min(link.maxBulkRows, remaining)}
        singleHref={`/i/${token}`}
      />
    </>
  );
}

export default function PublicBulkPage({ params }: PageProps<"/i/[token]/bulk">) {
  return (
    <Suspense fallback={<PublicSkeleton />}>
      <PublicBulk params={params} />
    </Suspense>
  );
}
