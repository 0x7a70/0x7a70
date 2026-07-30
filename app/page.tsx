import Image from "next/image";
import Link from "next/link";

export default function EntrancePage() {
  const potatoImages = ["potato1", "potato2", "potato3", "potato4"];
  const ghosts = Array.from({ length: 42 }, (_, index) => ({
    image: potatoImages[(index * 3 + Math.floor(index / 5)) % potatoImages.length],
    left: 2 + (index % 7) * 15 + ((index * 7) % 9) - 4,
    top: 1 + Math.floor(index / 7) * 18 + ((index * 11) % 9) - 4,
    width: 68 + ((index * 41) % 190),
    rotation: ((index * 29) % 54) - 27,
    scale: 0.5 + ((index * 17) % 62) / 100,
    delay: -((index * 3.17) % 24),
    duration: 7.5 + ((index * 4.73) % 17),
  }));

  return (
    <main className="entrance">
      <div className="entrance-potatoes" aria-hidden="true">
        {ghosts.map((ghost, index) => (
          <span
            className="entrance-potato"
            key={`${ghost.image}-${index}`}
            style={{
              left: `${ghost.left}%`,
              top: `${ghost.top}%`,
              width: `${ghost.width}px`,
              transform: `rotate(${ghost.rotation}deg) scale(${ghost.scale})`,
              animationDelay: `${ghost.delay}s`,
              animationDuration: `${ghost.duration}s`,
            }}
          >
            <Image src={`/${ghost.image}.png?v=20260730c`} alt="" fill sizes="280px" />
          </span>
        ))}
      </div>
      <Link className="enter-link" href="/patch">
        <span aria-hidden="true">[ </span>
        enter the potato patch
        <span aria-hidden="true"> ]</span>
      </Link>
    </main>
  );
}
