"use client";

import { ChevronDown, ChevronUp, Plus, TriangleAlert, Type } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { updateSettingsAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { megapixels, printSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useEditor, useEditorStore } from "./store";

export function FieldsList({ truncatedIds, onPick }: { truncatedIds: Set<string>; onPick?: () => void }) {
  const store = useEditorStore();
  const fields = useEditor((s) => s.fields);
  const selectedId = useEditor((s) => s.selectedId);
  const { select, moveField, addField } = store.getState();

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <h3 className="eyebrow">Fields</h3>
        <Button variant="ghost" size="sm" onClick={() => addField()}>
          <Plus /> Add
        </Button>
      </div>
      {fields.length === 0 ? (
        <p className="rounded-lg border border-dashed border-foreground/20 p-4 text-sm text-muted-foreground">
          No fields yet. Add one, or drag on the design to draw a box.
        </p>
      ) : (
        <ul className="grid gap-1">
          {fields.map((field, i) => (
            <li key={field.id}>
              <div
                className={cn(
                  "group flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-sm",
                  field.id === selectedId ? "border-brand/40 bg-brand-muted" : "hover:bg-accent",
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
                  onClick={() => {
                    select(field.id);
                    onPick?.();
                  }}
                >
                  {truncatedIds.has(field.id) ? (
                    <TriangleAlert className="size-4 shrink-0 text-destructive" />
                  ) : (
                    <Type className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{field.label}</span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">{field.key}</span>
                  </span>
                </button>
                <div className="flex opacity-60 group-hover:opacity-100">
                  <Button variant="ghost" size="icon-xs" aria-label="Move up" disabled={i === 0} onClick={() => moveField(field.id, -1)}>
                    <ChevronUp />
                  </Button>
                  <Button variant="ghost" size="icon-xs" aria-label="Move down" disabled={i === fields.length - 1} onClick={() => moveField(field.id, 1)}>
                    <ChevronDown />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface SettingsProps {
  templateId: string;
  name: string;
  width: number;
  height: number;
  exportScale: number;
  canExport2x: boolean;
}

export function TemplateSettings({ templateId, name: initialName, width, height, exportScale: initialScale, canExport2x }: SettingsProps) {
  const [name, setName] = useState(initialName);
  const [scale, setScale] = useState(String(initialScale));

  async function save(patch: { name?: string; exportScale?: 1 | 2 }) {
    const result = await updateSettingsAction(templateId, patch);
    if (!result.ok) toast.error(result.error);
  }

  return (
    <div className="grid gap-3">
      <Separator />
      <h3 className="eyebrow">Template</h3>
      <div className="grid gap-1.5">
        <Label htmlFor="t-name">Name</Label>
        <Input
          id="t-name"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== initialName && save({ name: name.trim() })}
        />
      </div>
      <div className="grid gap-1.5">
        <Label>Output size</Label>
        <Select
          value={scale}
          onValueChange={(v) => {
            setScale(v);
            void save({ exportScale: Number(v) as 1 | 2 });
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">
              Original · {width}×{height}
            </SelectItem>
            <SelectItem value="2" disabled={!canExport2x}>
              2× · {width * 2}×{height * 2}
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {megapixels(width * Number(scale), height * Number(scale))} · prints {printSize(width * Number(scale), height * Number(scale))}.
          {scale === "2" && " Text is drawn at 2×; the artwork is upscaled. Republish to apply."}
        </p>
      </div>
    </div>
  );
}
