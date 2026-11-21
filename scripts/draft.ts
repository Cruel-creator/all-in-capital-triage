// pnpm draft [Company] [invite|dig|pass]: drafts emails (no sending) and prints them with their lint result.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { admin, must } from "../src/lib/db/admin";
import { draftEmail } from "../src/lib/pipeline/draft-email";
import type { Template } from "../src/lib/email/lint";

const [company, template] = process.argv.slice(2).filter((a) => !a.startsWith("--"));

(async () => {
  const db = admin();
  const apps = must(await db.from("applications").select("id, company_name").order("company_name"), "applications").filter((a) => !company || a.company_name.toLowerCase() === company.toLowerCase());
  for (const app of apps) {
    const r = await draftEmail({ applicationId: app.id, template: template as Template | undefined });
    const v = must(await db.from("email_versions").select("subject, body").eq("id", r.versionId).single(), "version");
    console.log(`\n===== ${app.company_name} · lint ${r.report.ok ? "OK" : "FAIL"} · ${r.report.words} words${r.report.issues.length ? " · " + r.report.issues.map((i) => `${i.rule}: ${i.detail}`).join("; ") : ""}\nSubject: ${v.subject}\n\n${v.body}`);
  }
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
