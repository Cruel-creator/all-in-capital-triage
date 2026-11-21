// pnpm worker [--once]: drains the pipeline queue locally, up to cost_limits.max_in_flight applications at a time.
// The rules (retries, pause handling, sweeper, alert) live in src/lib/worker.ts and are shared with the scheduled
// production endpoint. --once: exit when the queue is empty and nothing is in flight (used by the volume test).
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { retryIn, take, waiting } from "../src/lib/queue";
import { VT, alertIfPaused, limits, runMessage, sweep } from "../src/lib/worker";

const once = process.argv.includes("--once");
const inflight = new Map<number, string>();
let stopping = false;
let lastSweep = 0;
const log = (s: string) => console.log(new Date().toISOString().slice(11, 19), s);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  process.on("SIGINT", () => { stopping = true; log("stopping after in-flight runs finish…"); });
  log(`worker started${once ? " (--once)" : ""}`);
  let failures = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastSweep > 60_000) { lastSweep = Date.now(); await sweep(new Set(inflight.values()), log).catch((e) => log(`sweep failed: ${(e as Error).message}`)); }
      const lim = await limits();
      if (lim.paused_at) {
        await alertIfPaused(lim, log);
        if (once && inflight.size === 0) { log("queue paused by the daily cost limit; exiting (--once)"); break; }
        await sleep(15_000);
        continue;
      }
      const msgs = await take(Number(lim.max_in_flight) - inflight.size, VT);
      for (const m of msgs) {
        if ([...inflight.values()].includes(m.message.application_id)) { await retryIn(m.msg_id, 60); continue; } // never run one application twice at once
        inflight.set(m.msg_id, m.message.application_id);
        void runMessage(m, log).finally(() => inflight.delete(m.msg_id));
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
