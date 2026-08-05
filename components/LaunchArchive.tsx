"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { TokenLaunch } from "@/lib/types";
import { RelativeTime } from "./RelativeTime";
import { useMemo, useState } from "react";
import { useLaunchMarket } from "./useLaunchMarket";

const potatoPadUrl = (address: string) => `https://potato.fm/token/${address}`;

function shortAddress(address: string) {
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

export function LaunchArchive() {
  const result = useQuery(api.queries.listLaunches);
  const [sort, setSort] = useState<"newest" | "oldest" | "market-cap" | "last-buy">("newest");
  const rawLaunches = useMemo(() => (result || []) as TokenLaunch[], [result]);
  const markets = useLaunchMarket(rawLaunches.map((launch) => launch.tokenAddress));
  const launches = useMemo(() => [...rawLaunches].sort((left, right) => {
    if (sort === "oldest") return left.createdAt - right.createdAt;
    if (sort === "market-cap") return (markets[right.tokenAddress.toLowerCase()]?.marketCapEth ?? -1) - (markets[left.tokenAddress.toLowerCase()]?.marketCapEth ?? -1);
    if (sort === "last-buy") return (markets[right.tokenAddress.toLowerCase()]?.lastBuyAt ?? -1) - (markets[left.tokenAddress.toLowerCase()]?.lastBuyAt ?? -1);
    return right.createdAt - left.createdAt;
  }), [rawLaunches, markets, sort]);
  if (result === undefined) return <p className="launches-status">reading the launch furrows...</p>;

  return (
    <section className="launches-archive" aria-labelledby="launches-list-heading">
      <div className="panel-title launches-heading"><h2 id="launches-list-heading">confirmed launches</h2><span>{launches.length} planted</span><label>sort by <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="newest">newest</option><option value="oldest">oldest</option><option value="market-cap">highest mcap</option><option value="last-buy">last buy</option></select></label></div>
      {launches.length ? (
        <div className="launches-grid">
          {launches.map((launch) => {
            const market = markets[launch.tokenAddress.toLowerCase()];
            return (
            <article className="launch-card" key={launch.tokenAddress}>
              <Link className="launch-card-image" href={`/launches/${launch.tokenAddress}`} aria-label={`view ${launch.name}`}>
                <Image src={launch.imageUri} width={600} height={600} sizes="(max-width: 700px) 90vw, 28vw" alt={`${launch.name} token artwork`} />
              </Link>
              <div className="launch-card-copy">
                <p className="launch-card-time"><RelativeTime timestamp={launch.createdAt} /></p>
                <h2><Link href={`/launches/${launch.tokenAddress}`}>{launch.name}</Link> <span>${launch.symbol}</span></h2>
                {launch.launcherUsername && <p className="launch-card-creator">launched by <a href={`https://x.com/${launch.launcherUsername}`} target="_blank" rel="noreferrer">@{launch.launcherUsername}</a></p>}
                <p className="launch-card-description">{launch.description || "a token planted through 0x7a70 and PotatoPad."}</p>
                <p className="launch-card-market">mcap <strong>{market?.marketCapEth ? `${market.marketCapEth.toLocaleString("en-US", { maximumFractionDigits: 3 })} eth` : "gathering..."}</strong>{market?.lastBuyAt ? <>{" // last buy "}<RelativeTime timestamp={market.lastBuyAt} /></> : ""}</p>
                <code title={launch.tokenAddress}>{shortAddress(launch.tokenAddress)}</code>
                <div className="launch-card-actions">
                  <Link href={`/launches/${launch.tokenAddress}`}>details</Link>
                  <a href={potatoPadUrl(launch.tokenAddress)} target="_blank" rel="noreferrer">see on PotatoPad</a>
                </div>
              </div>
            </article>
          )})}
        </div>
      ) : <p className="launches-status">no confirmed launches have broken the surface yet.</p>}
    </section>
  );
}
