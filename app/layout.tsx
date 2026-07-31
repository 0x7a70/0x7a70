import type { Metadata } from "next";
import "./globals.css";
import { PatchProvider } from "@/components/PatchProvider";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://0x7a70.wiki"),
  title: { default: "0x7a70 // potato patch", template: "%s // 0x7a70" },
  description: "Twenty signals growing beneath the soil. The corruption has reached the roots.",
  icons: { icon: "/favicon.png?v=20260731a", apple: "/faviconlarge.png?v=20260731a" },
  openGraph: {
    title: "enter the potato patch",
    description: "Twenty signals growing beneath the soil.",
    type: "website",
    url: "/",
    images: [{
      url: "/potato1.png",
      alt: "0x7a70 potato",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "enter the potato patch",
    description: "Twenty signals growing beneath the soil.",
    images: ["/potato1.png"],
  },
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
