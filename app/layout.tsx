import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { THEME_BOOTSTRAP } from "@/lib/theme";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Two readable typefaces only (ui-standards §13). Inter carries body, UI, and
// numbers; Plus Jakarta Sans gives headings a distinct but friendly voice.
// No monospace — numbers stay aligned via `tabular-nums`, not a terminal font.
const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

export const metadata: Metadata = {
  title: "APMG Services — Lead Generation",
  description:
    "Live lead-generation telemetry for APMG Services: volume, conversion, and cost per lead at a glance.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${heading.variable} dark`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply persisted/default-dark theme before paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
