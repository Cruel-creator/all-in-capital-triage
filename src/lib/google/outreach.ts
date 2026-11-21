// Sending, reply handling, follow-ups and booking. The rule from the build prompt holds everywhere here:
// nothing goes out without a person's click. Sync only *prepares* a reply, follow-up or booking (pending_action);
// approvePending sends it. Founder reply text is read by deterministic code, never sent to a model.
import { admin, must } from "../db/admin";
import { lintEmail, type Template } from "../email/lint";
import { diffText } from "../email/diff";
import { bookEvent, busy, mailbox, readThread, sendMail } from "./client";
import { readReply } from "./reply";
import { addWorkingDays, formatSlot, isFree, pickSlots, type Slot } from "./slots";

export type ThreadContext = { template: Template; subject: string; first_name: string; signoff: string; offered: Slot[]; company: string; deeptech: boolean };
export type Pending = { subject: string; body: string; in_reply_to: string | null; slot?: Slot; offered?: Slot[]; reason: string };

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const reSubject = (s: string) => (/^re:/i.test(s) ? s : `Re: ${s}`);
const event = (application_id: string, kind: string, payload: Record<string, unknown>) =>
  admin().from("timeline_events").insert({ application_id, kind, payload });

/** Two free Tue/Thu afternoon slots from the connected calendar. */
export async function offerSlots(now = new Date()): Promise<Slot[]> {
  const b = await busy(now.toISOString(), new Date(now.getTime() + 16 * 864e5).toISOString());
  return pickSlots(now, b);
}

export function fillSlots(body: string, slots: Slot[]) {
  return body.split("{slot_1}").join(formatSlot(slots[0])).split("{slot_2}").join(formatSlot(slots[1]));
}

/** Sends the current version of a draft. Caller has checked the session. */
export async function sendDraft(o: { applicationId: string; draftId: string; to: string; slots?: Slot[]; actor: string }) {
  if (!EMAIL.test(o.to)) throw new Error("That email address doesn't look right.");
  const db = admin();
  const d = must(await db.from("email_drafts").select("id, application_id, template, status, current_version_id").eq("id", o.draftId).single(), "draft");
  if (d.application_id !== o.applicationId) throw new Error("Draft doesn't belong to this application.");
  if (d.status === "sent") throw new Error("This email has already been sent.");
  const v = must(await db.from("email_versions").select("subject, body").eq("id", d.current_version_id).single(), "version");
  const report = lintEmail({ subject: v.subject, body: v.body, template: d.template });
  if (!report.ok) throw new Error(`Fix the checks before sending: ${report.issues.map((i) => i.rule).join(", ")}.`);

  // invites: fill the two slots, re-checked against the calendar right now
  let offered: Slot[] = [];
  let body: string = v.body;
  if (d.template === "invite") {
    const b = await busy(new Date().toISOString(), new Date(Date.now() + 16 * 864e5).toISOString());
    offered = o.slots?.length === 2 && o.slots.every((s) => isFree(s, b) && new Date(s.start) > new Date()) ? o.slots : pickSlots(new Date(), b);
    if (offered.length < 2) throw new Error("No two free Tuesday or Thursday afternoon slots in the next two weeks.");
    body = fillSlots(body, offered);
  }

  const app = must(await db.from("applications").select("company_name, sector_inferred").eq("id", o.applicationId).single(), "application");
  const founder = (await db.from("founders").select("id, full_name, email").eq("application_id", o.applicationId).order("position").limit(1).maybeSingle()).data;
  const sent = await sendMail({ to: o.to, subject: v.subject, body });
  const now = new Date();

  must(await db.from("email_drafts").update({ status: "sent", sent_at: now.toISOString() }).eq("id", d.id), "mark sent");
  if (founder && !founder.email) await db.from("founders").update({ email: o.to }).eq("id", founder.id);
  const lines = body.trim().split(/\n/).map((l) => l.trim()).filter(Boolean);
  const context: ThreadContext = {
    template: d.template, subject: v.subject, offered, company: app.company_name, deeptech: (app.sector_inferred ?? "").includes("deeptech"),
    first_name: founder ? founder.full_name.replace(/^Dr\.?\s*/i, "").split(/\s+/)[0] : "there",
    signoff: lines.at(-1) ?? "Riya",
  };
  must(
    await db.from("threads").insert({
      application_id: o.applicationId, draft_id: d.id, gmail_thread_id: sent.threadId, state: "sent", founder_email: o.to,
      last_seen_message_id: sent.id, context, follow_up_due_at: d.template === "pass" ? null : addWorkingDays(now).toISOString(),
    }),
    "thread",
  );

  // what Riya changed from the first generated draft teaches future drafts (style memory)
  const first = (await db.from("email_versions").select("subject, body").eq("draft_id", d.id).order("n").limit(1).single()).data;
  const before = first ? `${first.subject}\n\n${first.body}` : "";
  const after = `${v.subject}\n\n${v.body}`;
  if (first && before !== after) await db.from("style_examples").insert({ draft_id: d.id, template: d.template, draft_text: before, sent_text: after, diff: diffText(before, after) });

  await event(o.applicationId, "email_sent", { template: d.template, draft_id: d.id, by: o.actor, offered });
  return { threadId: sent.threadId, offered };
}

// ---------- replies ----------

const bodies = {
  follow_up: (c: ThreadContext, slots: Slot[]) =>
    c.template === "invite"
      ? `Hi ${c.first_name},\n\nFollowing up on my note about a call. Would ${formatSlot(slots[0])} or ${formatSlot(slots[1])} work for 30 minutes?\n\n${c.signoff}`
      : `Hi ${c.first_name},\n\nFollowing up on my earlier note. Could you reply in this thread when you have a moment?\n\n${c.signoff}`,
  counter: (c: ThreadContext, slots: Slot[], asked?: Slot) =>
    `Hi ${c.first_name},\n\nThanks for coming back. ${asked ? `${formatSlot(asked)} is taken on my side.` : "Those times are taken on my side."} Would ${formatSlot(slots[0])} or ${formatSlot(slots[1])} work instead?\n\n${c.signoff}`,
  book: (c: ThreadContext, slot: Slot, aditya: boolean) =>
    `Hi ${c.first_name},\n\nBooked for ${formatSlot(slot)}. A calendar invite with a Meet link is on its way${aditya ? ", and Aditya, our deeptech partner, will join" : ""}.\n\n${c.signoff}`,
};

const aditya = (c: ThreadContext) => (c.deeptech && process.env.DEEPTECH_PARTNER_EMAIL ? process.env.DEEPTECH_PARTNER_EMAIL : null);

/** Looks for founder replies and due follow-ups on one application's open threads. Prepares, never sends. */
export async function syncApplication(applicationId: string, now = new Date()) {
  const db = admin();
  const box = await mailbox();
  if (!box) throw new Error("Gmail isn't connected");
  const threads = must(await db.from("threads").select("*").eq("application_id", applicationId).in("state", ["sent", "followed_up", "counter_proposed"]), "threads");
  const results: string[] = [];
  for (const t of threads) {
    if (!t.gmail_thread_id) continue;
    const c = t.context as ThreadContext;
    const msgs = await readThread(t.gmail_thread_id);
    const seen = msgs.findIndex((m) => m.id === t.last_seen_message_id);
    const fresh = msgs.slice(seen + 1);
    const fromFounder = fresh.filter((m) => !m.from.toLowerCase().includes(box.email.toLowerCase()));
    const lastMsg = msgs.at(-1);
    const patch: Record<string, unknown> = { last_seen_message_id: lastMsg?.id ?? t.last_seen_message_id };

    if (fromFounder.length) {
      const reply = fromFounder.at(-1)!;
      await event(applicationId, "founder_replied", { thread_id: t.id, message_id: reply.id, at: reply.date });
      const base = { subject: reSubject(c.subject), in_reply_to: reply.messageIdHeader };
      const scheduling = c.template === "invite" || t.state === "counter_proposed";
      const read = scheduling ? readReply(reply.text, c.offered ?? [], now) : { kind: "unclear" as const };
      if (read.kind === "unclear") {
        Object.assign(patch, { state: "replied", pending_action: null, pending_payload: null });
        results.push("reply needs Riya");
        await event(applicationId, "reply_needs_riya", { thread_id: t.id });
      } else {
        const b = await busy(now.toISOString(), new Date(now.getTime() + 30 * 864e5).toISOString());
        const wanted = read.kind === "accept" ? [read.slot] : read.slots;
        const free = wanted.find((s) => isFree(s, b));
        if (free) {
          const p: Pending = { ...base, slot: free, body: bodies.book(c, free, !!aditya(c)), reason: read.kind === "accept" ? "Founder picked an offered slot; it is still free." : "Founder proposed a time that is free on your calendar." };
          Object.assign(patch, { state: "replied", pending_action: "book", pending_payload: p });
          results.push("booking ready");
        } else {
          const slots = pickSlots(now, b);
          const p: Pending = { ...base, offered: slots, body: bodies.counter(c, slots, wanted[0]), reason: "Founder's time clashes with your calendar; two new slots offered." };
          Object.assign(patch, { state: "replied", pending_action: "counter_proposal", pending_payload: p });
          results.push("counter-proposal ready");
        }
      }
    } else if (!t.pending_action && t.state === "sent" && !t.followed_up_at && t.follow_up_due_at && new Date(t.follow_up_due_at) <= now) {
      const slots = c.template === "invite" ? await offerSlots(now) : [];
      const p: Pending = { subject: reSubject(c.subject), in_reply_to: lastMsg?.messageIdHeader ?? null, offered: slots, body: bodies.follow_up(c, slots), reason: "No reply after 3 working days." };
      Object.assign(patch, { pending_action: "follow_up", pending_payload: p });
      results.push("follow-up ready");
    }
    must(await db.from("threads").update(patch).eq("id", t.id), "thread update");
  }
  return results;
}

/** One click from Riya: sends the prepared reply (and books the call when that is the action). */
export async function approvePending(threadId: string, body: string, actor: string) {
  const db = admin();
  const t = must(await db.from("threads").select("*").eq("id", threadId).single(), "thread");
  if (!t.pending_action || !t.pending_payload) throw new Error("Nothing is waiting on this thread.");
  const p = t.pending_payload as Pending;
  const c = t.context as ThreadContext;
  const text = body.trim() || p.body;
  if (text.split(/\s+/).length > 150) throw new Error("Keep the reply under 150 words.");

  if (t.pending_action === "book") {
    const slot = p.slot!;
    const b = await busy(slot.start, slot.end);
    if (!isFree(slot, b)) throw new Error("That slot was taken in the meantime. Check for replies again to get new times.");
    const extra = aditya(c);
    const ev = await bookEvent({
      summary: `${c.company} × All In Capital`, start: slot.start, end: slot.end,
      attendees: [t.founder_email, ...(extra ? [extra] : [])].filter(Boolean) as string[],
      description: `Intro call with ${c.company}, booked from the triage app.`,
    });
    must(await db.from("meetings_booked").insert({ application_id: t.application_id, thread_id: t.id, gcal_event_id: ev.id, start_at: slot.start, end_at: slot.end, includes_aditya: !!extra }), "meeting");
    await sendMail({ to: t.founder_email, subject: p.subject, body: text, threadId: t.gmail_thread_id, inReplyTo: p.in_reply_to });
    must(await db.from("threads").update({ state: "booked", pending_action: null, pending_payload: null }).eq("id", t.id), "thread");
    await event(t.application_id, "call_booked", { thread_id: t.id, slot, by: actor, includes_aditya: !!extra, event_link: ev.htmlLink });
    return { booked: slot };
  }

  const sent = await sendMail({ to: t.founder_email, subject: p.subject, body: text, threadId: t.gmail_thread_id, inReplyTo: p.in_reply_to });
  const offered = p.offered?.length ? p.offered : c.offered;
  const patch =
    t.pending_action === "follow_up"
      ? { state: "followed_up", followed_up_at: new Date().toISOString() }
      : { state: "counter_proposed" };
  must(await db.from("threads").update({ ...patch, pending_action: null, pending_payload: null, last_seen_message_id: sent.id, context: { ...c, offered } }).eq("id", t.id), "thread");
  await event(t.application_id, t.pending_action === "follow_up" ? "follow_up_sent" : "counter_proposal_sent", { thread_id: t.id, by: actor, offered });
  return { sent: true };
}

export async function dismissPending(threadId: string, actor: string) {
  const db = admin();
  const t = must(await db.from("threads").select("application_id, pending_action").eq("id", threadId).single(), "thread");
  must(await db.from("threads").update({ pending_action: null, pending_payload: null }).eq("id", threadId), "thread");
  await event(t.application_id, "pending_dismissed", { thread_id: threadId, action: t.pending_action, by: actor });
}
