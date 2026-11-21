// Validation for rubric edits from Settings. Pure; tested. Weights are normalised in code so they always sum to 1.
export type RubricEdit = {
  weights: Record<string, number>; // C1..C6, any positive numbers (e.g. percentages)
  call: number; dig: number;
  lensMultipliers: Record<string, number>;
  anchors: Record<string, Record<string, string>>;
};

export function normaliseWeights(w: Record<string, number>): Record<string, number> {
  const sum = Object.values(w).reduce((a, x) => a + (x > 0 ? x : 0), 0);
  if (sum <= 0) throw new Error("At least one criterion needs a weight above zero.");
  return Object.fromEntries(Object.entries(w).map(([k, x]) => [k, Math.round(((x > 0 ? x : 0) / sum) * 1000) / 1000]));
}

/** Returns the problems with an edit, or [] if it can be saved. */
export function rubricProblems(e: RubricEdit): string[] {
  const p: string[] = [];
  const keys = ["C1", "C2", "C3", "C4", "C5", "C6"];
  if (keys.some((k) => !(k in e.weights) || !Number.isFinite(e.weights[k]) || e.weights[k] < 0)) p.push("Every criterion needs a weight of zero or more.");
  const group = (cs: string[]) => cs.reduce((a, c) => a + (e.weights[c] > 0 ? e.weights[c] : 0), 0);
  if (group(["C1", "C2", "C4"]) <= 0) p.push("At least one founder area (founder-market fit, team, speed) needs a weight.");
  if (group(["C3", "C5", "C6"]) <= 0) p.push("At least one market area (customer pull, market, why now) needs a weight.");
  if (!(e.call > 0 && e.call <= 10)) p.push("The call threshold must be between 0 and 10.");
  if (!(e.dig >= 0 && e.dig < e.call)) p.push("The dig threshold must be below the call threshold.");
  for (const [k, m] of Object.entries(e.lensMultipliers)) if (!(m >= 1 && m <= 3)) p.push(`The ${k.replace(/_/g, " ")} lens multiplier must be between 1 and 3.`);
  for (const [c, a] of Object.entries(e.anchors)) if (Object.values(a).some((t) => !t.trim())) p.push(`${c} has an empty anchor.`);
  return p;
}

/** Applies an edit to a rubric config, returning a new config. */
export function applyRubricEdit<T extends { criteria: Record<string, { weight: number; anchors: Record<string, string> }>; lenses: Record<string, { multiplier: number }>; recommendation: { take_call: { min_score: number }; dig: { min_score: number; max_score?: number }; pass?: { max_score?: number } } }>(config: T, e: RubricEdit): T {
  const w = normaliseWeights(e.weights);
  const next = structuredClone(config);
  for (const [c, def] of Object.entries(next.criteria)) {
    def.weight = w[c];
    if (e.anchors[c]) def.anchors = { ...def.anchors, ...e.anchors[c] };
  }
  for (const [k, m] of Object.entries(e.lensMultipliers)) if (next.lenses[k]) next.lenses[k].multiplier = m;
  next.recommendation.take_call.min_score = e.call;
  next.recommendation.dig.min_score = e.dig;
  next.recommendation.dig.max_score = Math.round((e.call - 0.01) * 100) / 100;
  if (next.recommendation.pass) next.recommendation.pass.max_score = Math.round((e.dig - 0.01) * 100) / 100;
  return next;
}
