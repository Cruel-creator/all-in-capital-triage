import { test } from "node:test";
import assert from "node:assert/strict";
import { firstSentence, ratingWord, takeFor } from "../src/lib/take";

test("scores become words at the recommendation cut-offs", () => {
  assert.equal(ratingWord(8).word, "Strong");
  assert.equal(ratingWord(7.5).word, "Strong");
  assert.equal(ratingWord(6.2).word, "Promising");
  assert.equal(ratingWord(5).word, "Mixed");
  assert.equal(ratingWord(2).word, "Thin");
  assert.equal(ratingWord(null).word, "Unscored");
});

test("first sentence drops citations", () => {
  assert.equal(firstSentence("Retention rose to 38% [d07, f12]. Second sentence."), "Retention rose to 38%.");
});

test("take names strongest and thinnest areas and flags Kushal", () => {
  const t = takeFor({ action: "dig", bucket: "flagged", gates: ["G3"], crit: { C1: 6, C3: 7, C6: 3 } });
  assert.equal(t.verdict, "Interesting, but we'd want answers first. Check the flagged rule first.");
  assert.equal(t.line, "Strongest on customer pull; thinnest on why now.");
  assert.equal(takeFor({ action: "pass", bucket: "outside_mandate", gates: ["G1"], crit: {} }).verdict, "Outside what we invest in.");
});
