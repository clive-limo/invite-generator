"use client";

import { dropEmptyRows } from "@/lib/fields/csv-mapping";

export interface ParsedSheet {
  fileName: string;
  headers: string[];
  rows: string[][];
}

export class SheetError extends Error {}

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function cellToString(cell: unknown): string {
  if (cell == null) return "";
  if (cell instanceof Date) {
    // Spreadsheet dates become readable text, e.g. "12 December 2026".
    return cell.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  }
  return String(cell).trim();
}

async function parseCsv(file: File): Promise<string[][]> {
  const Papa = (await import("papaparse")).default;
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: "greedy",
      complete: (result) => resolve(result.data.map((row) => row.map(cellToString))),
      error: (error) => reject(new SheetError(`Couldn't read the CSV: ${error.message}`)),
    });
  });
}

async function parseXlsx(file: File): Promise<string[][]> {
  const { readSheet } = await import("read-excel-file/browser");
  try {
    const data = await readSheet(file);
    return data.map((row) => row.map(cellToString));
  } catch {
    throw new SheetError("Couldn't read that Excel file. Try saving it as .xlsx or CSV.");
  }
}

/** Reads a CSV or XLSX file in the browser. The first non-empty row is the header. */
export async function parseSheet(file: File): Promise<ParsedSheet> {
  if (file.size > MAX_FILE_BYTES) throw new SheetError("That file is over 10 MB");
  const name = file.name.toLowerCase();
  let table: string[][];
  if (name.endsWith(".csv") || name.endsWith(".txt") || file.type === "text/csv") table = await parseCsv(file);
  else if (name.endsWith(".xlsx")) table = await parseXlsx(file);
  else if (name.endsWith(".xls")) throw new SheetError("Old .xls files aren't supported — please save as .xlsx or CSV");
  else throw new SheetError("Please choose a .csv or .xlsx file");

  const [header, ...rest] = dropEmptyRows(table);
  if (!header) throw new SheetError("That file is empty");
  const headers = header.map((h, i) => h || `Column ${i + 1}`);
  const rows = rest.map((row) => headers.map((_, i) => row[i] ?? ""));
  if (rows.length === 0) throw new SheetError("Found a header row but no data below it");
  return { fileName: file.name, headers, rows };
}
