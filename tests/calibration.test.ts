import { test } from "node:test";
import assert from "node:assert/strict";
import { confusion, memoFacts, predictionOf, redactPeople, sectorKey } from "../src/lib/calibration";
import { redactFounders } from "../src/lib/corrections";

const CHUNKS = [
  { section: "What it does", text: "SuperK (invested). What it does. A tech-enabled grocery network for small towns. SuperK rebrands existing stores." },
  { section: "Founder assessment", text: "SuperK (invested). Founder assessment. Anil Thontepu and Neeraj Menta. Thontepu came from growth work; Menta ran supply chains." },
  { section: "Risks and open questions", text: "SuperK (invested). Risks and open questions. Thin margins. This is why we invested early." },
  { section: "Why we invested", text: "SuperK (invested). Why we invested. Founder behaviour decided it." },
];

test("memo facts hide the outcome, the why section, names and the company", () => {
  const f = memoFacts("SuperK", CHUNKS);
  const all = f.map((x) => x.text).join(" ");
  assert.ok(!/invested|passed/i.test(all), all);
  assert.ok(!/Founder behaviour decided/.test(all));
  assert.ok(!/Thontepu|Menta|Anil|Neeraj/.test(all), all);
  assert.ok(!/SuperK/.test(all), all);
  assert.match(all, /Founder A came from growth work; Founder B ran supply chains/);
  assert.equal(f[0].id, "s01");
});

test("people redaction keeps non-name words", () => {
  assert.deepEqual(redactPeople(["Anika Rao, solo founder. Rao ran brand teams."]), ["Founder A, solo founder. Founder A ran brand teams."]);
});

test("confusion matrix and agreement are computed in code", () => {
  const c = confusion([
    { predicted: "invest", actual: "invested" },
    { predicted: "pass", actual: "passed" },
    { predicted: "pass", actual: "invested" },
    { predicted: "invest", actual: "passed" },
  ]);
  assert.equal(c.agree, 2);
  assert.equal(c.agreement_pct, 50);
  assert.equal(c.pass_invested, 1);
  assert.equal(predictionOf("dig"), "pass");
});

test("memo sectors map to rubric lenses", () => {
  assert.equal(sectorKey("Deeptech (drone delivery)"), "deeptech");
  assert.equal(sectorKey("Fintech (student credit)"), "lending fintech");
  assert.equal(sectorKey("Consumer brand (D2C beauty)"), "consumer brand");
});

test("correction reasons lose the corrected company's founder names", () => {
  assert.equal(redactFounders("Ravi Kumar has no repeat data; Ravi says it is coming", ["Ravi Kumar"]), "the founder has no repeat data; the founder says it is coming");
});

test("rank agreement: share of invested-vs-passed pairs ordered correctly", async () => {
  const { rankAgreement } = await import("../src/lib/calibration");
  const r = rankAgreement([
    { total: 5, actual: "invested" }, { total: 4, actual: "invested" },
    { total: 3, actual: "passed" }, { total: 4, actual: "passed" },
  ]);
  assert.equal(r.pairs, 4);
  assert.equal(r.wins, 3.5); // 5>3, 5>4, 4>3, 4=4 (half)
  assert.equal(r.lowestInvested, 4);
  assert.equal(r.highestPassed, 4);
});

test("rubric edits: weights normalise to 100%, thresholds validated", async () => {
  const { normaliseWeights, rubricProblems } = await import("../src/lib/rubric-edit");
  const w = normaliseWeights({ C1: 20, C2: 20, C3: 20, C4: 20, C5: 10, C6: 10 });
  assert.equal(Math.round(Object.values(w).reduce((a, x) => a + x, 0) * 1000), 1000);
  assert.equal(w.C1, 0.2);
  const ok = { weights: w, call: 7.5, dig: 6, lensMultipliers: { deeptech: 1.5 }, anchors: { C1: { "0-3": "x" } } };
  assert.deepEqual(rubricProblems(ok), []);
  assert.ok(rubricProblems({ ...ok, dig: 8 }).some((p) => /below the call/.test(p)));
  assert.ok(rubricProblems({ ...ok, lensMultipliers: { deeptech: 5 } }).length > 0);
});

test("a correction applies to its own criterion at 0.6, to others only at 0.72", async () => {
  const { appliesTo } = await import("../src/lib/corrections");
  assert.equal(appliesTo("C2", { criterion: "C2", similarity: 0.63 }), true);
  assert.equal(appliesTo("C1", { criterion: "C2", similarity: 0.66 }), false);
  assert.equal(appliesTo("C1", { criterion: "C2", similarity: 0.75 }), true);
});
