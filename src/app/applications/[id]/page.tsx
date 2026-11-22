import Link from "next/link";
import { notFound } from "next/navigation";
import { loadDetail, type ClaimLite, type Detail } from "@/lib/data/detail";
import { ClaimChip } from "@/components/source-drawer";
import { Composer, type ComposerDraft } from "@/components/composer";
import { DecisionBar, OutreachPanel, type ThreadRow } from "@/components/outreach";
import { currentUser } from "@/lib/google/session";
import { mailboxEmail } from "@/lib/google/client";
import { ACTION, Badge, CONF, CRIT_NAMES, FIT, GATE_NAMES, GateIcon, Panel, cx, fmtDate, sectorName } from "@/components/ui";
import { Meter } from "@/components/pipeline-board";
import { Reveal } from "@/components/motion/reveal";
import { Tabs } from "@/components/tabs";
import { firstSentence, ratingWord, takeFor } from "@/lib/take";
import { formatSlot } from "@/lib/google/slots";
import { OverrideButton } from "@/components/override";
import { personName, type AppliedCorrection } from "@/lib/corrections";
import thesis from "../../../../config/thesis.v1.json";

export const dynamic = "force-dynamic";

const RULES: Record<string, string> = Object.fromEntries(thesis.revealed.rules.map((r) => [r.id, r.text]));
const CHECK_LABEL: Record<string, string> = {
  deck_vs_form: "Deck vs form", tam: "Market size (TAM)", sam: "Serviceable market (SAM)", som: "Obtainable market (SOM)",
  blended_cac: "Blended CAC", payback: "Payback", mrr: "Monthly revenue", credentials: "Credentials", revenue: "Revenue", unit_count: "Unit count",
};
const STEP_LABEL: Record<string, string> = {
  ingest: "Read files", extract_claims: "Extract claims", reconcile: "Check the numbers", research: "Web research",
  gates: "Gates", score: "Score", rank: "Rank", draft_email: "Draft email",
};
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
          <span key={i} className="mx-0.5 inline-flex max-w-full translate-y-[-1px] flex-wrap gap-0.5 align-middle">
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

function Header({ d, view, decision }: { d: Detail; view: "revealed" | "written"; decision: React.ReactNode }) {
  const s = d.scores.find((x) => x.view === view) ?? d.scores.find((x) => x.view === "revealed");
  const crit = Object.fromEntries(d.crits.map((c) => [c.criterion, Number(c.score)]));
  const tripped = d.gates.filter((g) => g.tripped);
  const rec = d.rec;
  const take = takeFor({ action: rec?.action ?? null, bucket: rec?.bucket ?? null, gates: tripped.map((g) => g.gate), crit });
  const strong = d.crits.find((c) => c.criterion === take.strongest);
  const weak = d.crits.find((c) => c.criterion === take.weakest);
  const precedent = (rec?.precedents as { company?: string; outcome?: string; note?: string }[] | undefined)?.[0];
  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" aria-label="Our take">
      <div className="tray min-w-0">
        <div className="tray-in h-full p-6 md:p-8">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-[12px] text-ink-subtle" data-reveal>
            <Link href="/" className="press inline-flex h-8 items-center gap-1.5 rounded-full px-3 pl-2 text-ink-muted shadow-[inset_0_0_0_1px_var(--hairline)] hover:text-ink">
              <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3 5 7l4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>Pipeline
            </Link>
            <span className="rounded-full bg-surface-2 px-2.5 py-1">{sectorName(d.app.sector_inferred ?? d.app.sector_label)}</span>
            {d.app.sector_label_matches === false && <span className="rounded-full bg-amber-bg px-2.5 py-1 text-amber" title={d.app.sector_reason ?? undefined}>Labelled “{d.app.sector_label}”</span>}
            <span className="rounded-full bg-surface-2 px-2.5 py-1">{d.app.stage_label}</span>
            <span className="rounded-full bg-surface-2 px-2.5 py-1">{d.app.source === "warm_intro" ? "Warm intro" : "Application form"}</span>
            {s?.written_fit && <Badge tone={FIT[s.written_fit].tone} title={s.written_fit_reason ?? undefined}>{FIT[s.written_fit].label}</Badge>}
          </nav>
          <h1 className="mt-5 font-display text-[48px] font-normal leading-[0.95] tracking-[-1.2px] md:text-[64px]">{d.app.company_name}</h1>
          <p className="mt-2 text-[15px] text-ink-muted" data-reveal>{d.app.one_liner}</p>

          <div className="mt-6 border-t border-hairline pt-5" data-reveal>
            <span className="eyebrow-pill">Our take</span>
            <p className="mt-3 font-display text-[30px] leading-[1.1] tracking-[-0.4px] md:text-[34px]">{take.verdict}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {strong && (
                <div className="rounded-[14px] bg-green-bg px-4 py-3.5">
                  <p className="text-[12px] font-semibold text-green">For it</p>
                  <p className="mt-1 text-[14px] leading-relaxed text-ink">{firstSentence(strong.rationale, 220)}</p>
                </div>
              )}
              {weak && (
                <div className="rounded-[14px] bg-amber-bg px-4 py-3.5">
                  <p className="text-[12px] font-semibold text-amber">Against it</p>
                  <p className="mt-1 text-[14px] leading-relaxed text-ink">{firstSentence(weak.rationale, 220)}</p>
                </div>
              )}
            </div>
            {rec?.what_would_change && rec.action !== "take_call" && (
              <p className="mt-4 text-[14px] leading-relaxed text-ink-muted"><span className="font-medium text-ink">What would change our mind:</span> {firstSentence(rec.what_would_change, 200)}</p>
            )}
            {precedent?.company && <p className="mt-3 text-[13px] text-ink-subtle">Reminds us of <span className="font-display text-[17px] text-ink">{precedent.company}</span> ({precedent.outcome}).</p>}
          </div>
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-4" data-reveal>
        <div className="rounded-[20px] bg-canvas p-5 shadow-[inset_0_0_0_1px_var(--hairline)]">
          <div className="flex items-start justify-between gap-3">
            <p className="eyebrow">{view === "written" ? "Against our written thesis" : "Against how we actually invest"}</p>
            {rec && <Badge tone={ACTION[rec.action].tone}>{ACTION[rec.action].label}</Badge>}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="font-display text-[38px] leading-none">{ratingWord(s ? Number(s.total) : null).word}</span>
            <Meter score={s ? Number(s.total) : null} />
          </div>
          <div role="group" aria-label="Thesis view" className="mt-4 flex self-start rounded-full bg-surface-1 p-1 shadow-[inset_0_0_0_1px_var(--hairline)]">
            {(["revealed", "written"] as const).map((v) => (
              <Link key={v} href={`?view=${v}`} replace scroll={false} aria-current={view === v ? "true" : undefined}
                className={cx("press flex h-8 flex-1 items-center justify-center rounded-full px-3 text-[12px]", view === v ? "bg-solid font-medium text-on-solid" : "text-ink-subtle hover:text-ink")}>
                {v === "revealed" ? "How we invest" : "What we say"}
              </Link>
            ))}
          </div>
          {tripped.length === 0 ? (
            <p className="mt-4 flex items-center gap-1.5 text-[13px] text-green"><span aria-hidden>✓</span> Clears every gate: stage, sector, conflicts, integrity.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {tripped.map((g) => {
                const reasons = (g.reasons ?? []) as { text: string; claim_keys?: string[]; portfolio?: { company: string; source_url: string } }[];
                return (
                  <li key={g.gate} className="rounded-[14px] bg-red-bg px-3.5 py-3">
                    <p className="flex items-center gap-1.5 text-[13px] font-medium text-red"><GateIcon /> {GATE_NAMES[g.gate]}: Kushal decides</p>
                    {reasons.slice(0, 2).map((r, i) => (
                      <div key={i} className="mt-1 space-y-1 text-[12px] text-ink">
                        <p>{r.text}{r.portfolio && <> (<a className="text-primary underline" href={r.portfolio.source_url} target="_blank" rel="noreferrer">source</a>)</>}</p>
                        <Chips keys={r.claim_keys ?? []} claims={d.claims} />
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {decision}
      </aside>
    </section>
  );
}

function CriterionCard({ c, d, canAct }: { c: Detail["crits"][number]; d: Detail; canAct: boolean }) {
  const memo = d.memos.find((m) => m.id === c.precedent_memo_id);
  const applied = (c.applied_corrections ?? []) as AppliedCorrection[];
  return (
    <article data-reveal-scroll className="rounded-[20px] bg-canvas p-5 shadow-[inset_0_0_0_1px_var(--hairline)]" aria-labelledby={`crit-${c.criterion}`}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`crit-${c.criterion}`} className="font-display text-[24px] font-normal leading-tight">{CRIT_NAMES[c.criterion]}</h3>
        <div className="flex items-center gap-2">
          {c.status === "needs_attention" && <Badge tone="amber" title={c.status_reason ?? undefined}>Needs a look</Badge>}
          <Badge tone={CONF[c.confidence].tone} title="How well this is backed: checked outside, deck and form agree, or the deck alone">{CONF[c.confidence].label}</Badge>
          <Meter score={Number(c.score)} />
        </div>
      </header>
      <div className="mt-2.5 space-y-2 text-[13px]">
        <Cited text={c.rationale} claims={d.claims} />
        {c.gap && <p className="text-[12px] text-amber">Couldn’t confirm: {c.gap}</p>}
        {c.question_for_call && <p className="text-[12px] text-ink-muted"><span className="font-medium text-ink">We’d ask:</span> {c.question_for_call}</p>}
        {memo && <p className="text-[12px] text-ink-subtle">Like {memo.company} ({memo.outcome}){c.precedent_note ? `: ${c.precedent_note}` : ""}</p>}
        {c.is_override && (
          <p className="rounded-[10px] bg-surface-1 px-2.5 py-1.5 text-[12px] text-ink-muted">
            <span className="font-medium text-ink">Corrected by {personName(c.override_by_email)}:</span> {c.override_reason}
          </p>
        )}
        {applied.length > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label="Past corrections the scorer was shown">
            {applied.map((a) => (
              <li key={a.id} className="rounded-[10px] bg-surface-1 px-2 py-1 text-[12px] text-ink-muted shadow-[0_0_0_1px_var(--hairline)]" title={`${a.criterion} moved ${a.from} → ${a.to}`}>
                Applied correction from <span className="font-medium text-ink">{a.company}</span> ({a.by}): {a.reason}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Chips keys={c.claim_keys as string[]} claims={d.claims} />
          <OverrideButton applicationId={d.app.id} criterion={c.criterion} name={CRIT_NAMES[c.criterion]} current={Number(c.score)} canAct={canAct} />
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
    <Panel bare title="What we couldn’t find">
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
        <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-[12px]">
          <thead className="text-ink-subtle"><tr><th className="py-1 pr-2 font-medium">Looking for</th><th className="py-1 pr-2 font-medium">Query</th><th className="num py-1 text-right font-medium">Results</th></tr></thead>
          <tbody>
            {q.map((x) => (
              <tr key={x.id} className="border-t border-hairline align-top">
                <td className="py-1.5 pr-2 text-ink-subtle">{x.purpose.replace(/_/g, " ")}</td>
                <td className="py-1.5 pr-2 font-mono text-[11px] text-ink-muted [overflow-wrap:anywhere]">{x.query}{x.error && <span className="mt-0.5 block font-sans text-amber">{x.error}</span>}</td>
                <td className="num py-1.5 text-right">{x.result_count}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </details>
    </Panel>
  );
}

function Contradictions({ d }: { d: Detail }) {
  const flags = d.flags.filter((f) => f.severity !== "info");
  const info = d.flags.filter((f) => f.severity === "info");
  const keyOf = new Map(d.claims.map((c) => [c.id, c.key]));
  return (
    <Panel bare title="Contradictions and checks" right={<span className="num text-[12px] text-ink-subtle">{flags.length} to ask about</span>}>
      {flags.length === 0 && <p className="text-[13px] text-ink-subtle">The deck, the form and the arithmetic agree.</p>}
      <ul className="space-y-3">
        {[...flags, ...info].map((f) => (
          <li key={f.id} className="text-[13px]">
            <div className="flex items-center gap-1.5">
              <Badge tone={f.severity === "red" ? "red" : f.severity === "warn" ? "amber" : "neutral"}>{f.severity === "red" ? "Red" : f.severity === "warn" ? "Check" : "Note"}</Badge>
              <span className="font-medium">{CHECK_LABEL[f.check as string] ?? String(f.check).replace(/_/g, " ")}</span>
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
    <Panel bare title="Founder dossier">
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
          ) : <p className="text-[12px] text-ink-subtle">Nothing found online to confirm or contradict these.</p>}
          {sameName.length > 0 && <p className="mt-1.5 text-[12px] text-ink-subtle">{sameName.length} result(s) set aside: same name, different company or person.</p>}
        </div>
      </div>
    </Panel>
  );
}

const EVENT: Record<string, string> = {
  email_drafted: "Email drafted", email_redo: "Draft redone", email_sent: "Email sent", founder_replied: "Founder replied",
  reply_needs_riya: "Reply needs Riya", follow_up_sent: "Follow-up sent", counter_proposal_sent: "New times offered",
  call_booked: "Call booked", pending_dismissed: "Prepared reply dismissed", decided: "Partner decided",
};

function Timeline({ d }: { d: Detail }) {
  if (!d.timeline.length) return null;
  return (
    <Panel bare title="Timeline">
      <ol className="space-y-1.5 text-[12px]">
        {d.timeline.map((e) => {
          const p = e.payload as { template?: string; by?: string; decision?: string };
          return (
            <li key={e.id} className="flex justify-between gap-3">
              <span className="text-ink">{EVENT[e.kind] ?? e.kind.replace(/_/g, " ")}{p.template ? ` (${p.template.replace("_", "-")})` : ""}{p.decision ? `: ${p.decision}` : ""}{p.by ? <span className="text-ink-subtle"> · {p.by}</span> : null}</span>
              <span className="num shrink-0 text-ink-subtle">{fmtDate(e.created_at)}</span>
            </li>
          );
        })}
      </ol>
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
  const crits = CRITS.map((c) => d.crits.find((x) => x.criterion === c)).filter((x): x is Detail["crits"][number] => !!x);
  const rec = d.rec;
  const [user, gmail] = await Promise.all([currentUser(), mailboxEmail().catch(() => null)]);
  const asks = rec && (rec.dig_questions as string[]).length > 0 ? (rec.dig_questions as string[]) : [];
  const toAsk = d.flags.filter((f) => f.severity !== "info").length;

  return (
    <Reveal className="space-y-6">
      {d.app.status === "needs_attention" && (
        <div role="alert" className="rounded-[16px] bg-amber-bg px-4 py-3 text-[13px] text-amber" data-reveal>
          <p className="font-medium">Needs a look</p>
          <p>{d.app.status_reason}</p>
        </div>
      )}
      <Header d={d} view={view} decision={<DecisionBar applicationId={d.app.id} decided={d.decisions[0]} canDecide={!!user?.partner} signedIn={!!user} />} />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section className="min-w-0 space-y-3" aria-labelledby="h-crit">
          <h2 id="h-crit" className="font-display text-[28px] font-normal" data-reveal>How it reads, area by area</h2>
          {crits.length ? crits.map((c) => <CriterionCard key={c.criterion} c={c} d={d} canAct={!!user} />) : (
            <div className="elev-1 rounded-[20px] p-6 text-center text-ink-subtle">Not scored yet. Scoring runs after research and gates.</div>
          )}
        </section>
        <section className="min-w-0 space-y-3" aria-labelledby="h-next">
          <h2 id="h-next" className="font-display text-[28px] font-normal" data-reveal>What happens next</h2>
          <div data-reveal>
            <Composer
              applicationId={d.app.id}
              draft={d.draft as ComposerDraft}
              suggested={rec?.action === "take_call" ? "invite" : rec?.action === "dig" ? "dig" : "pass"}
              gmail={gmail}
              signedIn={!!user}
              founderEmail={d.founderEmail}
              sentSlots={((d.threads as ThreadRow[]).find((t) => t.context.offered?.length === 2)?.context.offered ?? []).map(formatSlot)}
            />
          </div>
          <OutreachPanel applicationId={d.app.id} threads={d.threads as ThreadRow[]} meetings={d.meetings} canAct={!!user} />
          {asks.length > 0 && (
            <div data-reveal-scroll>
              <Panel title={rec?.action === "dig" ? "What we’d want to know first" : "What we’d cover on the call"}>
                <ol className="list-decimal space-y-1.5 pl-4 text-[13px] text-ink-muted">{asks.map((q, i) => <li key={i}>{q}</li>)}</ol>
              </Panel>
            </div>
          )}
          <div data-reveal-scroll>
            <Tabs
              label="Evidence"
              items={[
                { id: "checks", label: toAsk ? `Checks · ${toAsk} to ask` : "Checks", content: <Contradictions d={d} /> },
                { id: "founders", label: "Founders", content: <Dossier d={d} /> },
                { id: "gaps", label: "What we couldn’t find", content: <CouldntFind d={d} /> },
                { id: "timeline", label: "Timeline", content: <Timeline d={d} /> },
                {
                  id: "run", label: "Run log", content: (
                    <ul className="space-y-1 text-[12px] text-ink-muted">
                      {d.jobs.map((j, i) => (
                        <li key={i} className="flex items-center justify-between gap-2">
                          <span className="capitalize">{STEP_LABEL[j.step as string] ?? String(j.step).replace(/_/g, " ")} · {j.status}{j.last_error ? `: ${j.last_error}` : ""}</span>
                          {j.langfuse_trace_id && i === 0 && (
                            <a className="text-primary underline" target="_blank" rel="noreferrer" href={`${process.env.LANGFUSE_HOST ?? "https://cloud.langfuse.com"}/trace/${j.langfuse_trace_id}`}>Langfuse trace</a>
                          )}
                        </li>
                      ))}
                    </ul>
                  ),
                },
              ]}
            />
          </div>
        </section>
      </div>
    </Reveal>
  );
}
