// research step (build prompt §6.4): Firecrawl search → selective scrape → one small extraction call per page.
// Founder names go to the search engine (that is the search) but never to the model: excerpts are redacted to [F1].
// Every query is logged, including empty ones and the reason a source was not fetched.
import { Firecrawl } from "firecrawl";
import { z } from "zod";
import { admin, must } from "../db/admin";
import { callModel, QueuePausedError } from "../llm/gateway";
import { loadPrompt, render } from "../llm/prompts";
import { redact, unredact } from "../llm/pii";
import { parseForm } from "../seed/parse-form";
import { founderRefs } from "./extract-claims";
import { verifyQuote } from "./verify-quote";
import { founderPageMatches, hostOf, isPlaceholder, isSafeUrl, isSocial, sourceType, windowAround } from "../research/sources";
import { NO_COMPETITORS, planQueries, type QueryPlan } from "../research/queries";

const MAX_SCRAPES = 6;
const RESULTS_PER_QUERY = 5;

const Extract = z.object({
  is_match: z.boolean(),
  mismatch_reason: z.string().nullable().default(null),
  extracted_claim: z.string().nullable().default(null),
  quote: z.string().nullable().default(null),
  published_at: z.string().nullable().default(null),
  cites_url: z.string().nullable().default(null),
});

type Ctx = { applicationId: string; traceId?: string; spanId?: string };
const words = (s: string, n: number) => s.trim().split(/\s+/).slice(0, n).join(" ");
const isoDate = (s?: string | null) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

export async function runResearch(o: Ctx) {
  const db = admin();
  const app = must(await db.from("applications").select("id, company_name, one_liner").eq("id", o.applicationId).single(), "application");
  const docs = must(await db.from("documents").select("id, kind").eq("application_id", o.applicationId), "documents");
  const formDoc = docs.find((d) => d.kind === "form");
  const formPages = formDoc ? must(await db.from("pages").select("page_no, text").eq("document_id", formDoc.id).order("page_no"), "form pages") : [];
  const form = parseForm(formPages as { page_no: number; text: string }[]);
  const founders = must(await db.from("founders").select("id, position, full_name, role_title").eq("application_id", o.applicationId).order("position"), "founders");
  const refs = await founderRefs(o.applicationId);
  const competitionClaims = must(await db.from("claims").select("quote").eq("application_id", o.applicationId).ilike("metric", "text.competition%"), "claims");
  const allText = [...competitionClaims.map((c) => c.quote), ...formPages.map((p) => p.text)].join(" ");

  // re-running research replaces the previous run for this application
  must(await db.from("research_queries").delete().eq("application_id", o.applicationId), "clear research");

  const logQuery = async (q: Omit<QueryPlan, "needles">, result_count: number, error: string | null, engine = "firecrawl") =>
    must(
      await db
        .from("research_queries")
        .insert({ application_id: o.applicationId, founder_id: q.founder_id, purpose: q.purpose, query: q.query, engine, result_count, error })
        .select("id")
        .single(),
      "research_queries",
    ).id as string;

  // the applicant's website: seed data uses reserved .example domains, which are never fetched
  const website = form.fields["Website"]?.value ?? null;
  if (website && isPlaceholder(website))
    await logQuery({ purpose: "website", query: website, founder_id: null }, 0, "placeholder domain (.example): not a real site, not fetched", "direct");

  const plans = planQueries({
    company: app.company_name,
    legal_name: form.legal_name,
    location: form.location,
    one_liner: app.one_liner,
    founders: founders.map((f) => ({ id: f.id, full_name: f.full_name, role_title: f.role_title, background: form.founders.find((p) => p.position === f.position)?.background ?? "" })),
    claims_no_competitors: NO_COMPETITORS.test(allText),
  });

  if (!process.env.FIRECRAWL_API_KEY) {
    for (const p of plans) await logQuery(p, 0, "research not configured: FIRECRAWL_API_KEY is missing", "none");
    return { configured: false, queries: plans.length, results: 0, findings: 0, matched: 0 };
  }
  const fc = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
  const tpl = loadPrompt("research_extract", 1);
  const pv = must(await db.from("prompt_versions").select("id").eq("name", tpl.name).eq("version", tpl.version).single(), "prompt_versions");

  let results = 0;
  let scrapes = 0;
  const seen = new Set<string>();
  const matched: { id: string; host: string; key: string }[] = [];
  let findings = 0;

  const extractAndStore = async (p: QueryPlan, queryId: string, url: string, parentId: string | null): Promise<string | null> => {
    if (seen.has(url) || scrapes >= MAX_SCRAPES || !isSafeUrl(url) || isPlaceholder(hostOf(url)) || isSocial(url)) return null;
    seen.add(url);
    scrapes++;
    let doc;
    try {
      doc = await fc.scrape(url, { formats: ["markdown", "links"], onlyMainContent: true, timeout: 30000 });
    } catch (e) {
      await db.from("research_queries").update({ error: `scrape failed for ${url}: ${(e as Error).message.slice(0, 200)}` }).eq("id", queryId);
      return null;
    }
    const md = doc.markdown ?? "";
    if (!md.trim()) return null;
    const excerpt = redact(windowAround(md, p.needles.length ? p.needles : [app.company_name]), refs);
    // personal profiles and contact links never reach the model (non-negotiable 5)
    const links = (doc.links ?? [])
      .filter((l: string) => !isPlaceholder(hostOf(l)) && !/linkedin\.com\/in\/|^mailto:|^tel:|wa\.me\//i.test(l))
      .slice(0, 40);
    const title = doc.metadata?.title ?? "";
    const publisher = doc.metadata?.ogSiteName ?? hostOf(url);
    const subject = p.founder_id ? refs.find((r) => r.id === p.founder_id)?.token ?? "[F?]" : `the company (${app.one_liner ?? ""})`;
    // the whole prompt is redacted, not only the excerpt: titles, URLs and links can carry names and profiles
    const user = redact(
      render(tpl.user, { purpose: p.purpose, application: app.one_liner ?? "", subject, title, publisher, url, links: links.join(" ") || "none", excerpt }),
      refs,
    );
    let data: z.infer<typeof Extract>;
    try {
      ({ data } = await callModel({
        step: "research",
        applicationId: o.applicationId,
        prompt: { name: tpl.name, version: tpl.version, versionId: pv.id, system: tpl.system, user },
        schema: Extract,
        founders: refs,
        traceId: o.traceId,
        spanId: o.spanId,
        validate: (out) => (out.is_match && (!out.quote || !verifyQuote(excerpt, out.quote).ok) ? "quote is missing or not found verbatim in the excerpt" : null),
      }));
    } catch (e) {
      // one bad page must not sink the application: log it against the query and move on
      if (e instanceof QueuePausedError) throw e; // the daily cost limit stops the run, it is not a bad page
      await db.from("research_queries").update({ error: `page skipped (${url}): ${(e as Error).message.slice(0, 200)}` }).eq("id", queryId);
      return null;
    }
    // hard rule in code: a founder page must also name the applicant's company, whatever the model concluded
    if (p.founder_id && data.is_match && !founderPageMatches(md, app.company_name)) {
      data = { ...data, is_match: false, mismatch_reason: `Same name, but the page never mentions ${app.company_name}; not treated as this founder.` };
    }
    // set-aside founder pages describe someone who never applied: keep only URL, title and a generic reason
    if (p.founder_id && !data.is_match) {
      data = { ...data, extracted_claim: null, mismatch_reason: "Same name, different person: the page does not match this founder's company or role." };
    }
    const quote = data.is_match && data.quote ? unredact(data.quote, refs) : words(doc.metadata?.title ?? publisher, 20) || publisher;
    const row = must(
      await db
        .from("research_findings")
        .insert({
          query_id: queryId,
          application_id: o.applicationId,
          url,
          title: doc.metadata?.title ?? null,
          publisher,
          published_at: isoDate(doc.metadata?.publishedTime) ?? isoDate(data.published_at),
          quote,
          source_type: sourceType(url),
          cites_url: data.cites_url,
          parent_finding_id: parentId,
          extracted_claim: data.extracted_claim ? unredact(data.extracted_claim, refs) : null,
          is_match: data.is_match,
          mismatch_reason: data.is_match ? null : data.mismatch_reason ?? "not about this company or person",
        })
        .select("id")
        .single(),
      "research_findings",
    );
    findings++;
    if (data.is_match) matched.push({ id: row.id, host: hostOf(url), key: `${p.purpose.startsWith("competitors") ? "competitors" : p.founder_id ?? "company"}` });
    // trace one hop: the article attributes its fact to another publication on its own link list
    if (data.is_match && data.cites_url && !parentId && links.includes(data.cites_url)) await extractAndStore(p, queryId, data.cites_url, row.id);
    return row.id;
  };

  for (const p of plans) {
    let web: { url: string; title?: string; description?: string }[] = [];
    let error: string | null = null;
    try {
      const r = await fc.search(p.query, { limit: RESULTS_PER_QUERY, sources: ["web"] });
      web = ((r.web ?? []) as { url?: string; title?: string; description?: string }[]).filter((x): x is { url: string } => !!x.url);
    } catch (e) {
      error = `search failed: ${(e as Error).message.slice(0, 200)}`;
    }
    results += web.length;
    const queryId = await logQuery(p, web.length, error);
    // scrape only results that mention the subject (or the top 3 for competitor searches)
    const relevant = p.needles.length
      ? web.filter((w) => p.needles.some((n) => `${w.title ?? ""} ${w.description ?? ""} ${w.url}`.toLowerCase().includes(n.toLowerCase())))
      : web.slice(0, 3);
    for (const w of relevant.slice(0, 2)) await extractAndStore(p, queryId, w.url, null);
  }

  // corroboration: matched findings about the same subject from different hosts
  for (const m of matched) {
    const others = matched.filter((x) => x.key === m.key && x.host !== m.host).map((x) => x.id);
    if (others.length) await db.from("research_findings").update({ corroborated_by: others }).eq("id", m.id);
  }
  return { configured: true, queries: plans.length, results, findings, matched: matched.length };
}
