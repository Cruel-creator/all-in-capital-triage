// pnpm tsx scripts/load-test.ts [n] — L8 "Send 20 applications at once". Fires n small model calls through the real
// gateway at the same moment (with its retries) and reports each as success or failure, with error type and time.
// Uses a tiny synthetic prompt (no founder data) at temperature 0.3, so the cache doesn't answer for it. Cost: well under ₹1.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { z } from "zod";
import { callModel } from "../src/lib/llm/gateway";
import { flush } from "../src/lib/llm/langfuse";

const N = Number(process.argv[2] ?? 20);
const Out = z.object({ score: z.number().min(1).max(10), call: z.enum(["advance", "pass"]) });

async function one(i: number) {
  const t0 = Date.now();
  try {
    await callModel({
      step: "loadtest",
      prompt: { name: "loadtest", version: 1, system: 'Score a made-up startup 1-10 and say advance or pass. Return JSON only: {"score": n, "call": "advance"|"pass"}', user: `Startup #${i}: a pre-seed app with ${100 + i * 7} weekly users and ${10 + i}% month-2 retention.` },
      schema: Out,
      temperature: 0.3,
    });
    return { i, ok: true, ms: Date.now() - t0, error: "" };
  } catch (e) {
    const m = (e as Error).message;
    const type = /429/.test(m) ? "429 too many requests" : /5\d\d/.test(m) ? "provider 5xx" : /paused/i.test(m) ? "spend cap" : /schema/.test(m) ? "bad output" : "other";
    return { i, ok: false, ms: Date.now() - t0, error: `${type}: ${m.slice(0, 80)}` };
  }
}

async function main() {
  const t0 = Date.now();
  const results = await Promise.all(Array.from({ length: N }, (_, i) => one(i + 1)));
  for (const r of results) console.log(`#${String(r.i).padStart(2)} ${r.ok ? "ok  " : "FAIL"} ${String(r.ms).padStart(6)} ms ${r.error}`);
  const ok = results.filter((r) => r.ok);
  const ms = ok.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`\n${ok.length} of ${N} succeeded in ${((Date.now() - t0) / 1000).toFixed(1)} s · median ${ms[Math.floor(ms.length / 2)] ?? "-"} ms · slowest ${ms.at(-1) ?? "-"} ms`);
  await flush();
}
main().catch((e) => { console.error((e as Error).message); process.exitCode = 1; });
