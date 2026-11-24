// Calibration (build prompt §9.4): the 12 deal memos scored blind, compared with what the fund did.
// Numbers live here and only here: agreement, the confusion matrix, and how well the ranking separates.
import { admin } from "@/lib/db/admin";
import { currentUser } from "@/lib/google/session";
import { Badge, cx, fmtDate } from "@/components/ui";
import { RerunButton } from "./rerun";
import { plainArgument, type BacktestRow } from "@/lib/calibration";

export const dynamic = "force-dynamic";

type Run = {
  id: string; created_at: string; agreement_pct: number; cost_usd: number | null;
  confusion: { invest_invested: number; invest_passed: number; pass_invested: number; pass_passed: number; agree: number; total: number; ranking?: { pairs: number; wins: number; pct: number; lowestInvested: number | null; highestPassed: number | null } };
  results: Omit<BacktestRow, "facts" | "why">[];
};

const ACTION = { take_call: "Take the call", dig: "Dig first", pass: "Pass" } as const;

function Cell({ n, good, label }: { n: number; good: boolean; label: string }) {
  return (
    <td className={cx("num px-4 py-3 text-center text-[18px] font-semibold", n ? (good ? "bg-green-bg text-green" : "bg-red-bg text-red") : "text-ink-subtle")} aria-label={`${label}: ${n}`}>
      {n}
    </td>
  );
}

export default async function CalibrationPage() {
  const run = (await admin().from("calibration_runs").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle()).data as Run | null;
  const user = await currentUser();

  if (!run)
    return (
      <div className="max-w-[720px]">
        <h1 className="font-display text-[36px] font-normal leading-[1.05] tracking-[-0.6px]">Calibration</h1>
        <div className="elev-1 mt-5 rounded-[16px] bg-canvas p-8 text-center">
          <p className="font-medium">No backtest yet</p>
          <p className="mt-1 text-[13px] text-ink-muted">It scores the 12 deal memos blind and compares with what the fund decided. It takes about two minutes.</p>
          <div className="mt-3 flex justify-center"><RerunButton canAct={!!user} label="Run the backtest" /></div>
        </div>
      </div>
    );

  const c = run.confusion;
  const k = c.ranking;
  const separated = k && k.lowestInvested != null && k.highestPassed != null && k.lowestInvested > k.highestPassed;
  const rows = [...run.results].sort((a, b) => b.total - a.total);
  const disagreements = run.results.filter((r) => !r.agree && r.argument);

  return (
    <div className="max-w-[1080px] space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[36px] font-normal leading-[1.05] tracking-[-0.6px]">Calibration</h1>
          <p className="mt-0.5 max-w-[680px] text-[14px] text-ink-muted">
            {separated
              ? "The order is right, the bar is too high: every company the fund backed outscored every one it passed on, but none cleared the call threshold."
              : k && k.pct >= 80
                ? "The order is mostly right, the bar is too high: backed companies usually outscore passed ones, but none clear the call threshold."
                : "The system and the fund often disagree. Read the arguments below before trusting the scores."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/api/calibration/report" className="press inline-flex h-8 items-center rounded-full px-3 text-[13px] text-ink-muted shadow-[0_0_0_1px_var(--hairline)] hover:bg-surface-1">Download report</a>
          <RerunButton canAct={!!user} label="Run again" />
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="elev-1 rounded-[20px] bg-canvas p-5">
          <p className="eyebrow">Agreement with the fund</p>
          <p className="mt-1 flex items-baseline gap-2"><span className="num text-[32px] font-semibold tracking-[-0.6px]">{c.agree} of {c.total}</span><span className="num text-ink-subtle">{run.agreement_pct}%</span></p>
          {k && <p className="mt-3 text-[13px] text-ink-muted">Ranking: the backed company scored higher in <span className="num font-medium text-ink">{k.wins} of {k.pairs}</span> head-to-head pairs.</p>}
          <p className="mt-3 text-[12px] text-ink-subtle">“Take the call” counts as a yes. In-sample: the fund’s rules were written from these memos, so this flatters the system. Run {fmtDate(run.created_at)}.</p>
        </div>
        <div className="elev-1 overflow-x-auto rounded-[16px] bg-canvas p-5">
          <p className="eyebrow mb-2">Who said what</p>
          <table className="w-full text-[13px]">
            <thead><tr><th className="w-1/3" /><th className="pb-2 font-medium text-ink-muted">Fund invested</th><th className="pb-2 font-medium text-ink-muted">Fund passed</th></tr></thead>
            <tbody className="[&_td]:border [&_td]:border-hairline">
              <tr><th scope="row" className="pr-3 text-left font-medium">System: take the call</th><Cell n={c.invest_invested} good label="Both yes" /><Cell n={c.invest_passed} good={false} label="System yes, fund passed" /></tr>
              <tr><th scope="row" className="pr-3 text-left font-medium">System: dig or pass</th><Cell n={c.pass_invested} good={false} label="System no, fund invested" /><Cell n={c.pass_passed} good label="Both no" /></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="h-memos">
        <h2 id="h-memos" className="mb-2.5 text-[14px] font-semibold">Memo by memo, highest score first</h2>
        <div className="elev-1 overflow-x-auto rounded-[16px] bg-canvas">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[12px] text-ink-subtle"><tr className="border-b border-hairline"><th className="px-4 py-2 font-medium">Company</th><th className="px-4 py-2 font-medium">Fund</th><th className="px-4 py-2 font-medium">System</th><th className="num px-4 py-2 text-right font-medium">Score</th><th className="px-4 py-2 font-medium">Verdict</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.memo_no} className="border-b border-hairline last:border-0">
                  <td className="px-4 py-2.5"><span className="font-medium">{r.company}</span> <span className="text-[12px] text-ink-subtle">{r.sector}</span></td>
                  <td className="px-4 py-2.5 capitalize">{r.actual}</td>
                  <td className="px-4 py-2.5">{ACTION[r.action]}</td>
                  <td className="num px-4 py-2.5 text-right">{r.total.toFixed(1)}</td>
                  <td className="px-4 py-2.5">{r.agree ? <Badge tone="green">Agrees</Badge> : <Badge tone="red">Disagrees</Badge>}</td>
                </tr>
              ))}
              <tr><td className="px-4 py-2.5"><span className="font-medium">Ledgerly</span></td><td className="px-4 py-2.5 text-ink-subtle" colSpan={4}>Missing: its partner notes aren’t in the data, so it can’t be scored.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {disagreements.length > 0 && (
        <section aria-labelledby="h-dis" className="space-y-2.5">
          <h2 id="h-dis" className="font-display text-[28px] font-normal leading-tight">Where we disagree</h2>
          <p className="text-[13px] text-ink-subtle">The best case on each side, in a line.</p>
          {disagreements.map((r) => (
            <article key={r.memo_no} className="elev-1 rounded-[20px] bg-canvas px-5 py-4">
              <h3 className="flex flex-wrap items-baseline gap-x-2 font-display text-[22px] font-normal leading-tight">
                {r.company}
                <span className="font-sans text-[12px] text-ink-subtle">Fund {r.actual} · system says {ACTION[r.action].toLowerCase()}</span>
              </h3>
              <dl className="mt-3 grid gap-2.5 md:grid-cols-2">
                <div className="rounded-[14px] bg-amber-bg px-3.5 py-2.5">
                  <dt className="text-[11px] font-medium text-amber">If the fund got it wrong</dt>
                  <dd className="mt-0.5 text-[13px] leading-snug text-ink">{plainArgument(r.argument!.fund_was_wrong)}</dd>
                </div>
                <div className="rounded-[14px] bg-green-bg px-3.5 py-2.5">
                  <dt className="text-[11px] font-medium text-green">If the system got it wrong</dt>
                  <dd className="mt-0.5 text-[13px] leading-snug text-ink">{plainArgument(r.argument!.system_was_wrong)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
