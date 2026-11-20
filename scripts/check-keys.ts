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

(async () => {
  if (process.argv.includes("--traces")) return traces();
  await supabase();
  await langfuse();
  await portkey();
  await openrouter();
  if (process.argv.includes("--gemini")) await gemini(); // direct Gemini key check; unused when routing via OpenRouter
})();
