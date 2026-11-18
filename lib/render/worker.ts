/// <reference lib="webworker" />
import { decodeImage } from "./decode";
import { drawInvite } from "./draw";
import { encodeCanvas } from "./encode";
import { loadFonts } from "./fonts";
import type { RenderJob, WorkerRequest, WorkerResponse } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

let job: RenderJob | null = null;
let background: ImageBitmap | null = null;
let canvas: OffscreenCanvas | null = null;

const post = (message: WorkerResponse) => self.postMessage(message);

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      // Some browsers have OffscreenCanvas but no FontFaceSet in workers; the
      // caller falls back to rendering on the main thread.
      if (!self.fonts) throw new Error("worker-fonts-unsupported");
      job = message.job;
      background?.close();
      background = await decodeImage(message.source);
      canvas = new OffscreenCanvas(Math.round(job.width * job.scale), Math.round(job.height * job.scale));
      await loadFonts(
        job.fields.map((f) => f.style.fontFamily),
        self.fonts as FontFaceSet & { add(face: FontFace): unknown },
        message.origin,
      );
      post({ type: "ready" });
    } else if (message.type === "render") {
      if (!job || !canvas || !background) throw new Error("Renderer not initialised");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2D canvas unavailable");
      drawInvite(ctx, { ...job, background, values: message.values });
      const target = canvas;
      const blob = await encodeCanvas(ctx, (type, quality) => target.convertToBlob({ type, quality }), job.dpi, message.format);
      post({ type: "result", id: message.id, blob });
    } else if (message.type === "dispose") {
      background?.close();
      background = null;
      canvas = null;
      job = null;
      self.close();
    }
  } catch (error) {
    post({
      type: "error",
      id: message.type === "render" ? message.id : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
