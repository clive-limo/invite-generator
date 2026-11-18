import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TemplateTabs } from "@/components/app/template-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/session";
import { getOwnedTemplate } from "@/lib/templates";

async function TemplateTitle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/templates/${id}/edit`);
  const template = await getOwnedTemplate(user.id, id);
  if (!template) notFound();
  return <span className="block truncate text-sm font-semibold">{template.name}</span>;
}

export default function TemplateLayout({ children, params }: LayoutProps<"/templates/[id]">) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b bg-surface">
        <div className="flex h-12 items-center gap-2 px-2 sm:px-4">
          <Link href="/dashboard" className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-accent" aria-label="All templates">
            <ChevronLeft className="size-5" />
          </Link>
          <div className="hidden min-w-0 max-w-64 items-center gap-3 md:flex">
            <span className="eyebrow shrink-0 text-[0.6875rem]">Template</span>
            <Suspense fallback={<Skeleton className="h-5 w-40" />}>
              <TemplateTitle params={params} />
            </Suspense>
          </div>
          <div className="hidden h-5 w-px bg-border md:block" />
          <Suspense>
            <TemplateTabs params={params} />
          </Suspense>
        </div>
      </div>
      {children}
    </div>
  );
}
