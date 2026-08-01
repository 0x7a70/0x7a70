export function profilePotatoAscii(level: number, seed: string, rootLabel?: string) {
  const body = `               .---.
            .-' .-. '-.
           /   /   \\   \\
           \\   \\   /   /
            '._ '-' _.'
               \\|/
          ___..-|-..___
       .-'   .     .   '-.
      /  .               .\\
     /      [o]     [o]    \\
    |   .         ^       . |
    |          ._____.       |
    |  ..      '-----'    .  |
    |       .          ..    |
    | .          .           |
     \\    ..          .     /
      \\       .    ..      /
       '._ .          . _.'`;
  const base = rootLabel ? `${body}\n          '--${rootLabel}--'` : body;
  if (level === 0) return base;

  const noise = ["+", "/", "\\", "#", "0", "?", ":", "_"];
  const seedValue = [...seed].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 17);
  return base
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
}
