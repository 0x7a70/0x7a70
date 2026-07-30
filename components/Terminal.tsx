"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import type { TerminalResponse, TerminalTurn } from "@/lib/types";

const MAX_HISTORY_WORDS = 2000;

function historyKey(slug: string) {
  return `patch-terminal:${slug}`;
}

function trimHistory(turns: TerminalTurn[]) {
  const kept: TerminalTurn[] = [];
  let words = 0;
  for (const turn of [...turns].reverse()) {
    const count = turn.text.trim().split(/\s+/).length;
    if (words + count > MAX_HISTORY_WORDS) break;
    kept.unshift(turn);
    words += count;
  }
  return kept;
}

function getSessionId() {
  const key = "patch-session-id";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(key, created);
  return created;
}

export function Terminal({
  potatoSlug,
  potatoName,
  headerControl,
  className = "",
}: {
  potatoSlug: string;
  potatoName: string;
  headerControl?: ReactNode;
  className?: string;
}) {
  const [turns, setTurns] = useState<TerminalTurn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(historyKey(potatoSlug));
      setTurns(saved ? JSON.parse(saved) : []);
    } catch {
      sessionStorage.removeItem(historyKey(potatoSlug));
    }
  }, [potatoSlug]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, pending]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || pending) return;
    setInput("");
    setNotice("");
    const nextTurns = trimHistory([...turns, { role: "user", text: message }]);
    setTurns(nextTurns);
    setPending(true);
    try {
      const response = await fetch("/api/terminal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          potatoSlug,
          message,
          sessionId: getSessionId(),
          conversation: nextTurns.slice(0, -1),
        }),
      });
      const payload = await response.json() as TerminalResponse & { error?: string };
      if (!response.ok) {
        setNotice(payload.error || "the channel refused the transmission.");
        return;
      }
      const completed = trimHistory([...nextTurns, { role: "potato", text: payload.reply }]);
      setTurns(completed);
      sessionStorage.setItem(historyKey(potatoSlug), JSON.stringify(completed));
      if (payload.fallback) setNotice("signal recovered from a damaged relay.");
    } catch {
      setNotice("the underground relay is not answering.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={`terminal-panel ${className}`.trim()} aria-labelledby={`terminal-heading-${potatoSlug}`}>
      <div className="terminal-title">
        <h2 id={`terminal-heading-${potatoSlug}`}>terminal::{potatoSlug}</h2>
        {headerControl}
      </div>
      <div className="terminal-output" ref={scrollRef} aria-live="polite">
        <p className="system-line">connection established. speak carefully.</p>
        {turns.map((turn, index) => (
          <p className={`terminal-turn ${turn.role}`} key={`${index}-${turn.text}`}>
            <span>{turn.role === "user" ? "you" : potatoName}&gt;</span> {turn.text}
          </p>
        ))}
        {pending && <p className="terminal-wait">roots are carrying the message<span>...</span></p>}
      </div>
      {notice && <p className="terminal-notice">{notice}</p>}
      <form className="terminal-form" onSubmit={submit}>
        <label htmlFor={`terminal-${potatoSlug}`} className="sr-only">Message {potatoName}</label>
        <span aria-hidden="true">&gt;</span>
        <input
          id={`terminal-${potatoSlug}`}
          maxLength={2000}
          autoComplete="off"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={`transmit to ${potatoName}...`}
          disabled={pending}
        />
        <button disabled={pending || !input.trim()} type="submit">send</button>
      </form>
    </section>
  );
}
