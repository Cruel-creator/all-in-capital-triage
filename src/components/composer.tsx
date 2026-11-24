"use client";
// Email composer (build prompt §8): inline editing with autosave, Redo chips and note, live lint. Sending is a
// separate explicit click and stays disabled until Gmail is connected. Versions are still saved, just not listed.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { generateDraft, previewSlots, redoDraft, saveEdit, sendDraftAction } from "@/app/applications/[id]/actions";
import { lintEmail, type Template } from "@/lib/email/lint";
import type { Slot } from "@/lib/google/slots";
import { Badge, cx } from "./ui";

export type ComposerVersion = { id: string; n: number; subject: string; body: string; origin: string; redo_chip: string | null; redo_note: string | null; created_at: string };
export type ComposerDraft = { id: string; template: Template; status: string; current_version_id: string; versions: ComposerVersion[] } | null;

const CHIPS: [string, string][] = [["shorter", "Shorter"], ["warmer", "Warmer"], ["direct", "More direct"], ["opening", "Different opening"], ["sharper", "Ask a sharper question"]];
const TEMPLATE_LABEL: Record<string, string> = { invite: "Call invite", dig: "Dig", pass: "Pass", follow_up: "Follow-up" };

/** To field, a confirmation that names the recipient and (for invites) the real calendar slots, then one click. */
function SendBox({ applicationId, draft, founderEmail, gmail, signedIn, lintOk, saving }: {
  applicationId: string; draft: NonNullable<ComposerDraft>; founderEmail: string | null; gmail: string | null; signedIn: boolean; lintOk: boolean; saving: boolean;
}) {
  const [to, setTo] = useState(founderEmail ?? "");
  const [confirm, setConfirm] = useState<{ slots: Slot[]; labels: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const validTo = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to.trim());
  const blocked = !gmail ? "Connect Gmail first (left sidebar)." : !signedIn ? "Sign in with Google first." : !lintOk ? "Fix the checks above first." : saving ? "Saving your edits…" : !validTo ? "Add the founder’s email address." : null;

  if (draft.status === "sent") return <p className="rounded-[10px] bg-green-bg px-3 py-2 text-[12px] text-green">Already sent{gmail ? ` from ${gmail}` : ""}. Replies and follow-ups show under Outreach.</p>;

  const review = () =>
    start(async () => {
      setError(null);
      const current = draft.versions.find((v) => v.id === draft.current_version_id)?.body ?? "";
      // new invites ask the founder for a time, so there are no slots to check before sending
      if (draft.template !== "invite" || !current.includes("{slot_1}")) return setConfirm({ slots: [], labels: [] });
      const r = await previewSlots();
      if ("error" in r) setError(r.error);
      else setConfirm({ slots: r.slots, labels: r.labels });
    });
  const send = () =>
    start(async () => {
      setError(null);
      const r = await sendDraftAction(applicationId, draft.id, to, confirm?.slots.length ? confirm.slots : undefined);
      if ("error" in r && r.error) setError(r.error);
      setConfirm(null);
    });

  return (
    <div className="w-full space-y-2">
      <label className="block">
        <span className="eyebrow">To</span>
        <input type="email" value={to} onChange={(e) => (setTo(e.target.value), setConfirm(null))} placeholder="founder@company.com" autoComplete="off"
          className="mt-1 h-9 w-full rounded-[10px] bg-surface-1 px-3 text-[13px] shadow-[0_0_0_1px_var(--hairline)]" />
      </label>
      {confirm ? (
        <div className="rounded-[10px] bg-surface-1 p-3 text-[13px] shadow-[0_0_0_1px_var(--hairline)]" role="group" aria-label="Confirm sending">
          <p>Send this {TEMPLATE_LABEL[draft.template].toLowerCase()} to <span className="font-medium">{to.trim()}</span> from <span className="font-medium">{gmail}</span> now?</p>
          {confirm.labels.length > 0 && <p className="mt-1 text-[12px] text-ink-muted">It offers {confirm.labels[0]} or {confirm.labels[1]}, both free on your calendar. Whichever they pick, or any other time they suggest that you're free for, the app books with a Meet link.</p>}
          {confirm.labels.length === 0 && draft.template === "invite" && <p className="mt-1 text-[12px] text-ink-muted">When they reply with a time, the app checks your calendar and books the call (or offers two free times if you're busy).</p>}
          <div className="mt-2 flex gap-1.5">
            <button type="button" onClick={send} disabled={pending} className="press h-8 rounded-full bg-primary px-3 text-[13px] font-medium text-on-primary hover:bg-primary-hover disabled:opacity-60">
              {pending ? "Sending…" : "Send now"}
            </button>
            <button type="button" onClick={() => setConfirm(null)} disabled={pending} className="press h-8 rounded-full px-3 text-[13px] text-ink-muted shadow-[0_0_0_1px_var(--hairline)] hover:bg-canvas">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {blocked && (!gmail
            ? <a href="/api/google/connect" className="text-[12px] font-medium text-primary underline">Connect Gmail to send</a>
            : <span className="text-[12px] text-ink-subtle">{blocked}</span>)}
          <button type="button" onClick={review} disabled={!!blocked || pending} className="btn-pill press">
            {pending ? "Checking calendar…" : "Review and send"}
            <span className="arrow" aria-hidden>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 9l6-6M4.5 3H9v4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-[12px] text-red">{error}</p>}
    </div>
  );
}

export function Composer({ applicationId, draft, suggested, gmail, signedIn, founderEmail, sentSlots = [] }: {
  applicationId: string; draft: ComposerDraft; suggested: Template; gmail: string | null; signedIn: boolean; founderEmail: string | null; sentSlots?: string[];
}) {
  const current = draft?.versions.find((v) => v.id === draft.current_version_id) ?? null;
  const [subject, setSubject] = useState(current?.subject ?? "");
  const [body, setBody] = useState(current?.body ?? "");
  const [saved, setSaved] = useState<"saved" | "saving" | "unsaved">("saved");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // reset the editor when a new version arrives (redo, restore, regenerate)
  useEffect(() => {
    setSubject(current?.subject ?? "");
    setBody(current?.body ?? "");
    setSaved("saved");
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const lint = useMemo(() => (draft ? lintEmail({ subject, body, template: draft.template }) : null), [subject, body, draft]);

  const onEdit = (s: string, b: string) => {
    setSubject(s);
    setBody(b);
    setSaved("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (!draft) return;
      setSaved("saving");
      const r = await saveEdit(draft.id, s, b);
      if ("error" in r && r.error) (setError(r.error), setSaved("unsaved"));
      else setSaved("saved");
    }, 800);
  };

  const run = (fn: () => Promise<{ error?: string } | { ok: boolean }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if ("error" in r && r.error) setError(r.error);
    });

  if (!draft)
    return (
      <section className="elev-1 rounded-[20px] bg-canvas p-4" aria-label="Email">
        <h2 className="font-display text-[24px] font-normal leading-tight">Letter to the founders</h2>
        <p className="mt-1 text-[13px] text-ink-muted">No draft yet. The suggested template follows the recommendation: <span className="font-medium text-ink">{TEMPLATE_LABEL[suggested]}</span>.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(["invite", "dig", "pass"] as Template[]).map((t) => (
            <button key={t} type="button" disabled={pending} onClick={() => run(() => generateDraft(applicationId, t))}
              className={cx("press h-8 rounded-full px-3 text-[13px] font-medium", t === suggested ? "bg-primary text-on-primary hover:bg-primary-hover" : "text-ink-muted shadow-[0_0_0_1px_var(--hairline)] hover:bg-surface-1")}>
              {pending ? "Drafting…" : `Draft ${TEMPLATE_LABEL[t].toLowerCase()}`}
            </button>
          ))}
        </div>
        {error && <p role="alert" className="mt-2 text-[12px] text-red">{error}</p>}
      </section>
    );

  return (
    <section className="elev-1 rounded-[20px] bg-canvas" aria-label="Email composer">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[24px] font-normal leading-tight">Letter to the founders</h2>
          <Badge>{TEMPLATE_LABEL[draft.template]}</Badge>
          {draft.status === "sent" && <Badge tone="green">Sent</Badge>}
        </div>
        <span className="text-[12px] text-ink-subtle" aria-live="polite">{saved === "saving" ? "Saving…" : saved === "unsaved" ? "Unsaved changes" : "Saved"}</span>
      </header>

      <div className="space-y-2 p-4">
        <label className="block">
          <span className="eyebrow">Subject</span>
          <input value={subject} onChange={(e) => onEdit(e.target.value, body)} disabled={draft.status === "sent"}
            className="mt-1 h-9 w-full rounded-[10px] bg-surface-1 px-3 text-[13px] shadow-[0_0_0_1px_var(--hairline)]" />
        </label>
        <label className="block">
          <span className="eyebrow">Message</span>
          <textarea value={draft.status === "sent" && sentSlots.length === 2 ? body.split("{slot_1}").join(sentSlots[0]).split("{slot_2}").join(sentSlots[1]) : body} onChange={(e) => onEdit(subject, e.target.value)} disabled={draft.status === "sent"} rows={12}
            className="mt-1 w-full resize-y rounded-[10px] bg-surface-1 px-3 py-2 text-[13px] leading-relaxed shadow-[0_0_0_1px_var(--hairline)]" />
        </label>

        {lint && draft.status !== "sent" && (
          <div className={cx("rounded-[10px] px-3 py-2 text-[12px]", lint.ok ? "bg-green-bg text-green" : "bg-amber-bg text-amber")} role="status">
            <p className="num font-medium">{lint.ok ? "Passes every check" : `${lint.issues.length} check${lint.issues.length > 1 ? "s" : ""} to fix before sending`} · {lint.words}/120 words · subject {lint.subjectWords}/7</p>
            {!lint.ok && <ul className="mt-1 list-disc pl-4">{lint.issues.map((i, n) => <li key={n}>{i.rule}: {i.detail}</li>)}</ul>}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 pt-1" role="group" aria-label="Redo the draft">
          <span className="eyebrow mr-1">Redo</span>
          {CHIPS.map(([k, label]) => (
            <button key={k} type="button" disabled={pending || draft.status === "sent"} onClick={() => run(() => redoDraft(applicationId, draft.id, k))}
              className="press hit h-8 rounded-full px-2.5 text-[12px] text-ink-muted shadow-[0_0_0_1px_var(--hairline)] hover:bg-surface-1 hover:text-ink disabled:opacity-50">
              {label}
            </button>
          ))}
        </div>
        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (note.trim()) run(async () => { const r = await redoDraft(applicationId, draft.id, undefined, note); setNote(""); return r; }); }}>
          <label className="sr-only" htmlFor="redo-note">Redo with a note</label>
          <input id="redo-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Redo with a note…" disabled={draft.status === "sent"}
            className="h-9 flex-1 rounded-[10px] bg-surface-1 px-3 text-[13px] shadow-[0_0_0_1px_var(--hairline)]" />
          <button type="submit" disabled={pending || !note.trim()} className="press h-9 rounded-full px-3 text-[13px] text-ink-muted shadow-[0_0_0_1px_var(--hairline)] hover:bg-surface-1 disabled:opacity-50">
            {pending ? "Working…" : "Redo"}
          </button>
        </form>
        {error && <p role="alert" className="text-[12px] text-red">{error}</p>}

        <div className="border-t border-hairline pt-3">
          <SendBox applicationId={applicationId} draft={draft} founderEmail={founderEmail} gmail={gmail} signedIn={signedIn} lintOk={!!lint?.ok} saving={saved !== "saved"} />
        </div>
      </div>
    </section>
  );
}
