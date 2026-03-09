import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BetOnMe",
  description: "Stake real money on your habits",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "BetOnMe" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
