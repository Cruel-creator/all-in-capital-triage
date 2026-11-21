// Word-level diff (LCS). Used by the composer's version history and to record what Riya changed before sending.
export type DiffPart = { t: string; k: "same" | "add" | "del" };

export function wordDiff(a: string, b: string): DiffPart[] {
  const x = a.split(/(\s+)/), y = b.split(/(\s+)/);
  const dp = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffPart[] = [];
  let i = 0, j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) (out.push({ t: x[i], k: "same" }), i++, j++);
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: x[i++], k: "del" });
    else out.push({ t: y[j++], k: "add" });
  }
  while (i < x.length) out.push({ t: x[i++], k: "del" });
  while (j < y.length) out.push({ t: y[j++], k: "add" });
  return out;
}

/** "-old +new" tokens, whitespace-only changes dropped. */
export const diffText = (a: string, b: string) =>
  wordDiff(a, b).filter((d) => d.k !== "same" && d.t.trim()).map((d) => `${d.k === "add" ? "+" : "-"}${d.t}`).join(" ");
