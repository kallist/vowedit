import type { Metadata } from "next";
import { LocaleProvider } from "@/frontend/i18n/LocaleProvider";
import { SiteHeader, SiteFooter } from "@/frontend/SiteChrome";
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
        <LocaleProvider>
          <SiteHeader />
          {children}
          <SiteFooter />
        </LocaleProvider>
      </body>
    </html>
  );
}
