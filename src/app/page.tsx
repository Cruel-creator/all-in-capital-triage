import { loadPipeline } from "@/lib/data/pipeline";
import { PipelineBoard } from "@/components/pipeline-board";
import { callKind } from "@/lib/take";
import Link from "next/link";
import { loadMeetings } from "@/lib/data/meetings";
import { formatSlot } from "@/lib/google/slots";

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
  const [rows, meetings] = await Promise.all([loadPipeline(), loadMeetings().catch(() => ({ upcoming: [], waiting: [], needsRiya: [] }))]);
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

      {/* Meetings booked: what the app scheduled on Riya's calendar, at a glance */}
      <section aria-labelledby="h-meetings" className="mb-5 rounded-[20px] bg-canvas px-5 py-4 shadow-[inset_0_0_0_1px_var(--hairline)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="h-meetings" className="font-display text-[22px] font-normal">Meetings booked <span className="num font-sans text-[13px] text-ink-subtle">{meetings.upcoming.length}</span></h2>
          <Link href="/meetings" className="press text-[13px] font-medium text-primary">
            {meetings.waiting.length ? `${meetings.waiting.length} waiting for a reply · ` : ""}{meetings.needsRiya.length ? `${meetings.needsRiya.length} need you · ` : ""}See all
          </Link>
        </div>
        {meetings.upcoming.length ? (
          <ul className="mt-2 divide-y divide-hairline">
            {meetings.upcoming.slice(0, 3).map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13px]">
                <span><Link href={`/applications/${m.applicationId}`} className="font-medium text-ink hover:underline">{m.company}</Link> <span className="num text-ink-muted">· {formatSlot({ start: m.startAt, end: m.endAt })}{m.withAditya ? " · with Aditya" : ""}</span></span>
                {m.meetLink && <a href={m.meetLink} target="_blank" rel="noreferrer" className="press inline-flex h-8 items-center rounded-full bg-solid px-3.5 text-[12px] font-medium text-on-solid">Join Meet</a>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[13px] text-ink-muted">No calls booked yet. When a founder replies with a time you’re free for, it shows up here.</p>
        )}
      </section>

      <PipelineBoard rows={rows} />
    </div>
  );
}
