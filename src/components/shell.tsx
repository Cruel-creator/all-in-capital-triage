"use client";
// App shell: the sidebar on desktop, and on phones a top bar whose menu opens the same navigation in a sheet.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ThemeToggle } from "./theme";
import { cx } from "./ui";

const NAV: { href: string; label: string; soon?: boolean }[] = [
  { href: "/", label: "Pipeline" },
  { href: "/calibration", label: "Calibration" },
  { href: "/corrections", label: "Corrections" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/settings", label: "Settings" },
];

export type Account = { user: string | null; gmail: string | null; configured: boolean };

function AccountBox({ a }: { a: Account }) {
  if (!a.configured) return <p className="px-2 text-[12px] text-ink-subtle">Google sign-in isn’t set up yet.</p>;
  if (!a.user)
    return (
      <a href="/api/google/connect" className="press hit flex h-8 items-center rounded-full px-2 text-[13px] font-medium text-primary hover:bg-surface-2">
        {a.gmail ? "Sign in with Google" : "Connect Gmail"}
      </a>
    );
  return (
    <div className="px-2 text-[12px] text-ink-subtle">
      <p className="truncate" title={a.user}>Signed in as <span className="text-ink-muted">{a.user}</span></p>
      {a.gmail && a.gmail !== a.user && <p className="truncate" title={a.gmail}>Sending from {a.gmail}</p>}
      {!a.gmail && <a href="/api/google/connect" className="press hit block font-medium text-primary">Connect Gmail to send emails</a>}
      <form method="post" action="/api/google/signout"><button type="submit" className="press hit font-medium text-primary">Sign out</button></form>
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <ul className="flex flex-col gap-0.5">
      {NAV.map((n) => {
        const active = n.href === "/" ? path === "/" || path.startsWith("/applications") : path.startsWith(n.href);
        if (n.soon)
          return (
            <li key={n.href}>
              <span className="flex h-10 items-center justify-between rounded-[10px] px-3 text-[14px] text-ink-subtle md:h-9">
                {n.label}
                <span className="text-[11px]">Coming soon</span>
              </span>
            </li>
          );
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cx("press hit flex h-10 items-center rounded-[10px] px-3 text-[14px] md:h-9", active ? "bg-solid font-medium text-on-solid" : "text-ink-muted hover:bg-surface-2 hover:text-ink")}
            >
              {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const Logo = () => (
  <span aria-hidden className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-solid font-display text-[18px] text-solid-muted">A</span>
);

export function Rail({ account }: { account: Account }) {
  return (
    <nav aria-label="Main" className="sticky top-0 hidden h-dvh w-[244px] shrink-0 flex-col gap-5 px-4 py-6 md:flex">
      <Link href="/" className="flex items-center gap-2.5 px-1 font-display text-[23px] leading-none tracking-[-0.2px] text-ink">
        <Logo />
        All In Capital
      </Link>
      <div className="tray"><div className="tray-in p-1.5"><NavList /></div></div>
      <div className="mt-auto flex flex-col gap-2">
        <AccountBox a={account} />
        <ThemeToggle />
      </div>
    </nav>
  );
}

export function MobileBar({ account }: { account: Account }) {
  const sheet = useRef<HTMLDialogElement>(null);
  const path = usePathname();
  useEffect(() => sheet.current?.close(), [path]); // close after navigating
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-hairline bg-page/95 px-4 backdrop-blur md:hidden">
      <Link href="/" className="flex items-center gap-2.5 font-display text-[21px] leading-none"><Logo />All In Capital</Link>
      <button type="button" onClick={() => sheet.current?.showModal()} aria-label="Open menu" aria-haspopup="dialog"
        className="press flex h-10 w-10 items-center justify-center rounded-full text-ink-muted hover:bg-surface-1">
        <svg aria-hidden width="18" height="18" viewBox="0 0 18 18"><path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      </button>
      <dialog ref={sheet} aria-label="Menu" onClick={(e) => e.target === sheet.current && sheet.current?.close()}
        className="m-0 ml-auto h-dvh max-h-none w-[290px] max-w-[85vw] bg-page p-0 text-ink backdrop:bg-black/30">
        <div className="flex h-full flex-col gap-4 px-3 py-4">
          <div className="flex items-center justify-between px-2">
            <span className="font-display text-[22px]">Menu</span>
            <button type="button" onClick={() => sheet.current?.close()} aria-label="Close menu" className="press flex h-10 w-10 items-center justify-center rounded-full text-ink-muted hover:bg-surface-2">
              <svg aria-hidden width="16" height="16" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
          </div>
          <div className="tray"><div className="tray-in p-1.5"><NavList onNavigate={() => sheet.current?.close()} /></div></div>
          <div className="mt-auto flex flex-col gap-2">
            <AccountBox a={account} />
            <ThemeToggle />
          </div>
        </div>
      </dialog>
    </header>
  );
}
