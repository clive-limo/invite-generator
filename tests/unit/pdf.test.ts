import { describe, expect, it } from "vitest";
import { jpegToPdf } from "@/lib/render/pdf";

const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

describe("jpegToPdf", () => {
  // Not a real JPEG: the writer embeds bytes verbatim, so any payload exercises the structure.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x0a, 0x0d, 0x80, 0xff, 0xd9]);
  const pdf = jpegToPdf(jpeg, { width: 2480, height: 3508, dpi: 300 });
  const text = latin1(pdf);

  it("sizes the page to the physical print size (A4 at 300 DPI)", () => {
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text).toContain("/MediaBox [0 0 595.2 841.92]");
    expect(text).toContain("/Width 2480 /Height 3508");
    expect(text).toContain("q 595.2 0 0 841.92 0 0 cm /Im0 Do Q");
    expect(text.endsWith("%%EOF\n")).toBe(true);
  });

  it("embeds the JPEG bytes unchanged with the right length", () => {
    expect(text).toContain(`/Filter /DCTDecode /Length ${jpeg.length}`);
    const start = text.indexOf("stream\n") + "stream\n".length;
    expect(pdf.slice(start, start + jpeg.length)).toEqual(jpeg);
    expect(text.slice(start + jpeg.length, start + jpeg.length + 10)).toBe("\nendstream");
  });

  it("has a cross-reference table whose offsets point at each object", () => {
    const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    const table = text.slice(startxref).split("\n");
    expect(table[1]).toBe("0 6");
    const entries = table.slice(3, 8);
    entries.forEach((entry, i) => {
      expect(entry).toMatch(/^\d{10} 00000 n $/);
      const offset = Number(entry.slice(0, 10));
      expect(text.slice(offset, offset + 8)).toBe(`${i + 1} 0 obj\n`);
    });
  });
});
