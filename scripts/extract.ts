// pnpm extract [Company]: runs ingest-complete applications through extract_claims → reconcile, then writes
// seed/out/phase1-report.md comparing what the pipeline produced with the golden fixtures.
// No application can disappear: any failure marks it needs_attention with the reason.
import { config } from "dotenv";
config({ path: ".env.local" });
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { admin, must } from "../src/lib/db/admin";
import { extractClaims } from "../src/lib/pipeline/extract-claims";
import { runReconcile } from "../src/lib/pipeline/reconcile-step";
import { flush, startSpan, startTrace, traceUrl } from "../src/lib/llm/langfuse";
import { FIXTURES } from "../tests/golden/fixtures";

const db = admin();
// --reconcile-only re-runs the deterministic checks on stored claims (no model calls, no cost)
const reconcileOnly = process.argv.includes("--reconcile-only");
const only = process.argv.slice(2).find((a) => !a.startsWith("--"))?.toLowerCase();

(async () => {
  const apps = must(await db.from("applications").select("id, company_name").eq("is_synthetic", false).order("company_name"), "applications");
  const lines: string[] = ["# Phase 1 pipeline report", "", `Generated ${new Date().toISOString()}`, ""];
  let hits = 0;
  let total = 0;
  for (const app of apps.filter((a) => !only || a.company_name.toLowerCase() === only)) {
    const traceId = startTrace("phase1:extract+reconcile", { applicationId: app.id, company: app.company_name });
    await db.from("applications").update({ status: "processing", current_step: "extract_claims", status_reason: null }).eq("id", app.id);
    try {
      const docs = must(await db.from("documents").select("id, kind").eq("application_id", app.id), "documents");
      const counts: string[] = [];
      for (const d of reconcileOnly ? [] : docs) {
        const span = startSpan(traceId, `extract_claims:${d.kind}`);
        const r = await extractClaims({ applicationId: app.id, documentId: d.id, traceId, spanId: span.id });
        span.end(r);
        counts.push(`${d.kind}: ${r.kept} claims kept, ${r.dropped} dropped (quote not on page or unusable unit)`);
      }
      await db.from("applications").update({ current_step: "reconcile" }).eq("id", app.id);
      const span = startSpan(traceId, "reconcile");
      const { flags } = await runReconcile(app.id);
      span.end({ flags: flags.length });

      lines.push(`## ${app.company_name}`, "", ...counts.map((c) => `- ${c}`), `- Langfuse trace: ${traceUrl(traceId)}`, "");
      lines.push("| Check | Metric | Severity | Formula |", "|---|---|---|---|");
      for (const f of flags) lines.push(`| ${f.check} | ${f.metric} | ${f.severity} | ${f.formula.replace(/\|/g, "/")} |`);
      const fx = FIXTURES.find((x) => x.app.toLowerCase() === app.company_name.toLowerCase());
      if (fx) {
        lines.push("", "Golden flags:");
        for (const want of fx.expected.flags) {
          total++;
          const ok = flags.some((f) => f.check === want.check && f.metric === want.metric && (!want.severity || want.severity.includes(f.severity)));
          if (ok) hits++;
          lines.push(`- ${ok ? "PASS" : "MISS"} ${want.check} / ${want.metric}${want.severity ? ` (${want.severity.join("|")})` : ""}`);
        }
        if (fx.expected.clean) {
          const bad = flags.filter((f) => f.severity !== "info");
          total++;
          if (!bad.length) hits++;
          lines.push(`- ${bad.length ? "MISS" : "PASS"} no warn/red flags`);
        }
      }
      lines.push("");
      console.log(`${app.company_name}: ${counts.join("; ")}; ${flags.length} flags`);
    } catch (e) {
      const reason = `${(e as Error).name}: ${(e as Error).message}`.slice(0, 500);
      await db.from("applications").update({ status: "needs_attention", status_reason: reason }).eq("id", app.id);
      lines.push(`## ${app.company_name}`, "", `**needs_attention:** ${reason}`, "");
      console.error(`${app.company_name}: needs_attention: ${reason}`);
    } finally {
      await flush();
    }
  }
  lines.splice(4, 0, `**Golden flags caught by the live pipeline: ${hits}/${total}**`, "");
  mkdirSync(join(process.cwd(), "seed", "out"), { recursive: true });
  writeFileSync(join(process.cwd(), "seed", "out", "phase1-report.md"), lines.join("\n"));
  console.log(`report: seed/out/phase1-report.md (golden ${hits}/${total})`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
