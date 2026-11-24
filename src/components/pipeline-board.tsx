"use client";
// Pipeline as a working dashboard: dense rows grouped by lane, one line of judgement per company, words instead
// of scores. Compact lane filters, "/" to search, j/k to move, Enter to open. The full sortable table is one click away.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PipelineRow } from "@/lib/data/pipeline";
import { callFor, callKind, ratingWord, takeFor } from "@/lib/take";
import { PipelineTable } from "./pipeline-table";
import { Reveal } from "./motion/reveal";
import { Badge, GATE_NAMES, cx, sectorName } from "./ui";

// Riya's three decisions (src/lib/take.ts callKind): a clear yes, her call in the gray area, a clear no
const LANES = [
  { key: "yes", title: "Yes", hint: "Meets the bar: give it 30 minutes" },
  { key: "your_call", title: "Your call", hint: "Gray area: the AI shows which way it leans" },
  { key: "no", title: "No", hint: "Clearly short of the bar: don't spend time on it" },
] as const;
type Lane = (typeof LANES)[number]["key"];

const laneOf = (r: PipelineRow): Lane | null => {
  const k = callKind({ action: r.action, bucket: r.bucket, total: r.total });
  return k === "reading" ? null : k;
};

// colour only where it carries meaning: good, caution, bad. Middling stays neutral.
const TONE = { green: "text-green", neutral: "text-ink-muted", amber: "text-amber", red: "text-red" } as const;

export function Meter({ score }: { score: number | null }) {
  const r = ratingWord(score);
  const on = score == null ? 0 : Math.max(1, Math.round(score / 2));
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium", TONE[r.tone])} title={score == null ? undefined : `${score.toFixed(1)} / 10`}>
      <span className="meter" aria-hidden>{[1, 2, 3, 4, 5].map((i) => <i key={i} data-on={i <= on ? "" : undefined} />)}</span>
      {r.word}
    </span>
  );
}

function Row({ r, refCb }: { r: PipelineRow; refCb: (el: HTMLAnchorElement | null) => void }) {
  const t = takeFor(r);
  const busy = r.status === "queued" || r.status === "processing";
  return (
    <Link
      ref={refCb}
      href={`/applications/${r.id}`}
      aria-label={`${r.company}, ${sectorName(r.sector ?? r.sector_label)}. ${busy ? "Still being read" : r.status === "needs_attention" ? "Needs a look" : `${t.line || t.verdict} Rated ${ratingWord(r.total).word.toLowerCase()}.${r.gates.length ? ` Gates: ${r.gates.map((g) => GATE_NAMES[g]).join(", ")}.` : ""}`}`}
      data-row
      className="grid grid-cols-1 gap-x-5 gap-y-1.5 px-5 py-4 transition-colors duration-150 hover:bg-surface-1 focus-visible:bg-surface-1 md:grid-cols-[280px_1fr_auto] md:items-center"
    >
      <div className="min-w-0">
        <p className="truncate font-display text-[22px] leading-[1.1]">{r.company}</p>
        <p className="mt-0.5 truncate text-[12px] text-ink-subtle">{sectorName(r.sector ?? r.sector_label)} · {r.one_liner}</p>
      </div>
      <div className="min-w-0 text-[13px]">
        {busy ? (
          <span className="text-ink-muted">Still reading this one…</span>
        ) : r.status === "needs_attention" ? (
          <span className="text-amber">Needs a look: {r.status_reason}</span>
        ) : (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-ink">{t.line || t.verdict}</span>
            {(() => {
              const c = callFor({ ...r, total: r.total });
              return c.lean ? <Badge tone={c.lean === "yes" ? "green" : "amber"}>Leans {c.lean}</Badge> : null;
            })()}
            {r.gates.map((g) => <Badge key={g} tone="red">{GATE_NAMES[g]}</Badge>)}
            {r.source === "warm_intro" && <Badge>Warm intro</Badge>}
          </span>
        )}
      </div>
      <div className="md:justify-self-end">{!busy && r.status !== "needs_attention" && <Meter score={r.total} />}</div>
    </Link>
  );
}

export function PipelineBoard({ rows }: { rows: PipelineRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [view, setView] = useState<"lanes" | "table">("lanes");
  const [only, setOnly] = useState<Lane | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);

  const searched = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? rows.filter((r) => `${r.company} ${r.one_liner ?? ""} ${r.sector ?? ""}`.toLowerCase().includes(s)) : rows;
  }, [rows, q]);
  const shown = only ? searched.filter((r) => laneOf(r) === only) : searched;
  const unsorted = only ? [] : shown.filter((r) => !laneOf(r));
  const ordered = [...LANES.filter((l) => !only || l.key === only).flatMap((l) => shown.filter((r) => laneOf(r) === l.key)), ...unsorted];

  // live run status: refresh while anything is still being read
  const live = rows.some((r) => r.status === "queued" || r.status === "processing");
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [live, router]);

  // "/" to search, j/k to move between rows (Enter opens the focused row natively)
  useEffect(() => {
    if (view !== "lanes") return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        search.current?.focus();
        return;
      }
      if (e.key === "Escape" && e.target === search.current) return search.current?.blur();
      if (typing || e.metaKey || e.ctrlKey || e.altKey || (e.key !== "j" && e.key !== "k")) return;
      e.preventDefault();
      const list = links.current.filter(Boolean) as HTMLAnchorElement[];
      const i = list.indexOf(document.activeElement as HTMLAnchorElement);
      list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + (e.key === "j" ? 1 : -1)))]?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  links.current = [];
  const refCb = (el: HTMLAnchorElement | null) => { if (el) links.current.push(el); };

  return (
    <div>
      <div role="group" aria-label="Filter by lane" className="mb-4 grid grid-cols-3 gap-3">
        {LANES.map((l) => {
          const n = searched.filter((r) => laneOf(r) === l.key).length;
          const on = only === l.key;
          return (
            <button key={l.key} type="button" aria-pressed={on} title={l.hint} onClick={() => setOnly(on ? null : l.key)}
              className={cx("press flex flex-col items-start rounded-[16px] px-4 py-3.5 text-left", on ? "bg-solid text-on-solid shadow-[0_16px_34px_-20px_rgb(30_26_21/0.7)]" : "bg-canvas shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-surface-1")}>
              <span className={cx("text-[12px]", on ? "text-solid-muted" : "text-ink-subtle")}>{l.title}</span>
              <span className="num font-display text-[36px] leading-[1.05]">{n}</span>
            </button>
          );
        })}
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-ink-subtle" aria-live="polite">
          {only ? <>Showing {LANES.find((l) => l.key === only)?.title.toLowerCase()} · <button type="button" onClick={() => setOnly(null)} className="press font-medium text-primary">show all {searched.length}</button></> : `All ${searched.length} applications`}
        </p>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <label className="relative min-w-0 flex-1 sm:flex-none">
            <span className="sr-only">Search applications</span>
            <input ref={search} data-search value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies   /"
              className="h-10 w-full rounded-full bg-canvas px-4 text-[13px] shadow-[inset_0_0_0_1px_var(--hairline)] focus:shadow-[0_0_0_2px_var(--primary)] focus:outline-none sm:w-[240px]" />
          </label>
          <div role="group" aria-label="Layout" className="flex rounded-full bg-canvas p-1 shadow-[inset_0_0_0_1px_var(--hairline)]">
            {(["lanes", "table"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                className={cx("press h-8 rounded-full px-3.5 text-[12px] capitalize", view === v ? "bg-solid font-medium text-on-solid" : "text-ink-subtle hover:text-ink")}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === "table" ? (
        <PipelineTable rows={shown} />
      ) : ordered.length === 0 ? (
        <div className="tray"><div className="tray-in px-4 py-10 text-center">
          <p className="font-display text-[22px]">Nothing matches{q ? ` “${q}”` : ""}</p>
          <button type="button" onClick={() => { setQ(""); setOnly(null); }} className="press mt-2 text-[13px] font-medium text-primary">Clear filters</button>
        </div></div>
      ) : (
        <Reveal className="space-y-5">
          {LANES.filter((l) => !only || l.key === only).map((lane) => {
            const items = shown.filter((r) => laneOf(r) === lane.key);
            return (
              <section key={lane.key} aria-labelledby={`lane-${lane.key}`} data-reveal className="tray">
                <div className="tray-in overflow-hidden">
                  <header className={cx("flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-5 py-3.5", items.length > 0 && "border-b border-hairline")}>
                    <h2 id={`lane-${lane.key}`} className="font-display text-[24px] font-normal leading-tight">{lane.title} <span className="num font-sans text-[13px] text-ink-subtle">{items.length}</span></h2>
                    <span className="text-[12px] text-ink-subtle">{items.length ? lane.hint : "Nothing here right now"}</span>
                  </header>
                  {items.length > 0 && <div className="divide-y divide-hairline">{items.map((r) => <Row key={r.id} r={r} refCb={refCb} />)}</div>}
                </div>
              </section>
            );
          })}
          {unsorted.length > 0 && (
            <section data-reveal aria-labelledby="lane-reading" className="tray">
              <div className="tray-in overflow-hidden">
                <header className="border-b border-hairline px-5 py-3.5"><h2 id="lane-reading" className="font-display text-[24px] font-normal">Still being read</h2></header>
                <div className="divide-y divide-hairline">{unsorted.map((r) => <Row key={r.id} r={r} refCb={refCb} />)}</div>
              </div>
            </section>
          )}
        </Reveal>
      )}
    </div>
  );
}
