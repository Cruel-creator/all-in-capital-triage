// Server-only loader for the Meetings page and the pipeline strip: calls booked on Riya's calendar, invites waiting
// for a founder's reply, and replies that need her. Founder email is shown only where Riya already sent to it.
import { admin, must } from "../db/admin";

export type BookedMeeting = { id: string; applicationId: string; company: string; startAt: string; endAt: string; withAditya: boolean; meetLink: string | null; eventLink: string | null };
export type OpenThread = { id: string; applicationId: string; company: string; state: string; sentAt: string; offered: { start: string; end: string }[]; founderEmail: string | null };

export async function loadMeetings(now = new Date()) {
  const db = admin();
  const since = new Date(now.getTime() - 864e5).toISOString(); // keep today's calls visible after they start
  const [booked, threads] = await Promise.all([
    db.from("meetings_booked").select("id, application_id, start_at, end_at, includes_aditya, meet_link, event_link, applications(company_name)").gte("start_at", since).order("start_at"),
    db.from("threads").select("id, application_id, state, created_at, pending_action, context, founder_email, applications(company_name)").in("state", ["sent", "followed_up", "counter_proposed", "replied"]).order("created_at", { ascending: false }),
  ]);
  const name = (r: { applications: unknown }) => ((Array.isArray(r.applications) ? r.applications[0] : r.applications) as { company_name?: string } | null)?.company_name ?? "Unknown company";
  const upcoming: BookedMeeting[] = must(booked, "meetings").map((m) => ({
    id: m.id, applicationId: m.application_id, company: name(m), startAt: m.start_at, endAt: m.end_at, withAditya: !!m.includes_aditya, meetLink: m.meet_link ?? null, eventLink: m.event_link ?? null,
  }));
  const open = must(threads, "threads").map((t) => ({
    id: t.id, applicationId: t.application_id, company: name(t), state: t.state as string, sentAt: t.created_at,
    offered: ((t.context as { offered?: { start: string; end: string }[] })?.offered ?? []), founderEmail: t.founder_email ?? null,
    pending: t.pending_action as string | null,
  }));
  return {
    upcoming,
    waiting: open.filter((t) => t.state !== "replied") as OpenThread[],
    needsRiya: open.filter((t) => t.state === "replied" && !t.pending) as OpenThread[],
  };
}
