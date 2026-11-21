"use client";
// Pipeline as a working dashboard: dense rows grouped by lane, one line of judgement per company, words instead
// of scores. Compact lane filters, "/" to search, j/k to move, Enter to open. The full sortable table is one click away.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PipelineRow } from "@/lib/data/pipeline";
import { ratingWord, takeFor } from "@/lib/take";
import { PipelineTable } from "./pipeline-table";
import { Reveal } from "./motion/reveal";
import { Badge, GATE_NAMES, cx, sectorName } from "./ui";

const LANES = [
  { key: "call", title: "Worth a call", hint: "Strong enough for 30 minutes" },
  { key: "kushal", title: "Kushal should see", hint: "A gate tripped: his call" },
  { key: "dig", title: "Dig first", hint: "One or two answers decide it" },
  { key: "pass", title: "Not now", hint: "Kind no, with what would change it" },
] as const;
type Lane = (typeof LANES)[number]["key"];

const laneOf = (r: PipelineRow): Lane | null =>
  r.bucket === "flagged" || r.bucket === "outside_mandate" ? "kushal" : r.action === "take_call" ? "call" : r.action === "dig" ? "dig" : r.action === "pass" ? "pass" : null;

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
      className="grid grid-cols-1 gap-x-4 gap-y-1 px-4 py-3 transition-colors duration-150 hover:bg-surface-1 focus-visible:bg-surface-1 md:grid-cols-[300px_1fr_auto] md:items-center"
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2">
          <span className="truncate text-[14px] font-semibold">{r.company}</span>
          <span className="shrink-0 text-[12px] text-ink-subtle">{sectorName(r.sector ?? r.sector_label)}</span>
        </p>
        <p className="truncate text-[12px] text-ink-subtle">{r.one_liner}</p>
      </div>
      <div className="min-w-0 text-[13px]">
        {busy ? (
          <span className="text-ink-muted">Still reading this one…</span>
        ) : r.status === "needs_attention" ? (
          <span className="text-amber">Needs a look: {r.status_reason}</span>
        ) : (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-ink">{t.line || t.verdict}</span>
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Filter by lane" className="flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={only === null} onClick={() => setOnly(null)}
            className={cx("press h-8 rounded-[6px] px-2.5 text-[12px]", only === null ? "bg-surface-3 font-medium text-ink" : "text-ink-muted shadow-[0_0_0_1px_var(--hairline)] hover:bg-surface-1")}>
            All <span className="num text-ink-subtle">{searched.length}</span>
          </button>
          {LANES.map((l) => {
            const n = searched.filter((r) => laneOf(r) === l.key).length;
            const on = only === l.key;
            return (
              <button key={l.key} type="button" aria-pressed={on} title={l.hint} onClick={() => setOnly(on ? null : l.key)}
                className={cx("press h-8 rounded-[6px] px-2.5 text-[12px]", on ? "bg-surface-3 font-medium text-ink" : "text-ink-muted shadow-[0_0_0_1px_var(--hairline)] hover:bg-surface-1")}>
                {l.title} <span className="num text-ink-subtle">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <label className="relative min-w-0 flex-1 sm:flex-none">
            <span className="sr-only">Search applications</span>
            <input ref={search} data-search value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search  /"
              className="h-8 w-full rounded-[6px] sm:w-[200px] bg-canvas px-3 text-[13px] shadow-[0_0_0_1px_var(--hairline)] focus:shadow-[0_0_0_2px_var(--primary)] focus:outline-none" />
          </label>
          <div role="group" aria-label="Layout" className="flex rounded-[6px] bg-surface-1 p-0.5 shadow-[0_0_0_1px_var(--hairline)]">
            {(["lanes", "table"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                className={cx("press h-7 rounded-[4px] px-2.5 text-[12px] capitalize", view === v ? "bg-canvas font-medium text-ink shadow-[0_0_0_1px_var(--hairline)]" : "text-ink-subtle hover:text-ink")}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === "table" ? (
        <PipelineTable rows={shown} />
      ) : ordered.length === 0 ? (
        <div className="elev-1 rounded-[8px] bg-canvas px-4 py-10 text-center">
          <p className="font-medium">Nothing matches{q ? ` “${q}”` : ""}</p>
          <button type="button" onClick={() => { setQ(""); setOnly(null); }} className="press mt-2 text-[13px] font-medium text-primary">Clear filters</button>
        </div>
      ) : (
        <Reveal className="space-y-4">
          {LANES.filter((l) => !only || l.key === only).map((lane) => {
            const items = shown.filter((r) => laneOf(r) === lane.key);
            return (
              <section key={lane.key} aria-labelledby={`lane-${lane.key}`} data-reveal className="elev-1 overflow-hidden rounded-[8px] bg-canvas">
                <header className="flex flex-wrap items-baseline gap-x-2 border-b border-hairline bg-surface-1 px-4 py-2">
                  <h2 id={`lane-${lane.key}`} className="text-[13px] font-semibold">{lane.title}</h2>
                  <span className="num text-[12px] text-ink-subtle">{items.length}</span>
                  <span className="text-[12px] text-ink-subtle">· {items.length ? lane.hint : "nothing here right now"}</span>
                </header>
                {items.length > 0 && <div className="divide-y divide-hairline">{items.map((r) => <Row key={r.id} r={r} refCb={refCb} />)}</div>}
              </section>
            );
          })}
          {unsorted.length > 0 && (
            <section data-reveal aria-labelledby="lane-reading" className="elev-1 overflow-hidden rounded-[8px] bg-canvas">
              <header className="border-b border-hairline bg-surface-1 px-4 py-2"><h2 id="lane-reading" className="text-[13px] font-semibold">Still being read</h2></header>
              <div className="divide-y divide-hairline">{unsorted.map((r) => <Row key={r.id} r={r} refCb={refCb} />)}</div>
            </section>
          )}
        </Reveal>
      )}
    </div>
  );
}
