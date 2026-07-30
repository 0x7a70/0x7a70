"use client";

import { useEffect, useState } from "react";

function format(timestamp: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function RelativeTime({ timestamp }: { timestamp: number }) {
  const [label, setLabel] = useState("now");
  useEffect(() => {
    const update = () => setLabel(format(timestamp));
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [timestamp]);
  return <time dateTime={new Date(timestamp).toISOString()}>{label}</time>;
}
