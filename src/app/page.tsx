import { loadPipeline } from "@/lib/data/pipeline";
import { PipelineBoard } from "@/components/pipeline-board";

export const dynamic = "force-dynamic";

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const word = (n: number) => WORDS[n] ?? String(n);

/** The day's read in one sentence, from the lanes only. */
function headline(call: number, kushal: number, dig: number) {
  const first = call === 0 ? "Nothing strong enough for a call yet" : `${word(call)} worth a call`;
  const rest = kushal ? `${word(kushal).toLowerCase()} to check first` : dig ? `${word(dig).toLowerCase()} to dig into` : "the rest are a no for now";
  return `${first}; ${rest}.`;
}

export default async function PipelinePage() {
  const rows = await loadPipeline();
  const call = rows.filter((r) => r.action === "take_call" && r.bucket === "clear").length;
  const kushal = rows.filter((r) => r.bucket === "flagged" || r.bucket === "outside_mandate").length;
  const dig = rows.filter((r) => r.action === "dig" && r.bucket === "clear").length;
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });

  return (
    <div>
      <header className="mb-6 flex flex-col gap-3">
        <span className="eyebrow-pill self-start">Today’s read · {today}</span>
        <h1 className="max-w-[820px] font-display text-[40px] font-normal leading-[1.03] tracking-[-0.8px] md:text-[52px]">
          <span className="sr-only">Pipeline: </span>
          {(() => { const [a, b] = headline(call, kushal, dig).split("; "); return <>{a};{" "}<em className="text-primary">{b}</em></>; })()}
        </h1>
        <p className="text-[13px] text-ink-subtle">You decide. Once you send the letter, the app books the meeting.</p>
      </header>
      <PipelineBoard rows={rows} />
    </div>
  );
}
