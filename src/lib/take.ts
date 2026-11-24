// "Our take": short, opinion-style lines built only from what the scorer already wrote (criterion rationales)
// and the recommendation. Nothing new is claimed here; numbers are turned into words. Pure; tested.
export const CRIT_SHORT: Record<string, string> = {
  C1: "founder-market fit", C2: "the team", C3: "customer pull", C4: "speed of execution", C5: "the market", C6: "why now",
};

/** Score (0-10) → word. Thresholds mirror the recommendation cut-offs (7.5 call, 6 dig). */
export function ratingWord(score: number | null | undefined): { word: string; tone: "green" | "neutral" | "amber" | "red" } {
  if (score == null || Number.isNaN(score)) return { word: "Unscored", tone: "neutral" };
  if (score >= 7.5) return { word: "Strong", tone: "green" };
  if (score >= 6) return { word: "Promising", tone: "neutral" };
  if (score >= 4.5) return { word: "Mixed", tone: "amber" };
  return { word: "Thin", tone: "red" };
}

/** First sentence of a rationale, citations like [d07, f12] removed. */
export function firstSentence(text: string | null | undefined, max = 160): string {
  if (!text) return "";
  const clean = text.replace(/\s*\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
  const s = clean.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? clean;
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).replace(/[\s,;:]+$/, "")}…`; // stop at a word boundary
}

export type TakeInput = {
  action: "take_call" | "dig" | "pass" | null;
  bucket: "clear" | "flagged" | "outside_mandate" | null;
  gates: string[];
  crit: Record<string, number>;
};

const VERDICT = {
  take_call: "Worth a call.",
  dig: "Interesting, but we'd want answers first.",
  pass: "Not for us right now.",
} as const;

/** Headline verdict plus where it's strongest and thinnest, in words. */
export function takeFor(t: TakeInput): { verdict: string; line: string; strongest: string | null; weakest: string | null } {
  const entries = Object.entries(t.crit).filter(([, v]) => Number.isFinite(v)).sort((a, b) => b[1] - a[1]);
  const strongest = entries[0]?.[0] ?? null;
  const weakest = entries.length > 1 ? entries[entries.length - 1][0] : null;
  let verdict: string = t.action ? VERDICT[t.action] : "Still being read.";
  if (t.bucket === "outside_mandate") verdict = "Outside what we invest in.";
  else if (t.bucket === "flagged") verdict = `${verdict} Check the flagged rule first.`;
  const line =
    strongest && weakest && strongest !== weakest
      ? `Strongest on ${CRIT_SHORT[strongest]}; thinnest on ${CRIT_SHORT[weakest]}.`
      : strongest
        ? `Best signal is ${CRIT_SHORT[strongest]}.`
        : "";
  return { verdict, line, strongest, weakest };
}
