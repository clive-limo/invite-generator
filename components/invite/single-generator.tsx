"use client";

import { ArrowRight, FileDown, FileSpreadsheet, ImageDown, Loader2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { downloadBlob } from "@/lib/download";
import { sanitizeFilename } from "@/lib/fields/filename";
import type { Field, FieldValues } from "@/lib/fields/schema";
import { buildValuesSchema, resolveValues } from "@/lib/fields/validate";
import type { OutputFormat } from "@/lib/render/protocol";
import { cn } from "@/lib/utils";
import { PreviewCanvas } from "./preview-canvas";
import { ClaimError, postClaim, useRendererCache } from "./use-claim-renderer";

export interface GeneratorTemplate {
  name: string;
  width: number;
  height: number;
  previewUrl: string;
  fields: Field[];
  exportScale: number;
}

interface Props {
  template: GeneratorTemplate;
  claimUrl: string;
  bulkHref?: string;
}

type Phase = { kind: "form" } | { kind: "working"; step: "claim" | "download" | "render"; progress: number; format: OutputFormat };

/** Print size at the 300 DPI exports are tagged with (and the PDF page size), e.g. "148 × 210 mm". */
export function printSize(template: Pick<GeneratorTemplate, "width" | "height" | "exportScale">): string {
  const mm = (px: number) => Math.round(((px * template.exportScale) / 300) * 25.4);
  return `${mm(template.width)} × ${mm(template.height)} mm`;
}

export function SingleGenerator({ template, claimUrl, bulkHref }: Props) {
  const { fields } = template;
  const blank = () => Object.fromEntries(fields.map((f) => [f.key, ""]));
  const [values, setValues] = useState<FieldValues>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const getRenderer = useRendererCache();
  const schema = useMemo(() => buildValuesSchema(fields), [fields]);

  // Blank fields preview with their sample text so people can see where things go.
  const previewValues = useMemo(
    () => Object.fromEntries(fields.map((f) => [f.key, values[f.key]?.trim() ? values[f.key]! : f.defaultValue || f.sampleValue])),
    [fields, values],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Enter submits with the first button (PNG); the secondary button carries value="pdf".
    const format: OutputFormat = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "pdf" ? "pdf" : "png";
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      document.getElementById(`v-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    setErrors({});
    setPhase({ kind: "working", step: "claim", progress: 0, format });
    try {
      const claim = await postClaim(claimUrl, { mode: "single", values: parsed.data });
      setPhase({ kind: "working", step: "download", progress: 0, format });
      const renderer = await getRenderer(claim, (p) => setPhase({ kind: "working", step: "download", progress: p, format }));
      setPhase({ kind: "working", step: "render", progress: 1, format });
      const file = await renderer.render(resolveValues(claim.job.fields, claim.rows[0]!), format);
      const first = claim.rows[0]![fields[0]?.key ?? ""] ?? "";
      const name = `${sanitizeFilename(first) || sanitizeFilename(template.name) || "invite"}-invite.${format}`;
      downloadBlob(file, name);

      // Straight back to an empty form for the next guest.
      setValues(blank());
      setPhase({ kind: "form" });
      toast.success("Invite downloaded", {
        description: name,
        action: { label: "Download again", onClick: () => downloadBlob(file, name) },
      });
      // Keyboards pop up on touch screens, so only jump to the first field with a mouse.
      if (window.matchMedia("(pointer: fine)").matches) document.getElementById(`v-${fields[0]?.key}`)?.focus();
    } catch (e) {
      setPhase({ kind: "form" });
      if (e instanceof ClaimError && e.rowErrors?.length) {
        setErrors(Object.fromEntries(e.rowErrors.map((r) => [r.fieldKey, r.message])));
      }
      toast.error(e instanceof Error ? e.message : "Couldn't create your invite");
    }
  }

  const working = phase.kind === "working";
  const stepLabel =
    phase.kind === "working"
      ? phase.step === "claim"
        ? "Checking details…"
        : phase.step === "download"
          ? `Fetching the design… ${Math.round(phase.progress * 100)}%`
          : `Creating your ${phase.format.toUpperCase()}…`
      : "";
  // The main button also shows progress for a PDF, since it has the room.
  const primary = (
    <>
      {working ? <Loader2 className="animate-spin" /> : <ImageDown />}
      <span className="truncate">{working ? stepLabel : "Download PNG"}</span>
    </>
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-8 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:items-start md:gap-12">
      <div className="relative md:sticky md:top-8">
        <div aria-hidden className="glow-warm pointer-events-none absolute inset-x-6 -bottom-6 top-1/2 -z-10 opacity-60" />
        <PreviewCanvas
          imageUrl={template.previewUrl}
          width={template.width}
          height={template.height}
          fields={fields}
          values={previewValues}
          // Width derived from the height budget so aspect-ratio holds on short screens.
          className="mx-auto w-[min(100%,calc(46dvh*var(--ar)))] overflow-hidden rounded-lg border border-foreground/10 shadow-[0_24px_60px_-28px_oklch(0.4_0.08_45/0.45)] md:w-[min(100%,calc((100dvh-14rem)*var(--ar)))]"
          style={{ "--ar": template.width / template.height } as CSSProperties}
        />
        <p className="eyebrow mt-4 text-center text-[0.6875rem]">Live preview · download is full resolution</p>
      </div>

      <div className="grid gap-4 pb-24 md:pb-0">
        <section className="grid gap-5 rounded-lg border bg-card p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="eyebrow">Your details</h2>
            <span className="font-mono text-[0.6875rem] text-muted-foreground">
              {fields.length} field{fields.length === 1 ? "" : "s"}
            </span>
          </div>
          {fields.map((field) => (
            <div key={field.id} className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor={`v-${field.key}`} className="text-base md:text-sm">
                  {field.label}
                  {field.required && <span className="text-brand-ink"> *</span>}
                </Label>
                {field.maxLength && (
                  <span
                    className={cn(
                      "font-mono text-xs tabular-nums text-muted-foreground",
                      (values[field.key]?.length ?? 0) > field.maxLength && "text-destructive",
                    )}
                  >
                    {values[field.key]?.length ?? 0}/{field.maxLength}
                  </span>
                )}
              </div>
              {field.multiline ? (
                <Textarea
                  id={`v-${field.key}`}
                  rows={3}
                  value={values[field.key] ?? ""}
                  placeholder={field.placeholder || field.sampleValue}
                  aria-invalid={Boolean(errors[field.key])}
                  disabled={working}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  className="text-base"
                />
              ) : (
                <Input
                  id={`v-${field.key}`}
                  value={values[field.key] ?? ""}
                  placeholder={field.placeholder || field.sampleValue}
                  aria-invalid={Boolean(errors[field.key])}
                  disabled={working}
                  autoComplete="off"
                  enterKeyHint="next"
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  className="h-11 text-base md:h-10"
                />
              )}
              {errors[field.key] ? (
                <p className="text-sm text-destructive">{errors[field.key]}</p>
              ) : (
                !field.required && field.defaultValue && <p className="text-xs text-muted-foreground">Leave blank for “{field.defaultValue}”.</p>
              )}
            </div>
          ))}

          {/* Desktop button; on phones the sticky bar below takes over. */}
          <div className="hidden gap-3 border-t pt-5 md:grid">
            {working && <Progress value={phase.kind === "working" && phase.step === "download" ? phase.progress * 100 : undefined} />}
            <Button type="submit" value="png" size="lg" className="h-11 min-w-0 text-base" disabled={working}>
              {primary}
            </Button>
            <Button type="submit" value="pdf" variant="outline" size="lg" className="h-11 text-base" disabled={working}>
              <FileDown /> Download PDF
            </Button>
            <p className="text-center font-mono text-[0.6875rem] text-muted-foreground">PNG or PDF · 300 DPI · {printSize(template)}</p>
          </div>
        </section>

        {bulkHref && (
          <Link href={bulkHref} className="group flex items-center gap-4 rounded-lg border border-dashed border-foreground/20 p-4 transition hover:border-brand/50 hover:bg-card">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-muted text-brand-ink">
              <FileSpreadsheet className="size-5" />
            </span>
            <span className="flex-1 text-sm">
              <span className="font-semibold">Making invites for a whole list?</span>
              <span className="block text-muted-foreground">Upload a CSV or Excel file and download a ZIP of them all.</span>
            </span>
            <ArrowRight className="size-4 text-brand-ink transition group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>

      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t bg-background/90 px-4 pt-3 backdrop-blur-md md:hidden">
        <Button type="submit" value="png" size="lg" className="h-12 min-w-0 flex-1 text-base" disabled={working}>
          {primary}
        </Button>
        <Button type="submit" value="pdf" variant="outline" size="lg" className="h-12 text-base" disabled={working} aria-label="Download PDF">
          <FileDown /> PDF
        </Button>
      </div>
    </form>
  );
}
