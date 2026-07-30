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

const source = `// Generated from the canonical source documents by scripts/generate-content.mjs.\n` +
  `export const PERSONALITIES: Record<string, string> = ${JSON.stringify(personalities, null, 2)};\n\n` +
  `export const THOUGHT_PROMPT = ${JSON.stringify(thoughtPrompt)};\n\n` +
  `export const TERMINAL_PROMPT = ${JSON.stringify(terminalPrompt)};\n`;

fs.writeFileSync(path.join(root, "convex", "generatedContent.ts"), source);
