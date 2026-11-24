// pnpm tsx scripts/cost-report.ts — L8 "Measure every rupee: per run, per day, per month". The founder doesn't want cost
// on screen, so this is the operator's view: spend by day (IST) and month, by step, per application, and cache savings,
// with the daily cap for comparison. Reads llm_calls only.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { admin, must } from "../src/lib/db/admin";

const INR = Number(process.env.USD_INR ?? 85);
const ist = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600e3).toISOString();

async function main() {
  const db = admin();
  const since = new Date(Date.now() - 62 * 864e5).toISOString();
  const rows: { step: string; cost_usd: number; created_at: string; application_id: string | null; cached: boolean; ok: boolean }[] = [];
  for (let from = 0; ; from += 1000) {
    const page = must(await db.from("llm_calls").select("step, cost_usd, created_at, application_id, cached, ok").gte("created_at", since).order("created_at").range(from, from + 999), "llm_calls");
    rows.push(...(page as typeof rows));
    if (page.length < 1000) break;
  }
  const lim = (await db.from("cost_limits").select("daily_usd, paused_at").eq("id", 1).maybeSingle()).data;
  const sum = (xs: typeof rows) => xs.reduce((a, r) => a + Number(r.cost_usd ?? 0), 0);
  const fmt = (usd: number) => `$${usd.toFixed(4)} (₹${(usd * INR).toFixed(2)})`;
  const group = (key: (r: (typeof rows)[number]) => string) => {
    const m = new Map<string, typeof rows>();
    for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
    return [...m.entries()];
  };

  console.log(`Last 62 days: ${rows.length} model calls, ${fmt(sum(rows))}. Daily cap: $${lim?.daily_usd ?? "?"}${lim?.paused_at ? " (queue paused now)" : ""}.\n`);
  console.log("By month (IST)");
  for (const [k, xs] of group((r) => ist(r.created_at).slice(0, 7))) console.log(`  ${k}  ${String(xs.length).padStart(5)} calls  ${fmt(sum(xs))}`);
  console.log("\nLast 7 days (IST)");
  for (const [k, xs] of group((r) => ist(r.created_at).slice(0, 10)).slice(-7)) console.log(`  ${k}  ${String(xs.length).padStart(5)} calls  ${fmt(sum(xs))}`);
  console.log("\nBy step");
  for (const [k, xs] of group((r) => r.step.split(":")[0]).sort((a, b) => sum(b[1]) - sum(a[1]))) console.log(`  ${k.padEnd(16)} ${String(xs.length).padStart(5)} calls  ${fmt(sum(xs))}`);
  const apps = group((r) => r.application_id ?? "").filter(([k]) => k);
  if (apps.length) {
    const per = apps.map(([, xs]) => sum(xs)).sort((a, b) => a - b);
    console.log(`\nPer application (${apps.length} apps): median ${fmt(per[Math.floor(per.length / 2)])}, highest ${fmt(per.at(-1)!)}`);
  }
  const hits = rows.filter((r) => r.cached).length;
  console.log(`\nCache: ${hits} answers reused instead of paid for. Failed calls: ${rows.filter((r) => !r.ok).length}.`);
}
main().catch((e) => { console.error((e as Error).message); process.exitCode = 1; });
