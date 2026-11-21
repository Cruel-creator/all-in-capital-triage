// Source classification and placeholder detection. Pure; tested.

/** Databases that repackage other sources. They lose to a primary source when the two disagree. */
const AGGREGATORS = [
  "crunchbase.com", "tracxn.com", "zaubacorp.com", "tofler.in", "thecompanycheck.com", "pitchbook.com", "cbinsights.com",
  "owler.com", "craft.co", "f6s.com", "startupranking.com", "growjo.com", "zoominfo.com", "rocketreach.co", "apollo.io",
  "signalhire.com", "vcbacked.co", "f4.fund", "inc42.com/datalabs", "privatecircle.co",
];
/** Registries and filings: primary by definition. */
const REGISTRIES = ["mca.gov.in", "ibbi.gov.in", "sebi.gov.in", "rbi.org.in", "gst.gov.in"];

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** primary = the company/person's own site, a registry, or a direct profile; secondary = reporting; aggregator = database. */
export function sourceType(url: string, companyDomain?: string | null): "primary" | "secondary" | "aggregator" {
  const h = hostOf(url);
  const full = url.toLowerCase();
  if (REGISTRIES.some((r) => h.endsWith(r))) return "primary";
  if (companyDomain && h.endsWith(companyDomain.replace(/^www\./, ""))) return "primary";
  if (AGGREGATORS.some((a) => full.includes(a))) return "aggregator";
  if (/linkedin\.com\/(in|company)\//.test(full)) return "primary";
  return "secondary";
}

/** The seed applications use reserved .example domains; they are never fetched (RFC 2606). */
export function isPlaceholder(urlOrDomain: string | null | undefined): boolean {
  if (!urlOrDomain) return true;
  return /\.(example|invalid|test|localhost)(\/|$)|(^|\.)example\.(com|org|net)(\/|$)|-example\b/i.test(urlOrDomain);
}

/** Social feeds rarely scrape and rarely establish facts; they are listed in the query log but not read. */
export const isSocial = (url: string) => /(^|\.)(instagram\.com|facebook\.com|x\.com|twitter\.com|tiktok\.com|threads\.net|pinterest\.com)$/i.test(hostOf(url));

/**
 * A page about a founder only counts as theirs if it also names the applicant's company. Same-name people are
 * common and the seed profiles are placeholders: a missed profile is safe, a wrong one is a fabricated dossier.
 */
export function founderPageMatches(markdown: string, company: string): boolean {
  return markdown.toLowerCase().includes(company.toLowerCase());
}

/** Up to `max` characters of text around mentions of any needle (paragraph-bounded). Pages never go to the model whole. */
export function windowAround(markdown: string, needles: string[], max = 2000): string {
  const paras = markdown.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const lower = needles.filter(Boolean).map((n) => n.toLowerCase());
  const hits = paras.map((p, i) => (lower.some((n) => p.toLowerCase().includes(n)) ? i : -1)).filter((i) => i >= 0);
  const picked = new Set<number>();
  for (const i of hits) for (const j of [i - 1, i, i + 1]) if (j >= 0 && j < paras.length) picked.add(j);
  const ordered = [...picked].sort((a, b) => a - b).map((i) => paras[i]);
  const text = (ordered.length ? ordered : paras.slice(0, 4)).join("\n\n");
  return text.length > max ? text.slice(0, max) : text;
}
