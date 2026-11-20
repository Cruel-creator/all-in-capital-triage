"use client";
// ⌘K / Ctrl+K: jump to any application or screen.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "./ui";

export type PaletteItem = { label: string; hint?: string; href: string };

export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const results = useMemo(() => items.filter((x) => `${x.label} ${x.hint ?? ""}`.toLowerCase().includes(q.toLowerCase())).slice(0, 12), [items, q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQ("");
        setI(0);
        ref.current?.showModal();
        requestAnimationFrame(() => input.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    ref.current?.close();
    router.push(href);
  };

  return (
    <dialog
      ref={ref}
      aria-label="Jump to"
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="elev-3 mx-auto mt-[12vh] w-[min(560px,calc(100%-32px))] rounded-[12px] bg-canvas p-0 text-ink backdrop:bg-black/30"
    >
      <div className="border-b border-hairline p-2">
        <label className="sr-only" htmlFor="palette-input">Jump to an application or screen</label>
        <input
          id="palette-input"
          ref={input}
          value={q}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={results[i] ? `palette-${i}` : undefined}
          onChange={(e) => {
            setQ(e.target.value);
            setI(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") (e.preventDefault(), setI((x) => Math.min(results.length - 1, x + 1)));
            if (e.key === "ArrowUp") (e.preventDefault(), setI((x) => Math.max(0, x - 1)));
            if (e.key === "Enter" && results[i]) go(results[i].href);
          }}
          placeholder="Jump to an application or screen…"
          className="h-10 w-full bg-transparent px-2 text-[14px] outline-none placeholder:text-ink-subtle"
        />
      </div>
      <ul id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
        {results.length === 0 && <li className="px-3 py-6 text-center text-ink-subtle">Nothing matches “{q}”.</li>}
        {results.map((r, n) => (
          <li
            key={r.href}
            id={`palette-${n}`}
            role="option"
            aria-selected={n === i}
            onMouseEnter={() => setI(n)}
            onClick={() => go(r.href)}
            className={cx("flex h-10 cursor-pointer items-center justify-between rounded-[6px] px-3 text-[13px]", n === i ? "bg-surface-2 text-ink" : "text-ink-muted")}
          >
            <span>{r.label}</span>
            {r.hint && <span className="text-[12px] text-ink-subtle">{r.hint}</span>}
          </li>
        ))}
      </ul>
    </dialog>
  );
}
