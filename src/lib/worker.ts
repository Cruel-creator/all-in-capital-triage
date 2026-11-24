// Queue processing shared by the long-running worker (scripts/worker.ts), the scheduled endpoint
// (/api/cron/queue, called every few minutes in production).
// - A failed run is retried with backoff (30s, 2m, 8m); after 3 attempts the application is needs_attention with the reason.
// - If the daily cost limit pauses the queue, the run is put back untouched (fresh attempt count) to run after the pause.
// - The sweeper fails orphaned "running" jobs and re-queues applications left processing or queued with no message.
import { admin, must } from "./db/admin";
import { QueuePausedError } from "./llm/gateway";
import { flush } from "./llm/langfuse";
import { runApplication } from "./pipeline/run-app";
import { MAX_ATTEMPTS, backoffSeconds, done, enqueue, giveUp, retryIn, take, waiting, type QueueMsg } from "./queue";
import { mailbox, sendMail } from "./google/client";

export const VT = 15 * 60; // a run gets 15 minutes before its message reappears

export async function limits() {
  return must(await admin().from("cost_limits").select("*").eq("id", 1).single(), "limits");
}

/** Runs one taken message to an outcome: done, retry later, back in the queue (paused), or needs_attention. */
export async function runMessage(m: QueueMsg, log: (s: string) => void = () => {}) {
  const db = admin();
  const appId = m.message.application_id;
  try {
    const r = await runApplication(appId);
    await done(m.msg_id);
    log(`done ${appId.slice(0, 8)}: ${r.action} (${r.total})`);
    return "done" as const;
  } catch (e) {
    const msg = (e as Error).message;
    if (e instanceof QueuePausedError) {
      await giveUp(m.msg_id);
      await enqueue([appId], 300);
      await db.from("applications").update({ status_reason: "Waiting: the daily cost limit paused the queue." }).eq("id", appId);
      log(`paused ${appId.slice(0, 8)}: ${msg}`);
      return "paused" as const;
    }
    if (m.read_ct >= MAX_ATTEMPTS) {
      await giveUp(m.msg_id);
      await db.from("applications").update({ status: "needs_attention", status_reason: `Failed after ${MAX_ATTEMPTS} attempts: ${msg}`.slice(0, 500), current_step: null }).eq("id", appId);
      log(`gave up ${appId.slice(0, 8)}: ${msg}`);
      return "failed" as const;
    }
    const wait = backoffSeconds(m.read_ct);
    await retryIn(m.msg_id, wait);
    await db.from("applications").update({ status: "queued", status_reason: `Retrying in ${Math.round(wait / 60) || 1} min after: ${msg}`.slice(0, 500) }).eq("id", appId);
    log(`retry ${appId.slice(0, 8)} in ${wait}s: ${msg}`);
    return "retry" as const;
  } finally {
    await flush().catch(() => {});
  }
}

/** Fails orphaned jobs and re-queues applications that lost their message. `active` = ids running in this process. */
export async function sweep(active: Set<string> = new Set(), log: (s: string) => void = () => {}) {
  const db = admin();
  const cutoff = new Date(Date.now() - VT * 1000 - 60_000).toISOString();
  const orphans = must(await db.from("jobs").update({ status: "failed", last_error: "Orphaned: the worker stopped mid-step", finished_at: new Date().toISOString() }).eq("status", "running").lt("started_at", cutoff).select("application_id"), "orphans");
  const queued = new Set((await waiting()).map((w) => w.application_id));
  const stuck = must(await db.from("applications").select("id, status").in("status", ["queued", "processing"]), "stuck")
    .filter((a) => !queued.has(a.id) && !active.has(a.id));
  if (stuck.length) await enqueue(stuck.map((a) => a.id));
  if (orphans.length || stuck.length) log(`sweep: ${orphans.length} orphaned job(s) failed, ${stuck.length} application(s) re-queued`);
  return { orphans: orphans.length, requeued: stuck.length };
}

/** One email per pause, only if an alert address is configured in cost_limits. */
export async function alertIfPaused(lim: { paused_at: string | null; pause_reason: string | null; alert_email: string | null; alerted_at: string | null }, log: (s: string) => void = () => {}) {
  if (!lim.paused_at || !lim.alert_email || (lim.alerted_at && lim.alerted_at >= lim.paused_at)) return;
  try {
    if (!(await mailbox())) return;
    await sendMail({ to: lim.alert_email, subject: "Triage queue paused: daily cost limit", body: `The pipeline queue paused at ${lim.paused_at}.\n\n${lim.pause_reason ?? ""}\n\nIt resumes on its own after midnight IST.` });
    await admin().from("cost_limits").update({ alerted_at: new Date().toISOString() }).eq("id", 1);
    log("alert sent");
  } catch (e) {
    log(`alert failed: ${(e as Error).message}`);
  }
}

/** Short-lived processing for serverless: sweep, then run up to `max` applications one after another within `budgetMs`. */
export async function processBatch(o: { max?: number; budgetMs?: number } = {}) {
  const started = Date.now();
  const lines: string[] = [];
  const log = (s: string) => lines.push(s);
  await sweep(new Set(), log).catch((e) => log(`sweep failed: ${(e as Error).message}`));
  const lim = await limits();
  if (lim.paused_at) {
    await alertIfPaused(lim, log);
    return { ran: 0, paused: true, waiting: (await waiting()).length, log: lines };
  }
  let ran = 0;
  // one at a time keeps a serverless run inside its time limit; an application takes about one to two minutes
  while (ran < (o.max ?? 1) && Date.now() - started < (o.budgetMs ?? 120_000)) {
    const [m] = await take(1, VT);
    if (!m) break;
    await runMessage(m, log);
    ran++;
  }
  return { ran, paused: false, waiting: (await waiting()).length, log: lines };
}
