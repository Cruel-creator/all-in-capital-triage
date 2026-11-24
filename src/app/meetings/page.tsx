// Meetings: everything that happens after Riya sends a letter, in one place. Calls the app booked on her calendar
// (with the Meet link), invites still waiting for the founder's reply, and replies the app couldn't read.
import Link from "next/link";
import { loadMeetings } from "@/lib/data/meetings";
import { formatSlot } from "@/lib/google/slots";

export const dynamic = "force-dynamic";

const when = (iso: string) => formatSlot({ start: iso, end: iso });
const ago = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};

export default async function MeetingsPage() {
  const { upcoming, waiting, needsRiya } = await loadMeetings();
  return (
    <div className="max-w-[1080px] space-y-6">
      <header>
        <h1 className="font-display text-[36px] font-normal leading-[1.05] tracking-[-0.6px]">Meetings</h1>
        <p className="mt-1 text-[14px] text-ink-muted">After you send a letter, the app reads the founder’s reply every 5 minutes and books the call on your calendar.</p>
      </header>

      <section aria-labelledby="h-booked" className="space-y-2.5">
        <h2 id="h-booked" className="font-display text-[24px] font-normal">Booked <span className="num font-sans text-[13px] text-ink-subtle">{upcoming.length}</span></h2>
        {upcoming.length ? (
          <div className="tray"><ul className="tray-in divide-y divide-hairline">
            {upcoming.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <Link href={`/applications/${m.applicationId}`} className="font-display text-[20px] leading-tight hover:underline">{m.company}</Link>
                  <p className="num mt-0.5 text-[13px] text-ink-muted">{when(m.startAt)} · 30 minutes{m.withAditya ? " · with Aditya" : ""}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {m.meetLink && <a href={m.meetLink} target="_blank" rel="noreferrer" className="press inline-flex h-9 items-center rounded-full bg-solid px-4 text-[13px] font-medium text-on-solid">Join Meet</a>}
                  {m.eventLink && <a href={m.eventLink} target="_blank" rel="noreferrer" className="press inline-flex h-9 items-center rounded-full px-4 text-[13px] text-ink-muted shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-surface-1">Open in Calendar</a>}
                </div>
              </li>
            ))}
          </ul></div>
        ) : (
          <p className="rounded-[16px] bg-surface-1 px-5 py-4 text-[13px] text-ink-muted">No calls booked yet. When a founder replies with a time you’re free for, it appears here and on your Google Calendar.</p>
        )}
      </section>

      {needsRiya.length > 0 && (
        <section aria-labelledby="h-needs" className="space-y-2.5">
          <h2 id="h-needs" className="font-display text-[24px] font-normal">Replies that need you <span className="num font-sans text-[13px] text-ink-subtle">{needsRiya.length}</span></h2>
          <div className="tray"><ul className="tray-in divide-y divide-hairline">
            {needsRiya.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <Link href={`/applications/${t.applicationId}`} className="font-display text-[20px] leading-tight hover:underline">{t.company}</Link>
                  <p className="mt-0.5 text-[13px] text-amber">The founder replied without a clear time. Read it in Gmail and answer there.</p>
                </div>
              </li>
            ))}
          </ul></div>
        </section>
      )}

      <section aria-labelledby="h-waiting" className="space-y-2.5">
        <h2 id="h-waiting" className="font-display text-[24px] font-normal">Waiting for the founder <span className="num font-sans text-[13px] text-ink-subtle">{waiting.length}</span></h2>
        {waiting.length ? (
          <div className="tray"><ul className="tray-in divide-y divide-hairline">
            {waiting.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <Link href={`/applications/${t.applicationId}`} className="font-display text-[20px] leading-tight hover:underline">{t.company}</Link>
                  <p className="mt-0.5 text-[13px] text-ink-muted">
                    {t.state === "counter_proposed" ? "Their time clashed, so two new times were offered" : "Letter sent"} {ago(t.sentAt)}
                    {t.offered.length === 2 && <span className="num"> · offered {when(t.offered[0].start)} or {when(t.offered[1].start)}</span>}
                  </p>
                </div>
              </li>
            ))}
          </ul></div>
        ) : (
          <p className="rounded-[16px] bg-surface-1 px-5 py-4 text-[13px] text-ink-muted">Nothing waiting. Send a call invite from a company’s page and it shows here until the founder replies.</p>
        )}
      </section>
    </div>
  );
}
