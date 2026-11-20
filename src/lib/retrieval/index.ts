// Retrieval: only the relevant memo passages and portfolio matches reach a prompt (non-negotiable 5).
import { admin, must } from "../db/admin";
import { embed } from "../llm/gateway";

const toPg = (v: number[]) => `[${v.join(",")}]`;

export type MemoPassage = { id: string; memo_id: string | null; meeting_id: string | null; section: string; text: string; page_no: number; document_id: string; similarity: number };
export type PortfolioMatch = { id: string; company: string; one_liner: string; sector: string; tags: string[]; source_url: string; similarity: number };

export async function memoPassages(query: string, k = 5, applicationId?: string): Promise<MemoPassage[]> {
  const [q] = await embed({ step: "retrieve:memos", inputs: [query], applicationId });
  return must(await admin().rpc("match_memo_chunks", { q: toPg(q), k }), "match_memo_chunks") as MemoPassage[];
}

/** Every portfolio row, ranked by similarity to the applicant's one-liner and product (G3, Meeting 4). */
export async function portfolioMatches(query: string, applicationId?: string): Promise<PortfolioMatch[]> {
  const [q] = await embed({ step: "retrieve:portfolio", inputs: [query], applicationId });
  return must(await admin().rpc("match_portfolio", { q: toPg(q) }), "match_portfolio") as PortfolioMatch[];
}

export async function similarCorrections(query: string, k = 3, applicationId?: string) {
  const [q] = await embed({ step: "retrieve:corrections", inputs: [query], applicationId });
  return must(await admin().rpc("match_corrections", { q: toPg(q), k }), "match_corrections") as {
    id: string; application_id: string; criterion: string; old_score: number; new_score: number; reason: string; tags: string[]; pattern: string; similarity: number;
  }[];
}
