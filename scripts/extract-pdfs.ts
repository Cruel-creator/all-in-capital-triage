// Extracts page-numbered text from every PDF in seed/raw into seed/text/<name>.json.
// Deterministic, no network. The pipeline's ingest step uses the same lib/pdf function.
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { extractPages } from "../src/lib/pdf/extract";

const RAW = join(process.cwd(), "seed", "raw");
const OUT = join(process.cwd(), "seed", "text");

async function main() {
  await mkdir(OUT, { recursive: true });
  const files = (await readdir(RAW)).filter((f) => f.toLowerCase().endsWith(".pdf"));
  for (const f of files) {
    const buf = await readFile(join(RAW, f));
    const doc = await extractPages(new Uint8Array(buf));
    await writeFile(join(OUT, basename(f, ".pdf") + ".json"), JSON.stringify({ file: f, ...doc }, null, 2));
    console.log(`${f.padEnd(30)} ${doc.pages.length} pages  sha256=${doc.sha256.slice(0, 12)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
