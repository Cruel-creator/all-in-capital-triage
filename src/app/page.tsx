import { loadPipeline } from "@/lib/data/pipeline";
import { PipelineTable } from "@/components/pipeline-table";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const rows = await loadPipeline();
  const counts = {
    call: rows.filter((r) => r.action === "take_call").length,
    kushal: rows.filter((r) => r.bucket === "flagged").length,
    attention: rows.filter((r) => r.status === "needs_attention").length,
  };
  return (
    <div>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[20px] tracking-[-0.3px]">Pipeline</h1>
          <p className="num text-[13px] text-ink-subtle" aria-live="polite">
            {rows.length} applications · {counts.call} to take the call · {counts.kushal} flagged for Kushal
            {counts.attention ? ` · ${counts.attention} need attention` : ""}
          </p>
        </div>
        <p className="text-[12px] text-ink-subtle">Nothing is advanced or rejected without Kushal.</p>
      </header>
      <PipelineTable rows={rows} />
    </div>
  );
}
