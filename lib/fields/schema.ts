import { z } from "zod";

/** Geometry is stored in the template's native pixel space. */
export const fieldBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  rotation: z.number().min(-180).max(180),
});

export const textStyleSchema = z.object({
  fontFamily: z.string().min(1),
  fontWeight: z.number().int().min(100).max(900),
  fontStyle: z.enum(["normal", "italic"]),
  /** Native px. With fit "shrink" this is the maximum size. */
  fontSize: z.number().positive(),
  /** Native px. Auto-shrink never goes below this; text is ellipsised instead. */
  minFontSize: z.number().positive(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  opacity: z.number().min(0).max(1),
  align: z.enum(["left", "center", "right"]),
  vAlign: z.enum(["top", "middle", "bottom"]),
  /** Multiple of the font size. */
  lineHeight: z.number().min(0.5).max(3),
  /** In em, so it scales with auto-shrink. */
  letterSpacing: z.number().min(-0.2).max(1),
  transform: z.enum(["none", "uppercase", "lowercase", "capitalize"]),
  fit: z.enum(["shrink", "fixed"]),
  maxLines: z.number().int().positive().optional(),
});

export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

export const textFieldSchema = z.object({
  id: z.string().min(1),
  key: z.string().regex(FIELD_KEY_PATTERN, "Use lowercase letters, numbers and underscores"),
  label: z.string().trim().min(1).max(60),
  type: z.literal("text"),
  multiline: z.boolean(),
  required: z.boolean(),
  placeholder: z.string().max(120).optional(),
  sampleValue: z.string().max(500),
  defaultValue: z.string().max(500).optional(),
  maxLength: z.number().int().positive().max(2000).optional(),
  box: fieldBoxSchema,
  style: textStyleSchema,
});

// A union so photo / QR / date fields can be added without migrating stored data.
export const fieldSchema = z.discriminatedUnion("type", [textFieldSchema]);

export const fieldsSchema = z
  .array(fieldSchema)
  .max(50)
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    fields.forEach((field, i) => {
      if (seen.has(field.key)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate field key "${field.key}"`,
          path: [i, "key"],
        });
      }
      seen.add(field.key);
    });
  });

export type FieldBox = z.infer<typeof fieldBoxSchema>;
export type TextStyle = z.infer<typeof textStyleSchema>;
export type TextField = z.infer<typeof textFieldSchema>;
export type Field = z.infer<typeof fieldSchema>;
export type FieldValues = Record<string, string>;

/** Turns a label into a field key: "Guest Name" -> "guest_name". */
export function slugifyKey(label: string): string {
  const slug = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if (!slug) return "field";
  return /^[a-z]/.test(slug) ? slug : `f_${slug}`.slice(0, 40);
}

/** Returns `base`, or `base_2`, `base_3`… if it is already taken. */
export function uniqueKey(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base.slice(0, 36)}_${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

export function defaultTextStyle(templateHeight: number): TextStyle {
  const fontSize = Math.round(templateHeight * 0.04);
  return {
    fontFamily: "Playfair Display",
    fontWeight: 600,
    fontStyle: "normal",
    fontSize,
    minFontSize: Math.max(8, Math.round(fontSize * 0.4)),
    color: "#1f2937",
    opacity: 1,
    align: "center",
    vAlign: "middle",
    lineHeight: 1.2,
    letterSpacing: 0,
    transform: "none",
    fit: "shrink",
  };
}
