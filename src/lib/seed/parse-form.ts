// Deterministic parser for the fund's application form PDFs (label/value layout). No model involved.
export type ParsedFounder = { position: number; full_name: string; role_title: string | null; linkedin_url: string | null; background: string };
export type ParsedForm = {
  company_name: string;
  legal_name: string | null;
  one_liner: string | null;
  sector_label: string | null;
  stage_label: string | null;
  location: string | null;
  incorporated: string | null;
  source: "form" | "warm_intro";
  intro_by: string | null;
  heard_about_us: string | null;
  founders: ParsedFounder[];
  fields: Record<string, { value: string; page_no: number }>;
};

const LABELS = [
  "Company name", "Website", "Location", "Incorporated", "One-line description", "Sector (as selected)",
  "Stage (as selected)", "Team size", "Founder 1", "Founder 2", "Founder 3", "Founder", "Time commitment",
  "Prior startup experience", "Earlier co-founder", "Equity split", "What have you built?", "Active customers",
  "Customers", "Workers", "Users", "Advances", "Rent volume", "Revenue / GMV", "Volume and revenue", "Revenue",
  "Growth", "Repeat behaviour", "Repeat", "Channel mix", "Unit economics", "Customer acquisition", "Patient acquisition",
  "Capex", "Competition", "Accuracy and liability", "Funding of advances", "Evidence of value", "Dependencies",
  "How is credit funded?", "Credit book size", "Defaults to date", "Regulatory status", "Who else is doing this?",
  "Why will you win?", "Key risks", "Amount raising", "Valuation expectation", "Existing investors", "Use of funds",
  "Other investors in conversation", "How did you hear about us?", "Anything else we should know?",
];

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
const SKIP = /^(Company|Founders|Product and traction|Fundraising|Credit|Competition and differentiation)$/;
const HEADER = /^(ALL IN CAPITAL|MESA MBA|Application Form Response|All In Capital|Submitted through|them\. Pair with)/;

/** Splits the form into label → value, remembering the page each value starts on. */
export function formFields(pages: { page_no: number; text: string }[]) {
  const out: Record<string, { value: string; page_no: number }> = {};
  const ordered = [...LABELS].sort((a, b) => b.length - a.length); // longest first: "Founder 1" before "Founder"
  let current: string | null = null;
  for (const p of pages) {
    for (const raw of p.text.split("\n")) {
      const line = raw.trim();
      if (!line || HEADER.test(line)) continue;
      // "Other investors in" + "conversation" wraps onto two lines in some forms
      const label = ordered.find((l) => line === l || line.startsWith(l + " "));
      if (label && !(label in out)) {
        current = label;
        out[label] = { value: collapse(line.slice(label.length)), page_no: p.page_no };
      } else if (current && !SKIP.test(line)) {
        out[current].value = collapse(out[current].value + " " + line);
      }
    }
  }
  return out;
}

function parseFounder(position: number, value: string): ParsedFounder {
  const m = value.match(/^((?:Dr\.\s*)?[A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)*)/);
  const full_name = (m?.[1] ?? value.split(/[,.]/)[0]).trim();
  const rest = value.slice(full_name.length).replace(/^[,.]\s*/, "");
  const role = rest.match(/^((?:Founder and )?(?:CEO|CTO|COO|CFO|Growth|Founder)(?: \(Tech\))?)/)?.[1] ?? null;
  // PDF line wraps split URLs after a hyphen: "ritu-\nhegde-example" → "ritu- hegde-example"
  const li = value.replace(/-\s+/g, "-").match(/linkedin\.com\/in\/([\w-]+)/);
  const linkedin_url = li ? `linkedin.com/in/${li[1]}` : null;
  return { position, full_name, role_title: role, linkedin_url, background: value };
}

export function parseForm(pages: { page_no: number; text: string }[]): ParsedForm {
  const f = formFields(pages);
  const get = (k: string) => f[k]?.value ?? null;
  const companyRaw = get("Company name") ?? "";
  const company_name = companyRaw.replace(/\s*\(.*\)\s*$/, "").trim();
  const legal_name = companyRaw.match(/\((.*)\)/)?.[1] ?? null;
  const founders = (["Founder 1", "Founder 2", "Founder 3", "Founder"] as const)
    .filter((k) => f[k])
    .map((k, i) => parseFounder(i + 1, f[k].value));
  const heard = get("How did you hear about us?");
  const warm = !!heard && /introduc|referr|portfolio|fund i\b/i.test(heard) && !/^public application form/i.test(heard.trim());
  return {
    company_name,
    legal_name,
    one_liner: get("One-line description"),
    sector_label: get("Sector (as selected)"),
    stage_label: get("Stage (as selected)"),
    location: get("Location"),
    incorporated: get("Incorporated"),
    source: warm ? "warm_intro" : "form",
    intro_by: warm ? heard : null,
    heard_about_us: heard,
    founders,
    fields: f,
  };
}
