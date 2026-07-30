import Link from "next/link";

function hash(value: string) {
  return [...value].reduce((total, character) => (total * 33 + character.charCodeAt(0)) >>> 0, 5381);
}

function distort(text: string, level: number, seed: string) {
  if (level === 0) return text;
  const sourceSeed = hash(seed);
  const substitutions: Record<string, string> = {
    a: "4", b: "8", e: "3", g: "9", i: "1", l: "|", o: "0", s: "5", t: "7",
  };
  let output = "";
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const signal = (sourceSeed + index * 17) % 97;
    if (level >= 3 && /[aeiou]/i.test(character) && signal < 16) continue;
    if (level >= 3 && /\s/.test(character) && signal < 9) {
      output += signal % 2 ? "_" : " / ";
    } else if (/[a-z]/i.test(character) && signal < level * 5) {
      output += substitutions[character.toLowerCase()] || character;
    } else if (level >= 2 && /[,.]/.test(character) && signal < 62) {
      output += signal % 2 ? " //" : " ::";
    } else {
      output += character;
    }
    if (level >= 2 && signal === 41) output += level === 3 ? " [lost] " : " ~";
    if (level >= 3 && signal === 63) output += " <<repeat>> ";
  }
  return output;
}

const SIGNALS = [
  "----- root signal drift -----",
  "//// carrier split // memory offset +03 ////",
  "[packet lost] .... [packet found elsewhere]",
  "000101 / root/root / 111000 / do not parse",
  "<< soil channel repeats repeats repeats >>",
  "######## signal overgrowth ########",
  "line displaced +++++ source uncertain",
  "[null]_[null]_[voice beneath voice]",
];

export function CorruptedDescription({
  text, level, secretWord, nextHref, potatoSlug,
}: {
  text: string;
  level: number;
  secretWord?: string;
  nextHref?: string;
  potatoSlug: string;
}) {
  let linked = false;
  const linkHref = secretWord && nextHref ? nextHref : null;
  const matcher = secretWord && linkHref ? new RegExp(`\\b${secretWord}\\b`, "i") : null;
  const paragraphs = text.split(/\n+/);

  return (
    <div className={`description corrupted-description text-corruption-${level}`}>
      {paragraphs.map((paragraph, paragraphIndex) => {
        const match = !linked && matcher ? paragraph.match(matcher) : null;
        let content: React.ReactNode;
        if (match?.index !== undefined && linkHref) {
          linked = true;
          const before = paragraph.slice(0, match.index);
          const word = paragraph.slice(match.index, match.index + match[0].length);
          const after = paragraph.slice(match.index + match[0].length);
          content = (
            <>
              {distort(before, level, `${potatoSlug}-${paragraphIndex}-before`)}
              <Link className="buried-link" href={linkHref}>{word}</Link>
              {distort(after, level, `${potatoSlug}-${paragraphIndex}-after`)}
            </>
          );
        } else {
          content = distort(paragraph, level, `${potatoSlug}-${paragraphIndex}`);
        }

        return (
          <div className={`description-block corruption-block-${(hash(`${potatoSlug}-${paragraphIndex}`) % 4) + 1}`} key={paragraphIndex}>
            {level >= 2 && (
              <span className="corruption-prefix" aria-hidden="true">
                {`[${(hash(potatoSlug + paragraphIndex) % 9999).toString().padStart(4, "0")}::${level === 3 ? "breach" : "drift"}]`}
              </span>
            )}
            <p>{content}</p>
            {level >= 1 && (
              <p className="green-corruption-line" aria-hidden="true">
                {SIGNALS[(hash(`${potatoSlug}-signal-${paragraphIndex}`) + level) % SIGNALS.length]}
              </p>
            )}
            {level >= 3 && (
              <>
                <p className="corruption-echo" aria-hidden="true">
                  {distort(paragraph.slice(0, 55), 3, `${potatoSlug}-echo-${paragraphIndex}`)}
                </p>
                <p className="green-corruption-line hard-break" aria-hidden="true">
                  {SIGNALS[(hash(`${potatoSlug}-break-${paragraphIndex}`) + 3) % SIGNALS.length]}
                </p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
