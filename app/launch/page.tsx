import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { X_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "launch with 0x7a70bot",
  description: "clear instructions for planting a token through PotatoPad with 0x7a70bot.",
};

const EXAMPLE = '@0x7a70 plant "moss potato" ticker MOSS with a $5 dev buy';

export default function LaunchPage() {
  return (
    <main className="detail-page launch-page">
      <SiteHeader />
      <div className="detail-shell launch-shell">
        <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/patch">patch</Link><span>/</span><span>launch with 0x7a70bot</span></nav>
        <header className="launch-heading">
          <p className="eyebrow">plant carefully // the soil remembers every transaction</p>
          <h1>launch with 0x7a70bot</h1>
          <p>
            ask <a href={X_URL} target="_blank" rel="noreferrer">0x7a70 on x</a> to plant a token for you.
            launches grow through <a href="https://potato.fm" target="_blank" rel="noreferrer">PotatoPad</a> on robinhood chain.
          </p>
        </header>

        <div className="launch-grid">
          <section className="launch-panel launch-steps">
            <div className="panel-title"><h2>how to plant</h2><span>six small furrows</span></div>
            <ol>
              <li><strong>ask for your wallet.</strong><span>mention @0x7a70 directly on x and ask for your wallet address. this creates or retrieves the robinhood chain wallet linked to your x account.</span></li>
              <li><strong>fund the root.</strong><span>send robinhood chain eth to the address 0x7a70 gives you. eth is needed for network gas and any optional dev buy. do not send it on another network.</span></li>
              <li><strong>call the potato.</strong><span>mention @0x7a70 again and clearly ask it to launch or plant a token.</span></li>
              <li><strong>name the seed.</strong><span>include a token name and ticker. attach the image you want the token to use.</span></li>
              <li><strong>choose the first watering.</strong><span>a dev buy is optional. state the amount in usd or robinhood chain eth if you want one.</span></li>
              <li><strong>wait for the root receipt.</strong><span>after a successful launch, the bot replies with the contract address and a transaction link.</span></li>
            </ol>
          </section>

          <aside className="launch-panel launch-command" aria-label="example launch request">
            <div className="panel-title"><h2>example transmission</h2><span>plain language works</span></div>
            <pre><code>{EXAMPLE}</code></pre>
            <p>the bot reads the direct message you send it. keep the name, ticker, amount, and instructions in that one post.</p>
          </aside>
        </div>

        <div className="launch-grid launch-details-grid">
          <section className="launch-panel">
            <div className="panel-title"><h2>what you need</h2><span>before planting</span></div>
            <ul className="launch-list">
              <li>a verified x account with launch access</li>
              <li>a token name and ticker</li>
              <li>one image attached directly to the x post</li>
              <li>your wallet address, requested directly from @0x7a70</li>
              <li>robinhood chain eth sent to that address for network fees and any dev buy</li>
            </ul>
          </section>

          <section className="launch-panel">
            <div className="panel-title"><h2>optional details</h2><span>more markings for the seed</span></div>
            <ul className="launch-list">
              <li>a short description</li>
              <li>a website link</li>
              <li>an x link</li>
              <li>a telegram link</li>
              <li>a dev buy stated in usd or eth</li>
              <li>an automatically derived contract address beginning with 0x7a70</li>
            </ul>
          </section>
        </div>

        <section className="launch-panel launch-wallet-note">
          <div className="panel-title"><h2>your root wallet</h2><span>bound to your x account</span></div>
          <p>
            first, ask 0x7a70bot to show your wallet address. the bot creates or retrieves the unique robinhood chain wallet
            linked to your x account. send robinhood chain eth to that address before requesting a launch. the eth pays
            network gas and funds any optional dev buy.
            the system tries to leave a small amount of eth behind for the next network fee.
          </p>
          <p>
            never send the bot a seed phrase or private key. it will never ask for either. blockchain actions are permanent,
            so read names, tickers, addresses, links, and amounts twice before you plant.
          </p>
        </section>

        <p className="launch-access-note">
          launches are available to verified x accounts. if a request cannot be completed, the bot replies with what needs attention.
          the bot searches for an unused contract address beginning with 0x7a70. no contract is created unless the transaction succeeds.
        </p>
      </div>
    </main>
  );
}
