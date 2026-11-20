import Link from "next/link";
import { notFound } from "next/navigation";
import { loadDetail, type ClaimLite, type Detail } from "@/lib/data/detail";
import { ClaimChip } from "@/components/source-drawer";
import { ACTION, BUCKET, Badge, CONF, CRIT_NAMES, FIT, GATE_NAMES, GateIcon, Panel, Score, ScoreBar, cx, fmtDate, sectorName } from "@/components/ui";
import thesis from "../../../../config/thesis.v1.json";

export const dynamic = "force-dynamic";

const RULES: Record<string, string> = Object.fromEntries(thesis.revealed.rules.map((r) => [r.id, r.text]));
const CRITS = ["C1", "C2", "C3", "C4", "C5", "C6"] as const;

function Chips({ keys, claims }: { keys: string[]; claims: ClaimLite[] }) {
  const found = keys.map((k) => claims.find((c) => c.key === k)).filter((c): c is ClaimLite => !!c);
  if (!found.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {found.map((c) => (
        <ClaimChip key={c.key} kind={c.origin === "research" ? "finding" : "claim"} id={c.id} code={c.key} label={c.origin === "research" ? "web" : `${c.origin} p${c.page_no}`} />
      ))}
    </div>
  );
}

/** Rationale with inline citations "[f12, d07]" rendered as chips. */
function Cited({ text, claims }: { text: string; claims: ClaimLite[] }) {
  // any [bracket] that holds a claim/finding ID becomes chips; non-ID tokens inside it are dropped
  const parts = text.split(/(\[[^\]]*\b[a-z]\d{2}\b[^\]]*\])/gi);
  return (
    <p className="leading-relaxed text-ink-muted">
      {parts.map((p, i) => {
        const m = p.match(/^\[(.+)\]$/);
        if (!m) return <span key={i}>{p}</span>;
        return (
          <span key={i} className="mx-0.5 inline-flex translate-y-[-1px] gap-0.5 align-middle">
            {m[1].split(/\s*,\s*/).filter((k) => /^[a-z]\d{2}$/i.test(k)).map((k) => {
              const c = claims.find((x) => x.key === k);
              return c ? <ClaimChip key={k} kind={c.origin === "research" ? "finding" : "claim"} id={c.id} code={k} /> : <span key={k} className="font-mono text-[12px] text-ink-subtle">{k}</span>;
            })}
          </span>
        );
      })}
    </p>
  );
}

function Header({ d, view }: { d: Detail; view: "revealed" | "written" }) {
  const s = d.scores.find((x) => x.view === view) ?? d.scores.find((x) => x.view === "revealed");
  const crit = Object.fromEntries(d.crits.map((c) => [c.criterion, Number(c.score)]));
  const tripped = d.gates.filter((g) => g.tripped);
  const rec = d.rec;
  const precedent = (rec?.precedents as { company?: string; outcome?: string; note?: string; criterion: string }[] | undefined)?.[0];
  return (
    <section className="elev-1 rounded-[8px] bg-canvas" aria-label="Summary">
      <div className="grid gap-5 p-5 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 text-[12px] text-ink-subtle">
            <Link href="/" className="hover:text-ink">Pipeline</Link> <span aria-hidden>/</span> <span>{d.app.company_name}</span>
          </nav>
          <h1 className="text-[20px] tracking-[-0.3px]">{d.app.company_name}</h1>
          <p className="mt-0.5 text-ink-muted">{d.app.one_liner}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Badge>{sectorName(d.app.sector_inferred ?? d.app.sector_label)}</Badge>
            {d.app.sector_label_matches === false && <Badge tone="amber" title={d.app.sector_reason ?? undefined}>Labelled “{d.app.sector_label}”</Badge>}
            {s?.written_fit && <Badge tone={FIT[s.written_fit].tone} title={s.written_fit_reason ?? undefined}>{FIT[s.written_fit].label}</Badge>}
            <Badge>{d.app.stage_label}</Badge>
            <Badge>{d.app.source === "warm_intro" ? "Warm intro" : "Application form"}</Badge>
            <span className="num text-[12px] text-ink-subtle">Received {fmtDate(d.app.received_at)}</span>
          </div>
          {d.app.source === "warm_intro" && d.app.intro_by && <p className="mt-1.5 text-[12px] text-ink-subtle">{d.app.intro_by}</p>}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow">{view === "written" ? "Written thesis view" : "Revealed thesis score"}</p>
              <p className="flex items-baseline gap-1.5"><Score value={s ? Number(s.total) : null} className="text-[28px] tracking-[-0.6px]" /><span className="text-ink-subtle">/ 10</span></p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              {rec && <Badge tone={ACTION[rec.action].tone}>{ACTION[rec.action].label}</Badge>}
              {rec && <span className="text-[12px] text-ink-subtle">{BUCKET[rec.bucket]}</span>}
            </div>
          </div>
          <ScoreBar crit={crit} weights={s?.weights_used ?? null} size="lg" />
          <dl className="num grid grid-cols-3 gap-2 text-[12px]">
            <div><dt className="text-ink-subtle">Founder (C1 C2 C4)</dt><dd className="font-medium">{s ? Number(s.founder_subtotal).toFixed(1) : "–"}</dd></div>
            <div><dt className="text-ink-subtle">Market (C3 C5 C6)</dt><dd className="font-medium">{s ? Number(s.market_subtotal).toFixed(1) : "–"}</dd></div>
            <div><dt className="text-ink-subtle">Evidence coverage</dt><dd className="font-medium">{s ? `${s.evidence_coverage_pct}%` : "–"}</dd></div>
          </dl>
          <div role="group" aria-label="Thesis view" className="flex self-start rounded-[6px] bg-surface-1 p-0.5 shadow-[0_0_0_1px_var(--hairline)]">
            {(["revealed", "written"] as const).map((v) => (
              <Link key={v} href={`?view=${v}`} replace scroll={false} aria-current={view === v ? "true" : undefined}
                className={cx("press flex h-8 items-center rounded-[4px] px-2.5 text-[12px]", view === v ? "bg-canvas font-medium text-ink shadow-[0_0_0_1px_var(--hairline)]" : "text-ink-subtle hover:text-ink")}>
                {v === "revealed" ? "Revealed thesis" : "Written thesis"}
              </Link>
            ))}
          </div>
          {view === "written" && s?.written_fit_reason && <p className="text-[12px] text-ink-muted">{s.written_fit_reason} Weighted by the public framework (founder-market fit, why now), no sector lens.</p>}
          {view === "revealed" && s?.lens && <p className="text-[12px] text-ink-subtle">Sector lens: {String(s.lens).replace("_", " ")} (its deciding criteria weighted ×1.5).</p>}
        </div>
      </div>

      <div className="grid gap-4 border-t border-hairline px-5 py-4 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="eyebrow mb-2">Gates</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {(["G1", "G2", "G3", "G4"] as const).map((g) => {
              const row = d.gates.find((x) => x.gate === g);
              const reasons = (row?.reasons ?? []) as { text: string; claim_keys?: string[]; portfolio?: { company: string; source_url: string } }[];
              return (
                <li key={g} className={cx("rounded-[6px] px-3 py-2", row?.tripped ? "bg-red-bg" : "bg-surface-1")}>
                  <p className={cx("flex items-center gap-1.5 text-[13px] font-medium", row?.tripped ? "text-red" : "text-ink-muted")}>
                    {row?.tripped ? <GateIcon /> : <span aria-hidden>✓</span>} {g} {GATE_NAMES[g]} <span className="font-normal">{row?.tripped ? "tripped, routed to Kushal" : "clear"}</span>
                  </p>
                  {reasons.map((r, i) => (
                    <div key={i} className="mt-1 space-y-1 text-[12px] text-ink">
                      <p>{r.text}{r.portfolio && <> (<a className="text-primary underline" href={r.portfolio.source_url} target="_blank" rel="noreferrer">portfolio source</a>)</>}</p>
                      <Chips keys={r.claim_keys ?? []} claims={d.claims} />
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
          {tripped.length === 0 && <p className="mt-2 text-[12px] text-ink-subtle">No gate tripped.</p>}
        </div>
        <div className="flex flex-col gap-3">
          {rec && (
            <div>
              <p className="eyebrow mb-1.5">What drove it</p>
              <ul className="space-y-1 text-[12px] text-ink-muted">
                {(rec.top_rules as string[]).map((r) => <li key={r}><span className="font-mono text-ink">{r}</span> {RULES[r]}</li>)}
              </ul>
              {precedent?.company && (
                <p className="mt-1.5 text-[12px] text-ink-muted">Closest precedent: <span className="font-medium text-ink">{precedent.company}</span> ({precedent.outcome}){precedent.note ? `: ${precedent.note}` : ""}</p>
              )}
            </div>
          )}
          <DecisionBar decided={d.decisions[0]} />
        </div>
      </div>
    </section>
  );
}

function DecisionBar({ decided }: { decided?: { decision: string; note: string; created_at: string } }) {
  return (
    <div className="rounded-[6px] bg-surface-1 p-3">
      <p className="eyebrow mb-2">Kushal’s decision</p>
      {decided ? (
        <p className="text-[13px]"><span className="font-medium capitalize">{decided.decision}</span>: {decided.note} <span className="num text-ink-subtle">({fmtDate(decided.created_at)})</span></p>
      ) : (
        <>
          <div className="flex gap-1.5">
            {["Advance", "Hold", "Pass"].map((x) => (
              <button key={x} type="button" disabled aria-describedby="decision-why" className="h-8 flex-1 cursor-not-allowed rounded-[6px] bg-canvas text-[13px] text-ink-subtle shadow-[0_0_0_1px_var(--hairline)]">
                {x}
              </button>
            ))}
          </div>
          <p id="decision-why" className="mt-1.5 text-[12px] text-ink-subtle">No decision yet. Partners decide here once sign-in is set up (Phase 3); every decision needs a note.</p>
        </>
      )}
    </div>
  );
}

function CriterionCard({ c, d, weight }: { c: Detail["crits"][number]; d: Detail; weight: number }) {
  const memo = d.memos.find((m) => m.id === c.precedent_memo_id);
  return (
    <article className="elev-1 rounded-[8px] bg-canvas p-4" aria-labelledby={`crit-${c.criterion}`}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 id={`crit-${c.criterion}`} className="text-[14px]"><span className="font-mono text-ink-subtle">{c.criterion}</span> {CRIT_NAMES[c.criterion]}</h3>
          <p className="num text-[12px] text-ink-subtle">Weight {Math.round(weight * 100)}%</p>
        </div>
        <div className="flex items-center gap-2">
          {c.status === "needs_attention" && <Badge tone="amber" title={c.status_reason ?? undefined}>Needs attention</Badge>}
          <Badge tone={CONF[c.confidence].tone} title="Confidence: High = verified externally, Med = deck and form agree, Low = deck only or contradicted">{CONF[c.confidence].label}</Badge>
          <Score value={Number(c.score)} className="text-[18px]" />
        </div>
      </header>
      <div className="mt-2.5 space-y-2.5 text-[13px]">
        <Cited text={c.rationale} claims={d.claims} />
        {(c.rules_applied as string[]).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(c.rules_applied as string[]).map((r) => <Badge key={r} title={RULES[r]}><span className="font-mono">{r}</span></Badge>)}
          </div>
        )}
        {memo && <p className="text-[12px] text-ink-muted">Closest precedent: <span className="font-medium text-ink">{memo.company}</span> ({memo.outcome}){c.precedent_note ? `: ${c.precedent_note}` : ""}</p>}
        {c.gap && <p className="text-[12px] text-amber">Missing: {c.gap}</p>}
        {c.question_for_call && <p className="text-[12px] text-ink-muted"><span className="font-medium text-ink">Ask:</span> {c.question_for_call}</p>}
        <div className="flex items-center justify-between gap-2 pt-1">
          <Chips keys={c.claim_keys as string[]} claims={d.claims} />
          <button type="button" disabled title="Overrides with a required reason arrive in Phase 4" className="h-7 shrink-0 cursor-not-allowed rounded-[6px] px-2 text-[12px] text-ink-subtle shadow-[0_0_0_1px_var(--hairline)]">Override</button>
        </div>
      </div>
    </article>
  );
}

function CouldntFind({ d }: { d: Detail }) {
  const q = d.queries;
  const notConfigured = q.some((x) => /not configured/.test(x.error ?? ""));
  const empty = q.filter((x) => x.result_count === 0);
  const matched = d.findings.filter((f) => f.is_match);
  const gaps = d.crits.filter((c) => c.gap);
  return (
    <Panel title="What we couldn’t find">
      <p className="text-[13px] text-ink-muted">
        {notConfigured
          ? `Web research hasn’t run: the search key isn’t set up yet. ${q.length} searches are planned below. Until it runs, nothing here was checked against outside sources.`
          : matched.length === 0
            ? `Searched ${q.length} sources, nothing found about this company or its founders.`
            : `Searched ${q.length} sources; ${matched.length} matched, ${empty.length} returned nothing.`}
      </p>
      {gaps.length > 0 && (
        <div className="mt-3">
          <p className="eyebrow mb-1">What the absence costs</p>
          <ul className="space-y-1 text-[12px] text-ink-muted">
            {gaps.map((c) => (
              <li key={c.criterion}><span className="font-mono text-ink">{c.criterion}</span> {c.gap} <span className="num text-ink-subtle">(scored {Number(c.score).toFixed(1)}, {CONF[c.confidence].label} confidence)</span></li>
            ))}
          </ul>
        </div>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-[12px] font-medium text-primary">Queries tried ({q.length})</summary>
        <table className="mt-2 w-full text-left text-[12px]">
          <thead className="text-ink-subtle"><tr><th className="py-1 pr-2 font-medium">Looking for</th><th className="py-1 pr-2 font-medium">Query</th><th className="num py-1 text-right font-medium">Results</th></tr></thead>
          <tbody>
            {q.map((x) => (
              <tr key={x.id} className="border-t border-hairline align-top">
                <td className="py-1.5 pr-2 text-ink-subtle">{x.purpose.replace(/_/g, " ")}</td>
                <td className="py-1.5 pr-2 font-mono text-[11px] text-ink-muted">{x.query}{x.error && <span className="mt-0.5 block font-sans text-amber">{x.error}</span>}</td>
                <td className="num py-1.5 text-right">{x.result_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Panel>
  );
}

function Contradictions({ d }: { d: Detail }) {
  const flags = d.flags.filter((f) => f.severity !== "info");
  const info = d.flags.filter((f) => f.severity === "info");
  const keyOf = new Map(d.claims.map((c) => [c.id, c.key]));
  return (
    <Panel title="Contradictions and checks" right={<span className="num text-[12px] text-ink-subtle">{flags.length} to ask about</span>}>
      {flags.length === 0 && <p className="text-[13px] text-ink-subtle">The deck, the form and the arithmetic agree.</p>}
      <ul className="space-y-3">
        {[...flags, ...info].map((f) => (
          <li key={f.id} className="text-[13px]">
            <div className="flex items-center gap-1.5">
              <Badge tone={f.severity === "red" ? "red" : f.severity === "warn" ? "amber" : "neutral"}>{f.severity === "red" ? "Red" : f.severity === "warn" ? "Check" : "Note"}</Badge>
              <span className="font-medium">{String(f.check).replace(/_/g, " ")}</span>
            </div>
            <p className="mt-1 text-ink-muted">{f.explanation}</p>
            <p className="num mt-0.5 font-mono text-[11px] text-ink-subtle">{f.formula}</p>
            <div className="mt-1"><Chips keys={(f.claim_ids as string[]).map((u) => keyOf.get(u)).filter((k): k is string => !!k)} claims={d.claims} /></div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Dossier({ d }: { d: Detail }) {
  const creds = d.claims.filter((c) => c.metric === "text.credentials");
  const found = d.findings.filter((f) => f.is_match && f.extracted_claim);
  const sameName = d.findings.filter((f) => !f.is_match);
  return (
    <Panel title="Founder dossier">
      <ul className="space-y-1">
        {d.founders.map((f) => (
          <li key={f.id} className="text-[13px] font-medium">{f.full_name} <span className="font-normal text-ink-subtle">{f.role_title}</span></li>
        ))}
      </ul>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="eyebrow mb-1">Founders say (deck and form)</p>
          {creds.length ? (
            <ul className="space-y-1.5 text-[12px] text-ink-muted">
              {creds.map((c) => (
                <li key={c.id}>“{c.quote}” <ClaimChip kind="claim" id={c.id} code={c.key} label={`${c.origin} p${c.page_no}`} /></li>
              ))}
            </ul>
          ) : <p className="text-[12px] text-ink-subtle">No credential lines extracted.</p>}
        </div>
        <div>
          <p className="eyebrow mb-1">Research found</p>
          {found.length ? (
            <ul className="space-y-1.5 text-[12px] text-ink-muted">
              {found.map((f) => <li key={f.id}>{f.extracted_claim} <ClaimChip kind="finding" id={f.id} code={f.key} label={f.publisher ?? "web"} /></li>)}
            </ul>
          ) : <p className="text-[12px] text-ink-subtle">Nothing found to confirm or contradict these. The seed applications use placeholder (.example) sites and profiles.</p>}
          {sameName.length > 0 && <p className="mt-1.5 text-[12px] text-ink-subtle">{sameName.length} result(s) set aside: same name, different company or person.</p>}
        </div>
      </div>
    </Panel>
  );
}

export default async function ApplicationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const { id } = await params;
  const { view: v } = await searchParams;
  const view = v === "written" ? "written" : "revealed";
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await loadDetail(id);
  if (!d) notFound();
  const s = d.scores.find((x) => x.view === view) ?? d.scores[0];
  const weights = (s?.weights_used ?? {}) as Record<string, number>;
  const crits = CRITS.map((c) => d.crits.find((x) => x.criterion === c)).filter((x): x is Detail["crits"][number] => !!x);
  const rec = d.rec;

  return (
    <div className="space-y-5">
      {d.app.status === "needs_attention" && (
        <div role="alert" className="rounded-[8px] bg-amber-bg px-4 py-3 text-[13px] text-amber">
          <p className="font-medium">Needs attention</p>
          <p>{d.app.status_reason}</p>
        </div>
      )}
      <Header d={d} view={view} />
      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-3">
          <h2 className="eyebrow">Criteria</h2>
          {crits.length ? crits.map((c) => <CriterionCard key={c.criterion} c={c} d={d} weight={weights[c.criterion] ?? 0} />) : (
            <div className="elev-1 rounded-[8px] p-6 text-center text-ink-subtle">Not scored yet. Scoring runs after research and gates.</div>
          )}
        </div>
        <div className="space-y-3">
          <h2 className="eyebrow">Evidence</h2>
          {rec && (rec.dig_questions as string[]).length > 0 && (
            <Panel title={rec.action === "dig" ? "Questions for Riya to dig into" : "Questions for the call"}>
              <ol className="list-decimal space-y-1 pl-4 text-[13px] text-ink-muted">{(rec.dig_questions as string[]).map((q, i) => <li key={i}>{q}</li>)}</ol>
            </Panel>
          )}
          {rec?.action === "pass" && rec.what_would_change && (
            <Panel title="What would change our view"><p className="text-[13px] text-ink-muted">{rec.what_would_change}</p></Panel>
          )}
          <Contradictions d={d} />
          <Dossier d={d} />
          <CouldntFind d={d} />
          <Panel title="Run">
            <ul className="space-y-1 text-[12px] text-ink-muted">
              {d.jobs.map((j, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="capitalize">{String(j.step).replace("_", " ")} · {j.status}{j.last_error ? `: ${j.last_error}` : ""}</span>
                  {j.langfuse_trace_id && i === 0 && (
                    <a className="text-primary underline" target="_blank" rel="noreferrer" href={`${process.env.LANGFUSE_HOST ?? "https://cloud.langfuse.com"}/trace/${j.langfuse_trace_id}`}>Langfuse trace</a>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
