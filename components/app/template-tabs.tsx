"use client";

import { Activity, Link2, PencilRuler, Wand2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { use } from "react";
import { cn } from "@/lib/utils";

const TABS = [
  { slug: "edit", label: "Design", icon: PencilRuler },
  { slug: "links", label: "Share", icon: Link2 },
  { slug: "generate", label: "Generate", icon: Wand2 },
  { slug: "activity", label: "Activity", icon: Activity },
] as const;

export function TemplateTabs({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const pathname = usePathname();
  return (
    <nav className="flex h-full min-w-0 flex-1 justify-center gap-1 overflow-x-auto md:justify-start md:pl-4" aria-label="Template sections">
      {TABS.map((tab) => {
        const href = `/templates/${id}/${tab.slug}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={tab.slug}
            href={href}
            aria-current={active ? "page" : undefined}
            // Underline tabs with a signal-orange indicator, as in Postman's workbench.
            className={cn(
              "relative flex h-full shrink-0 items-center gap-1.5 px-3 text-sm font-semibold transition-colors after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors",
              active ? "text-foreground after:bg-brand" : "text-muted-foreground after:bg-transparent hover:text-foreground hover:after:bg-foreground/15",
            )}
          >
            <tab.icon className={cn("size-4", active && "text-brand-ink")} />
            {/* Phones show the active tab's label only, so all four fit. */}
            <span className={cn(!active && "sr-only sm:not-sr-only")}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
