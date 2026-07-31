import type { Metadata } from "next";
import "./globals.css";
import { PatchProvider } from "@/components/PatchProvider";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://0x7a70.vercel.app"),
  title: { default: "0x7a70 // potato patch", template: "%s // 0x7a70" },
  description: "Twenty signals growing beneath the soil. The corruption has reached the roots.",
  icons: { icon: "/favicon.png?v=20260731a", apple: "/faviconlarge.png?v=20260731a" },
  openGraph: {
    title: "enter the potato patch",
    description: "Twenty signals growing beneath the soil.",
    type: "website",
  },
  twitter: { card: "summary", title: "enter the potato patch" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PatchProvider>{children}</PatchProvider>
      </body>
    </html>
  );
}
