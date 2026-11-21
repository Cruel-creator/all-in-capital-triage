// What a gate or scoring call may see about one application: claims, flags and research findings, each with a
// short ID the model must cite. Founder names are redacted to [F1]; contact details never leave the founders table.
import { admin, must } from "../db/admin";
import { redact, type FounderRef } from "../llm/pii";
import { founderRefs } from "./extract-claims";

export type Cite = { id: string; uuid: string; kind: "claim" | "finding"; origin: "deck" | "form" | "research"; metric: string; contested: boolean };

export type AppContext = {
  app: { id: string; company_name: string; one_liner: string | null; sector_label: string | null; stage_label: string | null; source: string };
  refs: FounderRef[];
  cites: Map<string, Cite>;
  claimsText: string;
  flagsText: string;
  findingsText: string;
  researchSummary: string;
  flags: { check: string; metric: string; severity: string; formula: string; explanation: string; claim_ids: string[] }[];
  claims: { id: string; claim_key: string; metric: string; origin: string; quote: string; raw_value: string | null; page_no: number; source_doc_id: string }[];
};

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

export async function loadContext(applicationId: string): Promise<AppContext> {
  const db = admin();
  const app = must(
    await db.from("applications").select("id, company_name, one_liner, sector_label, stage_label, source").eq("id", applicationId).single(),
    "application",
  );
  const refs = await founderRefs(applicationId);
  const claims = must(
    await db.from("claims").select("id, claim_key, metric, origin, quote, raw_value, page_no, source_doc_id, unit, qualifier").eq("application_id", applicationId).order("claim_key"),
    "claims",
  );
  const flags = must(
    await db.from("reconciliation_flags").select("check, metric, severity, formula, explanation, claim_ids").eq("application_id", applicationId),
    "flags",
  );
  const findings = must(
    await db.from("research_findings").select("id, url, publisher, published_at, quote, extracted_claim, source_type, is_match").eq("application_id", applicationId).eq("is_match", true).order("retrieved_at").order("id"), // same order as the UI: r01, r02…
    "findings",
  );
  const queries = must(await db.from("research_queries").select("purpose, query, result_count, error").eq("application_id", applicationId), "queries");

  // a claim is contested if a warn/red reconciliation flag cites it
  const contested = new Set(flags.filter((f) => f.severity !== "info").flatMap((f) => f.claim_ids as string[]));
  const cites = new Map<string, Cite>();
  for (const c of claims)
    cites.set(c.claim_key, { id: c.claim_key, uuid: c.id, kind: "claim", origin: c.origin, metric: c.metric, contested: contested.has(c.id) });
  findings.forEach((f, i) => cites.set(`r${String(i + 1).padStart(2, "0")}`, { id: `r${String(i + 1).padStart(2, "0")}`, uuid: f.id, kind: "finding", origin: "research", metric: "research", contested: false }));

  const claimsText = claims
    .map((c) => `[${c.claim_key}] ${c.origin} p${c.page_no} ${c.metric}${c.qualifier ? `(${c.qualifier})` : ""}${c.raw_value ? ` = ${c.raw_value}` : ""}: "${redact(oneLine(c.quote), refs)}"`)
    .join("\n");
  const keyOf = new Map(claims.map((c) => [c.id, c.claim_key]));
  const flagsText = flags.length
    ? flags.map((f) => `- ${f.severity.toUpperCase()} ${f.check}/${f.metric}: ${f.formula}. ${f.explanation} (claims: ${(f.claim_ids as string[]).map((u) => keyOf.get(u)).filter(Boolean).join(", ") || "page text"})`).join("\n")
    : "none";
  const findingsText = findings.length
    ? findings.map((f, i) => `[r${String(i + 1).padStart(2, "0")}] ${f.source_type} ${f.publisher ?? ""} ${f.published_at ?? ""}: ${redact(f.extracted_claim ?? "", refs)} "${redact(f.quote, refs)}"`).join("\n")
    : "none";
  const searched = queries.filter((q) => !q.error || q.result_count > 0).length;
  const notConfigured = queries.some((q) => /not configured/.test(q.error ?? ""));
  const researchSummary = notConfigured
    ? "Web research has not run yet (not configured). Treat external verification as unavailable, not as absent."
    : `Web research ran ${queries.length} queries (${searched} completed), ${findings.length} matching finding(s). Placeholder (.example) websites were not fetched.`;

  // redact whole blocks, not just quotes: flag formulas and research text can carry founder names
  // (e.g. the credential check's "deck names: <founder>, Goldman Sachs…"); the gateway refuses PII anyway
  return {
    app, refs, cites,
    claimsText: redact(claimsText, refs),
    flagsText: redact(flagsText, refs),
    findingsText: redact(findingsText, refs),
    researchSummary, flags, claims,
  };
}

/** Validates model-cited IDs: every cited ID must exist for this application. Returns unknown IDs. */
export function unknownIds(ids: string[], cites: Map<string, Cite>) {
  return ids.filter((i) => !cites.has(i));
}
