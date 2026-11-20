// reconcile step: no model. Loads the application's claims, runs the deterministic checks, writes flags.
import { admin, must } from "../db/admin";
import { reconcile, isTarget } from "../reconcile/reconcile";
import { credentialCheck } from "../reconcile/credentials";
import type { ReconClaim, ReconFlag } from "../reconcile/types";

/** Finds "(have) not (yet) measured <thing>" sentences. Pure; tested. */
export function notMeasured(pages: { page_no: number; text: string }[]) {
  const out: { metric: string; what: string; quote: string; page_no: number }[] = [];
  for (const p of pages) {
    const flat = p.text.replace(/\s+/g, " ");
    for (const m of flat.matchAll(/[^.]*\b(?:have not|haven't|not yet|never)\s+(?:yet\s+)?(?:measured|tracked)\s+([^.]+?)(?:\s+yet)?\./gi)) {
      const what = m[1].trim();
      const metric = /acquisition|cac|cost per/i.test(what) ? (/paying/i.test(what) ? "cac.per_paying_user" : "cac.blended") : /repeat|retention/i.test(what) ? "repeat" : "unmeasured";
      out.push({ metric, what, quote: m[0].trim().split(/\s+/).slice(-25).join(" "), page_no: p.page_no });
    }
  }
  return out;
}

/** Top-down market sizing read from page text ("Even 1% of this market…", "Capturing just 1%…"). Pure; tested. */
export function topDownPages(pages: { page_no: number; text: string }[]) {
  const re = /[^.]*(?:\b\d+(?:\.\d+)?\s*%\s+of\s+(?:this|the|that)\s+(?:market|opportunity)|\bcaptur\w*\s+(?:just\s+|only\s+)?\d+(?:\.\d+)?\s*%)[^.]*\./i;
  for (const p of pages) {
    const m = p.text.replace(/\s+/g, " ").match(re);
    if (m) return { page_no: p.page_no, quote: m[0].trim().split(/\s+/).slice(0, 25).join(" ") };
  }
  return null;
}

/**
 * Market-size lines print their whole formula ("TAM INR 17 lakh Cr 12M kirana stores x INR 1.2 L monthly purchases x 12").
 * If extraction dropped a plain multiplier ("x 12"), add it back from the page, cited to the stated claim.
 * Without this, a model omission shows up as a false red against the founder. Pure; tested.
 */
export function missingMultipliers(statedQuote: string, pageText: string, factorValues: number[]): number[] {
  const flat = pageText.replace(/\s+/g, " ");
  const start = flat.indexOf(statedQuote.replace(/\s+/g, " ").trim());
  if (start < 0) return [];
  const rest = flat.slice(start + 3);
  // stop at the next line item ("SAM INR …"), not at a mention inside this one ("2% of SAM stores")
  const next = rest.search(/\b(TAM|SAM|SOM)\s+(?:INR|₹)/);
  const segment = flat.slice(start, start + 3 + (next < 0 ? Math.min(rest.length, 300) : next));
  const out: number[] = [];
  for (const m of segment.matchAll(/\s[x×]\s*(\d+(?:\.\d+)?)(?![\d.,]*\s*(?:%|M\b|K\b|L\b|Cr\b|lakh|crore|thousand|million))/gi)) {
    const v = Number(m[1]);
    if (!factorValues.includes(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

export async function runReconcile(applicationId: string) {
  const db = admin();
  const rows = must(await db.from("claims").select("*").eq("application_id", applicationId), "claims");
  const claims: ReconClaim[] = rows
    .filter((r) => !String(r.metric).startsWith("text."))
    .map((r) => ({
      id: r.id,
      // targets ("In 12 months: …") are renamed so they are never compared with actuals
      metric: isTarget(r.quote) && !String(r.metric).startsWith("market.") ? `${r.metric}.target` : r.metric,
      role: r.role,
      value: r.value === null ? null : Number(r.value),
      unit: r.unit,
      origin: r.origin,
      bound: r.bound,
      qualifier: r.qualifier ?? undefined,
      status: r.status ?? undefined,
      text: `${r.quote} ${r.text}`,
    }));

  const docs = must(await db.from("documents").select("id, kind").eq("application_id", applicationId), "documents");
  const pages = must(
    await db.from("pages").select("document_id, page_no, text").in("document_id", docs.map((d) => d.id)),
    "pages",
  );
  const pageOf = (docId: string, n: number) => pages.find((p) => p.document_id === docId && p.page_no === n)?.text ?? "";

  // restore plain multipliers the model dropped from market-size formulas
  for (const s of rows.filter((r) => String(r.metric).startsWith("market.") && r.role === "stated")) {
    const factors = claims.filter((c) => c.metric === s.metric && c.role === "factor" && c.origin === s.origin).map((c) => c.value as number);
    if (!factors.length) continue;
    for (const v of missingMultipliers(s.quote, pageOf(s.source_doc_id, s.page_no), factors))
      claims.push({ id: s.id, metric: s.metric, role: "factor", value: v, unit: "x", origin: s.origin, text: `from page formula: x ${v}` });
  }
  const { flags, derived } = reconcile(claims);
  const td = topDownPages(pages);
  if (td && !flags.some((f) => /Top-down/.test(f.explanation)))
    flags.push({
      check: "tam",
      metric: "market.tam",
      stated: null,
      stated_label: null,
      computed: null,
      delta_pct: null,
      severity: "info",
      formula: `p${td.page_no}: "${td.quote}"`,
      explanation: "Top-down sizing: a percentage of a whole market. There is no bottom-up count of customers × price to check it against.",
      claim_ids: [],
    });
  for (const g of notMeasured(pages)) {
    if (flags.some((f) => f.stated_label === "not measured" && f.metric === g.metric)) continue;
    flags.push({
      check: g.metric.startsWith("cac") ? "blended_cac" : "unit_count",
      metric: g.metric,
      stated: null,
      stated_label: "not measured",
      computed: null,
      delta_pct: null,
      severity: "warn",
      formula: `p${g.page_no}: "${g.quote}"`,
      explanation: `The founder says ${g.what} has not been measured. A missing number lowers the score (R4).`,
      claim_ids: [],
    });
  }

  // credentials: deck line vs form line, per founder token
  const creds = rows.filter((r) => r.metric === "text.credentials");
  const byFounder = new Map<string, { deck?: (typeof rows)[number]; form?: (typeof rows)[number] }>();
  for (const c of creds) {
    const k = c.qualifier ?? "F1";
    const e = byFounder.get(k) ?? {};
    e[c.origin as "deck" | "form"] = c;
    byFounder.set(k, e);
  }
  // compare the deck's credential line with the WHOLE form, not one extracted line (founder names, full background)
  const formDoc = docs.find((d) => d.kind === "form");
  const allForm = pages.filter((p) => p.document_id === formDoc?.id).map((p) => p.text).join("\n");
  for (const { deck, form } of byFounder.values()) {
    if (!deck) continue;
    const f = credentialCheck({ id: deck.id, text: deck.quote }, { id: form?.id ?? deck.id, text: allForm });
    if (f) flags.push({ ...f, claim_ids: [deck.id, ...(form ? [form.id] : [])] } as ReconFlag);
  }

  must(await db.from("reconciliation_flags").delete().eq("application_id", applicationId), "clear flags");
  if (flags.length)
    must(
      await db.from("reconciliation_flags").insert(
        flags.map((f) => ({
          application_id: applicationId,
          check: f.check,
          metric: f.metric,
          stated_value: f.stated,
          stated_label: f.stated_label,
          computed_value: Number.isFinite(f.computed ?? NaN) ? f.computed : null,
          delta_pct: Number.isFinite(f.delta_pct ?? NaN) ? f.delta_pct : null,
          severity: f.severity,
          formula: f.formula,
          explanation: f.explanation,
          claim_ids: f.claim_ids,
        })),
      ),
      "insert flags",
    );
  return { flags, derived };
}
