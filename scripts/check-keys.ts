// pnpm check:keys: verifies each configured service without printing any secret value.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const ok = (b: boolean) => (b ? "OK  " : "FAIL");

async function gemini() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) return console.log("FAIL gemini: GEMINI_API_KEY not set");
  const base = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200";
  const attempts: [string, string, Record<string, string>][] = [
    ["x-goog-api-key header", base, { "x-goog-api-key": k }],
    ["key query param", `${base}&key=${encodeURIComponent(k)}`, {}],
    ["bearer token", base, { authorization: `Bearer ${k}` }],
  ];
  for (const [label, url, headers] of attempts) {
    const r = await fetch(url, { headers });
    const body = await r.json().catch(() => ({}));
    if (r.ok) {
      const gen = body.models
        .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m: { name: string }) => m.name.replace("models/", ""));
      console.log(`OK   gemini via ${label}: ${gen.length} generation models`);
      console.log("     " + gen.join(", "));
      return;
    }
    console.log(`FAIL gemini via ${label}: ${r.status} ${body?.error?.details?.[0]?.reason ?? body?.error?.status ?? ""}`);
  }
  console.log(`     key shape: length ${k.length}, starts "${k.slice(0, 3)}" (Gemini API keys usually start "AIza")`);
  await vertexExpress(k);
}

/** "AQ." keys are Vertex AI express-mode keys: same Gemini models, different endpoint. */
async function vertexExpress(k: string) {
  for (const model of ["gemini-2.5-flash", "gemini-3-flash-preview", "gemini-2.5-pro"]) {
    const r = await fetch(
      `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${encodeURIComponent(k)}`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with the word ok." }] }] }) },
    );
    const body = await r.json().catch(() => ({}));
    console.log(`${ok(r.ok)} vertex express ${model}: ${r.status} ${r.ok ? "" : (body?.error?.status ?? "") + " " + String(body?.error?.message ?? "").slice(0, 100)}`);
  }
}

async function langfuse() {
  const auth = "Basic " + Buffer.from(`${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`).toString("base64");
  const r = await fetch(`${process.env.LANGFUSE_HOST}/api/public/projects`, { headers: { authorization: auth } });
  console.log(`${ok(r.ok)} langfuse ${process.env.LANGFUSE_HOST}: ${r.status}`);
}

async function portkey() {
  const base = process.env.PORTKEY_BASE_URL ?? "https://api.portkey.ai/v1";
  try {
    const r = await fetch(base.replace(/\/v1\/?$/, "/"));
    console.log(`${ok(r.status < 500)} portkey gateway ${base}: ${r.status}`);
  } catch (e) {
    console.log(`FAIL portkey gateway ${base}: not reachable (${(e as Error).message}). Start it with: npx @portkey-ai/gateway`);
  }
}

async function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const r = await fetch(`${url}/rest/v1/cost_limits?select=id`, {
    headers: { apikey: process.env.SUPABASE_SECRET_KEY ?? "", authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` },
  });
  console.log(`${ok(r.ok)} supabase secret key: ${r.status}`);
}

/** OpenRouter: key validity (no secret printed) + Gemini/Claude model IDs with USD prices per million tokens. */
async function openrouter() {
  const k = process.env.OPENROUTER_API_KEY;
  if (!k) return console.log("SKIP openrouter: OPENROUTER_API_KEY not set");
  const me = await fetch("https://openrouter.ai/api/v1/key", { headers: { authorization: `Bearer ${k}` } });
  const info = (await me.json().catch(() => ({})))?.data ?? {};
  console.log(`${ok(me.ok)} openrouter key: ${me.status}${me.ok ? ` (limit ${info.limit ?? "none"}, used $${Number(info.usage ?? 0).toFixed(4)})` : ""}`);
  if (process.argv.includes("--models")) {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    const models = (await res.json()).data as { id: string; pricing: { prompt: string; completion: string }; context_length: number }[];
    for (const m of models.filter((x) => /^(google\/gemini|anthropic\/claude)/.test(x.id)))
      console.log(`     ${m.id.padEnd(42)} in $${(+m.pricing.prompt * 1e6).toFixed(3)}/M  out $${(+m.pricing.completion * 1e6).toFixed(3)}/M  ctx ${m.context_length}`);
  }
}

/** --traces: reads back the last hour of observations from Langfuse to prove traces arrived. */
async function traces() {
  const auth = "Basic " + Buffer.from(`${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`).toString("base64");
  const from = new Date(Date.now() - 3600_000).toISOString();
  const r = await fetch(`${process.env.LANGFUSE_HOST}/api/public/v2/observations?fromStartTime=${encodeURIComponent(from)}&limit=100`, { headers: { authorization: auth } });
  const body = await r.json().catch(() => ({}));
  const obs = (body.data ?? []) as { type: string; name: string; traceId: string; model?: string; metadata?: Record<string, unknown> }[];
  const byType = obs.reduce<Record<string, number>>((a, o) => ((a[o.type] = (a[o.type] ?? 0) + 1), a), {});
  console.log(`${ok(r.ok && obs.length > 0)} langfuse traces (last hour): ${r.status}, ${obs.length} observations ${JSON.stringify(byType)}, ${new Set(obs.map((o) => o.traceId)).size} trace(s)`);
  const gen = obs.find((o) => o.type === "GENERATION");
  if (gen) console.log(`     sample generation: ${gen.name} model=${gen.model} prompt=${JSON.stringify(gen.metadata?.prompt_name ?? gen.metadata)}`);
  if (!r.ok) console.log(`     ${JSON.stringify(body).slice(0, 200)}`);
}

/** --embed: one embedding through the gateway; prints dimensions only. */
async function embedding() {
  const { embed } = await import("../src/lib/llm/gateway");
  try {
    const [v] = await embed({ step: "check_keys", inputs: ["Pre-seed fintech lending to farmers"] });
    console.log(`OK   embeddings ${process.env.EMBEDDING_MODEL}: ${v.length} dimensions`);
  } catch (e) {
    console.log(`FAIL embeddings ${process.env.EMBEDDING_MODEL}: ${(e as Error).message.slice(0, 900)}`);
    // diagnosis only: ask OpenRouter directly which embedding models this key may use
    for (const model of ["google/gemini-embedding-001", "google/gemini-embedding-2", "openai/text-embedding-3-small", "mistralai/mistral-embed-2312", "qwen/qwen3-embedding-4b"]) {
      const r = await fetch("https://openrouter.ai/api/v1/embeddings", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
        body: JSON.stringify({ model, input: ["test"] }),
      });
      const b = await r.json().catch(() => ({}));
      console.log(`     direct ${model.padEnd(34)} ${r.status} ${r.ok ? `${b.data?.[0]?.embedding?.length} dims` : String(b?.error?.message ?? "").slice(0, 110)}`);
    }
  }
}

async function firecrawl() {
  if (!process.env.FIRECRAWL_API_KEY) {
    // report shape only, never the value
    const { readFileSync } = await import("node:fs");
    const lines = readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /firecrawl/i.test(l));
    const shape = lines.map((l) => `${l.split("=")[0].trim()}=${l.includes("=") && l.split("=").slice(1).join("=").trim() ? "<value>" : "<empty>"}`);
    return console.log(`FAIL firecrawl: FIRECRAWL_API_KEY not set. Lines mentioning firecrawl in .env.local: ${shape.length ? shape.join(" | ") : "none"}`);
  }
  const { Firecrawl } = await import("firecrawl");
  try {
    const r = await new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY }).search("All In Capital Mumbai pre-seed fund", { limit: 1 });
    console.log(`OK   firecrawl search: ${r.web?.length ?? 0} result(s)`);
  } catch (e) {
    console.log(`FAIL firecrawl: ${(e as Error).message.slice(0, 200)}`);
  }
}

(async () => {
  if (process.argv.includes("--traces")) return traces();
  if (process.argv.includes("--embed")) return embedding();
  await supabase();
  await langfuse();
  await portkey();
  await openrouter();
  await firecrawl();
  if (process.argv.includes("--gemini")) await gemini(); // direct Gemini key check; unused when routing via OpenRouter
})();
