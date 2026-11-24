// pnpm tsx scripts/b6/lint-check.ts — do the harness's variant C/E drafts pass the PRODUCTION linter (src/lib/email/lint.ts)?
// The harness filled in real dates; the app keeps {slot_1}/{slot_2} until send, so the dates are put back as placeholders.
import { readFileSync } from "node:fs";
import { lintEmail } from "../../src/lib/email/lint";
import { OUT, slotsIn } from "./common";

const { rows } = JSON.parse(readFileSync(`${OUT}/eval.results.json`, "utf8")) as { rows: { id: string; variant: string; email: string }[] };
for (const v of ["C", "E"]) {
  const mine = rows.filter((r) => r.variant === v && r.email);
  const fails = mine.map((r) => {
    const [s1, s2] = slotsIn(r.email);
    const body = s1 && s2 ? r.email.split(s1).join("{slot_1}").split(s2).join("{slot_2}") : r.email;
    const rep = lintEmail({ subject: "Company: a call next week?", body, template: "invite" });
    return { id: r.id, issues: rep.issues.map((i) => i.rule) };
  }).filter((x) => x.issues.length);
  console.log(`${v}: ${mine.length - fails.length}/${mine.length} pass the production linter`, fails.length ? JSON.stringify(fails) : "");
}
