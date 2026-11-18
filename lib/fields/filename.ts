import type { FieldValues } from "./schema";

const MAX_LENGTH = 100;

export function sanitizeFilename(name: string): string {
  return name
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F/\\:*?"<>|]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, MAX_LENGTH);
}

/**
 * Expands a pattern like "{guest_name}-invite" for one row. `{n}` is the 1-based row
 * number. Returns a name without extension; falls back to "invite-{n}" if empty.
 */
export function expandFilename(pattern: string, values: FieldValues, rowNumber: number): string {
  const expanded = pattern.replace(/\{([a-z0-9_]+)\}/gi, (_, key: string) =>
    key === "n" ? String(rowNumber) : (values[key] ?? ""),
  );
  return sanitizeFilename(expanded) || `invite-${rowNumber}`;
}

/** Makes names unique (case-insensitively) by appending -2, -3… and adds the extension. */
export function uniqueFilenames(names: string[], extension = ".png"): string[] {
  const seen = new Map<string, number>();
  const taken = new Set<string>();
  return names.map((name) => {
    const base = name.toLowerCase();
    let candidate = name;
    let n = seen.get(base) ?? 1;
    while (taken.has(candidate.toLowerCase())) {
      n += 1;
      candidate = `${name}-${n}`;
    }
    seen.set(base, n);
    taken.add(candidate.toLowerCase());
    return candidate + extension;
  });
}
