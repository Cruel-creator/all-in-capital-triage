// Ranking maths (build prompt §5b-5c). Pure; no model. Every number shown in the UI comes from here.
export type Criterion = "C1" | "C2" | "C3" | "C4" | "C5" | "C6";
export type Confidence = "high" | "med" | "low";
export const CRITERIA: Criterion[] = ["C1", "C2", "C3", "C4", "C5", "C6"];
export const FOUNDER: Criterion[] = ["C1", "C2", "C4"];
export const MARKET: Criterion[] = ["C3", "C5", "C6"];

export type Lens = { boost: string[]; multiplier: number };
export type CritScore = { criterion: Criterion; score: number; confidence: Confidence; rules: string[]; needsAttention?: boolean };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Multiply the lens criteria's weights by the lens multiplier, then renormalise to 100%. */
export function lensWeights(base: Record<Criterion, number>, lens: Lens | null): Record<Criterion, number> {
  const w = { ...base };
  if (lens) for (const c of lens.boost as Criterion[]) w[c] *= lens.multiplier;
  const sum = CRITERIA.reduce((a, c) => a + w[c], 0);
  return Object.fromEntries(CRITERIA.map((c) => [c, w[c] / sum])) as Record<Criterion, number>;
}

/** Missing evidence scores 2/10 with confidence Low (R4); it is never skipped. */
export const MISSING = { score: 2, confidence: "low" as Confidence };

export function weighted(scores: CritScore[], weights: Record<Criterion, number>, subset: Criterion[] = CRITERIA): number {
  const ws = subset.reduce((a, c) => a + weights[c], 0);
  const sum = subset.reduce((a, c) => a + weights[c] * (scores.find((s) => s.criterion === c)?.score ?? MISSING.score), 0);
  return r1(sum / ws);
}

export function coverage(scores: CritScore[]): number {
  return Math.round((scores.filter((s) => s.confidence !== "low").length / CRITERIA.length) * 100);
}

export type Gates = { G1: boolean; G2: boolean; G3: boolean; G4: boolean };
export type WrittenFit = "in" | "stretch" | "outside";
export type Bucket = "clear" | "flagged" | "outside_mandate";
export type Action = "take_call" | "dig" | "pass";

/** Clear → Flagged (needs Kushal) → Outside mandate. Out-of-thesis sectors are scored and flagged, not gated out. */
export function bucketOf(g: Gates, fit: WrittenFit): Bucket {
  if (g.G1) return "outside_mandate";
  if (g.G2 || g.G3 || g.G4 || fit === "outside") return "flagged";
  return "clear";
}

/** Take the call: ≥7.5, no red gate, Med+ confidence on C1–C3. Dig: 6.0–7.49. Pass: below 6.0. */
export function actionOf(total: number, g: Gates, scores: CritScore[], t = { call: 7.5, dig: 6.0 }): Action {
  const strong = ["C1", "C2", "C3"].every((c) => scores.find((s) => s.criterion === c)?.confidence !== "low");
  const anyGate = g.G1 || g.G2 || g.G3 || g.G4;
  if (total >= t.call && !anyGate && strong) return "take_call";
  if (total >= t.dig) return "dig";
  return "pass";
}

/** The three rules that drove the result: rule mentions weighted by the criterion's weight. */
export function topRules(scores: CritScore[], weights: Record<Criterion, number>, n = 3): string[] {
  const tally = new Map<string, number>();
  for (const s of scores) for (const r of s.rules) tally.set(r, (tally.get(r) ?? 0) + weights[s.criterion]);
  return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([r]) => r);
}

export const lensFor = (sector: string, map: Record<string, string>) => map[sector.toLowerCase()] ?? null;

export function writtenFit(sector: string, sectors: { in: string[]; stretch: string[]; outside: string[] }): WrittenFit {
  const s = sector.toLowerCase();
  if (sectors.in.some((x) => s.includes(x) || x.includes(s))) return "in";
  if (sectors.outside.some((x) => s.includes(x))) return "outside";
  return "stretch";
}

/** Confidence from where the cited evidence came from, decided in code (build prompt §5b). */
export function confidenceOf(used: { origin: "deck" | "form" | "research"; contested: boolean }[]): Confidence {
  if (!used.length) return "low";
  if (used.some((u) => u.origin === "research" && !u.contested)) return "high";
  const clean = used.filter((u) => !u.contested);
  if (clean.some((u) => u.origin === "deck") && clean.some((u) => u.origin === "form")) return "med";
  return "low";
}
