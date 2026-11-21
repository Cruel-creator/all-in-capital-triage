// pnpm pipeline [Company] [--skip-research]: research → gates → score → rank for applications whose claims are extracted.
// Every step writes a jobs row; any failure marks the application needs_attention with the reason (none disappear).
// Writes seed/out/phase2-report.md comparing gates and buckets with the section 10 goldens.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { admin, must } from "../src/lib/db/admin";
import { runResearch } from "../src/lib/pipeline/research";
import { runGates } from "../src/lib/pipeline/gates";
import { runScore } from "../src/lib/pipeline/score";
import { runRank } from "../src/lib/pipeline/rank-step";
import { flush, startSpan, startTrace, traceUrl } from "../src/lib/llm/langfuse";
import { PIPELINE_EXPECTATIONS } from "../tests/golden/pipeline-expectations";

const db = admin();
const skipResearch = process.argv.includes("--skip-research");
const reportOnly = process.argv.includes("--report-only");
const only = process.argv.slice(2).find((a) => !a.startsWith("--"))?.toLowerCase();

async function step<T>(appId: string, name: string, traceId: string, fn: (spanId: string) => Promise<T>): Promise<T> {
  const job = must(await db.from("jobs").insert({ application_id: appId, step: name, status: "running", started_at: new Date().toISOString(), langfuse_trace_id: traceId }).select("id").single(), "job");
  await db.from("applications").update({ current_step: name, status: "processing" }).eq("id", appId);
  const span = startSpan(traceId, name);
  try {
    const r = await fn(span.id);
    span.end(r);
    await db.from("jobs").update({ status: "done", finished_at: new Date().toISOString(), attempts: 1 }).eq("id", job.id);
    return r;
  } catch (e) {
    span.end(null, "ERROR", (e as Error).message);
    await db.from("jobs").update({ status: "failed", last_error: (e as Error).message.slice(0, 500), finished_at: new Date().toISOString(), attempts: 1 }).eq("id", job.id);
    throw e;
  }
}

(async () => {
  const apps = must(await db.from("applications").select("id, company_name").eq("is_synthetic", false).order("company_name"), "applications");
  const lines = ["# Phase 2 pipeline report", "", `Generated ${new Date().toISOString()}`, ""];
  let hard = 0;
  let hardOk = 0;
  let soft = 0;
  let softOk = 0;
  for (const app of apps.filter((a) => !only || a.company_name.toLowerCase() === only)) {
    const traceId = startTrace("phase2:research+gates+score+rank", { applicationId: app.id, company: app.company_name });
    try {
      let research: { configured: boolean; queries: number; results: number; findings: number; matched: number } | null;
      let g: { sector: string; gates: Record<string, boolean>; attention: string[] };
      let rk: { total: number; action: "take_call" | "dig" | "pass"; bucket: "clear" | "flagged" | "outside_mandate"; fit: string; lens: string | null; coverage: number };
      if (reportOnly) {
        // rebuild the report from what is stored: no model calls, no writes
        const a = must(await db.from("applications").select("sector_inferred").eq("id", app.id).single(), "app");
        const s = must(await db.from("scores").select("total, written_fit, lens, evidence_coverage_pct").eq("application_id", app.id).eq("view", "revealed").single(), "score");
        const r = must(await db.from("recommendations").select("action, bucket").eq("application_id", app.id).single(), "rec");
        const gr = must(await db.from("gates").select("gate, tripped").eq("application_id", app.id), "gates");
        const q = must(await db.from("research_queries").select("result_count, engine").eq("application_id", app.id), "queries");
        const f = must(await db.from("research_findings").select("is_match").eq("application_id", app.id), "findings");
        research = { configured: q.some((x) => x.engine === "firecrawl"), queries: q.filter((x) => x.engine === "firecrawl").length, results: q.reduce((n, x) => n + x.result_count, 0), findings: f.length, matched: f.filter((x) => x.is_match).length };
        g = { sector: a.sector_inferred ?? "?", gates: Object.fromEntries(gr.map((x) => [x.gate, x.tripped])), attention: [] };
        rk = { total: Number(s.total), action: r.action, bucket: r.bucket, fit: s.written_fit, lens: s.lens, coverage: s.evidence_coverage_pct };
      } else {
        research = skipResearch ? null : await step(app.id, "research", traceId, (spanId) => runResearch({ applicationId: app.id, traceId, spanId }));
        const gg = await step(app.id, "gates", traceId, (spanId) => runGates({ applicationId: app.id, traceId, spanId }));
        const sc = await step(app.id, "score", traceId, (spanId) => runScore({ applicationId: app.id, traceId, spanId, sector: gg.sector, gates: gg.gates }));
        rk = await step(app.id, "rank", traceId, async () => runRank(app.id));
        g = gg;
        if (gg.attention.length || sc.attention.length) console.log(`${app.company_name}: needs attention: ${[...gg.attention, ...sc.attention].join("; ")}`);
      }

      const gateRows = must(await db.from("gates").select("gate, tripped, reasons").eq("application_id", app.id).order("gate"), "gates");
      lines.push(`## ${app.company_name}`, "");
      lines.push(`- **${rk.total.toFixed(1)}** · ${rk.action} · bucket ${rk.bucket} · sector ${g.sector}${rk.lens ? ` (lens ${rk.lens})` : ""} · written fit ${rk.fit} · coverage ${rk.coverage}%`);
      if (research) lines.push(`- research: ${research.configured ? `${research.queries} queries, ${research.results} results, ${research.matched}/${research.findings} findings matched` : "not configured"}`);
      lines.push(`- Langfuse: ${traceUrl(traceId)}`, "");
      for (const gr of gateRows)
        lines.push(`- ${gr.gate} ${gr.tripped ? "**tripped**" : "clear"}${gr.tripped ? ": " + (gr.reasons as { text: string }[]).map((r) => r.text).join(" | ") : ""}`);
      const exp = PIPELINE_EXPECTATIONS.find((e) => e.app === app.company_name);
      if (exp) {
        lines.push("", "Golden checks:");
        const tripped = new Set(gateRows.filter((x) => x.tripped).map((x) => x.gate));
        for (const gname of exp.mustTrip) {
          hard++;
          const ok = tripped.has(gname);
          if (ok) hardOk++;
          lines.push(`- ${ok ? "PASS" : "MISS"} ${gname} trips`);
        }
        for (const gname of exp.mustNotTrip ?? []) {
          hard++;
          const ok = !tripped.has(gname);
          if (ok) hardOk++;
          lines.push(`- ${ok ? "PASS" : "MISS"} ${gname} stays clear`);
        }
        if (exp.conflictWith) {
          hard++;
          const g3 = gateRows.find((x) => x.gate === "G3");
          const ok = !!g3?.tripped && JSON.stringify(g3.reasons).includes(exp.conflictWith);
          if (ok) hardOk++;
          lines.push(`- ${ok ? "PASS" : "MISS"} G3 names ${exp.conflictWith}`);
        }
        if (exp.bucket) {
          hard++;
          const ok = exp.bucket.includes(rk.bucket);
          if (ok) hardOk++;
          lines.push(`- ${ok ? "PASS" : "MISS"} bucket ${exp.bucket.join("|")} (got ${rk.bucket})`);
        }
        soft++;
        const reach = exp.shouldReach.includes(rk.action);
        if (reach) softOk++;
        lines.push(`- ${reach ? "PASS" : "DIFF"} should reach ${exp.shouldReach.join("|")} (got ${rk.action}, score ${rk.total.toFixed(1)}) [scores are not fixed]`);
      }
      lines.push("");
      console.log(`${app.company_name.padEnd(11)} ${rk.total.toFixed(1)} ${rk.action.padEnd(9)} ${rk.bucket.padEnd(15)} gates ${Object.entries(g.gates).filter(([, v]) => v).map(([k]) => k).join(",") || "-"}`);
    } catch (e) {
      const reason = `${(e as Error).name}: ${(e as Error).message}`.slice(0, 500);
      await db.from("applications").update({ status: "needs_attention", status_reason: reason }).eq("id", app.id);
      lines.push(`## ${app.company_name}`, "", `**needs_attention:** ${reason}`, "");
      console.error(`${app.company_name}: needs_attention: ${reason}`);
    } finally {
      await flush();
    }
  }
  lines.splice(4, 0, `**Gate and bucket goldens: ${hardOk}/${hard}** · recommendations matching "should reach": ${softOk}/${soft}`, "");
  mkdirSync(join(process.cwd(), "seed", "out"), { recursive: true });
  writeFileSync(join(process.cwd(), "seed", "out", "phase2-report.md"), lines.join("\n"));
  console.log(`report: seed/out/phase2-report.md (gates/buckets ${hardOk}/${hard}, should-reach ${softOk}/${soft})`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
