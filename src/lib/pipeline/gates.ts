// gates step (build prompt §5a): G1-G4, each with cited reasons. A tripped gate routes to Kushal; nothing is auto-rejected.
// G1 and the numeric half of G4 are deterministic. G2, G3 and the wording half of G4 are one model call each, and every
// reason must cite claim IDs that exist for this application.
import { z } from "zod";
import { admin, must } from "../db/admin";
import { callModel, ModelOutputError } from "../llm/gateway";
import { loadPrompt, render } from "../llm/prompts";
import { parseForm } from "../seed/parse-form";
import { memoPassages, portfolioMatches } from "../retrieval";
import { loadContext, unknownIds, type AppContext } from "./context";

type Ctx = { applicationId: string; traceId?: string; spanId?: string };
export type GateReason = { text: string; claim_ids: string[]; claim_keys: string[]; source?: { document_id: string; page_no: number; quote: string } };
type GateResult = { tripped: boolean; reasons: GateReason[]; status?: "needs_attention"; error?: string };

export async function prompt(name: string, version = 1) {
  const tpl = loadPrompt(name, version);
  const pv = must(await admin().from("prompt_versions").select("id").eq("name", name).eq("version", version).single(), `prompt ${name}@v${version}`);
  return { ...tpl, versionId: pv.id as string };
}

const toUuids = (keys: string[], ctx: AppContext) => keys.map((k) => ctx.cites.get(k)?.uuid).filter((x): x is string => !!x);
const words = (s: string, n = 25) => s.replace(/\s+/g, " ").trim().split(" ").slice(0, n).join(" ");

/** G1: stage, round size, valuation, prior institutional money. Pure on its inputs; tested. */
export function g1(
  input: { stage: string | null; raise: number | null; postMoney: number | null; existingInvestors: string | null; raiseRaw?: string | null; postMoneyRaw?: string | null },
  p: { allowed_stages: string[]; max_raise_inr: number; max_post_money_inr: number; prior_institutional_pattern: string },
): { tripped: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const stage = (input.stage ?? "").toLowerCase().replace(/[\s-]/g, "");
  if (stage && !p.allowed_stages.some((s) => stage.includes(s.replace(/[\s-]/g, "")))) reasons.push(`Stage is "${input.stage}", not pre-seed or seed.`);
  if (input.raise !== null && input.raise > p.max_raise_inr) reasons.push(`Raising ₹${(input.raise / 1e7).toLocaleString("en-IN")} Cr, above a pre-seed round.`);
  if (input.postMoney !== null && input.postMoney > p.max_post_money_inr) reasons.push(`Post-money ₹${(input.postMoney / 1e7).toLocaleString("en-IN")} Cr is above a sensible pre-seed entry.`);
  // a figure that is present but unreadable is a named gap, never a silent pass: route it to Kushal to confirm
  if (input.raise === null && input.raiseRaw?.trim()) reasons.push(`Couldn't read the raise amount ("${input.raiseRaw.trim().slice(0, 60)}"), so the round size wasn't checked. Confirm it by hand.`);
  if (input.postMoney === null && input.postMoneyRaw?.trim()) reasons.push(`Couldn't read the post-money valuation ("${input.postMoneyRaw.trim().slice(0, 60)}"), so the valuation wasn't checked. Confirm it by hand.`);
  if (input.existingInvestors && new RegExp(p.prior_institutional_pattern, "i").test(input.existingInvestors))
    reasons.push("Already has institutional investors, so this would not be the first institutional cheque.");
  return { tripped: reasons.length > 0, reasons };
}

async function modelGate<T>(
  o: Ctx,
  name: string,
  vars: Record<string, string>,
  schema: z.ZodType<T>,
  validate: (out: T) => string | null,
  ctx: AppContext,
): Promise<{ data: T } | { error: string }> {
  const p = await prompt(name, name === "gate_conflict" ? 2 : 1);
  try {
    const { data } = await callModel({
      step: `gates:${name}`,
      applicationId: o.applicationId,
      prompt: { name: p.name, version: p.version, versionId: p.versionId, system: p.system, user: render(p.user, vars) },
      schema,
      founders: ctx.refs,
      traceId: o.traceId,
      spanId: o.spanId,
      validate,
    });
    return { data };
  } catch (e) {
    if (e instanceof ModelOutputError) return { error: e.message };
    throw e;
  }
}

export async function runGates(o: Ctx) {
  const db = admin();
  const ctx = await loadContext(o.applicationId);
  const rubric = must(await db.from("rubric_versions").select("config").eq("is_active", true).single(), "rubric").config;
  const docs = must(await db.from("documents").select("id, kind").eq("application_id", o.applicationId), "documents");
  const formDoc = docs.find((d) => d.kind === "form")!;
  const formPages = must(await db.from("pages").select("page_no, text").eq("document_id", formDoc.id).order("page_no"), "form pages");
  const form = parseForm(formPages as { page_no: number; text: string }[]);
  const fieldSource = (label: string) =>
    form.fields[label] ? { document_id: formDoc.id, page_no: form.fields[label].page_no, quote: words(`${label} ${form.fields[label].value}`) } : undefined;
  const claimVal = (metric: string) =>
    ctx.claims.find((c) => c.metric === metric && c.origin === "form" && c.raw_value) ?? ctx.claims.find((c) => c.metric === metric && c.raw_value);
  const { parseAmount } = await import("../reconcile/money");
  const raiseC = claimVal("raise.amount");
  const postC = claimVal("valuation.post_money");
  const results: Record<"G1" | "G2" | "G3" | "G4", GateResult> = {} as never;

  // ---- G1: deterministic
  const r1 = g1(
    {
      stage: form.stage_label,
      raise: raiseC?.raw_value ? parseAmount(raiseC.raw_value.replace(/^.*?(?=(?:INR|₹)?\s*\d)/i, "")) : null,
      postMoney: postC?.raw_value ? parseAmount(postC.raw_value.replace(/^.*?(?=(?:INR|₹)?\s*\d)/i, "")) : null,
      existingInvestors: form.fields["Existing investors"]?.value ?? null,
      raiseRaw: raiseC?.raw_value ?? null,
      postMoneyRaw: postC?.raw_value ?? null,
    },
    rubric.gates.G1.params,
  );
  results.G1 = {
    tripped: r1.tripped,
    reasons: r1.reasons.map((text) => {
      const c = /Raising|raise amount/.test(text) ? raiseC : /Post-money|post-money valuation/.test(text) ? postC : null;
      return c
        ? { text, claim_ids: [c.id], claim_keys: [c.claim_key] }
        : { text, claim_ids: [], claim_keys: [], source: fieldSource(/institutional/.test(text) ? "Existing investors" : "Stage (as selected)") };
    }),
  };

  // ---- G2: regulatory existence risk
  const memos = await memoPassages("business depends on a favourable regulatory change; regulatory risk; licence", 3, o.applicationId);
  const memoText = memos.map((m) => `- (p${m.page_no}) ${m.text}`).join("\n");
  const G2 = z.object({ tripped: z.boolean(), reasons: z.array(z.object({ text: z.string(), claim_ids: z.array(z.string()) })).default([]) });
  const g2 = await modelGate(o, "gate_regulatory", { one_liner: ctx.app.one_liner ?? "", claims: ctx.claimsText, memos: memoText }, G2,
    (out) => {
      const bad = unknownIds(out.reasons.flatMap((r) => r.claim_ids), ctx.cites);
      if (bad.length) return `unknown claim IDs: ${bad.join(", ")}`;
      if (out.tripped && out.reasons.some((r) => !r.claim_ids.length)) return "every reason must cite at least one claim ID";
      return null;
    }, ctx);
  results.G2 = "error" in g2
    ? { tripped: true, reasons: [], status: "needs_attention", error: g2.error }
    : { tripped: g2.data.tripped, reasons: g2.data.reasons.map((r) => ({ text: r.text, claim_ids: toUuids(r.claim_ids, ctx), claim_keys: r.claim_ids })) };

  // ---- G3: portfolio conflict, against every row
  const product = ctx.claims.filter((c) => /text\.|customers|what/.test(c.metric)).slice(0, 6).map((c) => c.quote).join(" ");
  const portfolio = await portfolioMatches(`${ctx.app.one_liner ?? ""} ${product}`.slice(0, 2000), o.applicationId);
  const names = new Set(portfolio.map((p) => p.company));
  const portfolioText = portfolio.map((p) => `- ${p.company} (similarity ${p.similarity.toFixed(2)}): ${p.one_liner}`).join("\n");
  const G3 = z.object({ overlaps: z.array(z.object({ company: z.string(), kind: z.enum(["direct", "adjacent"]), reason: z.string(), claim_ids: z.array(z.string()) })).default([]) });
  const g3 = await modelGate(o, "gate_conflict", { one_liner: ctx.app.one_liner ?? "", claims: ctx.claimsText, portfolio: portfolioText }, G3,
    (out) => {
      const badCo = out.overlaps.filter((x) => !names.has(x.company)).map((x) => x.company);
      if (badCo.length) return `not portfolio companies: ${badCo.join(", ")}`;
      const bad = unknownIds(out.overlaps.flatMap((x) => x.claim_ids), ctx.cites);
      return bad.length ? `unknown claim IDs: ${bad.join(", ")}` : null;
    }, ctx);
  results.G3 = "error" in g3
    ? { tripped: true, reasons: [], status: "needs_attention", error: g3.error }
    : {
        tripped: g3.data.overlaps.length > 0, // a false alarm is preferred over a miss (Meeting 4)
        reasons: g3.data.overlaps.map((x) => {
          const row = portfolio.find((p) => p.company === x.company)!;
          return { text: `${x.kind === "direct" ? "Direct overlap" : "Adjacent"} with ${x.company}: ${x.reason}`, claim_ids: toUuids(x.claim_ids, ctx), claim_keys: x.claim_ids, portfolio: { company: row.company, source_url: row.source_url, similarity: row.similarity } } as GateReason;
        }),
      };

  // ---- G4: integrity = red numeric/credential flags (code) + wording contradictions (model)
  const keyOf = new Map(ctx.claims.map((c) => [c.id, c.claim_key]));
  const numeric: GateReason[] = ctx.flags
    .filter((f) => f.severity === "red" && (f.check === "deck_vs_form" || f.check === "credentials"))
    .map((f) => ({ text: `${f.explanation} Ask for the underlying record.`, claim_ids: f.claim_ids, claim_keys: f.claim_ids.map((u) => keyOf.get(u)).filter((k): k is string => !!k) }));
  const G4 = z.object({ contradictions: z.array(z.object({ text: z.string(), deck_claim_id: z.string(), form_claim_id: z.string() })).default([]) });
  const g4 = await modelGate(o, "gate_integrity", { one_liner: ctx.app.one_liner ?? "", claims: ctx.claimsText, flags: ctx.flagsText }, G4,
    (out) => {
      for (const c of out.contradictions) {
        const d = ctx.cites.get(c.deck_claim_id);
        const f = ctx.cites.get(c.form_claim_id);
        if (!d || !f) return `unknown claim IDs: ${c.deck_claim_id}, ${c.form_claim_id}`;
        if (d.origin !== "deck" || f.origin !== "form") return `${c.deck_claim_id} must be a deck claim and ${c.form_claim_id} a form claim`;
      }
      return null;
    }, ctx);
  const wording: GateReason[] = "error" in g4 ? [] : g4.data.contradictions.map((c) => ({ text: c.text, claim_ids: toUuids([c.deck_claim_id, c.form_claim_id], ctx), claim_keys: [c.deck_claim_id, c.form_claim_id] }));
  results.G4 = "error" in g4 && !numeric.length
    ? { tripped: true, reasons: [], status: "needs_attention", error: g4.error }
    : { tripped: numeric.length + wording.length > 0, reasons: [...numeric, ...wording] };

  // ---- sector (classification only; the lens and written-thesis fit are decided in code by the rank step)
  const C = z.object({ sector: z.string(), label_matches: z.boolean(), reason: z.string(), claim_ids: z.array(z.string()).default([]) });
  const cls = await modelGate(o, "classify", { one_liner: ctx.app.one_liner ?? "", sector_label: ctx.app.sector_label ?? "", claims: ctx.claimsText }, C,
    (out) => {
      const ok = ["consumer brand", "consumer tech", "lending fintech", "fintech", "deeptech", "b2b saas", "healthcare", "web3", "other"];
      if (!ok.includes(out.sector.toLowerCase())) return `sector must be one of: ${ok.join(", ")}`;
      const bad = unknownIds(out.claim_ids, ctx.cites);
      return bad.length ? `unknown claim IDs: ${bad.join(", ")}` : null;
    }, ctx);
  const sector = "error" in cls ? (ctx.app.sector_label ?? "other").toLowerCase() : cls.data.sector.toLowerCase();
  const sectorReason = "error" in cls ? `classification failed (${cls.error}); using the founder's label` : cls.data.reason;
  must(
    await db
      .from("applications")
      .update({ sector_inferred: sector, sector_reason: sectorReason, sector_label_matches: "error" in cls ? null : cls.data.label_matches })
      .eq("id", o.applicationId),
    "sector",
  );

  // one transaction: the old gate rows are never gone without the new ones in place
  must(
    await db.rpc("replace_gates", { app: o.applicationId, gate_rows:
      (["G1", "G2", "G3", "G4"] as const).map((g) => ({
        application_id: o.applicationId,
        gate: g,
        tripped: results[g].tripped,
        reasons: results[g].status ? [{ text: `Needs attention: the check could not be completed (${results[g].error}). Treated as tripped so it reaches Kushal.`, claim_ids: [], claim_keys: [] }] : results[g].reasons,
      })),
    }),
    "replace gates",
  );
  return {
    gates: { G1: results.G1.tripped, G2: results.G2.tripped, G3: results.G3.tripped, G4: results.G4.tripped },
    sector,
    sectorReason,
    labelMatches: "error" in cls ? true : cls.data.label_matches,
    attention: (["G1", "G2", "G3", "G4"] as const).filter((g) => results[g].status).map((g) => `${g}: ${results[g].error}`),
  };
}
