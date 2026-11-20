"use client";
// Claim chips open a right-side drawer with the exact source: the PDF page with the quote highlighted,
// or the web source with publisher, date and its source chain. Native <dialog>: focus trap and Esc for free.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Badge, cx } from "./ui";

type Target = { kind: "claim" | "finding"; id: string; label: string };
type PageSource = { kind: "page"; key: string; quote: string; text: string; page_no: number; page_count: number; file_name: string; doc_kind: string; page_text: string; pdf_url: string | null };
type WebSource = {
  kind: "web"; url: string; title: string | null; publisher: string | null; published_at: string | null; retrieved_at: string; quote: string; extracted_claim: string | null;
  source_type: string; is_match: boolean; mismatch_reason: string | null; corroborated_by: string[];
  cites: { url: string; publisher: string | null; quote: string } | null; cited_by: { url: string; publisher: string | null; quote: string }[];
};

const Ctx = createContext<(t: Target) => void>(() => {});
export const useSource = () => useContext(Ctx);

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Page text with the quote highlighted (whitespace-insensitive match, like the verifier). */
function Highlighted({ text, quote }: { text: string; quote: string }) {
  const flat = norm(text);
  const i = flat.toLowerCase().indexOf(norm(quote).toLowerCase());
  if (i < 0) return <p className="whitespace-pre-wrap">{text}</p>;
  const end = i + norm(quote).length;
  return (
    <p className="whitespace-pre-wrap">
      {flat.slice(0, i)}
      <mark className="rounded-[2px] bg-amber-bg px-0.5 text-ink ring-1 ring-amber/40">{flat.slice(i, end)}</mark>
      {flat.slice(end)}
    </p>
  );
}

export function SourceProvider({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [data, setData] = useState<PageSource | WebSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const open = useCallback((t: Target) => {
    setTarget(t);
    setData(null);
    setError(null);
    ref.current?.showModal();
  }, []);

  useEffect(() => {
    if (!target) return;
    let live = true;
    fetch(`/api/source?${target.kind}=${target.id}`)
      .then(async (r) => {
        const j = await r.json();
        if (!live) return;
        if (!r.ok) setError(j.error ?? "Couldn't load the source.");
        else setData(j);
      })
      .catch(() => live && setError("Couldn't reach the server to load this source."));
    return () => {
      live = false;
    };
  }, [target, nonce]);

  return (
    <Ctx.Provider value={open}>
      {children}
      <dialog
        ref={ref}
        aria-labelledby="source-title"
        onClick={(e) => e.target === ref.current && ref.current?.close()}
        className="elev-3 m-0 ml-auto h-dvh max-h-dvh w-full max-w-[480px] bg-canvas p-0 text-ink open:animate-[drawer_240ms_var(--ease-out-quint)] backdrop:bg-black/30"
      >
        <style>{`@keyframes drawer{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}`}</style>
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-3 border-b border-hairline bg-surface-1 px-4 py-3">
            <div>
              <p className="eyebrow">Source</p>
              <h2 id="source-title" className="text-[15px] font-semibold">{target?.label ?? "Source"}</h2>
            </div>
            <button type="button" onClick={() => ref.current?.close()} className="press hit rounded-[6px] px-2 py-1 text-[13px] text-ink-subtle hover:bg-surface-2 hover:text-ink">
              Close <span className="sr-only">source</span>
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-4 text-[13px] leading-relaxed">
            {error && (
              <div role="alert" className="rounded-[6px] bg-red-bg p-3 text-red">
                <p>{error}</p>
                <button type="button" className="press mt-2 font-medium underline" onClick={() => { setError(null); setNonce((n) => n + 1); }}>
                  Try again
                </button>
              </div>
            )}
            {!error && !data && (
              <div aria-busy className="space-y-2">
                {[90, 70, 95, 60, 80].map((w, i) => <div key={i} className="h-3 animate-pulse rounded bg-surface-2" style={{ width: `${w}%` }} />)}
              </div>
            )}
            {data?.kind === "page" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{data.doc_kind === "deck" ? "Pitch deck" : "Application form"}</Badge>
                  <span className="num text-ink-subtle">Page {data.page_no} of {data.page_count}</span>
                  <span className="font-mono text-[12px] text-ink-subtle">{data.key}</span>
                </div>
                <blockquote className="border-l-2 border-primary pl-3 text-ink">“{data.quote}”</blockquote>
                <div className="rounded-[6px] bg-surface-1 p-3 text-ink-muted">
                  <p className="eyebrow mb-2">Page {data.page_no} text, quote highlighted</p>
                  <Highlighted text={data.page_text} quote={data.quote} />
                </div>
                {data.pdf_url && (
                  <a href={data.pdf_url} target="_blank" rel="noreferrer" className="press inline-flex h-8 items-center rounded-[6px] px-3 text-[13px] font-medium text-primary elev-1 hover:bg-surface-1">
                    Open {data.file_name} at page {data.page_no}
                  </a>
                )}
              </div>
            )}
            {data?.kind === "web" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={data.source_type === "primary" ? "green" : data.source_type === "aggregator" ? "amber" : "neutral"}>{data.source_type}</Badge>
                  {!data.is_match && <Badge tone="amber">Same name, different entity</Badge>}
                  {data.corroborated_by.length > 0 && <Badge tone="green">Corroborated by {data.corroborated_by.length}</Badge>}
                </div>
                <div>
                  <p className="font-medium text-ink">{data.title ?? data.url}</p>
                  <p className="num text-ink-subtle">
                    {data.publisher ?? "Unknown publisher"} · {data.published_at ? `published ${data.published_at}` : "publish date not shown"} · retrieved {data.retrieved_at.slice(0, 10)}
                  </p>
                </div>
                <blockquote className="border-l-2 border-primary pl-3 text-ink">“{data.quote}”</blockquote>
                {data.extracted_claim && <p className="text-ink-muted">{data.extracted_claim}</p>}
                {!data.is_match && data.mismatch_reason && <p className="text-amber">Not used: {data.mismatch_reason}</p>}
                {(data.cites || data.cited_by.length > 0) && (
                  <div className="rounded-[6px] bg-surface-1 p-3">
                    <p className="eyebrow mb-2">Source chain</p>
                    <ol className="space-y-2">
                      {data.cited_by.map((c, i) => <li key={i}>Cited by <a className="text-primary underline" href={c.url} target="_blank" rel="noreferrer">{c.publisher ?? c.url}</a></li>)}
                      <li className="font-medium">This page</li>
                      {data.cites && <li>Cites <a className="text-primary underline" href={data.cites.url} target="_blank" rel="noreferrer">{data.cites.publisher ?? data.cites.url}</a>: “{data.cites.quote}”</li>}
                    </ol>
                  </div>
                )}
                <a href={data.url} target="_blank" rel="noreferrer" className="press inline-flex h-8 items-center rounded-[6px] px-3 text-[13px] font-medium text-primary elev-1 hover:bg-surface-1">
                  Open source page
                </a>
              </div>
            )}
          </div>
        </div>
      </dialog>
    </Ctx.Provider>
  );
}

/** A citation: mono ID + short label. Opens the source drawer. */
export function ClaimChip({ kind, id, code, label }: { kind: "claim" | "finding"; id: string; code: string; label?: string }) {
  const open = useSource();
  return (
    <button
      type="button"
      onClick={() => open({ kind, id, label: `${code}${label ? ` · ${label}` : ""}` })}
      className={cx("press hit inline-flex h-8 max-w-[220px] items-center gap-1.5 rounded-[4px] bg-surface-2 px-1.5 text-[12px] text-ink-muted hover:bg-surface-3 hover:text-ink sm:h-6")}
      title={label}
    >
      <span className="font-mono text-ink">{code}</span>
      {label && <span className="truncate">{label}</span>}
    </button>
  );
}
