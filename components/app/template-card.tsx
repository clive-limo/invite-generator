"use client";

import { Activity, Copy, Link2, MoreVertical, PencilRuler, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { deleteTemplateAction, duplicateTemplateAction } from "@/app/(app)/actions";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { relativeTime } from "@/lib/format";

interface Props {
  id: string;
  name: string;
  width: number;
  height: number;
  thumbUrl: string;
  published: boolean;
  links: number;
  generations: number;
  updatedAt: string;
}

export function TemplateCard({ id, name, width, height, thumbUrl, published, links, generations, updatedAt }: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-lg border bg-card transition hover:border-foreground/25 hover:shadow-[0_16px_40px_-24px_oklch(0.4_0.08_45/0.45)]">
      <Link href={`/templates/${id}/edit`} className="block border-b bg-surface">
        <div className="relative aspect-[4/5]">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs */}
          <img src={thumbUrl} alt="" className="absolute inset-0 size-full object-contain p-4 drop-shadow-[0_6px_14px_oklch(0.35_0.05_45/0.18)] transition group-hover:scale-[1.02]" loading="lazy" />
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/templates/${id}/edit`} className="line-clamp-2 leading-snug font-semibold tracking-[-0.01em] hover:text-brand-ink">
            {name}
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="-mt-1 -mr-1 shrink-0" aria-label="Template actions" disabled={pending}>
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/templates/${id}/edit`}>
                  <PencilRuler /> Edit fields
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/templates/${id}/links`}>
                  <Link2 /> Share links
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/templates/${id}/generate`}>
                  <Wand2 /> Generate
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/templates/${id}/activity`}>
                  <Activity /> Activity
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  startTransition(async () => {
                    const result = await duplicateTemplateAction(id);
                    if (result && !result.ok) toast.error(result.error);
                  })
                }
              >
                <Copy /> Duplicate
              </DropdownMenuItem>
              <ConfirmDialog
                title={`Delete “${name}”?`}
                description="Its share links stop working immediately. Invites people already downloaded are unaffected."
                confirmLabel="Delete template"
                destructive
                onConfirm={async () => {
                  const result = await deleteTemplateAction(id);
                  if (result && !result.ok) toast.error(result.error);
                }}
                trigger={
                  <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                }
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
          <Badge variant={published ? "success" : "outline"}>{published ? "Published" : "Draft"}</Badge>
          <span>
            {width}×{height}
          </span>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          <span className="hidden sm:inline">
            {links} link{links === 1 ? "" : "s"} · {generations} made ·{" "}
          </span>
          edited {relativeTime(updatedAt)}
        </p>
      </div>
    </div>
  );
}
