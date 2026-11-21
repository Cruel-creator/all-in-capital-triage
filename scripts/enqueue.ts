// pnpm enqueue [Company ...] [--all] [--synthetic] [--make-synthetic]
//   --all             queue the 10 seed applications
//   --make-synthetic  create 10 synthetic variants (same documents under a new name) if they don't exist yet
//   --synthetic       also queue the synthetic variants
// Volume test: pnpm enqueue --all --make-synthetic --synthetic, then pnpm worker --once.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { admin, must } from "../src/lib/db/admin";
import { enqueue } from "../src/lib/queue";

const db = admin();
const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const names = args.filter((a) => !a.startsWith("--")).map((a) => a.toLowerCase());

/** Clones a seed application (row, founders, documents, pages) as a synthetic variant. Claims are re-extracted by the pipeline. */
async function makeVariant(src: Record<string, unknown>) {
  const name = `${src.company_name} Variant`;
  if ((await db.from("applications").select("id").eq("company_name", name).maybeSingle()).data) return null;
  const { id: srcId, created_at: _c, updated_at: _u, ...rest } = src;
  void _c; void _u;
  const app = must(await db.from("applications").insert({ ...rest, company_name: name, is_synthetic: true, dedupe_key: `${String(src.dedupe_key ?? srcId)}:variant`, status: "queued", status_reason: null, current_step: null, sector_inferred: null, sector_reason: null, sector_label_matches: null }).select("id").single(), "variant");
  const founders = must(await db.from("founders").select("*").eq("application_id", srcId), "founders");
  if (founders.length) must(await db.from("founders").insert(founders.map(({ id: _i, created_at: _f, ...f }) => { void _i; void _f; return { ...f, application_id: app.id }; })), "variant founders");
  const docs = must(await db.from("documents").select("*").eq("application_id", srcId), "documents");
  for (const d of docs) {
    const { id: docId, created_at: _d, ...drest } = d;
    void _d;
    const nd = must(await db.from("documents").insert({ ...drest, application_id: app.id, sha256: `${d.sha256}:variant` }).select("id").single(), "variant document");
    const pages = must(await db.from("pages").select("page_no, text").eq("document_id", docId), "pages");
    if (pages.length) must(await db.from("pages").insert(pages.map((p) => ({ ...p, document_id: nd.id }))), "variant pages");
  }
  return app.id as string;
}

async function main() {
  const seed = must(await db.from("applications").select("*").eq("is_synthetic", false).order("company_name"), "applications");
  if (flag("--make-synthetic")) {
    let made = 0;
    for (const s of seed) if (await makeVariant(s)) made++;
    console.log(`synthetic variants created: ${made}`);
  }
  const all = must(await db.from("applications").select("id, company_name, is_synthetic").order("company_name"), "applications");
  const pick = all.filter((a) => (names.length ? names.includes(a.company_name.toLowerCase()) : (flag("--all") && !a.is_synthetic) || (flag("--synthetic") && a.is_synthetic)));
  if (!pick.length) return console.log("Nothing to queue. Pass company names, --all and/or --synthetic.");
  await enqueue(pick.map((a) => a.id));
  console.log(`queued ${pick.length}: ${pick.map((a) => a.company_name).join(", ")}`);
}

main().catch((e) => { console.error((e as Error).message); process.exitCode = 1; });
