import { describe, expect, it } from "vitest";
import { applyMapping, autoMapColumns, escapeCsvCell, sampleCsv } from "@/lib/fields/csv-mapping";
import { expandFilename, sanitizeFilename, uniqueFilenames } from "@/lib/fields/filename";
import { defaultTextStyle, fieldsSchema, slugifyKey, uniqueKey, type Field } from "@/lib/fields/schema";
import { buildValuesSchema, resolveValues, validateRows } from "@/lib/fields/validate";

const field = (overrides: Partial<Field> = {}): Field => ({
  id: overrides.key ?? "f1",
  key: "guest_name",
  label: "Guest name",
  type: "text",
  multiline: false,
  required: true,
  sampleValue: "Ada Lovelace",
  box: { x: 0, y: 0, w: 100, h: 40, rotation: 0 },
  style: defaultTextStyle(1000),
  ...overrides,
});

const fields = [
  field(),
  field({ key: "table", label: "Table No.", required: false, maxLength: 3, sampleValue: "12" }),
  field({ key: "message", label: "Message", required: false, multiline: true, sampleValue: "Hi", defaultValue: "See you there" }),
];

describe("schema helpers", () => {
  it("slugifies labels into keys", () => {
    expect(slugifyKey("Guest Name")).toBe("guest_name");
    expect(slugifyKey("Café / Table #")).toBe("cafe_table");
    expect(slugifyKey("1st row")).toBe("f_1st_row");
    expect(slugifyKey("!!!")).toBe("field");
  });

  it("finds a free key", () => {
    expect(uniqueKey("name", ["name", "name_2"])).toBe("name_3");
    expect(uniqueKey("title", ["name"])).toBe("title");
  });

  it("rejects duplicate keys", () => {
    const result = fieldsSchema.safeParse([field(), field({ id: "other" })]);
    expect(result.success).toBe(false);
  });
});

describe("buildValuesSchema", () => {
  const schema = buildValuesSchema(fields);

  it("trims, strips control characters and flattens single-line newlines", () => {
    const parsed = schema.parse({ guest_name: "  Ada\nLovelace\u0007 ", table: "7", message: "line1\r\nline2" });
    expect(parsed).toEqual({ guest_name: "Ada Lovelace", table: "7", message: "line1\nline2" });
  });

  it("enforces required and max length", () => {
    const result = schema.safeParse({ guest_name: "   ", table: "1234" });
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((i) => i.message);
    expect(messages).toContain("Guest name is required");
    expect(messages).toContain("Table No. must be 3 characters or fewer");
  });

  it("drops unknown keys", () => {
    expect(schema.parse({ guest_name: "Ada", hacker: "x" })).not.toHaveProperty("hacker");
  });

  it("validates many rows and reports row numbers", () => {
    const { valid, errors } = validateRows(fields, [{ guest_name: "A" }, { guest_name: "" }, { guest_name: "C", table: "9999" }]);
    expect(valid.map((v) => v.row)).toEqual([0]);
    expect(errors.map((e) => [e.row, e.fieldKey])).toEqual([
      [1, "guest_name"],
      [2, "table"],
    ]);
  });

  it("falls back to default values", () => {
    expect(resolveValues(fields, { guest_name: "Ada", message: "" })).toEqual({ guest_name: "Ada", table: "", message: "See you there" });
  });
});

describe("CSV mapping", () => {
  it("auto-maps by key or label, ignoring case and punctuation", () => {
    const mapping = autoMapColumns(["Email", "GUEST NAME", "table no", "notes"], fields);
    expect(mapping).toEqual({ guest_name: 1, table: 2, message: null });
  });

  it("uses each column once", () => {
    const mapping = autoMapColumns(["guest_name"], [field(), field({ key: "guest_name_2", label: "guest name" })]);
    expect(mapping).toEqual({ guest_name: 0, guest_name_2: null });
  });

  it("applies the mapping to rows", () => {
    expect(applyMapping([["x", "Ada", "4"]], { guest_name: 1, table: 2, message: null })).toEqual([
      { guest_name: "Ada", table: "4", message: "" },
    ]);
  });

  it("escapes formula injection and quotes", () => {
    expect(escapeCsvCell("=HYPERLINK()")).toBe("'=HYPERLINK()");
    expect(escapeCsvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(sampleCsv(fields)).toBe("Guest name,Table No.,Message\r\nAda Lovelace,12,Hi\r\n");
  });
});

describe("filenames", () => {
  it("sanitises unsafe characters", () => {
    expect(sanitizeFilename(' ../Mr: "Doe" / <VIP> ')).toBe("Mr-Doe-VIP");
  });

  it("expands patterns with a row-number fallback", () => {
    expect(expandFilename("{guest_name}-invite", { guest_name: "Ada Lovelace" }, 1)).toBe("Ada-Lovelace-invite");
    expect(expandFilename("{guest_name}", { guest_name: "" }, 7)).toBe("invite-7");
    expect(expandFilename("{n}-{table}", { table: "4" }, 3)).toBe("3-4");
  });

  it("de-duplicates case-insensitively", () => {
    expect(uniqueFilenames(["ada", "Ada", "ada", "bob"])).toEqual(["ada.png", "Ada-2.png", "ada-3.png", "bob.png"]);
  });
});
