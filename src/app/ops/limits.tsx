"use client";
import { useState, useTransition } from "react";
import { resumeQueue, runQueueNow, saveLimits } from "./actions";

export function Limits({ dailyUsd, alertEmail, maxInFlight, paused, canEdit }: { dailyUsd: number; alertEmail: string | null; maxInFlight: number; paused: boolean; canEdit: boolean }) {
  const [daily, setDaily] = useState(dailyUsd);
  const [email, setEmail] = useState(alertEmail ?? "");
  const [conc, setConc] = useState(maxInFlight);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const field = "h-9 rounded-[10px] bg-surface-1 px-3 text-[13px] shadow-[0_0_0_1px_var(--hairline)]";
  return (
    <div className="space-y-3">
      <fieldset disabled={!canEdit || pending} className="grid gap-3 sm:grid-cols-3">
        <label className="block text-[12px] text-ink-muted">Daily limit (USD)
          <input type="number" min={0.01} step={0.5} value={daily} onChange={(e) => setDaily(Number(e.target.value))} className={`num mt-1 w-full ${field}`} />
        </label>
        <label className="block text-[12px] text-ink-muted">Applications at a time
          <input type="number" min={1} max={10} value={conc} onChange={(e) => setConc(Number(e.target.value))} className={`num mt-1 w-full ${field}`} />
        </label>
        <label className="block text-[12px] text-ink-muted">Email me when it pauses (optional)
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@fund.com" className={`mt-1 w-full ${field}`} />
        </label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!canEdit || pending} onClick={() => start(async () => {
          const r = await saveLimits(daily, email, conc);
          setMsg("error" in r ? { ok: false, text: r.error } : { ok: true, text: "Saved." });
        })} className="press h-8 rounded-full px-3 text-[13px] font-medium text-ink shadow-[0_0_0_1px_var(--ink-subtle)] hover:bg-surface-1 disabled:cursor-not-allowed disabled:text-ink-subtle">
          Save limits
        </button>
        {paused && (
          <button type="button" disabled={!canEdit || pending} onClick={() => start(async () => {
            const r = await resumeQueue();
            setMsg("error" in r ? { ok: false, text: r.error } : { ok: true, text: "Queue resumed. If today is still over the limit, it pauses again on the next call." });
          })} className="press h-8 rounded-full bg-primary px-3 text-[13px] font-medium text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-subtle">
            Resume the queue
          </button>
        )}
        <button type="button" disabled={!canEdit || pending || paused} onClick={() => start(async () => {
          const r = await runQueueNow();
          setMsg("error" in r ? { ok: false, text: r.error } : { ok: true, text: r.ran ? `Ran ${r.ran} application. ${r.waiting} still waiting.` : "Nothing was waiting." });
        })} className="press h-8 rounded-full px-3 text-[13px] text-ink-muted shadow-[0_0_0_1px_var(--hairline)] hover:bg-surface-1 disabled:cursor-not-allowed disabled:text-ink-subtle">
          {pending ? "Working…" : "Run one now"}
        </button>
        {!canEdit && <span className="text-[12px] text-ink-subtle">Partners can change these.</span>}
        {msg && <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-[12px] text-green" : "text-[12px] text-red"}>{msg.text}</span>}
      </div>
    </div>
  );
}
