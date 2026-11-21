"use client";
// Accessible tabs (roving focus, arrow keys) with a sliding indicator. Panels are server-rendered and passed in.
import { useId, useRef, useState } from "react";
import { motion } from "motion/react";
import { cx } from "./ui";

export function Tabs({ items, label }: { items: { id: string; label: string; content: React.ReactNode }[]; label: string }) {
  const [active, setActive] = useState(items[0]?.id);
  const uid = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : null;
    if (n === null) return;
    e.preventDefault();
    const j = (n + items.length) % items.length;
    setActive(items[j].id);
    refs.current[j]?.focus();
  };
  return (
    <div className="elev-1 rounded-[8px] bg-canvas">
      <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-hairline px-2">
        {items.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => { refs.current[i] = el; }}
            role="tab"
            id={`${uid}-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`${uid}-${t.id}-panel`}
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => setActive(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cx("press relative h-10 shrink-0 px-2.5 text-[13px]", active === t.id ? "font-medium text-ink" : "text-ink-subtle hover:text-ink")}
          >
            {t.label}
            {active === t.id && <motion.span layoutId={`${uid}-bar`} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" transition={{ type: "spring", duration: 0.3, bounce: 0 }} />}
          </button>
        ))}
      </div>
      {items.map((t) => (
        <div key={t.id} role="tabpanel" id={`${uid}-${t.id}-panel`} aria-labelledby={`${uid}-${t.id}`} hidden={active !== t.id} tabIndex={0} className="p-4 focus-visible:outline-2 focus-visible:outline-primary">
          {t.content}
        </div>
      ))}
    </div>
  );
}
