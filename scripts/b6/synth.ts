// pnpm tsx scripts/b6/synth.ts — B6 step 3: extend the clean real examples to about 300 with labelled synthetic ones.
// References come only from train.real.jsonl (never the sealed test set). Every synthetic email must pass the same
// checks Riya's real emails pass, or it is dropped. Writes seed/b6/out/train.synthetic.jsonl and dataset.jsonl.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { admin, must } from "../../src/lib/db/admin";
import { callModel } from "../../src/lib/llm/gateway";
import { loadPrompt, render } from "../../src/lib/llm/prompts";
import { flush } from "../../src/lib/llm/langfuse";
import { OUT, allPass, checkEmail, inputFor, slotsIn, type Example } from "./common";

const TARGET = Number(process.argv[2] ?? 242);
const PER_CALL = 8;
const read = (f: string) => readFileSync(`${OUT}/${f}`, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Example);
const trainReal = read("train.real.jsonl");
const sealedIds = new Set(read("test.sealed.jsonl").map((e) => e.id));
if (trainReal.some((e) => sealedIds.has(e.id))) throw new Error("A sealed test row is in the training references");
const { maxWords } = JSON.parse(readFileSync(`${OUT}/meta.json`, "utf8")) as { maxWords: number };

const Out = z.object({
  examples: z.array(z.object({
    company: z.string(), founder_type: z.enum(["software", "hardware", "services"]), sector: z.string(), stage: z.string(), city: z.string(),
    founder_background: z.string(), traction_facts: z.string(), email: z.string(),
  })).min(1),
});

async function main() {
  const t = loadPrompt("b6_synth", 1);
  const pv = must(await admin().from("prompt_versions").upsert({ name: t.name, version: t.version, template: t.template, sha256: t.sha256 }, { onConflict: "name,version" }).select("id").single(), "prompt b6_synth");
  const kept: Example[] = [];
  const seen = new Set<string>();
  let dropped = 0, calls = 0;
  while (kept.length < TARGET && calls < 60) {
    calls++;
    const refs = [...trainReal].sort(() => Math.random() - 0.5).slice(0, 4).map((e) => e.target).join("\n---\n");
    try {
      const { data } = await callModel({
        step: "b6:synth",
        prompt: { name: t.name, version: t.version, versionId: pv.id, system: t.system, user: render(t.user, { n: String(PER_CALL), mix: "4 software, 2 hardware, 2 services founders", references: refs }) },
        schema: Out,
        temperature: 0.9,
      });
      for (const x of data.examples) {
        const key = x.company.toLowerCase();
        const checks = checkEmail(x.email, { traction: x.traction_facts, founder_type: x.founder_type, maxWords });
        if (seen.has(key) || !allPass(checks) || !x.email.includes("[F1]") || /\b(?:[A-Z][a-z]+ ){1}[A-Z][a-z]+,\n/.test(x.email.split("\n")[0])) { dropped++; continue; }
        seen.add(key);
        kept.push({
          id: `S-${String(kept.length + 1).padStart(3, "0")}`, source: "synthetic", founder_type: x.founder_type, sector: x.sector, stage: x.stage,
          input: inputFor({ ...x, slots: slotsIn(x.email) }), target: x.email.trim(),
        });
      }
      console.log(`call ${calls}: kept ${kept.length}, dropped ${dropped}`);
    } catch (e) {
      console.log(`call ${calls} failed: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  const synthetic = kept.slice(0, TARGET);
  const jsonl = (xs: Example[]) => xs.map((x) => JSON.stringify(x)).join("\n") + "\n";
  writeFileSync(`${OUT}/train.synthetic.jsonl`, jsonl(synthetic));
  // the full dataset, every row labelled real or synthetic; the sealed test rows are flagged, never trained on
  const sealed = read("test.sealed.jsonl").map((e) => ({ ...e, split: "test (sealed)" }));
  const train = [...trainReal, ...synthetic].map((e) => ({ ...e, split: "train" }));
  writeFileSync(`${OUT}/dataset.jsonl`, jsonl([...train, ...sealed] as Example[]));
  const types = synthetic.reduce<Record<string, number>>((a, x) => ((a[x.founder_type] = (a[x.founder_type] ?? 0) + 1), a), {});
  console.log(JSON.stringify({ synthetic: synthetic.length, dropped, calls, types, dataset: train.length + sealed.length, real: trainReal.length + sealed.length }));
  await flush();
}
main().catch((e) => { console.error((e as Error).message); process.exitCode = 1; });
