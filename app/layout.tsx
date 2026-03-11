import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BetOnMe",
  description: "Stake real money on your habits",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "BetOnMe" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
