// pnpm embed: embeds memo/meeting passages and portfolio rows that have no vector yet. Idempotent.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { admin, must } from "../src/lib/db/admin";
import { embed } from "../src/lib/llm/gateway";

const db = admin();
const toPg = (v: number[]) => `[${v.join(",")}]`;

async function run(table: "memo_chunks" | "portfolio", textOf: (r: Record<string, string>) => string, cols: string) {
  const rows = must(await db.from(table).select(`id, ${cols}`).is("embedding", null), table) as unknown as Record<string, string>[];
  for (let i = 0; i < rows.length; i += 32) {
    const batch = rows.slice(i, i + 32);
    const vecs = await embed({ step: `embed:${table}`, inputs: batch.map(textOf) });
    for (let j = 0; j < batch.length; j++) must(await db.from(table).update({ embedding: toPg(vecs[j]) }).eq("id", batch[j].id), `${table} update`);
  }
  console.log(`${table}: embedded ${rows.length} row(s)`);
}

(async () => {
  await run("memo_chunks", (r) => r.text, "text");
  // portfolio text = name + one-liner + sector: what an applicant would overlap on
  await run("portfolio", (r) => `${r.company}: ${r.one_liner} (${r.sector})`, "company, one_liner, sector");
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
