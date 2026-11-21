"use server";
// Composer, outreach and decision actions. Sending, replying, booking and deciding each need a signed-in person's click.
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/google/session";
import { approvePending, dismissPending, offerSlots, sendDraft, syncApplication } from "@/lib/google/outreach";
import { formatSlot, type Slot } from "@/lib/google/slots";
import { admin, must } from "@/lib/db/admin";
import { draftEmail, REDO_CHIPS, type RedoChip } from "@/lib/pipeline/draft-email";
import { lintEmail, type Template } from "@/lib/email/lint";

const isId = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

export async function generateDraft(applicationId: string, template?: Template) {
  if (!isId(applicationId)) return { error: "Unknown application." };
  try {
    const r = await draftEmail({ applicationId, template });
    revalidatePath(`/applications/${applicationId}`);
    return { ok: true, report: r.report };
  } catch (e) {
    return { error: `Couldn't draft the email: ${(e as Error).message}` };
  }
}

export async function redoDraft(applicationId: string, draftId: string, chip?: string, note?: string) {
  if (!isId(applicationId) || !isId(draftId)) return { error: "Unknown draft." };
  if (chip && !(chip in REDO_CHIPS)) return { error: "Unknown redo option." };
  const db = admin();
  const d = must(await db.from("email_drafts").select("template, current_version_id").eq("id", draftId).single(), "draft");
  const cur = must(await db.from("email_versions").select("subject, body").eq("id", d.current_version_id).single(), "version");
  try {
    await draftEmail({ applicationId, draftId, template: d.template, redo: { chip: chip as RedoChip | undefined, note: note?.slice(0, 500), previous: cur } });
    revalidatePath(`/applications/${applicationId}`);
    return { ok: true };
  } catch (e) {
    return { error: `Couldn't redo the draft: ${(e as Error).message}` };
  }
}

/** Autosave. Consecutive edits within 10 minutes update one "riya_edit" version instead of piling up versions. */
export async function saveEdit(draftId: string, subject: string, body: string) {
  if (!isId(draftId)) return { error: "Unknown draft." };
  const db = admin();
  const d = must(await db.from("email_drafts").select("template, current_version_id, status").eq("id", draftId).single(), "draft");
  if (d.status === "sent") return { error: "This email has been sent and can't be edited." };
  const cur = must(await db.from("email_versions").select("id, n, origin, subject, body, created_at").eq("id", d.current_version_id).single(), "version");
  if (cur.subject === subject && cur.body === body) return { ok: true, unchanged: true };
  const report = lintEmail({ subject, body, template: d.template });
  const recent = cur.origin === "riya_edit" && Date.now() - new Date(cur.created_at).getTime() < 10 * 60 * 1000;
  if (recent) {
    must(await db.from("email_versions").update({ subject, body, lint_report: report }).eq("id", cur.id), "update version");
  } else {
    const v = must(await db.from("email_versions").insert({ draft_id: draftId, n: cur.n + 1, subject, body, origin: "riya_edit", lint_report: report }).select("id").single(), "insert version");
    must(await db.from("email_drafts").update({ current_version_id: v.id }).eq("id", draftId), "current");
  }
  return { ok: true, report };
}

export async function restoreVersion(applicationId: string, draftId: string, versionId: string) {
  if (![applicationId, draftId, versionId].every(isId)) return { error: "Unknown version." };
  const db = admin();
  const src = must(await db.from("email_versions").select("subject, body, lint_report").eq("id", versionId).eq("draft_id", draftId).single(), "version");
  const last = must(await db.from("email_versions").select("n").eq("draft_id", draftId).order("n", { ascending: false }).limit(1).single(), "last");
  const v = must(await db.from("email_versions").insert({ draft_id: draftId, n: last.n + 1, subject: src.subject, body: src.body, origin: "restore", lint_report: src.lint_report }).select("id").single(), "restore");
  must(await db.from("email_drafts").update({ current_version_id: v.id }).eq("id", draftId), "current");
  revalidatePath(`/applications/${applicationId}`);
  return { ok: true };
}

// ---------- Gmail and Calendar ----------

const err = (e: unknown) => ({ error: (e as Error).message });
const page = (id: string) => revalidatePath(`/applications/${id}`);

/** The two slots an invite would offer right now (shown in the send confirmation). */
export async function previewSlots(): Promise<{ error: string } | { ok: true; slots: Slot[]; labels: string[] }> {
  if (!(await currentUser())) return { error: "Sign in with Google first." };
  try {
    const slots = await offerSlots();
    return { ok: true, slots, labels: slots.map(formatSlot) };
  } catch (e) {
    return err(e);
  }
}

export async function sendDraftAction(applicationId: string, draftId: string, to: string, slots?: Slot[]) {
  const user = await currentUser();
  if (!user) return { error: "Sign in with Google first." };
  if (!isId(applicationId) || !isId(draftId)) return { error: "Unknown draft." };
  try {
    await sendDraft({ applicationId, draftId, to: to.trim(), slots, actor: user.email });
    page(applicationId);
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

export async function checkReplies(applicationId: string) {
  if (!(await currentUser())) return { error: "Sign in with Google first." };
  if (!isId(applicationId)) return { error: "Unknown application." };
  try {
    const found = await syncApplication(applicationId);
    page(applicationId);
    return { ok: true, found };
  } catch (e) {
    return err(e);
  }
}

export async function approvePendingAction(applicationId: string, threadId: string, body: string) {
  const user = await currentUser();
  if (!user) return { error: "Sign in with Google first." };
  if (!isId(applicationId) || !isId(threadId)) return { error: "Unknown thread." };
  try {
    await approvePending(threadId, body, user.email);
    page(applicationId);
    return { ok: true };
  } catch (e) {
    return err(e);
  }
}

export async function dismissPendingAction(applicationId: string, threadId: string) {
  const user = await currentUser();
  if (!user) return { error: "Sign in with Google first." };
  if (!isId(applicationId) || !isId(threadId)) return { error: "Unknown thread." };
  await dismissPending(threadId, user.email);
  page(applicationId);
  return { ok: true };
}

// ---------- partner decision ----------

export async function decide(applicationId: string, decision: string, note: string) {
  const user = await currentUser();
  if (!user) return { error: "Sign in with Google first." };
  if (!user.partner) return { error: "Only partners can decide. Add your email to PARTNER_EMAILS." };
  if (!isId(applicationId) || !["advance", "hold", "pass"].includes(decision)) return { error: "Unknown decision." };
  if (!note.trim()) return { error: "Add a note: every decision needs a reason." };
  const db = admin();
  must(await db.from("decisions").insert({ application_id: applicationId, decision, note: note.trim().slice(0, 2000), decided_by_email: user.email }), "decision");
  await db.from("timeline_events").insert({ application_id: applicationId, kind: "decided", payload: { decision, by: user.email } });
  page(applicationId);
  revalidatePath("/");
  return { ok: true };
}
