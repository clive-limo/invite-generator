"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Field, FieldValues } from "@/lib/fields/schema";
import { drawInvite, type FieldReport } from "@/lib/render/draw";
import { loadFonts } from "@/lib/render/fonts";
import { cn } from "@/lib/utils";

/** Loads an image for canvas use (CORS-enabled so the canvas stays readable). */
export function usePreviewImage(url: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => !cancelled && setImage(img);
    img.onerror = () => !cancelled && setError(true);
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return { image, error };
}

/** Loads the fonts the fields use; returns a counter that bumps whenever new faces are ready. */
export function useFieldFonts(fields: Field[]) {
  const families = useMemo(() => [...new Set(fields.map((f) => f.style.fontFamily))].sort().join("|"), [fields]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadFonts(families.split("|").filter(Boolean), document.fonts)
      .catch(() => undefined)
      .finally(() => !cancelled && setVersion((v) => v + 1));
    return () => {
      cancelled = true;
    };
  }, [families]);
  return version;
}

interface Props {
  imageUrl: string;
  width: number;
  height: number;
  fields: Field[];
  values: FieldValues;
  className?: string;
  style?: CSSProperties;
  /** Called after each draw with per-field layout results (shrunk / truncated). */
  onReport?: (reports: FieldReport[]) => void;
  /** Cap on canvas resolution relative to its CSS size. */
  maxPixelRatio?: number;
}

/**
 * Live preview: the same drawInvite as the full-resolution export, drawn at the
 * element's on-screen size (× devicePixelRatio) over the ≤1600px preview image.
 */
export function PreviewCanvas({ imageUrl, width, height, fields, values, className, style, onReport, maxPixelRatio = 2 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cssWidth, setCssWidth] = useState(0);
  const { image, error } = usePreviewImage(imageUrl);
  const fontsVersion = useFieldFonts(fields);
  const report = useEffectEvent((reports: FieldReport[]) => onReport?.(reports));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => setCssWidth(entry!.contentRect.width));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cssWidth) return;
    const frame = requestAnimationFrame(() => {
      const ratio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
      // Never draw larger than the template itself.
      const pixelWidth = Math.min(Math.round(cssWidth * ratio), width);
      const pixelHeight = Math.round((pixelWidth * height) / width);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const reports = drawInvite(ctx, { width, height, background: image, fields, values, scale: pixelWidth / width });
      report(reports);
    });
    return () => cancelAnimationFrame(frame);
  }, [cssWidth, image, fields, values, width, height, fontsVersion, maxPixelRatio]);

  return (
    <div className={cn("relative bg-checker", className)} style={{ aspectRatio: `${width} / ${height}`, ...style }}>
      <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden />
      {!image && !error && <div className="absolute inset-0 animate-pulse bg-muted/60" />}
      {error && (
        <div className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-muted-foreground">
          Couldn&apos;t load the preview image.
        </div>
      )}
    </div>
  );
}
