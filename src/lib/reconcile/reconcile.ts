// Deterministic reconciliation. Every number the UI shows as "computed" comes from here, never from a model.
import { deltaPct, formatValue } from "./money";
import type { Bound, Derived, ReconCheck, ReconClaim, ReconFlag, ReconResult, Severity, Unit } from "./types";

/** Tolerances from the build prompt: differences above 5% are flagged; "about"/"~" figures get 10%. */
export const TOLERANCE_PCT = 5;
export const APPROX_TOLERANCE_PCT = 10;
export const RED_PCT = 25;

/** Metrics a deck should carry when the form has them (a missing ask is a named gap). */
const EXPECTED_IN_DECK = ["raise.amount"];

const checkFor = (metric: string): ReconCheck => {
  if (metric === "market.tam") return "tam";
  if (metric === "market.sam") return "sam";
  if (metric === "market.som") return "som";
  if (metric === "mrr" || metric === "arr") return "mrr";
  if (metric.startsWith("cac")) return "blended_cac";
  if (metric === "payback") return "payback";
  if (metric.startsWith("revenue")) return "revenue";
  return "unit_count";
};

const label = (c: ReconClaim) => {
  const v = c.value === null ? "n/a" : formatValue(c.value, c.unit);
  const pre: Record<Bound, string> = { eq: "", approx: "~", lt: "under ", lte: "at most ", gt: "over ", gte: "at least " };
  return `${pre[c.bound ?? "eq"]}${v}`;
};

/** Does `actual` satisfy the founder's statement `stated` read with its bound? */
export function satisfies(stated: ReconClaim, actual: number): { ok: boolean; delta: number | null } {
  const s = stated.value as number;
  switch (stated.bound ?? "eq") {
    case "lt":
      return { ok: actual < s, delta: null };
    case "lte":
      return { ok: actual <= s, delta: null };
    case "gt":
      return { ok: actual > s, delta: null };
    case "gte":
      return { ok: actual >= s, delta: null };
    case "approx": {
      const d = deltaPct(s, actual);
      return { ok: d <= APPROX_TOLERANCE_PCT, delta: d };
    }
    default: {
      const d = deltaPct(s, actual);
      return { ok: d <= TOLERANCE_PCT, delta: d };
    }
  }
}

const severityOf = (delta: number | null, ok: boolean): Severity => {
  if (ok) return "info";
  if (delta === null) return "red"; // a bound was broken outright (e.g. "under 2,000" vs 2,860)
  return delta > RED_PCT ? "red" : "warn";
};

const groupBy = <T>(xs: T[], key: (x: T) => string) =>
  xs.reduce<Record<string, T[]>>((acc, x) => ((acc[key(x)] ??= []).push(x), acc), {});

/** A forward-looking target ("In 12 months: 80 paying teams") is not an actual and must never be compared with one.
 *  "In just 7 months we have served…" is a past achievement and stays an actual. */
const TARGET = /\bin\s+(?:the\s+next\s+)?\d+\s+months\s*:|\b(?:target|goal|projected|forecast)\b|\bby\s+(?:end\s+of\s+)?(?:fy\s*)?20\d\d\b|\bwe\s+will\s+(?:reach|hit|have)\b/i;
export const isTarget = (quote: string) => TARGET.test(quote.replace(/\s+/g, " "));

/** Ratio metrics a model may state as "58" (pct) when formulas need 0.58. Converted in code, never by the model. */
const RATIO_METRICS = /^(gross_margin|contribution_margin|take_rate|commission|margin)/;

/** Deterministic clean-up before any check: percentages to fractions where formulas need fractions. */
export function normalise(claims: ReconClaim[]): ReconClaim[] {
  return claims.map((c) =>
    c.unit === "pct" && c.value !== null && (RATIO_METRICS.test(c.metric) || c.role === "share" || c.role === "factor")
      ? { ...c, value: c.value / 100, unit: "share" }
      : c,
  );
}

/** Accounting identities applied even when the document did not lay out the inputs. */
const IDENTITIES: { metric: string; factors: string[] }[] = [{ metric: "mrr", factors: ["seats", "price.per_seat_month"] }];

function identities(claims: ReconClaim[]): ReconClaim[] {
  const extra: ReconClaim[] = [];
  for (const id of IDENTITIES) {
    if (claims.some((c) => c.metric === id.metric && c.role === "factor")) continue; // document already gave inputs
    const inputs = id.factors.map(
      (m) =>
        claims.find((c) => c.metric === m && c.role === "stated" && c.value !== null && c.origin === "form") ??
        claims.find((c) => c.metric === m && c.role === "stated" && c.value !== null),
    );
    if (inputs.every(Boolean))
      for (const i of inputs as ReconClaim[]) extra.push({ ...i, metric: id.metric, role: "factor" });
  }
  return [...claims, ...extra];
}

/** stated vs product(factors) / product(divisors), e.g. TAM = households × spend; MRR = seats × price. */
function productChecks(claims: ReconClaim[], flags: ReconFlag[], derived: Derived[]) {
  const byMetric = groupBy(claims, (c) => c.metric);
  for (const [metric, cs] of Object.entries(byMetric)) {
    if (metric.endsWith(".series") || metric.endsWith(".target")) continue;
    // inputs from ONE document (deck preferred): deck and form often both list the same inputs,
    // and multiplying both sets double-counts (Pumpwise live: ₹4.4 L × ₹4.4 L ÷ 6 ÷ 6)
    const inputsFrom = (o: "deck" | "form") => cs.filter((c) => c.origin === o && (c.role === "factor" || c.role === "divisor") && c.value !== null);
    const useOrigin = inputsFrom("deck").length >= 2 ? "deck" : "form";
    const inputs = inputsFrom(useOrigin).length >= 2 ? inputsFrom(useOrigin) : cs.filter((c) => (c.role === "factor" || c.role === "divisor") && c.value !== null);
    const factors = inputs.filter((c) => c.role === "factor");
    const divisors = inputs.filter((c) => c.role === "divisor");
    // a single input is a label, not a calculation (e.g. "2,400 payments" tagged against GMV)
    if (factors.length === 0 || factors.length + divisors.length < 2) continue;
    const computed =
      factors.reduce((p, c) => p * (c.value as number), 1) / divisors.reduce((p, c) => p * (c.value as number), 1);
    const formulaInputs =
      factors.map((c) => formatValue(c.value as number, c.unit)).join(" × ") +
      (divisors.length ? " ÷ " + divisors.map((c) => formatValue(c.value as number, c.unit)).join(" ÷ ") : "");
    const statedList = cs.filter((c) => c.role === "stated" && c.value !== null);
    const outUnit: Unit = statedList[0]?.unit ?? (factors.some((f) => f.unit === "INR") ? "INR" : "count");
    const formula = `${formulaInputs} = ${formatValue(computed, outUnit)}`;
    const ids = [...factors, ...divisors].map((c) => c.id);

    derived.push({ metric, value: computed, unit: outUnit, formula, claim_ids: ids });

    // top-down market sizing: a share of a whole market, with no bottom-up count × price
    if (metric.startsWith("market.") && factors.some((f) => f.unit === "share")) {
      flags.push({
        check: checkFor(metric),
        metric,
        stated: statedList[0]?.value ?? null,
        stated_label: statedList[0] ? label(statedList[0]) : null,
        computed,
        delta_pct: null,
        severity: "info",
        formula,
        explanation: `Top-down sizing: a percentage of a whole market. There is no bottom-up count of customers × price to check it against.`,
        claim_ids: ids,
      });
    }

    for (const s of statedList) {
      const { ok, delta } = satisfies(s, computed);
      if (ok) continue;
      const ratio = (s.value as number) / computed;
      const magnitude =
        Math.abs(Math.log10(ratio) - Math.round(Math.log10(ratio))) < 0.01 && Math.abs(Math.round(Math.log10(ratio))) >= 1
          ? ` The stated figure is ${Math.round(ratio) >= 1 ? Math.round(ratio) + "x" : "1/" + Math.round(1 / ratio)} the computed one: an order-of-magnitude arithmetic error.`
          : "";
      flags.push({
        check: checkFor(metric),
        metric,
        stated: s.value,
        stated_label: label(s),
        computed,
        delta_pct: delta,
        severity: severityOf(delta, ok),
        formula,
        explanation: `${s.origin === "deck" ? "Deck" : "Form"} states ${label(s)}; its own inputs give ${formatValue(computed, outUnit)}.${magnitude}`,
        claim_ids: [s.id, ...ids],
      });
    }
  }
}

/** Blended CAC = Σ share × channel CAC, compared with the stated blended CAC. */
function blendedCac(claims: ReconClaim[], flags: ReconFlag[], derived: Derived[]) {
  const shares = claims.filter((c) => c.metric === "cac.channel" && c.role === "share" && c.value !== null);
  const values = claims.filter((c) => c.metric === "cac.channel" && c.role === "channel_value" && c.value !== null);
  if (!shares.length || !values.length) return;
  const pairs = shares
    .map((s) => ({ s, v: values.find((v) => v.qualifier === s.qualifier) }))
    .filter((p): p is { s: ReconClaim; v: ReconClaim } => !!p.v);
  if (!pairs.length) return;
  const shareSum = pairs.reduce((a, p) => a + (p.s.value as number), 0);
  const computed = pairs.reduce((a, p) => a + (p.s.value as number) * (p.v.value as number), 0) / shareSum;
  const formula =
    pairs.map((p) => `${formatValue(p.s.value as number, "share")} × ${formatValue(p.v.value as number, "INR")}`).join(" + ") +
    ` = ${formatValue(computed, "INR")}`;
  const ids = pairs.flatMap((p) => [p.s.id, p.v.id]);
  derived.push({ metric: "cac.blended.computed", value: computed, unit: "INR", formula, claim_ids: ids });
  for (const s of claims.filter((c) => c.metric === "cac.blended" && c.role === "stated" && c.value !== null)) {
    const { ok, delta } = satisfies(s, computed);
    if (ok) continue;
    flags.push({
      check: "blended_cac",
      metric: "cac.blended",
      stated: s.value,
      stated_label: label(s),
      computed,
      delta_pct: delta,
      severity: severityOf(delta, ok),
      formula,
      explanation: `Stated blended CAC ${label(s)} does not match the channel mix (${formatValue(computed, "INR")}).`,
      claim_ids: [s.id, ...ids],
    });
  }
}

/** Payback = CAC / (monthly ARPU × gross margin), or CAC / monthly gross profit when that is what is stated. */
function payback(claims: ReconClaim[], flags: ReconFlag[], derived: Derived[]) {
  const pick = (metric: string) =>
    claims.find((c) => c.metric === metric && c.role === "stated" && c.value !== null && c.origin === "deck") ??
    claims.find((c) => c.metric === metric && c.role === "stated" && c.value !== null);
  const cac = pick("cac.blended") ?? pick("cac.per_paying_user") ?? pick("cac.per_customer") ?? pick("cac.paid");
  if (!cac) return;
  const gpAnnual = pick("gross_profit.annual");
  const gp = pick("gross_profit.monthly");
  const arpu = pick("arpu.monthly");
  const gm = pick("gross_margin");
  let computed: number;
  let formula: string;
  let ids: string[];
  if (gpAnnual && !gp) {
    computed = (cac.value as number) / ((gpAnnual.value as number) / 12);
    formula = `${formatValue(cac.value as number, "INR")} ÷ (${formatValue(gpAnnual.value as number, "INR")} ÷ 12) = ${formatValue(computed, "months")}`;
    ids = [cac.id, gpAnnual.id];
  } else if (gp) {
    computed = (cac.value as number) / (gp.value as number);
    formula = `${formatValue(cac.value as number, "INR")} ÷ ${formatValue(gp.value as number, "INR")} a month = ${formatValue(computed, "months")}`;
    ids = [cac.id, gp.id];
  } else if (arpu && gm) {
    computed = (cac.value as number) / ((arpu.value as number) * (gm.value as number));
    formula = `${formatValue(cac.value as number, "INR")} ÷ (${formatValue(arpu.value as number, "INR")} × ${formatValue(gm.value as number, "share")}) = ${formatValue(computed, "months")}`;
    ids = [cac.id, arpu.id, gm.id];
  } else return;
  derived.push({ metric: "payback.computed", value: computed, unit: "months", formula, claim_ids: ids });
  for (const s of claims.filter((c) => c.metric === "payback" && c.role === "stated" && c.value !== null)) {
    const { ok, delta } = satisfies(s, computed);
    if (ok) continue;
    flags.push({
      check: "payback",
      metric: "payback",
      stated: s.value,
      stated_label: label(s),
      computed,
      delta_pct: delta,
      severity: severityOf(delta, ok),
      formula,
      explanation: `Stated payback ${label(s)}; the founder's own CAC, ARPU and margin give ${formatValue(computed, "months")}.`,
      claim_ids: [s.id, ...ids],
    });
  }
}

/** The same metric stated differently in the deck and the form. */
/** Deck and form label periods differently ("october" vs "per_store"), so pair claims when qualifiers match,
 *  when either has none, or when each side states the metric exactly once. Chart series are never paired. */
const PERIOD = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(_?\d{2,4})?$|month|quarter|year|week|^q[1-4]|last_|since_|fy\d|20\d\d|cohort|to_date|ytd/i;
export const isPeriod = (q?: string) => !!q && PERIOD.test(q);

export function pairs(decks: ReconClaim[], forms: ReconClaim[]): [ReconClaim, ReconClaim][] {
  const out: [ReconClaim, ReconClaim][] = [];
  const single = decks.length === 1 && forms.length === 1;
  for (const d of decks)
    for (const f of forms) {
      if (d.qualifier && f.qualifier && d.qualifier !== f.qualifier && isPeriod(d.qualifier) && isPeriod(f.qualifier)) continue; // different periods
      if (single || !d.qualifier || !f.qualifier || d.qualifier === f.qualifier) out.push([d, f]);
    }
  return out;
}

/** A figure is corroborated if any statement on the other side agrees with it. */
const corroborated = (x: ReconClaim, others: ReconClaim[]) =>
  others.some((o) => {
    const exactX = (x.bound ?? "eq") === "eq" || x.bound === "approx";
    return exactX ? satisfies(o, x.value as number).ok : (o.bound ?? "eq") === "eq" || o.bound === "approx" ? satisfies(x, o.value as number).ok : false;
  });

function deckVsForm(claims: ReconClaim[], flags: ReconFlag[]) {
  const stated = claims.filter((c) => c.role === "stated" && c.value !== null && !c.metric.endsWith(".series") && !c.metric.endsWith(".target"));
  const byMetric = groupBy(stated, (c) => c.metric);
  for (const cs of Object.values(byMetric)) {
    const decks = cs.filter((c) => c.origin === "deck");
    const forms = cs.filter((c) => c.origin === "form");
    for (const [d, f] of pairs(decks, forms)) {
      // RentRoute: form states both the 1.8% fee and the 0.9% partner cut; Settlr: deck has the ₹30 Cr ask and a past ₹9 Cr round
      if (corroborated(d, forms) || corroborated(f, decks)) continue;
      {
        // check each statement against the other's number, reading bounds
        const exactD = (d.bound ?? "eq") === "eq" || d.bound === "approx";
        const exactF = (f.bound ?? "eq") === "eq" || f.bound === "approx";
        let ok: boolean;
        let delta: number | null;
        if (exactD && exactF) ({ ok, delta } = satisfies(f, d.value as number));
        else if (exactD) ({ ok, delta } = satisfies(f, d.value as number));
        else if (exactF) ({ ok, delta } = satisfies(d, f.value as number));
        else continue; // two bounds: cannot compare deterministically
        if (ok) continue;
        flags.push({
          check: "deck_vs_form",
          metric: d.metric,
          stated: d.value,
          stated_label: `deck ${label(d)}, form ${label(f)}`,
          computed: f.value,
          delta_pct: delta,
          severity: delta === null ? "red" : severityOf(delta, ok),
          formula: `deck ${label(d)} vs form ${label(f)}`,
          explanation: `The deck and the form disagree on ${d.metric.replace(/[._]/g, " ")}${d.qualifier ? ` (${d.qualifier})` : ""}: deck says ${label(d)}, form says ${label(f)}.`,
          claim_ids: [d.id, f.id],
        });
      }
    }
  }
}

/** Numbers the founder says were never measured, and numbers the deck leaves out. */
function gaps(claims: ReconClaim[], flags: ReconFlag[]) {
  for (const c of claims.filter((c) => c.status === "not_measured")) {
    flags.push({
      check: checkFor(c.metric),
      metric: c.metric,
      stated: null,
      stated_label: "not measured",
      computed: null,
      delta_pct: null,
      severity: "warn",
      formula: "n/a",
      explanation: `The founder says ${c.metric.replace(/[._]/g, " ")} has not been measured. A missing number lowers the score (R4).`,
      claim_ids: [c.id],
    });
  }
  for (const metric of EXPECTED_IN_DECK) {
    const inDeck = claims.some((c) => c.metric === metric && c.origin === "deck" && c.value !== null);
    const inForm = claims.find((c) => c.metric === metric && c.origin === "form" && c.value !== null);
    if (!inDeck && inForm)
      flags.push({
        check: "deck_vs_form",
        metric,
        stated: null,
        stated_label: "missing from deck",
        computed: inForm.value,
        delta_pct: null,
        severity: "info",
        formula: `deck: none; form: ${label(inForm)}`,
        explanation: `The deck does not state ${metric.replace(/[._]/g, " ")}; only the form does (${label(inForm)}).`,
        claim_ids: [inForm.id],
      });
  }
}

/** Top-down sizing stated in words ("Even 1% of this market…", "Capturing just 1%…"), even if not split into factors. */
const TOP_DOWN = /\b\d+(?:\.\d+)?\s*%\s+of\s+(?:this|the|that)\s+(?:market|opportunity)|\bcaptur\w*\s+(?:just\s+|only\s+)?\d+(?:\.\d+)?\s*%/i;

function topDownText(claims: ReconClaim[], flags: ReconFlag[]) {
  if (flags.some((f) => f.metric.startsWith("market.") && /Top-down/.test(f.explanation))) return;
  const hit = claims.find((c) => c.metric.startsWith("market.") && TOP_DOWN.test(c.text ?? ""));
  if (!hit) return;
  flags.push({
    check: "tam",
    metric: "market.tam",
    stated: hit.value,
    stated_label: hit.value !== null ? formatValue(hit.value, hit.unit) : null,
    computed: null,
    delta_pct: null,
    severity: "info",
    formula: "share of a whole market",
    explanation: "Top-down sizing: a percentage of a whole market. There is no bottom-up count of customers × price to check it against.",
    claim_ids: [hit.id],
  });
}

const dedupe = (flags: ReconFlag[]) => {
  const seen = new Set<string>();
  return flags.filter((f) => {
    const k = `${f.check}|${f.metric}|${f.stated}|${f.computed}|${f.formula}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
};

export function reconcile(input: ReconClaim[]): ReconResult {
  const claims = identities(normalise(input));
  const flags: ReconFlag[] = [];
  const derived: Derived[] = [];
  productChecks(claims, flags, derived);
  blendedCac(claims, flags, derived);
  payback(claims, flags, derived);
  deckVsForm(claims, flags);
  gaps(claims, flags);
  topDownText(claims, flags);
  return { flags: dedupe(flags), derived };
}
