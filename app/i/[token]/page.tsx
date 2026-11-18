import { Suspense } from "react";
import { LinkProblem } from "@/components/invite/link-problem";
import { PublicSkeleton } from "@/components/invite/public-skeleton";
import { SingleGenerator } from "@/components/invite/single-generator";
import { storage } from "@/lib/storage";
import { resolveLink } from "@/lib/templates";

async function PublicInvite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveLink(token);
  if ("problem" in resolved) return <LinkProblem problem={resolved.problem!} />;
  const { template, version, fields, link } = resolved;
  const previewUrl = await storage().presignGet(template.previewKey, { stableFor: 3600 });

  return (
    <>
      <div className="mb-8 md:mb-10">
        <p className="eyebrow">Personalised invite</p>
        <h1 className="mt-2 text-3xl font-medium tracking-[-0.03em] text-balance sm:text-4xl">{template.name}</h1>
        <p className="mt-2 text-muted-foreground">Fill in your details and download your invite as a print-ready PNG or PDF.</p>
      </div>
      <SingleGenerator
        template={{
          name: template.name,
          width: template.width,
          height: template.height,
          previewUrl,
          fields,
          exportScale: version.exportScale,
        }}
        claimUrl={`/api/i/${token}/claim`}
        bulkHref={link.maxBulkRows > 0 ? `/i/${token}/bulk` : undefined}
      />
    </>
  );
}

export default function PublicInvitePage({ params }: PageProps<"/i/[token]">) {
  return (
    <Suspense fallback={<PublicSkeleton />}>
      <PublicInvite params={params} />
    </Suspense>
  );
}
