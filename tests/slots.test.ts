import { test } from "node:test";
import assert from "node:assert/strict";
import { addWorkingDays, candidateSlots, formatSlot, isFree, pickSlots } from "../src/lib/google/slots";

const NOW = new Date("2026-11-21T06:00:00Z"); // Saturday 11:30 IST

test("candidates are Tue/Thu, 2-6 pm IST, 30 minutes", () => {
  const c = candidateSlots(NOW);
  assert.ok(c.length > 0);
  for (const s of c) {
    const startIst = new Date(new Date(s.start).getTime() + 5.5 * 3600e3);
    assert.ok([2, 4].includes(startIst.getUTCDay()), s.start);
    const h = startIst.getUTCHours() + startIst.getUTCMinutes() / 60;
    assert.ok(h >= 14 && h < 18, s.start);
    assert.equal(new Date(s.end).getTime() - new Date(s.start).getTime(), 30 * 60e3);
  }
  assert.equal(c[0].start, "2026-11-24T08:30:00.000Z"); // Tuesday 24 Nov, 2:00 pm IST
});

test("busy time is skipped and the two offers fall on different days", () => {
  const busy = [{ start: "2026-11-24T08:30:00.000Z", end: "2026-11-24T12:30:00.000Z" }]; // all of Tuesday afternoon
  const [a, b] = pickSlots(NOW, busy);
  assert.ok(isFree(a, busy) && isFree(b, busy));
  assert.ok(a.start.startsWith("2026-11-26")); // Thursday
  assert.notEqual(a.start.slice(0, 10), b.start.slice(0, 10));
  assert.match(formatSlot(a), /Thursday.*26.*Nov.*2:00.*pm IST/i);
});

test("follow-up is due 3 working days later, skipping the weekend", () => {
  const fri = new Date("2026-11-20T09:00:00Z"); // Friday
  assert.equal(addWorkingDays(fri).toISOString().slice(0, 10), "2026-11-25"); // Mon, Tue, Wed
});
