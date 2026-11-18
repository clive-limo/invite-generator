import { z } from "zod";
import type { Field, FieldValues } from "./schema";

// C0/C1 control characters except tab and newline.
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

export function cleanValue(field: Field, raw: unknown): string {
  let value = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
  value = value.replace(/\r\n?/g, "\n").replace(CONTROL_CHARS, "").replace(/\t/g, " ");
  if (!field.multiline) value = value.replace(/\n+/g, " ");
  return value.trim();
}

/**
 * Builds the schema for one invite's values from a template's fields. Used by the
 * public form, the claim endpoint and the bulk review step, so all three agree.
 */
export function buildValuesSchema(fields: Field[]) {
  const shape: Record<string, z.ZodType<string>> = {};
  for (const field of fields) {
    let schema = z.string();
    if (field.required) schema = schema.min(1, `${field.label} is required`);
    if (field.maxLength) {
      schema = schema.max(field.maxLength, `${field.label} must be ${field.maxLength} characters or fewer`);
    }
    shape[field.key] = z.preprocess((raw) => cleanValue(field, raw), schema);
  }
  return z.object(shape);
}

export interface RowError {
  /** 0-based index into the submitted rows. */
  row: number;
  fieldKey: string;
  message: string;
}

export function validateRows(fields: Field[], rows: unknown[]) {
  const schema = buildValuesSchema(fields);
  const valid: { row: number; values: FieldValues }[] = [];
  const errors: RowError[] = [];
  rows.forEach((row, index) => {
    const result = schema.safeParse(row ?? {});
    if (result.success) {
      valid.push({ row: index, values: result.data as FieldValues });
    } else {
      for (const issue of result.error.issues) {
        errors.push({ row: index, fieldKey: String(issue.path[0] ?? ""), message: issue.message });
      }
    }
  });
  return { valid, errors };
}

/** What each field shows when there is no value: the default, else nothing. */
export function resolveValues(fields: Field[], values: FieldValues): FieldValues {
  const out: FieldValues = {};
  for (const field of fields) {
    const value = values[field.key];
    out[field.key] = value && value.length > 0 ? value : (field.defaultValue ?? "");
  }
  return out;
}

export function sampleValues(fields: Field[]): FieldValues {
  return Object.fromEntries(fields.map((f) => [f.key, f.sampleValue]));
}
