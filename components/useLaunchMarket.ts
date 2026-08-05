"use client";

import { useEffect, useMemo, useState } from "react";

export type LaunchMarket = { marketCapEth?: number; lastBuyAt?: number };

export function useLaunchMarket(addresses: string[]) {
  const key = useMemo(() => [...new Set(addresses.map((address) => address.toLowerCase()))].sort().join(","), [addresses]);
  const [markets, setMarkets] = useState<Record<string, LaunchMarket>>({});

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    fetch(`/api/launch-market?tokens=${encodeURIComponent(key)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : { markets: {} })
      .then((payload) => setMarkets(payload.markets || {}))
      .catch((error) => { if (error.name !== "AbortError") setMarkets({}); });
    return () => controller.abort();
  }, [key]);

  return markets;
}
