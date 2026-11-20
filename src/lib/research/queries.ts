// Research query plan (build prompt §6.4). Pure; tested. Every query is logged, including empty ones.
export type QueryPlan = { purpose: string; query: string; founder_id: string | null; needles: string[] };

export type ResearchSubject = {
  company: string;
  legal_name: string | null;
  location: string | null;
  one_liner: string | null;
  founders: { id: string; full_name: string; role_title: string | null; background: string }[];
  claims_no_competitors: boolean;
};

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const city = (loc: string | null) => clean(loc).split(",")[0] || "India";
/** "6 years in category and brand roles at a large packaged-food company" → "packaged-food" (a searchable hint, no guessing). */
export function employerHint(background: string): string {
  const m = background.match(/\bat (?:a |an |the )?(?:large |leading |private )?([\w-]+(?: [\w-]+)?) (?:company|bank|startup|firm|maker|supplier|chain|distributor|fintech)/i);
  return m ? m[1] : "";
}
/** Words from the one-liner that describe the product (for the competitor search). */
export function productTerms(oneLiner: string | null): string {
  return clean(oneLiner).replace(/[.,;:()]/g, " ").replace(/\s+/g, " ").split(" ").slice(0, 10).join(" ");
}

export function planQueries(s: ResearchSubject): QueryPlan[] {
  const q: QueryPlan[] = [];
  const co = clean(s.company);
  q.push({ purpose: "company", query: `"${co}" startup ${city(s.location)}`, founder_id: null, needles: [co] });
  q.push({ purpose: "company_news", query: `"${co}" funding OR raises OR launch`, founder_id: null, needles: [co] });
  if (s.legal_name) q.push({ purpose: "registry", query: `"${clean(s.legal_name)}" CIN`, founder_id: null, needles: [clean(s.legal_name), co] });
  for (const f of s.founders) {
    const name = clean(f.full_name).replace(/^Dr\.?\s*/i, "");
    q.push({ purpose: "founder_company", query: `"${name}" "${co}"`, founder_id: f.id, needles: [name, co] });
    const hint = employerHint(f.background);
    q.push({ purpose: "founder_history", query: `"${name}" ${clean(f.role_title) || "founder"} ${hint}`.trim(), founder_id: f.id, needles: [name] });
    q.push({ purpose: "founder_talks", query: `"${name}" podcast OR interview OR talk`, founder_id: f.id, needles: [name] });
  }
  // competitors: always useful for C6; essential when the founder claims there are none (RentRoute, Talkbook)
  q.push({ purpose: s.claims_no_competitors ? "competitors_claim_check" : "competitors", query: `${productTerms(s.one_liner)} India startup`, founder_id: null, needles: [] });
  return q;
}

/** Does the application claim it has no competitors / no known equivalent? */
export const NO_COMPETITORS = /\bno (direct )?competitors?\b|do not know of an?\b|don't know of an?\b|no (known )?(india[- ]first|other) player|first of its kind|nobody else/i;
