// Non-negotiable 1 applied to our own fixtures: every quote must be on the page it cites, verbatim, ≤25 words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURES, type Src } from "./fixtures";

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
const cache = new Map<string, { page_no: number; text: string }[]>();
const pages = (file: string) => {
  if (!cache.has(file)) {
    const json = JSON.parse(readFileSync(join(process.cwd(), "seed", "text", file.replace(/\.pdf$/, ".json")), "utf8"));
    cache.set(file, json.pages);
  }
  return cache.get(file)!;
};

export function quoteOnPage(src: Src): boolean {
  const page = pages(src.file).find((p) => p.page_no === src.page);
  return !!page && collapse(page.text).includes(collapse(src.quote));
}

for (const fx of FIXTURES) {
  test(`${fx.app}: every fixture quote is verbatim on its cited page and ≤25 words`, () => {
    const srcs: Src[] = [
      ...fx.claims.map((c) => c.src),
      ...(fx.expected.credentials ? [fx.expected.credentials.deck, fx.expected.credentials.form] : []),
    ];
    for (const s of srcs) {
      assert.ok(quoteOnPage(s), `quote not found on ${s.file} p${s.page}: "${s.quote}"`);
      assert.ok(collapse(s.quote).split(" ").length <= 25, `quote over 25 words: "${s.quote}"`);
    }
  });
}
