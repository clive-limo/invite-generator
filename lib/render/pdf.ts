/**
 * Wraps one JPEG in a single-page PDF sized to its physical print size, so a 300 DPI
 * render prints at exactly the size the template was designed for. The JPEG bytes
 * are embedded as-is (DCTDecode), so there's no re-encoding and no dependency.
 */
export function jpegToPdf(jpeg: Uint8Array, size: { width: number; height: number; dpi: number }): Uint8Array {
  const { width, height, dpi } = size;
  const points = (px: number) => Number(((px * 72) / dpi).toFixed(3));
  const pageW = points(width);
  const pageH = points(height);
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (body: string) => {
    offsets.push(length);
    push(`${offsets.length} 0 obj\n${body}\nendobj\n`);
  };

  push("%PDF-1.4\n");
  // A comment of high bytes tells transfer tools the file is binary.
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  object("<< /Type /Catalog /Pages 2 0 R >>");
  object("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>`,
  );
  offsets.push(length);
  push(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  push(jpeg);
  push("\nendstream\nendobj\n");
  object(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);

  const xref = length;
  // Each cross-reference entry must be exactly 20 bytes, including the line ending.
  push(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets) push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
