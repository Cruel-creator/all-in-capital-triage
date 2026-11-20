// Non-negotiable 5 / Case 4 Task 1: minimum data to the model.
// Founder names become [F1], [F2]…; emails, phones and LinkedIn URLs are removed before any prompt is built.
// The gateway refuses any payload that still contains them.

export type FounderRef = { id: string; token: string; full_name: string; email?: string | null; phone?: string | null };

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE = /(?:\+?91[\s-]?)?(?<!\d)[6-9]\d{4}[\s-]?\d{5}(?!\d)/g;
const LINKEDIN = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+(?:-\s+[\w-]+)*/gi;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Name variants we strip: full name, and first/last names of 3+ letters (e.g. "Kumar" in "Arun Kumar"). */
function nameVariants(full: string): string[] {
  const clean = full.replace(/^Dr\.?\s*/i, "").trim();
  const parts = clean.split(/\s+/).filter((p) => p.length >= 3);
  return [full, clean, ...parts].sort((a, b) => b.length - a.length);
}

export function redact(text: string, founders: FounderRef[]): string {
  let out = text.replace(LINKEDIN, "[linkedin removed]").replace(EMAIL, "[email removed]").replace(PHONE, "[phone removed]");
  for (const f of founders) {
    for (const v of nameVariants(f.full_name)) out = out.replace(new RegExp(`\\b${esc(v)}\\b`, "g"), f.token);
  }
  return out;
}

/** Inverse of redact for display only (never sent to a model). */
export function unredact(text: string, founders: FounderRef[]): string {
  return founders.reduce((t, f) => t.split(f.token).join(f.full_name), text);
}

export class PiiLeakError extends Error {}

/** Throws if the payload contains an email, phone, LinkedIn URL or a known founder name. */
export function assertNoPii(payload: string, founders: FounderRef[] = []): void {
  const hits: string[] = [];
  if (payload.match(EMAIL)) hits.push("email");
  if (payload.match(PHONE)) hits.push("phone");
  if (payload.match(LINKEDIN)) hits.push("linkedin");
  for (const f of founders) {
    const clean = f.full_name.replace(/^Dr\.?\s*/i, "");
    if (new RegExp(`\\b${esc(clean)}\\b`).test(payload)) hits.push(`founder name (${f.token})`);
    if (f.email && payload.includes(f.email)) hits.push(`founder email (${f.token})`);
  }
  if (hits.length) throw new PiiLeakError(`Refusing to send PII to the model: ${[...new Set(hits)].join(", ")}`);
}
