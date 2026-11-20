"use client";
// Light-first; the choice is remembered per browser. The inline script in layout.tsx applies it before paint.
import { useEffect, useState } from "react";

type Mode = "light" | "dark";

export const themeScript = `try{var t=localStorage.getItem("theme");if(t==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("light");
  useEffect(() => setMode(document.documentElement.dataset.theme === "dark" ? "dark" : "light"), []);
  const next: Mode = mode === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("theme", next);
        } catch {}
        setMode(next);
      }}
      className="press hit flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-[13px] text-ink-subtle hover:bg-surface-2 hover:text-ink"
      aria-label={`Switch to ${next} theme`}
    >
      <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        {mode === "dark" ? <circle cx="8" cy="8" r="3.2" /> : <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5Z" />}
      </svg>
      {mode === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}
