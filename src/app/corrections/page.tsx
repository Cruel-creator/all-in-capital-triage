// Corrections log (build prompt §7, screen 5): every override, who made it and why, and where it was reused.
import Link from "next/link";
import { admin, must } from "@/lib/db/admin";
import { personName } from "@/lib/corrections";
import { Badge, CRIT_NAMES, fmtDate } from "@/components/ui";

export const dynamic = "force-dynamic";

type Row = {
  id: string; criterion: string; old_score: number; new_score: number; reason: string; tags: string[]; pattern: string | null;
  by_email: string | null; reuse_count: number; created_at: string; application_id: string; applications: { company_name: string } | null;
};

export default async function CorrectionsPage() {
  const db = admin();
  const rows = must(
    await db.from("corrections").select("id, criterion, old_score, new_score, reason, tags, pattern, by_email, reuse_count, created_at, application_id, applications(company_name)").order("created_at", { ascending: false }),
    "corrections",
  ) as unknown as Row[];
  const uses = rows.length
    ? (must(await db.from("correction_applications").select("correction_id, application_id, applications(company_name)").in("correction_id", rows.map((r) => r.id)), "uses") as unknown as { correction_id: string; application_id: string; applications: { company_name: string } | null }[])
    : [];

  return (
    <div className="max-w-[960px]">
      <header className="mb-5">
        <h1 className="text-[20px] font-semibold tracking-[-0.3px]">Corrections</h1>
        <p className="mt-0.5 text-[14px] text-ink-muted">When a partner or Riya overrides a score, the reason is remembered and shown to the scorer on similar companies.</p>
      </header>
      {rows.length === 0 ? (
        <div className="elev-1 rounded-[8px] bg-canvas p-8 text-center">
          <p className="font-medium">No corrections yet</p>
          <p className="mt-1 text-[13px] text-ink-muted">Open an application and use Override on any criterion. A one-line reason is required, and it’s what teaches the scorer.</p>
          <Link href="/" className="press mt-3 inline-flex h-8 items-center rounded-[6px] bg-primary px-3 text-[13px] font-medium text-on-primary hover:bg-primary-hover">Go to the pipeline</Link>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => {
            const reused = [...new Map(uses.filter((u) => u.correction_id === r.id).map((u) => [u.application_id, u.applications?.company_name ?? "Unknown"])).values()];
            const up = Number(r.new_score) > Number(r.old_score);
            return (
              <li key={r.id} className="elev-1 rounded-[8px] bg-canvas p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[14px]">
                    <Link href={`/applications/${r.application_id}`} className="font-semibold hover:text-primary">{r.applications?.company_name ?? "Unknown"}</Link>
                    <span className="text-ink-muted"> · {CRIT_NAMES[r.criterion]} </span>
                    <span className={up ? "text-green" : "text-amber"}>{up ? "raised" : "lowered"}</span>
                    <span className="num text-ink-subtle"> ({Number(r.old_score).toFixed(1)} → {Number(r.new_score).toFixed(1)})</span>
                  </p>
                  <span className="text-[12px] text-ink-subtle">{personName(r.by_email)} · {fmtDate(r.created_at)}</span>
                </div>
                <p className="mt-1.5 text-[13px] text-ink">“{r.reason}”</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap gap-1">{r.tags.map((t) => <Badge key={t}><span className="font-mono">{t}</span></Badge>)}</span>
                  <span className="text-[12px] text-ink-muted">{reused.length === 0 ? "Not reused yet" : `Reused on ${reused.join(", ")}`}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
