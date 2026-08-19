import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DEFAULT_THEME, THEME_BOOT_SCRIPT } from "../lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Board",
  description:
    "Self-hosted board for you and your AI agents. Data stays on this server.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME}>
      <head>
        {/*
          OCL-56: the theme, before the first paint. The document ships with
          the default on it and this script corrects it from the cookie while
          the browser is still parsing <head>, so a person who chose xai never
          sees nebula flash past on the way in. It is inline on purpose: an
          external file would be a network round trip in front of the paint,
          which is the flash it exists to prevent.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}
