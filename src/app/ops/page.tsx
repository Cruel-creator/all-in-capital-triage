// Cost & ops (build prompt §9.7, Case 4 Tasks 4-5): spend per call, per application, per day/week/month; the daily
// limit that pauses the queue; what's queued and running; a Langfuse trace for every run. Numbers belong here.
import Link from "next/link";
import { admin, must } from "@/lib/db/admin";
import { currentUser } from "@/lib/google/session";
import { istDayStart } from "@/lib/llm/gateway";
import { traceUrl } from "@/lib/llm/langfuse";
import { waiting } from "@/lib/queue";
import { Badge, fmtDate } from "@/components/ui";
import { Limits } from "./limits";

export const dynamic = "force-dynamic";

const usd = (n: number) => (n < 0.01 && n > 0 ? "<$0.01" : `$${n.toFixed(2)}`);
const STEP: Record<string, string> = {
  extract_claims: "Read the deck and form", score: "Score the criteria", research: "Web research", draft_email: "Draft emails",
  "gates:classify": "Sector check", "gates:gate_regulatory": "Regulatory gate", "gates:gate_conflict": "Conflict gate", "gates:gate_integrity": "Integrity gate",
  "calibrate:score": "Backtest scoring", "calibrate:argue": "Backtest arguments",
};
const stepName = (s: string) => STEP[s] ?? (s.startsWith("retrieve:") || s.startsWith("embed:") ? "Search embeddings" : s.replace(/[_:]/g, " "));

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="elev-1 rounded-[8px] bg-canvas p-4">
      <p className="eyebrow">{label}</p>
      <p className="num mt-1 text-[22px] font-semibold tracking-[-0.4px]">{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-ink-subtle">{sub}</p>}
    </div>
  );
}

export default async function OpsPage() {
  const db = admin();
  const day = istDayStart();
  const [lim, calls, recent, apps, jobs, queue, user] = await Promise.all([
    db.from("cost_limits").select("*").eq("id", 1).single(),
    db.rpc("cost_rollup", { day_start: day }),
    db.from("llm_calls").select("id, step, model, input_tokens, output_tokens, cost_usd, latency_ms, retries, fell_back, ok, langfuse_trace_id, created_at, application_id").order("created_at", { ascending: false }).limit(15),
    db.from("applications").select("id, company_name, status, status_reason, current_step"),
    db.from("jobs").select("application_id, step, status, langfuse_trace_id, finished_at, created_at").order("created_at", { ascending: false }).limit(200),
    waiting().catch(() => []),
    currentUser(),
  ]);
  const l = must(lim, "limits");
  // totals come from the database (row reads cap at 1,000, so summing rows here would undercount)
  const roll = must(calls, "cost rollup") as { today: number; week: number; month: number; by_step: { step: string; n: number; cost: number }[]; by_app: { application_id: string; n: number; cost: number }[] };
  const today = Number(roll.today), wk = Number(roll.week), mo = Number(roll.month);
  const appRows = must(apps, "apps");
  const name = new Map(appRows.map((a) => [a.id, a.company_name]));
  const byApp = new Map<string, number>(roll.by_app.map((a) => [a.application_id, Number(a.cost)]));
  const perApp = byApp.size ? [...byApp.values()].reduce((a, x) => a + x, 0) / byApp.size : 0;
  const byStep = new Map<string, { n: number; cost: number }>();
  for (const r of roll.by_step) { const k = stepName(r.step); const v = byStep.get(k) ?? { n: 0, cost: 0 }; byStep.set(k, { n: v.n + Number(r.n), cost: v.cost + Number(r.cost) }); }
  const pct = Math.min(100, Math.round((today / Number(l.daily_usd)) * 100));
  const running = appRows.filter((a) => a.status === "processing");
  const attention = appRows.filter((a) => a.status === "needs_attention");
  const lastRun = new Map<string, { trace: string | null; at: string; status: string }>();
  for (const j of must(jobs, "jobs")) if (!lastRun.has(j.application_id)) lastRun.set(j.application_id, { trace: j.langfuse_trace_id, at: j.created_at, status: j.status });

  return (
    <div className="max-w-[1080px] space-y-6">
      <header>
        <h1 className="text-[20px] font-semibold tracking-[-0.3px]">Cost &amp; ops</h1>
        <p className="mt-0.5 text-[14px] text-ink-muted">
          {l.paused_at ? "The queue is paused: today's spend passed the daily limit." : `${usd(today)} of ${usd(Number(l.daily_usd))} spent today. ${queue.length} waiting, ${running.length} running.`}
        </p>
      </header>

      {l.paused_at && (
        <div role="alert" className="rounded-[8px] bg-amber-bg px-4 py-3 text-[13px] text-amber">
          <p className="font-medium">Paused {fmtDate(l.paused_at)}</p>
          <p>{l.pause_reason}. Nothing new runs until a partner resumes it below.</p>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Spend">
        <Tile label="Today (IST)" value={usd(today)} sub={`${pct}% of the daily limit`} />
        <Tile label="Last 7 days" value={usd(wk)} />
        <Tile label="Last 30 days" value={usd(mo)} />
        <Tile label="Per application" value={usd(perApp)} sub={`average over ${byApp.size} applications`} />
      </section>

      <section className="elev-1 rounded-[8px] bg-canvas p-5" aria-labelledby="h-limit">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="h-limit" className="text-[14px] font-semibold">Daily limit</h2>
          <div className="flex items-center gap-2 text-[12px] text-ink-subtle">
            <span className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-3" aria-hidden><span className={`block h-full ${pct >= 100 ? "bg-red" : pct >= 80 ? "bg-amber" : "bg-green"}`} style={{ width: `${pct}%` }} /></span>
            <span className="num">{pct}% used</span>
          </div>
        </div>
        <Limits dailyUsd={Number(l.daily_usd)} alertEmail={l.alert_email} maxInFlight={l.max_in_flight} paused={!!l.paused_at} canEdit={!!user?.partner} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="elev-1 overflow-hidden rounded-[8px] bg-canvas" aria-labelledby="h-step">
          <h2 id="h-step" className="border-b border-hairline px-4 py-2.5 text-[14px] font-semibold">Where the money goes (30 days)</h2>
          <table className="w-full text-[13px]">
            <tbody>
              {[...byStep.entries()].sort((a, b) => b[1].cost - a[1].cost).slice(0, 8).map(([k, v]) => (
                <tr key={k} className="border-b border-hairline last:border-0">
                  <td className="px-4 py-2">{k}</td>
                  <td className="num px-4 py-2 text-right text-ink-subtle">{v.n} calls</td>
                  <td className="num px-4 py-2 text-right">{usd(v.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="elev-1 overflow-hidden rounded-[8px] bg-canvas" aria-labelledby="h-app">
          <h2 id="h-app" className="border-b border-hairline px-4 py-2.5 text-[14px] font-semibold">By application (30 days)</h2>
          <table className="w-full text-[13px]">
            <tbody>
              {[...byApp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, cost]) => {
                const run = lastRun.get(id);
                return (
                  <tr key={id} className="border-b border-hairline last:border-0">
                    <td className="px-4 py-2"><Link href={`/applications/${id}`} className="hover:text-primary">{name.get(id) ?? "Removed"}</Link></td>
                    <td className="px-4 py-2 text-right">{run?.trace ? <a className="text-[12px] text-primary underline" href={traceUrl(run.trace)} target="_blank" rel="noreferrer">Last run trace</a> : null}</td>
                    <td className="num px-4 py-2 text-right">{usd(cost)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>

      <section className="elev-1 overflow-hidden rounded-[8px] bg-canvas" aria-labelledby="h-queue">
        <h2 id="h-queue" className="border-b border-hairline px-4 py-2.5 text-[14px] font-semibold">Queue</h2>
        {queue.length === 0 && running.length === 0 && attention.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-ink-subtle">Nothing queued or running.</p>
        ) : (
          <ul className="divide-y divide-hairline text-[13px]">
            {running.map((a) => <li key={a.id} className="flex justify-between gap-2 px-4 py-2"><span>{a.company_name}</span><Badge>{(a.current_step ?? "running").replace(/_/g, " ")}</Badge></li>)}
            {queue.filter((q) => !running.some((r) => r.id === q.application_id)).map((q) => (
              <li key={q.msg_id} className="flex justify-between gap-2 px-4 py-2"><span>{name.get(q.application_id) ?? q.application_id.slice(0, 8)}</span><span className="text-[12px] text-ink-subtle">{q.read_ct ? `attempt ${q.read_ct + 1} · ` : ""}waiting</span></li>
            ))}
            {attention.map((a) => <li key={a.id} className="px-4 py-2"><span className="font-medium">{a.company_name}</span> <Badge tone="amber">Needs a look</Badge> <span className="text-[12px] text-ink-muted">{a.status_reason}</span></li>)}
          </ul>
        )}
      </section>

      <section className="elev-1 overflow-x-auto rounded-[8px] bg-canvas" aria-labelledby="h-calls">
        <h2 id="h-calls" className="border-b border-hairline px-4 py-2.5 text-[14px] font-semibold">Latest model calls</h2>
        <table className="w-full text-left text-[12px]">
          <thead className="text-ink-subtle"><tr className="border-b border-hairline"><th className="px-4 py-2 font-medium">When</th><th className="px-4 py-2 font-medium">Step</th><th className="px-4 py-2 font-medium">Model</th><th className="num px-4 py-2 text-right font-medium">Tokens in / out</th><th className="num px-4 py-2 text-right font-medium">Time</th><th className="num px-4 py-2 text-right font-medium">Cost</th><th className="px-4 py-2 font-medium">Trace</th></tr></thead>
          <tbody>
            {must(recent, "recent").map((c) => (
              <tr key={c.id} className="border-b border-hairline last:border-0">
                <td className="num px-4 py-2 text-ink-subtle">{fmtDate(c.created_at)}</td>
                <td className="px-4 py-2">{stepName(c.step)}{c.application_id && name.get(c.application_id) ? <span className="text-ink-subtle"> · {name.get(c.application_id)}</span> : null}{!c.ok && <Badge tone="red" className="ml-1">failed</Badge>}{c.fell_back && <Badge tone="amber" className="ml-1">fallback</Badge>}</td>
                <td className="px-4 py-2 font-mono text-[11px] text-ink-muted">{c.model}</td>
                <td className="num px-4 py-2 text-right">{c.input_tokens.toLocaleString("en-IN")} / {c.output_tokens.toLocaleString("en-IN")}</td>
                <td className="num px-4 py-2 text-right">{c.latency_ms != null ? `${(c.latency_ms / 1000).toFixed(1)}s` : "–"}</td>
                <td className="num px-4 py-2 text-right">{usd(Number(c.cost_usd))}</td>
                <td className="px-4 py-2">{c.langfuse_trace_id ? <a className="text-primary underline" href={traceUrl(c.langfuse_trace_id)} target="_blank" rel="noreferrer">Open</a> : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
