import { test } from "node:test";
import assert from "node:assert/strict";
import { RETRY_ATTEMPTS, backoffMs, cacheKey, cacheable } from "../src/lib/llm/gateway";

test("retries wait 1s, 2s, 4s with a little jitter, up to 4 tries (L8)", () => {
  assert.equal(RETRY_ATTEMPTS, 4);
  assert.deepEqual([1, 2, 3].map((n) => backoffMs(n, () => 0)), [1000, 2000, 4000]);
  const jittered = backoffMs(1, () => 0.999);
  assert.ok(jittered > 1000 && jittered < 1250, `jitter stays small: ${jittered}`);
});

test("only deterministic calls are cached, keyed on the exact prompt", () => {
  assert.equal(cacheable(0), true);
  assert.equal(cacheable(undefined), true);
  assert.equal(cacheable(0.4), false); // email drafts stay fresh
  assert.equal(cacheKey("sys", "user"), cacheKey("sys", "user"));
  assert.notEqual(cacheKey("sys", "user"), cacheKey("sys", "user "));
});
