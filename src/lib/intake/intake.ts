// Turns an upload into a queued application: the same rows the seed writes (applications, founders, documents, pages),
// then one message on the pipeline queue. Server-only (service-role client); called by /apply and /applications/new.
//
// Files never pass through our server's request body (Vercel caps it at 4.5 MB): the browser PUTs each PDF to a
// one-time signed Storage URL under incoming/, then ingest() downloads it, checks it really is a readable PDF,
// moves it to its permanent place and records it. Anything rejected is deleted from incoming/.
import { randomUUID, createHash } from "node:crypto";
import { admin, must } from "../db/admin";
import { extractPages } from "../pdf/extract";
import { enqueue } from "../queue";
import { parseForm, type ParsedForm } from "../seed/parse-form";
import { dedupeKey, founderRows, formPages, type ApplicationFields } from "./form-text";

export const MAX_PDF_MB = 20;
const MAX_PDF_BYTES = MAX_PDF_MB * 1024 * 1024;
const MIN_TEXT_CHARS = 200; // below this the PDF is almost certainly scanned images, which the pipeline can't read
export const PUBLIC_PER_HOUR = 20; // all public submissions together, a brake on spam

const BUCKET = "documents";
const INCOMING = /^incoming\/[0-9a-f-]{36}\.pdf$/;

/** A message that is safe and useful to show the person submitting. */
export class IntakeError extends Error {}

/** A one-time URL the browser uploads one PDF to. Valid for 2 hours; nothing is recorded until ingest(). */
export async function uploadSlot() {
  const path = `incoming/${randomUUID()}.pdf`;
  const r = await admin().storage.from(BUCKET).createSignedUploadUrl(path);
  if (r.error || !r.data) throw new Error(`upload slot: ${r.error?.message ?? "no URL"}`);
  return { path, url: r.data.signedUrl };
}

/** True when public submissions in the last hour have reached the cap. Web forms are stored as form/web-*.txt. */
export async function publicCapReached() {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const r = await admin().from("documents").select("id", { count: "exact", head: true }).like("storage_path", "form/web-%").gte("created_at", since);
  return (r.count ?? 0) >= PUBLIC_PER_HOUR;
}

async function discard(paths: string[]) {
  const p = paths.filter(Boolean);
  if (p.length) await admin().storage.from(BUCKET).remove(p).catch(() => {});
}

/** Downloads one upload and checks it is a PDF we can read. */
async function readUpload(path: string, what: string) {
  if (!INCOMING.test(path)) throw new IntakeError(`The ${what} upload didn't finish. Please add the file again.`);
  const r = await admin().storage.from(BUCKET).download(path);
  if (r.error || !r.data) throw new IntakeError(`The ${what} upload didn't finish. Please add the file again.`);
  const bytes = new Uint8Array(await r.data.arrayBuffer());
  if (bytes.length > MAX_PDF_BYTES) throw new IntakeError(`The ${what} is over ${MAX_PDF_MB} MB. Please send a smaller PDF.`);
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new IntakeError(`The ${what} isn't a PDF. Please export it as a PDF and try again.`);
  let doc;
  try {
    doc = await extractPages(bytes);
  } catch {
    throw new IntakeError(`We couldn't open the ${what}. It may be password-protected or damaged.`);
  }
  if (!doc.pages.length || doc.pages.reduce((n, p) => n + p.text.length, 0) < MIN_TEXT_CHARS)
    throw new IntakeError(`We couldn't read any text in the ${what}. If it's scanned images, please export a PDF with selectable text.`);
  return { bytes, ...doc };
}

type Intake = {
  deckPath: string;
  /** Riya can drop the founder's form PDF instead of typing the fields. */
  formPath?: string;
  fields?: ApplicationFields;
};

/** Records one application and queues it. Throws IntakeError for anything the submitter can fix. */
export async function ingest(o: Intake): Promise<{ applicationId: string; company: string }> {
  const db = admin();
  const incoming = [o.deckPath, o.formPath ?? ""];
  const placed: string[] = [];
  let applicationId: string | null = null;
  try {
    const deck = await readUpload(o.deckPath, "deck");
    const formUpload = o.formPath ? await readUpload(o.formPath, "form") : null;
    if (!formUpload && !o.fields) throw new IntakeError("Fill in the form, or add the founder's form PDF.");

    // the form, as page text the pipeline reads (a PDF form as extracted, a web form as generated)
    const pages = formUpload ? formUpload.pages : formPages(o.fields!);
    const form: ParsedForm = parseForm(pages);
    const company = form.company_name.trim();
    if (!company) throw new IntakeError("We couldn't find the company name in the form PDF. Please fill in the form instead.");
    const key = dedupeKey(company);

    const dupApp = (await db.from("applications").select("id").eq("dedupe_key", key).maybeSingle()).data;
    if (dupApp) throw new IntakeError(`We already have an application from ${company}. To update it, reply to the email thread instead.`);
    const dupDeck = (await db.from("documents").select("id").eq("sha256", deck.sha256).maybeSingle()).data;
    if (dupDeck) throw new IntakeError("This exact deck was already submitted.");

    const rubric = must(await db.from("rubric_versions").select("id").eq("is_active", true).single(), "active rubric");
    const thesis = must(await db.from("thesis_versions").select("id").eq("is_active", true).single(), "active thesis");

    const app = must(
      await db.from("applications").insert({
        company_name: company,
        one_liner: form.one_liner,
        sector_label: form.sector_label,
        stage_label: form.stage_label,
        source: form.source,
        intro_by: form.intro_by,
        dedupe_key: key,
        rubric_version_id: rubric.id,
        thesis_version_id: thesis.id,
        status: "queued",
      }).select("id").single(),
      "application",
    );
    applicationId = app.id as string;

    const founders = o.fields && !formUpload
      ? founderRows(o.fields)
      : form.founders.map((f) => ({ position: f.position, full_name: f.full_name, role_title: f.role_title, email: null, linkedin_url: f.linkedin_url }));
    if (founders.length) must(await db.from("founders").insert(founders.map((f) => ({ ...f, application_id: applicationId }))), "founders");

    // deck: move from incoming/ to its permanent, content-addressed path
    const deckPath = `deck/${deck.sha256}.pdf`;
    const mv = await db.storage.from(BUCKET).move(o.deckPath, deckPath);
    if (mv.error) throw new Error(`storing the deck: ${mv.error.message}`);
    placed.push(deckPath);
    await record(applicationId, "deck", `${company} deck.pdf`, deckPath, deck.sha256, deck.pages);

    if (formUpload) {
      const formPath = `form/${formUpload.sha256}.pdf`;
      const fm = await db.storage.from(BUCKET).move(o.formPath!, formPath);
      if (fm.error) throw new Error(`storing the form: ${fm.error.message}`);
      placed.push(formPath);
      await record(applicationId, "form", `${company} form.pdf`, formPath, formUpload.sha256, formUpload.pages);
    } else {
      const body = pages.map((p) => p.text).join("\n\f\n");
      const sha = createHash("sha256").update(body).digest("hex");
      const formPath = `form/web-${sha}.txt`;
      const up = await db.storage.from(BUCKET).upload(formPath, new TextEncoder().encode(body), { contentType: "text/plain; charset=utf-8", upsert: false });
      if (up.error) throw new Error(`storing the form: ${up.error.message}`);
      placed.push(formPath);
      await record(applicationId, "form", `${company} web form.txt`, formPath, sha, pages);
    }

    await enqueue([applicationId]);
    return { applicationId, company };
  } catch (e) {
    // leave nothing half-made: the application row cascades to founders, documents and pages
    if (applicationId) await db.from("applications").delete().eq("id", applicationId);
    await discard(placed);
    throw e;
  } finally {
    await discard(incoming); // moved files are already gone from incoming/; this clears rejected ones
  }
}

async function record(applicationId: string, kind: "deck" | "form", fileName: string, storagePath: string, sha256: string, pages: { page_no: number; text: string }[]) {
  const db = admin();
  const doc = must(
    await db.from("documents").insert({
      application_id: applicationId,
      kind,
      file_name: fileName,
      storage_path: storagePath,
      sha256,
      page_count: pages.length,
      raw_text: pages.map((p) => p.text).join("\n\f\n"),
    }).select("id").single(),
    `document ${kind}`,
  );
  must(await db.from("pages").insert(pages.map((p) => ({ document_id: doc.id, page_no: p.page_no, text: p.text }))), `pages ${kind}`);
}
