// The ONLY place that calls a model (tests/gateway-only.test.ts enforces this).
// Every call: PII guard → daily cost guard → Portkey (retries + fallback) → Zod → optional citation validator
// (one retry with the error fed back) → llm_calls row → Langfuse generation.
import { createHash } from "node:crypto";
import type { z } from "zod";
import models from "../../../config/models.json";
import { admin } from "../db/admin";
import { assertNoPii, type FounderRef } from "./pii";
import { logGeneration } from "./langfuse";

export class ModelOutputError extends Error {
  constructor(message: string, readonly attempts: number) {
    super(message);
  }
}
export class QueuePausedError extends Error {}

export type Prompt = { name: string; version: number; versionId?: string | null; system: string; user: string };

export type CallOpts<T> = {
  step: string;
  applicationId?: string | null;
  criterion?: string | null;
  prompt: Prompt;
  schema: z.ZodType<T>;
  /** returns an error message to trigger the single retry (e.g. uncited claim), or null if fine */
  validate?: (out: T) => string | null;
  founders?: FounderRef[];
  traceId?: string;
  spanId?: string;
  temperature?: number;
};

// Portkey's hosted gateway, or the open-source gateway (github.com/Portkey-AI/gateway) run locally/self-hosted.
const portkeyUrl = () => `${(process.env.PORTKEY_BASE_URL ?? "https://api.portkey.ai/v1").replace(/\/$/, "")}/chat/completions`;

function target(kind: "primary" | "fallback") {
  const model = kind === "primary" ? process.env.LLM_PRIMARY_MODEL : process.env.LLM_FALLBACK_MODEL;
  if (!model) {
    if (kind === "fallback") return null; // fallback is optional; retries still apply to the primary
    throw new Error("Set LLM_PRIMARY_MODEL in .env.local");
  }
  // OpenRouter serves both Gemini and Claude with one key; Portkey routes to it with retries/fallback.
  if (process.env.OPENROUTER_API_KEY) return { provider: "openrouter", api_key: process.env.OPENROUTER_API_KEY, override_params: { model } };
  const isGemini = /gemini/i.test(model);
  const vk = isGemini ? process.env.PORTKEY_VK_GEMINI : process.env.PORTKEY_VK_ANTHROPIC;
  const key = isGemini ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY;
  if (!vk && !key) throw new Error(`No Portkey virtual key or provider key for ${model}`);
  return vk
    ? { virtual_key: vk, override_params: { model } }
    : { provider: isGemini ? "google" : "anthropic", api_key: key, override_params: { model } };
}

export function portkeyConfig() {
  const retry = { attempts: 3, on_status_codes: [429, 500, 502, 503, 504] };
  const targets = [target("primary"), target("fallback")].filter((t) => t !== null);
  if (targets.length === 1) return { retry, ...targets[0] };
  return { strategy: { mode: "fallback", on_status_codes: [429, 500, 502, 503, 504] }, retry, targets };
}

export function priceFor(model: string): { input: number; output: number } | null {
  const row = Object.values(models.models).find((m) => model.toLowerCase().includes(m.match));
  if (!row || row.input_per_mtok === null || row.output_per_mtok === null) return null;
  return { input: row.input_per_mtok, output: row.output_per_mtok };
}

/** Start of the current day in India time, as an ISO timestamp. */
export function istDayStart(now = new Date()): string {
  const istDate = new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  return new Date(`${istDate}T00:00:00+05:30`).toISOString();
}

/** A pause set on an earlier IST day has expired: the limit is daily, so a new day starts fresh. Pure; tested. */
export const pauseExpired = (pausedAt: string, now = new Date()) => new Date(pausedAt).getTime() < new Date(istDayStart(now)).getTime();

/** Pauses the queue and refuses the call once today's IST spend passes the daily limit. Resumes on its own the next IST day. */
export async function costGuard(estimateUsd = 0) {
  const db = admin();
  const { data: lim } = await db.from("cost_limits").select("*").eq("id", 1).single();
  if (!lim) return;
  if (lim.paused_at && pauseExpired(lim.paused_at)) {
    await db.from("cost_limits").update({ paused_at: null, pause_reason: null }).eq("id", 1);
    lim.paused_at = null;
  }
  if (lim.paused_at) throw new QueuePausedError(`Queue paused: ${lim.pause_reason ?? "daily cost limit"}`);
  const since = istDayStart();
  // summed in the database: reading rows caps at 1,000 and would undercount on a busy day
  const roll = await db.rpc("cost_rollup", { day_start: since });
  if (roll.error) throw new Error(`Couldn't check today's spend: ${roll.error.message}`); // fail closed, never spend blind
  const spent = Number((roll.data as { today: number }).today ?? 0);
  if (spent + estimateUsd > Number(lim.daily_usd)) {
    const reason = `Daily limit $${lim.daily_usd} passed ($${spent.toFixed(4)} spent today IST)`;
    await db.from("cost_limits").update({ paused_at: new Date().toISOString(), pause_reason: reason }).eq("id", 1);
    throw new QueuePausedError(reason);
  }
}

type RawResult = { text: string; model: string; inTok: number; outTok: number; requestId: string | null; fellBack: boolean; retries: number };

async function portkey(system: string, user: string, temperature: number, traceId?: string): Promise<RawResult> {
  const apiKey = process.env.PORTKEY_API_KEY;
  const selfHosted = !!process.env.PORTKEY_BASE_URL && !/api\.portkey\.ai/.test(process.env.PORTKEY_BASE_URL);
  if (!apiKey && !selfHosted) throw new Error("Set PORTKEY_API_KEY, or PORTKEY_BASE_URL for a self-hosted gateway");
  const res = await fetch(portkeyUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { "x-portkey-api-key": apiKey } : {}),
      "x-portkey-config": JSON.stringify(portkeyConfig()),
      ...(traceId ? { "x-portkey-trace-id": traceId } : {}),
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature,
      response_format: { type: "json_object" },
      // extraction and scoring are grounded in supplied text; low reasoning keeps cost and latency down at volume
      ...(process.env.OPENROUTER_API_KEY ? { reasoning: { effort: process.env.LLM_REASONING_EFFORT ?? "low" } } : {}),
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Portkey ${res.status}: ${body.slice(0, 500)}`);
  const json = JSON.parse(body);
  return {
    text: json.choices?.[0]?.message?.content ?? "",
    model: json.model ?? "unknown",
    inTok: json.usage?.prompt_tokens ?? 0,
    outTok: json.usage?.completion_tokens ?? 0,
    requestId: res.headers.get("x-portkey-request-id"),
    // fell back = the answering model is not the configured primary (provider prefixes like "google/" may be dropped)
    fellBack: !String(json.model ?? "").includes(String(process.env.LLM_PRIMARY_MODEL ?? "").split("/").pop() ?? ""),
    retries: Number(res.headers.get("x-portkey-retry-attempt-count") ?? 0),
  };
}

/** Production route when no Portkey gateway is reachable (e.g. on Vercel): OpenRouter directly, with the same
 *  policy as the Portkey config above: 3 attempts on 429/5xx with backoff, then the fallback model. The PII check,
 *  cost guard, llm_calls row and Langfuse generation all run above this function, so they are unchanged. */
export const useDirectRouter = () =>
  process.env.LLM_ROUTER === "openrouter" || (!process.env.PORTKEY_BASE_URL && !process.env.PORTKEY_API_KEY && !!process.env.OPENROUTER_API_KEY);

async function openrouterDirect(system: string, user: string, temperature: number): Promise<RawResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("Set OPENROUTER_API_KEY");
  const models = [process.env.LLM_PRIMARY_MODEL, process.env.LLM_FALLBACK_MODEL].filter((m): m is string => !!m);
  if (!models.length) throw new Error("Set LLM_PRIMARY_MODEL");
  let retries = 0;
  let last = "";
  for (const [i, model] of models.entries()) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          temperature,
          response_format: { type: "json_object" },
          reasoning: { effort: process.env.LLM_REASONING_EFFORT ?? "low" },
        }),
      }).catch((e: Error) => ({ ok: false, status: 0, text: async () => e.message, headers: new Headers() }) as unknown as Response);
      const body = await res.text();
      if (res.ok) {
        const json = JSON.parse(body);
        return {
          text: json.choices?.[0]?.message?.content ?? "", model: json.model ?? model,
          inTok: json.usage?.prompt_tokens ?? 0, outTok: json.usage?.completion_tokens ?? 0,
          requestId: res.headers.get("x-request-id") ?? json.id ?? null, fellBack: i > 0, retries,
        };
      }
      last = `OpenRouter ${res.status}: ${body.slice(0, 300)}`;
      if (![0, 429, 500, 502, 503, 504].includes(res.status)) break; // not retryable: try the fallback model
      retries++;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw new Error(last || "OpenRouter call failed");
}

/**
 *Embeddings through the same gateway (Portkey → provider), with the same PII guard and cost row.
 * Returns one vector per input, in order.
 */
export async function embed(o: { step: string; inputs: string[]; applicationId?: string | null; founders?: FounderRef[] }): Promise<number[][]> {
  const model = process.env.EMBEDDING_MODEL;
  if (!model) throw new Error("Set EMBEDDING_MODEL in .env.local");
  for (const t of o.inputs) assertNoPii(t, o.founders ?? []);
  await costGuard();
  // DEVIATION (tracked for Phase 5): the self-hosted Portkey gateway fails on OpenRouter embeddings
  // ("Something went wrong"), so embeddings call OpenRouter directly from here, with the same PII guard,
  // cost guard, llm_calls row and a 3-attempt retry on 429/5xx. Chat completions still go through Portkey.
  const t0 = Date.now();
  let res!: Response;
  for (let attempt = 1; attempt <= 3; attempt++) {
    res = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
      body: JSON.stringify({ model, input: o.inputs }),
    });
    if (res.ok || ![429, 500, 502, 503, 504].includes(res.status)) break;
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  const body = await res.text();
  const json = res.ok ? JSON.parse(body) : null;
  const tokens = json?.usage?.prompt_tokens ?? json?.usage?.total_tokens ?? 0;
  const price = priceFor(model);
  await admin()
    .from("llm_calls")
    .insert({
      application_id: o.applicationId ?? null,
      step: o.step,
      provider: process.env.OPENROUTER_API_KEY ? "openrouter/embedding" : "embedding",
      model,
      input_tokens: tokens,
      cost_usd: price ? (tokens * price.input) / 1e6 : 0,
      latency_ms: Date.now() - t0,
      ok: res.ok,
      error: res.ok ? (price ? null : `price not configured for ${model}`) : `${res.status}: ${body.slice(0, 300)}`,
    });
  if (!res.ok) throw new Error(`Embeddings ${res.status}: ${body.slice(0, 300)}`);
  return (json.data as { index: number; embedding: number[] }[]).sort((a, b) => a.index - b.index).map((d) => toDims(d.embedding, EMBED_DIMS));
}

/** Schema stores vector(768). Gemini embeddings are Matryoshka-trained (768 is a supported output size):
 *  keep the first 768 dimensions and L2-normalise. Pure; tested. */
export const EMBED_DIMS = 768;
export function toDims(v: number[], dims: number): number[] {
  const cut = v.length > dims ? v.slice(0, dims) : v;
  const norm = Math.sqrt(cut.reduce((a, x) => a + x * x, 0)) || 1;
  return cut.map((x) => x / norm);
}

const parseJson = (s: string) => JSON.parse(s.replace(/^```(?:json)?\s*|\s*```$/g, "").trim());

export async function callModel<T>(o: CallOpts<T>): Promise<{ data: T; callId: string; model: string }> {
  const db = admin();
  let user = o.prompt.user;
  let lastErr = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    assertNoPii(o.prompt.system + "\n" + user, o.founders ?? []);
    await costGuard();
    const start = new Date().toISOString();
    const t0 = Date.now();
    let raw: RawResult | null = null;
    let parsed: T | null = null;
    let error: string | null = null;
    try {
      raw = useDirectRouter() ? await openrouterDirect(o.prompt.system, user, o.temperature ?? 0) : await portkey(o.prompt.system, user, o.temperature ?? 0, o.traceId);
      const r = o.schema.safeParse(parseJson(raw.text));
      if (!r.success) error = `schema: ${r.error.issues.slice(0, 5).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`;
      else {
        parsed = r.data;
        error = o.validate?.(r.data) ?? null;
      }
    } catch (e) {
      error = (e as Error).message;
    }
    const price = raw ? priceFor(raw.model) : null;
    const cost = raw && price ? (raw.inTok * price.input + raw.outTok * price.output) / 1e6 : 0;
    const { data: row } = await db
      .from("llm_calls")
      .insert({
        application_id: o.applicationId ?? null,
        step: o.step,
        criterion: o.criterion ?? null,
        prompt_version_id: o.prompt.versionId ?? null,
        provider: raw ? `${process.env.OPENROUTER_API_KEY ? "openrouter/" : ""}${/gemini/i.test(raw.model) ? "google" : /claude/i.test(raw.model) ? "anthropic" : "other"}` : "unknown",
        model: raw?.model ?? "none",
        input_tokens: raw?.inTok ?? 0,
        output_tokens: raw?.outTok ?? 0,
        cost_usd: cost,
        latency_ms: Date.now() - t0,
        langfuse_trace_id: o.traceId ?? null,
        portkey_request_id: raw?.requestId ?? null,
        retries: (raw?.retries ?? 0) + (attempt - 1),
        fell_back: raw?.fellBack ?? false,
        payload_hash: createHash("sha256").update(o.prompt.system + user).digest("hex"),
        ok: !error,
        error: error ?? (price ? null : raw ? `price not configured for ${raw.model}` : null),
      })
      .select("id")
      .single();
    if (o.traceId)
      logGeneration({
        traceId: o.traceId,
        parentId: o.spanId,
        name: `${o.step}${o.criterion ? ":" + o.criterion : ""}#${attempt}`,
        model: raw?.model ?? "none",
        input: { system: o.prompt.system, user },
        output: raw?.text ?? null,
        startTime: start,
        endTime: new Date().toISOString(),
        usage: { input: raw?.inTok ?? 0, output: raw?.outTok ?? 0 },
        costUsd: price ? cost : null,
        promptName: o.prompt.name,
        promptVersion: o.prompt.version,
        level: error ? "ERROR" : "DEFAULT",
        statusMessage: error ?? undefined,
      });
    if (!error && parsed !== null) return { data: parsed, callId: row?.id, model: raw!.model };
    lastErr = error ?? "unknown";
    // one retry, telling the model exactly what was wrong (non-negotiable 1: uncited output is rejected)
    user = `${o.prompt.user}\n\nYour previous answer was rejected: ${lastErr}\nReturn corrected JSON only.`;
  }
  throw new ModelOutputError(lastErr, 2);
}
