import { test } from "node:test";
import assert from "node:assert/strict";
import { readReply } from "../src/lib/google/reply";
import { withinHours } from "../src/lib/google/outreach";

// Monday 24 Nov 2026, 10:00 IST
const NOW = new Date("2026-11-24T04:30:00Z");
const slot = (istStart: string) => {
  const s = new Date(`${istStart}+05:30`);
  return { start: s.toISOString(), end: new Date(s.getTime() + 30 * 60e3).toISOString() };
};

test("the founder suggests their own time and no slots were offered: it is read as a proposal", () => {
  const r = readReply("Hi Riya, Thursday at 3pm works for me. Thanks!", [], NOW);
  assert.equal(r.kind, "propose");
  if (r.kind === "propose") assert.equal(r.slots[0].start, slot("2026-11-26T15:00:00").start);
});

test("an explicit date and time is read too, and a refusal is not", () => {
  const r = readReply("Could we do 2 Dec at 11:30 am?", [], NOW);
  assert.equal(r.kind, "propose");
  if (r.kind === "propose") assert.equal(r.slots[0].start, slot("2026-12-02T11:30:00").start);
  assert.equal(readReply("Sorry, I can't do Thursday 3pm.", [], NOW).kind, "unclear");
});

test("'tomorrow' and 'today' with a time are read as proposals", () => {
  const r = readReply("Tomorrow at 4 pm would be great.", [], NOW);
  assert.equal(r.kind, "propose");
  if (r.kind === "propose") assert.equal(r.slots[0].start, slot("2026-11-25T16:00:00").start);
  const t = readReply("Can we do today 5:30 pm?", [], NOW);
  assert.equal(t.kind, "propose");
  if (t.kind === "propose") assert.equal(t.slots[0].start, slot("2026-11-24T17:30:00").start);
});

test("calls are booked only on weekdays between 10:00 and 19:00 IST", () => {
  assert.equal(withinHours(slot("2026-11-26T15:00:00")), true); // Thursday 3 pm
  assert.equal(withinHours(slot("2026-11-26T18:30:00")), true); // ends at 7 pm exactly
  assert.equal(withinHours(slot("2026-11-26T18:45:00")), false); // runs past 7 pm
  assert.equal(withinHours(slot("2026-11-26T09:30:00")), false); // before 10 am
  assert.equal(withinHours(slot("2026-11-28T15:00:00")), false); // Saturday
});
