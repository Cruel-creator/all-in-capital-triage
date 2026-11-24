import { test } from "node:test";
import assert from "node:assert/strict";
import { callFor, callKind, firstSentence, ratingWord, takeFor } from "../src/lib/take";

const CRIT = { C1: 8, C2: 5, C3: 7, C4: 6, C5: 7, C6: 4 };

test("three decisions: a clear yes, a clear no, or Riya's call", () => {
  assert.equal(callKind({ action: "take_call", bucket: "clear" }), "yes");
  assert.equal(callKind({ action: "pass", bucket: "clear" }), "no");
  assert.equal(callKind({ action: "take_call", bucket: "outside_mandate" }), "no"); // outside the mandate is a clear no
  assert.equal(callKind({ action: "dig", bucket: "clear" }), "your_call");
  assert.equal(callKind({ action: "take_call", bucket: "flagged" }), "your_call"); // strong, but a fund rule tripped
  assert.equal(callKind({ action: null, bucket: null }), "reading");
});

test("a near-miss pass (Mixed, 4.5 to 6) is Riya's call; a Thin one is a clear no", () => {
  assert.equal(callKind({ action: "pass", bucket: "clear", total: 5.5 }), "your_call");
  assert.equal(callKind({ action: "pass", bucket: "flagged", total: 4.8 }), "your_call");
  assert.equal(callKind({ action: "pass", bucket: "clear", total: 4.2 }), "no");
  assert.equal(callKind({ action: "pass", bucket: "outside_mandate", total: 5.5 }), "no"); // outside the mandate stays a no
  const near = callFor({ action: "pass", bucket: "clear", gates: [], crit: CRIT, total: 5.5, wouldChange: "A specific why-now catalyst. More." });
  assert.equal(near.kind, "your_call");
  assert.equal(near.lean, "no");
  assert.match(near.leanWhy!, /Just under the bar: founder-market fit is a real strength, but why now is the weak spot/);
  assert.match(near.toYes!, /A specific why-now catalyst\./);
});

test("a clear yes or no says whether to give it time, with the reason", () => {
  const yes = callFor({ action: "take_call", bucket: "clear", gates: [], crit: CRIT, total: 8 });
  assert.equal(yes.headline, "Yes: give it 30 minutes.");
  assert.match(yes.why, /Strongest on founder-market fit/);
  const no = callFor({ action: "pass", bucket: "clear", gates: [], crit: CRIT, total: 4.2 });
  assert.equal(no.headline, "No: don't spend time on it.");
  assert.match(no.why, /Falls short on why now/);
  assert.equal(no.lean, undefined);
});

test("in the gray area the AI leans one way and says what would tip it", () => {
  const nearYes = callFor({ action: "dig", bucket: "clear", gates: [], crit: CRIT, total: 7.1, askFirst: "What share of revenue repeats? More text." });
  assert.equal(nearYes.kind, "your_call");
  assert.equal(nearYes.lean, "yes");
  assert.match(nearYes.toYes!, /What share of revenue repeats\?/);
  assert.match(nearYes.toNo!, /why now doesn't hold up/);
  const nearNo = callFor({ action: "dig", bucket: "clear", gates: [], crit: CRIT, total: 6.2 });
  assert.equal(nearNo.lean, "no");
  const flagged = callFor({ action: "take_call", bucket: "flagged", gates: ["G3"], crit: CRIT, total: 8, gateNames: ["Portfolio conflict"] });
  assert.equal(flagged.lean, "yes");
  assert.match(flagged.leanWhy!, /portfolio conflict needs your judgement/);
});

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
