"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { TokenLaunch } from "@/lib/types";
import { RelativeTime } from "./RelativeTime";
import { SiteHeader } from "./SiteHeader";
import { useLaunchMarket } from "./useLaunchMarket";

const EXPLORER_TX = "https://robinhoodchain.blockscout.com/tx";

function formatEth(wei: string) {
  if (!/^\d+$/.test(wei) || wei === "0") return "none";
  const padded = wei.padStart(19, "0");
  const whole = padded.slice(0, -18);
  const fraction = padded.slice(-18).replace(/0+$/, "").slice(0, 8);
  return `${whole}${fraction ? `.${fraction}` : ""} eth`;
}

export function LaunchView({ tokenAddress }: { tokenAddress: string }) {
  const result = useQuery(api.queries.getLaunch, { tokenAddress });
  const markets = useLaunchMarket([tokenAddress]);
  const market = markets[tokenAddress.toLowerCase()];
  if (result === undefined) return <main className="detail-page"><SiteHeader /><p className="launches-status">following the contract root...</p></main>;
  if (result === null) return <main className="detail-page"><SiteHeader /><p className="launches-status">this launch has not surfaced.</p></main>;
  const launch = result as TokenLaunch;
  const potatoPadUrl = `https://potato.fm/token/${launch.tokenAddress}`;

  return (
    <main className="detail-page launch-record-page">
      <SiteHeader />
      <div className="detail-shell launch-record-shell">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/patch">patch</Link><span>/</span><Link href="/launches">launches</Link><span>/</span><span>{launch.name}</span>
        </nav>
        <section className="launch-record-hero">
          <div className="launch-record-image">
            <span className="frame-label">confirmed potatoPad seed</span>
            {launch.imageUri
              ? <Image src={launch.imageUri} width={900} height={900} sizes="(max-width: 800px) 94vw, 42vw" alt={`${launch.name} token artwork`} priority />
              : <div className="launch-image-empty" aria-label="launch has no image">[ no image planted ]</div>}
          </div>
          <div className="launch-record-copy">
            <p className="eyebrow">planted through 0x7a70 // <RelativeTime timestamp={launch.createdAt} /></p>
            <h1>{launch.name}</h1>
            <p className="launch-record-symbol">${launch.symbol}</p>
            {launch.launcherUsername && <p className="launch-record-creator">launched by <a href={`https://x.com/${launch.launcherUsername}`} target="_blank" rel="noreferrer">@{launch.launcherUsername}</a></p>}
            <p className="launch-record-description">{launch.description || "a token planted through the 0x7a70 root system and surfaced through PotatoPad."}</p>
            <dl className="launch-record-data">
              <div><dt>market cap</dt><dd>{market?.marketCapEth ? `${market.marketCapEth.toLocaleString("en-US", { maximumFractionDigits: 3 })} eth` : "gathering from the curve..."}</dd></div>
              {market?.lastBuyAt && <div><dt>last buy</dt><dd><RelativeTime timestamp={market.lastBuyAt} /></dd></div>}
              <div><dt>contract</dt><dd><code>{launch.tokenAddress}</code></dd></div>
              {launch.poolAddress && <div><dt>curve pool</dt><dd><code>{launch.poolAddress}</code></dd></div>}
              {launch.positionId && <div><dt>position</dt><dd>{launch.positionId}</dd></div>}
              <div><dt>dev buy</dt><dd>{formatEth(launch.devBuyWei)}{launch.devBuyWei !== "0" ? ` // ${launch.devBuySucceeded ? "confirmed" : "not confirmed"}` : ""}</dd></div>
            </dl>
            <div className="launch-record-actions">
              <a className="launch-potatopad-button" href={potatoPadUrl} target="_blank" rel="noreferrer">see on PotatoPad</a>
              <a href={`${EXPLORER_TX}/${launch.transactionHash}`} target="_blank" rel="noreferrer">view transaction</a>
              {launch.website && <a href={launch.website} target="_blank" rel="noreferrer">website</a>}
              {launch.twitter && <a href={launch.twitter} target="_blank" rel="noreferrer">x</a>}
              {launch.telegram && <a href={launch.telegram} target="_blank" rel="noreferrer">telegram</a>}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
