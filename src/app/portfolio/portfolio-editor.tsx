"use client";
// Inline editor for portfolio rows: edit one at a time, add new, save re-embeds for the conflict gate.
import { useState, useTransition } from "react";
import { savePortfolio, type PortfolioInput } from "./actions";
import { Badge, cx } from "@/components/ui";

export type PortfolioRow = { id: string; company: string; one_liner: string; sector: string | null; status: string; tags: string[]; source_url: string; source_note: string | null; updated_at: string };

const toInput = (r?: PortfolioRow): PortfolioInput => ({
  id: r?.id, company: r?.company ?? "", one_liner: r?.one_liner ?? "", sector: r?.sector ?? "", status: r?.status ?? "active",
  tags: (r?.tags ?? []).join(", "), source_url: r?.source_url ?? "", source_note: r?.source_note ?? "",
});

function Field({ label, value, onChange, wide, placeholder }: { label: string; value: string; onChange: (v: string) => void; wide?: boolean; placeholder?: string }) {
  return (
    <label className={cx("block", wide && "sm:col-span-2")}>
      <span className="text-[12px] text-ink-muted">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1 h-9 w-full rounded-[10px] bg-canvas px-3 text-[13px] shadow-[0_0_0_1px_var(--hairline)]" />
    </label>
  );
}

function Form({ initial, onDone }: { initial: PortfolioInput; onDone: () => void }) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof PortfolioInput) => (x: string) => setV({ ...v, [k]: x });
  return (
    <form className="grid gap-2.5 rounded-[16px] bg-surface-1 p-3 sm:grid-cols-2" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        setError(null);
        const r = await savePortfolio(v);
        if ("error" in r && r.error) setError(r.error);
        else onDone();
      });
    }}>
      <Field label="Company" value={v.company} onChange={set("company")} />
      <Field label="Sector" value={v.sector} onChange={set("sector")} placeholder="e.g. fintech" />
      <Field label="What it does (one line)" value={v.one_liner} onChange={set("one_liner")} wide />
      <Field label="Tags, comma-separated" value={v.tags} onChange={set("tags")} placeholder="e.g. first cheque, lending" />
      <label className="block">
        <span className="text-[12px] text-ink-muted">Status</span>
        <select value={v.status} onChange={(e) => set("status")(e.target.value)} className="mt-1 h-9 w-full rounded-[10px] bg-canvas px-2 text-[13px] shadow-[0_0_0_1px_var(--hairline)]">
          {["active", "exited", "shut down"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <Field label="Source link (required)" value={v.source_url} onChange={set("source_url")} placeholder="https://…" wide />
      <Field label="Source note" value={v.source_note} onChange={set("source_note")} wide />
      <div className="flex items-center gap-1.5 sm:col-span-2">
        <button type="submit" disabled={pending} className="press h-8 rounded-full bg-primary px-3 text-[13px] font-medium text-on-primary hover:bg-primary-hover disabled:opacity-60">{pending ? "Saving…" : "Save"}</button>
        <button type="button" onClick={onDone} className="press h-8 rounded-full px-3 text-[13px] text-ink-muted shadow-[0_0_0_1px_var(--hairline)] hover:bg-canvas">Cancel</button>
        {error && <p role="alert" className="text-[12px] text-red">{error}</p>}
      </div>
    </form>
  );
}

// Raw tags read as code; show them as words. Unknown tags fall back to their text with underscores as spaces.
const TAG: Record<string, string> = {
  first_cheque: "First Cheque",
  first_cheque_legacy: "First Cheque (legacy)",
  aggregator_only: "Listed only",
};
const SECTOR: Record<string, string> = { "b2b saas": "B2B SaaS", fintech: "Fintech", deeptech: "Deeptech", "consumer brand": "Consumer brand", "consumer tech": "Consumer tech", other: "Other" };
const sectorLabel = (s: string | null) => (s ? SECTOR[s] ?? s : "");
const tagLabel = (t: string) => TAG[t] ?? t.replace(/_/g, " ");
// A "needs_description" row holds a placeholder line; show it as a gap, not as a description.
const missing = (r: PortfolioRow) => !r.one_liner || r.tags.includes("needs_description");

export function PortfolioEditor({ rows, canEdit }: { rows: PortfolioRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<string | null>(null); // row id, or "new"
  const exited = rows.filter((r) => r.status !== "active").length;
  const gaps = rows.filter(missing).length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-ink-subtle">
          {rows.length} companies{exited ? ` · ${exited} exited` : ""}{gaps ? <> · <span className="text-amber">{gaps} need a description</span></> : null}
          {!canEdit && " · sign in to edit"}
        </p>
        <button type="button" disabled={!canEdit} onClick={() => setEditing("new")} className="press h-9 rounded-full bg-solid px-4 text-[13px] font-medium text-on-solid hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-subtle">Add company</button>
      </div>
      {editing === "new" && <Form initial={toInput()} onDone={() => setEditing(null)} />}
      <div className="tray"><ul className="tray-in divide-y divide-hairline overflow-hidden">
        {rows.map((r) => (
          <li key={r.id}>
            {editing === r.id ? (
              <div className="p-3"><Form initial={toInput(r)} onDone={() => setEditing(null)} /></div>
            ) : (
              <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3 md:grid-cols-[200px_1fr_auto]">
                <p className="min-w-0 truncate">
                  <span className="font-display text-[19px] leading-tight">{r.company}</span>
                  {r.status !== "active" && <span className="ml-2 align-middle"><Badge>{r.status}</Badge></span>}
                </p>
                <div className="order-3 col-span-2 min-w-0 md:order-none md:col-span-1">
                  <p className="text-[13px] text-ink md:truncate" title={missing(r) ? undefined : r.one_liner}>
                    {missing(r) ? <span className="text-amber">No description yet, so new applicants can’t be checked against it.</span> : r.one_liner}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-ink-subtle">
                    {sectorLabel(r.sector)}
                    {r.tags.filter((t) => t !== "needs_description").map((t) => <span key={t}>· {tagLabel(t)}</span>)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 md:justify-self-end">
                  <a href={r.source_url} target="_blank" rel="noreferrer" title={r.source_note ?? undefined}
                    className="press inline-flex h-8 items-center rounded-full px-3 text-[12px] font-medium text-primary hover:bg-surface-1">
                    Source<span className="sr-only">{r.source_note ? `: ${r.source_note}` : ""} (opens in a new tab)</span>
                  </a>
                  <button type="button" disabled={!canEdit} onClick={() => setEditing(r.id)} aria-label={`Edit ${r.company}`}
                    className="press inline-flex h-8 items-center rounded-full px-3 text-[12px] text-ink-muted shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-surface-1 disabled:cursor-not-allowed disabled:text-ink-subtle">Edit</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul></div>
    </div>
  );
}
