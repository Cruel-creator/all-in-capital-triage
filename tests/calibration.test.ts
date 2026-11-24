import { test } from "node:test";
import assert from "node:assert/strict";
import { checkArgument, confusion, memoFacts, plainArgument, predictionOf, redactPeople, sectorKey } from "../src/lib/calibration";

test("plainArgument drops inline citations and tidies punctuation", () => {
  assert.equal(plainArgument("Capital intensity will overwhelm the cheque [s08]. Founders are credible [s04, why]."), "Capital intensity will overwhelm the cheque. Founders are credible.");
  assert.equal(plainArgument("No brackets here."), "No brackets here.");
});

test("checkArgument keeps disagreement notes short, plain and sourced", () => {
  const known = new Set(["s01", "s02", "why"]);
  const ok = { fund_was_wrong: "Neither founder has shipped a certified aircraft.", fund_sources: ["s01"], system_was_wrong: "The fund backed people who set clear technical milestones.", system_sources: ["why"] };
  assert.equal(checkArgument(ok, known), null);
  assert.match(checkArgument({ ...ok, fund_was_wrong: "Neither founder shipped an aircraft [s01]." }, known)!, /brackets/);
  assert.match(checkArgument({ ...ok, system_was_wrong: "The system overlooked founder quality." }, known)!, /overlooked/);
  assert.match(checkArgument({ ...ok, fund_was_wrong: "One sentence here. And another one." }, known)!, /one sentence/);
  assert.match(checkArgument({ ...ok, fund_was_wrong: "word ".repeat(30).trim() + "." }, known)!, /at most 20 words/);
  assert.match(checkArgument({ ...ok, fund_sources: [] }, known)!, /at least one/);
  assert.match(checkArgument({ ...ok, system_sources: ["s99"] }, known)!, /s99/);
});
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

test("correction reasons also lose emails and phone numbers", () => {
  const out = redactFounders("Ask ravi@acme.in or call 98765 43210 about repeat data", []);
  assert.ok(!/@|98765/.test(out), out);
});

test("unknown sector is never in-thesis; zero-weight group gives 0, not NaN", async () => {
  const { writtenFit, weighted } = await import("../src/lib/scoring/rank");
  assert.equal(writtenFit("", { in: ["fintech"], stretch: [], outside: ["healthcare"] }), "stretch");
  const w = { C1: 0, C2: 0, C3: 0.5, C4: 0, C5: 0.25, C6: 0.25 } as const;
  assert.equal(weighted([{ criterion: "C1", score: 5, confidence: "med", rules: [] }], w, ["C1", "C2", "C4"]), 0);
});

test("only public http(s) URLs are scraped", async () => {
  const { isSafeUrl } = await import("../src/lib/research/sources");
  assert.equal(isSafeUrl("https://example.com/about"), true);
  for (const u of ["file:///etc/passwd", "http://localhost:3000", "http://127.0.0.1", "http://192.168.1.4/x", "http://10.0.0.1", "http://169.254.169.254/latest", "http://intranet"]) assert.equal(isSafeUrl(u), false, u);
});

test("queue retries back off 30s, 2 min, 8 min", async () => {
  const { backoffSeconds, MAX_ATTEMPTS } = await import("../src/lib/queue");
  assert.deepEqual([1, 2, 3].map(backoffSeconds), [30, 120, 480]);
  assert.equal(MAX_ATTEMPTS, 3);
});

test("G1 names an unreadable raise amount instead of passing silently", async () => {
  const { g1 } = await import("../src/lib/pipeline/gates");
  const p = { allowed_stages: ["pre-seed", "seed"], max_raise_inr: 1e8, max_post_money_inr: 4e8, prior_institutional_pattern: "institutional" };
  const clean = g1({ stage: "Pre-seed", raise: 2e7, postMoney: 1.2e8, existingInvestors: null, raiseRaw: "INR 2 Cr", postMoneyRaw: "INR 12 Cr" }, p);
  assert.equal(clean.tripped, false);
  const odd = g1({ stage: "Pre-seed", raise: null, postMoney: 1.2e8, existingInvestors: null, raiseRaw: "between two and three crore", postMoneyRaw: "INR 12 Cr" }, p);
  assert.equal(odd.tripped, true);
  assert.match(odd.reasons[0], /Couldn't read the raise amount/);
  assert.equal(g1({ stage: "Pre-seed", raise: null, postMoney: null, existingInvestors: null }, p).tripped, false); // absent is not unreadable
});
