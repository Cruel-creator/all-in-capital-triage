// pnpm tsx scripts/b6/export-chat.ts — writes the TRAINING rows (real + labelled synthetic) as chat JSONL for Unsloth:
// {"messages":[system,user,assistant], "source":"real"|"synthetic"}. The sealed test rows are never written here.
import { readFileSync, writeFileSync } from "node:fs";
import { OUT, SYSTEM, type Example } from "./common";

const read = (f: string) => readFileSync(`${OUT}/${f}`, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Example);
const sealed = new Set(read("test.sealed.jsonl").map((e) => e.id));
const train = [...read("train.real.jsonl"), ...read("train.synthetic.jsonl")];
if (train.some((e) => sealed.has(e.id))) throw new Error("A sealed test row reached the training file");
const chat = train.map((e) => ({ source: e.source, id: e.id, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: e.input }, { role: "assistant", content: e.target }] }));
writeFileSync(`${OUT}/train.chat.jsonl`, chat.map((c) => JSON.stringify(c)).join("\n") + "\n");
// the test prompts (inputs only, no answers) so the fine-tuned model can be run on them blind
writeFileSync(`${OUT}/test.prompts.jsonl`, read("test.sealed.jsonl").map((e) => JSON.stringify({ id: e.id, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: e.input }] })).join("\n") + "\n");
console.log(JSON.stringify({ train: chat.length, real: chat.filter((c) => c.source === "real").length, synthetic: chat.filter((c) => c.source === "synthetic").length, testPrompts: sealed.size }));
