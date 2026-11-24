"use client";
// Outreach after sending: thread state, "Check for replies", and anything prepared for Riya's one click
// (a booking, a counter-proposal, a follow-up). Plus the partner decision bar. Nothing here acts on its own.
import { useState, useTransition } from "react";
import { approvePendingAction, checkReplies, decide, dismissPendingAction } from "@/app/applications/[id]/actions";
import { Badge, cx, fmtDate } from "./ui";

type Slot = { start: string; end: string };
export type ThreadRow = {
  id: string; state: string; founder_email: string | null; follow_up_due_at: string | null; followed_up_at: string | null;
  pending_action: "book" | "counter_proposal" | "follow_up" | null;
  pending_payload: { subject: string; body: string; reason: string; slot?: Slot } | null;
  context: { template?: string; offered?: Slot[] };
};

const STATE: Record<string, { label: string; tone: "neutral" | "green" | "amber" | "primary" }> = {
  sent: { label: "Waiting for the founder's time", tone: "neutral" },
  replied: { label: "Founder replied: needs you", tone: "primary" },
  followed_up: { label: "Followed up", tone: "neutral" },
  counter_proposed: { label: "Two free times offered", tone: "neutral" },
  booked: { label: "Call booked", tone: "green" },
  closed: { label: "Closed", tone: "neutral" },
};
const ACTION_LABEL = { book: "Book the call and confirm", counter_proposal: "Offer new times", follow_up: "Send follow-up" } as const;
const ist = (iso: string) => new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST";

function PendingCard({ applicationId, t }: { applicationId: string; t: ThreadRow }) {
  const p = t.pending_payload!;
  const [body, setBody] = useState(p.body);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = (fn: () => Promise<{ error?: string } | { ok: boolean }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if ("error" in r && r.error) setError(r.error);
    });
  return (
    <div className="mt-2 rounded-[10px] bg-surface-1 p-3 shadow-[0_0_0_1px_var(--hairline)]">
      <p className="text-[12px] font-medium text-ink">Ready for your click: {ACTION_LABEL[t.pending_action!].toLowerCase()}</p>
      <p className="text-[12px] text-ink-muted">{p.reason}{p.slot ? ` ${ist(p.slot.start)}.` : ""}</p>
      <label className="mt-2 block">
        <span className="sr-only">Reply text</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6}
          className="w-full resize-y rounded-[10px] bg-canvas px-3 py-2 text-[13px] leading-relaxed shadow-[0_0_0_1px_var(--hairline)]" />
      </label>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button type="button" disabled={pending} onClick={() => go(() => approvePendingAction(applicationId, t.id, body))}
          className="press h-8 rounded-full bg-primary px-3 text-[13px] font-medium text-on-primary hover:bg-primary-hover disabled:opacity-60">
          {pending ? "Working…" : ACTION_LABEL[t.pending_action!]}
        </button>
        <button type="button" disabled={pending} onClick={() => go(() => dismissPendingAction(applicationId, t.id))}
          className="press h-8 rounded-full px-3 text-[13px] text-ink-muted shadow-[0_0_0_1px_var(--hairline)] hover:bg-canvas">
          Dismiss
        </button>
      </div>
      {error && <p role="alert" className="mt-1 text-[12px] text-red">{error}</p>}
    </div>
  );
}

export function OutreachPanel({ applicationId, threads, meetings, canAct }: {
  applicationId: string; threads: ThreadRow[]; meetings: { start_at: string; includes_aditya: boolean }[]; canAct: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!threads.length)
    return (
      <section className="elev-1 rounded-[20px] bg-canvas p-4" aria-label="Outreach">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-[24px] font-normal leading-tight">Outreach</h2>
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] text-ink-muted">Not sent yet</span>
        </div>
        <p className="mt-2 text-[13px] font-medium text-ink">How the meeting gets booked</p>
        <ol className="mt-1 list-decimal space-y-1 pl-4 text-[13px] text-ink-muted">
          <li>You send the letter. It offers two times you’re free and lets them suggest another.</li>
          <li>The app reads their reply every 5 minutes.</li>
          <li>It books the time they pick (or theirs, if you’re free) with a Google Meet link and confirms. If you’re busy, it offers two new free times.</li>
        </ol>
        <p className="mt-2 text-[12px] text-ink-subtle">Booked calls appear here, on the Meetings page and on your Google Calendar.</p>
      </section>
    );
  const check = () =>
    start(async () => {
      const r = await checkReplies(applicationId);
      setMsg("error" in r && r.error ? r.error : "found" in r && r.found?.length ? `Found: ${r.found.join(", ")}.` : "Nothing new yet.");
    });
  return (
    <section className="elev-1 rounded-[20px] bg-canvas p-4" aria-label="Outreach">
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-display text-[24px] font-normal leading-tight">Outreach</h2>
        <button type="button" onClick={check} disabled={pending || !canAct} title={canAct ? undefined : "Sign in with Google first"}
          className="press h-8 rounded-full px-2.5 text-[12px] text-ink-muted shadow-[0_0_0_1px_var(--hairline)] hover:bg-surface-1 disabled:opacity-50">
          {pending ? "Checking…" : "Check now"}
        </button>
      </header>
      <p className="mt-1 text-[12px] text-ink-subtle" aria-live="polite">{msg ?? "The app checks for the founder's reply every few minutes and books the call on your calendar. Anything it can't handle waits here for you."}</p>
      <ul className="mt-2 space-y-3">
        {threads.map((t) => (
          <li key={t.id} className="text-[13px]">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={STATE[t.state]?.tone ?? "neutral"}>{STATE[t.state]?.label ?? t.state}</Badge>
              <span className="text-ink-muted">to {t.founder_email}</span>
            </div>
            {t.state === "sent" && t.follow_up_due_at && !t.pending_action && <p className="num mt-1 text-[12px] text-ink-subtle">When they reply with a time, the call is booked automatically. A follow-up is prepared if there’s no reply by {fmtDate(t.follow_up_due_at)}.</p>}
            {t.context.offered?.length ? <p className="mt-1 text-[12px] text-ink-subtle">Offered: {t.context.offered.map((s) => ist(s.start)).join(" or ")}</p> : null}
            {t.state === "replied" && !t.pending_action && <p className="mt-1 text-[12px] text-amber">The reply needs you: open the thread in Gmail.</p>}
            {t.pending_action && t.pending_payload && canAct && <PendingCard applicationId={applicationId} t={t} />}
          </li>
        ))}
      </ul>
      {meetings.length > 0 && (
        <p className="mt-3 rounded-[10px] bg-green-bg px-3 py-2 text-[13px] font-medium text-green">
          Call booked for {meetings.map((m) => `${ist(m.start_at)}${m.includes_aditya ? " (with Aditya)" : ""}`).join(", ")}. It’s on your Google Calendar with a Meet link.
        </p>
      )}
    </section>
  );
}

export function DecisionBar({ applicationId, decided, canDecide, signedIn }: {
  applicationId: string; decided?: { decision: string; note: string; created_at: string; decided_by_email: string | null }; canDecide: boolean; signedIn: boolean;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    // the decision "seal": an espresso panel (ivory in dark mode), the one place the page asks a partner to commit
    <div className="rounded-[20px] bg-solid p-5 text-on-solid shadow-[0_24px_48px_-28px_rgb(30_26_21/0.8)]">
      <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-solid-muted">Your decision</p>
      {decided && (
        <p className="mb-3 text-[13px]">
          <span className="font-display text-[20px]">{({ advance: "Yes", pass: "No", hold: "Hold" } as Record<string, string>)[decided.decision] ?? decided.decision}</span>{decided.note ? `: ${decided.note}` : ""}{" "}
          <span className="num text-solid-muted">({decided.decided_by_email ?? "partner"}, {fmtDate(decided.created_at)})</span>
        </p>
      )}
      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Decision">
        {([["advance", "Yes, give it time"], ["pass", "No"]] as const).map(([x, label]) => (
          <button key={x} type="button" disabled={!canDecide || pending} aria-pressed={choice === x} onClick={() => setChoice(x)}
            className={cx("press h-11 rounded-full text-[13px] disabled:cursor-not-allowed disabled:opacity-60",
              choice === x ? "bg-solid-muted font-semibold text-solid" : "bg-on-solid/10 text-on-solid hover:bg-on-solid/15")}>
            {label}
          </button>
        ))}
      </div>
      {!canDecide && <p className="mt-2.5 text-[12px] text-solid-muted">{signedIn ? "This account can't record decisions." : "Sign in with Google to decide."}</p>}
      {choice && (
        <form className="mt-3 space-y-2" onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError(null);
            const r = await decide(applicationId, choice, note);
            if ("error" in r && r.error) setError(r.error);
            else (setChoice(null), setNote(""));
          });
        }}>
          <label className="block">
            <span className="mb-1 block text-[12px] text-solid-muted">Why? (optional, and it helps the AI learn your judgement)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className="w-full rounded-[14px] bg-canvas px-3.5 py-2.5 text-[13px] text-ink" />
          </label>
          <button type="submit" disabled={pending} className="press h-10 rounded-full bg-canvas px-4 text-[13px] font-medium text-ink hover:bg-surface-2 disabled:opacity-60">
            {pending ? "Saving…" : choice === "advance" ? "Record: yes" : "Record: no"}
          </button>
          {error && <p role="alert" className="rounded-[10px] bg-red-bg px-3 py-2 text-[12px] text-red">{error}</p>}
        </form>
      )}
    </div>
  );
}
