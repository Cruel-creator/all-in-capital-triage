// Settings (screen 8): thesis and rubric editor. Changes are still saved as versions behind the scenes, so every score
// keeps the rubric it was made with; the version list itself isn't shown.
import { admin, must } from "@/lib/db/admin";
import { currentUser } from "@/lib/google/session";
import { SettingsEditor } from "./settings-editor";
import Link from "next/link";
import { fmtDate } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const db = admin();
  const [rubric, thesis, user, cal] = await Promise.all([
    db.from("rubric_versions").select("version, config").eq("is_active", true).single(),
    db.from("thesis_versions").select("version, revealed").eq("is_active", true).single(),
    currentUser(),
    db.from("calibration_runs").select("agreement_pct, created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const r = must(rubric, "rubric"), t = must(thesis, "thesis");
  const lastRun = cal.data as { agreement_pct: number; created_at: string } | null;

  return (
    <div className="max-w-[1080px] space-y-6">
      <header>
        <h1 className="font-display text-[36px] font-normal leading-[1.05] tracking-[-0.6px]">Settings</h1>
        <p className="mt-1 text-[14px] text-ink-muted">How applications are scored and which fund rules flag them for a closer look.</p>
      </header>
      <SettingsEditor rubricVersion={r.version} config={r.config} thesisVersion={t.version} rules={t.revealed.rules} canEdit={!!user?.partner} signedIn={!!user} />
      {/* Calibration lives here rather than in the main menu: it matters after a rubric change, not day to day */}
      <section aria-labelledby="h-calibration" className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-canvas px-5 py-4 shadow-[inset_0_0_0_1px_var(--hairline)]">
        <div>
          <h2 id="h-calibration" className="font-display text-[22px] font-normal">Check the AI against past deals</h2>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            The AI scores the fund’s 12 past deal memos without seeing the outcome, and we compare its calls with what the fund decided. Re-run it after changing the rubric.
            {lastRun && <> Last run: <span className="num font-medium text-ink">{Math.round(lastRun.agreement_pct)}% agreement</span>, {fmtDate(lastRun.created_at)}.</>}
          </p>
        </div>
        <Link href="/calibration" className="press inline-flex h-9 shrink-0 items-center rounded-full px-4 text-[13px] font-medium text-ink shadow-[0_0_0_1px_var(--hairline)] hover:bg-surface-1">
          Open calibration
        </Link>
      </section>
    </div>
  );
}
