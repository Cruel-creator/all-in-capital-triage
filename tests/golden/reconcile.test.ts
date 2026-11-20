// Golden reconciliation checks (build prompt section 10). Scores are not fixed. Flags are.
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcile } from "../../src/lib/reconcile/reconcile";
import { credentialCheck } from "../../src/lib/reconcile/credentials";
import { FIXTURES } from "./fixtures";

const near = (a: number, b: number) => Math.abs(a - b) / Math.max(1, Math.abs(b)) < 1e-6;

for (const fx of FIXTURES) {
  const { flags, derived } = reconcile(fx.claims);
  const show = () => flags.map((f) => `${f.check}/${f.metric}/${f.severity}: ${f.formula}`).join("\n  ");

  for (const want of fx.expected.flags) {
    test(`${fx.app}: flags ${want.check} on ${want.metric}${want.severity ? ` (${want.severity.join("|")})` : ""}`, () => {
      const hit = flags.find(
        (f) =>
          f.check === want.check &&
          f.metric === want.metric &&
          (!want.severity || want.severity.includes(f.severity)) &&
          (want.computed === undefined || (f.computed !== null && near(f.computed, want.computed))),
      );
      assert.ok(hit, `missing flag ${JSON.stringify(want)}\n  got:\n  ${show()}`);
      // every flag must cite claims and show its formula (non-negotiable 1)
      assert.ok(hit.claim_ids.length > 0, "flag has no claim ids");
      assert.ok(hit.formula.length > 0, "flag has no formula");
    });
  }

  if (fx.expected.clean) {
    test(`${fx.app}: no warn or red reconciliation flags`, () => {
      const bad = flags.filter((f) => f.severity !== "info");
      assert.equal(bad.length, 0, `unexpected flags:\n  ${show()}`);
    });
  }

  for (const d of fx.expected.derived ?? []) {
    test(`${fx.app}: computes ${d.metric} ≈ ${d.value}`, () => {
      const got = derived.find((x) => x.metric === d.metric);
      assert.ok(got, `no derived ${d.metric}`);
      assert.ok(Math.abs(got.value - d.value) <= d.tolerance, `${d.metric} = ${got.value}, expected ${d.value} ± ${d.tolerance}`);
    });
  }

  const cred = fx.expected.credentials;
  if (cred) {
    test(`${fx.app}: credential check ${cred.mustFlag.length ? "flags " + cred.mustFlag.join(", ") : "passes"}`, () => {
      const flag = credentialCheck(
        { id: `${fx.app}-cred-deck`, text: cred.deck.text ?? cred.deck.quote },
        { id: `${fx.app}-cred-form`, text: cred.form.text },
      );
      if (!cred.mustFlag.length) return assert.equal(flag, null, `unexpected credential flag: ${flag?.explanation}`);
      assert.ok(flag, "expected a credential flag");
      assert.equal(flag.severity, "red");
      for (const name of cred.mustFlag) assert.ok(flag.stated_label?.includes(name), `credential flag misses ${name}`);
    });
  }
}

test("GrainKind TAM and SAM are each off by exactly 10x", () => {
  const gk = FIXTURES.find((f) => f.app === "GrainKind")!;
  const { flags } = reconcile(gk.claims);
  for (const m of ["market.tam", "market.sam"]) {
    const f = flags.find((x) => x.metric === m)!;
    assert.equal(Math.round((f.stated as number) / (f.computed as number)), 10);
    assert.match(f.explanation, /10x/);
  }
});

test("Talkbook MRR: 340 seats × ₹500 = ₹1.7L, differs from both form ₹1.9L and deck ₹2.1L", () => {
  const tb = FIXTURES.find((f) => f.app === "Talkbook")!;
  const mrr = reconcile(tb.claims).flags.filter((f) => f.check === "mrr");
  assert.deepEqual(mrr.map((f) => f.stated).sort(), [1.9e5, 2.1e5]);
  assert.ok(mrr.every((f) => f.formula.includes("₹1.7 L")));
});
