// Settings (screen 8): thesis and rubric editor, saved as versions.
import { admin, must } from "@/lib/db/admin";
import { currentUser } from "@/lib/google/session";
import { fmtDate } from "@/components/ui";
import { SettingsEditor } from "./settings-editor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const db = admin();
  const [rubric, thesis, rHist, tHist, user] = await Promise.all([
    db.from("rubric_versions").select("version, config").eq("is_active", true).single(),
    db.from("thesis_versions").select("version, revealed").eq("is_active", true).single(),
    db.from("rubric_versions").select("version, note, created_at, is_active").order("version", { ascending: false }).limit(8),
    db.from("thesis_versions").select("version, note, created_at, is_active").order("version", { ascending: false }).limit(8),
    currentUser(),
  ]);
  const r = must(rubric, "rubric"), t = must(thesis, "thesis");
  const history = [
    ...must(rHist, "history").map((h) => ({ ...h, kind: "Rubric" })),
    ...must(tHist, "history").map((h) => ({ ...h, kind: "Rules" })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="max-w-[1080px] space-y-6">
      <header>
        <h1 className="text-[20px] font-semibold tracking-[-0.3px]">Settings</h1>
        <p className="mt-0.5 text-[14px] text-ink-muted">Changes are saved as new versions. Every score keeps the rubric and prompt version it was made with.</p>
      </header>
      <SettingsEditor rubricVersion={r.version} config={r.config} thesisVersion={t.version} rules={t.revealed.rules} canEdit={!!user?.partner} signedIn={!!user} />
      <section aria-labelledby="h-hist">
        <h2 id="h-hist" className="mb-2 text-[14px] font-semibold">Version history</h2>
        <ul className="elev-1 divide-y divide-hairline rounded-[10px] bg-canvas text-[13px]">
          {history.map((h) => (
            <li key={`${h.kind}${h.version}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span><span className="font-medium">{h.kind} v{h.version}</span>{h.is_active ? <span className="text-green"> · active</span> : ""} <span className="text-ink-muted">{h.note ?? "Initial version from the build prompt"}</span></span>
              <span className="num text-[12px] text-ink-subtle">{fmtDate(h.created_at)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
