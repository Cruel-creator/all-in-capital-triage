import { test } from "node:test";
import assert from "node:assert/strict";
import { readReply, stripQuoted } from "../src/lib/google/reply";
import { buildRaw } from "../src/lib/google/client";

const NOW = new Date("2026-11-21T06:00:00Z"); // Saturday 11:30 IST
const TUE = { start: "2026-11-24T08:30:00.000Z", end: "2026-11-24T09:00:00.000Z" }; // Tue 2:00 pm IST
const THU = { start: "2026-11-26T08:30:00.000Z", end: "2026-11-26T09:00:00.000Z" }; // Thu 2:00 pm IST
const OFFERED = [TUE, THU];

test("a weekday alone picks that offered slot", () => {
  assert.deepEqual(readReply("Hi Riya, Thursday works great for us. Thanks!", OFFERED, NOW), { kind: "accept", slot: THU });
});

test("day and time that match an offer are an acceptance", () => {
  assert.deepEqual(readReply("Tuesday 2pm is perfect.", OFFERED, NOW), { kind: "accept", slot: TUE });
  assert.deepEqual(readReply("Let's do 26 Nov at 2:00 pm", OFFERED, NOW), { kind: "accept", slot: THU });
});

test("a different time is a proposal, in IST", () => {
  const r = readReply("Neither slot suits me. Could we do Wednesday at 4:30 pm instead?", OFFERED, NOW);
  assert.equal(r.kind, "propose");
  assert.equal(r.kind === "propose" && r.slots[0].start, "2026-11-25T11:00:00.000Z"); // Wed 4:30 pm IST
});

test("refusals and quoted history are ignored", () => {
  assert.deepEqual(readReply("Tuesday doesn't work for me, sorry. Will get back.", OFFERED, NOW), { kind: "unclear" });
  const quoted = "Sounds good, will confirm soon.\n\nOn Sat, 21 Nov 2026 at 11:00, Riya wrote:\n> Would Tuesday 2pm or Thursday 2pm work?";
  assert.equal(stripQuoted(quoted), "Sounds good, will confirm soon.");
  assert.deepEqual(readReply(quoted, OFFERED, NOW), { kind: "unclear" });
});

test("'either works' and 'the second one'", () => {
  assert.deepEqual(readReply("Either works for us!", OFFERED, NOW), { kind: "accept", slot: TUE });
  assert.deepEqual(readReply("The second one, please.", OFFERED, NOW), { kind: "accept", slot: THU });
});

test("buildRaw makes a threaded RFC 2822 message and encodes non-ASCII subjects", () => {
  const raw = buildRaw({ from: "a@x.test", to: "b@y.test", subject: "Re: Call — Thursday", body: "Hi,\n\nBooked.", inReplyTo: "<m1@x.test>" });
  const msg = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(msg, /^From: a@x\.test\r\nTo: b@y\.test\r\nSubject: =\?UTF-8\?B\?/);
  assert.match(msg, /In-Reply-To: <m1@x\.test>\r\nReferences: <m1@x\.test>/);
  assert.ok(msg.endsWith("\r\n\r\nHi,\n\nBooked."));
});
