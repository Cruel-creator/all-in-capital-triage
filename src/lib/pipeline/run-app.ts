// One application, end to end: extract claims → check the numbers → research → gates → score → rank.
// Every step writes a jobs row. Steps already done for this application are skipped unless `force` is set,
// so a retry resumes where the last attempt stopped. Throws on failure; the caller decides retry vs needs_attention.
import { admin, must } from "../db/admin";
import { startSpan, startTrace } from "../llm/langfuse";
import { extractClaims } from "./extract-claims";
import { runReconcile } from "./reconcile-step";
import { runResearch } from "./research";
import { runGates } from "./gates";
import { runScore } from "./score";
import { runRank } from "./rank-step";

export const STEPS = ["extract_claims", "reconcile", "research", "gates", "score", "rank"] as const;
export type Step = (typeof STEPS)[number];

async function step<T>(appId: string, name: Step, traceId: string, fn: (spanId: string) => Promise<T>): Promise<T> {
  const db = admin();
  const job = must(await db.from("jobs").insert({ application_id: appId, step: name, status: "running", started_at: new Date().toISOString(), langfuse_trace_id: traceId }).select("id").single(), "job");
  await db.from("applications").update({ current_step: name, status: "processing", status_reason: null }).eq("id", appId);
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

/** Steps that finished since the most recent failure: a retry can skip these. */
async function doneSteps(appId: string): Promise<Set<Step>> {
  const rows = must(await admin().from("jobs").select("step, status, created_at").eq("application_id", appId).order("created_at", { ascending: false }).limit(40), "jobs");
  const done = new Set<Step>();
  for (const r of rows) {
    if (r.status === "done") done.add(r.step as Step);
    else break; // anything before a failure or a running job is stale
  }
  return done;
}

export async function runApplication(appId: string, o: { force?: boolean; skipResearch?: boolean } = {}) {
  const db = admin();
  const app = must(await db.from("applications").select("id, company_name").eq("id", appId).single(), "application");
  const traceId = startTrace("pipeline:application", { applicationId: appId, company: app.company_name });
  const skip = o.force ? new Set<Step>() : await doneSteps(appId);
  const has = await db.from("claims").select("id", { count: "exact", head: true }).eq("application_id", appId);

  if (!skip.has("extract_claims") && (o.force || !(has.count ?? 0))) {
    await step(appId, "extract_claims", traceId, async (spanId) => {
      const docs = must(await db.from("documents").select("id").eq("application_id", appId), "documents");
      if (!docs.length) throw new Error("No documents to read for this application.");
      let kept = 0;
      for (const d of docs) kept += (await extractClaims({ applicationId: appId, documentId: d.id, traceId, spanId })).kept;
      return { kept };
    });
  }
  if (!skip.has("reconcile")) await step(appId, "reconcile", traceId, async () => ({ flags: (await runReconcile(appId)).flags.length }));
  if (!skip.has("research") && !o.skipResearch) await step(appId, "research", traceId, (spanId) => runResearch({ applicationId: appId, traceId, spanId }));
  const g = await step(appId, "gates", traceId, (spanId) => runGates({ applicationId: appId, traceId, spanId }));
  await step(appId, "score", traceId, (spanId) => runScore({ applicationId: appId, traceId, spanId, sector: g.sector, gates: g.gates }));
  const rk = await step(appId, "rank", traceId, async () => runRank(appId));
  await db.from("applications").update({ status: "scored", current_step: null, status_reason: null }).eq("id", appId);
  return { traceId, action: rk.action, total: rk.total, bucket: rk.bucket };
}
