import type { Metadata } from "next";
import Link from "next/link";
import { Aperture, ArrowUpRight } from "lucide-react";
import "./globals.css";
export const metadata: Metadata = {
  title: "VowEdit — Change with intention.",
  description:
    "Change what you ask. Keep what you don’t. A constraint-aware image editing experiment.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="wordmark">
            <Aperture aria-hidden size={26} />
            VowEdit<span className="version">/ 0.1</span>
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/history">Your edits</Link>
            <Link href="/edit/new">
              Open studio <ArrowUpRight aria-hidden size={16} />
            </Link>
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <span>VowEdit — an experiment in intentional editing.</span>
          <span>CHANGE WITH CARE. KEEP WITH CONFIDENCE.</span>
        </footer>
      </body>
    </html>
  );
}
