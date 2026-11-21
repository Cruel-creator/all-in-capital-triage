"use client";
// Pipeline as an opinionated board: four lanes, one line of judgement per company, words instead of scores.
// The full sortable table stays one click away ("List").
import Link from "next/link";
import { useMemo, useState } from "react";
import type { PipelineRow } from "@/lib/data/pipeline";
import { ratingWord, takeFor } from "@/lib/take";
import { PipelineTable } from "./pipeline-table";
import { SpotlightCard } from "./bits/spotlight-card";
import { Reveal } from "./motion/reveal";
import { Badge, GATE_NAMES, cx, sectorName } from "./ui";

const LANES = [
  { key: "call", title: "Worth a call", hint: "Strong enough to spend 30 minutes on." },
  { key: "kushal", title: "Kushal should see", hint: "A gate tripped. His call, not ours." },
  { key: "dig", title: "Dig first", hint: "Something's there; one or two answers decide it." },
  { key: "pass", title: "Not now", hint: "Kind no, with what would change our mind." },
] as const;
type Lane = (typeof LANES)[number]["key"];

const laneOf = (r: PipelineRow): Lane | null =>
  r.bucket === "flagged" || r.bucket === "outside_mandate" ? "kushal" : r.action === "take_call" ? "call" : r.action === "dig" ? "dig" : r.action === "pass" ? "pass" : null;

const TONE = { green: "text-green", neutral: "text-primary", amber: "text-amber", red: "text-red" } as const;

export function Meter({ score }: { score: number | null }) {
  const r = ratingWord(score);
  const on = score == null ? 0 : Math.max(1, Math.round(score / 2));
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-[12px] font-medium", TONE[r.tone])} title={score == null ? undefined : `${score.toFixed(1)} / 10`}>
      <span className="meter" aria-hidden>{[1, 2, 3, 4, 5].map((i) => <i key={i} data-on={i <= on ? "" : undefined} />)}</span>
      {r.word}
    </span>
  );
}

function Card({ r }: { r: PipelineRow }) {
  const t = takeFor(r);
  const busy = r.status === "queued" || r.status === "processing";
  return (
    <SpotlightCard data-reveal-scroll className="lift elev-1 rounded-[10px] bg-canvas">
      <Link href={`/applications/${r.id}`} className="block p-4 focus-visible:outline-2 focus-visible:outline-primary">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold tracking-[-0.2px]">{r.company}</h3>
            <p className="mt-0.5 line-clamp-1 text-[12px] text-ink-subtle">{r.one_liner}</p>
          </div>
          <Badge className="shrink-0">{sectorName(r.sector ?? r.sector_label)}</Badge>
        </div>
        {busy ? (
          <p className="mt-3 text-[13px] text-ink-muted">Still reading this one…</p>
        ) : r.status === "needs_attention" ? (
          <p className="mt-3 text-[13px] text-amber">Needs a look: {r.status_reason}</p>
        ) : (
          <>
            <p className="mt-3 text-[13px] leading-snug text-ink">{t.line || t.verdict}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <Meter score={r.total} />
              <span className="flex flex-wrap gap-1">
                {r.gates.map((g) => <Badge key={g} tone="red">{GATE_NAMES[g]}</Badge>)}
                {r.source === "warm_intro" && <Badge>Warm intro</Badge>}
              </span>
            </div>
          </>
        )}
      </Link>
    </SpotlightCard>
  );
}

export function PipelineBoard({ rows }: { rows: PipelineRow[] }) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<"board" | "list">("board");
  const [only, setOnly] = useState<Lane | null>(null);
  const searched = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? rows.filter((r) => `${r.company} ${r.one_liner ?? ""} ${r.sector ?? ""}`.toLowerCase().includes(s)) : rows;
  }, [rows, q]);
  const shown = only ? searched.filter((r) => laneOf(r) === only) : searched;
  const unsorted = only ? [] : shown.filter((r) => !laneOf(r));

  return (
    <div>
      <div role="group" aria-label="Filter by lane" className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {LANES.map((l) => {
          const n = searched.filter((r) => laneOf(r) === l.key).length;
          const on = only === l.key;
          return (
            <button key={l.key} type="button" aria-pressed={on} onClick={() => setOnly(on ? null : l.key)}
              className={cx("press lift flex flex-col justify-start rounded-[10px] bg-canvas p-3.5 text-left", on ? "shadow-[0_0_0_2px_var(--primary)]" : "elev-1")}>
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold">{l.title}</span>
                <span className="num text-[18px] font-semibold tracking-[-0.3px]">{n}</span>
              </span>
              <span className="mt-1 block text-[12px] leading-snug text-ink-subtle">{l.hint}</span>
            </button>
          );
        })}
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <label className="relative w-full max-w-[320px]">
          <span className="sr-only">Search applications</span>
          <input data-search value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies…"
            className="h-9 w-full rounded-[8px] bg-canvas px-3 text-[13px] shadow-[0_0_0_1px_var(--hairline)] focus:shadow-[0_0_0_2px_var(--primary)] focus:outline-none" />
        </label>
        <div role="group" aria-label="Layout" className="flex rounded-[8px] bg-surface-1 p-0.5 shadow-[0_0_0_1px_var(--hairline)]">
          {(["board", "list"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
              className={cx("press h-8 rounded-[6px] px-3 text-[12px] capitalize", view === v ? "bg-canvas font-medium text-ink shadow-[0_0_0_1px_var(--hairline)]" : "text-ink-subtle hover:text-ink")}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "list" ? (
        <PipelineTable rows={shown} />
      ) : (
        <Reveal className="space-y-8">
          {LANES.filter((l) => !only || l.key === only).map((lane) => {
            const items = shown.filter((r) => laneOf(r) === lane.key);
            return (
              <section key={lane.key} aria-labelledby={`lane-${lane.key}`} data-reveal>
                <header className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <h2 id={`lane-${lane.key}`} className="text-[14px] font-semibold">{lane.title}</h2>
                  <span className="text-[12px] text-ink-subtle">{items.length ? lane.hint : `Nothing here${q ? " for this search" : " right now"}.`}</span>
                </header>
                {items.length > 0 && <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">{items.map((r) => <Card key={r.id} r={r} />)}</div>}
              </section>
            );
          })}
          {unsorted.length > 0 && (
            <section data-reveal aria-labelledby="lane-reading">
              <h2 id="lane-reading" className="mb-2.5 text-[14px] font-semibold">Still being read</h2>
              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">{unsorted.map((r) => <Card key={r.id} r={r} />)}</div>
            </section>
          )}
        </Reveal>
      )}
    </div>
  );
}
