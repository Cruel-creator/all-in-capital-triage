import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  actionOf, bucketOf, confidenceOf, coverage, lensFor, lensWeights, MISSING, topRules, weighted, writtenFit, type CritScore, type Criterion,
} from "../src/lib/scoring/rank";

const rubric = JSON.parse(readFileSync(join(process.cwd(), "config", "rubric.v1.json"), "utf8"));
const thesis = JSON.parse(readFileSync(join(process.cwd(), "config", "thesis.v1.json"), "utf8"));
const base = Object.fromEntries(Object.entries(rubric.criteria).map(([k, v]) => [k, (v as { weight: number }).weight])) as Record<Criterion, number>;
const noGates = { G1: false, G2: false, G3: false, G4: false };
const s = (criterion: Criterion, score: number, confidence: CritScore["confidence"] = "med", rules: string[] = []): CritScore => ({ criterion, score, confidence, rules });

test("rubric weights sum to 100%", () => {
  assert.ok(Math.abs(Object.values(base).reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test("consumer-brand lens multiplies C3 and C4 by 1.5, then renormalises", () => {
  const w = lensWeights(base, rubric.lenses.consumer_brand);
  assert.ok(Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  // C3: 0.2*1.5 = 0.3, C4: 0.15*1.5 = 0.225, total = 1.175
  assert.ok(Math.abs(w.C3 - 0.3 / 1.175) < 1e-9);
  assert.ok(w.C3 > base.C3 && w.C1 < base.C1);
});

test("deeptech lens boosts C2 and C6; B2B SaaS has no lens", () => {
  const w = lensWeights(base, rubric.lenses.deeptech);
  assert.ok(w.C2 > base.C2 && w.C6 > base.C6);
  assert.deepEqual(lensWeights(base, null), base);
  assert.equal(lensFor("deeptech", rubric.sector_lens_map), "deeptech");
  assert.equal(lensFor("b2b saas", rubric.sector_lens_map), null);
});

test("weighted score, subtotals, and a missing criterion counts as 2/10 (R4)", () => {
  const all = (["C1", "C2", "C3", "C4", "C5", "C6"] as Criterion[]).map((c) => s(c, 8));
  assert.equal(weighted(all, base), 8);
  const missingC3 = all.filter((x) => x.criterion !== "C3");
  assert.equal(weighted(missingC3, base), 8 - 0.2 * (8 - MISSING.score)); // 6.8
  assert.equal(weighted(all, base, ["C1", "C2", "C4"]), 8);
});

test("coverage counts criteria at Med or higher", () => {
  assert.equal(coverage([s("C1", 7, "high"), s("C2", 7, "med"), s("C3", 7, "low"), s("C4", 7, "low"), s("C5", 7, "low"), s("C6", 7, "low")]), 33);
});

test("buckets: G1 → outside mandate; other gates or outside written thesis → flagged; else clear", () => {
  assert.equal(bucketOf({ ...noGates, G1: true }, "in"), "outside_mandate");
  assert.equal(bucketOf({ ...noGates, G3: true }, "in"), "flagged");
  assert.equal(bucketOf(noGates, "outside"), "flagged"); // CareCorner: healthcare scored normally, flagged for Kushal
  assert.equal(bucketOf(noGates, "stretch"), "clear");
});

test("recommendation thresholds and the take-the-call conditions", () => {
  const strong = (["C1", "C2", "C3", "C4", "C5", "C6"] as Criterion[]).map((c) => s(c, 8, "med"));
  assert.equal(actionOf(7.5, noGates, strong), "take_call");
  assert.equal(actionOf(7.5, { ...noGates, G3: true }, strong), "dig"); // a red gate blocks take-the-call
  const weakC1 = strong.map((x) => (x.criterion === "C1" ? { ...x, confidence: "low" as const } : x));
  assert.equal(actionOf(8.2, noGates, weakC1), "dig"); // Low confidence on C1-C3 blocks take-the-call
  assert.equal(actionOf(6.0, noGates, strong), "dig");
  assert.equal(actionOf(5.99, noGates, strong), "pass");
});

test("top rules are weighted by criterion weight", () => {
  const r = topRules([s("C1", 7, "med", ["R7", "R1"]), s("C2", 7, "med", ["R1"]), s("C5", 7, "med", ["R5"])], base);
  assert.deepEqual(r, ["R1", "R7", "R5"]);
});

test("written thesis fit: in / stretch / outside", () => {
  const sectors = thesis.written.sectors;
  assert.equal(writtenFit("consumer brand", sectors), "in");
  assert.equal(writtenFit("lending fintech", sectors), "in");
  assert.equal(writtenFit("b2b saas", sectors), "stretch"); // Talkbook: labelled consumer tech, actually B2B SaaS
  assert.equal(writtenFit("healthcare", sectors), "outside");
});

test("confidence is decided in code from where evidence came from", () => {
  assert.equal(confidenceOf([]), "low");
  assert.equal(confidenceOf([{ origin: "deck", contested: false }]), "low"); // deck only
  assert.equal(confidenceOf([{ origin: "deck", contested: false }, { origin: "form", contested: false }]), "med");
  assert.equal(confidenceOf([{ origin: "deck", contested: true }, { origin: "form", contested: true }]), "low"); // contradicted
  assert.equal(confidenceOf([{ origin: "research", contested: false }]), "high");
});
