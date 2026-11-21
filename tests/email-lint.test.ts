import { test } from "node:test";
import assert from "node:assert/strict";
import { lintEmail } from "../src/lib/email/lint";

// the build prompt's style reference must pass its own linter
const REFERENCE = {
  subject: "GrainKind: a call next week?",
  body: `Hi Ritu,

Your 90-day repeat going from 31% in the June cohort to 38% in August is the number we look at first for a food brand, and few pre-seed decks break it out by cohort.

We'd like 30 minutes with you and Sanjay. Two things we'd want to cover: how much of the ₹410 paid-social CAC you can move to nutritionist referrals, and what happens if the Hosur co-packer has a bad month.

Would {slot_1} or {slot_2} work?

Riya
All In Capital`,
  template: "invite" as const,
};

test("the style reference email passes", () => {
  const r = lintEmail(REFERENCE);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  assert.ok(r.words <= 120);
});

test("catches length, subject, em dash, banned words and patterns", () => {
  const long = { ...REFERENCE, body: REFERENCE.body.replace("Riya", `${"word ".repeat(80)}\nRiya`) };
  assert.ok(lintEmail(long).issues.some((i) => i.rule === "length"));
  assert.ok(lintEmail({ ...REFERENCE, subject: "A rather long subject line for this particular call" }).issues.some((i) => i.rule === "subject length"));
  assert.ok(lintEmail({ ...REFERENCE, body: REFERENCE.body.replace(", and few", " — few") }).issues.some((i) => i.rule === "em dash"));
  assert.ok(lintEmail({ ...REFERENCE, body: REFERENCE.body.replace("We'd like", "We're excited to leverage") }).issues.some((i) => i.rule === "banned word"));
  assert.ok(lintEmail({ ...REFERENCE, body: REFERENCE.body.replace("We'd like 30 minutes", "This is not just a call but a conversation. We'd like 30 minutes") }).issues.some((i) => i.rule.startsWith("binary contrast")));
});

test("first sentence must cite a specific number", () => {
  const vague = { ...REFERENCE, body: REFERENCE.body.replace("Your 90-day repeat going from 31% in the June cohort to 38% in August", "Your cohort data") };
  assert.ok(lintEmail(vague).issues.some((i) => i.rule === "specific opening"));
});

test("one clear next step, slots for invites, signature, no accusations", () => {
  assert.ok(lintEmail({ ...REFERENCE, body: REFERENCE.body.replace("{slot_2}", "Thursday") }).issues.some((i) => i.rule === "slots"));
  assert.ok(lintEmail({ ...REFERENCE, body: REFERENCE.body.replace("Riya\n", "Best\n") }).issues.some((i) => i.rule === "signature"));
  const pass = { subject: "EarnWise: our decision", template: "pass" as const, body: "Hi Rohit,\n\nYour deck says a team of 12 and the form says 5, and we suspect you lied about it.\n\nRiya\nAll In Capital" };
  assert.ok(lintEmail(pass).issues.some((i) => i.rule === "accusatory"));
  const dig = { subject: "CAPilot: two questions", template: "dig" as const, body: "Hi Dhruv,\n\nGoing from 18 to 78 thousand in monthly revenue in three months is quick.\n\nWhat does it cost you to win a firm? Who carries a filing error?\n\nRiya" };
  assert.equal(lintEmail(dig).ok, true, JSON.stringify(lintEmail(dig).issues));
});
