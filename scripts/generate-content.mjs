import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const repair = (value) => value
  .replaceAll("â€™", "’")
  .replaceAll("â€œ", "“")
  .replaceAll("â€", "”")
  .replaceAll("â€“", "–")
  .replaceAll("naÃ¯ve", "naïve");

const personalityDir = path.join(root, "content", "personalities");
const personalities = Object.fromEntries(
  fs.readdirSync(personalityDir)
    .filter((file) => file.endsWith(".txt"))
    .map((file) => {
      const name = path.basename(file, ".txt");
      const raw = repair(fs.readFileSync(path.join(personalityDir, file), "utf8"));
      const internal = raw
        .split("EXTERNAL-FACING DESCRIPTION")[0]
        .replace(/INTERNAL DESCRIPTION\s*=+/m, "")
        .trim();
      return [name, internal];
    }),
);

const thoughtPrompt = repair(fs.readFileSync(path.join(root, "content", "prompts", "potato thought.txt"), "utf8")).trim();
const terminalPrompt = repair(fs.readFileSync(path.join(root, "content", "prompts", "user interaction.txt"), "utf8")).trim();
const xPostPrompt = repair(fs.readFileSync(path.join(root, "content", "prompts", "x posting.txt"), "utf8")).trim();
const workPrompt = repair(fs.readFileSync(path.join(root, "content", "prompts", "potato work.txt"), "utf8")).trim();

const decodeTemplateArt = (value) => value.replaceAll("\\\\", "\\");
const wordJoiner = "\u2060";
const enSpace = "\u2002";
const formatForSocial = (art) => art
  .split("\n")
  .map((line, index) => {
    const leading = line.match(/^ */)?.[0].length || 0;
    const opticalLeading = enSpace.repeat(Math.round(leading * 0.6));
    const body = line.slice(leading).replaceAll(" ", enSpace);
    return `${index === 0 ? wordJoiner : ""}${opticalLeading}${body}`;
  })
  .join("\n");

const potatoAsciiSource = fs.readFileSync(path.join(root, "lib", "potatoAscii.ts"), "utf8");
const potatoTemplate = potatoAsciiSource.match(/const body = `([\s\S]*?)`;/)?.[1];
if (!potatoTemplate) throw new Error("Could not locate profile potato ASCII");
const potatoBase = `${decodeTemplateArt(potatoTemplate)}\n          '--root_01--'`;

const corruptPotato = (level) => {
  if (level === 0) return potatoBase;
  const noise = ["+", "/", "\\", "#", "0", "?", ":", "_"];
  const seedValue = [..."0x7a70"].reduce(
    (total, character) => (total * 31 + character.charCodeAt(0)) >>> 0,
    17,
  );
  return potatoBase
    .split("\n")
    .map((line, lineIndex) => {
      const shift = level >= 3 && (seedValue + lineIndex * 11) % 10 < level - 2
        ? ((seedValue + lineIndex) % 3) - 1
        : 0;
      let output = shift > 0 ? " ".repeat(shift) + line : shift < 0 ? line.slice(1) : line;
      output = [...output].map((character, characterIndex) => {
        if (character === " ") return character;
        const signal = (seedValue + lineIndex * 43 + characterIndex * 19) % 100;
        if (signal < level * 1.25) return " ";
        if (signal < level * 3.6) return noise[(signal + level + lineIndex) % noise.length];
        return character;
      }).join("");
      if (level >= 6 && (seedValue + lineIndex * 7) % 13 < level - 5) {
        output += ` ${noise[(lineIndex + level) % noise.length]}${level}`;
      }
      return output;
    })
    .join("\n");
};

const hobbyViewSource = fs.readFileSync(path.join(root, "components", "HobbyView.tsx"), "utf8");
const hobbyObject = hobbyViewSource.match(/const HOBBY_ASCII:[\s\S]*?= \{([\s\S]*?)\n\};/)?.[1];
if (!hobbyObject) throw new Error("Could not locate hobby ASCII");
const hobbyArt = [...hobbyObject.matchAll(/\s*(?:"([^"]+)"|([a-z][a-z-]*)):\s*`([\s\S]*?)`,/g)]
  .map((match) => ({ id: `hobby-${match[1] || match[2]}`, text: formatForSocial(decodeTemplateArt(match[3])) }))
  .filter((art) => art.id !== "hobby-despair");
if (hobbyArt.length !== 20) throw new Error(`Expected 20 hobby ASCII pieces, found ${hobbyArt.length}`);

const xAsciiArt = [
  ...Array.from({ length: 10 }, (_, level) => ({ id: `potato-${level}`, text: formatForSocial(corruptPotato(level)) })),
  ...hobbyArt,
];

const source = `// Generated from the canonical source documents by scripts/generate-content.mjs.\n` +
  `export const PERSONALITIES: Record<string, string> = ${JSON.stringify(personalities, null, 2)};\n\n` +
  `export const THOUGHT_PROMPT = ${JSON.stringify(thoughtPrompt)};\n\n` +
  `export const TERMINAL_PROMPT = ${JSON.stringify(terminalPrompt)};\n\n` +
  `export const X_POST_PROMPT = ${JSON.stringify(xPostPrompt)};\n\n` +
  `export const WORK_PROMPT = ${JSON.stringify(workPrompt)};\n\n` +
  `export const X_ASCII_ART: ReadonlyArray<{ id: string; text: string }> = ${JSON.stringify(xAsciiArt, null, 2)};\n`;

fs.writeFileSync(path.join(root, "convex", "generatedContent.ts"), source);
