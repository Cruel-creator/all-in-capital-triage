// Credential claims in the deck vs what the form says (G4 integrity, R7: score evidence, not pedigree).
import type { ReconFlag } from "./types";

const STOP = new Set([
  "Founder", "Co", "CEO", "CTO", "COO", "CFO", "MBA", "Ex", "Led", "Team", "Tech", "Growth", "Qualified",
  "The", "And", "Of", "At", "In", "A", "An", "Built", "Designed", "Runs", "Trained", "First", "Both", "Dr",
  "Product", "Engineering", "Previously", "Former", "Formerly", "Head", "Lead",
]);

/** Weak signals in the form that suggest the deck's credential was inflated. */
const DOWNGRADE = /\b(internship|intern|summer analyst|contract role|vendor|tier[- ]?2|outsourced|advisor)\b/gi;

/** Proper-noun phrases (institutions, employers, people) in a credentials line. */
export function namedEntities(text: string): string[] {
  const out = new Set<string>();
  const re = /\b(?:Ex-)?((?:IIT|IIM|BITS|NIT|ISB|[A-Z][a-zA-Z&]+)(?:\s+(?:[A-Z][a-zA-Z&]+|of|&))*)/g;
  for (const m of text.matchAll(re)) {
    // a single capitalised word that just starts a sentence ("Designs the protocols") is not a named entity
    const before = text.slice(0, m.index ?? 0);
    const sentenceStart = /(^|[.!?]\s+)$/.test(before);
    const hasEx = m[0].startsWith("Ex-");
    const isAcronym = /^(IIT|IIM|BITS|NIT|ISB)\b/.test(m[1]);
    if (sentenceStart && !hasEx && !isAcronym && !/\s/.test(m[1].trim())) continue;
    const phrase = m[1]
      .split(/\s+/)
      .filter((w, i, arr) => !(STOP.has(w) && (i === 0 || i === arr.length - 1)))
      .join(" ")
      .replace(/\s+(of|&)$/, "")
      .trim();
    if (phrase && !STOP.has(phrase) && phrase.length > 2) out.add(phrase);
  }
  return [...out];
}

export function credentialCheck(
  deck: { id: string; text: string },
  form: { id: string; text: string },
): ReconFlag | null {
  const formLower = form.text.toLowerCase();
  const names = namedEntities(deck.text);
  const unsupported = names.filter((n) => !formLower.includes(n.toLowerCase()));
  if (!unsupported.length) return null;
  const downgrades = [...new Set([...form.text.matchAll(DOWNGRADE)].map((m) => m[0].toLowerCase()))];
  return {
    check: "credentials",
    metric: "founder.credentials",
    stated: null,
    stated_label: unsupported.join(", "),
    computed: null,
    delta_pct: null,
    severity: downgrades.length ? "red" : "warn",
    formula: `deck names: ${names.join(", ")}; not in form: ${unsupported.join(", ")}`,
    explanation:
      `The deck names ${unsupported.join(", ")}, which the form does not mention.` +
      (downgrades.length ? ` The form instead describes: ${downgrades.join(", ")}. Ask for the record rather than assume.` : ""),
    claim_ids: [deck.id, form.id],
  };
}
