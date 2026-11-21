// Server-only data loaders for the UI. Founder contact details are never selected here.
import { admin, must } from "../db/admin";

export type PipelineRow = {
  id: string;
  company: string;
  one_liner: string | null;
  sector_label: string | null;
  sector: string | null;
  source: "form" | "warm_intro";
  received_at: string;
  status: "queued" | "processing" | "scored" | "needs_attention";
  status_reason: string | null;
  current_step: string | null;
  total: number | null;
  written_total: number | null;
  founder: number | null;
  market: number | null;
  weights: Record<string, number> | null;
  crit: Record<string, number>;
  coverage: number | null;
  written_fit: "in" | "stretch" | "outside" | null;
  bucket: "clear" | "flagged" | "outside_mandate" | null;
  action: "take_call" | "dig" | "pass" | null;
  gates: string[];
};

export async function loadPipeline(): Promise<PipelineRow[]> {
  const db = admin();
  const [apps, scores, recs, gates, crits] = await Promise.all([
    db.from("applications").select("id, company_name, one_liner, sector_label, sector_inferred, source, received_at, status, status_reason, current_step").eq("is_synthetic", false), // volume-test variants stay out of the pipeline
    db.from("scores").select("application_id, view, total, founder_subtotal, market_subtotal, weights_used, evidence_coverage_pct, written_fit"),
    db.from("recommendations").select("application_id, bucket, action"),
    db.from("gates").select("application_id, gate, tripped"),
    db.from("criterion_scores").select("application_id, criterion, score").eq("is_current", true),
  ]);
  const a = must(apps, "applications");
  const s = must(scores, "scores");
  const r = must(recs, "recommendations");
  const g = must(gates, "gates");
  const c = must(crits, "criterion scores");
  const rows = a.map((x) => {
    const rev = s.find((y) => y.application_id === x.id && y.view === "revealed");
    const wr = s.find((y) => y.application_id === x.id && y.view === "written");
    const rec = r.find((y) => y.application_id === x.id);
    return {
      id: x.id,
      company: x.company_name,
      one_liner: x.one_liner,
      sector_label: x.sector_label,
      sector: x.sector_inferred,
      source: x.source,
      received_at: x.received_at,
      status: x.status,
      status_reason: x.status_reason,
      current_step: x.current_step,
      total: rev ? Number(rev.total) : null,
      written_total: wr ? Number(wr.total) : null,
      founder: rev ? Number(rev.founder_subtotal) : null,
      market: rev ? Number(rev.market_subtotal) : null,
      weights: rev?.weights_used ?? null,
      crit: Object.fromEntries(c.filter((y) => y.application_id === x.id).map((y) => [y.criterion, Number(y.score)])),
      coverage: rev?.evidence_coverage_pct ?? null,
      written_fit: rev?.written_fit ?? null,
      bucket: rec?.bucket ?? null,
      action: rec?.action ?? null,
      gates: g.filter((y) => y.application_id === x.id && y.tripped).map((y) => y.gate).sort(),
    } satisfies PipelineRow;
  });
  // §5c: bucket order, then score, then evidence coverage, then date received
  const order = { clear: 0, flagged: 1, outside_mandate: 2 } as const;
  return rows.sort(
    (p, q) =>
      (p.bucket ? order[p.bucket as keyof typeof order] : 3) - (q.bucket ? order[q.bucket as keyof typeof order] : 3) ||
      (q.total ?? -1) - (p.total ?? -1) ||
      (q.coverage ?? -1) - (p.coverage ?? -1) ||
      p.received_at.localeCompare(q.received_at),
  );
}
