// Regressions from the first live extraction run (2026-11-20). Each case is a shape the model actually produced.
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcile, pairs, isTarget } from "../src/lib/reconcile/reconcile";
import { credentialCheck } from "../src/lib/reconcile/credentials";
import { notMeasured, topDownPages, missingMultipliers } from "../src/lib/pipeline/reconcile-step";
import type { ReconClaim } from "../src/lib/reconcile/types";

const c = (id: string, metric: string, role: ReconClaim["role"], value: number | null, unit: ReconClaim["unit"], origin: "deck" | "form", extra: Partial<ReconClaim> = {}): ReconClaim => ({
  id, metric, role, value, unit, origin, ...extra,
});

test("gross margin given as pct (58) is converted to 0.58 before payback; no false red", () => {
  // Talkbook live: gross_margin 70 pct gave '₹48,000 ÷ (₹13,000 × 7000%) = 0.1 months'
  const { flags, derived } = reconcile([
    c("a", "cac.blended", "stated", 48_000, "INR", "deck"),
    c("b", "arpu.monthly", "stated", 13_000, "INR", "deck"),
    c("g", "gross_margin", "stated", 70, "pct", "deck"),
    c("p", "payback", "stated", 5, "months", "deck", { bound: "approx" }),
  ]);
  assert.ok(Math.abs(derived.find((d) => d.metric === "payback.computed")!.value - 5.27) < 0.01);
  assert.equal(flags.filter((f) => f.check === "payback").length, 0);
});

test("a single factor is a label, not a calculation (RentRoute '2,400 = ₹2,400')", () => {
  const { flags } = reconcile([
    c("s", "gmv", "stated", 6.1e7, "INR", "deck"),
    c("f", "gmv", "factor", 2_400, "count", "deck", { qualifier: "transactions" }),
  ]);
  assert.equal(flags.length, 0);
});

test("deck and form with different free-text qualifiers still get compared", () => {
  // StockSathi live: deck qualifier 'october', form 'per_store'; Yatrika: '7_months' vs null
  const { flags } = reconcile([
    c("d", "cac.blended", "stated", 2_860, "INR", "deck", { qualifier: "october" }),
    c("f", "cac.blended", "stated", 2_000, "INR", "form", { qualifier: "per_store", bound: "lt" }),
  ]);
  assert.ok(flags.some((x) => x.check === "deck_vs_form" && x.severity === "red"));
  // but month-by-month series with mismatched months are not paired
  assert.equal(pairs([c("1", "m", "stated", 1, "INR", "deck", { qualifier: "jul" }), c("2", "m", "stated", 2, "INR", "deck", { qualifier: "aug" })], [c("3", "m", "stated", 3, "INR", "form", { qualifier: "oct" })]).length, 0);
});

test("chart series are never compared with headline figures", () => {
  const { flags } = reconcile([
    c("s1", "mrr.series", "stated", 40_000, "INR", "deck", { qualifier: "jul" }),
    c("h", "mrr", "stated", 2.1e5, "INR", "deck"),
    c("f", "mrr", "stated", 2.1e5, "INR", "form"),
  ]);
  assert.equal(flags.length, 0);
});

test("MRR identity: seats × price per seat is checked even if the deck never lays it out (Talkbook)", () => {
  const { flags } = reconcile([
    c("d", "mrr", "stated", 2.1e5, "INR", "deck"),
    c("f", "mrr", "stated", 1.9e5, "INR", "form"),
    c("s", "seats", "stated", 340, "count", "form"),
    c("p", "price.per_seat_month", "stated", 500, "INR", "form"),
  ]);
  const mrr = flags.filter((x) => x.check === "mrr");
  assert.equal(mrr.length, 2);
  assert.ok(mrr.every((x) => x.computed === 1.7e5));
});

test("payback accepts the CAC under any of its names (Settlr: cac.per_paying_user)", () => {
  const { flags } = reconcile([
    c("a", "cac.per_paying_user", "stated", 14_500, "INR", "deck"),
    c("b", "arpu.monthly", "stated", 6_800, "INR", "deck"),
    c("g", "gross_margin", "stated", 58, "pct", "deck"),
    c("p", "payback", "stated", 7, "months", "deck"),
  ]);
  assert.ok(flags.some((x) => x.check === "payback" && x.severity === "red"));
});

test("top-down sizing is detected from the quote even without factors (CAPilot, RentRoute)", () => {
  const { flags } = reconcile([c("t", "market.som", "stated", 1_400e7, "INR", "deck", { text: "Even 1% of this market is a INR 1,400 Cr opportunity for CAPilot." })]);
  assert.ok(flags.some((x) => x.metric === "market.tam" && x.severity === "info" && /Top-down/.test(x.explanation)));
  const rr = reconcile([c("t", "market.tam", "stated", 1_500e7, "INR", "deck", { text: "Capturing just 1% would mean INR 1,500 Cr of annual rent volume." })]);
  assert.ok(rr.flags.some((x) => /Top-down/.test(x.explanation)));
});

test("'We have not measured …' is read from the page, not left to the model", () => {
  const g = notMeasured([{ page_no: 1, text: "Mostly the founders' network and referrals from other CAs. We have\nnot measured acquisition cost yet." }]);
  assert.equal(g.length, 1);
  assert.equal(g[0].metric, "cac.blended");
  const rr = notMeasured([{ page_no: 1, text: "about INR 120 per registered user. We have not measured cost per paying user." }]);
  assert.equal(rr[0].metric, "cac.per_paying_user");
});

test("deck and form listing the same inputs are not multiplied twice (Pumpwise)", () => {
  const { flags, derived } = reconcile([
    c("s", "cac.blended", "stated", 73_000, "INR", "deck"),
    c("f1", "cac.blended", "factor", 4.4e5, "INR", "deck"),
    c("d1", "cac.blended", "divisor", 6, "count", "deck"),
    c("f2", "cac.blended", "factor", 4.4e5, "INR", "form"),
    c("d2", "cac.blended", "divisor", 6, "count", "form"),
  ]);
  assert.ok(Math.abs(derived.find((d) => d.metric === "cac.blended")!.value - 73_333) < 1);
  assert.equal(flags.length, 0);
});

test("targets are not actuals (Talkbook 'In 12 months: 80 paying teams and INR 12 L MRR')", () => {
  assert.equal(isTarget("In 12 months: 80 paying teams and INR 12 L monthly recurring revenue."), true);
  assert.equal(isTarget("In just 7 months we have served thousands of travellers"), false);
  assert.equal(isTarget("SOM INR 28.8 Cr In 3 years: 1.5% of SAM households"), false);
  const { flags } = reconcile([
    c("t", "mrr.target", "stated", 12e5, "INR", "deck"),
    c("f", "mrr", "stated", 1.9e5, "INR", "form"),
  ]);
  assert.equal(flags.length, 0);
});

test("top-down sizing is found on the page even when the model skipped the sentence (RentRoute)", () => {
  const td = topDownPages([{ page_no: 5, text: "INR 1.5 lakh Cr\nannual urban rent paid in India\nCapturing just 1% would mean INR 1,500 Cr\nof annual rent volume." }]);
  assert.equal(td?.page_no, 5);
  assert.match(td!.quote, /Capturing just 1%/);
});

test("a 'x 12' dropped by the model is restored from the page formula (StockSathi TAM)", () => {
  const page = "Market size: how we got there StockSathi 6 TAM INR 17 lakh Cr 12M kirana stores x INR 1.2 L monthly purchases x 12 SAM INR 64,800 Cr ~450K stores";
  assert.deepEqual(missingMultipliers("TAM INR 17 lakh Cr", page, [12e6, 1.2e5]), [12]);
  // SOM line mentions "SAM" inside itself; the multiplier after it must still be found
  const som = "SOM INR 518 Cr In 3 years: 2% of SAM stores (9,000) x 40% of their purchases (INR 48K a month) x 12 Assumptions: INR 1.2 L";
  assert.deepEqual(missingMultipliers("SOM INR 518 Cr", som, [9_000, 48_000]), [12]);
  // GrainKind's "x INR 2,400" is a priced input, not a plain multiplier, and is never re-added
  assert.deepEqual(missingMultipliers("TAM INR 91,200 Cr", "TAM INR 91,200 Cr 38M urban households x INR 2,400 a year SAM", [38e6, 2_400]), []);
  // Pumpwise "x 60 sensors" is already a factor
  assert.deepEqual(missingMultipliers("TAM INR 16,200 Cr", "TAM INR 16,200 Cr ~300K MSMEs x 60 sensors x INR 9,000 a year SAM", [3e5, 60, 9_000]), []);
});

test("a deck figure corroborated by any form figure is not a contradiction (RentRoute take rate, Settlr raise)", () => {
  const rr = reconcile([
    c("d", "take_rate", "stated", 0.018, "share", "deck"),
    c("f1", "take_rate", "stated", 0.018, "share", "form"),
    c("f2", "take_rate", "stated", 0.009, "share", "form"),
  ]);
  assert.equal(rr.flags.length, 0);
  const st = reconcile([
    c("d1", "raise.amount", "stated", 30e7, "INR", "deck"),
    c("d2", "raise.amount", "stated", 9e7, "INR", "deck"),
    c("f", "raise.amount", "stated", 30e7, "INR", "form"),
  ]);
  assert.equal(st.flags.length, 0);
});

test("different periods are never compared (StockSathi GMV October vs last three months)", () => {
  const { flags } = reconcile([
    c("d", "gmv", "stated", 3.8e5, "INR", "deck", { qualifier: "october" }),
    c("f", "gmv", "stated", 9e5, "INR", "form", { qualifier: "last_three_months", bound: "approx" }),
  ]);
  assert.equal(flags.length, 0);
});

test("sentence-initial verbs are not mistaken for employers (CareCorner 'Designs the clinical protocols')", () => {
  const f = credentialCheck(
    { id: "d", text: "MBBS, 8 years in family medicine. Designs the clinical protocols." },
    { id: "f", text: "Dr. Lakshmi Reddy, CEO. MBBS, 8 years in family medicine." },
  );
  assert.equal(f, null);
});
