// pnpm worker [--once]: drains the pipeline queue, up to cost_limits.max_in_flight applications at a time.
// - A failed run is retried with backoff (30s, 2m, 8m); after 3 attempts the application is needs_attention with the reason.
// - If the daily cost limit pauses the queue, the run is put back untouched and the worker waits (alert email if configured).
// - Every minute a sweeper fails orphaned "running" jobs and re-queues applications left processing or queued with no message.
// --once: exit when the queue is empty and nothing is in flight (used by the volume test).
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { admin, must } from "../src/lib/db/admin";
import { QueuePausedError } from "../src/lib/llm/gateway";
import { flush } from "../src/lib/llm/langfuse";
import { runApplication } from "../src/lib/pipeline/run-app";
import { MAX_ATTEMPTS, backoffSeconds, done, enqueue, giveUp, retryIn, take, waiting, type QueueMsg } from "../src/lib/queue";
import { mailbox, sendMail } from "../src/lib/google/client";

const db = admin();
const once = process.argv.includes("--once");
const VT = 15 * 60; // a run gets 15 minutes before its message reappears for another worker
const inflight = new Map<number, string>();
let stopping = false;
let lastSweep = 0;
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function attention(appId: string, reason: string) {
  await db.from("applications").update({ status: "needs_attention", status_reason: reason.slice(0, 500), current_step: null }).eq("id", appId);
}

async function run(m: QueueMsg) {
  const appId = m.message.application_id;
  try {
    const r = await runApplication(appId);
    await done(m.msg_id);
    log(`done ${appId.slice(0, 8)}: ${r.action} (${r.total})`);
  } catch (e) {
    const msg = (e as Error).message;
    if (e instanceof QueuePausedError) {
      // not this application's fault: put it back with a fresh attempt count, to run after the pause is lifted
      await giveUp(m.msg_id);
      await enqueue([appId], 300);
      await db.from("applications").update({ status_reason: "Waiting: the daily cost limit paused the queue." }).eq("id", appId);
      log(`paused ${appId.slice(0, 8)}: ${msg}`);
    } else if (m.read_ct >= MAX_ATTEMPTS) {
      await giveUp(m.msg_id);
      await attention(appId, `Failed after ${MAX_ATTEMPTS} attempts: ${msg}`);
      log(`gave up ${appId.slice(0, 8)}: ${msg}`);
    } else {
      const wait = backoffSeconds(m.read_ct);
      await retryIn(m.msg_id, wait);
      await db.from("applications").update({ status: "queued", status_reason: `Retrying in ${Math.round(wait / 60) || 1} min after: ${msg}`.slice(0, 500) }).eq("id", appId);
      log(`retry ${appId.slice(0, 8)} in ${wait}s: ${msg}`);
    }
  } finally {
    inflight.delete(m.msg_id);
    await flush().catch(() => {});
  }
}

/** Fails orphaned jobs and re-queues applications that lost their message. */
async function sweep() {
  const cutoff = new Date(Date.now() - VT * 1000 - 60_000).toISOString();
  const orphans = must(await db.from("jobs").update({ status: "failed", last_error: "Orphaned: the worker stopped mid-step", finished_at: new Date().toISOString() }).eq("status", "running").lt("started_at", cutoff).select("application_id"), "orphans");
  const queued = new Set((await waiting()).map((w) => w.application_id));
  const active = new Set(inflight.values());
  const stuck = must(await db.from("applications").select("id, status").in("status", ["queued", "processing"]), "stuck").filter((a) => !queued.has(a.id) && !active.has(a.id));
  if (stuck.length) await enqueue(stuck.map((a) => a.id));
  if (orphans.length || stuck.length) log(`sweep: ${orphans.length} orphaned job(s) failed, ${stuck.length} application(s) re-queued`);
}

/** One email per pause, only if an alert address is configured (Cost & ops page). */
async function alertIfPaused(lim: { paused_at: string | null; pause_reason: string | null; alert_email: string | null; alerted_at: string | null }) {
  if (!lim.paused_at || !lim.alert_email || (lim.alerted_at && lim.alerted_at >= lim.paused_at)) return;
  try {
    if (!(await mailbox())) return;
    await sendMail({ to: lim.alert_email, subject: "Triage queue paused: daily cost limit", body: `The pipeline queue paused at ${lim.paused_at}.\n\n${lim.pause_reason ?? ""}\n\nResume it from the Cost & ops page once you have checked the spend.` });
    await db.from("cost_limits").update({ alerted_at: new Date().toISOString() }).eq("id", 1);
    log("alert sent");
  } catch (e) {
    log(`alert failed: ${(e as Error).message}`);
  }
}

async function main() {
  process.on("SIGINT", () => { stopping = true; log("stopping after in-flight runs finish…"); });
  log(`worker started${once ? " (--once)" : ""}`);
  let failures = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastSweep > 60_000) { lastSweep = Date.now(); await sweep().catch((e) => log(`sweep failed: ${(e as Error).message}`)); }
      const lim = must(await db.from("cost_limits").select("*").eq("id", 1).single(), "limits");
      if (lim.paused_at) {
        await alertIfPaused(lim);
        if (once && inflight.size === 0) { log("queue paused by the daily cost limit; exiting (--once)"); break; }
        await sleep(15_000);
        continue;
      }
      const msgs = await take(Number(lim.max_in_flight) - inflight.size, VT);
      for (const m of msgs) {
        if ([...inflight.values()].includes(m.message.application_id)) { await retryIn(m.msg_id, 60); continue; } // never run one application twice at once
        inflight.set(m.msg_id, m.message.application_id);
        void run(m);
      }
      failures = 0;
      if (once && !msgs.length && inflight.size === 0 && (await waiting()).length === 0) break;
      await sleep(msgs.length ? 500 : 3000);
    } catch (e) {
      // a dropped connection or a database blip must not kill the worker: back off and try again
      failures++;
      log(`loop error (${failures}): ${(e as Error).message}`);
      await sleep(Math.min(60_000, 5_000 * failures));
    }
  }
  while (inflight.size) await sleep(1000);
  log("worker stopped");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
