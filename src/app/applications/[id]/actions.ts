"use server";
// Composer actions. None of these send email: sending is a separate, explicit action (Gmail, below in Phase 3).
import { revalidatePath } from "next/cache";
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
