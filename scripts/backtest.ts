// pnpm backtest: scores the 12 deal memos blind and compares with the fund's decisions (build prompt §9.4).
// Writes a calibration_runs row and seed/out/backtest-report.md. About 12 scoring calls plus one per disagreement.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { mkdirSync, writeFileSync } from "node:fs";
import { admin, must } from "../src/lib/db/admin";
import { loadPrompt } from "../src/lib/llm/prompts";
import { runBacktest } from "../src/lib/calibration";
import { flush } from "../src/lib/llm/langfuse";

async function main() {
  for (const name of ["calibrate_score", "calibrate_argue"]) {
    const t = loadPrompt(name, 1);
    must(await admin().from("prompt_versions").upsert({ name: t.name, version: t.version, template: t.template, sha256: t.sha256 }, { onConflict: "name,version" }), `prompt ${name}`);
  }
  const r = await runBacktest(console.log);
  mkdirSync("seed/out", { recursive: true });
  writeFileSync("seed/out/backtest-report.md", r.report);
  console.log(`\nAgreement ${r.confusion.agree}/${r.confusion.total} (${r.confusion.agreement_pct}%). Report: seed/out/backtest-report.md`);
  await flush();
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
