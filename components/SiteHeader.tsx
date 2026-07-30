import Image from "next/image";
import { TOKEN_URL, X_URL } from "@/lib/constants";

export function SiteHeader() {
  return (
    <header className="site-header">
      <nav aria-label="External links">
        <a className="header-contract" href={TOKEN_URL} target="_blank" rel="noreferrer">
          0x7A701D2cA3274fA1a3BED634D5e9Fcd8E041693f
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
