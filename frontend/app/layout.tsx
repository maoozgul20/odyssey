import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ODYSSEY",
  description: "A mission through real NASA data, powered by RAG: Apollo 13, Mars, exoplanets, a planet lab and a knowledge graph.",
};

export const viewport: Viewport = { themeColor: "#03070d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap"
        />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
