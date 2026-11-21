import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { MobileBar, Rail } from "@/components/shell";
import { themeScript } from "@/components/theme";
import { SourceProvider } from "@/components/source-drawer";
import { CommandPalette } from "@/components/command-palette";
import { loadPipeline } from "@/lib/data/pipeline";
import { admin } from "@/lib/db/admin";
import { ACTION } from "@/components/ui";
import { currentUser } from "@/lib/google/session";
import { googleConfigured, mailboxEmail } from "@/lib/google/client";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = { title: "All In Capital · Triage", description: "Inbound application triage for All In Capital" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [rows, user, gmail, limits] = await Promise.all([
    loadPipeline().catch(() => []), currentUser(), mailboxEmail().catch(() => null),
    admin().from("cost_limits").select("paused_at").eq("id", 1).maybeSingle().then((r) => r.data, () => null),
  ]);
  const account = { user: user?.email ?? null, gmail, configured: googleConfigured() };
  const items = [
    { label: "Pipeline", href: "/", hint: "screen" },
    { label: "Calibration", href: "/calibration", hint: "screen" },
    { label: "Corrections", href: "/corrections", hint: "screen" },
    { label: "Portfolio", href: "/portfolio", hint: "screen" },
    { label: "Settings", href: "/settings", hint: "screen" },
    ...rows.map((r) => ({ label: r.company, hint: r.action ? ACTION[r.action].label : r.status, href: `/applications/${r.id}` })),
  ];
  return (
    <html lang="en-IN" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-canvas text-ink">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-[6px] focus:bg-canvas focus:px-3 focus:py-2 elev-2">
          Skip to content
        </a>
        <SourceProvider>
          <div className="flex">
            <Rail account={account} />
            <div className="min-w-0 flex-1">
              <MobileBar account={account} />
              {limits?.paused_at && (
                <div role="alert" className="border-b border-hairline bg-amber-bg px-4 py-2 text-[13px] text-amber md:px-6">
                  The queue is paused: today’s spend passed the daily limit. <a href="/ops" className="font-medium underline">Review on Cost &amp; ops</a>
                </div>
              )}
              <main id="main" className="mx-auto max-w-[1440px] px-4 py-5 md:px-6 md:py-6">
                {children}
              </main>
            </div>
          </div>
          <CommandPalette items={items} />
        </SourceProvider>
      </body>
    </html>
  );
}
