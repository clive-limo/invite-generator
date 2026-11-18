"use client";

import {
  Check,
  CloudOff,
  Download,
  Eye,
  EyeOff,
  Layers,
  Loader2,
  Maximize,
  Minus,
  Plus,
  Redo2,
  SlidersHorizontal,
  Undo2,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { publishAction, saveDraftAction } from "@/app/(app)/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { downloadBlob, stableStringify } from "@/lib/download";
import { sanitizeFilename } from "@/lib/fields/filename";
import type { Field } from "@/lib/fields/schema";
import { resolveValues, sampleValues } from "@/lib/fields/validate";
import { createRenderer, fetchSource } from "@/lib/render/client";
import type { FieldReport } from "@/lib/render/draw";
import { FieldPanel } from "./field-panel";
import { FieldsList, TemplateSettings } from "./fields-list";
import { Stage } from "./stage";
import { createEditorStore, EditorContext, useEditor, useEditorStore, useSelectedField } from "./store";

export interface EditorTemplate {
  id: string;
  name: string;
  width: number;
  height: number;
  previewUrl: string;
  exportScale: number;
  canExport2x: boolean;
  hasLinks: boolean;
}

interface EditorProps {
  template: EditorTemplate;
  initialFields: Field[];
  publishedVersion: number | null;
  publishedFields: Field[] | null;
}

export function Editor(props: EditorProps) {
  const [store] = useState(() =>
    createEditorStore({ width: props.template.width, height: props.template.height, fields: props.initialFields }),
  );
  return (
    <EditorContext.Provider value={store}>
      <EditorShell {...props} />
    </EditorContext.Provider>
  );
}

type SaveStatus = "saved" | "pending" | "saving" | "error";

function useAutosave(templateId: string) {
  const store = useEditorStore();
  const revision = useEditor((s) => s.revision);
  const savedRevision = useRef(0);
  const [status, setStatus] = useState<SaveStatus>("saved");

  useEffect(() => {
    if (revision === savedRevision.current) return;
    setStatus("pending");
    const timer = setTimeout(async () => {
      const { fields, revision: sending } = store.getState();
      setStatus("saving");
      const result = await saveDraftAction(templateId, fields);
      if (result.ok) {
        savedRevision.current = sending;
        setStatus(store.getState().revision === sending ? "saved" : "pending");
      } else {
        setStatus("error");
        toast.error(result.error);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [revision, store, templateId]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (store.getState().revision !== savedRevision.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [store]);

  return status;
}

function useShortcuts() {
  const store = useEditorStore();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (target?.closest("[role=dialog],[role=listbox],[role=menu]")) return;
      const s = store.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
        return;
      }
      if (!s.selectedId) return;
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        s.duplicateField(s.selectedId);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        s.removeField(s.selectedId);
      } else if (e.key === "Escape") {
        s.select(null);
      } else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        s.updateField(s.selectedId, (f) => ({ ...f, box: { ...f.box, x: f.box.x + dx, y: f.box.y + dy } }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "error") {
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <CloudOff className="size-3.5" /> Not saved
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
      {status === "saved" ? <Check className="size-3.5" /> : <Loader2 className="size-3.5 animate-spin" />}
      {status === "saved" ? "Saved" : "Saving…"}
    </span>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} onClick={onClick} disabled={disabled}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function EditorShell({ template, publishedVersion: initialVersion, publishedFields }: EditorProps) {
  const router = useRouter();
  const store = useEditorStore();
  const fields = useEditor((s) => s.fields);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const selected = useSelectedField();
  const status = useAutosave(template.id);
  useShortcuts();

  const [zoom, setZoom] = useState(1);
  const [showBoxes, setShowBoxes] = useState(true);
  const [reports, setReports] = useState<Record<string, FieldReport>>({});
  const [publishing, setPublishing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [published, setPublished] = useState(() => ({
    version: initialVersion,
    json: publishedFields ? stableStringify(publishedFields) : null,
  }));
  const [fieldsSheet, setFieldsSheet] = useState(false);
  const [styleDrawer, setStyleDrawer] = useState(false);

  const truncatedIds = useMemo(
    () => new Set(Object.values(reports).filter((r) => r.layout?.truncated).map((r) => r.fieldId)),
    [reports],
  );
  const dirtyVsPublished = published.json !== stableStringify(fields);

  function onReports(next: Record<string, FieldReport>) {
    setReports((prev) => {
      const same =
        Object.keys(prev).length === Object.keys(next).length &&
        Object.entries(next).every(([id, r]) => prev[id]?.layout?.truncated === r.layout?.truncated);
      return same ? prev : next;
    });
  }

  async function publish() {
    setPublishing(true);
    const current = store.getState().fields;
    const result = await publishAction(template.id, current);
    setPublishing(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setPublished({ version: result.data.version, json: stableStringify(current) });
    toast.success(`Published version ${result.data.version}`, {
      description: template.hasLinks ? "Your share links now use this version." : "Next, create a link to share it.",
      action: template.hasLinks
        ? undefined
        : { label: "Create link", onClick: () => router.push(`/templates/${template.id}/links`) },
    });
  }

  async function testDownload() {
    setTesting(true);
    const toastId = toast.loading("Rendering full-size sample…");
    try {
      const res = await fetch(`/api/templates/${template.id}/source`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't load the template");
      const source = await fetchSource(body.sourceUrl);
      const current = store.getState().fields;
      const renderer = await createRenderer(
        { width: template.width, height: template.height, fields: current, scale: template.exportScale, dpi: 300 },
        source,
      );
      try {
        // The same PNG guests get, so the owner checks exactly what will be printed.
        const blob = await renderer.render(resolveValues(current, sampleValues(current)));
        downloadBlob(blob, `${sanitizeFilename(template.name) || "invite"}-sample.png`);
        toast.success("Sample downloaded", { id: toastId });
      } finally {
        renderer.dispose();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Render failed", { id: toastId });
    } finally {
      setTesting(false);
    }
  }

  const zoomBy = (factor: number) => setZoom((z) => Math.min(4, Math.max(0.5, Math.round(z * factor * 100) / 100)));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b bg-card px-2 py-1.5 sm:px-4">
        <Button variant="outline" size="sm" className="hidden lg:inline-flex" onClick={() => store.getState().addField()}>
          <Plus /> Text field
        </Button>
        <div className="flex items-center">
          <IconButton label="Undo" onClick={() => store.getState().undo()} disabled={!canUndo}>
            <Undo2 />
          </IconButton>
          <IconButton label="Redo" onClick={() => store.getState().redo()} disabled={!canRedo}>
            <Redo2 />
          </IconButton>
        </div>
        <div className="hidden items-center sm:flex">
          <IconButton label="Zoom out" onClick={() => zoomBy(1 / 1.25)}>
            <Minus />
          </IconButton>
          <button type="button" className="w-12 text-center font-mono text-xs tabular-nums text-muted-foreground" onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <IconButton label="Zoom in" onClick={() => zoomBy(1.25)}>
            <Plus />
          </IconButton>
          <IconButton label="Fit to screen" onClick={() => setZoom(1)}>
            <Maximize />
          </IconButton>
        </div>
        <IconButton label={showBoxes ? "Hide field outlines" : "Show field outlines"} onClick={() => setShowBoxes((v) => !v)}>
          {showBoxes ? <Eye /> : <EyeOff />}
        </IconButton>
        <div className="ml-auto flex items-center gap-2">
          <SaveIndicator status={status} />
          {published.version !== null && (
            <Badge variant={dirtyVsPublished ? "outline" : "success"} className="hidden md:inline-flex">
              {dirtyVsPublished ? "Unpublished changes" : `Live · v${published.version}`}
            </Badge>
          )}
          <Button variant="outline" size="sm" className="hidden md:inline-flex" onClick={testDownload} disabled={testing || fields.length === 0}>
            {testing ? <Loader2 className="animate-spin" /> : <Download />} Test download
          </Button>
          <Button size="sm" onClick={publish} disabled={publishing || fields.length === 0 || (!dirtyVsPublished && published.version !== null)}>
            {publishing ? <Loader2 className="animate-spin" /> : <UploadCloud />}
            {published.version === null ? "Publish" : "Publish changes"}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Desktop: fields list */}
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r bg-card p-4 lg:block">
          <FieldsList truncatedIds={truncatedIds} />
          <div className="mt-6">
            <TemplateSettings
              templateId={template.id}
              name={template.name}
              width={template.width}
              height={template.height}
              exportScale={template.exportScale}
              canExport2x={template.canExport2x}
            />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {fields.length === 0 && (
            <div className="border-b border-brand/20 bg-brand-muted px-4 py-2 text-sm text-foreground">
              <span className="hidden lg:inline">Drag on the design to draw a text box, or use “Text field”.</span>
              <span className="lg:hidden">Tap “Add” below to place your first text field.</span>
            </div>
          )}
          <Stage previewUrl={template.previewUrl} zoom={zoom} onZoomChange={setZoom} showBoxes={showBoxes} reports={reports} onReports={onReports} />
        </div>

        {/* Desktop: properties */}
        <aside className="hidden w-80 shrink-0 overflow-y-auto border-l bg-card p-4 lg:block">
          {selected ? (
            <FieldPanel key={selected.id} field={selected} truncated={truncatedIds.has(selected.id)} />
          ) : (
            <div className="grid gap-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Nothing selected</p>
              <p>Click a field on the design to edit its text, font and position.</p>
              <ul className="grid gap-1.5 font-mono text-[0.6875rem] leading-relaxed">
                <li>Drag to move · handles resize · top handle rotates</li>
                <li>Arrow keys nudge (Shift = 10px) · Alt while dragging disables snapping</li>
                <li>⌘/Ctrl + Z undo · ⌘/Ctrl + D duplicate · Delete removes</li>
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* Mobile bottom bar */}
      <div className="pb-safe flex items-center justify-around gap-1 border-t bg-card px-2 pt-2 lg:hidden">
        <MobileAction label="Add" onClick={() => store.getState().addField()}>
          <Plus />
        </MobileAction>
        <MobileAction label="Fields" onClick={() => setFieldsSheet(true)}>
          <Layers />
        </MobileAction>
        <MobileAction label="Style" onClick={() => setStyleDrawer(true)} disabled={!selected}>
          <SlidersHorizontal />
        </MobileAction>
        <MobileAction label="Test" onClick={testDownload} disabled={testing || fields.length === 0}>
          {testing ? <Loader2 className="animate-spin" /> : <Download />}
        </MobileAction>
      </div>

      <Sheet open={fieldsSheet} onOpenChange={setFieldsSheet}>
        <SheetContent side="left" className="w-[85vw] max-w-sm overflow-y-auto p-4">
          <SheetHeader className="p-0">
            <SheetTitle>Fields</SheetTitle>
          </SheetHeader>
          <FieldsList
            truncatedIds={truncatedIds}
            onPick={() => {
              setFieldsSheet(false);
              setStyleDrawer(true);
            }}
          />
          <TemplateSettings
            templateId={template.id}
            name={template.name}
            width={template.width}
            height={template.height}
            exportScale={template.exportScale}
            canExport2x={template.canExport2x}
          />
          <Link href={`/templates/${template.id}/links`} className="text-sm text-muted-foreground underline underline-offset-4">
            Share links →
          </Link>
        </SheetContent>
      </Sheet>

      <Drawer open={styleDrawer && Boolean(selected)} onOpenChange={setStyleDrawer}>
        <DrawerContent className="max-h-[80dvh]">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Edit field</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-8">
            {selected && <FieldPanel key={selected.id} field={selected} truncated={truncatedIds.has(selected.id)} />}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function MobileAction({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-12 min-w-16 flex-col items-center justify-center gap-0.5 rounded-md text-xs font-medium text-muted-foreground active:bg-accent disabled:opacity-40 [&_svg]:size-5 [&_svg]:text-foreground"
    >
      {children}
      {label}
    </button>
  );
}
