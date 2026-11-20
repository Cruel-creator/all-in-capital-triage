// Every model call must go through src/lib/llm/gateway.ts (Portkey retries, Langfuse, cost, PII guard).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["src", "scripts"];
const FORBIDDEN = [
  /api\.portkey\.ai/,
  /generativelanguage\.googleapis\.com/,
  /api\.anthropic\.com/,
  /api\.openai\.com/,
  /from ["']@google\/genai["']/,
  /from ["']@anthropic-ai\/sdk["']/,
  /from ["']openai["']/,
  /from ["']portkey-ai["']/,
];

function* walk(dir: string): Generator<string> {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(f)) yield p;
  }
}

test("only src/lib/llm/gateway.ts talks to a model provider", () => {
  const offenders: string[] = [];
  for (const root of ROOTS)
    for (const file of walk(join(process.cwd(), root))) {
      const rel = relative(process.cwd(), file).replace(/\\/g, "/");
      if (rel === "src/lib/llm/gateway.ts") continue;
      // credential health check only (pnpm check:keys); never part of the pipeline, prints no secrets
      if (rel === "scripts/check-keys.ts") continue;
      const src = readFileSync(file, "utf8");
      if (FORBIDDEN.some((re) => re.test(src))) offenders.push(rel);
    }
  assert.deepEqual(offenders, [], `model calls outside the gateway: ${offenders.join(", ")}`);
});

test("toNumber converts as-printed values in code, not in the model", async () => {
  const { toNumber } = await import("../src/lib/pipeline/extract-claims");
  assert.equal(toNumber("INR 91,200 Cr", "INR"), 91_200e7);
  assert.equal(toNumber("under INR 2,000", "INR"), 2_000);
  assert.equal(toNumber("45%", "share"), 0.45);
  assert.equal(toNumber("~5 months", "months"), 5);
  assert.equal(toNumber("38M", "count"), 38e6);
  assert.equal(toNumber("38%", "pct"), 38);
  assert.equal(toNumber(null, "INR"), null);
});
