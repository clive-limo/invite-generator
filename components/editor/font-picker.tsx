"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cssFontFamily, FONT_CATEGORY_LABELS, FONTS, loadFonts, type FontCategory } from "@/lib/render/fonts";
import { cn } from "@/lib/utils";

const CATEGORIES = Object.keys(FONT_CATEGORY_LABELS) as FontCategory[];

export function FontPicker({ value, onChange }: { value: string; onChange: (family: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Load every face only once someone opens the picker, so each name renders in its own font.
  useEffect(() => {
    if (open) void loadFonts(FONTS.map((f) => f.family), document.fonts).catch(() => undefined);
  }, [open]);

  const matches = FONTS.filter((f) => f.family.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="h-10 w-full justify-between md:h-8">
          <span className="truncate" style={{ fontFamily: cssFontFamily(value) }}>
            {value}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="border-b p-2">
          <Input autoFocus placeholder="Search fonts" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="max-h-80 overflow-y-auto p-1" role="listbox">
          {CATEGORIES.map((category) => {
            const fonts = matches.filter((f) => f.category === category);
            if (fonts.length === 0) return null;
            return (
              <div key={category} className="py-1">
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{FONT_CATEGORY_LABELS[category]}</p>
                {fonts.map((font) => (
                  <button
                    key={font.family}
                    type="button"
                    role="option"
                    aria-selected={font.family === value}
                    onClick={() => {
                      onChange(font.family);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-lg hover:bg-accent",
                      font.family === value && "bg-accent",
                    )}
                    style={{ fontFamily: cssFontFamily(font.family) }}
                  >
                    {font.family}
                    {font.family === value && <Check className="size-4" />}
                  </button>
                ))}
              </div>
            );
          })}
          {matches.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No fonts match.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
