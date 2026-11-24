// pnpm tsx scripts/b6/load-examples.ts — loads Riya's 38 real TRAINING emails (names masked as [F1]) into style_examples,
// so production call invites get her real emails as examples (B6: 90% send-as-is with examples, 70% without).
// Never the sealed test rows. Dates become {slot_1}/{slot_2}, as the app keeps placeholders until send. Every row is
// tagged in `diff` with SOURCE, so the set can be removed with: delete from style_examples where diff = '<SOURCE>'.
// Re-running replaces the set instead of duplicating it.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { readFileSync } from "node:fs";
import { admin, must } from "../../src/lib/db/admin";
import { lintEmail } from "../../src/lib/email/lint";
import { OUT, slotsIn, type Example } from "./common";

const SOURCE = "seed: B6 Loop 2 export, real, names masked";
const read = (f: string) => readFileSync(`${OUT}/${f}`, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Example);

async function main() {
  const sealed = new Set(read("test.sealed.jsonl").map((e) => e.id));
  const train = read("train.real.jsonl").filter((e) => !sealed.has(e.id));
  const withPlaceholders = (t: string) => {
    const [a, b] = slotsIn(t);
    return a && b ? t.split(a).join("{slot_1}").split(b).join("{slot_2}") : t;
  };
  const all = train.map((e) => ({ id: e.id, template: "invite", draft_text: withPlaceholders(e.system_draft ?? ""), sent_text: withPlaceholders(e.target), diff: SOURCE }));
  // an example the production linter rejects would teach the model something the linter then throws away: skip it
  const skipped = all.map((r) => ({ id: r.id, rules: lintEmail({ subject: "Company: a call?", body: r.sent_text, template: "invite" }).issues.map((i) => i.rule) })).filter((x) => x.rules.length);
  const rows = all.filter((r) => !skipped.some((s) => s.id === r.id)).map(({ id: _id, ...r }) => { void _id; return r; });
  const leftDates = rows.filter((r) => /(?:Mon|Tues|Wednes|Thurs|Fri)day \d/.test(r.sent_text)).length;
  const db = admin();
  must(await db.from("style_examples").delete().eq("diff", SOURCE), "clear previous set");
  must(await db.from("style_examples").insert(rows), "insert examples");
  console.log(JSON.stringify({ loaded: rows.length, skipped, datesLeftInExamples: leftDates }));
}
main().catch((e) => { console.error((e as Error).message); process.exitCode = 1; });
