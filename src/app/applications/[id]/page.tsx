import Link from "next/link";
import { notFound } from "next/navigation";
import { loadDetail, type ClaimLite, type Detail } from "@/lib/data/detail";
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

// Source tags ([d03], f02 form p1…) stay in the data for audit but never show here: one plain line per point.
// Whole first sentences only; the length cap is a safety net, set high enough that real sentences don't get cut.
const plain = (t: string | null | undefined, max = 260) => firstSentence(t, max);

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
              <p className="mt-4 text-[14px] leading-relaxed text-ink-muted"><span className="font-medium text-ink">What would change our mind:</span> {plain(rec.what_would_change)}</p>
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
                    <p className="flex items-center gap-1.5 text-[13px] font-medium text-red"><GateIcon /> {GATE_NAMES[g.gate]}: check before deciding</p>
                    {reasons.slice(0, 1).map((r, i) => (
                      <p key={i} className="mt-1 text-[12px] text-ink">{plain(r.text, 140)}{r.portfolio && <> (<a className="text-primary underline" href={r.portfolio.source_url} target="_blank" rel="noreferrer">source</a>)</>}</p>
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

/** One area in a line: name, rating, the reason in plain words, and the one question worth asking. */
function AreaRow({ c }: { c: Detail["crits"][number] }) {
  return (
    <li className="grid gap-x-5 gap-y-1 px-5 py-4 md:grid-cols-[180px_1fr]">
      <div className="flex items-center justify-between gap-2 md:block">
        <h3 className="font-display text-[20px] font-normal leading-tight">{CRIT_NAMES[c.criterion]}</h3>
        <div className="md:mt-1"><Meter score={Number(c.score)} /></div>
      </div>
      <div className="min-w-0 space-y-1.5 text-[13px]">
        <p className="text-ink">{plain(c.rationale)}</p>
        {c.question_for_call && <p className="text-ink-muted"><span className="font-medium text-ink">Ask:</span> {plain(c.question_for_call)}</p>}
        {c.is_override && <p className="text-[12px] text-ink-subtle">Changed by {personName(c.override_by_email)}: {plain(c.override_reason, 120)}</p>}
        {c.status === "needs_attention" && <p className="text-[12px] text-amber">Needs a look before relying on this.</p>}
      </div>
    </li>
  );
}


function CouldntFind({ d }: { d: Detail }) {
  const q = d.queries;
  const notConfigured = q.some((x) => /not configured/.test(x.error ?? ""));
  const empty = q.filter((x) => x.result_count === 0);
  const matched = d.findings.filter((f) => f.is_match);
  const gaps = d.crits.filter((c) => c.gap);
  return (
    <Panel bare title="What we couldn’t confirm">
      <p className="text-[13px] text-ink-muted">
        {notConfigured
          ? "Web research hasn’t run yet, so nothing here was checked outside the deck and form."
          : matched.length === 0
            ? "Nothing found online about this company or its founders."
            : `${matched.length} outside source${matched.length > 1 ? "s" : ""} found; ${empty.length} search${empty.length === 1 ? "" : "es"} came back empty.`}
      </p>
      {gaps.length > 0 && (
        <ul className="mt-2.5 space-y-1.5 text-[13px]">
          {gaps.map((c) => (
            <li key={c.criterion}><span className="font-medium text-ink">{CRIT_NAMES[c.criterion]}:</span> <span className="text-ink-muted">{plain(c.gap)}</span></li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Contradictions({ d }: { d: Detail }) {
  // only what needs asking; agreeing numbers and notes aren't worth a founder's attention
  const flags = d.flags.filter((f) => f.severity !== "info");
  return (
    <Panel bare title="Numbers that don’t add up">
      {flags.length === 0 && <p className="text-[13px] text-ink-muted">The deck, the form and the arithmetic agree.</p>}
      <ul className="space-y-2.5">
        {flags.map((f) => (
          <li key={f.id} className="text-[13px]">
            <span className={cx("font-medium", f.severity === "red" ? "text-red" : "text-amber")}>{CHECK_LABEL[f.check as string] ?? String(f.check).replace(/_/g, " ")}:</span>{" "}
            <span className="text-ink-muted">{plain(f.explanation)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Dossier({ d }: { d: Detail }) {
  const found = d.findings.filter((f) => f.is_match && f.extracted_claim).slice(0, 4);
  return (
    <Panel bare title="The founders">
      <ul className="space-y-1">
        {d.founders.map((f) => (
          <li key={f.id} className="text-[13px] font-medium">{f.full_name} <span className="font-normal text-ink-subtle">{f.role_title}</span></li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] font-medium text-ink">Checked online</p>
      {found.length ? (
        <ul className="mt-1 space-y-1 text-[13px] text-ink-muted">{found.map((f) => <li key={f.id}>{plain(f.extracted_claim, 140)}</li>)}</ul>
      ) : <p className="mt-1 text-[13px] text-ink-muted">Nothing found online to confirm or contradict what they say.</p>}
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
      <Header d={d} view={view} decision={<DecisionBar applicationId={d.app.id} decided={d.decisions[0]} canDecide={!!user} signedIn={!!user} />} />

      {/* the main job: send the letter; the app then gets a time from the founder and books it on Riya's calendar */}
      <section aria-labelledby="h-next" className="space-y-3">
        <h2 id="h-next" className="font-display text-[28px] font-normal" data-reveal>Email and meeting</h2>
        <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
          <div className="min-w-0" data-reveal>
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
          <div className="min-w-0 space-y-3">
            <OutreachPanel applicationId={d.app.id} threads={d.threads as ThreadRow[]} meetings={d.meetings} canAct={!!user} />
            {!d.threads.length && (
              <div className="rounded-[20px] bg-surface-1 p-4 text-[13px] text-ink-muted">
                <p className="font-medium text-ink">How the meeting gets booked</p>
                <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                  <li>You send the letter. It asks the founder for a day and time.</li>
                  <li>When they reply, the app checks your calendar every few minutes.</li>
                  <li>If you're free, it books the call with a Meet link and confirms. If not, it offers two free times.</li>
                </ol>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* the evidence stays one click away for when Riya wants it, but never in her way */}
      <details className="group rounded-[20px] bg-canvas shadow-[inset_0_0_0_1px_var(--hairline)]">
        <summary className="press flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
          <span className="font-display text-[22px] font-normal">More detail</span>
          <span className="text-[12px] text-ink-subtle">Area by area, the numbers, the founders <span aria-hidden className="ml-1 inline-block transition-transform group-open:rotate-180">⌄</span></span>
        </summary>
        <div className="space-y-5 border-t border-hairline p-4 md:p-5">
          {crits.length ? (
            <ul className="divide-y divide-hairline rounded-[16px] shadow-[inset_0_0_0_1px_var(--hairline)]" aria-label="Area by area">
              {crits.map((c) => <AreaRow key={c.criterion} c={c} />)}
            </ul>
          ) : (
            <p className="text-center text-ink-subtle">Not scored yet. Scoring runs after research and checks.</p>
          )}
          {asks.length > 0 && (
            <Panel title={rec?.action === "dig" ? "What we’d want to know first" : "What we’d cover on the call"}>
              <ol className="list-decimal space-y-1.5 pl-4 text-[13px] text-ink-muted">{asks.map((q, i) => <li key={i}>{q}</li>)}</ol>
            </Panel>
          )}
          <Tabs
            label="Evidence"
            items={[
              { id: "checks", label: toAsk ? `Numbers · ${toAsk}` : "Numbers", content: <Contradictions d={d} /> },
              { id: "founders", label: "Founders", content: <Dossier d={d} /> },
              { id: "gaps", label: "Unconfirmed", content: <CouldntFind d={d} /> },
              ...(d.timeline.length ? [{ id: "timeline", label: "Timeline", content: <Timeline d={d} /> }] : []),
            ]}
          />
        </div>
      </details>
    </Reveal>
  );
}
