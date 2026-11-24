// Post-generation email linter (build prompt §8, no-ai-slop skill). Pure and deterministic.
// A draft that fails is regenerated before Riya sees it; nothing is ever auto-sent.
export type Template = "invite" | "dig" | "pass" | "follow_up";
export type LintIssue = { rule: string; detail: string };
export type LintReport = { ok: boolean; issues: LintIssue[]; words: number; subjectWords: number };

/** no-ai-slop "banned outright" plus the build prompt's own list. */
export const BANNED_WORDS = [
  "delve", "foster", "leverage", "utilize", "facilitate", "empower", "streamline", "robust", "cutting-edge", "paradigm shift",
  "game changer", "game-changer", "this is huge", "this changes everything", "tapestry", "realm", "beacon", "multifaceted",
  "meticulous", "intricate", "paramount", "transformative", "elevate", "embark", "supercharge", "harness", "ever-evolving",
  "excited to", "thrilled", "delighted to", "synergy", "circle back", "touch base", "reach out", "hope this finds you",
];

/** Banned patterns: binary contrasts, throat-clearing, faux insight, summary sign-offs, puffery. */
export const BANNED_PATTERNS: { rule: string; re: RegExp }[] = [
  { rule: "binary contrast (not X but Y)", re: /\bnot (?:just |only |simply )?[^.?!]{1,40}?,? but\b/i },
  { rule: "binary contrast (isn't X, it's Y)", re: /\b(?:isn't|is not|wasn't)\b[^.?!]{1,40}[.,;]\s*(?:it's|it is)\b/i },
  { rule: "throat-clearing opener", re: /\b(?:here's the thing|let me be clear|i'll be honest|i wanted to reach out|i hope (?:this|you're)|just wanted to)\b/i },
  { rule: "faux-insight setup", re: /\b(?:what most people|here's what nobody|the part everyone misses|most founders don't)\b/i },
  { rule: "summary sign-off", re: /(?:^|\n)\s*(?:in conclusion|overall|ultimately|to summari[sz]e|in summary)\b/i },
  { rule: "importance puffery", re: /\b(?:stands as a testament|pivotal moment|plays a vital role|underscores)\b/i },
  { rule: "empty phrase", re: /\b(?:it's worth noting|it is important to note|at the end of the day|going forward|in order to)\b/i },
  { rule: "em dash", re: /—|--/ },
];

export const countWords = (s: string) => (s.trim().match(/\S+/g) ?? []).length;

/** Body without greeting and sign-off: what the first-sentence rule applies to. */
export function bodyParts(body: string) {
  const lines = body.split(/\r?\n/).map((l) => l.trim());
  const greetIdx = lines.findIndex((l) => l.length > 0);
  const hasGreeting = greetIdx >= 0 && /^(hi|hello|dear|hey)\b/i.test(lines[greetIdx]);
  const rest = lines.slice(hasGreeting ? greetIdx + 1 : 0);
  const text = rest.join("\n").trim();
  const firstSentence = (text.split(/(?<=[.!?])\s+/)[0] ?? "").trim();
  return { hasGreeting, text, firstSentence, lines };
}

/** Riya's standard: "no praise unless it is backed by a specific fact". In invites, the fact does the complimenting. */
export const PRAISE = /\b(impressive|incredible|amazing|exciting|love|loved|fantastic|great|brilliant|outstanding|remarkable|inspiring|stellar|exceptional|truly|really|congratulations|kudos)\b/i;
/** Her invites run 42-61 words (B6 export); 80 leaves room for a partner line. */
export const INVITE_MAX_WORDS = 80;
const subjectAndBody = (e: { subject: string; body: string }) => `${e.subject}\n${e.body}`;

export function lintEmail(e: { subject: string; body: string; template: Template; openingFact?: string | null }): LintReport {
  const issues: LintIssue[] = [];
  const words = countWords(e.body);
  const subjectWords = countWords(e.subject);
  const { hasGreeting, firstSentence, lines, text } = bodyParts(e.body);

  if (words > 120) issues.push({ rule: "length", detail: `${words} words; the limit is 120` });
  if (subjectWords > 7) issues.push({ rule: "subject length", detail: `subject has ${subjectWords} words; the limit is 7` });
  if (!e.subject.trim()) issues.push({ rule: "subject", detail: "subject is empty" });
  if (!hasGreeting) issues.push({ rule: "greeting", detail: 'start with a greeting line, e.g. "Hi [F1],"' });

  // first sentence cites one specific number or fact from the application
  if (!/\d/.test(firstSentence)) issues.push({ rule: "specific opening", detail: "the first sentence must cite a specific number from their application" });
  if (e.openingFact && !firstSentence.toLowerCase().includes(e.openingFact.toLowerCase()))
    issues.push({ rule: "opening fact", detail: `the first sentence should use the chosen fact (${e.openingFact})` });

  // one clear next step
  const questions = (text.match(/\?/g) ?? []).length;
  if (e.template === "invite") {
    // one sharp question about the number, then ask the founder for a day and time (the app books what they reply)
    const asksForTime = /\b(day and time|time that suits|time that works|when suits|when works|a time)\b[^?]*\?/i.test(e.body) || (e.body.includes("{slot_1}") && e.body.includes("{slot_2}"));
    if (!asksForTime) issues.push({ rule: "ask for a time", detail: "a call invite asks the founder to reply with a day and time" });
    if (questions < 1 || questions > 2) issues.push({ rule: "one next step", detail: `one question about their number, then the question asking for a time (found ${questions})` });
    if (words > INVITE_MAX_WORDS) issues.push({ rule: "length", detail: `${words} words; Riya's invites stay under ${INVITE_MAX_WORDS}` });
    const praise = subjectAndBody(e).match(PRAISE);
    if (praise) issues.push({ rule: "praise", detail: `"${praise[0]}": let the fact do the complimenting` });
  }
  if (e.template === "dig" && (questions < 1 || questions > 2)) issues.push({ rule: "one next step", detail: `ask 1 or 2 specific questions (found ${questions})` });
  if ((e.template === "pass" || e.template === "follow_up") && questions > 1) issues.push({ rule: "one next step", detail: `at most one question (found ${questions})` });
  if (e.template === "pass" && /\b(fraud|lied|lying|misled|dishonest|fake)\b/i.test(e.body))
    issues.push({ rule: "accusatory", detail: "ask for the numbers; never allege" });

  // signed by Riya
  const tail = lines.filter(Boolean).slice(-3).join(" ");
  if (!/\bRiya\b/.test(tail)) issues.push({ rule: "signature", detail: "sign off as Riya" });

  const all = `${e.subject}\n${e.body}`;
  for (const w of BANNED_WORDS) if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(all)) issues.push({ rule: "banned word", detail: `"${w}"` });
  for (const p of BANNED_PATTERNS) {
    const m = all.match(p.re);
    if (m) issues.push({ rule: p.rule, detail: `"${m[0].trim()}"` });
  }
  return { ok: issues.length === 0, issues, words, subjectWords };
}

export const lintFeedback = (r: LintReport) => r.issues.map((i) => `${i.rule}: ${i.detail}`).join("; ");
