"use client";
// Override a criterion score (build prompt §7): new score, a required one-line reason, and pattern tags.
// The correction is remembered and shown to the scorer on similar companies.
import { useState, useTransition } from "react";
import { overrideScore } from "@/app/applications/[id]/actions";
import { cx } from "./ui";

const PATTERNS = ["missing-repeat-rate", "credentials-over-evidence", "cac-not-measured", "top-down-market", "single-dependency", "regulatory-exposure", "founder-insight", "customer-pull-proven"];

export function OverrideButton({ applicationId, criterion, name, current, canAct }: { applicationId: string; criterion: string; name: string; current: number; canAct: boolean }) {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(current);
  const [reason, setReason] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open)
    return (
      <button type="button" disabled={!canAct} onClick={() => setOpen(true)} title={canAct ? `Change the ${name} score` : "Sign in with Google to override"}
        className="press h-7 shrink-0 rounded-[6px] px-2 text-[12px] text-ink-muted shadow-[0_0_0_1px_var(--hairline)] hover:bg-surface-1 hover:text-ink disabled:cursor-not-allowed disabled:text-ink-subtle">
        Override
      </button>
    );

  return (
    <form
      className="mt-2 w-full space-y-2 rounded-[8px] bg-surface-1 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await overrideScore(applicationId, criterion, score, reason, tags, tags[0] ?? null);
          if ("error" in r && r.error) setError(r.error);
          else setOpen(false);
        });
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[12px] text-ink-muted">
          New score
          <input type="number" min={0} max={10} step={0.5} value={score} onChange={(e) => setScore(Number(e.target.value))}
            className="num h-8 w-16 rounded-[6px] bg-canvas px-2 text-[13px] shadow-[0_0_0_1px_var(--hairline)]" />
        </label>
        <span className="num text-[12px] text-ink-subtle">was {current.toFixed(1)}</span>
      </div>
      <label className="block">
        <span className="text-[12px] text-ink-muted">Why, in one line (required)</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={280} required placeholder="e.g. Repeat rate isn't tracked, so retention claims shouldn't lift this"
          className="mt-1 h-9 w-full rounded-[6px] bg-canvas px-3 text-[13px] shadow-[0_0_0_1px_var(--hairline)]" />
      </label>
      <fieldset>
        <legend className="text-[12px] text-ink-muted">Pattern (helps it apply to similar companies)</legend>
        <div className="mt-1 flex flex-wrap gap-1">
          {PATTERNS.map((p) => {
            const on = tags.includes(p);
            return (
              <button key={p} type="button" aria-pressed={on} onClick={() => setTags(on ? tags.filter((t) => t !== p) : [...tags, p])}
                className={cx("press h-7 rounded-[6px] px-2 font-mono text-[11px]", on ? "bg-primary text-on-primary" : "bg-canvas text-ink-muted shadow-[0_0_0_1px_var(--hairline)] hover:text-ink")}>
                {p}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="flex gap-1.5">
        <button type="submit" disabled={pending || !reason.trim()} className="press h-8 rounded-[6px] bg-primary px-3 text-[13px] font-medium text-on-primary hover:bg-primary-hover disabled:opacity-60">
          {pending ? "Saving…" : "Save override"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="press h-8 rounded-[6px] px-3 text-[13px] text-ink-muted shadow-[0_0_0_1px_var(--hairline)] hover:bg-canvas">Cancel</button>
      </div>
      {error && <p role="alert" className="text-[12px] text-red">{error}</p>}
    </form>
  );
}
