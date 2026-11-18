"use client";

import { imageSize } from "image-size";
import { decodeImage } from "@/lib/render/decode";
import { UPLOAD_LIMITS } from "./limits";

export interface PreparedTemplate {
  /** What gets uploaded as the original: the chosen file, or a PNG if it needed rotating. */
  file: File;
  width: number;
  height: number;
  preview: { blob: Blob; type: "image/webp" | "image/jpeg"; width: number; height: number };
  thumb: { blob: Blob; type: "image/webp" | "image/jpeg" };
  /** Object URL of the preview, for showing it before upload. Revoke when done. */
  previewUrl: string;
}

export class IngestError extends Error {}

function fit(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function encode(canvas: HTMLCanvasElement, quality: number) {
  // Safari can't encode WebP and silently returns PNG; detect that and use JPEG.
  const webp = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", quality));
  if (webp && webp.type === "image/webp") return { blob: webp, type: "image/webp" as const };
  const jpeg = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
  if (!jpeg) throw new IngestError("Your browser couldn't process this image");
  return { blob: jpeg, type: "image/jpeg" as const };
}

function downscale(bitmap: ImageBitmap, maxSide: number) {
  const size = fit(bitmap.width, bitmap.height, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  // White matte so a JPEG fallback doesn't turn transparency black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  return { canvas, ...size };
}

/** Validates a chosen file and builds its preview + thumbnail, all in the browser. */
export async function prepareTemplate(file: File): Promise<PreparedTemplate> {
  if (!(UPLOAD_LIMITS.acceptedTypes as readonly string[]).includes(file.type)) {
    throw new IngestError("Please choose a PNG, JPG or WebP image");
  }
  if (file.size > UPLOAD_LIMITS.maxBytes) throw new IngestError("That image is over 25 MB — please export a smaller file");

  let bitmap: ImageBitmap;
  try {
    bitmap = await decodeImage(file);
  } catch {
    throw new IngestError("That file couldn't be opened as an image");
  }
  try {
    const { width, height } = bitmap;
    if (width * height > UPLOAD_LIMITS.maxPixels) {
      throw new IngestError(
        `That image is ${((width * height) / 1e6).toFixed(1)} megapixels. Please resize it to 16 MP or less (e.g. 4000 × 4000) so it renders on phones.`,
      );
    }
    const original = (await exifOrientation(file)) > 1 ? await rotatedPng(bitmap, file.name) : file;
    if (original.size > UPLOAD_LIMITS.maxBytes) throw new IngestError("That image is over 25 MB — please export a smaller file");
    const previewCanvas = downscale(bitmap, UPLOAD_LIMITS.previewMaxSide);
    const preview = await encode(previewCanvas.canvas, 0.88);
    const thumbCanvas = downscale(bitmap, UPLOAD_LIMITS.thumbMaxSide);
    const thumb = await encode(thumbCanvas.canvas, 0.8);
    return {
      file: original,
      width,
      height,
      preview: { ...preview, width: previewCanvas.width, height: previewCanvas.height },
      thumb,
      previewUrl: URL.createObjectURL(preview.blob),
    };
  } finally {
    bitmap.close();
  }
}

/** EXIF orientation of a JPEG (1 = upright), read from its first bytes. */
async function exifOrientation(file: File): Promise<number> {
  if (file.type !== "image/jpeg") return 1;
  try {
    return imageSize(new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer())).orientation ?? 1;
  } catch {
    return 1;
  }
}

/**
 * Bakes EXIF rotation into the pixels (lossless PNG), so every browser that later
 * renders this template sees it the same way up.
 */
async function rotatedPng(bitmap: ImageBitmap, name: string): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  canvas.width = canvas.height = 0;
  if (!blob) throw new IngestError("Your browser couldn't process this image");
  return new File([blob], name.replace(/\.[^.]+$/, "") + ".png", { type: "image/png" });
}

/** PUT with upload progress (fetch can't report it). */
export function putWithProgress(url: string, body: Blob, contentType: string, onProgress?: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed — check your connection"));
    xhr.send(body);
  });
}
