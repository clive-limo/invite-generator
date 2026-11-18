import type { Field, FieldValues } from "./schema";

/** Field key -> index of the spreadsheet column that feeds it, or null if unmapped. */
export type ColumnMapping = Record<string, number | null>;

export function normalizeHeader(header: string): string {
  return header
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Matches spreadsheet headers to fields by key or label, ignoring case, spaces,
 * punctuation and accents. Each column feeds at most one field.
 */
export function autoMapColumns(headers: string[], fields: Field[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const used = new Set<number>();
  const mapping: ColumnMapping = {};
  for (const field of fields) {
    const candidates = [normalizeHeader(field.key), normalizeHeader(field.label)];
    const index = normalized.findIndex((h, i) => !used.has(i) && h !== "" && candidates.includes(h));
    mapping[field.key] = index === -1 ? null : index;
    if (index !== -1) used.add(index);
  }
  return mapping;
}

export function applyMapping(rows: string[][], mapping: ColumnMapping): FieldValues[] {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(mapping).map(([key, index]) => [key, index == null ? "" : (row[index] ?? "")]),
    ),
  );
}

/** Drops rows whose cells are all blank (trailing lines in exported spreadsheets). */
export function dropEmptyRows(rows: string[][]): string[][] {
  return rows.filter((row) => row.some((cell) => cell != null && String(cell).trim() !== ""));
}

/** Prefixes cells that spreadsheet apps would evaluate as formulas. */
export function escapeCsvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n") + "\r\n";
}

/** Header row of field labels plus one row of sample values. */
export function sampleCsv(fields: Field[]): string {
  return toCsv([fields.map((f) => f.label), fields.map((f) => f.sampleValue)]);
}
