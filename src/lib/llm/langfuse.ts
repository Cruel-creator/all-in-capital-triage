// Langfuse tracing on the current SDK (@langfuse/tracing + OpenTelemetry). The v3 ingestion API was removed
// from Langfuse Cloud on 2026-11-19. Shape: one trace per application run (root "chain" observation),
// one span per pipeline step, one generation per model call carrying the prompt name + version.
// The exported API is unchanged, so callers (gateway, scripts, worker) do not care how traces are sent.
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { startObservation, type LangfuseSpan } from "@langfuse/tracing";

const enabled = () => !!(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);
const host = () => process.env.LANGFUSE_HOST ?? process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com";

let processor: LangfuseSpanProcessor | null = null;
function init() {
  if (processor || !enabled()) return;
  processor = new LangfuseSpanProcessor({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: host(),
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
  });
  new NodeSDK({ spanProcessors: [processor] }).start();
}

// observations we still need to attach children to, keyed by Langfuse ids
const roots = new Map<string, LangfuseSpan>();
const spans = new Map<string, LangfuseSpan>();
const NOOP = `noop-${Math.random().toString(36).slice(2)}`;

export function startTrace(name: string, meta: { applicationId?: string | null; [k: string]: unknown }) {
  init();
  if (!enabled()) return NOOP;
  const root = startObservation(name, { metadata: { ...meta, app: "allin-triage" } }, { asType: "chain" });
  roots.set(root.traceId, root);
  return root.traceId;
}

export function startSpan(traceId: string, name: string, input?: unknown) {
  const root = roots.get(traceId);
  if (!root) return { id: NOOP, end: () => {} };
  const span = root.startObservation(name, { input });
  spans.set(span.id, span);
  return {
    id: span.id,
    end: (output?: unknown, level: "DEFAULT" | "ERROR" = "DEFAULT", statusMessage?: string) => {
      span.update({ output, level, statusMessage });
      span.end();
      spans.delete(span.id);
    },
  };
}

export function logGeneration(g: {
  traceId: string;
  parentId?: string;
  name: string;
  model: string;
  input: unknown;
  output: unknown;
  startTime: string;
  endTime: string;
  usage: { input: number; output: number };
  costUsd: number | null;
  promptName: string;
  promptVersion: number;
  level?: "DEFAULT" | "ERROR";
  statusMessage?: string;
}) {
  const parent = (g.parentId && spans.get(g.parentId)) || roots.get(g.traceId);
  if (!parent) return;
  const gen = parent.startObservation(
    g.name,
    {
      model: g.model,
      input: g.input,
      output: g.output,
      usageDetails: { input: g.usage.input, output: g.usage.output },
      ...(g.costUsd !== null ? { costDetails: { total: g.costUsd } } : {}),
      // prompt versions live in our repo (config/prompts), so record them as metadata rather than a Langfuse prompt link
      metadata: { prompt_name: g.promptName, prompt_version: g.promptVersion },
      level: g.level ?? "DEFAULT",
      statusMessage: g.statusMessage,
    },
    { asType: "generation" },
  );
  gen.end(new Date(g.endTime));
}

export function traceUrl(traceId: string) {
  return `${host()}/trace/${traceId}`;
}

/** Ends open root traces and pushes everything to Langfuse. Never fails the pipeline. */
export async function flush() {
  for (const [id, root] of roots) {
    root.end();
    roots.delete(id);
  }
  try {
    await processor?.forceFlush();
  } catch (e) {
    console.warn(`[langfuse] flush failed: ${(e as Error).message}`);
  }
}
