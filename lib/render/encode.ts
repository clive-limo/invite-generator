import type { Ctx2D } from "./draw";
import { jpegToPdf } from "./pdf";
import { setPngDpi } from "./png-dpi";
import type { OutputFormat } from "./protocol";

/** JPEG quality inside PDFs: visually lossless at print size, a fraction of the PNG's weight. */
const PDF_JPEG_QUALITY = 0.95;

type ToBlob = (type: string, quality?: number) => Promise<Blob>;

/** Encodes a finished canvas. Shared by the worker and the main-thread fallback. */
export async function encodeCanvas(ctx: Ctx2D, toBlob: ToBlob, dpi: number, format: OutputFormat): Promise<Blob> {
  const { width, height } = ctx.canvas;
  if (format === "png") {
    const png = await toBlob("image/png");
    return new Blob([setPngDpi(new Uint8Array(await png.arrayBuffer()), dpi) as BlobPart], { type: "image/png" });
  }
  // JPEG has no alpha (transparent pixels would turn black), so paper goes underneath.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
  const jpeg = await toBlob("image/jpeg", PDF_JPEG_QUALITY);
  return new Blob([jpegToPdf(new Uint8Array(await jpeg.arrayBuffer()), { width, height, dpi }) as BlobPart], {
    type: "application/pdf",
  });
}
