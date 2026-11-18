"use client";

import type { FieldValues } from "@/lib/fields/schema";
import { decodeImage } from "./decode";
import { drawInvite } from "./draw";
import { encodeCanvas } from "./encode";
import { loadFonts } from "./fonts";
import type { OutputFormat, RenderJob, WorkerRequest, WorkerResponse } from "./protocol";

/** Renders full-resolution PNGs (or PDFs) for one template. Reuse it for many rows; dispose when done. */
export interface Renderer {
  render(values: FieldValues, format?: OutputFormat): Promise<Blob>;
  dispose(): void;
  /** "worker" keeps the page responsive; "main" is the fallback. */
  mode: "worker" | "main";
}

const INIT_TIMEOUT_MS = 30_000;

function createWorkerRenderer(job: RenderJob, source: Blob): Promise<Renderer> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    } catch (error) {
      reject(error);
      return;
    }
    let nextId = 1;
    const pending = new Map<number, { resolve: (b: Blob) => void; reject: (e: Error) => void }>();
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error("Worker init timed out"));
    }, INIT_TIMEOUT_MS);

    const renderer: Renderer = {
      mode: "worker",
      render(values, format = "png") {
        const id = nextId++;
        return new Promise((res, rej) => {
          pending.set(id, { resolve: res, reject: rej });
          worker.postMessage({ type: "render", id, values, format } satisfies WorkerRequest);
        });
      },
      dispose() {
        worker.postMessage({ type: "dispose" } satisfies WorkerRequest);
        setTimeout(() => worker.terminate(), 1000);
        for (const p of pending.values()) p.reject(new Error("Renderer disposed"));
        pending.clear();
      },
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === "ready") {
        clearTimeout(timeout);
        resolve(renderer);
      } else if (message.type === "result") {
        pending.get(message.id)?.resolve(message.blob);
        pending.delete(message.id);
      } else if (message.type === "error") {
        if (message.id === undefined) {
          clearTimeout(timeout);
          worker.terminate();
          reject(new Error(message.message));
        } else {
          pending.get(message.id)?.reject(new Error(message.message));
          pending.delete(message.id);
        }
      }
    };
    worker.onerror = (event) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(new Error(event.message || "Worker failed"));
    };
    worker.postMessage({ type: "init", job, source, origin: location.origin } satisfies WorkerRequest);
  });
}

async function createMainThreadRenderer(job: RenderJob, source: Blob): Promise<Renderer> {
  let background: ImageBitmap | null = await decodeImage(source);
  await loadFonts(job.fields.map((f) => f.style.fontFamily), document.fonts);
  let canvas: HTMLCanvasElement | null = document.createElement("canvas");
  canvas.width = Math.round(job.width * job.scale);
  canvas.height = Math.round(job.height * job.scale);
  return {
    mode: "main",
    async render(values, format = "png") {
      if (!canvas || !background) throw new Error("Renderer disposed");
      // Let the UI paint between rows of a bulk run.
      await new Promise((r) => setTimeout(r, 0));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2D canvas unavailable");
      drawInvite(ctx, { ...job, background, values });
      const target = canvas;
      return encodeCanvas(
        ctx,
        (type, quality) =>
          new Promise<Blob>((resolve, reject) =>
            target.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the invite"))), type, quality),
          ),
        job.dpi,
        format,
      );
    },
    dispose() {
      background?.close();
      background = null;
      if (canvas) canvas.width = canvas.height = 0;
      canvas = null;
    },
  };
}

export async function createRenderer(job: RenderJob, source: Blob): Promise<Renderer> {
  if (typeof OffscreenCanvas !== "undefined" && typeof Worker !== "undefined") {
    try {
      return await createWorkerRenderer(job, source);
    } catch (error) {
      console.info("[render] falling back to main thread:", error instanceof Error ? error.message : error);
    }
  }
  return createMainThreadRenderer(job, source);
}

/** Fetches a template original (signed URL) as a Blob, reporting download progress. */
export async function fetchSource(url: string, onProgress?: (fraction: number) => void): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Couldn't download the template (${res.status})`);
  const total = Number(res.headers.get("content-length") ?? 0);
  if (!onProgress || !total) return res.blob();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(Math.min(1, received / total));
  }
  return new Blob(chunks as BlobPart[], { type: res.headers.get("content-type") ?? "image/png" });
}
