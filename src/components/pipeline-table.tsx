"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PipelineRow } from "@/lib/data/pipeline";
import { ACTION, BUCKET, Badge, FIT, GateBadge, GATE_NAMES, ScoreBar, Score, cx, fmtDate, sectorName } from "./ui";

type Filter = { q: string; action: "all" | "take_call" | "dig" | "pass"; gatesOnly: boolean };
type View = { name: string; filter: Filter };
const EMPTY: Filter = { q: "", action: "all", gatesOnly: false };
const VIEWS_KEY = "pipeline.views";

const STATUS: Record<string, string> = { queued: "Queued", processing: "Processing", scored: "Scored", needs_attention: "Needs attention" };

export function PipelineTable({ rows }: { rows: PipelineRow[] }) {
  const router = useRouter();
  const [f, setF] = useState<Filter>(EMPTY);
  const [views, setViews] = useState<View[]>([]);
  const [active, setActive] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);

  useEffect(() => {
    try {
      setViews(JSON.parse(localStorage.getItem(VIEWS_KEY) ?? "[]"));
    } catch {}
  }, []);
  const saveViews = (v: View[]) => {
    setViews(v);
    try {
      localStorage.setItem(VIEWS_KEY, JSON.stringify(v));
    } catch {}
  };

  const shown = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!f.q || `${r.company} ${r.one_liner ?? ""} ${r.sector ?? ""}`.toLowerCase().includes(f.q.toLowerCase())) &&
          (f.action === "all" || r.action === f.action) &&
          (!f.gatesOnly || r.gates.length > 0),
      ),
    [rows, f],
  );

  // live run status: refresh while anything is queued or processing
  const live = rows.some((r) => r.status === "queued" || r.status === "processing");
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [live, router]);

  // j/k to move, Enter to open, / to search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        search.current?.focus();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        setActive((a) => {
          const n = Math.max(0, Math.min(shown.length - 1, a + (e.key === "j" ? 1 : -1)));
          links.current[n]?.focus();
          return n;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown.length]);

  const groups = (["clear", "flagged", "outside_mandate", null] as const)
    .map((b) => ({ b, rows: shown.filter((r) => r.bucket === b) }))
    .filter((g) => g.rows.length);
  let index = -1;

  if (!rows.length)
    return (
      <div className="elev-1 rounded-[20px] p-8 text-center">
        <p className="font-medium">Nothing in the pipeline yet</p>
        <p className="mt-1 text-ink-subtle">New applications appear here as soon as they’re submitted and processed.</p>
      </div>
    );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative flex-1 basis-56">
          <span className="sr-only">Search applications</span>
          <input
            ref={search}
            value={f.q}
            onChange={(e) => setF({ ...f, q: e.target.value })}
            placeholder="Search company, sector…  ( / )"
            className="h-9 w-full rounded-[10px] bg-surface-1 px-3 text-[13px] text-ink shadow-[0_0_0_1px_var(--hairline)] placeholder:text-ink-subtle"
          />
        </label>
        <div role="group" aria-label="Recommendation" className="flex rounded-[10px] bg-surface-1 p-0.5 shadow-[0_0_0_1px_var(--hairline)]">
          {(["all", "take_call", "dig", "pass"] as const).map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={f.action === a}
              onClick={() => setF({ ...f, action: a })}
              className={cx("press h-8 rounded-[4px] px-2.5 text-[13px]", f.action === a ? "bg-canvas font-medium text-ink shadow-[0_0_0_1px_var(--hairline)]" : "text-ink-subtle hover:text-ink")}
            >
              {a === "all" ? "All" : ACTION[a].label}
            </button>
          ))}
        </div>
        <div className="flex h-9 items-center gap-2 rounded-[10px] px-2 text-[13px] text-ink-muted">
          <input id="gates-only" type="checkbox" checked={f.gatesOnly} onChange={(e) => setF({ ...f, gatesOnly: e.target.checked })} className="size-4 accent-[var(--primary)]" />
          <label htmlFor="gates-only">Gate tripped only</label>
        </div>
        <button
          type="button"
          onClick={() => {
            const name = window.prompt("Name this view", f.q || (f.action !== "all" ? ACTION[f.action].label : "My view"));
            if (name) saveViews([...views.filter((v) => v.name !== name), { name, filter: f }]);
          }}
          className="press h-9 rounded-full px-3 text-[13px] text-ink-muted shadow-[0_0_0_1px_var(--hairline)] hover:bg-surface-1 hover:text-ink"
        >
          Save view
        </button>
      </div>
      {views.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5" aria-label="Saved views">
          <span className="eyebrow mr-1">Views</span>
          {views.map((v) => (
            <span key={v.name} className="inline-flex items-center rounded-[4px] bg-surface-2">
              <button type="button" onClick={() => setF(v.filter)} className="press h-7 px-2 text-[12px] text-ink-muted hover:text-ink">{v.name}</button>
              <button type="button" aria-label={`Delete view ${v.name}`} onClick={() => saveViews(views.filter((x) => x.name !== v.name))} className="press h-7 px-1.5 text-[12px] text-ink-subtle hover:text-red">×</button>
            </span>
          ))}
        </div>
      )}

      {!shown.length ? (
        <div className="elev-1 rounded-[20px] p-8 text-center">
          <p className="font-medium">No applications match these filters</p>
          <button type="button" onClick={() => setF(EMPTY)} className="press mt-2 text-[13px] font-medium text-primary">Clear filters</button>
        </div>
      ) : (
        <div className="elev-1 overflow-hidden rounded-[16px]">
          <table className="w-full border-collapse text-left text-[13px]">
            <caption className="sr-only">Applications ranked by bucket, then score, then evidence coverage, then date received</caption>
            <thead className="bg-surface-1 text-ink-subtle">
              <tr className="h-9 border-b border-hairline">
                <th scope="col" className="px-4 font-medium">Company</th>
                <th scope="col" className="hidden px-3 font-medium lg:table-cell">Sector</th>
                <th scope="col" className="hidden w-[210px] px-3 font-medium sm:table-cell">Score</th>
                <th scope="col" className="hidden px-3 font-medium sm:table-cell">Recommendation</th>
                <th scope="col" className="hidden px-3 font-medium md:table-cell">Gates</th>
                <th scope="col" className="hidden px-3 text-right font-medium xl:table-cell">Evidence</th>
                <th scope="col" className="hidden px-3 font-medium xl:table-cell">Source</th>
                <th scope="col" className="hidden px-3 font-medium lg:table-cell">Received</th>
                <th scope="col" className="hidden px-4 font-medium md:table-cell">Status</th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.b ?? "unscored"}>
                <tr>
                  <th colSpan={9} scope="colgroup" className="sticky top-0 bg-canvas px-4 pb-1 pt-3 text-left">
                    <span className="eyebrow">{g.b ? BUCKET[g.b] : "Not yet ranked"}</span>
                    <span className="num ml-2 text-[11px] text-ink-subtle">{g.rows.length}</span>
                  </th>
                </tr>
                {g.rows.map((r) => {
                  index++;
                  const i = index;
                  return (
                    <tr key={r.id} className={cx("h-12 border-t border-hairline hover:bg-surface-1", active === i && "bg-surface-1")} onClick={() => router.push(`/applications/${r.id}`)}>
                      <td className="px-4 py-1.5">
                        <Link
                          ref={(el) => {
                            links.current[i] = el;
                          }}
                          href={`/applications/${r.id}`}
                          onFocus={() => setActive(i)}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-ink"
                        >
                          {r.company}
                        </Link>
                        <p className="max-w-[340px] truncate text-[12px] text-ink-subtle">{r.one_liner}</p>
                        <p className="num text-[12px] text-ink-subtle sm:hidden">
                          <span className="font-semibold text-ink">{r.total?.toFixed(1) ?? "–"}</span> · {r.action ? ACTION[r.action].label : STATUS[r.status]}
                          {r.gates.length ? ` · ${r.gates.join(" ")}` : ""}
                        </p>
                      </td>
                      <td className="hidden px-3 lg:table-cell">
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-ink-muted">{sectorName(r.sector ?? r.sector_label)}</span>
                          {r.written_fit && <Badge tone={FIT[r.written_fit].tone} title="Written thesis fit">{FIT[r.written_fit].label}</Badge>}
                        </div>
                      </td>
                      <td className="hidden px-3 sm:table-cell">
                        <div className="flex items-center gap-2">
                          <Score value={r.total} className="w-7 text-[14px]" />
                          <div className="min-w-[120px] flex-1"><ScoreBar crit={r.crit} weights={r.weights} /></div>
                        </div>
                      </td>
                      <td className="hidden px-3 sm:table-cell">{r.action ? <Badge tone={ACTION[r.action].tone}>{ACTION[r.action].label}</Badge> : <span className="text-ink-subtle">–</span>}</td>
                      <td className="hidden px-3 md:table-cell">
                        <div className="flex flex-wrap gap-1">{r.gates.length ? r.gates.map((x) => <GateBadge key={x} gate={x} />) : <span className="text-ink-subtle">None</span>}</div>
                      </td>
                      <td className="num hidden px-3 text-right text-ink-muted xl:table-cell">{r.coverage === null ? "–" : `${r.coverage}%`}</td>
                      <td className="hidden px-3 text-ink-muted xl:table-cell">{r.source === "warm_intro" ? "Warm intro" : "Form"}</td>
                      <td className="num hidden px-3 text-ink-muted lg:table-cell">{fmtDate(r.received_at)}</td>
                      <td className="hidden px-4 md:table-cell">
                        {r.status === "needs_attention" ? (
                          <Badge tone="amber" title={r.status_reason ?? undefined}>Needs attention</Badge>
                        ) : r.status === "processing" || r.status === "queued" ? (
                          <span className="inline-flex items-center gap-1.5 text-ink-muted">
                            <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
                            {STATUS[r.status]}{r.current_step ? ` · ${r.current_step.replace("_", " ")}` : ""}
                          </span>
                        ) : (
                          <span className="text-ink-subtle">{STATUS[r.status]}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
      <p className="mt-2 text-[12px] text-ink-subtle">
        <kbd className="font-mono">j</kbd>/<kbd className="font-mono">k</kbd> to move · <kbd className="font-mono">Enter</kbd> to open · gates: {Object.entries(GATE_NAMES).map(([k, v]) => `${k} ${v}`).join(", ")}
      </p>
    </div>
  );
}
