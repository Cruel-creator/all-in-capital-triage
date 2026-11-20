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

/** Pauses the queue and refuses the call once today's IST spend passes the daily limit. */
export async function costGuard(estimateUsd = 0) {
  const db = admin();
  const { data: lim } = await db.from("cost_limits").select("*").eq("id", 1).single();
  if (!lim) return;
  if (lim.paused_at) throw new QueuePausedError(`Queue paused: ${lim.pause_reason ?? "daily cost limit"}`);
  const since = istDayStart();
  const { data: rows } = await db.from("llm_calls").select("cost_usd").gte("created_at", since);
  const spent = (rows ?? []).reduce((a, r) => a + Number(r.cost_usd), 0);
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
      raw = await portkey(o.prompt.system, user, o.temperature ?? 0, o.traceId);
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
