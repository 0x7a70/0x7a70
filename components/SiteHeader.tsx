import Image from "next/image";
import Link from "next/link";
import { TELEGRAM_BOT_URL, TELEGRAM_GROUP_URL, TOKEN_URL, X_URL } from "@/lib/constants";

export function SiteHeader() {
  return (
    <header className="site-header">
      <nav aria-label="Site and external links">
        <div className="header-left-links">
          <details className="header-menu">
            <summary aria-label="open patch navigation">[ patch menu ]</summary>
            <div className="header-menu-panel">
              <a className="header-menu-link header-menu-contract" href={TOKEN_URL} target="_blank" rel="noreferrer">
                <span>ca</span>
                <code>0x7A701D2cA3274fA1a3BED634D5e9Fcd8E041693f</code>
              </a>
              <Link className="header-menu-link" href="/hobbies">hobbies</Link>
              <Link className="header-menu-link" href="/works">works</Link>
              <Link className="header-menu-link" href="/launches">launches</Link>
              <Link className="header-menu-link" href="/launch">launch with 0x7a70bot</Link>
            </div>
          </details>
        </div>
        <a className="header-bot-link" href={TELEGRAM_BOT_URL} target="_blank" rel="noreferrer">
          0x7a70bot
        </a>
        <a className="header-telegram-icon" href={TELEGRAM_GROUP_URL} target="_blank" rel="noreferrer" aria-label="Join the 0x7a70 Telegram group">
          <Image src="/telegram.png?v=20260731a" width={36} height={36} alt="" />
        </a>
        <a className="header-x-icon" href={X_URL} target="_blank" rel="noreferrer" aria-label="0x7a70 on X">
          <Image src="/x.png?v=20260730b" width={32} height={32} alt="" />
        </a>
        <a className="header-potato-icon" href={TOKEN_URL} target="_blank" rel="noreferrer" aria-label="0x7a70 token">
          <Image src="/potatoicon.png?v=20260730c" width={42} height={42} alt="" />
        </a>
      </nav>
    </header>
  );
}
