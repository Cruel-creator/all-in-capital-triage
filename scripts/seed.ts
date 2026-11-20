// pnpm seed: loads everything Phase 1 needs into Supabase. Idempotent (safe to re-run).
//  1. rubric v1, thesis v1, prompt versions
//  2. 22 PDFs → Storage (bucket "documents") + documents + pages (page-numbered text from seed/text)
//  3. 10 applications + founders (PII stays in founders) parsed from the forms
//  4. 12 memos, 5 meetings, retrievable chunks with page numbers
//  5. portfolio with a source URL per row
import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { admin, must } from "../src/lib/db/admin";
import { listPrompts, loadPrompt } from "../src/lib/llm/prompts";
import { parseForm } from "../src/lib/seed/parse-form";
import { parseMemos, parseMeetings } from "../src/lib/seed/chunk-memos";

const ROOT = process.cwd();
const TEXT = join(ROOT, "seed", "text");
const RAW = join(ROOT, "seed", "raw");
const db = admin();
type Pages = { page_no: number; text: string }[];
const loadText = (name: string): { file: string; sha256: string; pages: Pages } => JSON.parse(readFileSync(join(TEXT, name), "utf8"));

async function versions() {
  const rubric = JSON.parse(readFileSync(join(ROOT, "config", "rubric.v1.json"), "utf8"));
  const thesis = JSON.parse(readFileSync(join(ROOT, "config", "thesis.v1.json"), "utf8"));
  must(await db.from("rubric_versions").upsert({ version: 1, config: rubric, note: rubric.note, is_active: true }, { onConflict: "version" }), "rubric");
  must(
    await db.from("thesis_versions").upsert({ version: 1, written: thesis.written, revealed: thesis.revealed, note: thesis.note, is_active: true }, { onConflict: "version" }),
    "thesis",
  );
  for (const p of listPrompts()) {
    const t = loadPrompt(p.name, p.version);
    must(await db.from("prompt_versions").upsert({ name: t.name, version: t.version, template: t.template, sha256: t.sha256 }, { onConflict: "name,version" }), `prompt ${p.name}`);
  }
  console.log(`versions: rubric v1, thesis v1, ${listPrompts().length} prompt(s)`);
}

async function ensureDocument(file: string, kind: "deck" | "form" | "memo" | "meeting_notes", applicationId: string | null) {
  const t = loadText(file.replace(/\.pdf$/, ".json"));
  const existing = (await db.from("documents").select("id").eq("sha256", t.sha256).maybeSingle()).data;
  if (existing) {
    if (applicationId) await db.from("documents").update({ application_id: applicationId }).eq("id", existing.id);
    return { id: existing.id as string, pages: t.pages };
  }
  const path = `${kind}/${t.sha256}.pdf`;
  const up = await db.storage.from("documents").upload(path, readFileSync(join(RAW, file)), { contentType: "application/pdf", upsert: true });
  if (up.error) throw new Error(`storage ${file}: ${up.error.message}`);
  const doc = must(
    await db
      .from("documents")
      .insert({
        application_id: applicationId,
        kind,
        file_name: file,
        storage_path: path,
        sha256: t.sha256,
        page_count: t.pages.length,
        raw_text: t.pages.map((p) => p.text).join("\n\f\n"),
      })
      .select("id")
      .single(),
    `document ${file}`,
  );
  must(await db.from("pages").insert(t.pages.map((p) => ({ document_id: doc.id, page_no: p.page_no, text: p.text }))), `pages ${file}`);
  return { id: doc.id as string, pages: t.pages };
}

async function applications() {
  const rubric = must(await db.from("rubric_versions").select("id").eq("is_active", true).single(), "active rubric");
  const thesis = must(await db.from("thesis_versions").select("id").eq("is_active", true).single(), "active thesis");
  const forms = readdirSync(TEXT).filter((f) => /_Form\.json$/.test(f));
  for (const f of forms) {
    const company = f.replace(/_Form\.json$/, "");
    const form = parseForm(loadText(f).pages);
    const dedupe = form.company_name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const app = must(
      await db
        .from("applications")
        .upsert(
          {
            company_name: form.company_name,
            one_liner: form.one_liner,
            sector_label: form.sector_label,
            stage_label: form.stage_label,
            source: form.source,
            intro_by: form.intro_by,
            dedupe_key: dedupe,
            rubric_version_id: rubric.id,
            thesis_version_id: thesis.id,
          },
          { onConflict: "dedupe_key" },
        )
        .select("id")
        .single(),
      `application ${company}`,
    );
    const hasFounders = (await db.from("founders").select("id", { count: "exact", head: true }).eq("application_id", app.id)).count;
    if (!hasFounders)
      must(
        await db.from("founders").insert(
          form.founders.map((fd) => ({
            application_id: app.id,
            position: fd.position,
            full_name: fd.full_name,
            role_title: fd.role_title,
            linkedin_url: fd.linkedin_url,
          })),
        ),
        `founders ${company}`,
      );
    await ensureDocument(`${company}_Deck.pdf`, "deck", app.id);
    await ensureDocument(`${company}_Form.pdf`, "form", app.id);
    console.log(`application: ${form.company_name.padEnd(12)} ${form.source.padEnd(10)} ${form.sector_label} / ${form.stage_label}, ${form.founders.length} founder(s)`);
  }
}

async function knowledge() {
  const memoDoc = await ensureDocument("Deal_Memos.pdf", "memo", null);
  const meetDoc = await ensureDocument("Partner_Meeting_Notes.pdf", "meeting_notes", null);
  const already = (await db.from("memo_chunks").select("id", { count: "exact", head: true })).count;
  if (already) return console.log(`knowledge: already seeded (${already} chunks)`);
  let chunks = 0;
  for (const m of parseMemos(memoDoc.pages)) {
    const row = must(
      await db
        .from("memos")
        .upsert(
          { memo_no: m.memo_no, company: m.company, outcome: m.outcome, sector: m.sector, stage: m.stage, source: m.source, document_id: memoDoc.id, page_from: m.page_from, page_to: m.page_to },
          { onConflict: "memo_no" },
        )
        .select("id")
        .single(),
      `memo ${m.company}`,
    );
    must(await db.from("memo_chunks").insert(m.chunks.map((c) => ({ memo_id: row.id, section: c.section, text: c.text, document_id: memoDoc.id, page_no: c.page_no }))), "memo chunks");
    chunks += m.chunks.length;
  }
  for (const m of parseMeetings(meetDoc.pages)) {
    const row = must(
      await db.from("meetings").upsert({ meeting_no: m.meeting_no, title: m.title, document_id: meetDoc.id, page_no: m.page_no }, { onConflict: "meeting_no" }).select("id").single(),
      `meeting ${m.meeting_no}`,
    );
    must(await db.from("memo_chunks").insert(m.chunks.map((c) => ({ meeting_id: row.id, section: c.section, text: c.text, document_id: meetDoc.id, page_no: c.page_no }))), "meeting chunks");
    chunks += m.chunks.length;
  }
  console.log(`knowledge: 12 memos, 5 meetings, ${chunks} chunks (embeddings are added by the embed step once model keys are set)`);
}

async function portfolio() {
  const rows = JSON.parse(readFileSync(join(ROOT, "seed", "portfolio.json"), "utf8"));
  must(await db.from("portfolio").upsert(rows, { onConflict: "company" }), "portfolio");
  console.log(`portfolio: ${rows.length} companies, each with a source URL`);
}

(async () => {
  await versions();
  await applications();
  await knowledge();
  await portfolio();
  console.log("seed complete");
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
