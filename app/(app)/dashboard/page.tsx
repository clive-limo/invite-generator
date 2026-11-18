import { ImagePlus, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { TemplateCard } from "@/components/app/template-card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/session";
import { storage } from "@/lib/storage";
import { listTemplates } from "@/lib/templates";

export const metadata: Metadata = { title: "Your templates" };

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const templates = await listTemplates(user.id);
  const cards = await Promise.all(
    templates.map(async (t) => ({
      id: t.id,
      name: t.name,
      width: t.width,
      height: t.height,
      thumbUrl: await storage().presignGet(t.thumbKey, { stableFor: 3600 }),
      published: Boolean(t.publishedVersionId),
      links: t._count.links,
      generations: t.versions.reduce((n, v) => n + v._count.generations, 0),
      updatedAt: t.updatedAt.toISOString(),
    })),
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <PageHeader
        className="mb-8"
        eyebrow={`Workspace · ${cards.length} template${cards.length === 1 ? "" : "s"}`}
        title="Your templates"
        description="Designs you can personalise and share."
        actions={
          <Button asChild size="lg" className="sm:hidden">
            <Link href="/templates/new">
              <Plus /> New template
            </Link>
          </Button>
        }
      />

      {cards.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed border-foreground/20 bg-card/60 px-6 py-16 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-brand-muted text-brand-ink">
            <ImagePlus className="size-6" />
          </span>
          <h2 className="mt-5 text-xl font-medium">Upload your first design</h2>
          <p className="mt-1 max-w-sm text-muted-foreground">
            Export your invitation from Canva, Photoshop or anywhere else as a PNG or JPG — the bigger the better.
          </p>
          <Button asChild size="lg" className="mt-6 h-10 px-5">
            <Link href="/templates/new">
              <Plus /> New template
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {cards.map((card) => (
            <li key={card.id}>
              <TemplateCard {...card} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
