import { crc32 } from "./crc32";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const INCHES_PER_METRE = 39.3701;

function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 33 && SIGNATURE.every((b, i) => bytes[i] === b);
}

function chunkType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
}

function buildPhys(dpi: number): Uint8Array {
  const ppm = Math.round(dpi * INCHES_PER_METRE);
  const chunk = new Uint8Array(4 + 4 + 9 + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1; // unit: metre
  view.setUint32(17, crc32(chunk, 4, 17));
  return chunk;
}

/**
 * Returns a copy of `png` that declares `dpi` (pHYs chunk right after IHDR), replacing
 * any existing pHYs. Browsers' canvas encoders don't write one, so without this a
 * 2480×3508 invite opens as a poster-sized 72 DPI image in print dialogs.
 */
export function setPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  if (!isPng(png)) throw new Error("Not a PNG");
  const parts: Uint8Array[] = [png.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = readUint32(png, offset);
    const end = offset + 12 + length;
    const type = chunkType(png, offset);
    if (type !== "pHYs") parts.push(png.subarray(offset, end));
    if (type === "IHDR") parts.push(buildPhys(dpi));
    offset = end;
    if (type === "IEND") break;
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Reads the DPI declared by a PNG's pHYs chunk, or null if it has none. */
export function readPngDpi(png: Uint8Array): number | null {
  if (!isPng(png)) return null;
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = readUint32(png, offset);
    const type = chunkType(png, offset);
    if (type === "pHYs" && png[offset + 16] === 1) {
      return Math.round(readUint32(png, offset + 8) / INCHES_PER_METRE);
    }
    if (type === "IDAT" || type === "IEND") return null;
    offset += 12 + length;
  }
  return null;
}

export function readPngSize(png: Uint8Array): { width: number; height: number } | null {
  if (!isPng(png) || chunkType(png, 8) !== "IHDR") return null;
  return { width: readUint32(png, 16), height: readUint32(png, 20) };
}

export async function blobWithDpi(blob: Blob, dpi: number): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return new Blob([setPngDpi(bytes, dpi) as BlobPart], { type: "image/png" });
}
