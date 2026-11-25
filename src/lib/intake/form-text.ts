// The web application form. Pure: validates what a founder (or Riya) typed and turns it into the same
// "Label value" page text the fund's PDF forms produce, so parseForm, gates, research and reconcile read it unchanged.
// Founder emails are kept out of the text: they go to the founders table only (the one table holding PII).
import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).optional().default("");
const req = (max: number, what: string) => z.string().trim().min(1, `${what} is required.`).max(max, `${what} is too long.`);

export const STAGES = ["Pre-seed", "Seed", "Series A", "Series B or later"] as const;

const Founder = z.object({
  name: z.string().trim().max(80).optional().default(""),
  role: text(40),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("A founder email doesn't look right.").max(120)]).optional().default(""),
  linkedin: text(160),
  background: text(500),
});

export const ApplicationFields = z.object({
  company: req(80, "Company name"),
  website: text(120),
  location: text(80),
  oneLiner: req(200, "One-line description"),
  sector: req(60, "Sector"),
  stage: z.enum(STAGES, { message: "Pick a stage." }),
  founders: z.array(Founder).min(1).max(3),
  built: req(1500, "What you have built"),
  revenue: text(400),
  growth: text(400),
  raising: req(80, "Amount raising"),
  valuation: text(80),
  existingInvestors: text(300),
  useOfFunds: text(500),
  heard: text(200),
  anythingElse: text(1500),
}).superRefine((v, ctx) => {
  const named = v.founders.filter((f) => f.name);
  if (!named.length) ctx.addIssue({ code: "custom", message: "Add at least one founder's name.", path: ["founders"] });
  if (!named.some((f) => f.email)) ctx.addIssue({ code: "custom", message: "Add an email for at least one founder, so we can reply.", path: ["founders"] });
  for (const f of named) if (!/^[A-Z]/.test(f.name)) ctx.addIssue({ code: "custom", message: `Start "${f.name}" with a capital letter.`, path: ["founders"] });
});
export type ApplicationFields = z.infer<typeof ApplicationFields>;

/** Keeps one label per line: a newline inside an answer would be read as a new field, so it becomes a space. */
const one = (s: string) => s.replace(/\s+/g, " ").trim();

const linkedinPath = (s: string) => {
  const m = s.replace(/^https?:\/\//, "").replace(/^www\./, "").match(/linkedin\.com\/in\/([\w-]+)/i);
  return m ? `linkedin.com/in/${m[1]}` : "";
};

function founderLine(f: z.infer<typeof Founder>) {
  const parts = [one(f.name) + (f.role ? `, ${one(f.role)}.` : ".")];
  if (f.background) parts.push(one(f.background).replace(/\.?$/, "."));
  const li = linkedinPath(f.linkedin);
  if (li) parts.push(li);
  return parts.join(" ");
}

/** The form as page text, in the layout parseForm reads. Two pages: company and product, then fundraising. */
export function formPages(v: ApplicationFields): { page_no: number; text: string }[] {
  const named = v.founders.filter((f) => f.name);
  const row = (label: string, value: string) => (value ? `${label} ${one(value)}` : null);
  const p1 = [
    "ALL IN CAPITAL | INBOUND APPLICATION",
    "Application Form Response",
    "Submitted through the fund's web application form. Responses are reproduced as the applicant wrote them.",
    "Company",
    row("Company name", v.company),
    row("Website", v.website),
    row("Location", v.location),
    row("One-line description", v.oneLiner),
    row("Sector (as selected)", v.sector),
    row("Stage (as selected)", v.stage),
    "Founders",
    ...named.map((f, i) => `Founder ${i + 1} ${founderLine(f)}`),
    "Product and traction",
    row("What have you built?", v.built),
    row("Revenue / GMV", v.revenue),
    row("Growth", v.growth),
  ];
  const p2 = [
    "Fundraising",
    row("Amount raising", v.raising),
    row("Valuation expectation", v.valuation),
    row("Existing investors", v.existingInvestors),
    row("Use of funds", v.useOfFunds),
    row("How did you hear about us?", v.heard || "Web application form."),
    row("Anything else we should know?", v.anythingElse),
  ];
  const clean = (lines: (string | null)[]) => lines.filter((l): l is string => !!l).join("\n");
  return [{ page_no: 1, text: clean(p1) }, { page_no: 2, text: clean(p2) }];
}

/** Founders for the founders table, in the order typed (emails included; this never reaches a model). */
export function founderRows(v: ApplicationFields) {
  return v.founders.filter((f) => f.name).map((f, i) => ({
    position: i + 1,
    full_name: one(f.name),
    role_title: f.role ? one(f.role) : null,
    email: f.email || null,
    linkedin_url: linkedinPath(f.linkedin) || null,
  }));
}

/** Same rule as the seed: one application per company name. */
export const dedupeKey = (company: string) => company.toLowerCase().replace(/\s*\(.*\)\s*$/, "").replace(/[^a-z0-9]/g, "");
