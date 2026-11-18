import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import pg from "pg";
import { PNG } from "pngjs";
import yauzl from "yauzl";

config({ path: [".env.local", ".env"], quiet: true });

export const FIXTURES = path.join(__dirname, ".fixtures");

/** A 1240×1748 (A5 at ~212 DPI) cream card with a border, so tests don't need binary fixtures. */
export function makeTemplatePng(width = 1240, height = 1748): string {
  mkdirSync(FIXTURES, { recursive: true });
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (width * y + x) << 2;
      const border = x < 40 || y < 40 || x >= width - 40 || y >= height - 40;
      png.data[i] = border ? 150 : 250;
      png.data[i + 1] = border ? 90 : 244;
      png.data[i + 2] = border ? 60 : 232;
      png.data[i + 3] = 255;
    }
  }
  const file = path.join(FIXTURES, "template.png");
  writeFileSync(file, PNG.sync.write(png));
  return file;
}

export function makeGuestCsv(): string {
  mkdirSync(FIXTURES, { recursive: true });
  const rows = [
    "Guest name,Table",
    ...Array.from({ length: 9 }, (_, i) => `Guest Number ${i + 1},${i + 1}`),
    ",10", // missing the required name
  ];
  const file = path.join(FIXTURES, "guests.csv");
  writeFileSync(file, rows.join("\n"));
  return file;
}

/** Marks a user verified, so the tests also pass with REQUIRE_EMAIL_VERIFICATION=true. */
export async function verifyEmail(email: string) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`UPDATE "user" SET "emailVerified" = true WHERE email = $1`, [email]);
  } finally {
    await client.end();
  }
}

export function readPngInfo(bytes: Buffer) {
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  let dpi: number | null = null;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    if (type === "pHYs" && bytes[offset + 16] === 1) dpi = Math.round(bytes.readUInt32BE(offset + 8) / 39.3701);
    if (type === "IDAT") break;
    offset += 12 + length;
  }
  return { width, height, dpi };
}

/** Page size (points) and the embedded image of a single-image PDF made by lib/render/pdf.ts. */
export function readPdfInfo(bytes: Buffer) {
  const text = bytes.toString("latin1");
  const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(text);
  const image = /\/Width (\d+) \/Height (\d+) .*?\/Filter \/DCTDecode \/Length (\d+) >>\nstream\n/.exec(text);
  if (!text.startsWith("%PDF-") || !box || !image) throw new Error("Not a single-image invite PDF");
  const start = image.index + image[0].length;
  return {
    pageWidth: Number(box[1]),
    pageHeight: Number(box[2]),
    width: Number(image[1]),
    height: Number(image[2]),
    jpeg: bytes.subarray(start, start + Number(image[3])),
  };
}

export function readZipEntries(file: string): Promise<{ name: string; data: Buffer }[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error);
      const entries: { name: string; data: Buffer }[] = [];
      zip.on("entry", (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (err, stream) => {
          if (err || !stream) return reject(err);
          const chunks: Buffer[] = [];
          stream.on("data", (c: Buffer) => chunks.push(c));
          stream.on("end", () => {
            entries.push({ name: entry.fileName, data: Buffer.concat(chunks) });
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => resolve(entries));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}
