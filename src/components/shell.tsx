"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme";
import { cx } from "./ui";

const NAV: { href: string; label: string; phase?: number }[] = [
  { href: "/", label: "Pipeline" },
  { href: "/calibration", label: "Calibration", phase: 4 },
  { href: "/corrections", label: "Corrections", phase: 4 },
  { href: "/portfolio", label: "Portfolio", phase: 4 },
  { href: "/ops", label: "Cost & ops", phase: 5 },
  { href: "/settings", label: "Settings", phase: 4 },
];

export function Rail() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="sticky top-0 hidden h-dvh w-[220px] shrink-0 flex-col border-r border-hairline bg-surface-1 px-3 py-4 md:flex">
      <Link href="/" className="mb-5 flex items-center gap-2 px-2 text-[14px] font-semibold tracking-[-0.2px] text-ink">
        <svg aria-hidden width="16" height="16" viewBox="0 0 16 16">
          <path d="M8 1.5 14.5 8 8 14.5 1.5 8z" fill="none" stroke="var(--primary)" strokeWidth="1.6" />
        </svg>
        All In Capital
      </Link>
      <ul className="flex flex-col gap-0.5">
        {NAV.map((n) => {
          const active = n.href === "/" ? path === "/" || path.startsWith("/applications") : path.startsWith(n.href);
          if (n.phase)
            return (
              <li key={n.href}>
                <span className="flex h-8 items-center justify-between rounded-[6px] px-2 text-[13px] text-ink-subtle" title={`Arrives in Phase ${n.phase}`}>
                  {n.label}
                  <span className="text-[11px]">Phase {n.phase}</span>
                </span>
              </li>
            );
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cx("press hit flex h-8 items-center rounded-[6px] px-2 text-[13px]", active ? "bg-surface-3 font-medium text-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink")}
              >
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto flex flex-col gap-1">
        <p className="px-2 text-[12px] text-ink-subtle">
          <kbd className="font-mono">⌘K</kbd> to jump · <kbd className="font-mono">/</kbd> to search
        </p>
        <ThemeToggle />
      </div>
    </nav>
  );
}

export function MobileBar() {
  return (
    <header className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-hairline bg-canvas px-4 md:hidden">
      <Link href="/" className="text-[14px] font-semibold">
        All In Capital
      </Link>
      <div className="w-36">
        <ThemeToggle />
      </div>
    </header>
  );
}
