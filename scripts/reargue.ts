// pnpm tsx scripts/reargue.ts: rewrites the latest backtest's disagreement notes with the current argue prompt
// (short, plain, sources kept out of the sentence). No re-scoring; about one model call per disagreement.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { admin, must } from "../src/lib/db/admin";
import { loadPrompt } from "../src/lib/llm/prompts";
import { reargueLatest } from "../src/lib/calibration";
import { flush } from "../src/lib/llm/langfuse";

async function main() {
  const t = loadPrompt("calibrate_argue", 2);
  must(await admin().from("prompt_versions").upsert({ name: t.name, version: t.version, template: t.template, sha256: t.sha256 }, { onConflict: "name,version" }), "prompt calibrate_argue@v2");
  const r = await reargueLatest(console.log);
  console.log(`\nUpdated run ${r.runId}.`);
  await flush();
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
