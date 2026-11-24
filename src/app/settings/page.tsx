// Settings (screen 8): thesis and rubric editor. Changes are still saved as versions behind the scenes, so every score
// keeps the rubric it was made with; the version list itself isn't shown.
import { admin, must } from "@/lib/db/admin";
import { currentUser } from "@/lib/google/session";
import { SettingsEditor } from "./settings-editor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const db = admin();
  const [rubric, thesis, user] = await Promise.all([
    db.from("rubric_versions").select("version, config").eq("is_active", true).single(),
    db.from("thesis_versions").select("version, revealed").eq("is_active", true).single(),
    currentUser(),
  ]);
  const r = must(rubric, "rubric"), t = must(thesis, "thesis");

  return (
    <div className="max-w-[1080px] space-y-6">
      <header>
        <h1 className="font-display text-[36px] font-normal leading-[1.05] tracking-[-0.6px]">Settings</h1>
        <p className="mt-1 text-[14px] text-ink-muted">How applications are scored and which fund rules flag them for a closer look.</p>
      </header>
      <SettingsEditor rubricVersion={r.version} config={r.config} thesisVersion={t.version} rules={t.revealed.rules} canEdit={!!user?.partner} signedIn={!!user} />
    </div>
  );
}
