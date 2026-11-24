"use server";
// Portfolio edits (screen 6). Every row needs a source. Saving re-embeds the row so the conflict gate (G3)
// compares applicants against what's written here.
import { revalidatePath } from "next/cache";
import { admin, must } from "@/lib/db/admin";
import { embed } from "@/lib/llm/gateway";
import { currentUser } from "@/lib/google/session";

export type PortfolioInput = { id?: string; company: string; one_liner: string; sector: string; status: string; tags: string; source_url: string; source_note: string; website: string };

/** "https://www.Giva.co/shop" → "giva.co". Empty stays empty; anything that isn't a domain returns null. */
function toDomain(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  if (!s) return "";
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) ? s : null;
}

const portfolioText = (r: { company: string; one_liner: string; sector: string | null }) => `${r.company}: ${r.one_liner} (${r.sector ?? ""})`; // same as scripts/embed.ts

export async function savePortfolio(input: PortfolioInput) {
  const user = await currentUser();
  if (!user) return { error: "Sign in with Google first." };
  if (!user.partner) return { error: "Only partners can edit the portfolio: it changes the conflict check." };
  const company = input.company.trim(), one_liner = input.one_liner.trim(), sector = input.sector.trim();
  if (!company || !one_liner) return { error: "Company and one-liner are required." };
  if (!/^https?:\/\/\S+\.\S+/.test(input.source_url.trim())) return { error: "Add a source link (https://…): every portfolio row needs one." };
  const website = toDomain(input.website ?? "");
  if (website === null) return { error: "Website should be a domain like giva.co." };
  try {
    const db = admin();
    const before = input.id ? (await db.from("portfolio").select("company, one_liner, sector").eq("id", input.id).single()).data : null;
    const row = {
      company, one_liner, sector, status: input.status || "active",
      tags: input.tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 8),
      source_url: input.source_url.trim(), source_note: input.source_note.trim() || null, website: website || null, updated_at: new Date().toISOString(),
    };
    const changedText = !before || portfolioText(before) !== portfolioText(row);
    const embedding = changedText ? `[${(await embed({ step: "embed:portfolio", inputs: [portfolioText(row)] }))[0].join(",")}]` : undefined;
    if (input.id) must(await db.from("portfolio").update({ ...row, ...(embedding ? { embedding } : {}) }).eq("id", input.id), "update portfolio");
    else must(await db.from("portfolio").insert({ ...row, embedding }), "insert portfolio");
    revalidatePath("/portfolio");
    return { ok: true, reembedded: changedText };
  } catch (e) {
    const m = (e as Error).message;
    return { error: /duplicate key/.test(m) ? `${company} is already in the portfolio.` : `Couldn't save: ${m}` };
  }
}
