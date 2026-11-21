// rank step (build prompt §5c): pure maths over current criterion scores and gates. No model.
import { admin, must } from "../db/admin";
import {
  CRITERIA, FOUNDER, MARKET, actionOf, bucketOf, coverage, lensFor, lensWeights, topRules, weighted, writtenFit,
  type CritScore, type Criterion, type Gates,
} from "../scoring/rank";

export async function runRank(applicationId: string) {
  const db = admin();
  const app = must(await db.from("applications").select("id, sector_inferred, sector_label, sector_reason, sector_label_matches").eq("id", applicationId).single(), "application");
  const rv = must(await db.from("rubric_versions").select("id, config").eq("is_active", true).single(), "rubric");
  const tv = must(await db.from("thesis_versions").select("written").eq("is_active", true).single(), "thesis");
  const rubric = rv.config;
  const rows = must(
    await db.from("criterion_scores").select("criterion, score, confidence, rules_applied, status, precedent_memo_id, precedent_note, question_for_call, gap").eq("application_id", applicationId).eq("is_current", true),
    "criterion scores",
  );
  const gateRows = must(await db.from("gates").select("gate, tripped").eq("application_id", applicationId), "gates");
  const memos = must(await db.from("memos").select("id, company, outcome"), "memos");

  const scores: CritScore[] = rows.map((r) => ({ criterion: r.criterion, score: Number(r.score), confidence: r.confidence, rules: r.rules_applied ?? [], needsAttention: r.status === "needs_attention" }));
  const gates = Object.fromEntries(["G1", "G2", "G3", "G4"].map((g) => [g, !!gateRows.find((x) => x.gate === g)?.tripped])) as Gates;
  const sector = (app.sector_inferred ?? app.sector_label ?? "other").toLowerCase();
  const lensKey = lensFor(sector, rubric.sector_lens_map);
  const base = Object.fromEntries(CRITERIA.map((c) => [c, rubric.criteria[c].weight])) as Record<Criterion, number>;
  const weights = lensWeights(base, lensKey ? rubric.lenses[lensKey] : null);
  const writtenWeights = lensWeights(rubric.written_view.weights, null);

  const total = weighted(scores, weights);
  const fit = writtenFit(sector, tv.written.sectors);
  const fitReason =
    `${fit === "in" ? "In" : fit === "stretch" ? "A stretch for" : "Outside"} the written thesis sectors (${tv.written.sectors.in.join(", ")}): classified as ${sector}` +
    (app.sector_label_matches === false ? `, though labelled "${app.sector_label}". ${app.sector_reason ?? ""}` : ".");
  const bucket = bucketOf(gates, fit);
  const action = actionOf(total, gates, scores, { call: rubric.recommendation.take_call.min_score, dig: rubric.recommendation.dig.min_score });
  const cov = coverage(scores);

  const scoreRows = [
      {
        application_id: applicationId, view: "revealed", total, founder_subtotal: weighted(scores, weights, FOUNDER), market_subtotal: weighted(scores, weights, MARKET),
        weights_used: weights, lens: lensKey, evidence_coverage_pct: cov, written_fit: fit, written_fit_reason: fitReason, rubric_version_id: rv.id,
      },
      {
        application_id: applicationId, view: "written", total: weighted(scores, writtenWeights), founder_subtotal: weighted(scores, writtenWeights, FOUNDER),
        market_subtotal: weighted(scores, writtenWeights, MARKET), weights_used: writtenWeights, lens: null, evidence_coverage_pct: cov, written_fit: fit,
        written_fit_reason: fitReason, rubric_version_id: rv.id,
      },
  ];

  // weakest criteria first: the questions that would move the score most
  const byImpact = [...rows].sort((a, b) => weights[a.criterion as Criterion] * Number(a.score) - weights[b.criterion as Criterion] * Number(b.score));
  const precedents = rows
    .filter((r) => r.precedent_memo_id)
    .map((r) => ({ criterion: r.criterion, memo_id: r.precedent_memo_id, company: memos.find((m) => m.id === r.precedent_memo_id)?.company, outcome: memos.find((m) => m.id === r.precedent_memo_id)?.outcome, note: r.precedent_note }));
  const recRow = {
      application_id: applicationId,
      bucket,
      action,
      top_rules: topRules(scores, weights),
      precedents,
      dig_questions: action === "pass" ? [] : byImpact.map((r) => r.question_for_call).filter(Boolean).slice(0, action === "dig" ? 3 : 2),
      what_would_change: action === "pass" ? byImpact.slice(0, 3).map((r) => r.gap ?? r.question_for_call).filter(Boolean).join(" ") || null : null,
  };
  // scores and the recommendation are replaced together, in one transaction
  must(await db.rpc("replace_rank", { app: applicationId, score_rows: scoreRows, rec: recRow }), "replace rank");

  const attention = scores.filter((s) => s.needsAttention).map((s) => s.criterion);
  must(
    await db
      .from("applications")
      .update({
        status: attention.length ? "needs_attention" : "scored",
        status_reason: attention.length ? `Criteria ${attention.join(", ")} could not be scored with cited evidence; floor score applied pending review.` : null,
        current_step: "rank",
      })
      .eq("id", applicationId),
    "status",
  );
  return { total, bucket, action, fit, lens: lensKey, coverage: cov };
}
