import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { crc32 } from "@/lib/render/crc32";
import { readPngDpi, readPngSize, setPngDpi } from "@/lib/render/png-dpi";

function makePng(width: number, height: number): Uint8Array {
  const png = new PNG({ width, height });
  png.data.fill(255);
  return new Uint8Array(PNG.sync.write(png));
}

describe("crc32", () => {
  it("matches the IEEE reference value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("setPngDpi", () => {
  it("adds a 300 DPI pHYs chunk and keeps the image decodable", () => {
    const original = makePng(12, 7);
    expect(readPngDpi(original)).toBeNull();
    const tagged = setPngDpi(original, 300);
    expect(readPngDpi(tagged)).toBe(300);
    expect(readPngSize(tagged)).toEqual({ width: 12, height: 7 });
    const decoded = PNG.sync.read(Buffer.from(tagged));
    expect(decoded.width).toBe(12);
    expect(decoded.height).toBe(7);
  });

  it("replaces an existing pHYs instead of adding a second one", () => {
    const twice = setPngDpi(setPngDpi(makePng(4, 4), 72), 300);
    expect(readPngDpi(twice)).toBe(300);
    const text = Buffer.from(twice).toString("latin1");
    expect(text.split("pHYs").length - 1).toBe(1);
  });

  it("rejects non-PNG input", () => {
    expect(() => setPngDpi(new Uint8Array(64), 300)).toThrow("Not a PNG");
  });
});
