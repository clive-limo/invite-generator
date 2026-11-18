"use client";

import { AlertTriangle, ImageUp, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { finalizeUploadAction } from "@/app/(app)/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { formatBytes, megapixels, printSize } from "@/lib/format";
import { IngestError, prepareTemplate, putWithProgress, type PreparedTemplate } from "@/lib/upload/ingest-client";
import { UPLOAD_LIMITS } from "@/lib/upload/limits";
import { cn } from "@/lib/utils";

type Stage = { kind: "idle" } | { kind: "reading" } | { kind: "ready" } | { kind: "uploading"; progress: number } | { kind: "saving" };

export function TemplateUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [prepared, setPrepared] = useState<PreparedTemplate | null>(null);
  const [name, setName] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => () => {
    if (prepared) URL.revokeObjectURL(prepared.previewUrl);
  }, [prepared]);

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    setStage({ kind: "reading" });
    try {
      const result = await prepareTemplate(file);
      setPrepared(result);
      setName(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().slice(0, 80) || "Untitled invite");
      setStage({ kind: "ready" });
    } catch (e) {
      setError(e instanceof IngestError ? e.message : "Couldn't read that image");
      setStage({ kind: "idle" });
    }
  }

  async function upload() {
    if (!prepared) return;
    setError(null);
    setStage({ kind: "uploading", progress: 0 });
    try {
      const res = await fetch("/api/uploads/template", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          originalType: prepared.file.type,
          originalBytes: prepared.file.size,
          previewType: prepared.preview.type,
          thumbType: prepared.thumb.type,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      const { uploadId, urls } = body as { uploadId: string; urls: Record<"original" | "preview" | "thumb", string> };

      const total = prepared.file.size + prepared.preview.blob.size + prepared.thumb.blob.size;
      const done = { original: 0, preview: 0, thumb: 0 };
      const report = (part: keyof typeof done, size: number) => (fraction: number) => {
        done[part] = fraction * size;
        setStage({ kind: "uploading", progress: (done.original + done.preview + done.thumb) / total });
      };
      await Promise.all([
        putWithProgress(urls.original, prepared.file, prepared.file.type, report("original", prepared.file.size)),
        putWithProgress(urls.preview, prepared.preview.blob, prepared.preview.type, report("preview", prepared.preview.blob.size)),
        putWithProgress(urls.thumb, prepared.thumb.blob, prepared.thumb.type, report("thumb", prepared.thumb.blob.size)),
      ]);

      setStage({ kind: "saving" });
      const result = await finalizeUploadAction({
        uploadId,
        name: name.trim() || "Untitled invite",
        previewWidth: prepared.preview.width,
        previewHeight: prepared.preview.height,
      });
      if (!result.ok) throw new Error(result.error);
      router.push(`/templates/${result.data.id}/edit`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setStage({ kind: "ready" });
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void choose(event.dataTransfer.files[0]);
  }

  const busy = stage.kind === "uploading" || stage.kind === "saving";
  const small = prepared && Math.max(prepared.width, prepared.height) < UPLOAD_LIMITS.recommendedMinSide;

  return (
    <div className="grid gap-5">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!prepared ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          disabled={stage.kind === "reading"}
          className={cn(
            "flex min-h-72 flex-col items-center justify-center gap-3 rounded-lg border-[1.5px] border-dashed border-foreground/20 bg-card/60 p-8 text-center transition",
            dragging ? "border-brand bg-brand-muted" : "hover:border-brand/60 hover:bg-card",
          )}
        >
          {stage.kind === "reading" ? (
            <Loader2 className="size-10 animate-spin text-muted-foreground" />
          ) : (
            <span className="grid size-14 place-items-center rounded-full border border-foreground/15 bg-background text-brand-ink">
              <ImageUp className="size-6" />
            </span>
          )}
          <span className="font-display text-xl font-medium">{stage.kind === "reading" ? "Reading image…" : "Choose your design"}</span>
          <span className="max-w-sm font-mono text-xs leading-relaxed text-muted-foreground">
            PNG, JPG or WebP up to 25 MB. For print quality use at least {UPLOAD_LIMITS.recommendedMinSide}px on the long
            side (A5 at 300 DPI is 1748 × 2480).
          </span>
        </button>
      ) : (
        <div className="grid gap-5 rounded-lg border bg-card p-4 sm:grid-cols-[minmax(0,240px)_1fr] sm:p-5">
          <div className="relative overflow-hidden rounded-md border bg-checker">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
            <img src={prepared.previewUrl} alt="Template preview" className="mx-auto max-h-80 w-auto object-contain" />
            {!busy && (
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-2 right-2 rounded-full shadow"
                aria-label="Choose a different image"
                onClick={() => {
                  setPrepared(null);
                  setStage({ kind: "idle" });
                }}
              >
                <X />
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="template-name">Template name</Label>
              <Input id="template-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} disabled={busy} />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-md border bg-background/60 p-3 text-sm">
              <dt className="eyebrow self-center text-[0.6875rem]">Size</dt>
              <dd>
                {prepared.width} × {prepared.height}px ({megapixels(prepared.width, prepared.height)})
              </dd>
              <dt className="eyebrow self-center text-[0.6875rem]">Prints at</dt>
              <dd>{printSize(prepared.width, prepared.height)}</dd>
              <dt className="eyebrow self-center text-[0.6875rem]">File</dt>
              <dd>{formatBytes(prepared.file.size)}</dd>
            </dl>
            {small && (
              <Alert>
                <AlertTriangle />
                <AlertDescription>
                  This image is fairly small, so printed invites may look soft. You can still use it — or upload a larger
                  export. Text is always drawn sharply, and you can export at 2× later.
                </AlertDescription>
              </Alert>
            )}
            <div className="mt-auto grid gap-2">
              {stage.kind === "uploading" && <Progress value={stage.progress * 100} />}
              <Button size="lg" className="h-11 w-full sm:w-auto sm:self-end" onClick={upload} disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                {stage.kind === "uploading"
                  ? `Uploading ${Math.round(stage.progress * 100)}%`
                  : stage.kind === "saving"
                    ? "Saving…"
                    : "Continue to fields"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_LIMITS.acceptedTypes.join(",")}
        className="hidden"
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
