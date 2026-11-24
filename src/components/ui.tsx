// Small presentational primitives from DESIGN.md. Status colour is always paired with a word.
import type { ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Tone = "neutral" | "red" | "amber" | "green" | "primary";
const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-muted",
  red: "bg-red-bg text-red",
  amber: "bg-amber-bg text-amber",
  green: "bg-green-bg text-green",
  primary: "bg-surface-2 text-primary",
};

export function Badge({ tone = "neutral", children, title, className }: { tone?: Tone; children: ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={cx("inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-[4px] px-1.5 text-[12px] font-medium leading-none", TONE[tone], className)}>
      {children}
    </span>
  );
}

export const GATE_NAMES: Record<string, string> = { G1: "Stage / cheque", G2: "Regulatory risk", G3: "Portfolio conflict", G4: "Integrity" };
export const ACTION: Record<string, { label: string; tone: Tone }> = {
  take_call: { label: "Take the call", tone: "green" },
  dig: { label: "Dig first", tone: "amber" },
  pass: { label: "Pass", tone: "neutral" },
};
export const BUCKET: Record<string, string> = { clear: "Clear", flagged: "Flagged · check first", outside_mandate: "Outside mandate" };
export const FIT: Record<string, { label: string; tone: Tone }> = {
  in: { label: "In thesis", tone: "neutral" },
  stretch: { label: "Stretch", tone: "amber" },
  outside: { label: "Outside thesis", tone: "red" },
};
export const CONF: Record<string, { label: string; tone: Tone }> = {
  high: { label: "High", tone: "green" },
  med: { label: "Med", tone: "neutral" },
  low: { label: "Low", tone: "amber" },
};

export function GateIcon() {
  return (
    <svg aria-hidden width="10" height="10" viewBox="0 0 10 10">
      <path d="M5 1 9.2 8.5H.8z" fill="currentColor" />
    </svg>
  );
}

export function GateBadge({ gate, title }: { gate: string; title?: string }) {
  return (
    <Badge tone="red" title={title ?? GATE_NAMES[gate]}>
      <GateIcon />
      {gate}
      <span className="sr-only"> {GATE_NAMES[gate]} tripped</span>
    </Badge>
  );
}

const CRITS = ["C1", "C2", "C3", "C4", "C5", "C6"] as const;
export const CRIT_NAMES: Record<string, string> = {
  C1: "Founder-market fit", C2: "Risk ownership", C3: "Customer pull", C4: "Numbers fluency", C5: "Pre-seed fit", C6: "Why now / copy",
};

/** Score breakdown: segment width = weight after lens, fill = score/10. Never a lone number (DESIGN.md). */
export function ScoreBar({ crit, weights, size = "sm" }: { crit: Record<string, number>; weights: Record<string, number> | null; size?: "sm" | "lg" }) {
  if (!weights) return <div className="h-1.5 w-full rounded-full bg-surface-2" aria-hidden />;
  const label = CRITS.map((c) => `${c} ${CRIT_NAMES[c]} ${crit[c]?.toFixed(1) ?? "n/a"}, weight ${Math.round(weights[c] * 100)}%`).join("; ");
  return (
    <div role="img" aria-label={`Score breakdown: ${label}`} className={cx("flex w-full gap-[2px]", size === "lg" ? "h-2" : "h-1.5")}>
      {CRITS.map((c) => (
        <div key={c} className="relative overflow-hidden rounded-[2px] bg-surface-3" style={{ width: `${weights[c] * 100}%` }} title={`${c} ${CRIT_NAMES[c]}: ${crit[c]?.toFixed(1) ?? "n/a"}`}>
          <div className="absolute inset-y-0 left-0 bg-ink-muted" style={{ width: `${((crit[c] ?? 0) / 10) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

export function Score({ value, className }: { value: number | null; className?: string }) {
  return <span className={cx("num font-semibold", className)}>{value === null ? "–" : value.toFixed(1)}</span>;
}

export function Panel({ title, children, className, right, bare }: { title: string; children: ReactNode; className?: string; right?: ReactNode; bare?: boolean }) {
  if (bare)
    return (
      <div className={className} aria-label={title}>
        {right && <div className="mb-2 flex justify-end">{right}</div>}
        {children}
      </div>
    );
  return (
    <section className={cx("elev-1 rounded-[20px] bg-canvas", className)} aria-label={title}>
      <header className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
        <h2 className="font-display text-[22px] font-normal leading-tight text-ink">{title}</h2>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

const SECTOR: Record<string, string> = {
  "b2b saas": "B2B SaaS", "consumer brand": "Consumer brand", "consumer tech": "Consumer tech", "lending fintech": "Lending fintech",
  fintech: "Fintech", deeptech: "Deeptech", healthcare: "Healthcare", web3: "Web3", other: "Other",
};
export const sectorName = (s: string | null | undefined) => (s ? SECTOR[s.toLowerCase()] ?? s : "–");

export const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
