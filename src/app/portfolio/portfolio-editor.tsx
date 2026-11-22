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

export function PortfolioEditor({ rows, canEdit }: { rows: PortfolioRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<string | null>(null); // row id, or "new"
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-ink-subtle">{canEdit ? "Edits re-check new applicants against the updated text." : "Sign in with Google to edit."}</p>
        <button type="button" disabled={!canEdit} onClick={() => setEditing("new")} className="press h-8 rounded-full bg-primary px-3 text-[13px] font-medium text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-subtle">Add company</button>
      </div>
      {editing === "new" && <Form initial={toInput()} onDone={() => setEditing(null)} />}
      <ul className="elev-1 divide-y divide-hairline rounded-[16px] bg-canvas">
        {rows.map((r) => (
          <li key={r.id} className="px-4 py-3">
            {editing === r.id ? (
              <Form initial={toInput(r)} onDone={() => setEditing(null)} />
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px]"><span className="font-semibold">{r.company}</span> {r.sector && <span className="text-ink-subtle">· {r.sector}</span>} {r.status !== "active" && <Badge>{r.status}</Badge>}</p>
                  <p className="mt-0.5 text-[13px] text-ink-muted">{r.one_liner || <span className="text-amber">No description yet: the conflict check can’t compare against it.</span>}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1 text-[12px]">
                    {r.tags.map((t) => <Badge key={t}>{t}</Badge>)}
                    <a href={r.source_url} target="_blank" rel="noreferrer" className="text-primary underline">Source</a>
                    {r.source_note && <span className="text-ink-subtle">{r.source_note}</span>}
                  </p>
                </div>
                <button type="button" disabled={!canEdit} onClick={() => setEditing(r.id)} className="press h-7 rounded-full px-2 text-[12px] text-ink-muted shadow-[0_0_0_1px_var(--hairline)] hover:bg-surface-1 disabled:cursor-not-allowed disabled:text-ink-subtle">Edit</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
