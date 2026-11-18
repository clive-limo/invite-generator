"use client";

import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  Copy,
  Pipette,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FIELD_KEY_PATTERN, slugifyKey, type Field, type TextStyle } from "@/lib/fields/schema";
import { getFont, nearestWeight } from "@/lib/render/fonts";
import { FontPicker } from "./font-picker";
import { useEditor, useEditorStore } from "./store";

const WEIGHT_NAMES: Record<number, string> = {
  100: "Thin",
  200: "Extra light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semibold",
  700: "Bold",
  800: "Extra bold",
  900: "Black",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <h3 className="eyebrow">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-sm">
          {label}
        </Label>
        {hint}
      </div>
      {children}
    </div>
  );
}

/** Number input that only commits finite numbers within range; checkpoints history on focus. */
function NumberInput({
  id,
  value,
  onBegin,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  id?: string;
  value: number;
  onBegin: () => void;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  // While focused, show exactly what's typed; otherwise mirror the value.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? String(value);
  return (
    <div className="relative">
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        className={suffix ? "pr-9" : undefined}
        onFocus={() => {
          setDraft(String(value));
          onBegin();
        }}
        onBlur={() => setDraft(null)}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isFinite(n)) {
            onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, Math.round(n / step) * step)));
          }
        }}
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
    </div>
  );
}

export function FieldPanel({ field, truncated }: { field: Field; truncated: boolean }) {
  const store = useEditorStore();
  const fields = useEditor((s) => s.fields);
  const W = useEditor((s) => s.templateWidth);
  const H = useEditor((s) => s.templateHeight);
  const { checkpoint, patchField, updateField, removeField, duplicateField } = store.getState();
  const font = getFont(field.style.fontFamily);
  const [keyDraft, setKeyDraft] = useState<string | null>(null);
  const keyText = keyDraft ?? field.key;

  const keyTaken = fields.some((f) => f.id !== field.id && f.key === keyText);
  const keyValid = FIELD_KEY_PATTERN.test(keyText) && !keyTaken;

  const patch = (p: Partial<Field>) => patchField(field.id, p);
  const update = (p: Partial<Field>) => updateField(field.id, p);
  const patchStyle = (p: Partial<TextStyle>) => patchField(field.id, (f) => ({ ...f, style: { ...f.style, ...p } }));
  const updateStyle = (p: Partial<TextStyle>) => updateField(field.id, (f) => ({ ...f, style: { ...f.style, ...p } }));
  const patchBox = (p: Partial<Field["box"]>) => patchField(field.id, (f) => ({ ...f, box: { ...f.box, ...p } }));

  async function pickColor() {
    const EyeDropper = (window as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!EyeDropper) return;
    try {
      const { sRGBHex } = await new EyeDropper().open();
      if (/^#[0-9a-f]{6}$/i.test(sRGBHex)) updateStyle({ color: sRGBHex });
    } catch {
      // Cancelled.
    }
  }
  const hasEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="truncate text-lg font-medium">{field.label}</h2>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" aria-label="Duplicate field" onClick={() => duplicateField(field.id)}>
            <Copy />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Delete field" onClick={() => removeField(field.id)}>
            <Trash2 />
          </Button>
        </div>
      </div>

      {truncated && (
        <p className="flex gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          The sample text doesn&apos;t fit even at the minimum size, so it&apos;s cut off. Make the box bigger, lower the
          minimum size, or set a max length.
        </p>
      )}

      <Section title="Content">
        <Row label="Label" htmlFor="f-label">
          <Input
            id="f-label"
            value={field.label}
            maxLength={60}
            onFocus={checkpoint}
            onChange={(e) => {
              const label = e.target.value;
              // Keep the key in step with the label until it's been customised.
              const auto = field.key === slugifyKey(field.label) || field.key.startsWith(`${slugifyKey(field.label)}_`);
              const nextKey = slugifyKey(label);
              const free = !fields.some((f) => f.id !== field.id && f.key === nextKey);
              patch(auto && label && free ? { label, key: nextKey } : { label });
            }}
          />
        </Row>
        <Row
          label="Column name"
          htmlFor="f-key"
          hint={<span className="text-xs text-muted-foreground">for CSV / Excel</span>}
        >
          <Input
            id="f-key"
            value={keyText}
            aria-invalid={!keyValid}
            onChange={(e) => setKeyDraft(e.target.value.toLowerCase())}
            onBlur={() => {
              if (keyValid && keyText !== field.key) update({ key: keyText });
              setKeyDraft(null);
            }}
            className="font-mono"
          />
          {!keyValid && (
            <p className="text-xs text-destructive">
              {keyTaken ? "Another field uses this name" : "Lowercase letters, numbers and _ only; start with a letter"}
            </p>
          )}
        </Row>
        <Row label="Sample value" htmlFor="f-sample" hint={<span className="text-xs text-muted-foreground">shown here only</span>}>
          {field.multiline ? (
            <Textarea id="f-sample" rows={3} value={field.sampleValue} maxLength={500} onFocus={checkpoint} onChange={(e) => patch({ sampleValue: e.target.value })} />
          ) : (
            <Input id="f-sample" value={field.sampleValue} maxLength={500} onFocus={checkpoint} onChange={(e) => patch({ sampleValue: e.target.value })} />
          )}
        </Row>
        <Row label="Placeholder" htmlFor="f-placeholder">
          <Input
            id="f-placeholder"
            value={field.placeholder ?? ""}
            maxLength={120}
            placeholder="e.g. Full name as it should appear"
            onFocus={checkpoint}
            onChange={(e) => patch({ placeholder: e.target.value || undefined })}
          />
        </Row>
        <Row label="Default value" htmlFor="f-default" hint={<span className="text-xs text-muted-foreground">used when left blank</span>}>
          <Input
            id="f-default"
            value={field.defaultValue ?? ""}
            maxLength={500}
            onFocus={checkpoint}
            onChange={(e) => patch({ defaultValue: e.target.value || undefined })}
          />
        </Row>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
            Required
            <Switch checked={field.required} onCheckedChange={(required) => update({ required })} />
          </label>
          <label className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">
            Multi-line
            <Switch checked={field.multiline} onCheckedChange={(multiline) => update({ multiline })} />
          </label>
        </div>
        <Row label="Max characters" htmlFor="f-maxlen" hint={<span className="text-xs text-muted-foreground">optional</span>}>
          <Input
            id="f-maxlen"
            inputMode="numeric"
            value={field.maxLength ?? ""}
            placeholder="No limit"
            onFocus={checkpoint}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              patch({ maxLength: Number.isFinite(n) && n > 0 ? Math.min(n, 2000) : undefined });
            }}
          />
        </Row>
      </Section>

      <Separator />

      <Section title="Text">
        <Row label="Font">
          <FontPicker
            value={field.style.fontFamily}
            onChange={(fontFamily) =>
              updateStyle({
                fontFamily,
                fontWeight: nearestWeight(fontFamily, field.style.fontWeight),
                fontStyle: getFont(fontFamily)?.italic ? field.style.fontStyle : "normal",
              })
            }
          />
        </Row>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Row label="Weight">
            <Select value={String(field.style.fontWeight)} onValueChange={(v) => updateStyle({ fontWeight: Number(v) })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(font?.weights ?? [400]).map((w) => (
                  <SelectItem key={w} value={String(w)}>
                    {WEIGHT_NAMES[w] ?? w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Italic">
            <Switch
              className="mt-2"
              disabled={!font?.italic}
              checked={field.style.fontStyle === "italic"}
              onCheckedChange={(on) => updateStyle({ fontStyle: on ? "italic" : "normal" })}
            />
          </Row>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Row label="Size" htmlFor="f-size">
            <NumberInput
              id="f-size"
              value={field.style.fontSize}
              min={4}
              max={2000}
              suffix="px"
              onBegin={checkpoint}
              onChange={(fontSize) => patchStyle({ fontSize, minFontSize: Math.min(field.style.minFontSize, fontSize) })}
            />
          </Row>
          <Row label="Smallest" htmlFor="f-min">
            <NumberInput
              id="f-min"
              value={field.style.minFontSize}
              min={4}
              max={field.style.fontSize}
              suffix="px"
              onBegin={checkpoint}
              onChange={(minFontSize) => patchStyle({ minFontSize })}
            />
          </Row>
        </div>
        <Row label="Long text">
          <Select value={field.style.fit} onValueChange={(fit) => updateStyle({ fit: fit as TextStyle["fit"] })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="shrink">Shrink to fit the box</SelectItem>
              <SelectItem value="fixed">Keep size, cut off with …</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row label="Colour" htmlFor="f-color">
          <div className="flex gap-2">
            <input
              type="color"
              aria-label="Text colour"
              value={field.style.color}
              onFocus={checkpoint}
              onChange={(e) => patchStyle({ color: e.target.value })}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border bg-transparent p-1 md:h-8"
            />
            <Input
              id="f-color"
              className="font-mono uppercase"
              value={field.style.color}
              onFocus={checkpoint}
              onChange={(e) => /^#[0-9a-fA-F]{6}$/.test(e.target.value) && patchStyle({ color: e.target.value.toLowerCase() })}
            />
            {hasEyeDropper && (
              <Button variant="outline" size="icon" className="size-10 shrink-0 md:size-8" aria-label="Pick colour from screen" onClick={pickColor}>
                <Pipette />
              </Button>
            )}
          </div>
        </Row>
        <Row label="Opacity" hint={<span className="text-xs text-muted-foreground">{Math.round(field.style.opacity * 100)}%</span>}>
          <Slider
            min={0.1}
            max={1}
            step={0.05}
            value={[field.style.opacity]}
            onPointerDown={checkpoint}
            onValueChange={([opacity]) => patchStyle({ opacity })}
          />
        </Row>
        <div className="grid grid-cols-2 gap-3">
          <Row label="Align">
            <ToggleGroup
              type="single"
              variant="outline"
              value={field.style.align}
              onValueChange={(v) => v && updateStyle({ align: v as TextStyle["align"] })}
            >
              <ToggleGroupItem value="left" aria-label="Align left">
                <AlignLeft />
              </ToggleGroupItem>
              <ToggleGroupItem value="center" aria-label="Align centre">
                <AlignCenter />
              </ToggleGroupItem>
              <ToggleGroupItem value="right" aria-label="Align right">
                <AlignRight />
              </ToggleGroupItem>
            </ToggleGroup>
          </Row>
          <Row label="Vertical">
            <ToggleGroup
              type="single"
              variant="outline"
              value={field.style.vAlign}
              onValueChange={(v) => v && updateStyle({ vAlign: v as TextStyle["vAlign"] })}
            >
              <ToggleGroupItem value="top" aria-label="Top">
                <AlignStartHorizontal />
              </ToggleGroupItem>
              <ToggleGroupItem value="middle" aria-label="Middle">
                <AlignCenterHorizontal />
              </ToggleGroupItem>
              <ToggleGroupItem value="bottom" aria-label="Bottom">
                <AlignEndHorizontal />
              </ToggleGroupItem>
            </ToggleGroup>
          </Row>
        </div>
        <Row label="Letter spacing" hint={<span className="text-xs text-muted-foreground">{field.style.letterSpacing.toFixed(2)} em</span>}>
          <Slider
            min={-0.1}
            max={0.6}
            step={0.01}
            value={[field.style.letterSpacing]}
            onPointerDown={checkpoint}
            onValueChange={([letterSpacing]) => patchStyle({ letterSpacing })}
          />
        </Row>
        {field.multiline && (
          <>
            <Row label="Line height" hint={<span className="text-xs text-muted-foreground">{field.style.lineHeight.toFixed(2)}×</span>}>
              <Slider
                min={0.8}
                max={2.5}
                step={0.05}
                value={[field.style.lineHeight]}
                onPointerDown={checkpoint}
                onValueChange={([lineHeight]) => patchStyle({ lineHeight })}
              />
            </Row>
            <Row label="Max lines" htmlFor="f-maxlines" hint={<span className="text-xs text-muted-foreground">optional</span>}>
              <Input
                id="f-maxlines"
                inputMode="numeric"
                value={field.style.maxLines ?? ""}
                placeholder="As many as fit"
                onFocus={checkpoint}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  patchStyle({ maxLines: Number.isFinite(n) && n > 0 ? Math.min(n, 50) : undefined });
                }}
              />
            </Row>
          </>
        )}
        <Row label="Letter case">
          <Select value={field.style.transform} onValueChange={(v) => updateStyle({ transform: v as TextStyle["transform"] })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">As typed</SelectItem>
              <SelectItem value="uppercase">UPPERCASE</SelectItem>
              <SelectItem value="lowercase">lowercase</SelectItem>
              <SelectItem value="capitalize">Capitalise Each Word</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Section>

      <Separator />

      <Section title="Position">
        <div className="grid grid-cols-2 gap-3">
          {(["x", "y", "w", "h"] as const).map((k) => (
            <Row key={k} label={{ x: "X", y: "Y", w: "Width", h: "Height" }[k]} htmlFor={`f-${k}`}>
              <NumberInput
                id={`f-${k}`}
                value={field.box[k]}
                min={k === "w" || k === "h" ? 12 : -W}
                max={k === "x" || k === "w" ? W * 2 : H * 2}
                suffix="px"
                onBegin={checkpoint}
                onChange={(n) => patchBox({ [k]: n })}
              />
            </Row>
          ))}
          <Row label="Rotation" htmlFor="f-rot">
            <NumberInput id="f-rot" value={field.box.rotation} min={-180} max={180} step={0.5} suffix="°" onBegin={checkpoint} onChange={(rotation) => patchBox({ rotation })} />
          </Row>
          <Row label="Centre">
            <Button variant="outline" className="h-10 md:h-8" onClick={() => updateField(field.id, (f) => ({ ...f, box: { ...f.box, x: Math.round((W - f.box.w) / 2) } }))}>
              Horizontally
            </Button>
          </Row>
        </div>
      </Section>
    </div>
  );
}
