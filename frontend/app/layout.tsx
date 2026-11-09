import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Cosmos } from "@/components/Cosmos";

export const metadata: Metadata = {
  title: "ODYSSEY",
  description: "A mission through real NASA data, powered by RAG: Apollo 13, Mars, exoplanets, a planet lab and a knowledge graph.",
};

export const viewport: Viewport = { themeColor: "#070b1f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800;900&family=Exo+2:wght@500;600;700&family=Barlow:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body>
        <Cosmos />
        {children}
      </body>
    </html>
  );
}
