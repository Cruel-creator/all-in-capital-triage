// Portfolio (screen 6): editable, a source on every row. The conflict gate reads this list.
import { admin, must } from "@/lib/db/admin";
import { currentUser } from "@/lib/google/session";
import { PortfolioEditor, type PortfolioRow } from "./portfolio-editor";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const rows = must(await admin().from("portfolio").select("id, company, one_liner, sector, status, tags, source_url, source_note, website, updated_at").order("company"), "portfolio") as PortfolioRow[];
  const user = await currentUser();
  return (
    <div className="max-w-[1080px]">
      <header className="mb-5">
        <h1 className="font-display text-[36px] font-normal leading-[1.05] tracking-[-0.6px]">Portfolio</h1>
        <p className="mt-1 text-[14px] text-ink-muted">New applicants are checked against this list for conflicts.</p>
      </header>
      <PortfolioEditor rows={rows} canEdit={!!user} />
    </div>
  );
}
