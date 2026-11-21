"use server";
// Settings (screen 8): rubric and rules saved as new versions; every score records the version it used.
// Weights and thresholds apply on re-rank (no model calls); anchors and rules apply on the next scoring run.
import { revalidatePath } from "next/cache";
import { admin, must } from "@/lib/db/admin";
import { currentUser } from "@/lib/google/session";
import { applyRubricEdit, rubricProblems, type RubricEdit } from "@/lib/rubric-edit";
import { runRank } from "@/lib/pipeline/rank-step";

async function partner(): Promise<{ error: string } | { email: string }> {
  const u = await currentUser();
  if (!u) return { error: "Sign in with Google first." };
  if (!u.partner) return { error: "Only partners can change the rubric. Add your email to PARTNER_EMAILS." };
  return { email: u.email };
}

export async function saveRubric(edit: RubricEdit, note: string) {
  const who = await partner();
  if ("error" in who) return who;
  if (!note.trim()) return { error: "Say what changed and why, in one line." };
  const problems = rubricProblems(edit);
  if (problems.length) return { error: problems.join(" ") };
  const db = admin();
  const cur = must(await db.from("rubric_versions").select("id, version, config").eq("is_active", true).single(), "active rubric");
  const last = must(await db.from("rubric_versions").select("version").order("version", { ascending: false }).limit(1).single(), "last version");
  const config = { ...applyRubricEdit(cur.config, edit), version: last.version + 1 };
  must(await db.from("rubric_versions").update({ is_active: false }).eq("id", cur.id), "deactivate");
  const ins = await db.from("rubric_versions").insert({ version: last.version + 1, config, note: `${note.trim()} (${who.email})`, is_active: true });
  if (ins.error) {
    await db.from("rubric_versions").update({ is_active: true }).eq("id", cur.id); // put the old one back
    return { error: `Couldn't save: ${ins.error.message}` };
  }
  revalidatePath("/settings");
  return { ok: true, version: last.version + 1 };
}

export async function saveRules(rules: { id: string; text: string }[], note: string) {
  const who = await partner();
  if ("error" in who) return who;
  if (!note.trim()) return { error: "Say what changed and why, in one line." };
  if (rules.some((r) => !r.text.trim())) return { error: "A rule can't be empty." };
  const db = admin();
  const cur = must(await db.from("thesis_versions").select("id, version, written, revealed").eq("is_active", true).single(), "active thesis");
  const last = must(await db.from("thesis_versions").select("version").order("version", { ascending: false }).limit(1).single(), "last version");
  const revealed = { ...cur.revealed, rules: (cur.revealed.rules as { id: string; text: string }[]).map((r) => ({ ...r, text: rules.find((x) => x.id === r.id)?.text.trim() ?? r.text })) };
  must(await db.from("thesis_versions").update({ is_active: false }).eq("id", cur.id), "deactivate");
  const ins = await db.from("thesis_versions").insert({ version: last.version + 1, written: cur.written, revealed, note: `${note.trim()} (${who.email})`, is_active: true });
  if (ins.error) {
    await db.from("thesis_versions").update({ is_active: true }).eq("id", cur.id);
    return { error: `Couldn't save: ${ins.error.message}` };
  }
  revalidatePath("/settings");
  return { ok: true, version: last.version + 1 };
}

/** Re-ranks every scored application with the active weights and thresholds. No model calls. */
export async function rerankAll() {
  const who = await partner();
  if ("error" in who) return who;
  const db = admin();
  const apps = must(await db.from("applications").select("id").eq("status", "scored"), "applications");
  const failed: string[] = [];
  for (const a of apps) await runRank(a.id).catch(() => failed.push(a.id));
  revalidatePath("/");
  return failed.length ? { error: `${failed.length} of ${apps.length} couldn't be re-ranked.` } : { ok: true, count: apps.length };
}
