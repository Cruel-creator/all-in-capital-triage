// pnpm tsx scripts/b6/prepare.ts — B6 steps 1, 3 and 4 for Loop 2 (the first email).
// Builds the real examples from the Drive export (founder names masked), checks Riya's own emails against the
// checks (a check Riya fails is a wrong check), then seals a 20-row real test set BEFORE any training or tuning.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { DIR, OUT, SYSTEM, allPass, checkEmail, dirtyReason, inputFor, maskName, readCsv, slotsIn, type Example } from "./common";

const rows = readCsv(`${DIR}/AIC_B6_Loop2_Email_Export.csv`);
const words = (s: string) => s.trim().split(/\s+/).length;

const real: Example[] = rows.map((r) => {
  const m = (t: string) => maskName(t, r.founder_name);
  const target = m(r.riya_final_email);
  return {
    id: r.row_id, source: "real", founder_type: r.founder_type, sector: r.sector, stage: r.stage,
    input: inputFor({ founder_type: r.founder_type, sector: r.sector, stage: r.stage, city: r.city, founder_background: m(r.founder_background), traction_facts: m(r.traction_facts), slots: slotsIn(target) }),
    target, system_draft: m(r.system_draft), unchanged: r.system_draft.trim() === r.riya_final_email.trim(),
  };
});

// clean first (step 3), then seal (step 4). The limit comes from Riya: 95th percentile of her emails, rounded up.
const sorted = real.map((e) => words(e.target)).sort((a, b) => a - b);
const maxWords = Math.ceil(sorted[Math.floor(sorted.length * 0.95)] / 5) * 5 + 5;
const dirty = real.map((e) => ({ id: e.id, reason: dirtyReason(e.target, maxWords) })).filter((x) => x.reason);
const clean = real.filter((e) => !dirty.some((d) => d.id === e.id));
const traction = (e: Example) => e.input.match(/^Traction: (.*)$/m)?.[1] ?? "";
const riyaFails = clean.map((e) => ({ id: e.id, failed: checkEmail(e.target, { traction: traction(e), founder_type: e.founder_type, maxWords }).filter((c) => !c.pass).map((c) => c.id) })).filter((x) => x.failed.length);
const leaked = real.filter((e) => rows.find((r) => r.row_id === e.id)!.founder_name.split(/\s+/).some((p) => p.length > 2 && new RegExp(`\\b${p}\\b`).test(e.input + e.target)));

// seal the test set: deterministic, stratified (every founder type represented in proportion), clean real rows only
const rng = (() => { let s = 20261124; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); })();
const byType = new Map<string, Example[]>();
for (const e of clean) byType.set(e.founder_type, [...(byType.get(e.founder_type) ?? []), e]);
const test: Example[] = [];
for (const [, list] of byType) {
  const shuffled = [...list].sort(() => rng() - 0.5);
  test.push(...shuffled.slice(0, Math.max(1, Math.round((list.length / clean.length) * 20))));
}
const testIds = new Set(test.slice(0, 20).map((e) => e.id));
const sealed = clean.filter((e) => testIds.has(e.id));
const trainReal = clean.filter((e) => !testIds.has(e.id));

mkdirSync(OUT, { recursive: true });
const jsonl = (xs: Example[]) => xs.map((x) => JSON.stringify(x)).join("\n") + "\n";
const sealedText = jsonl(sealed);
writeFileSync(`${OUT}/test.sealed.jsonl`, sealedText);
writeFileSync(`${OUT}/train.real.jsonl`, jsonl(trainReal));
const sha = createHash("sha256").update(sealedText).digest("hex");
writeFileSync(`${OUT}/SEAL.txt`, `test.sealed.jsonl sha256 ${sha}\nsealed ${new Date().toISOString()} before any training or prompt tuning\nrows ${sealed.map((e) => e.id).join(",")}\n`);
writeFileSync(`${OUT}/meta.json`, JSON.stringify({ maxWords, system: SYSTEM }, null, 1));

const count = (xs: Example[], k: keyof Example) => Object.entries(xs.reduce<Record<string, number>>((a, x) => ((a[String(x[k])] = (a[String(x[k])] ?? 0) + 1), a), {})).map(([a, b]) => `${a} ${b}`).join(", ");
console.log(JSON.stringify({
  real: real.length, dirty, clean: clean.length, unchangedByRiya: real.filter((e) => e.unchanged).length, maxWords,
  riyaEmailsFailingChecks: riyaFails, namesLeaked: leaked.map((e) => e.id),
  test: { n: sealed.length, types: count(sealed, "founder_type"), unchanged: sealed.filter((e) => e.unchanged).length, sha256: sha },
  trainReal: { n: trainReal.length, types: count(trainReal, "founder_type") },
  slotsFound: real.filter((e) => /Slots to offer: (?!\{)/.test(e.input)).length,
}, null, 1));
void allPass;
