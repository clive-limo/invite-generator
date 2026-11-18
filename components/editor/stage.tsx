"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { PreviewCanvas } from "@/components/invite/preview-canvas";
import type { Field, FieldBox } from "@/lib/fields/schema";
import { sampleValues } from "@/lib/fields/validate";
import type { FieldReport } from "@/lib/render/draw";
import { cn } from "@/lib/utils";
import { useEditor, useEditorStore } from "./store";

const SNAP_PX = 6;
const MIN_SIZE = 12;
const DRAG_START_PX = 3;

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: { id: Handle; sx: -1 | 0 | 1; sy: -1 | 0 | 1; className: string; cursor: string }[] = [
  { id: "nw", sx: -1, sy: -1, className: "left-0 top-0", cursor: "nwse-resize" },
  { id: "n", sx: 0, sy: -1, className: "left-1/2 top-0", cursor: "ns-resize" },
  { id: "ne", sx: 1, sy: -1, className: "left-full top-0", cursor: "nesw-resize" },
  { id: "e", sx: 1, sy: 0, className: "left-full top-1/2", cursor: "ew-resize" },
  { id: "se", sx: 1, sy: 1, className: "left-full top-full", cursor: "nwse-resize" },
  { id: "s", sx: 0, sy: 1, className: "left-1/2 top-full", cursor: "ns-resize" },
  { id: "sw", sx: -1, sy: 1, className: "left-0 top-full", cursor: "nesw-resize" },
  { id: "w", sx: -1, sy: 0, className: "left-0 top-1/2", cursor: "ew-resize" },
];

interface Guides {
  x: number[];
  y: number[];
}

type Gesture =
  | { kind: "move"; id: string; startX: number; startY: number; box: FieldBox; started: boolean }
  | { kind: "resize"; id: string; startX: number; startY: number; box: FieldBox; sx: number; sy: number; started: boolean }
  | { kind: "rotate"; id: string; cx: number; cy: number; started: boolean }
  | { kind: "draw"; startX: number; startY: number; x0: number; y0: number; started: boolean };

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Snaps the box's edges/centre to the template's and other fields' edges/centres. */
function snapMove(box: FieldBox, others: Field[], W: number, H: number, threshold: number) {
  const xs = [0, W / 2, W, ...others.flatMap((f) => [f.box.x, f.box.x + f.box.w / 2, f.box.x + f.box.w])];
  const ys = [0, H / 2, H, ...others.flatMap((f) => [f.box.y, f.box.y + f.box.h / 2, f.box.y + f.box.h])];
  const pick = (points: number[], edges: number[]) => {
    let best: { delta: number; line: number } | null = null;
    for (const edge of edges) {
      for (const p of points) {
        const delta = p - edge;
        if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, line: p };
      }
    }
    return best;
  };
  const sx = pick(xs, [box.x, box.x + box.w / 2, box.x + box.w]);
  const sy = pick(ys, [box.y, box.y + box.h / 2, box.y + box.h]);
  return {
    box: { ...box, x: box.x + (sx?.delta ?? 0), y: box.y + (sy?.delta ?? 0) },
    guides: { x: sx ? [sx.line] : [], y: sy ? [sy.line] : [] },
  };
}

/** Resizes in the box's own (rotated) frame, keeping the opposite edge fixed. */
function resizeBox(box: FieldBox, sx: number, sy: number, dx: number, dy: number): FieldBox {
  const t = rad(box.rotation);
  const lx = dx * Math.cos(t) + dy * Math.sin(t);
  const ly = -dx * Math.sin(t) + dy * Math.cos(t);
  const w = sx ? Math.max(MIN_SIZE, box.w + sx * lx) : box.w;
  const h = sy ? Math.max(MIN_SIZE, box.h + sy * ly) : box.h;
  const ox = (sx * (w - box.w)) / 2;
  const oy = (sy * (h - box.h)) / 2;
  const cx = box.x + box.w / 2 + ox * Math.cos(t) - oy * Math.sin(t);
  const cy = box.y + box.h / 2 + ox * Math.sin(t) + oy * Math.cos(t);
  return { ...box, x: cx - w / 2, y: cy - h / 2, w, h };
}

const round = (box: FieldBox): FieldBox => ({
  x: Math.round(box.x),
  y: Math.round(box.y),
  w: Math.round(box.w),
  h: Math.round(box.h),
  rotation: Math.round(box.rotation * 10) / 10,
});

interface StageProps {
  previewUrl: string;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  showBoxes: boolean;
  reports: Record<string, FieldReport>;
  onReports: (reports: Record<string, FieldReport>) => void;
}

export function Stage({ previewUrl, zoom, onZoomChange, showBoxes, reports, onReports }: StageProps) {
  const store = useEditorStore();
  const fields = useEditor((s) => s.fields);
  const selectedId = useEditor((s) => s.selectedId);
  const W = useEditor((s) => s.templateWidth);
  const H = useEditor((s) => s.templateHeight);
  const containerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [container, setContainer] = useState({ width: 0, height: 0 });
  const [guides, setGuides] = useState<Guides>({ x: [], y: [] });
  const [drawRect, setDrawRect] = useState<FieldBox | null>(null);
  const values = useMemo(() => sampleValues(fields), [fields]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setContainer({ width: entry!.contentRect.width, height: entry!.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const currentZoom = useEffectEvent(() => zoom);
  const applyZoom = useEffectEvent((z: number) => onZoomChange(z));

  // Pinch to zoom on touch screens.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let start: { distance: number; zoom: number } | null = null;
    const distance = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) start = { distance: distance(e.touches), zoom: currentZoom() };
    };
    const onMove = (e: TouchEvent) => {
      if (start && e.touches.length === 2) {
        e.preventDefault();
        applyZoom(Math.min(4, Math.max(0.5, (start.zoom * distance(e.touches)) / start.distance)));
      }
    };
    const onEnd = () => (start = null);
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, []);

  const padding = 32;
  const fitWidth = Math.max(0, Math.min(container.width - padding, ((container.height - padding) * W) / H));
  const displayWidth = fitWidth * zoom;
  const displayHeight = (displayWidth * H) / W;
  const scale = displayWidth / W || 1;

  const toTemplate = (clientX: number, clientY: number) => {
    const rect = surfaceRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  };

  function begin(e: ReactPointerEvent, g: Gesture) {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    gesture.current = g;
  }

  function onPointerMove(e: ReactPointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const state = store.getState();
    if (g.kind === "rotate") {
      const p = toTemplate(e.clientX, e.clientY);
      if (!g.started) {
        state.checkpoint();
        g.started = true;
      }
      let angle = (Math.atan2(p.y - g.cy, p.x - g.cx) * 180) / Math.PI + 90;
      if (angle > 180) angle -= 360;
      const step = e.shiftKey ? 15 : 0;
      if (step) angle = Math.round(angle / step) * step;
      else if (Math.abs(angle % 90) < 3 || Math.abs(angle % 90) > 87) angle = Math.round(angle / 90) * 90;
      state.patchField(g.id, (f) => ({ ...f, box: { ...f.box, rotation: Math.round(angle * 10) / 10 } }));
      return;
    }
    const dxScreen = e.clientX - g.startX;
    const dyScreen = e.clientY - g.startY;
    if (!g.started) {
      if (Math.hypot(dxScreen, dyScreen) < DRAG_START_PX) return;
      g.started = true;
      if (g.kind !== "draw") state.checkpoint();
    }
    const dx = dxScreen / scale;
    const dy = dyScreen / scale;
    if (g.kind === "move") {
      const moved = { ...g.box, x: g.box.x + dx, y: g.box.y + dy };
      const snapped = e.altKey ? { box: moved, guides: { x: [], y: [] } } : snapMove(moved, state.fields.filter((f) => f.id !== g.id), W, H, SNAP_PX / scale);
      setGuides(snapped.guides);
      state.patchField(g.id, (f) => ({ ...f, box: round(snapped.box) }));
    } else if (g.kind === "resize") {
      state.patchField(g.id, (f) => ({ ...f, box: round(resizeBox(g.box, g.sx, g.sy, dx, dy)) }));
    } else if (g.kind === "draw") {
      const x = Math.min(g.x0, g.x0 + dx);
      const y = Math.min(g.y0, g.y0 + dy);
      setDrawRect({ x, y, w: Math.abs(dx), h: Math.abs(dy), rotation: 0 });
    }
  }

  function onPointerUp() {
    const g = gesture.current;
    gesture.current = null;
    setGuides({ x: [], y: [] });
    if (g?.kind === "draw") {
      if (g.started && drawRect && drawRect.w * scale > 16 && drawRect.h * scale > 12) {
        store.getState().addField(round(drawRect));
      } else if (!g.started) {
        store.getState().select(null);
      }
      setDrawRect(null);
    }
  }

  return (
    <div ref={containerRef} className="relative flex-1 overflow-auto overscroll-contain bg-surface">
      <div className="grid min-h-full min-w-full place-items-center p-4" style={{ width: displayWidth + padding, height: displayHeight + padding }}>
        <div
          ref={surfaceRef}
          className="relative shadow-[0_24px_60px_-28px_oklch(0.35_0.06_45/0.45)] ring-1 ring-foreground/10 select-none"
          style={{ width: displayWidth, height: displayHeight }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {displayWidth > 0 && (
            <PreviewCanvas
              imageUrl={previewUrl}
              width={W}
              height={H}
              fields={fields}
              values={values}
              className="absolute inset-0"
              maxPixelRatio={2.5}
              onReport={(list) => {
                const next: Record<string, FieldReport> = {};
                for (const r of list) next[r.fieldId] = r;
                onReports(next);
              }}
            />
          )}
          {/* Background: tap to deselect; drag with a mouse to draw a new field. */}
          <div
            className="absolute inset-0"
            style={{ cursor: "crosshair" }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              const p = toTemplate(e.clientX, e.clientY);
              if (e.pointerType === "touch") {
                store.getState().select(null);
                return;
              }
              begin(e, { kind: "draw", startX: e.clientX, startY: e.clientY, x0: p.x, y0: p.y, started: false });
            }}
          />
          {fields.map((field) => (
            <FieldBoxView
              key={field.id}
              field={field}
              W={W}
              H={H}
              selected={field.id === selectedId}
              visible={showBoxes || field.id === selectedId}
              truncated={Boolean(reports[field.id]?.layout?.truncated)}
              onMoveStart={(e) => {
                if (e.button !== 0) return;
                store.getState().select(field.id);
                begin(e, { kind: "move", id: field.id, startX: e.clientX, startY: e.clientY, box: { ...field.box }, started: false });
              }}
              onResizeStart={(e, sx, sy) =>
                begin(e, { kind: "resize", id: field.id, startX: e.clientX, startY: e.clientY, box: { ...field.box }, sx, sy, started: false })
              }
              onRotateStart={(e) =>
                begin(e, { kind: "rotate", id: field.id, cx: field.box.x + field.box.w / 2, cy: field.box.y + field.box.h / 2, started: false })
              }
            />
          ))}
          {guides.x.map((x) => (
            <div key={`gx${x}`} className="pointer-events-none absolute inset-y-0 w-px bg-pink-500" style={{ left: `${(x / W) * 100}%` }} />
          ))}
          {guides.y.map((y) => (
            <div key={`gy${y}`} className="pointer-events-none absolute inset-x-0 h-px bg-pink-500" style={{ top: `${(y / H) * 100}%` }} />
          ))}
          {drawRect && (
            <div
              className="pointer-events-none absolute border-2 border-dashed border-brand bg-brand/10"
              style={{
                left: `${(drawRect.x / W) * 100}%`,
                top: `${(drawRect.y / H) * 100}%`,
                width: `${(drawRect.w / W) * 100}%`,
                height: `${(drawRect.h / H) * 100}%`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface FieldBoxViewProps {
  field: Field;
  W: number;
  H: number;
  selected: boolean;
  visible: boolean;
  truncated: boolean;
  onMoveStart: (e: ReactPointerEvent) => void;
  onResizeStart: (e: ReactPointerEvent, sx: number, sy: number) => void;
  onRotateStart: (e: ReactPointerEvent) => void;
}

function FieldBoxView({ field, W, H, selected, visible, truncated, onMoveStart, onResizeStart, onRotateStart }: FieldBoxViewProps) {
  const { box } = field;
  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label={`Field: ${field.label}`}
      data-field-id={field.id}
      className={cn(
        "absolute touch-none outline-offset-0",
        visible && "outline-1 outline-dashed",
        visible && (truncated ? "outline-destructive" : "outline-brand/80"),
        selected && "z-10 outline-2 outline-solid",
        selected && !truncated && "outline-brand",
      )}
      style={{
        left: `${(box.x / W) * 100}%`,
        top: `${(box.y / H) * 100}%`,
        width: `${(box.w / W) * 100}%`,
        height: `${(box.h / H) * 100}%`,
        transform: box.rotation ? `rotate(${box.rotation}deg)` : undefined,
        cursor: "move",
      }}
      onPointerDown={onMoveStart}
    >
      {visible && (
        <span
          className={cn(
            "pointer-events-none absolute -top-6 left-0 flex max-w-[200%] items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] leading-none font-medium whitespace-nowrap shadow",
            truncated ? "bg-destructive text-primary-foreground" : selected ? "bg-brand text-brand-foreground" : "bg-background/90 text-foreground",
          )}
        >
          {truncated && <TriangleAlert className="size-3" />}
          {field.label}
        </span>
      )}
      {selected && (
        <>
          {HANDLES.map((h) => (
            <span
              key={h.id}
              className={cn("absolute z-10 grid size-7 -translate-x-1/2 -translate-y-1/2 touch-none place-items-center", h.className)}
              style={{ cursor: h.cursor }}
              onPointerDown={(e) => onResizeStart(e, h.sx, h.sy)}
            >
              <span className="size-3 rounded-sm border-2 border-brand bg-background shadow" />
            </span>
          ))}
          <span
            className="absolute -top-14 left-1/2 z-10 grid size-8 -translate-x-1/2 touch-none place-items-center"
            style={{ cursor: "grab" }}
            onPointerDown={onRotateStart}
            aria-label="Rotate"
          >
            <span className="grid size-6 place-items-center rounded-full border-2 border-brand bg-background text-brand shadow">
              <RotateCw className="size-3" />
            </span>
          </span>
        </>
      )}
    </div>
  );
}
