"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileArchive,
  FileDown,
  FileSpreadsheet,
  Loader2,
  Pause,
  Play,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { toast } from "sonner";
import { PreviewCanvas } from "@/components/invite/preview-canvas";
import type { GeneratorTemplate } from "@/components/invite/single-generator";
import { ClaimError, postClaim, useRendererCache } from "@/components/invite/use-claim-renderer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseSheet, SheetError, type ParsedSheet } from "@/lib/bulk/parse";
import { openZipSink, type ZipPart, type ZipSink } from "@/lib/bulk/zip-output";
import { downloadBlob } from "@/lib/download";
import { applyMapping, autoMapColumns, sampleCsv, toCsv, type ColumnMapping } from "@/lib/fields/csv-mapping";
import { expandFilename, sanitizeFilename, uniqueFilenames } from "@/lib/fields/filename";
import type { FieldValues } from "@/lib/fields/schema";
import { resolveValues, validateRows, type RowError } from "@/lib/fields/validate";
import type { OutputFormat } from "@/lib/render/protocol";
import { cn } from "@/lib/utils";

interface Props {
  template: GeneratorTemplate;
  claimUrl: string;
  maxRows: number;
  singleHref?: string;
}

type Step = "upload" | "map" | "review" | "run" | "done";

interface RunState {
  total: number;
  done: number;
  failures: { row: number; values: FieldValues; message: string }[];
  startedAt: number;
  /** When `done` last changed; used for the ETA. */
  updatedAt: number;
  thumbUrl: string | null;
  paused: boolean;
  parts: PartView[];
}

/** What's left of a finished batch once the form has cleared for the next list. */
interface BatchReport {
  made: number;
  /** The ZIP, kept so it can be downloaded again; only for single-part batches. */
  zip: { name: string; blob: Blob } | null;
  failedCsv: Blob | null;
  failedCount: number;
  skippedCsv: Blob | null;
  skippedCount: number;
}

interface PartView {
  index: number;
  name: string;
  size: number;
  /** Already downloaded (automatically or by tapping Save). */
  saved: boolean;
  /** Its blob is still held, so it can be saved (again). */
  available: boolean;
}

/** Spreadsheet row number shown to people (row 1 is the header). */
const sheetRow = (index: number) => index + 2;

export function BulkGenerator({ template, claimUrl, maxRows, singleHref }: Props) {
  const { fields } = template;
  const [step, setStep] = useState<Step>("upload");
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [edits, setEdits] = useState<Record<number, FieldValues>>({});
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [pattern, setPattern] = useState(`{${fields[0]?.key ?? "n"}}-invite`);
  const [run, setRun] = useState<RunState | null>(null);
  const [report, setReport] = useState<BatchReport | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const control = useRef({ cancelled: false, paused: false, resume: null as null | (() => void) });
  const sinkRef = useRef<ZipSink | null>(null);
  // Part blobs live outside state; only the latest auto-downloaded one is kept for "download again".
  const partBlobs = useRef(new Map<number, { name: string; blob: Blob }>());
  // Parts waiting for a Save tap (iOS). The form clears once this is empty.
  const unsaved = useRef(new Set<number>());
  const pendingReport = useRef<BatchReport | null>(null);
  const getRenderer = useRendererCache();

  function onPart(part: ZipPart) {
    if (part.autoDownloaded) {
      for (const index of partBlobs.current.keys()) partBlobs.current.delete(index);
    } else {
      unsaved.current.add(part.index);
    }
    partBlobs.current.set(part.index, { name: part.name, blob: part.blob });
    setRun((r) => {
      if (!r) return r;
      const parts = r.parts.map((p) => (part.autoDownloaded ? { ...p, available: false } : p));
      return { ...r, parts: [...parts, { index: part.index, name: part.name, size: part.blob.size, saved: part.autoDownloaded, available: true }] };
    });
  }

  function savePart(index: number) {
    const part = partBlobs.current.get(index);
    if (!part) return;
    downloadBlob(part.blob, part.name);
    sinkRef.current?.markSaved(index);
    unsaved.current.delete(index);
    setRun((r) => (r ? { ...r, parts: r.parts.map((p) => (p.index === index ? { ...p, saved: true } : p)) } : r));
    if (step === "done" && unsaved.current.size === 0 && pendingReport.current) clearForNext(pendingReport.current);
  }

  /** Empties the uploaded list and returns to the upload step, ready for the next file. */
  function clearForNext(next: BatchReport) {
    setRun((r) => {
      if (r?.thumbUrl) URL.revokeObjectURL(r.thumbUrl);
      return null;
    });
    setSheet(null);
    setMapping({});
    setEdits({});
    setSkipped(new Set());
    setStep("upload");
    setReport(next);
    pendingReport.current = null;
    toast.success(`${next.made} invite${next.made === 1 ? "" : "s"} downloaded`, {
      description: next.zip ? next.zip.name : "Ready for your next list.",
    });
  }

  function rowsCsv(rows: { values: FieldValues; row: number; message: string }[]): Blob {
    const header = [...fields.map((f) => f.label), "Spreadsheet row", "Problem"];
    const body = rows.map((r) => [...fields.map((field) => r.values[field.key] ?? ""), String(r.row), r.message]);
    return new Blob([toCsv([header, ...body])], { type: "text/csv" });
  }

  const mappedRows = useMemo(() => {
    if (!sheet) return [];
    return applyMapping(sheet.rows, mapping).map((row, i) => ({ ...row, ...edits[i] }));
  }, [sheet, mapping, edits]);

  const errorsByRow = useMemo(() => {
    const map = new Map<number, RowError[]>();
    for (const error of validateRows(fields, mappedRows).errors) {
      map.set(error.row, [...(map.get(error.row) ?? []), error]);
    }
    return map;
  }, [fields, mappedRows]);

  const included = useMemo(
    () => mappedRows.map((_, i) => i).filter((i) => !skipped.has(i) && !errorsByRow.has(i)),
    [mappedRows, skipped, errorsByRow],
  );
  const problems = useMemo(() => [...errorsByRow.keys()].filter((i) => !skipped.has(i)), [errorsByRow, skipped]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFatal(null);
    setReport(null);
    try {
      const parsed = await parseSheet(file);
      if (parsed.rows.length > maxRows) {
        setFatal(`That file has ${parsed.rows.length} rows, but this link allows up to ${maxRows} per batch. Split it into smaller files.`);
        return;
      }
      setSheet(parsed);
      setMapping(autoMapColumns(parsed.headers, fields));
      setEdits({});
      setSkipped(new Set());
      setStep("map");
    } catch (e) {
      setFatal(e instanceof SheetError ? e.message : "Couldn't read that file");
    }
  }

  async function start(format: OutputFormat) {
    if (!sheet || included.length === 0) return;
    const baseName = sanitizeFilename(`${template.name}-invites`) || "invites";
    partBlobs.current.clear();
    unsaved.current.clear();
    let partCount = 0;
    const sink = openZipSink(baseName, (part) => {
      partCount = part.index;
      onPart(part);
    });
    sinkRef.current = sink;
    control.current = { cancelled: false, paused: false, resume: null };
    const failures: RunState["failures"] = [];
    setFatal(null);
    setReport(null);
    setStep("run");
    setRun({ total: included.length, done: 0, failures: [], startedAt: Date.now(), updatedAt: Date.now(), thumbUrl: null, paused: false, parts: [] });

    let wakeLock: WakeLockSentinel | null = null;
    const lockScreen = async () => {
      try {
        wakeLock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        // Not supported or denied; generation still works.
      }
    };
    const onVisible = () => document.visibilityState === "visible" && void lockScreen();
    document.addEventListener("visibilitychange", onVisible);
    await lockScreen();

    try {
      const claim = await postClaim(claimUrl, {
        mode: "bulk",
        rows: included.map((i) => mappedRows[i]),
        filenamePattern: pattern,
      });
      const renderer = await getRenderer(claim);
      const names = uniqueFilenames(
        claim.rows.map((values, i) => expandFilename(pattern, values, i + 1)),
        `.${format}`,
      );
      let lastThumb = 0;
      for (let i = 0; i < claim.rows.length; i++) {
        if (control.current.cancelled) break;
        if (control.current.paused) await new Promise<void>((resolve) => (control.current.resume = resolve));
        if (control.current.cancelled) break;
        const values = claim.rows[i]!;
        try {
          const blob = await renderer.render(resolveValues(claim.job.fields, values), format);
          await sink.add(names[i]!, blob);
          // An <img> can't show a PDF, so PDF runs keep the spinner.
          const showThumb = format === "png" && Date.now() - lastThumb > 800;
          if (showThumb) lastThumb = Date.now();
          setRun((r) => {
            if (!r) return r;
            if (showThumb && r.thumbUrl) URL.revokeObjectURL(r.thumbUrl);
            return { ...r, done: r.done + 1, updatedAt: Date.now(), thumbUrl: showThumb ? URL.createObjectURL(blob) : r.thumbUrl };
          });
        } catch (e) {
          const failure = { row: sheetRow(included[i]!), values, message: e instanceof Error ? e.message : "Render failed" };
          failures.push(failure);
          setRun((r) => (r ? { ...r, done: r.done + 1, updatedAt: Date.now(), failures: [...r.failures, failure] } : r));
        }
      }
      if (control.current.cancelled) {
        await sink.abort();
        setStep("review");
        toast("Generation cancelled");
      } else {
        await sink.finish();
        const skippedRows = [...skipped].sort((a, b) => a - b).map((i) => ({
          values: mappedRows[i] ?? {},
          row: sheetRow(i),
          message: errorsByRow.get(i)?.map((e) => e.message).join("; ") ?? "Skipped",
        }));
        const zip = partCount === 1 ? (partBlobs.current.get(1) ?? null) : null;
        const next: BatchReport = {
          made: claim.rows.length - failures.length,
          zip,
          failedCsv: failures.length ? rowsCsv(failures) : null,
          failedCount: failures.length,
          skippedCsv: skippedRows.length ? rowsCsv(skippedRows) : null,
          skippedCount: skippedRows.length,
        };
        // iOS: finished parts still need a Save tap; the form clears after the last one.
        if (unsaved.current.size > 0) {
          pendingReport.current = next;
          setStep("done");
        } else {
          clearForNext(next);
        }
      }
    } catch (e) {
      await sink.abort();
      setStep("review");
      if (e instanceof ClaimError && e.rowErrors?.length) {
        setFatal(`${e.message}. Rows ${[...new Set(e.rowErrors.map((r) => sheetRow(included[r.row] ?? r.row)))].slice(0, 10).join(", ")} were rejected.`);
      } else {
        setFatal(e instanceof Error ? e.message : "Something went wrong");
      }
    } finally {
      document.removeEventListener("visibilitychange", onVisible);
      await (wakeLock as WakeLockSentinel | null)?.release().catch(() => undefined);
    }
  }

  const style = { "--ar": template.width / template.height } as CSSProperties;

  return (
    <div className="grid gap-6">
      <Stepper step={step} />
      {report && step === "upload" && <ReportCard report={report} onDismiss={() => setReport(null)} />}
      {fatal && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>{fatal}</AlertDescription>
        </Alert>
      )}

      {step === "upload" && (
        <UploadStep
          maxRows={maxRows}
          onFile={onFile}
          onSample={() => downloadBlob(new Blob([sampleCsv(fields)], { type: "text/csv" }), `${sanitizeFilename(template.name) || "invite"}-template.csv`)}
          singleHref={singleHref}
        />
      )}

      {step === "map" && sheet && (
        <div className="grid gap-5">
          <div>
            <h2 className="text-xl font-medium">Match your columns</h2>
            <p className="text-sm text-muted-foreground">
              {sheet.fileName} · {sheet.rows.length} row{sheet.rows.length === 1 ? "" : "s"}. We matched what we could — check
              each field below.
            </p>
          </div>
          <div className="grid divide-y rounded-lg border bg-card">
            {fields.map((field) => {
              const index = mapping[field.key];
              const sample = index != null ? sheet.rows.find((r) => r[index]?.trim())?.[index] : undefined;
              return (
                <div key={field.id} className="grid gap-1.5 p-4 sm:grid-cols-[1fr_1.3fr] sm:items-center sm:gap-4">
                  <div>
                    <p className="font-medium">
                      {field.label}
                      {field.required && <span className="text-destructive"> *</span>}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{sample ? `e.g. “${sample}”` : field.required ? "Required" : "Optional"}</p>
                  </div>
                  <Select
                    value={index == null ? "none" : String(index)}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [field.key]: v === "none" ? null : Number(v) }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{field.defaultValue ? `Use default (“${field.defaultValue}”)` : "— Not in my file —"}</SelectItem>
                      {sheet.headers.map((header, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep("upload")}>
              <ArrowLeft /> Different file
            </Button>
            <Button size="lg" onClick={() => setStep("review")}>
              Review rows
            </Button>
          </div>
        </div>
      )}

      {step === "review" && sheet && (
        <ReviewStep
          template={template}
          style={style}
          rows={mappedRows}
          included={included}
          problems={problems}
          skippedCount={skipped.size}
          errorsByRow={errorsByRow}
          pattern={pattern}
          onPattern={setPattern}
          onEdit={(row, key, value) => setEdits((e) => ({ ...e, [row]: { ...e[row], [key]: value } }))}
          onSkip={(row) => setSkipped((s) => new Set(s).add(row))}
          onSkipAll={() => setSkipped((s) => new Set([...s, ...problems]))}
          onUnskipAll={() => setSkipped(new Set())}
          onBack={() => setStep("map")}
          onStart={start}
        />
      )}

      {step === "run" && run && (
        <RunStep
          run={run}
          onSavePart={savePart}
          onPause={() => {
            control.current.paused = true;
            setRun((r) => (r ? { ...r, paused: true } : r));
          }}
          onResume={() => {
            control.current.paused = false;
            control.current.resume?.();
            setRun((r) => (r ? { ...r, paused: false } : r));
          }}
          onCancel={() => {
            control.current.cancelled = true;
            control.current.resume?.();
          }}
        />
      )}

      {step === "done" && run && <SaveStep run={run} onSavePart={savePart} />}
    </div>
  );
}

const STEPS: { id: Step; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "map", label: "Match" },
  { id: "review", label: "Review" },
  { id: "run", label: "Download" },
];

function Stepper({ step }: { step: Step }) {
  const current = step === "done" ? STEPS.length : STEPS.findIndex((s) => s.id === step);
  return (
    <ol className="flex items-center gap-3 font-mono text-xs tracking-[0.08em] uppercase" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s.id} className="flex flex-1 items-center gap-2" aria-current={i === current ? "step" : undefined}>
          <span
            className={cn(
              "grid h-6 min-w-6 shrink-0 place-items-center rounded-sm border px-1 tabular-nums",
              i < current
                ? "border-brand bg-brand text-brand-foreground"
                : i === current
                  ? "border-brand/60 bg-brand-muted text-brand-ink"
                  : "border-foreground/15 text-muted-foreground",
            )}
          >
            {i < current ? "✓" : String(i + 1).padStart(2, "0")}
          </span>
          <span className={cn("hidden sm:inline", i === current ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
          {i < STEPS.length - 1 && <span className={cn("h-px flex-1", i < current ? "bg-brand/50" : "bg-border")} />}
        </li>
      ))}
    </ol>
  );
}

function UploadStep({ maxRows, onFile, onSample, singleHref }: { maxRows: number; onFile: (f: File | undefined) => void; onSample: () => void; singleHref?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const pick = async (file: File | undefined) => {
    setBusy(true);
    await onFile(file);
    setBusy(false);
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-muted text-brand-ink">
          <FileSpreadsheet className="size-5" />
        </span>
        <div className="flex-1 text-sm">
          <p className="font-semibold">Start from our template</p>
          <p className="text-muted-foreground">One row per invite, one column per field. Open it in Excel, Google Sheets or Numbers.</p>
        </div>
        <Button variant="outline" onClick={onSample}>
          <Download /> Sample CSV
        </Button>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setDragging(false);
          void pick(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex min-h-56 flex-col items-center justify-center gap-3 rounded-lg border-[1.5px] border-dashed border-foreground/20 bg-card/60 p-8 text-center transition",
          dragging ? "border-brand bg-brand-muted" : "hover:border-brand/60 hover:bg-card",
        )}
      >
        <span className="grid size-12 place-items-center rounded-full border border-foreground/15 bg-background">
          {busy ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : <Upload className="size-5 text-brand-ink" />}
        </span>
        <span className="font-display text-xl font-medium">Choose your guest list</span>
        <span className="font-mono text-xs text-muted-foreground">CSV or Excel (.xlsx) · up to {maxRows} rows · read on your device</span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {singleHref && (
        <a href={singleHref} className="text-center text-sm text-muted-foreground underline underline-offset-4">
          Just need one invite? Fill in the form instead
        </a>
      )}
    </div>
  );
}

interface ReviewProps {
  template: GeneratorTemplate;
  style: CSSProperties;
  rows: FieldValues[];
  included: number[];
  problems: number[];
  skippedCount: number;
  errorsByRow: Map<number, RowError[]>;
  pattern: string;
  onPattern: (p: string) => void;
  onEdit: (row: number, key: string, value: string) => void;
  onSkip: (row: number) => void;
  onSkipAll: () => void;
  onUnskipAll: () => void;
  onBack: () => void;
  onStart: (format: OutputFormat) => void;
}

function ReviewStep(props: ReviewProps) {
  const { template, rows, included, problems, skippedCount, errorsByRow, pattern } = props;
  const { fields } = template;
  const [previewRow, setPreviewRow] = useState<number | null>(null);
  const [showAllProblems, setShowAllProblems] = useState(false);
  const shownRow = previewRow ?? included[0] ?? null;
  const names = useMemo(
    () => uniqueFilenames(included.slice(0, 3).map((i, n) => expandFilename(pattern, rows[i]!, n + 1))),
    [included, pattern, rows],
  );
  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({ count: included.length, getScrollElement: () => listRef.current, estimateSize: () => 44, overscan: 10 });

  return (
    <div className="grid gap-6 pb-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:pb-0">
      <div className="grid min-w-0 content-start gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="size-3.5" /> {included.length} ready
          </Badge>
          {problems.length > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="size-3.5" /> {problems.length} need attention
            </Badge>
          )}
          {skippedCount > 0 && (
            <button type="button" onClick={props.onUnskipAll} className="text-xs text-muted-foreground underline underline-offset-4">
              {skippedCount} skipped · include again
            </button>
          )}
        </div>

        {problems.length > 0 && (
          <section className="grid gap-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">Fix or skip these rows</h3>
              <Button variant="outline" size="sm" onClick={props.onSkipAll}>
                Skip all {problems.length}
              </Button>
            </div>
            {(showAllProblems ? problems : problems.slice(0, 5)).map((row) => (
              <div key={row} className="grid gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-xs tracking-[0.08em] uppercase">Row {sheetRow(row)}</p>
                  <Button variant="ghost" size="sm" onClick={() => props.onSkip(row)}>
                    <X /> Skip
                  </Button>
                </div>
                {errorsByRow.get(row)!.map((error) => {
                  const field = fields.find((f) => f.key === error.fieldKey);
                  if (!field) return null;
                  return (
                    <div key={error.fieldKey} className="grid gap-1">
                      <Label htmlFor={`fix-${row}-${field.key}`} className="text-xs">
                        {field.label}
                      </Label>
                      <Input
                        id={`fix-${row}-${field.key}`}
                        defaultValue={rows[row]?.[field.key] ?? ""}
                        aria-invalid
                        onBlur={(e) => props.onEdit(row, field.key, e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                      />
                      <p className="text-xs text-destructive">{error.message}</p>
                    </div>
                  );
                })}
              </div>
            ))}
            {!showAllProblems && problems.length > 5 && (
              <Button variant="ghost" onClick={() => setShowAllProblems(true)}>
                Show {problems.length - 5} more
              </Button>
            )}
          </section>
        )}

        <section className="grid gap-2">
          <h3 className="font-semibold">Ready to generate</h3>
          <div ref={listRef} className="h-72 overflow-y-auto rounded-lg border bg-card">
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((item) => {
                const row = included[item.index]!;
                return (
                  <button
                    key={row}
                    type="button"
                    onClick={() => setPreviewRow(row)}
                    className={cn(
                      "absolute inset-x-0 flex h-11 items-center gap-3 border-b px-3 text-left text-sm hover:bg-accent",
                      shownRow === row && "bg-brand-muted",
                    )}
                    style={{ transform: `translateY(${item.start}px)` }}
                  >
                    <span className="w-10 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{String(sheetRow(row)).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {fields.map((f) => rows[row]?.[f.key]).filter(Boolean).join(" · ") || "(defaults)"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="grid gap-2">
          <Label htmlFor="pattern" className="font-semibold">
            File names
          </Label>
          <Input id="pattern" value={pattern} onChange={(e) => props.onPattern(e.target.value)} className="font-mono" />
          <div className="flex flex-wrap gap-1.5">
            {[...fields.map((f) => ({ token: `{${f.key}}`, label: f.label })), { token: "{n}", label: "Row number" }].map((t) => (
              <button
                key={t.token}
                type="button"
                className="rounded-sm border border-foreground/15 bg-card px-2 py-1 font-mono text-xs hover:border-brand/50 hover:text-brand-ink"
                onClick={() => props.onPattern(`${pattern}${t.token}`)}
                title={`Insert ${t.label}`}
              >
                + {t.label}
              </button>
            ))}
          </div>
          {names.length > 0 && <p className="truncate font-mono text-xs text-muted-foreground">e.g. {names.join(", ")}</p>}
        </section>
      </div>

      <aside className="grid content-start gap-4 lg:sticky lg:top-6">
        {shownRow !== null && (
          <div>
            <PreviewCanvas
              imageUrl={template.previewUrl}
              width={template.width}
              height={template.height}
              fields={fields}
              values={resolveValues(fields, rows[shownRow]!)}
              className="mx-auto w-[min(100%,calc(40dvh*var(--ar)))] overflow-hidden rounded-lg border border-foreground/10 shadow-[0_18px_40px_-24px_oklch(0.4_0.08_45/0.45)]"
              style={props.style}
            />
            <p className="mt-2 text-center text-xs text-muted-foreground">Preview of row {sheetRow(shownRow)} — tap a row to check another</p>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          A ZIP of print-ready PNGs (or PDFs) downloads as soon as they&apos;re made (very large batches are split into parts),
          then this form clears for your next list.
        </p>
        {/* Sticky on phones so the main action is always in reach. */}
        <div className="pb-safe fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t bg-background/90 px-4 pt-3 backdrop-blur-md lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <Button variant="ghost" className="h-12 lg:h-11" onClick={props.onBack}>
            <ArrowLeft /> Back
          </Button>
          <Button size="lg" className="h-12 flex-1 text-base lg:h-11" disabled={included.length === 0} onClick={() => props.onStart("png")}>
            <FileArchive /> Download ZIP · {included.length} invite{included.length === 1 ? "" : "s"}
          </Button>
        </div>
        {/* Secondary format; in the page flow on phones, under the main action on desktop. */}
        <Button variant="outline" className="h-11" disabled={included.length === 0} onClick={() => props.onStart("pdf")}>
          <FileDown /> Download ZIP of PDFs
        </Button>
      </aside>
    </div>
  );
}

function PartsList({ parts, onSave }: { parts: PartView[]; onSave: (index: number) => void }) {
  if (parts.length === 0) return null;
  return (
    <ul className="grid gap-2 text-left">
      {parts.map((part) => (
        <li key={part.index} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
          <FileArchive className="size-4 shrink-0 text-brand-ink" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{part.name}</span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">{(part.size / 1024 / 1024).toFixed(1)} MB</span>
          {part.available ? (
            <Button size="sm" variant={part.saved ? "ghost" : "default"} onClick={() => onSave(part.index)}>
              <Download /> {part.saved ? "Again" : "Save"}
            </Button>
          ) : (
            <span className="shrink-0 text-xs text-muted-foreground">Downloaded</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function RunStep({
  run,
  onSavePart,
  onPause,
  onResume,
  onCancel,
}: {
  run: RunState;
  onSavePart: (index: number) => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}) {
  const unsaved = run.parts.filter((p) => !p.saved).length;
  const elapsed = (run.updatedAt - run.startedAt) / 1000;
  const rate = run.done > 0 ? elapsed / run.done : 0;
  const remaining = Math.max(0, Math.round(rate * (run.total - run.done)));
  return (
    <div className="mx-auto grid w-full max-w-lg gap-5 text-center">
      <div className="mx-auto grid size-40 place-items-center overflow-hidden rounded-lg border border-foreground/10 bg-checker">
        {run.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL
          <img src={run.thumbUrl} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        )}
      </div>
      <div>
        <p className="font-display text-3xl font-medium tabular-nums">
          {run.done} <span className="text-muted-foreground">/ {run.total}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          {run.paused ? "Paused" : run.done === 0 ? "Getting the design ready…" : `About ${remaining < 60 ? `${remaining}s` : `${Math.ceil(remaining / 60)} min`} left`}
          {run.failures.length > 0 && ` · ${run.failures.length} failed`}
        </p>
      </div>
      <Progress value={(run.done / run.total) * 100} />
      {unsaved > 0 && <p className="text-sm font-medium">Save each finished part to keep going.</p>}
      <PartsList parts={run.parts} onSave={onSavePart} />
      <p className="text-xs text-muted-foreground">Keep this tab open — invites are being made on this device.</p>
      <div className="flex justify-center gap-2">
        {run.paused ? (
          <Button variant="outline" onClick={onResume}>
            <Play /> Resume
          </Button>
        ) : (
          <Button variant="outline" onClick={onPause}>
            <Pause /> Pause
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel}>
          <X /> Cancel
        </Button>
      </div>
    </div>
  );
}

/** iOS only: the finished ZIP waits for a Save tap, then the form clears. */
function SaveStep({ run, onSavePart }: { run: RunState; onSavePart: (index: number) => void }) {
  const made = run.done - run.failures.length;
  return (
    <div className="mx-auto grid w-full max-w-lg gap-4 text-center">
      <CheckCircle2 className="mx-auto size-10 text-brand" />
      <h2 className="text-2xl font-medium">
        {made} invite{made === 1 ? "" : "s"} ready
      </h2>
      <p className="text-muted-foreground">Tap Save to download your ZIP — the form clears for your next list once it&apos;s saved.</p>
      <PartsList parts={run.parts} onSave={onSavePart} />
    </div>
  );
}

function ReportCard({ report, onDismiss }: { report: BatchReport; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-brand/30 bg-brand-muted/60 p-4 text-sm">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-ink" />
      <div className="grid flex-1 gap-2">
        <p>
          <span className="eyebrow mr-2 text-brand-ink">Last batch</span>
          <span className="font-semibold">
            {report.made} invite{report.made === 1 ? "" : "s"} downloaded
          </span>
          {report.zip && <span className="text-muted-foreground"> as {report.zip.name}</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          {report.zip && (
            <Button size="sm" variant="outline" onClick={() => downloadBlob(report.zip!.blob, report.zip!.name)}>
              <Download /> Download again
            </Button>
          )}
          {report.failedCsv && (
            <Button size="sm" variant="outline" onClick={() => downloadBlob(report.failedCsv!, "failed-rows.csv")}>
              <Download /> {report.failedCount} failed row{report.failedCount === 1 ? "" : "s"} (CSV)
            </Button>
          )}
          {report.skippedCsv && (
            <Button size="sm" variant="outline" onClick={() => downloadBlob(report.skippedCsv!, "skipped-rows.csv")}>
              <Download /> {report.skippedCount} skipped row{report.skippedCount === 1 ? "" : "s"} (CSV)
            </Button>
          )}
        </div>
      </div>
      <Button size="icon-sm" variant="ghost" onClick={onDismiss} aria-label="Dismiss">
        <X />
      </Button>
    </div>
  );
}
