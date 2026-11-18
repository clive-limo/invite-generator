import type { TextStyle } from "@/lib/fields/schema";

/** Advance width of `text` at `fontSize`, with no letter spacing applied. */
export type Measure = (text: string, fontSize: number) => number;

export interface LaidOutLine {
  text: string;
  /** Left edge of the line, relative to the box's top-left corner. */
  x: number;
  /** Vertical centre of the line, relative to the box's top-left (draw with textBaseline "middle"). */
  y: number;
  width: number;
}

export interface TextLayout {
  fontSize: number;
  /** Letter spacing in px at `fontSize`. */
  spacing: number;
  lines: LaidOutLine[];
  /** The font had to shrink below `style.fontSize`. */
  shrunk: boolean;
  /** Text did not fit even at the smallest allowed size and was cut with an ellipsis. */
  truncated: boolean;
}

const ELLIPSIS = "…";
const EPSILON = 0.5;
const SEARCH_STEPS = 14;

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

export function graphemes(text: string): string[] {
  if (!segmenter) return Array.from(text);
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

export function applyTransform(text: string, transform: TextStyle["transform"]): string {
  switch (transform) {
    case "uppercase":
      return text.toLocaleUpperCase();
    case "lowercase":
      return text.toLocaleLowerCase();
    case "capitalize":
      return (
        text
          .replace(/(^|[\s\-"(])(\p{L})/gu, (_, pre: string, ch: string) => pre + ch.toLocaleUpperCase())
          // O'Neil, D'Souza — but not it's / we're.
          .replace(/(^|[\s\-"(])(\p{L})'(\p{L})/gu, (_, pre: string, a: string, b: string) => `${pre}${a}'${b.toLocaleUpperCase()}`)
      );
    default:
      return text;
  }
}

interface Ctx {
  measure: Measure;
  size: number;
  spacing: number;
  cache: Map<string, number>;
}

/** Visual width of a line: advances plus letter spacing between graphemes (not after the last). */
function lineWidth(ctx: Ctx, text: string): number {
  if (!text) return 0;
  const cacheKey = `${ctx.size}\u0000${text}`;
  let width = ctx.cache.get(cacheKey);
  if (width === undefined) {
    width = ctx.measure(text, ctx.size);
    if (ctx.spacing !== 0) width += ctx.spacing * (graphemes(text).length - 1);
    ctx.cache.set(cacheKey, width);
  }
  return width;
}

/** Breaks a single word that is wider than the box into grapheme chunks. */
function breakWord(ctx: Ctx, word: string, maxWidth: number): string[] {
  const parts: string[] = [];
  let current = "";
  for (const g of graphemes(word)) {
    const next = current + g;
    if (current && lineWidth(ctx, next) > maxWidth + EPSILON) {
      parts.push(current);
      current = g;
    } else {
      current = next;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function wrapParagraph(ctx: Ctx, paragraph: string, maxWidth: number): string[] {
  const words = paragraph.split(/ +/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (lineWidth(ctx, candidate) <= maxWidth + EPSILON) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (lineWidth(ctx, word) > maxWidth + EPSILON) {
      const pieces = breakWord(ctx, word, maxWidth);
      lines.push(...pieces.slice(0, -1));
      current = pieces[pieces.length - 1] ?? "";
    } else {
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

function wrapText(ctx: Ctx, text: string, maxWidth: number, multiline: boolean): string[] {
  if (!multiline) return [text];
  return text.split("\n").flatMap((p) => wrapParagraph(ctx, p.trim(), maxWidth));
}

/** Trims `text` until `text…` fits in `maxWidth`. */
function ellipsize(ctx: Ctx, text: string, maxWidth: number): string {
  if (lineWidth(ctx, text) <= maxWidth + EPSILON) return text;
  const parts = graphemes(text);
  while (parts.length > 0) {
    parts.pop();
    const candidate = parts.join("").trimEnd() + ELLIPSIS;
    if (lineWidth(ctx, candidate) <= maxWidth + EPSILON) return candidate;
  }
  return ELLIPSIS;
}

function maxLinesFor(style: TextStyle, boxHeight: number, size: number, multiline: boolean): number {
  if (!multiline) return 1;
  const byHeight = Math.max(1, Math.floor((boxHeight + EPSILON) / (size * style.lineHeight)));
  return style.maxLines ? Math.min(style.maxLines, byHeight) : byHeight;
}

function fits(ctx: Ctx, lines: string[], style: TextStyle, box: { w: number; h: number }, multiline: boolean) {
  if (lines.length > maxLinesFor(style, box.h, ctx.size, multiline)) return false;
  if (lines.length * ctx.size * style.lineHeight > box.h + EPSILON) return false;
  return lines.every((line) => lineWidth(ctx, line) <= box.w + EPSILON);
}

/**
 * Lays out `text` inside a `box.w × box.h` box in template pixel space. Pure: all font
 * access goes through `measure`, so the same result is produced for the live preview,
 * the full-resolution export and tests.
 */
export function layoutText(
  measure: Measure,
  rawText: string,
  style: TextStyle,
  box: { w: number; h: number },
  multiline: boolean,
): TextLayout {
  const text = applyTransform(rawText, style.transform);
  const cache = new Map<string, number>();
  const ctxAt = (size: number): Ctx => ({ measure, size, spacing: style.letterSpacing * size, cache });

  let size = style.fontSize;
  let ctx = ctxAt(size);
  let lines = wrapText(ctx, text, box.w, multiline);

  if (style.fit === "shrink" && !fits(ctx, lines, style, box, multiline)) {
    const floor = Math.min(style.minFontSize, style.fontSize);
    const floorCtx = ctxAt(floor);
    const floorLines = wrapText(floorCtx, text, box.w, multiline);
    if (!fits(floorCtx, floorLines, style, box, multiline)) {
      size = floor;
      ctx = floorCtx;
      lines = floorLines;
    } else {
      // Largest size in [floor, fontSize] that fits.
      let lo = floor;
      let hi = style.fontSize;
      let best = { size: floor, ctx: floorCtx, lines: floorLines };
      for (let i = 0; i < SEARCH_STEPS && hi - lo > 0.1; i++) {
        const mid = (lo + hi) / 2;
        const midCtx = ctxAt(mid);
        const midLines = wrapText(midCtx, text, box.w, multiline);
        if (fits(midCtx, midLines, style, box, multiline)) {
          best = { size: mid, ctx: midCtx, lines: midLines };
          lo = mid;
        } else {
          hi = mid;
        }
      }
      // Round down to a quarter pixel so preview and export agree exactly.
      size = Math.floor(best.size * 4) / 4;
      ctx = ctxAt(size);
      lines = wrapText(ctx, text, box.w, multiline);
      if (!fits(ctx, lines, style, box, multiline)) {
        ({ size, ctx, lines } = best);
      }
    }
  }

  let truncated = false;
  const allowed = maxLinesFor(style, box.h, size, multiline);
  if (lines.length > allowed) {
    lines = lines.slice(0, allowed);
    lines[allowed - 1] = (lines[allowed - 1] ?? "") + ELLIPSIS;
    truncated = true;
  }
  lines = lines.map((line) => {
    const cut = ellipsize(ctx, line, box.w);
    if (cut !== line) truncated = true;
    return cut;
  });

  const lineAdvance = size * style.lineHeight;
  const contentHeight = lines.length * lineAdvance;
  const top =
    style.vAlign === "top" ? 0 : style.vAlign === "bottom" ? box.h - contentHeight : (box.h - contentHeight) / 2;

  return {
    fontSize: size,
    spacing: ctx.spacing,
    shrunk: size < style.fontSize,
    truncated,
    lines: lines.map((line, i) => {
      const width = lineWidth(ctx, line);
      const x = style.align === "left" ? 0 : style.align === "right" ? box.w - width : (box.w - width) / 2;
      return { text: line, x, y: top + (i + 0.5) * lineAdvance, width };
    }),
  };
}
