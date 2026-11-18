// Downloads the curated invite fonts (all SIL OFL) from the google/fonts repo into
// public/fonts. The files are committed, so this only needs re-running when the
// list in lib/render/fonts.ts changes.
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";

const BASE = "https://raw.githubusercontent.com/google/fonts/main/ofl";
const OUT = path.join(process.cwd(), "public", "fonts");

const FILES = [
  ["playfairdisplay", "PlayfairDisplay[wght].ttf"],
  ["playfairdisplay", "PlayfairDisplay-Italic[wght].ttf"],
  ["cormorantgaramond", "CormorantGaramond[wght].ttf"],
  ["cormorantgaramond", "CormorantGaramond-Italic[wght].ttf"],
  ["cinzel", "Cinzel[wght].ttf"],
  ["lora", "Lora[wght].ttf"],
  ["lora", "Lora-Italic[wght].ttf"],
  ["ebgaramond", "EBGaramond[wght].ttf"],
  ["ebgaramond", "EBGaramond-Italic[wght].ttf"],
  ["montserrat", "Montserrat[wght].ttf"],
  ["montserrat", "Montserrat-Italic[wght].ttf"],
  ["raleway", "Raleway[wght].ttf"],
  ["raleway", "Raleway-Italic[wght].ttf"],
  ["inter", "Inter[opsz,wght].ttf"],
  ["inter", "Inter-Italic[opsz,wght].ttf"],
  ["poppins", "Poppins-Light.ttf"],
  ["poppins", "Poppins-Regular.ttf"],
  ["poppins", "Poppins-Italic.ttf"],
  ["poppins", "Poppins-Medium.ttf"],
  ["poppins", "Poppins-SemiBold.ttf"],
  ["poppins", "Poppins-Bold.ttf"],
  ["greatvibes", "GreatVibes-Regular.ttf"],
  ["parisienne", "Parisienne-Regular.ttf"],
  ["dancingscript", "DancingScript[wght].ttf"],
  ["allura", "Allura-Regular.ttf"],
  ["pinyonscript", "PinyonScript-Regular.ttf"],
  ["alexbrush", "AlexBrush-Regular.ttf"],
  ["bebasneue", "BebasNeue-Regular.ttf"],
  ["abrilfatface", "AbrilFatface-Regular.ttf"],
];

/** "PlayfairDisplay-Italic[wght].ttf" -> "PlayfairDisplay-Italic-VF.ttf" (no brackets in URLs). */
const localName = (file) => file.replace(/\[[^\]]+\]/, "-VF").replace("--VF", "-VF");

await mkdir(OUT, { recursive: true });
const failed = [];
for (const [dir, file] of FILES) {
  const target = path.join(OUT, localName(file));
  try {
    await access(target);
    continue;
  } catch {}
  const url = `${BASE}/${dir}/${encodeURIComponent(file)}`;
  const res = await fetch(url);
  if (!res.ok) {
    failed.push(`${res.status} ${dir}/${file}`);
    continue;
  }
  await writeFile(target, Buffer.from(await res.arrayBuffer()));
  console.log("saved", localName(file));
}
if (failed.length) {
  console.error("failed:\n" + failed.join("\n"));
  process.exit(1);
}
