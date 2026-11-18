"use client";

import { Download, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/download";
import { sanitizeFilename } from "@/lib/fields/filename";
import type { Field } from "@/lib/fields/schema";
import { resolveValues } from "@/lib/fields/validate";
import { relativeTime } from "@/lib/format";
import { createRenderer, fetchSource, type Renderer } from "@/lib/render/client";

interface Row {
  id: string;
  versionId: string;
  values: Record<string, string>;
  source: "LINK" | "OWNER" | "BULK";
  linkLabel: string | null;
  createdAt: string;
}

interface Props {
  templateId: string;
  templateName: string;
  width: number;
  height: number;
  versions: Record<string, { fields: Field[]; exportScale: number; version: number }>;
  rows: Row[];
}

export function ActivityTable({ templateId, templateName, width, height, versions, rows }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const source = useRef<Promise<Blob> | null>(null);
  const renderers = useRef(new Map<string, Promise<Renderer>>());

  useEffect(() => {
    const cache = renderers.current;
    return () => {
      for (const r of cache.values()) void r.then((x) => x.dispose()).catch(() => undefined);
    };
  }, []);

  async function redownload(row: Row) {
    const version = versions[row.versionId];
    if (!version) return;
    setBusy(row.id);
    try {
      source.current ??= fetch(`/api/templates/${templateId}/source`)
        .then((r) => r.json())
        .then((body: { sourceUrl: string }) => fetchSource(body.sourceUrl));
      let renderer = renderers.current.get(row.versionId);
      if (!renderer) {
        renderer = source.current.then((blob) =>
          createRenderer({ width, height, fields: version.fields, scale: version.exportScale, dpi: 300 }, blob),
        );
        renderers.current.set(row.versionId, renderer);
      }
      const blob = await (await renderer).render(resolveValues(version.fields, row.values));
      const first = row.values[version.fields[0]?.key ?? ""] ?? "";
      downloadBlob(blob, `${sanitizeFilename(first) || sanitizeFilename(templateName) || "invite"}-invite.png`);
    } catch (e) {
      source.current = null;
      renderers.current.delete(row.versionId);
      toast.error(e instanceof Error ? e.message : "Couldn't rebuild that invite");
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-dashed border-foreground/20 bg-card/60 p-8 text-center text-muted-foreground">
        Nothing yet. Invites made through your links or the Generate tab show up here.
      </div>
    );
  }

  return (
    <ul className="mt-8 divide-y rounded-lg border bg-card">
      {rows.map((row) => {
        const version = versions[row.versionId];
        const summary = (version?.fields ?? [])
          .map((f) => row.values[f.key])
          .filter(Boolean)
          .join(" · ");
        return (
          <li key={row.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{summary || <span className="text-muted-foreground">(defaults only)</span>}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-muted-foreground">
                <Badge variant="outline">{row.source === "OWNER" ? "You" : row.source === "BULK" ? `Bulk${row.linkLabel ? ` · ${row.linkLabel}` : ""}` : row.linkLabel ?? "Link"}</Badge>
                <span>{relativeTime(row.createdAt)}</span>
                {version && <span>v{version.version}</span>}
              </p>
            </div>
            <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => redownload(row)} aria-label="Re-download">
              {busy === row.id ? <Loader2 className="animate-spin" /> : <Download />}
              <span className="hidden sm:inline">Re-download</span>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
