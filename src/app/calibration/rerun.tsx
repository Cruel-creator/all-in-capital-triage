"use client";
import { useState, useTransition } from "react";
import { rerunBacktest } from "./actions";

export function RerunButton({ canAct, label }: { canAct: boolean; label: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <button type="button" disabled={!canAct || pending} title={canAct ? undefined : "Sign in with Google first"}
        onClick={() => start(async () => { setMsg(null); const r = await rerunBacktest(); if ("error" in r && r.error) setMsg(r.error); })}
        className="press inline-flex h-8 items-center rounded-full bg-primary px-3 text-[13px] font-medium text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-subtle">
        {pending ? "Scoring 12 memos… about two minutes" : label}
      </button>
      {msg && <span role="alert" className="text-[12px] text-red">{msg}</span>}
    </span>
  );
}
