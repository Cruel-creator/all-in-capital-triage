import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertNoPii, redact, unredact, PiiLeakError, type FounderRef } from "../src/lib/llm/pii";
import { verifyQuote } from "../src/lib/pipeline/verify-quote";

const founders: FounderRef[] = [
  { id: "f1", token: "[F1]", full_name: "Ritu Hegde", email: "ritu@grainkind.example" },
  { id: "f2", token: "[F2]", full_name: "Sanjay Kulkarni" },
  { id: "f3", token: "[F3]", full_name: "Dr. Lakshmi Reddy" },
];

test("redact removes founder names, emails, phones and LinkedIn URLs", () => {
  const form = JSON.parse(readFileSync(join(process.cwd(), "seed", "text", "GrainKind_Form.json"), "utf8")).pages[0].text;
  const r = redact(form + " write to ritu@grainkind.example or +91 98765 43210", founders);
  assert.doesNotThrow(() => assertNoPii(r, founders));
  assert.ok(r.includes("[F1], CEO"));
  assert.ok(!/linkedin\.com/i.test(r));
  assert.ok(!r.includes("Hegde") && !r.includes("Kulkarni"));
  assert.equal(unredact("[F1] runs brand", founders), "Ritu Hegde runs brand");
});

test("redact handles honorifics", () => {
  assert.equal(redact("Dr. Lakshmi Reddy, CEO. MBBS", founders), "[F3], CEO. MBBS");
});

test("assertNoPii blocks each kind of leak", () => {
  assert.throws(() => assertNoPii("contact a@b.co"), PiiLeakError);
  assert.throws(() => assertNoPii("call 9876543210"), PiiLeakError);
  assert.throws(() => assertNoPii("see linkedin.com/in/x-y"), PiiLeakError);
  assert.throws(() => assertNoPii("Ritu Hegde said", founders), PiiLeakError);
  assert.doesNotThrow(() => assertNoPii("INR 16.5 L revenue in October, 3,100 customers"));
});

test("verifyQuote accepts verbatim quotes across line breaks and rejects invented ones", () => {
  const page = "TAM INR 91,200 Cr 38M urban households buying packaged breakfast and better-for-\nyou snacks x INR 2,400 a year";
  assert.ok(verifyQuote(page, "TAM INR 91,200 Cr 38M urban households").ok);
  assert.ok(verifyQuote(page, "38M urban  households\nbuying").ok);
  const bad = verifyQuote(page, "TAM INR 9,120 Cr");
  assert.equal(bad.ok, false);
  assert.equal(verifyQuote(undefined, "x").ok, false);
  const long = Array.from({ length: 26 }, () => "word").join(" ");
  assert.equal(verifyQuote(long, long).ok, false);
});
