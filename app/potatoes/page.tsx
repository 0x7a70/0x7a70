import type { Metadata } from "next";
import { profilePotatoAscii } from "@/lib/potatoAscii";

export const metadata: Metadata = {
  title: "potato ascii capture",
  robots: { index: false, follow: false },
};

export default function PotatoAsciiCapturePage() {
  return (
    <main className="ascii-capture-page">
      <header className="ascii-capture-header">
        <h1>potato ascii capture</h1>
        <p>states 0–9 // no root labels // no color shift</p>
      </header>

      <section className="ascii-capture-list" aria-label="potato corruption states">
        {Array.from({ length: 10 }, (_, level) => (
          <article className="ascii-capture-entry" key={level}>
            <div className="ascii-capture-label">
              <strong>state {level}</strong>
              <span>{level * 10}–{level === 9 ? 100 : level * 10 + 9}% corruption</span>
            </div>
            <div className="ascii-capture-box">
              <pre>{profilePotatoAscii(level, "0x7a70")}</pre>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
