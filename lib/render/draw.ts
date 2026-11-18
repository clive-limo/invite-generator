import type { Field, FieldValues, TextStyle } from "@/lib/fields/schema";
import { cssFontFamily } from "./fonts";
import { graphemes, layoutText, type TextLayout } from "./layout";

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface DrawInput {
  /** Template native size. All field geometry is in this space. */
  width: number;
  height: number;
  background: CanvasImageSource | null;
  fields: Field[];
  /** Already resolved: defaults applied, keyed by field key. */
  values: FieldValues;
  /** Output pixels per template pixel. The canvas must be `width*scale × height*scale`. */
  scale: number;
}

export interface FieldReport {
  fieldId: string;
  layout: TextLayout | null;
}

export function fontString(style: TextStyle, size: number): string {
  return `${style.fontStyle} ${style.fontWeight} ${size}px ${cssFontFamily(style.fontFamily)}`;
}

function drawSpacedLine(ctx: Ctx2D, text: string, x: number, y: number, spacing: number) {
  // Draw grapheme by grapheme, positioning each from the measured prefix so kerning
  // within the line is preserved as closely as possible.
  let prefix = "";
  for (const g of graphemes(text)) {
    const offset = ctx.measureText(prefix).width + spacing * graphemes(prefix).length;
    ctx.fillText(g, x + offset, y);
    prefix += g;
  }
}

/**
 * Draws a complete invite. Coordinates are in template space; `scale` maps them to the
 * canvas, so a 1600px preview and a full-resolution export lay out identically.
 */
export function drawInvite(ctx: Ctx2D, input: DrawInput): FieldReport[] {
  const { width, height, background, fields, values, scale } = input;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (background) ctx.drawImage(background, 0, 0, width, height);

  return fields.map((field) => {
    const text = values[field.key] ?? "";
    if (!text) return { fieldId: field.id, layout: null };

    const { box, style } = field;
    const measure = (t: string, size: number) => {
      ctx.font = fontString(style, size);
      return ctx.measureText(t).width;
    };
    const layout = layoutText(measure, text, style, box, field.multiline);

    ctx.save();
    ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
    if (box.rotation) ctx.rotate((box.rotation * Math.PI) / 180);
    ctx.translate(-box.w / 2, -box.h / 2);
    ctx.globalAlpha = style.opacity;
    ctx.fillStyle = style.color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = fontString(style, layout.fontSize);
    for (const line of layout.lines) {
      if (layout.spacing === 0) ctx.fillText(line.text, line.x, line.y);
      else drawSpacedLine(ctx, line.text, line.x, line.y, layout.spacing);
    }
    ctx.restore();
    return { fieldId: field.id, layout };
  });
}
