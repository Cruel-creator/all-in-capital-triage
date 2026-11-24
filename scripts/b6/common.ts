// B6 fine-tuning case: shared helpers. Reading the Drive exports, masking founder names, the training-record shape,
// and Riya's standard as deterministic checks. Data lives in seed/b6 (git-ignored: it holds real founder details).
import { readFileSync } from "node:fs";

export const DIR = "seed/b6";
export const OUT = "seed/b6/out";

/** Minimal RFC 4180 CSV reader (quoted fields, doubled quotes, newlines inside quotes, BOM). */
export function readCsv(path: string): Record<string, string>[] {
  const text = readFileSync(path, "utf8").replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((k, i) => [k.trim(), (r[i] ?? "").trim()])));
}

/** Founder names → [F1] in every field, so names never reach a model or a training set. */
export function maskName(text: string, fullName: string): string {
  if (!fullName) return text;
  const parts = [fullName, ...fullName.split(/\s+/).filter((p) => p.length > 2)];
  return parts.reduce((t, p) => t.replace(new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), "[F1]"), text).replace(/(\[F1\]\s*)+/g, "[F1] ").replace(/\[F1\] ,/g, "[F1],").replace(/\[F1\] \n/g, "[F1]\n");
}

const DAY = /\b(?:Mon|Tues|Wednes|Thurs|Fri)day,? \d{1,2} [A-Z][a-z]+\b/g;
/** The two dates Riya offered, so the model is given slots rather than inventing them. */
export const slotsIn = (email: string) => [...new Set(email.match(DAY) ?? [])].slice(0, 2);

export type Example = {
  id: string;
  source: "real" | "synthetic";
  founder_type: string;
  sector: string;
  stage: string;
  input: string; // what the model sees
  target: string; // Riya's email (real) or a Riya-style email (synthetic)
  system_draft?: string; // the old system's draft, real rows only
  unchanged?: boolean; // Riya sent the system draft as-is
};

export const SYSTEM = `You write Riya's first email to a founder who applied to All In Capital, a pre-seed fund. Riya's standard: short, one clear ask, no praise unless it is backed by a specific fact about the founder. Open with one specific number from their traction and why it is unusual, ask one sharp question about that number, then offer the two slots given. Sign off "Riya" then "All In Capital". Founders appear as [F1].`;

export function inputFor(r: { founder_type: string; sector: string; stage: string; city?: string; founder_background: string; traction_facts: string; slots: string[] }) {
  return [
    `Founder type: ${r.founder_type}`, `Sector: ${r.sector}`, `Stage: ${r.stage}`, r.city ? `City: ${r.city}` : "",
    `Founder background: ${r.founder_background}`, `Traction: ${r.traction_facts}`,
    `Slots to offer: ${r.slots.length === 2 ? `${r.slots[0]} or ${r.slots[1]}, afternoon` : "{slot_1} or {slot_2}"}`,
  ].filter(Boolean).join("\n");
}

// ---------- Riya's standard as checks (from the case brief and 60 of her sent emails) ----------
export const PRAISE = /\b(impressive|incredible|amazing|exciting|excited|love|loved|fantastic|great|brilliant|outstanding|remarkable|inspiring|thrilled|passionate|stellar|exceptional|truly|really|congratulations|kudos)\b/i;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const lines = (s: string) => s.split(/\n+/).map((l) => l.trim()).filter(Boolean);

export type Check = { id: string; label: string; pass: boolean };

// Riya often writes the fact in words ("every nine days"), so number words count as the specific fact too.
const NUMBER_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "fifteen", "twenty", "thirty", "fifty", "hundred", "thousand", "lakh", "crore", "half", "third", "quarter", "double", "twice"];

export function checkEmail(email: string, ctx: { traction: string; founder_type: string; maxWords: number }): Check[] {
  const ls = lines(email);
  const bodyLines = ls.filter((l) => !/^(hi|hello|dear)\b/i.test(l) && !/^(riya|all in capital|best|regards|thanks|cheers|warm|kind)/i.test(l));
  const opening = bodyLines[0] ?? "";
  const facts = [
    ...(ctx.traction.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[,.]$/, "")),
    ...NUMBER_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(ctx.traction)),
  ].filter(Boolean);
  const isSlot = (l: string) => /\{slot_[12]\}|(?:Mon|Tues|Wednes|Thurs|Fri)day|30 minutes|a call\b/i.test(l);
  // the business ask: a question, or a direct request ("Please send…"), that isn't the scheduling line
  const asks = bodyLines.filter((l) => !isSlot(l) && (/\?/.test(l) || /^(please|could you|can you|send)\b/i.test(l))).length;
  return [
    { id: "no_praise", label: "No praise words", pass: !PRAISE.test(email) },
    { id: "number_first", label: "Opens with a specific fact from their traction", pass: facts.some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(opening)) },
    { id: "one_ask", label: "Exactly one business question or request", pass: asks === 1 },
    { id: "slots", label: "Offers two concrete slots", pass: /\{slot_1\}[\s\S]*\{slot_2\}/.test(email) || (email.match(/(?:Mon|Tues|Wednes|Thurs|Fri)day/g) ?? []).length >= 2 },
    { id: "short", label: `At most ${ctx.maxWords} words`, pass: words(email) <= ctx.maxWords },
    { id: "signoff", label: 'Signs off "Riya / All In Capital"', pass: /Riya\s*\n\s*All In Capital\s*$/.test(email.trim()) && !/best regards|kind regards|warm regards/i.test(email) },
  ];
}

export const allPass = (c: Check[]) => c.every((x) => x.pass);

/** A real row that breaks Riya's own standard is noise, not a lesson: kept out of training and the test set. */
export function dirtyReason(email: string, maxWords: number): string | null {
  if (/^dear\b/im.test(email)) return "formal greeting";
  if (/kind regards|best regards|at your convenience/i.test(email)) return "template sign-off";
  if (words(email) > maxWords) return `${words(email)} words of boilerplate`;
  return null;
}
