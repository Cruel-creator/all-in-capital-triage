// Calibration backtest (build prompt §9.4): score the 12 deal memos as if they were new applications and compare
// with what the fund did. To keep it honest, the scorer sees only the memo's factual sections ("What it does",
// "Founder assessment", "Risks and open questions") with names redacted and the outcome removed; never the
// "Why we invested/passed" section, the stage label (which mirrors the outcome in these memos) or rule evidence
// (which names memo outcomes). That section is used only afterwards, to argue each disagreement.
import { z } from "zod";
import { admin, must } from "./db/admin";
import { callModel } from "./llm/gateway";
import { render } from "./llm/prompts";
import { prompt } from "./pipeline/gates";
import { CRITERIA, actionOf, lensFor, lensWeights, weighted, type CritScore, type Criterion } from "./scoring/rank";

export const FACT_SECTIONS = ["What it does", "Founder assessment", "Risks and open questions"];
const OUTCOME_SENTENCE = /\b(we passed|we invested|passed on|invested in|our (investment|cheque)|why we|reached a call|term sheet)\b/i;

export type Fact = { id: string; section: string; text: string };

/** Founder names in a memo's founder section become "Founder A/B"; later mentions of either name too. Pure; tested. */
export function redactPeople(texts: string[]): string[] {
  const founderText = texts.join(" ");
  const first = founderText.match(/^[^.]*\./)?.[0] ?? "";
  const names = [...first.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g)].map((m) => m[1]).filter((n) => !/^(Founder|The|A|An)\b/.test(n));
  const label = new Map<string, string>();
  names.forEach((n, i) => {
    const l = `Founder ${String.fromCharCode(65 + i)}`;
    label.set(n, l);
    for (const part of n.split(/\s+/)) if (part.length > 2 && !label.has(part)) label.set(part, l);
  });
  const keys = [...label.keys()].sort((a, b) => b.length - a.length);
  return texts.map((t) => keys.reduce((s, k) => s.replace(new RegExp(`\\b${k}\\b`, "g"), label.get(k)!), t));
}

/** Memo chunks → numbered fact sentences the scorer may cite. Outcome language and names removed. Pure; tested. */
export function memoFacts(company: string, chunks: { section: string; text: string }[]): Fact[] {
  const out: Fact[] = [];
  for (const section of FACT_SECTIONS) {
    const body = chunks
      .filter((c) => c.section === section)
      .map((c) => c.text.replace(new RegExp(`^${company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\((passed|invested)\\)\\.\\s*${section}\\.\\s*`, "i"), ""))
      .join(" ");
    const sentences = (body.match(/[^.!?]+[.!?]+/g) ?? []).map((s) => s.trim()).filter((s) => s && !OUTCOME_SENTENCE.test(s));
    const clean = section === "Founder assessment" ? redactPeople(sentences) : sentences;
    for (const text of clean) out.push({ id: `s${String(out.length + 1).padStart(2, "0")}`, section, text: text.split(company).join("the company") });
  }
  return out;
}

/** The memo's own reasoning, used only after scoring to argue disagreements. */
export const whySection = (company: string, chunks: { section: string; text: string }[]) =>
  chunks.filter((c) => /^Why we/.test(c.section)).map((c) => c.text.replace(new RegExp(`^${company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\((passed|invested)\\)\\.\\s*`, "i"), "")).join(" ");

export type Prediction = "invest" | "pass";
/** Take the call is the system's "yes"; dig and pass are "not yet". */
export const predictionOf = (action: "take_call" | "dig" | "pass"): Prediction => (action === "take_call" ? "invest" : "pass");

export function confusion(rows: { predicted: Prediction; actual: "invested" | "passed" }[]) {
  const m = { invest_invested: 0, invest_passed: 0, pass_invested: 0, pass_passed: 0 };
  for (const r of rows) m[`${r.predicted}_${r.actual}` as keyof typeof m]++;
  const agree = m.invest_invested + m.pass_passed;
  return { ...m, agree, total: rows.length, agreement_pct: rows.length ? Math.round((agree / rows.length) * 1000) / 10 : 0 };
}

/** Of every (invested, passed) pair, the share where the invested company scored higher (ties count half). Pure; tested. */
export function rankAgreement(rows: { total: number; actual: "invested" | "passed" }[]) {
  const inv = rows.filter((r) => r.actual === "invested"), pas = rows.filter((r) => r.actual === "passed");
  let wins = 0;
  for (const a of inv) for (const b of pas) wins += a.total > b.total ? 1 : a.total === b.total ? 0.5 : 0;
  const pairs = inv.length * pas.length;
  return {
    pairs, wins, pct: pairs ? Math.round((wins / pairs) * 1000) / 10 : 0,
    lowestInvested: inv.length ? Math.min(...inv.map((r) => r.total)) : null,
    highestPassed: pas.length ? Math.max(...pas.map((r) => r.total)) : null,
  };
}

/** Memo sector text → rubric lens key (deeptech, consumer brand, lending fintech), else none. */
export function sectorKey(sector: string): string {
  const s = sector.toLowerCase();
  if (s.includes("deeptech")) return "deeptech";
  if (s.includes("consumer brand")) return "consumer brand";
  if (s.includes("credit") || s.includes("lending")) return "lending fintech";
  return s.split(" (")[0];
}

const Scored = z.object({
  criteria: z.array(z.object({ criterion: z.enum(["C1", "C2", "C3", "C4", "C5", "C6"]), score: z.number().min(0).max(10), rationale: z.string().min(10), gap: z.string().nullable().default(null) })).length(6),
});
const Argued = z.object({
  fund_was_wrong: z.string().min(10), fund_sources: z.array(z.string()).default([]),
  system_was_wrong: z.string().min(10), system_sources: z.array(z.string()).default([]),
});
export type Argument = { fund_was_wrong: string; system_was_wrong: string; fund_sources?: string[]; system_sources?: string[] };

const cited = (t: string) => [...t.matchAll(/\[([^\]]+)\]/g)].flatMap((m) => m[1].split(/\s*,\s*/));

const SLOP = /\b(overlook(ed|ing|s)?|penali[sz](ed|es|ing)?|headwinds?|robust|leverag(e|ed|ing)|unique(ly)?|critical|severe|extreme|demonstrat(e|es|ed|ing)|showcas(e|es|ed|ing)|navigat(e|es|ed|ing)|landscape|holistic)\b/i;
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Checks one argued disagreement: short, plain, sources known and kept out of the sentence. Pure; tested. */
export function checkArgument(x: Argument, known: Set<string>): string | null {
  for (const [k, text, src] of [["fund_was_wrong", x.fund_was_wrong, x.fund_sources ?? []], ["system_was_wrong", x.system_was_wrong, x.system_sources ?? []]] as const) {
    if (/[[\]—;]/.test(text)) return `${k}: no brackets, IDs, em dashes or semicolons in the sentence; put IDs in the sources list.`;
    if (wordCount(text) > 24) return `${k}: one sentence of at most 20 words (it has ${wordCount(text)}).`;
    if ((text.match(/[.!?](\s|$)/g) ?? []).length > 1) return `${k}: one sentence only.`;
    const slop = text.match(SLOP)?.[0];
    if (slop) return `${k}: say it plainly without "${slop}".`;
    if (!src.length) return `${k}: list at least one fact ID it relies on in its sources.`;
    const bad = src.filter((s) => !known.has(s.replace(/^\[|\]$/g, "")));
    if (bad.length) return `${k}: cite only the fact IDs listed or "why" (not: ${bad.join(", ")}).`;
  }
  return null;
}

/** Older runs wrote citations inline ("…cheque [s08]."): drop them for display. Pure; tested. */
export const plainArgument = (t: string) =>
  t.replace(/\s*\[[^\]]*\]/g, "").replace(/\s+([.,!?])/g, "$1").replace(/\s{2,}/g, " ").trim();

export type BacktestRow = {
  memo_no: number; company: string; sector: string; actual: "invested" | "passed"; action: "take_call" | "dig" | "pass"; predicted: Prediction;
  total: number; agree: boolean; criteria: { criterion: Criterion; score: number; rationale: string; gap: string | null }[];
  facts: Fact[]; why: string; argument?: Argument;
};

type Tpl = Awaited<ReturnType<typeof prompt>>;
const ARGUE_VERSION = 2;

/** Argue one disagreement both ways (only after scoring, so the fund's reasoning never reaches the scorer). */
async function argue(r: Pick<BacktestRow, "company" | "action" | "total" | "actual" | "criteria" | "facts" | "why">, tpl: Tpl): Promise<Argument> {
  const { data } = await callModel({
    step: "calibrate:argue",
    prompt: {
      name: tpl.name, version: tpl.version, versionId: tpl.versionId, system: tpl.system,
      user: render(tpl.user, {
        system_view: `${r.action === "take_call" ? "Take the call" : r.action === "dig" ? "Dig first" : "Pass"} (weighted ${r.total}/10)`,
        fund_view: r.actual === "invested" ? "Invested" : "Passed",
        scores: r.criteria.map((c) => `${c.criterion} ${c.score}: ${plainArgument(c.rationale)}`).join("\n"),
        facts: r.facts.map((f) => `${f.id} ${f.text}`).join("\n"),
        why: redactPeople([r.why])[0].split(r.company).join("the company"),
      }),
    },
    schema: Argued,
    validate: (x) => checkArgument(x, new Set([...r.facts.map((f) => f.id), "why"])),
  });
  return data;
}

/** Re-argue the latest run's disagreements with the current prompt, without re-scoring. About one call per disagreement. */
export async function reargueLatest(log: (s: string) => void = () => {}) {
  const db = admin();
  const run = must(await db.from("calibration_runs").select("id, results, confusion").order("created_at", { ascending: false }).limit(1).single(), "latest run");
  const memos = must(await db.from("memos").select("id, memo_no, company"), "memos");
  const chunks = must(await db.from("memo_chunks").select("memo_id, section, text"), "memo chunks");
  const tpl = await prompt("calibrate_argue", ARGUE_VERSION);
  const rows = run.results as BacktestRow[];
  for (const r of rows.filter((x) => !x.agree)) {
    const m = memos.find((x) => x.memo_no === r.memo_no);
    if (!m) continue;
    const mine = chunks.filter((c) => c.memo_id === m.id);
    r.argument = await argue({ ...r, facts: memoFacts(m.company, mine), why: whySection(m.company, mine) }, tpl);
    log(`${r.company}: ${r.argument.fund_was_wrong} | ${r.argument.system_was_wrong}`);
  }
  const report = reportMd(rows, { ...(run.confusion as ReturnType<typeof confusion>), ranking: rankAgreement(rows) });
  must(await db.from("calibration_runs").update({ results: rows, report_md: report }).eq("id", run.id).select("id"), "update run");
  return { runId: run.id as string, report };
}

export async function runBacktest(log: (s: string) => void = () => {}) {
  const db = admin();
  const memos = must(await db.from("memos").select("id, memo_no, company, outcome, sector").order("memo_no"), "memos");
  const chunks = must(await db.from("memo_chunks").select("memo_id, section, text"), "memo chunks");
  const rv = must(await db.from("rubric_versions").select("id, config").eq("is_active", true).single(), "rubric");
  const tv = must(await db.from("thesis_versions").select("revealed").eq("is_active", true).single(), "thesis");
  const rubric = rv.config;
  const scoreTpl = await prompt("calibrate_score", 1);
  const argueTpl = await prompt("calibrate_argue", ARGUE_VERSION);
  const rules = (tv.revealed.rules as { id: string; text: string }[]).map((r) => `${r.id}: ${r.text}`).join("\n"); // evidence withheld
  const criteriaText = CRITERIA.map((c) => {
    const d = rubric.criteria[c];
    return `${c} ${d.name}: ${d.covers}\n${Object.entries(d.anchors).map(([k, v]) => `  ${k}: ${v}`).join("\n")}`;
  }).join("\n\n");
  const base = Object.fromEntries(CRITERIA.map((c) => [c, rubric.criteria[c].weight])) as Record<Criterion, number>;

  const one = async (m: (typeof memos)[number]): Promise<BacktestRow> => {
    const mine = chunks.filter((c) => c.memo_id === m.id);
    const facts = memoFacts(m.company, mine);
    const ids = new Set(facts.map((f) => f.id));
    const sector = sectorKey(m.sector);
    const { data } = await callModel({
      step: "calibrate:score",
      prompt: {
        name: scoreTpl.name, version: scoreTpl.version, versionId: scoreTpl.versionId, system: scoreTpl.system,
        user: render(scoreTpl.user, { sector: m.sector, criteria: criteriaText, rules, facts: facts.map((f) => `${f.id} [${f.section}] ${f.text}`).join("\n") }),
      },
      schema: Scored,
      validate: (x) => {
        const bad = x.criteria.flatMap((c) => cited(c.rationale)).filter((k) => !ids.has(k));
        if (bad.length) return `Cite only the fact IDs listed (unknown: ${[...new Set(bad)].join(", ")}).`;
        if (new Set(x.criteria.map((c) => c.criterion)).size !== 6) return "Return each of C1 to C6 exactly once.";
        const uncited = x.criteria.filter((c) => c.score > 2 && cited(c.rationale).length === 0).map((c) => c.criterion);
        return uncited.length ? `Every criterion scored above 2 needs at least one cited fact (missing: ${uncited.join(", ")}).` : null;
      },
    });
    const scores: CritScore[] = data.criteria.map((c) => ({ criterion: c.criterion, score: Math.round(c.score * 10) / 10, confidence: cited(c.rationale).length ? "med" : "low", rules: [] }));
    const lens = lensFor(sector, rubric.sector_lens_map);
    const total = weighted(scores, lensWeights(base, lens ? rubric.lenses[lens] : null));
    const action = actionOf(total, { G1: false, G2: false, G3: false, G4: false }, scores, { call: rubric.recommendation.take_call.min_score, dig: rubric.recommendation.dig.min_score });
    const predicted = predictionOf(action);
    const actual = m.outcome as "invested" | "passed";
    log(`${m.company}: ${action} (${total}) vs ${actual}`);
    return {
      memo_no: m.memo_no, company: m.company, sector: m.sector, actual, action, predicted, total,
      agree: (predicted === "invest") === (actual === "invested"),
      criteria: data.criteria.map((c) => ({ ...c, score: Math.round(c.score * 10) / 10 })), facts, why: whySection(m.company, mine),
    };
  };

  const rows: BacktestRow[] = [];
  for (let i = 0; i < memos.length; i += 3) rows.push(...(await Promise.all(memos.slice(i, i + 3).map(one))));

  // only now may the fund's own reasoning be read: argue both sides of each disagreement
  for (const r of rows.filter((x) => !x.agree)) r.argument = await argue(r, argueTpl);

  const c = { ...confusion(rows), ranking: rankAgreement(rows) };
  const report = reportMd(rows, c);
  const cost = must(await db.from("llm_calls").select("cost_usd").like("step", "calibrate:%").gte("created_at", new Date(Date.now() - 3600e3).toISOString()), "cost").reduce((a, x) => a + Number(x.cost_usd ?? 0), 0);
  const run = must(
    await db.from("calibration_runs").insert({
      rubric_version_id: rv.id, prompt_version_id: scoreTpl.versionId, agreement_pct: c.agreement_pct, confusion: c,
      results: rows.map(({ facts: _f, why: _w, ...rest }) => { void _f; void _w; return rest; }), report_md: report, cost_usd: Math.round(cost * 10000) / 10000,
    }).select("id").single(),
    "calibration run",
  );
  return { runId: run.id as string, confusion: c, rows, report };
}

const ACTION_WORD = { take_call: "take the call", dig: "dig first", pass: "pass" } as const;

export function reportMd(rows: BacktestRow[], c: ReturnType<typeof confusion> & { ranking: ReturnType<typeof rankAgreement> }) {
  const k = c.ranking;
  const ranks =
    k.lowestInvested != null && k.highestPassed != null && k.lowestInvested > k.highestPassed
      ? `Ranking separates them completely: every company the fund backed scored above every company it passed on (lowest backed ${k.lowestInvested}, highest passed ${k.highestPassed}). The disagreement is the absolute scale, not the order.`
      : `Ranking: in ${k.wins} of ${k.pairs} pairs the company the fund backed scored higher (${k.pct}%).`;
  const lines = [
    "# Calibration backtest",
    "",
    `Agreement with the fund's decisions: **${c.agree} of ${c.total}** (${c.agreement_pct}%). "Take the call" counts as yes; "dig first" and "pass" count as not yet.`,
    "",
    "| | Fund invested | Fund passed |",
    "|---|---|---|",
    `| **System: take the call** | ${c.invest_invested} | ${c.invest_passed} |`,
    `| **System: dig or pass** | ${c.pass_invested} | ${c.pass_passed} |`,
    "",
    ranks,
    "",
    "Caveat: the revealed-thesis rules were written from these same memos, so this is an in-sample check and flatters the system. The scorer saw only each memo's factual sections, with names and the outcome removed.",
    "",
    "## Memo by memo",
    "",
    ...rows.map((r) => `- **${r.company}** (${r.actual}): system says ${ACTION_WORD[r.action]}, ${r.agree ? "agrees" : "**disagrees**"}.`),
    "- **Ledgerly**: missing. The partner notes for Ledgerly are not in the data, so it can't be scored.",
    "",
    "## Disagreements",
    "",
  ];
  for (const r of rows.filter((x) => x.argument)) {
    lines.push(`### ${r.company}: fund ${r.actual}, system says ${ACTION_WORD[r.action]}`, "", `**The fund was wrong:** ${plainArgument(r.argument!.fund_was_wrong)}`, "", `**The system was wrong:** ${plainArgument(r.argument!.system_was_wrong)}`, "");
  }
  return lines.join("\n");
}
