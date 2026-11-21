"use client";
// Rubric (weights, thresholds, lens multipliers, anchors) and fund rules editors. Weights show as shares of 100%
// computed in code, so the numbers always add up.
import { useMemo, useState, useTransition } from "react";
import { rerankAll, saveRubric, saveRules } from "./actions";
import { CRIT_NAMES, cx } from "@/components/ui";

type Config = {
  criteria: Record<string, { name: string; weight: number; anchors: Record<string, string> }>;
  lenses: Record<string, { multiplier: number; question?: string; boost: string[] }>;
  recommendation: { take_call: { min_score: number }; dig: { min_score: number } };
};
const CRITS = ["C1", "C2", "C3", "C4", "C5", "C6"];

function Status({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <p role={msg.ok ? "status" : "alert"} className={cx("text-[12px]", msg.ok ? "text-green" : "text-red")}>{msg.text}</p>;
}

export function SettingsEditor({ rubricVersion, config, thesisVersion, rules, canEdit, signedIn }: {
  rubricVersion: number; config: Config; thesisVersion: number; rules: { id: string; text: string }[]; canEdit: boolean; signedIn: boolean;
}) {
  const [weights, setWeights] = useState(Object.fromEntries(CRITS.map((c) => [c, Math.round(config.criteria[c].weight * 100)])));
  const [call, setCall] = useState(config.recommendation.take_call.min_score);
  const [dig, setDig] = useState(config.recommendation.dig.min_score);
  const [lens, setLens] = useState(Object.fromEntries(Object.entries(config.lenses).map(([k, v]) => [k, v.multiplier])));
  const [anchors, setAnchors] = useState(Object.fromEntries(CRITS.map((c) => [c, { ...config.criteria[c].anchors }])));
  const [ruleText, setRuleText] = useState(rules.map((r) => ({ ...r })));
  const [noteR, setNoteR] = useState("");
  const [noteT, setNoteT] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [msgR, setMsgR] = useState<{ ok: boolean; text: string } | null>(null);
  const [msgT, setMsgT] = useState<{ ok: boolean; text: string } | null>(null);
  const [msgK, setMsgK] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const sum = useMemo(() => Object.values(weights).reduce((a, x) => a + (x > 0 ? x : 0), 0), [weights]);
  const disabled = !canEdit || pending;

  return (
    <div className="space-y-6">
      {!canEdit && <p className="rounded-[8px] bg-surface-1 px-3 py-2 text-[13px] text-ink-muted">{signedIn ? "Only partners can change these. You can read them." : "Sign in with Google to edit. You can read everything here."}</p>}

      <section className="elev-1 rounded-[8px] bg-canvas p-5" aria-labelledby="h-rubric">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="h-rubric" className="text-[14px] font-semibold">Rubric <span className="font-normal text-ink-subtle">v{rubricVersion}</span></h2>
          <p className="text-[12px] text-ink-subtle">Weights and thresholds apply when you re-rank. Anchors apply the next time applications are scored.</p>
        </div>

        <fieldset className="mt-4" disabled={disabled}>
          <legend className="eyebrow mb-2">How much each area counts</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CRITS.map((c) => (
              <label key={c} className="flex items-center justify-between gap-3 rounded-[8px] bg-surface-1 px-3 py-2">
                <span className="text-[13px]">{CRIT_NAMES[c]}</span>
                <span className="flex items-center gap-2">
                  <input type="number" min={0} max={100} value={weights[c]} onChange={(e) => setWeights({ ...weights, [c]: Number(e.target.value) })}
                    className="num h-8 w-16 rounded-[6px] bg-canvas px-2 text-right text-[13px] shadow-[0_0_0_1px_var(--hairline)]" aria-label={`${CRIT_NAMES[c]} weight`} />
                  <span className="num w-12 text-right text-[12px] text-ink-subtle">{sum ? Math.round((Math.max(weights[c], 0) / sum) * 100) : 0}%</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-ink-subtle">Enter any numbers; they’re scaled to 100% when saved.</p>
        </fieldset>

        <fieldset className="mt-4 grid gap-3 sm:grid-cols-2" disabled={disabled}>
          <legend className="eyebrow mb-2 sm:col-span-2">Where the lines sit (out of 10)</legend>
          <label className="flex items-center justify-between gap-3 rounded-[8px] bg-surface-1 px-3 py-2 text-[13px]">Take the call at or above
            <input type="number" step={0.1} min={0} max={10} value={call} onChange={(e) => setCall(Number(e.target.value))} className="num h-8 w-20 rounded-[6px] bg-canvas px-2 text-right shadow-[0_0_0_1px_var(--hairline)]" />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-[8px] bg-surface-1 px-3 py-2 text-[13px]">Dig first at or above
            <input type="number" step={0.1} min={0} max={10} value={dig} onChange={(e) => setDig(Number(e.target.value))} className="num h-8 w-20 rounded-[6px] bg-canvas px-2 text-right shadow-[0_0_0_1px_var(--hairline)]" />
          </label>
        </fieldset>

        <fieldset className="mt-4" disabled={disabled}>
          <legend className="eyebrow mb-2">Sector lenses (how much a lens boosts its key areas)</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(lens).map(([k, m]) => (
              <label key={k} className="flex items-center justify-between gap-3 rounded-[8px] bg-surface-1 px-3 py-2 text-[13px]">
                <span className="capitalize">{k.replace(/_/g, " ")} <span className="text-ink-subtle">({config.lenses[k].boost.map((c) => CRIT_NAMES[c]).join(", ")})</span></span>
                <input type="number" step={0.1} min={1} max={3} value={m} onChange={(e) => setLens({ ...lens, [k]: Number(e.target.value) })} className="num h-8 w-16 rounded-[6px] bg-canvas px-2 text-right shadow-[0_0_0_1px_var(--hairline)]" aria-label={`${k} lens multiplier`} />
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4">
          <p className="eyebrow mb-2">Anchors (what each score band means)</p>
          <div className="space-y-1.5">
            {CRITS.map((c) => (
              <div key={c} className="rounded-[8px] bg-surface-1">
                <button type="button" aria-expanded={open === c} onClick={() => setOpen(open === c ? null : c)} className="press flex h-9 w-full items-center justify-between px-3 text-left text-[13px]">
                  {CRIT_NAMES[c]} <span className="text-ink-subtle">{open === c ? "Hide" : "Edit"}</span>
                </button>
                {open === c && (
                  <div className="space-y-2 px-3 pb-3">
                    {Object.entries(anchors[c]).map(([band, text]) => (
                      <label key={band} className="block">
                        <span className="num text-[12px] text-ink-muted">{band}</span>
                        <textarea rows={2} value={text} disabled={disabled} onChange={(e) => setAnchors({ ...anchors, [c]: { ...anchors[c], [band]: e.target.value } })}
                          className="mt-0.5 w-full rounded-[6px] bg-canvas px-3 py-2 text-[13px] shadow-[0_0_0_1px_var(--hairline)]" />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input value={noteR} onChange={(e) => setNoteR(e.target.value)} disabled={disabled} placeholder="What changed and why (required)" className="h-9 min-w-[260px] flex-1 rounded-[6px] bg-surface-1 px-3 text-[13px] shadow-[0_0_0_1px_var(--hairline)]" aria-label="Change note for the rubric" />
          <button type="button" disabled={disabled || !noteR.trim()} onClick={() => start(async () => {
            const r = await saveRubric({ weights, call, dig, lensMultipliers: lens, anchors }, noteR);
            setMsgR("error" in r ? { ok: false, text: r.error } : { ok: true, text: `Saved as rubric v${r.version}. Re-rank to apply new weights and thresholds.` });
            if (!("error" in r)) setNoteR("");
          })} className="press h-9 rounded-[6px] bg-primary px-4 text-[13px] font-medium text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-subtle">Save new version</button>
          <button type="button" disabled={disabled} onClick={() => start(async () => {
            const r = await rerankAll();
            setMsgK("error" in r ? { ok: false, text: r.error } : { ok: true, text: `Re-ranked ${r.count} applications with the active rubric.` });
          })} className="press h-9 rounded-[6px] px-3 text-[13px] text-ink-muted shadow-[0_0_0_1px_var(--hairline)] hover:bg-surface-1 disabled:cursor-not-allowed disabled:text-ink-subtle">{pending ? "Working…" : "Re-rank everything"}</button>
        </div>
        <div className="mt-1.5 space-y-1"><Status msg={msgR} /><Status msg={msgK} /></div>
      </section>

      <section className="elev-1 rounded-[8px] bg-canvas p-5" aria-labelledby="h-rules">
        <h2 id="h-rules" className="text-[14px] font-semibold">Fund rules <span className="font-normal text-ink-subtle">v{thesisVersion}</span></h2>
        <p className="mt-0.5 text-[12px] text-ink-subtle">How the fund actually decides, learned from the deal memos. The scorer applies these by ID.</p>
        <ol className="mt-3 space-y-2">
          {ruleText.map((r, i) => (
            <li key={r.id} className="flex items-start gap-2">
              <span className="num mt-2 w-7 shrink-0 font-mono text-[12px] text-ink-subtle">{r.id}</span>
              <textarea rows={1} value={r.text} disabled={disabled} aria-label={`Rule ${r.id}`} onChange={(e) => setRuleText(ruleText.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                className="w-full resize-y rounded-[6px] bg-surface-1 px-3 py-2 text-[13px] shadow-[0_0_0_1px_var(--hairline)]" />
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={noteT} onChange={(e) => setNoteT(e.target.value)} disabled={disabled} placeholder="What changed and why (required)" className="h-9 min-w-[260px] flex-1 rounded-[6px] bg-surface-1 px-3 text-[13px] shadow-[0_0_0_1px_var(--hairline)]" aria-label="Change note for the rules" />
          <button type="button" disabled={disabled || !noteT.trim()} onClick={() => start(async () => {
            const r = await saveRules(ruleText, noteT);
            setMsgT("error" in r ? { ok: false, text: r.error } : { ok: true, text: `Saved as rules v${r.version}. They apply the next time applications are scored.` });
            if (!("error" in r)) setNoteT("");
          })} className="press h-9 rounded-[6px] bg-primary px-4 text-[13px] font-medium text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-subtle">Save new version</button>
        </div>
        <div className="mt-1.5"><Status msg={msgT} /></div>
      </section>
    </div>
  );
}
