// extract_claims step: one model call per document. Pages are redacted first (founder names → [F1], no contact data).
// Every returned quote is checked verbatim against its page; unverifiable claims are dropped and counted.
// Numbers come back exactly as printed; code (parseAmount) converts units, never the model.
import { z } from "zod";
import { admin, must } from "../db/admin";
import { callModel } from "../llm/gateway";
import { loadPrompt, render } from "../llm/prompts";
import { redact, unredact, type FounderRef } from "../llm/pii";
import { parseAmount } from "../reconcile/money";
import { verifyQuote } from "./verify-quote";

const ClaimOut = z.object({
  text: z.string().min(3),
  metric: z.string().min(2),
  role: z.enum(["stated", "factor", "divisor", "share", "channel_value"]).default("stated"),
  raw_value: z.string().nullable(),
  // validated in code below: text.* claims don't need a unit; numeric claims with a bad unit are dropped, never guessed
  unit: z.string().nullable().default(null),
  bound: z.string().nullable().default("eq"), // validated in code: unreadable bound on a number drops the claim
  qualifier: z.string().nullable().default(null),
  status: z.enum(["not_measured"]).nullable().default(null),
  page: z.number().int().min(1),
  quote: z.string().min(1),
});
const Out = z.object({ claims: z.array(ClaimOut) });
/** v2 (2026-11-20): axis scales copied into values, chart points as *.series, CAC naming, margins as share. */
export const EXTRACT_PROMPT_VERSION = 2;
type ClaimOut = z.infer<typeof ClaimOut>;
const UNITS = ["INR", "count", "share", "pct", "months", "x"] as const;
type Unit = (typeof UNITS)[number];

/** Unit to store, or null if a numeric claim has an unusable unit (claim is then dropped). */
export function normaliseUnit(metric: string, unit: string | null): Unit | null {
  if (unit && (UNITS as readonly string[]).includes(unit)) return unit as Unit;
  if (metric.startsWith("text.")) return "count"; // unit is meaningless for text claims; column is non-null
  return null;
}

const BOUNDS = ["eq", "approx", "lt", "lte", "gt", "gte"] as const;
type Bound = (typeof BOUNDS)[number];
export function normaliseBound(metric: string, bound: string | null): Bound | null {
  if (bound === null || bound === "") return "eq";
  if ((BOUNDS as readonly string[]).includes(bound)) return bound as Bound;
  return metric.startsWith("text.") ? "eq" : null;
}

/** Converts an as-printed value to a number in the claim's unit. Pure; tested. */
export function toNumber(raw: string | null, unit: Unit): number | null {
  if (raw === null) return null;
  const s = raw.replace(/^[~<>≈]|under|about|over|at least|at most/gi, "").trim();
  if (unit === "share") {
    const m = s.match(/(-?\d+(?:\.\d+)?)\s*%/);
    return m ? Number(m[1]) / 100 : null;
  }
  if (unit === "pct") {
    const m = s.match(/(-?\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) : null;
  }
  if (unit === "months" || unit === "x") {
    const m = s.replace(/,/g, "").match(/(-?\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) : null;
  }
  const n = parseAmount(s.replace(/^.*?(?=(?:INR|₹)?\s*-?\d)/i, ""));
  return n;
}

export async function founderRefs(applicationId: string): Promise<FounderRef[]> {
  const rows = must(
    await admin().from("founders").select("id, position, full_name, email, phone").eq("application_id", applicationId).order("position"),
    "founders",
  );
  return rows.map((f) => ({ id: f.id, token: `[F${f.position}]`, full_name: f.full_name, email: f.email, phone: f.phone }));
}

export async function extractClaims(o: { applicationId: string; documentId: string; traceId?: string; spanId?: string }) {
  const db = admin();
  const doc = must(await db.from("documents").select("id, kind, application_id").eq("id", o.documentId).single(), "documents");
  const pages = must(await db.from("pages").select("page_no, text").eq("document_id", o.documentId).order("page_no"), "pages");
  const founders = await founderRefs(o.applicationId);
  const red = new Map(pages.map((p) => [p.page_no as number, redact(p.text as string, founders)]));

  const tpl = loadPrompt("extract_claims", EXTRACT_PROMPT_VERSION);
  const pv = must(await db.from("prompt_versions").select("id").eq("name", tpl.name).eq("version", tpl.version).single(), "prompt_versions");
  const user = render(tpl.user, {
    application_ref: o.applicationId.slice(0, 8),
    doc_kind: doc.kind,
    pages: [...red.entries()].map(([n, t]) => `=== Page ${n} ===\n${t}`).join("\n\n"),
  });

  const verify = (c: ClaimOut) => verifyQuote(red.get(c.page), c.quote);
  const { data } = await callModel({
    step: "extract_claims",
    applicationId: o.applicationId,
    prompt: { name: tpl.name, version: tpl.version, versionId: pv.id, system: tpl.system, user },
    schema: Out,
    founders,
    traceId: o.traceId,
    spanId: o.spanId,
    validate: (out) => {
      const bad = out.claims.filter((c) => !verify(c).ok);
      if (out.claims.length === 0) return "no claims returned";
      if (bad.length / out.claims.length > 0.2)
        return `${bad.length} quotes were not found verbatim on their cited page, e.g. ${bad
          .slice(0, 5)
          .map((c) => `p${c.page} "${c.quote}"`)
          .join("; ")}`;
      return null;
    },
  });

  const kept = data.claims
    .filter((c) => verify(c).ok)
    .flatMap((c) => {
      const unit = normaliseUnit(c.metric, c.unit);
      const bound = normaliseBound(c.metric, c.bound);
      return unit && bound ? [{ ...c, unit, bound }] : [];
    });
  const dropped = data.claims.length - kept.length;
  const prefix = doc.kind === "deck" ? "d" : "f";
  const { count } = await db.from("claims").select("id", { count: "exact", head: true }).eq("source_doc_id", o.documentId);
  if (count) await db.from("claims").delete().eq("source_doc_id", o.documentId); // re-extraction replaces
  const rows = kept.map((c, i) => ({
    application_id: o.applicationId,
    claim_key: `${prefix}${String(i + 1).padStart(2, "0")}`,
    text: unredact(c.text, founders),
    metric: c.metric,
    role: c.role,
    value: toNumber(c.raw_value, c.unit),
    raw_value: c.raw_value,
    unit: c.unit,
    bound: c.bound,
    qualifier: c.qualifier,
    status: c.status,
    source_doc_id: o.documentId,
    page_no: c.page,
    quote: unredact(c.quote, founders),
    quote_verified: true,
    origin: doc.kind === "deck" ? "deck" : "form",
  }));
  if (rows.length) must(await db.from("claims").insert(rows), "claims insert");
  return { kept: rows.length, dropped };
}
