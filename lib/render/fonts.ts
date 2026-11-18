export type FontCategory = "serif" | "sans" | "script" | "display";

interface FontFile {
  file: string;
  /** A single weight ("400") or a variable range ("100 900"). */
  weight: string;
  style: "normal" | "italic";
}

export interface FontFamilyDef {
  family: string;
  category: FontCategory;
  /** Weights offered in the editor. */
  weights: number[];
  italic: boolean;
  files: FontFile[];
}

const range = (from: number, to: number) => {
  const out: number[] = [];
  for (let w = from; w <= to; w += 100) out.push(w);
  return out;
};

const variable = (family: string, category: FontCategory, base: string, min: number, max: number, italic = true): FontFamilyDef => ({
  family,
  category,
  weights: range(min, max),
  italic,
  files: [
    { file: `${base}-VF.ttf`, weight: `${min} ${max}`, style: "normal" },
    ...(italic ? [{ file: `${base}-Italic-VF.ttf`, weight: `${min} ${max}`, style: "italic" as const }] : []),
  ],
});

const single = (family: string, category: FontCategory, file: string): FontFamilyDef => ({
  family,
  category,
  weights: [400],
  italic: false,
  files: [{ file, weight: "400", style: "normal" }],
});

/** All SIL OFL, from google/fonts; files live in public/fonts (see scripts/fetch-fonts.mjs). */
export const FONTS: FontFamilyDef[] = [
  variable("Playfair Display", "serif", "PlayfairDisplay", 400, 900),
  variable("Cormorant Garamond", "serif", "CormorantGaramond", 300, 700),
  variable("EB Garamond", "serif", "EBGaramond", 400, 800),
  variable("Lora", "serif", "Lora", 400, 700),
  variable("Cinzel", "serif", "Cinzel", 400, 900, false),
  variable("Montserrat", "sans", "Montserrat", 100, 900),
  variable("Raleway", "sans", "Raleway", 100, 900),
  variable("Inter", "sans", "Inter", 100, 900),
  {
    family: "Poppins",
    category: "sans",
    weights: [300, 400, 500, 600, 700],
    italic: true,
    files: [
      { file: "Poppins-Light.ttf", weight: "300", style: "normal" },
      { file: "Poppins-Regular.ttf", weight: "400", style: "normal" },
      { file: "Poppins-Italic.ttf", weight: "400", style: "italic" },
      { file: "Poppins-Medium.ttf", weight: "500", style: "normal" },
      { file: "Poppins-SemiBold.ttf", weight: "600", style: "normal" },
      { file: "Poppins-Bold.ttf", weight: "700", style: "normal" },
    ],
  },
  single("Great Vibes", "script", "GreatVibes-Regular.ttf"),
  single("Parisienne", "script", "Parisienne-Regular.ttf"),
  variable("Dancing Script", "script", "DancingScript", 400, 700, false),
  single("Allura", "script", "Allura-Regular.ttf"),
  single("Pinyon Script", "script", "PinyonScript-Regular.ttf"),
  single("Alex Brush", "script", "AlexBrush-Regular.ttf"),
  single("Bebas Neue", "display", "BebasNeue-Regular.ttf"),
  single("Abril Fatface", "display", "AbrilFatface-Regular.ttf"),
];

export const FONT_CATEGORY_LABELS: Record<FontCategory, string> = {
  serif: "Serif",
  sans: "Sans serif",
  script: "Script",
  display: "Display",
};

const GENERIC: Record<FontCategory, string> = {
  serif: "serif",
  sans: "sans-serif",
  script: "cursive",
  display: "sans-serif",
};

const byFamily = new Map(FONTS.map((f) => [f.family, f]));

export function getFont(family: string): FontFamilyDef | undefined {
  return byFamily.get(family);
}

export function cssFontFamily(family: string): string {
  const def = byFamily.get(family);
  return `"${family.replace(/"/g, "")}", ${def ? GENERIC[def.category] : "sans-serif"}`;
}

/** Nearest weight the family actually offers. */
export function nearestWeight(family: string, weight: number): number {
  const weights = byFamily.get(family)?.weights ?? [400];
  return weights.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), weights[0]!);
}

type FontTarget = FontFaceSet & { add(face: FontFace): unknown };

const loaded = new WeakMap<FontTarget, Map<string, Promise<void>>>();

/**
 * Loads every face of `families` into `target` (document.fonts or a worker's
 * self.fonts). Safe to call repeatedly; each face is fetched once per target.
 */
export async function loadFonts(families: Iterable<string>, target: FontTarget, origin = ""): Promise<void> {
  let cache = loaded.get(target);
  if (!cache) {
    cache = new Map();
    loaded.set(target, cache);
  }
  const jobs: Promise<void>[] = [];
  for (const family of new Set(families)) {
    const def = byFamily.get(family);
    if (!def) continue;
    for (const f of def.files) {
      const key = `${family}|${f.file}`;
      let job = cache.get(key);
      if (!job) {
        const face = new FontFace(def.family, `url(${origin}/fonts/${f.file})`, {
          weight: f.weight,
          style: f.style,
          display: "block",
        });
        job = face.load().then((ready) => {
          target.add(ready);
        });
        job.catch(() => cache!.delete(key));
        cache.set(key, job);
      }
      jobs.push(job);
    }
  }
  await Promise.all(jobs);
}
