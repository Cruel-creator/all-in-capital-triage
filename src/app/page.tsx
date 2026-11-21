import { loadPipeline } from "@/lib/data/pipeline";
import { PipelineBoard } from "@/components/pipeline-board";
import { BlurText } from "@/components/bits/blur-text";

export const dynamic = "force-dynamic";

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const word = (n: number) => WORDS[n] ?? String(n);

/** The day's read in one sentence, from the lanes only. */
function headline(call: number, kushal: number, dig: number) {
  const first = call === 0 ? "Nothing strong enough for a call yet" : `${word(call)} worth a call`;
  const rest = kushal ? `${word(kushal).toLowerCase()} need Kushal` : dig ? `${word(dig).toLowerCase()} to dig into` : "the rest are a no for now";
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
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold tracking-[-0.3px]">Pipeline</h1>
          <BlurText as="p" text={headline(call, kushal, dig)} className="mt-0.5 text-[14px] text-ink-muted" delay={0.04} />
        </div>
        <p className="text-[12px] text-ink-subtle">{today} · Every line cites its source. Nothing moves without Kushal.</p>
      </header>
      <PipelineBoard rows={rows} />
    </div>
  );
}
