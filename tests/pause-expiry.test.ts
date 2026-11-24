import { test } from "node:test";
import assert from "node:assert/strict";
import { pauseExpired } from "../src/lib/llm/gateway";

test("a cost pause lasts until midnight IST, then expires", () => {
  const now = new Date("2026-11-24T10:00:00+05:30");
  assert.equal(pauseExpired("2026-11-24T09:00:00+05:30", now), false); // paused earlier today: still paused
  assert.equal(pauseExpired("2026-11-23T23:59:00+05:30", now), true); // paused yesterday IST: expired
  assert.equal(pauseExpired("2026-11-23T19:00:00Z", now), false); // 00:30 IST today in UTC terms: same IST day
});
