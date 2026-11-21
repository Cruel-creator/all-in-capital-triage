// Server-only loader for the application detail page. Founder names only; contact details stay in the database.
import { admin, must } from "../db/admin";

export type ClaimLite = { id: string; key: string; text: string; quote: string; page_no: number; origin: "deck" | "form" | "research"; metric: string; raw_value: string | null };
export type FindingLite = {
  id: string; key: string; url: string; title: string | null; publisher: string | null; published_at: string | null; retrieved_at: string;
  quote: string; extracted_claim: string | null; source_type: string; is_match: boolean; mismatch_reason: string | null; parent_finding_id: string | null; corroborated_by: string[];
};

export async function loadDetail(id: string) {
  const db = admin();
  const app = (await db.from("applications").select("id, company_name, one_liner, sector_label, sector_inferred, sector_reason, sector_label_matches, stage_label, source, intro_by, received_at, status, status_reason, current_step").eq("id", id).maybeSingle()).data;
  if (!app) return null;
  const [founders, scores, rec, gates, crits, claims, flags, queries, findings, memos, decisions, jobs] = await Promise.all([
    db.from("founders").select("id, position, full_name, role_title").eq("application_id", id).order("position"),
    db.from("scores").select("*").eq("application_id", id),
    db.from("recommendations").select("*").eq("application_id", id).maybeSingle(),
    db.from("gates").select("gate, tripped, reasons").eq("application_id", id).order("gate"),
    db.from("criterion_scores").select("*").eq("application_id", id).eq("is_current", true).order("criterion"),
    db.from("claims").select("id, claim_key, text, quote, page_no, origin, metric, raw_value").eq("application_id", id).order("claim_key"),
    db.from("reconciliation_flags").select("id, check, metric, severity, formula, explanation, claim_ids, stated_label").eq("application_id", id),
    db.from("research_queries").select("id, purpose, query, engine, result_count, error, founder_id, ran_at").eq("application_id", id).order("ran_at"),
    db.from("research_findings").select("*").eq("application_id", id).order("retrieved_at").order("id"), // same order as the scorer
    db.from("memos").select("id, company, outcome"),
    db.from("decisions").select("decision, note, created_at, decided_by_email").eq("application_id", id).order("created_at", { ascending: false }),
    db.from("jobs").select("step, status, last_error, langfuse_trace_id, finished_at").eq("application_id", id).order("created_at", { ascending: false }).limit(8),
  ]);
  const draftRow = (await db.from("email_drafts").select("id, template, status, current_version_id").eq("application_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle()).data;
  const versions = draftRow
    ? must(await db.from("email_versions").select("id, n, subject, body, origin, redo_chip, redo_note, created_at").eq("draft_id", draftRow.id).order("n"), "versions")
    : [];
  const [threads, timeline, meetings, firstFounder] = await Promise.all([
    db.from("threads").select("id, state, founder_email, follow_up_due_at, followed_up_at, pending_action, pending_payload, context, created_at").eq("application_id", id).order("created_at", { ascending: false }),
    db.from("timeline_events").select("id, kind, payload, created_at").eq("application_id", id).order("created_at", { ascending: false }).limit(50),
    db.from("meetings_booked").select("start_at, end_at, includes_aditya").eq("application_id", id).order("start_at"),
    // shown only to prefill the composer's "To" field; never part of any model input
    db.from("founders").select("email").eq("application_id", id).order("position").limit(1).maybeSingle(),
  ]);
  const findingRows = must(findings, "findings");
  const matched = findingRows.filter((f) => f.is_match);
  const claimList: ClaimLite[] = [
    ...must(claims, "claims").map((c) => ({ id: c.id, key: c.claim_key, text: c.text, quote: c.quote, page_no: c.page_no, origin: c.origin, metric: c.metric, raw_value: c.raw_value })),
    // research findings are citable as r01, r02… in the same order the scorer saw them
    ...matched.map((f, i) => ({ id: f.id, key: `r${String(i + 1).padStart(2, "0")}`, text: f.extracted_claim ?? "", quote: f.quote, page_no: 0, origin: "research" as const, metric: "research", raw_value: null })),
  ];
  return {
    app,
    founders: must(founders, "founders"),
    scores: must(scores, "scores"),
    rec: rec.data,
    gates: must(gates, "gates"),
    crits: must(crits, "criteria"),
    claims: claimList,
    flags: must(flags, "flags"),
    queries: must(queries, "queries"),
    findings: findingRows.map((f) => ({ ...f, key: f.is_match ? `r${String(matched.indexOf(f) + 1).padStart(2, "0")}` : "" })) as FindingLite[],
    memos: must(memos, "memos"),
    decisions: must(decisions, "decisions"),
    draft: draftRow ? { ...draftRow, versions } : null,
    jobs: must(jobs, "jobs"),
    threads: must(threads, "threads"),
    timeline: must(timeline, "timeline"),
    meetings: must(meetings, "meetings"),
    founderEmail: (firstFounder.data?.email as string | null) ?? null,
  };
}
export type Detail = NonNullable<Awaited<ReturnType<typeof loadDetail>>>;

/** What the source drawer shows for one claim or finding. */
export async function loadSource(kind: "claim" | "finding", id: string) {
  const db = admin();
  if (kind === "claim") {
    const c = (await db.from("claims").select("id, claim_key, quote, page_no, origin, source_doc_id, text").eq("id", id).maybeSingle()).data;
    if (!c) return null;
    const doc = must(await db.from("documents").select("file_name, kind, storage_path, page_count").eq("id", c.source_doc_id).single(), "document");
    const page = must(await db.from("pages").select("text").eq("document_id", c.source_doc_id).eq("page_no", c.page_no).single(), "page");
    const signed = (await db.storage.from("documents").createSignedUrl(doc.storage_path, 600)).data?.signedUrl ?? null;
    return { kind: "page" as const, key: c.claim_key, quote: c.quote, text: c.text, page_no: c.page_no, page_count: doc.page_count, file_name: doc.file_name, doc_kind: doc.kind, page_text: page.text, pdf_url: signed ? `${signed}#page=${c.page_no}` : null };
  }
  const f = (await db.from("research_findings").select("*").eq("id", id).maybeSingle()).data;
  if (!f) return null;
  const chain: { url: string; publisher: string | null; quote: string; published_at: string | null }[] = [];
  let parent = f.parent_finding_id;
  while (parent) {
    const p = (await db.from("research_findings").select("url, publisher, quote, published_at, parent_finding_id").eq("id", parent).maybeSingle()).data;
    if (!p) break;
    chain.push({ url: p.url, publisher: p.publisher, quote: p.quote, published_at: p.published_at });
    parent = p.parent_finding_id;
  }
  const child = (await db.from("research_findings").select("url, publisher, quote, published_at").eq("parent_finding_id", id).maybeSingle()).data;
  return { kind: "web" as const, ...f, cites: child, cited_by: chain };
}
