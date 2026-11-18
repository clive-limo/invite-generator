const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function relativeTime(iso: string | Date, now = Date.now()): string {
  const seconds = (new Date(iso).getTime() - now) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function megapixels(width: number, height: number): string {
  return `${((width * height) / 1_000_000).toFixed(1)} MP`;
}

/** Physical size when printed at `dpi`, e.g. "14.8 × 21.0 cm". */
export function printSize(width: number, height: number, dpi = 300): string {
  const cm = (px: number) => ((px / dpi) * 2.54).toFixed(1);
  return `${cm(width)} × ${cm(height)} cm at ${dpi} DPI`;
}
