import { describe, expect, it } from "vitest";
import { defaultTextStyle, type TextStyle } from "@/lib/fields/schema";
import { applyTransform, layoutText, type Measure } from "@/lib/render/layout";

// Monospace stand-in: every grapheme is half the font size wide.
const measure: Measure = (text, size) => Array.from(text).length * size * 0.5;

const style = (overrides: Partial<TextStyle> = {}): TextStyle => ({
  ...defaultTextStyle(1000),
  fontSize: 40,
  minFontSize: 10,
  lineHeight: 1.25,
  align: "left",
  vAlign: "top",
  ...overrides,
});

describe("layoutText", () => {
  it("keeps the requested size when the text fits", () => {
    const layout = layoutText(measure, "Hello", style(), { w: 200, h: 50 }, false);
    expect(layout.fontSize).toBe(40);
    expect(layout.shrunk).toBe(false);
    expect(layout.truncated).toBe(false);
    expect(layout.lines).toEqual([{ text: "Hello", x: 0, y: 25, width: 100 }]);
  });

  it("shrinks a single line to the largest size that fits the width", () => {
    // 20 chars * 0.5 * size <= 200  =>  size <= 20
    const layout = layoutText(measure, "abcdefghijklmnopqrst", style(), { w: 200, h: 50 }, false);
    expect(layout.shrunk).toBe(true);
    expect(layout.fontSize).toBeLessThanOrEqual(20);
    expect(layout.fontSize).toBeGreaterThan(19.5);
    expect(layout.lines[0]!.width).toBeLessThanOrEqual(200.5);
  });

  it("ellipsises when the text does not fit even at the minimum size", () => {
    const layout = layoutText(measure, "x".repeat(100), style({ minFontSize: 10 }), { w: 100, h: 50 }, false);
    expect(layout.fontSize).toBe(10);
    expect(layout.truncated).toBe(true);
    expect(layout.lines[0]!.text.endsWith("…")).toBe(true);
    expect(layout.lines[0]!.width).toBeLessThanOrEqual(100.5);
  });

  it("wraps multi-line text and respects explicit newlines", () => {
    const layout = layoutText(measure, "one two three\nfour", style({ fit: "fixed", fontSize: 20 }), { w: 100, h: 200 }, true);
    expect(layout.lines.map((l) => l.text)).toEqual(["one two", "three", "four"]);
    expect(layout.lines.map((l) => l.y)).toEqual([12.5, 37.5, 62.5]);
  });

  it("breaks a word that is wider than the box", () => {
    const layout = layoutText(measure, "abcdefghij", style({ fit: "fixed", fontSize: 20 }), { w: 50, h: 200 }, true);
    expect(layout.lines.map((l) => l.text)).toEqual(["abcde", "fghij"]);
  });

  it("shrinks multi-line text until all lines fit the box height", () => {
    const text = "the quick brown fox jumps over the lazy dog";
    const layout = layoutText(measure, text, style(), { w: 200, h: 100 }, true);
    const totalHeight = layout.lines.length * layout.fontSize * 1.25;
    expect(layout.shrunk).toBe(true);
    expect(totalHeight).toBeLessThanOrEqual(100.5);
    expect(layout.truncated).toBe(false);
  });

  it("honours maxLines", () => {
    const layout = layoutText(measure, "aa bb cc dd ee", style({ fit: "fixed", fontSize: 20, maxLines: 2 }), { w: 25, h: 500 }, true);
    expect(layout.lines).toHaveLength(2);
    expect(layout.truncated).toBe(true);
    expect(layout.lines[1]!.text.endsWith("…")).toBe(true);
  });

  it("aligns horizontally and vertically", () => {
    const center = layoutText(measure, "ab", style({ align: "center", vAlign: "middle", fontSize: 20 }), { w: 100, h: 100 }, false);
    expect(center.lines[0]).toMatchObject({ x: 40, y: 50, width: 20 });
    const right = layoutText(measure, "ab", style({ align: "right", vAlign: "bottom", fontSize: 20 }), { w: 100, h: 100 }, false);
    expect(right.lines[0]).toMatchObject({ x: 80, y: 87.5 });
  });

  it("adds letter spacing between graphemes but not after the last", () => {
    const layout = layoutText(measure, "abc", style({ letterSpacing: 0.1, fontSize: 20, fit: "fixed" }), { w: 500, h: 100 }, false);
    expect(layout.spacing).toBe(2);
    expect(layout.lines[0]!.width).toBe(30 + 2 * 2);
  });

  it("produces the same layout regardless of how often it is called (cache safety)", () => {
    const a = layoutText(measure, "Mr & Mrs Doe", style(), { w: 150, h: 40 }, false);
    const b = layoutText(measure, "Mr & Mrs Doe", style(), { w: 150, h: 40 }, false);
    expect(a).toEqual(b);
  });
});

describe("applyTransform", () => {
  it("capitalises each word", () => {
    expect(applyTransform("jane o'neil-smith (guest)", "capitalize")).toBe("Jane O'Neil-Smith (Guest)");
    expect(applyTransform("it's we're", "capitalize")).toBe("It's We're");
  });
  it("upper and lower cases", () => {
    expect(applyTransform("Ada", "uppercase")).toBe("ADA");
    expect(applyTransform("Ada", "lowercase")).toBe("ada");
  });
});
