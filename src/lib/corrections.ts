// Corrections that are remembered (build prompt §7). A person overrides a criterion score with a required one-line
// reason and tags; the correction is embedded, and the three most similar ones are shown to the scorer as examples
// when it scores a similar company. The UI then says which correction was applied and whose it was.
import { admin, must } from "./db/admin";
import { embed } from "./llm/gateway";
import { similarCorrections } from "./retrieval";

export const PATTERNS = [
  "missing-repeat-rate", "credentials-over-evidence", "cac-not-measured", "top-down-market",
  "single-dependency", "regulatory-exposure", "founder-insight", "customer-pull-proven",
] as const;

/** Below this similarity a past correction is about something else and is not shown to the scorer. Measured live:
 *  a team correction on one lending company scored 0.71 against another lender's team and 0.56 against a consumer
 *  brand's execution. A correction carries to a different criterion only when it is a much closer match. */
export const MIN_SIMILARITY = 0.6;
export const MIN_SIMILARITY_OTHER_CRITERION = 0.72;
export const appliesTo = (criterion: string, hit: { criterion: string; similarity: number }) =>
  hit.similarity >= (hit.criterion === criterion ? MIN_SIMILARITY : MIN_SIMILARITY_OTHER_CRITERION);

/** Replaces the corrected company's founder names so they never reach a model (non-negotiable 5). Pure; tested. */
export function redactFounders(text: string, founders: string[]): string {
  let out = text;
  for (const full of founders) {
    const parts = full.replace(/^Dr\.?\s*/i, "").split(/\s+/).filter((p) => p.length > 1);
    for (const p of [full, ...parts].sort((a, b) => b.length - a.length)) {
      out = out.replace(new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "the founder");
    }
  }
  return out.replace(/\b(the founder)(\s+the founder)+\b/gi, "$1");
}

/** The text a correction is embedded and retrieved by: same shape as the scorer's query, plus the lesson. */
export const correctionKey = (o: { criterion: string; criterionName: string; sector: string; oneLiner: string; reason: string; tags: string[] }) =>
  `${o.criterion} ${o.criterionName} ${o.sector} ${o.oneLiner} ${o.reason} ${o.tags.join(" ")}`;

export async function overrideCriterion(o: {
  applicationId: string; criterion: string; newScore: number; reason: string; tags: string[]; pattern: string | null; actor: string;
}) {
  const db = admin();
  if (!(o.newScore >= 0 && o.newScore <= 10)) throw new Error("The score must be between 0 and 10.");
  const reason = o.reason.trim().replace(/\s+/g, " ");
  if (!reason) throw new Error("Add a one-line reason: corrections without a reason can't teach the scorer anything.");
  if (reason.length > 280) throw new Error("Keep the reason to one line (under 280 characters).");

  const cur = must(
    await db.from("criterion_scores").select("*").eq("application_id", o.applicationId).eq("criterion", o.criterion).eq("is_current", true).single(),
    "current score",
  );
  const app = must(await db.from("applications").select("company_name, one_liner, sector_inferred, sector_label").eq("id", o.applicationId).single(), "application");
  const founders = must(await db.from("founders").select("full_name").eq("application_id", o.applicationId), "founders").map((f) => f.full_name as string);
  const rubric = must(await db.from("rubric_versions").select("config").eq("is_active", true).single(), "rubric").config;
  const score = Math.round(o.newScore * 10) / 10;
  const sector = app.sector_inferred ?? app.sector_label ?? "other";

  // the override becomes the current score; the machine score stays in history
  const { id: _old, created_at: _c, ...copy } = cur;
  void _old; void _c;
  // only one current score per criterion (unique index): retire first, put it back if the insert fails
  must(await db.from("criterion_scores").update({ is_current: false }).eq("id", cur.id), "retire machine score");
  const ins = await db.from("criterion_scores").insert({
    ...copy, score, is_override: true, supersedes: cur.id, is_current: true, override_by_email: o.actor, override_reason: reason, applied_corrections: [],
  }).select("id").single();
  if (ins.error || !ins.data) {
    await db.from("criterion_scores").update({ is_current: true }).eq("id", cur.id);
    throw new Error(`Couldn't save the override: ${ins.error?.message ?? "no row returned"}`);
  }
  const next = ins.data;

  const forModel = redactFounders(reason, founders);
  const [vec] = await embed({
    step: "embed:correction", applicationId: o.applicationId,
    inputs: [correctionKey({ criterion: o.criterion, criterionName: rubric.criteria[o.criterion].name, sector, oneLiner: app.one_liner ?? "", reason: forModel, tags: o.tags })],
  });
  must(
    await db.from("corrections").insert({
      criterion_score_id: next.id, application_id: o.applicationId, by_email: o.actor, criterion: o.criterion,
      old_score: cur.score, new_score: score, reason, reason_for_model: forModel, tags: o.tags, sector, pattern: o.pattern,
      embedding: `[${vec.join(",")}]`,
    }),
    "correction",
  );
  await db.from("timeline_events").insert({ application_id: o.applicationId, kind: "score_overridden", payload: { criterion: o.criterion, from: Number(cur.score), to: score, by: o.actor } });
  return { from: Number(cur.score), to: score };
}

export type AppliedCorrection = { id: string; company: string; by: string; criterion: string; reason: string; from: number; to: number };

/** "kushal@fund.com" → "Kushal". Display only. */
export const personName = (email: string | null) => (email ? email.split("@")[0].split(/[._-]/)[0].replace(/^\w/, (c) => c.toUpperCase()) : "a partner");

/** Up to three past corrections on similar companies (never the company being scored), with who made them. */
export async function correctionsFor(criterion: string, query: string, applicationId: string): Promise<AppliedCorrection[]> {
  const hits = (await similarCorrections(query, 8, applicationId)).filter((h) => h.application_id !== applicationId && appliesTo(criterion, h)).slice(0, 3);
  if (!hits.length) return [];
  const rows = must(await admin().from("corrections").select("id, by_email, reason_for_model, applications(company_name)").in("id", hits.map((h) => h.id)), "corrections");
  return hits.map((h) => {
    const r = rows.find((x) => x.id === h.id) as unknown as { by_email: string | null; reason_for_model: string | null; applications: { company_name: string } | null } | undefined;
    return { id: h.id, company: r?.applications?.company_name ?? "another company", by: personName(r?.by_email ?? null), criterion: h.criterion, reason: r?.reason_for_model ?? h.reason, from: Number(h.old_score), to: Number(h.new_score) };
  });
}

/** After scoring: remember which corrections each score was shown, and count the reuse. */
export async function recordApplied(rows: { id: string; application_id: string; applied_corrections: AppliedCorrection[] }[]) {
  const db = admin();
  const links = rows.flatMap((r) => r.applied_corrections.map((c) => ({ correction_id: c.id, application_id: r.application_id, criterion_score_id: r.id })));
  if (!links.length) return;
  must(await db.from("correction_applications").insert(links), "correction applications");
  const counts = new Map<string, number>();
  for (const l of links) counts.set(l.correction_id, (counts.get(l.correction_id) ?? 0) + 1);
  for (const [id, n] of counts) {
    const cur = (await db.from("corrections").select("reuse_count").eq("id", id).single()).data?.reuse_count ?? 0;
    await db.from("corrections").update({ reuse_count: cur + n }).eq("id", id);
  }
}
