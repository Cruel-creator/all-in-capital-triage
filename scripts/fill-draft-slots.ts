// pnpm tsx scripts/fill-draft-slots.ts — one-off: unsent call invites written before slots were pre-filled still show
// {slot_1}/{slot_2}. Fill them with Riya's two free times (same rule as new drafts) as a NEW version, so nothing is lost.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { admin, must } from "../src/lib/db/admin";
import { fillSlots, suggestSlots } from "../src/lib/google/outreach";
import { lintEmail } from "../src/lib/email/lint";

async function main() {
  const db = admin();
  const drafts = must(await db.from("email_drafts").select("id, application_id, current_version_id").eq("template", "invite").eq("status", "draft"), "drafts");
  let filled = 0;
  for (const d of drafts) {
    const v = must(await db.from("email_versions").select("n, subject, body").eq("id", d.current_version_id).single(), "version");
    if (!v.body.includes("{slot_1}")) continue;
    const slots = await suggestSlots();
    if (slots.length !== 2) continue;
    const body = fillSlots(v.body, slots);
    const last = must(await db.from("email_versions").select("n").eq("draft_id", d.id).order("n", { ascending: false }).limit(1).single(), "last");
    const nv = must(await db.from("email_versions").insert({ draft_id: d.id, n: last.n + 1, subject: v.subject, body, origin: "generated", lint_report: lintEmail({ subject: v.subject, body, template: "invite" }) }).select("id").single(), "new version");
    must(await db.from("email_drafts").update({ current_version_id: nv.id, offered_slots: slots }).eq("id", d.id), "draft");
    filled++;
  }
  console.log(JSON.stringify({ unsentInvites: drafts.length, filled }));
}
main().catch((e) => { console.error((e as Error).message); process.exitCode = 1; });
