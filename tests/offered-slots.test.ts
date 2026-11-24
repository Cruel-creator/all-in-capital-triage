import { test } from "node:test";
import assert from "node:assert/strict";
import { fillSlots, refreshOfferedSlots } from "../src/lib/google/outreach";
import { formatSlot } from "../src/lib/google/slots";
import { lintEmail } from "../src/lib/email/lint";

const NOW = new Date("2026-11-24T04:30:00Z"); // Tue 24 Nov 2026, 10:00 IST
const slot = (istStart: string) => {
  const s = new Date(`${istStart}+05:30`);
  return { start: s.toISOString(), end: new Date(s.getTime() + 30 * 60e3).toISOString() };
};
const A = slot("2026-11-26T15:00:00"); // Thursday 3 pm
const B = slot("2026-12-01T15:00:00"); // Tuesday 3 pm
const DRAFT = "Hi Ritu,\n\nYour 38% repeat is rare for a pre-seed food brand.\n\nHow much of it comes from paid social?\n\nWould 30 minutes on {slot_1} or {slot_2} work? If neither suits you, reply with a time that does.\n\nRiya\nAll In Capital";

test("the draft shows two real times, and the linter accepts them", () => {
  const body = fillSlots(DRAFT, [A, B]);
  assert.ok(!body.includes("{slot_1}"));
  assert.ok(body.includes(formatSlot(A)) && body.includes(formatSlot(B)));
  const r = lintEmail({ subject: "GrainKind: a call?", body, template: "invite" });
  assert.equal(r.ok, true, JSON.stringify(r.issues));
});

test("at send, still-free times stay; a taken one is swapped; Riya's own times are kept as written", () => {
  const body = fillSlots(DRAFT, [A, B]);
  assert.deepEqual(refreshOfferedSlots(body, [A, B], [], NOW).offered, [A, B]);
  const swapped = refreshOfferedSlots(body, [A, B], [{ start: A.start, end: A.end }], NOW);
  assert.ok(!swapped.body.includes(formatSlot(A)), "the taken slot is replaced");
  assert.equal(swapped.offered.length, 2);
  const edited = body.replace(formatSlot(A), "Friday at 11 am");
  assert.deepEqual(refreshOfferedSlots(edited, [A, B], [], NOW), { body: edited, offered: [] });
});
