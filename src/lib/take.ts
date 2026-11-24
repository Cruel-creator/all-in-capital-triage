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

// ---------- Riya's three decisions: a clear yes, a clear no, or her call ----------

export type CallKind = "yes" | "no" | "your_call" | "reading";

/** A pass scoring at least this ("Mixed" and up) is a near-miss: Riya's call, not a clear no. */
export const NEAR_MISS = 4.5;

/**
 * Yes: meets the rubric (take the call, no fund rule tripped). No: clearly doesn't ("Thin", under 4.5, or outside
 * the mandate). Your call: the gray area: dig first, strong but a fund rule tripped, or a near-miss pass. Pure; tested.
 */
export function callKind(t: { action: TakeInput["action"]; bucket: TakeInput["bucket"]; total?: number | null }): CallKind {
  if (!t.action) return "reading";
  if (t.bucket === "outside_mandate") return "no";
  if (t.action === "pass") return (t.total ?? 0) >= NEAR_MISS ? "your_call" : "no";
  if (t.action === "take_call" && t.bucket !== "flagged") return "yes";
  return "your_call";
}

export const CALL_LABEL: Record<CallKind, string> = { yes: "Yes", no: "No", your_call: "Your call", reading: "Still reading" };

export type Call = {
  kind: CallKind;
  headline: string; // "Yes: give it 30 minutes."
  why: string; // one line
  lean?: "yes" | "no"; // gray area only: which way the AI leans
  leanWhy?: string;
  toYes?: string; // what would make it a yes
  toNo?: string; // what would make it a no
};

/** The glance Riya needs: give this company time or not, why, and for the gray area which way the AI leans. Pure; tested. */
export function callFor(t: TakeInput & { total: number | null; askFirst?: string | null; wouldChange?: string | null; gateNames?: string[] }): Call {
  const kind = callKind(t);
  const { line, strongest, weakest } = takeFor(t);
  const total = t.total ?? 0;
  const nearMiss = t.action === "pass";
  const strong = strongest ? CRIT_SHORT[strongest] : null;
  const weak = weakest ? CRIT_SHORT[weakest] : null;
  if (kind === "reading") return { kind, headline: "Still reading this one.", why: "Check back in a few minutes." };
  if (kind === "yes") return { kind, headline: "Yes: give it 30 minutes.", why: line || "Meets the bar on every check." };
  if (kind === "no")
    return {
      kind,
      headline: "No: don't spend time on it.",
      why: t.bucket === "outside_mandate" ? "Outside what the fund invests in." : weak ? `Falls short on ${weak}${strong && strong !== weak ? `, even with ${strong} going for it` : ""}.` : "Falls short of the bar.",
    };
  // the gray area
  const flagged = t.bucket === "flagged";
  const lean: "yes" | "no" = flagged ? (t.action === "take_call" ? "yes" : total >= 6.75 ? "yes" : "no") : total >= 6.75 ? "yes" : "no";
  const rule = t.gateNames?.length ? t.gateNames.join(" and ").toLowerCase() : "a fund rule";
  const leanWhy = nearMiss
    ? `Just under the bar${strong ? `: ${strong} is a real strength` : ""}${weak ? `, but ${weak} is the weak spot` : ""}${flagged ? `, and ${rule} adds risk` : ""}.`
    : flagged
    ? lean === "yes"
      ? `It clears the score bar${strong ? `, strongest on ${strong}` : ""}, but ${rule} needs your judgement.`
      : `It's close to the bar and ${rule} adds risk.`
    : lean === "yes"
      ? `Close to the call line${strong ? `, and ${strong} is a real strength` : ""}.`
      : `Closer to a no${weak ? `: ${weak} is the weak spot` : ""}.`;
  return {
    kind,
    headline: "Your call.",
    why: line,
    lean,
    leanWhy,
    toYes: t.askFirst ? `a good answer to: ${firstSentence(t.askFirst, 160)}` : nearMiss && t.wouldChange ? `they can show: ${firstSentence(t.wouldChange, 140)}` : flagged ? `you're comfortable with ${rule}.` : weak ? `${weak} holds up when you ask about it.` : undefined,
    toNo: flagged ? `${rule} turns out to be a real problem.` : weak ? `${weak} doesn't hold up.` : t.wouldChange ? `nothing changes on: ${firstSentence(t.wouldChange, 120)}` : undefined,
  };
}

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
