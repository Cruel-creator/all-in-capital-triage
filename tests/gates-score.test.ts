import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { g1 } from "../src/lib/pipeline/gates";
import { uncitedSentences, validateScore } from "../src/lib/pipeline/score";
import { founderPageMatches, isPlaceholder, isSocial, sourceType, windowAround } from "../src/lib/research/sources";
import { NO_COMPETITORS, employerHint, planQueries } from "../src/lib/research/queries";

const rubric = JSON.parse(readFileSync(join(process.cwd(), "config", "rubric.v1.json"), "utf8"));
const P = rubric.gates.G1.params;

test("G1 trips for Settlr: Series A, ₹30 Cr raise, ₹180 Cr post, existing institutional seed", () => {
  const r = g1({ stage: "Series A", raise: 30e7, postMoney: 180e7, existingInvestors: "INR 9 Cr seed round in 2024, led by two institutional funds." }, P);
  assert.equal(r.tripped, true);
  assert.equal(r.reasons.length, 4);
});

test("G1 stays clear for a normal pre-seed round (GrainKind: ₹2.5 Cr at ₹14 Cr, angels only)", () => {
  const r = g1({ stage: "Pre-seed", raise: 2.5e7, postMoney: 14e7, existingInvestors: "Three angels from the food and retail industry, INR 45 L in total." }, P);
  assert.equal(r.tripped, false);
  // an incubator grant and angels are not institutional (Pumpwise)
  assert.equal(g1({ stage: "Pre-seed", raise: 2.2e7, postMoney: 11e7, existingInvestors: "INR 30 L: a INR 10 L incubator grant and two angels (INR 20 L)." }, P).tripped, false);
});

test("a rationale sentence that states a number must cite an ID", () => {
  assert.deepEqual(uncitedSentences("Repeat rose from 31% to 38% [f06, f07]. The team is strong."), []);
  assert.equal(uncitedSentences("Repeat rose from 31% to 38%. Fine [d01].").length, 1);
  assert.deepEqual(uncitedSentences("Under R4 the missing number counts against C3 [f04]."), []); // rule and criterion IDs are not facts
  // live CAPilot case: a check name next to real IDs still counts as cited
  assert.deepEqual(uncitedSentences("Customer count conflicts between 24 and 31 firms [d06, f04, blended_cac/cac.blended]."), []);
});

test("validateScore rejects unknown IDs and uncited claims, accepts a named gap", () => {
  const cites = new Map([["d01", { id: "d01" }], ["f02", { id: "f02" }]]) as never;
  const base = { score: 6, rationale: "Paying teams grew to 16 [d01].", claims_used: ["d01"], rules_applied: ["R4"], precedent_memo: null, precedent_note: null, gap: null, question_for_call: null };
  assert.equal(validateScore(base, { cites }), null);
  assert.match(validateScore({ ...base, claims_used: ["d99"] }, { cites }) ?? "", /unknown/);
  assert.match(validateScore({ ...base, claims_used: [], rationale: "No evidence." }, { cites }) ?? "", /no claims cited/);
  assert.equal(validateScore({ ...base, claims_used: [], rationale: "No evidence for this criterion.", gap: "No retention data", score: 2 }, { cites }), null);
  assert.match(validateScore({ ...base, rules_applied: ["rule 4"] }, { cites }) ?? "", /R1-R9/);
});

test("research: placeholder sites are never fetched; sources are classified", () => {
  assert.equal(isPlaceholder("www.grainkind.example"), true);
  assert.equal(isPlaceholder("linkedin.com/in/ritu-hegde-example"), true);
  assert.equal(isPlaceholder("inc42.com"), false);
  assert.equal(sourceType("https://www.zaubacorp.com/company/X"), "aggregator");
  assert.equal(sourceType("https://www.mca.gov.in/x"), "primary");
  assert.equal(sourceType("https://inc42.com/buzz/x"), "secondary");
});

test("research: excerpts are a window around the subject, never the whole page", () => {
  const page = Array.from({ length: 40 }, (_, i) => (i === 20 ? "GrainKind raised a seed round from angels." : `Unrelated paragraph ${i} ${"x".repeat(200)}`)).join("\n\n");
  const w = windowAround(page, ["GrainKind"]);
  assert.ok(w.includes("GrainKind raised"));
  assert.ok(w.length <= 2000);
});

test("research: query plan covers founders, company, registry and a competitor check", () => {
  const plan = planQueries({
    company: "RentRoute", legal_name: "RentRoute Technologies Pvt. Ltd.", location: "Bengaluru, Karnataka", one_liner: "App to pay rent by credit card.",
    founders: [{ id: "f1", full_name: "Sameer Qureshi", role_title: "CEO", background: "Product manager at a fintech for 4 years" }],
    claims_no_competitors: NO_COMPETITORS.test("We have no direct competitors."),
  });
  const purposes = plan.map((p) => p.purpose);
  for (const p of ["company", "company_news", "registry", "founder_company", "founder_history", "founder_talks", "competitors_claim_check"]) assert.ok(purposes.includes(p), p);
  assert.equal(employerHint("6 years in category and brand roles at a large packaged-food company"), "packaged-food");
  // live RentRoute bug: "at a fintech for 4 years" produced the query '"Sameer Qureshi" CEO a'
  assert.equal(employerHint("Product manager at a fintech for 4 years; launched two payments features."), "fintech");
  assert.equal(plan[0].purpose, "competitors_claim_check"); // competitor check gets the scrape budget first
});

test("research: a same-name founder page that never names the company is not the founder", () => {
  assert.equal(founderPageMatches("Sameer Qureshi, USC Marshall MBA '27, investment banking, fashion startup founder.", "RentRoute"), false);
  assert.equal(founderPageMatches("RentRoute co-founder Sameer Qureshi on rent payments by card", "RentRoute"), true);
  assert.equal(isSocial("https://www.instagram.com/popular/x/"), true);
  assert.equal(isSocial("https://inc42.com/x"), false);
});
