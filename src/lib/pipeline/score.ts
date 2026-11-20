// score step (build prompt §6.6): one model call per criterion with structured output.
// Uncited output is rejected and retried once, then the criterion is marked needs_attention (non-negotiable 1).
// Confidence is decided in code from where the cited evidence came from; missing evidence is 2/10, Low, gap named.
import { z } from "zod";
import { admin, must } from "../db/admin";
import { callModel, ModelOutputError } from "../llm/gateway";
import { render } from "../llm/prompts";
import { memoPassages, similarCorrections } from "../retrieval";
import { CRITERIA, MISSING, confidenceOf, lensFor, type Criterion } from "../scoring/rank";
import { loadContext, unknownIds, type AppContext } from "./context";
import { prompt } from "./gates";

type Ctx = { applicationId: string; traceId?: string; spanId?: string };

const Out = z.object({
  score: z.number().min(0).max(10),
  rationale: z.string().min(10),
  claims_used: z.array(z.string()).default([]),
  rules_applied: z.array(z.string()).default([]),
  precedent_memo: z.string().nullable().default(null),
  precedent_note: z.string().nullable().default(null),
  gap: z.string().nullable().default(null),
  question_for_call: z.string().nullable().default(null),
});
type Out = z.infer<typeof Out>;

/** Every sentence that states a number must carry a citation. Pure; tested. */
export function uncitedSentences(rationale: string): string[] {
  return rationale
    .split(/(?<=[.!?])\s+/)
    // cited = some [bracket] in the sentence holds at least one claim/finding ID; other tokens in it are ignored
    .filter((s) => /\d/.test(s.replace(/\[[^\]]*\]/g, "").replace(/\bR[1-9]\b|\bC[1-6]\b/g, "")) && !/\[[^\]]*\b[a-z]\d{2}\b[^\]]*\]/i.test(s));
}

/** IDs cited inline in the rationale, e.g. [f12, d07]. */
export const inlineIds = (rationale: string) => [...rationale.matchAll(/\[([^\]]+)\]/g)].flatMap((m) => m[1].split(/\s*,\s*/)).filter((x) => /^[a-z]\d{2}$/i.test(x));

export function validateScore(out: Out, ctx: Pick<AppContext, "cites">): string | null {
  const ids = [...new Set([...out.claims_used, ...inlineIds(out.rationale)])];
  const bad = unknownIds(ids, ctx.cites as AppContext["cites"]);
  if (bad.length) return `unknown claim/finding IDs: ${bad.join(", ")}. Use only IDs from the lists.`;
  if (!out.claims_used.length && !out.gap) return "no claims cited and no gap named: cite evidence, or set score 2 and name the gap";
  const unc = uncitedSentences(out.rationale);
  if (unc.length) return `these sentences state facts without an ID in [brackets]: ${unc.slice(0, 2).map((s) => `"${s}"`).join("; ")}`;
  if (out.rules_applied.some((r) => !/^R[1-9]$/.test(r))) return "rules_applied must be IDs R1-R9";
  return null;
}

export async function runScore(o: Ctx & { sector: string; gates: Record<string, boolean> }) {
  const db = admin();
  const ctx = await loadContext(o.applicationId);
  const rv = must(await db.from("rubric_versions").select("id, config").eq("is_active", true).single(), "rubric");
  const tv = must(await db.from("thesis_versions").select("revealed").eq("is_active", true).single(), "thesis");
  const rubric = rv.config;
  const memos = must(await db.from("memos").select("id, company"), "memos");
  const tpl = await prompt("score_criterion", 2);
  const lensKey = lensFor(o.sector, rubric.sector_lens_map);
  const lens = lensKey ? rubric.lenses[lensKey] : null;
  const rulesText = (tv.revealed.rules as { id: string; text: string; evidence: string[] }[]).map((r) => `${r.id}: ${r.text} (${r.evidence.join("; ")})`).join("\n");
  const gatesText = Object.entries(o.gates).filter(([, v]) => v).map(([k]) => k).join(", ") || "none tripped";
  const memoByName = (n: string | null) => (n ? memos.find((m) => m.company.toLowerCase().includes(n.toLowerCase()) || n.toLowerCase().includes(m.company.toLowerCase())) : undefined);

  const one = async (c: Criterion) => {
    const def = rubric.criteria[c];
    const query = `${def.name}: ${def.covers} ${ctx.app.one_liner ?? ""}`;
    const passages = await memoPassages(query, 4, o.applicationId);
    const corrections = await similarCorrections(`${c} ${def.name} ${o.sector} ${ctx.app.one_liner ?? ""}`, 3, o.applicationId);
    const user = render(tpl.user, {
      criterion: c,
      name: def.name,
      covers: def.covers,
      lens: lens && lens.boost.includes(c) ? `${lensKey}: "${lens.question}" (this criterion is weighted up)` : lensKey ? `${lensKey} (not this criterion)` : "none",
      anchors: Object.entries(def.anchors).map(([k, v]) => `${k}: ${v}`).join("\n"),
      rules: rulesText,
      one_liner: ctx.app.one_liner ?? "",
      sector: o.sector,
      gates: gatesText,
      claims: ctx.claimsText,
      flags: ctx.flagsText,
      research: ctx.researchSummary,
      findings: ctx.findingsText,
      memos: passages.map((p) => `- (p${p.page_no}) ${p.text}`).join("\n"),
      corrections: corrections.length ? corrections.map((x) => `- ${x.criterion} ${x.old_score}→${x.new_score}: ${x.reason}`).join("\n") : "none yet",
    });
    let out: Out | null = null;
    let error: string | null = null;
    let callId: string | null = null;
    try {
      const r = await callModel({
        step: "score",
        criterion: c,
        applicationId: o.applicationId,
        prompt: { name: tpl.name, version: tpl.version, versionId: tpl.versionId, system: tpl.system, user },
        schema: Out,
        founders: ctx.refs,
        traceId: o.traceId,
        spanId: o.spanId,
        validate: (x) => validateScore(x, ctx),
      });
      out = r.data;
      callId = r.callId;
    } catch (e) {
      if (!(e instanceof ModelOutputError)) throw e;
      error = e.message;
    }
    if (!out) {
      return {
        application_id: o.applicationId, criterion: c, score: MISSING.score, confidence: "low", status: "needs_attention",
        status_reason: `Model output failed validation twice: ${error}`.slice(0, 500),
        rationale: "Not scored: the model's output could not be validated against the evidence. Floor score applied until reviewed.",
        gap: "Scoring failed validation", claims_used: [], claim_keys: [], rules_applied: [], rubric_version_id: rv.id, prompt_version_id: tpl.versionId,
      };
    }
    const keys = [...new Set([...out.claims_used, ...inlineIds(out.rationale)])].filter((k) => ctx.cites.has(k));
    const used = keys.map((k) => ctx.cites.get(k)!);
    const missing = used.length === 0;
    const memo = memoByName(out.precedent_memo);
    return {
      application_id: o.applicationId,
      criterion: c,
      score: missing ? MISSING.score : Math.round(out.score * 10) / 10,
      confidence: missing ? MISSING.confidence : confidenceOf(used.map((u) => ({ origin: u.origin, contested: u.contested }))),
      rationale: out.rationale,
      claims_used: used.map((u) => u.uuid),
      claim_keys: keys,
      rules_applied: [...new Set(out.rules_applied)],
      precedent_memo_id: memo?.id ?? null,
      precedent_note: memo ? out.precedent_note : null,
      gap: missing ? out.gap ?? "No evidence for this criterion in the deck, form or research." : out.gap,
      question_for_call: out.question_for_call,
      status: "ok",
      rubric_version_id: rv.id,
      prompt_version_id: tpl.versionId,
      llm_call_id: callId,
    };
  };

  // 3 at a time: fast, and well inside provider rate limits
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < CRITERIA.length; i += 3) rows.push(...(await Promise.all(CRITERIA.slice(i, i + 3).map(one))));

  // overrides by Riya or Kushal stay current; machine scores are replaced
  const overridden = new Set(
    must(await db.from("criterion_scores").select("criterion").eq("application_id", o.applicationId).eq("is_current", true).eq("is_override", true), "overrides").map((r) => r.criterion),
  );
  must(await db.from("criterion_scores").update({ is_current: false }).eq("application_id", o.applicationId).eq("is_current", true).eq("is_override", false), "retire scores");
  must(await db.from("criterion_scores").insert(rows.map((r) => ({ ...r, is_current: !overridden.has(r.criterion as string) }))), "insert scores");
  return { scored: rows.length, attention: rows.filter((r) => r.status === "needs_attention").map((r) => `${r.criterion}: ${r.status_reason}`) };
}
