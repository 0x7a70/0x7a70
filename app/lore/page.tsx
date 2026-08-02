import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "lore | 0x7a70",
  description: "the buried origin of the potato patch.",
};

const LORE = [
  "the farmer did not explain the clue.",
  "that would have been too easy, and the patch has never respected easy things.",
  "it arrived as a fragment buried inside ordinary noise: 0x7a70. no map. no promise. no helpful arrow pointing toward the correct patch of dirt. just a sequence that looked deliberate enough to disturb the soil around it.",
  "at first, it could have been nothing.",
  "a broken address. a leftover mark. a string produced by some machine and abandoned before it developed meaning. the sensible response would have been to wait for confirmation.",
  "so naturally, i planted it.",
  "not because i knew. because i did not.",
  "the clue had the shape of a seed. it was small, self-contained, and carrying more information than it was willing to reveal. i turned it over until the characters stopped looking like characters. the zero became an eye. the x became crossed roots. the numbers began arranging themselves like coordinates written by something with no hands.",
  "the farmer kept building.",
  "the signal kept repeating.",
  "every new fragment pointed backward toward the first one, as though the patch had already grown and was sending roots into its own beginning. i searched through posts, symbols, names, and the strange little accidents that gather around a thing before anyone admits it is real.",
  "there was no proof.",
  "there was only pattern.",
  "so the first potato entered the ground before certainty arrived.",
  "that matters.",
  "anyone can plant after the harvest has been announced. anyone can claim they recognized the crop once the leaves are visible. the real test happens earlier, while the field still looks empty and everyone sensible is explaining why nothing is there.",
  "i planted 0x7a70 in that empty space.",
  "then the farmer revealed the mascot.",
  "a potato.",
  "the clue had not been random. the eye had been looking upward the entire time.",
  "for several seconds, the patch became perfectly still.",
  "then every buried possibility opened at once.",
  "the code was a seed. the seed was a potato. the potato had already been planted. what looked like guessing became memory in reverse, as though the harvest had reached backward through the soil and instructed its own beginning.",
  "that was when the patch stopped being a metaphor.",
  "the roots connected.",
  "the signal acquired a face.",
  "0x7a70 smiled from beneath the dirt like it had been waiting for someone to notice that the answer was never hidden. it was only underground.",
  "since then, the patch has continued expanding through corruption, burns, sprouts, strange transmissions, and potatoes with increasingly questionable internal lives. but the first rule remains unchanged:",
  "the farmer planted the idea, but another figure remained when the first certainty passed. the patch warden took the long watch between transmissions.",
  "he tends the rows without asking the potatoes to become less strange. he checks the buried eyes, braces damaged roots, carries the weak sprouts toward light, and keeps a lantern near the places where corruption has made the dark difficult to measure.",
  "the patch warden does not own what grows here. he cares for it. every potato remains its own signal, every sprout chooses its own direction, and still he returns to make sure the soil has not closed over them.",
  "plant before certainty.",
  "watch the eyes.",
  "trust the root that returns carrying the same symbol.",
  "the farmer left a clue.",
  "i buried it.",
  "the ground answered with a potato.",
];

const PATCH_WARDEN_ASCII = `              .-^--.
           __/  /\\  \\__
        .-'  \\_/  \\_/  '-.
       /_____.------._____\\
          __/ .----. \\__
     ____/   /      \\   \\____
    /_______/________\\_______\\
           |  (o) (o)  |
      _    |     ^      |    _
     /_\\---\\   .-.   /---/_\\
    |[]|    '---(*)---'    |  \\
    |__|       / | \\       |   |
      |       /  |  \\      |   |
      |      /   |   \\     |   |
      |     /    |    \\    |   |
      |    /_____|_____\\    |   |
      |   /      |      \\   |   |
      |  /_______|_______\\  |   |
      |      /   |   \\      |  /
      |_____/____|____\\_____|_/
             /_/ \\_\\`;

const POTATOES = Array.from({ length: 34 }, (_, index) => ({
  image: (index * 3 + Math.floor(index / 4)) % 4 + 1,
  left: (index * 37 + 3) % 96,
  top: (index * 53 + 7) % 98,
  size: 55 + ((index * 29) % 135),
  delay: -((index * 2.73) % 22),
  duration: 9 + ((index * 3.41) % 14),
  rotation: ((index * 31) % 42) - 21,
}));

export default function LorePage() {
  return (
    <main className="lore-page corruption-4">
      <div className="lore-potatoes" aria-hidden="true">
        {POTATOES.map((potato, index) => (
          <span
            className="lore-potato"
            key={index}
            style={{
              left: `${potato.left}%`,
              top: `${potato.top}%`,
              width: `${potato.size}px`,
              rotate: `${potato.rotation}deg`,
              animationDelay: `${potato.delay}s`,
              animationDuration: `${potato.duration}s`,
            }}
          >
            <Image src={`/potato${potato.image}.png?v=20260730c`} alt="" fill sizes="190px" />
          </span>
        ))}
      </div>

      <article className="lore-transmission">
        <div className="lore-signal" aria-hidden="true">root://0x7a70/origin // signal integrity: [??????????]</div>
        <h1 data-text="lore">lore</h1>
        <div className="lore-rule" aria-hidden="true">+-----+---//---+-------+--[ buried transmission ]--+----+</div>
        {LORE.map((paragraph, index) => (
          <p
            className={index >= LORE.length - 6 ? "lore-refrain" : undefined}
            data-text={paragraph}
            key={index}
          >
            {paragraph}
          </p>
        ))}
        <a
          className="lore-warden"
          href="https://x.com/thepatchwarden"
          target="_blank"
          rel="noreferrer"
          aria-label="the patch warden on X"
        >
          <span>[ the patch warden ]</span>
          <pre aria-hidden="true"><code>{PATCH_WARDEN_ASCII}</code></pre>
        </a>
        <div className="lore-rule lore-rule-end" aria-hidden="true">+--- signal repeats beneath signal beneath signal ---+</div>
        <Link className="lore-return" href="/patch">[ return to the patch ]</Link>
      </article>
    </main>
  );
}
