import { loadPipeline } from "@/lib/data/pipeline";
import { PipelineBoard } from "@/components/pipeline-board";
import { callKind } from "@/lib/take";

export const dynamic = "force-dynamic";

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const word = (n: number) => WORDS[n] ?? String(n);

/** The day's read in one sentence, from Riya's three decisions. */
function headline(yes: number, yours: number, no: number) {
  const first = yes === 0 ? "No clear yes yet" : `${word(yes)} clear yes`;
  const rest = yours ? `${word(yours).toLowerCase()} for your call, ${word(no).toLowerCase()} clear no` : `${word(no).toLowerCase()} clear no`;
  return `${first}; ${rest}.`;
}

export default async function PipelinePage() {
  const rows = await loadPipeline();
  const kinds = rows.map((r) => callKind({ action: r.action, bucket: r.bucket, total: r.total }));
  const yes = kinds.filter((k) => k === "yes").length;
  const yours = kinds.filter((k) => k === "your_call").length;
  const no = kinds.filter((k) => k === "no").length;
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });

  return (
    <div>
      <header className="mb-6 flex flex-col gap-3">
        <span className="eyebrow-pill self-start">Today’s read · {today}</span>
        <h1 className="max-w-[820px] font-display text-[40px] font-normal leading-[1.03] tracking-[-0.8px] md:text-[52px]">
          <span className="sr-only">Pipeline: </span>
          {(() => { const [a, b] = headline(yes, yours, no).split("; "); return <>{a};{" "}<em className="text-primary">{b}</em></>; })()}
        </h1>
        <p className="text-[13px] text-ink-subtle">Clear yes and clear no follow the rubric. In the gray area the AI shows which way it leans, and you decide.</p>
      </header>
      <PipelineBoard rows={rows} />
    </div>
  );
}
