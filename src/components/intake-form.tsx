"use client";
// The application form with a PDF drop-zone, shared by the founders' public page (/apply) and Riya's (/applications/new).
// Each PDF goes straight from the browser to a one-time Storage URL; only the stored path reaches our server.
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { cx } from "./ui";

const MAX_MB = 20;
const STAGES = ["Pre-seed", "Seed", "Series A", "Series B or later"] as const;
const SECTORS = ["B2B SaaS", "Fintech", "Lending fintech", "Consumer brand", "Consumer tech", "Healthcare", "Deeptech", "Web3", "Other"];

type Slot = { ok: true; path: string; url: string } | { error: string };
type Founder = { name: string; role: string; email: string; linkedin: string; background: string };
const NO_FOUNDER: Founder = { name: "", role: "", email: "", linkedin: "", background: "" };

type Props =
  | { mode: "founder"; getSlot: () => Promise<Slot>; submit: (i: { fields: unknown; deckPath: string; trap?: string }) => Promise<{ ok: true; company: string } | { error: string }> }
  | { mode: "team"; getSlot: () => Promise<Slot>; submit: (i: { fields?: unknown; deckPath: string; formPath?: string }) => Promise<{ ok: true; applicationId: string; company: string } | { error: string }> };

const input = "w-full rounded-[10px] bg-canvas px-3 py-2 text-[14px] shadow-[0_0_0_1px_var(--hairline)]";

function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-ink-subtle">{hint}</span>}
    </label>
  );
}

function checkPdf(f: File): string | null {
  if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) return "That file isn't a PDF.";
  if (f.size > MAX_MB * 1024 * 1024) return `That file is over ${MAX_MB} MB.`;
  return null;
}

function DropZone({ id, title, hint, file, onFile, disabled }: { id: string; title: string; hint: string; file: File | null; onFile: (f: File | null) => void; disabled?: boolean }) {
  const [over, setOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const take = (f: File | undefined) => {
    if (!f) return;
    const bad = checkPdf(f);
    setErr(bad);
    onFile(bad ? null : f);
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) take(e.dataTransfer.files?.[0]);
  };
  return (
    <div>
      <label
        htmlFor={id}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={cx(
          "flex min-h-[112px] cursor-pointer flex-col items-center justify-center gap-1 rounded-[16px] px-4 py-5 text-center transition-[background-color,box-shadow] duration-150",
          over ? "bg-surface-2 shadow-[inset_0_0_0_2px_var(--primary)]" : file ? "bg-green-bg shadow-[inset_0_0_0_1px_var(--hairline)]" : "bg-surface-1 shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-surface-2",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="text-ink-muted">
          <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {file ? (
          <span className="text-[14px] font-medium text-ink">{file.name} <span className="num font-normal text-ink-muted">· {(file.size / 1024 / 1024).toFixed(1)} MB</span></span>
        ) : (
          <span className="text-[14px] font-medium text-ink">{title}</span>
        )}
        <span className="text-[12px] text-ink-subtle">{file ? "Drop another file to replace it" : hint}</span>
        <input ref={ref} id={id} type="file" accept="application/pdf,.pdf" className="sr-only" disabled={disabled} onChange={(e) => take(e.target.files?.[0])} />
      </label>
      {file && !disabled && (
        <button type="button" onClick={() => { onFile(null); if (ref.current) ref.current.value = ""; }} className="press mt-1 text-[12px] text-ink-muted hover:text-ink">
          Remove
        </button>
      )}
      {err && <p role="alert" className="mt-1 text-[12px] text-red">{err}</p>}
    </div>
  );
}

async function upload(getSlot: () => Promise<Slot>, file: File): Promise<string> {
  const slot = await getSlot();
  if ("error" in slot) throw new Error(slot.error);
  const r = await fetch(slot.url, { method: "PUT", body: file, headers: { "content-type": "application/pdf", "x-upsert": "false" } });
  if (!r.ok) throw new Error("The upload didn't go through. Check your connection and try again.");
  return slot.path;
}

export function IntakeForm(props: Props) {
  const router = useRouter();
  const team = props.mode === "team";
  const [deck, setDeck] = useState<File | null>(null);
  const [formPdf, setFormPdf] = useState<File | null>(null);
  const [useFormPdf, setUseFormPdf] = useState(false);
  const [founders, setFounders] = useState<Founder[]>([{ ...NO_FOUNDER }]);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const busy = step !== null;

  const setFounder = (i: number, k: keyof Founder, v: string) => setFounders((fs) => fs.map((f, j) => (j === i ? { ...f, [k]: v } : f)));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!deck) return setError("Add the pitch deck (PDF).");
    if (team && useFormPdf && !formPdf) return setError("Add the founder's form PDF, or fill in the form instead.");
    const fd = new FormData(e.currentTarget);
    const s = (k: string) => String(fd.get(k) ?? "");
    const fields = {
      company: s("company"), website: s("website"), location: s("location"), oneLiner: s("oneLiner"), sector: s("sector"), stage: s("stage"),
      founders, built: s("built"), revenue: s("revenue"), growth: s("growth"), raising: s("raising"), valuation: s("valuation"),
      existingInvestors: s("existingInvestors"), useOfFunds: s("useOfFunds"), heard: s("heard"), anythingElse: s("anythingElse"),
    };
    try {
      setStep("Uploading the deck…");
      const deckPath = await upload(props.getSlot, deck);
      let formPath: string | undefined;
      if (team && useFormPdf && formPdf) {
        setStep("Uploading the form…");
        formPath = await upload(props.getSlot, formPdf);
      }
      setStep("Reading the deck…");
      if (props.mode === "team") {
        const r = await props.submit(formPath ? { deckPath, formPath } : { deckPath, fields });
        if ("error" in r) throw new Error(r.error);
        router.push(`/applications/${r.applicationId}`);
        return;
      }
      const r = await props.submit({ fields, deckPath, trap: s("company_url") });
      if ("error" in r) throw new Error(r.error);
      setDone(r.company || fields.company);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStep(null);
    }
  }

  if (done)
    return (
      <div role="status" className="elev-1 rounded-[20px] bg-canvas p-6">
        <h2 className="font-display text-[30px] font-normal leading-tight">Thank you. We have {done}’s application.</h2>
        <p className="mt-2 text-[14px] text-ink-muted">We read every application. You’ll hear from us by email, at the address you gave.</p>
      </div>
    );

  const showFields = !(team && useFormPdf);
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* bots fill every field; people never see this one */}
      {!team && (
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>Company URL<input name="company_url" tabIndex={-1} autoComplete="off" /></label>
        </div>
      )}

      <section className="elev-1 space-y-3 rounded-[20px] bg-canvas p-5">
        <h2 className="font-display text-[22px] font-normal">Pitch deck</h2>
        <DropZone id="deck" title="Drop the pitch deck here, or click to choose" hint={`PDF with selectable text, up to ${MAX_MB} MB`} file={deck} onFile={setDeck} disabled={busy} />
        {team && (
          <div className="space-y-2 pt-1">
            <div role="radiogroup" aria-label="Application details" className="flex flex-wrap gap-1.5">
              {([[false, "Fill in the form"], [true, "I have the founder’s form PDF"]] as const).map(([v, label]) => (
                <button key={label} type="button" role="radio" aria-checked={useFormPdf === v} onClick={() => setUseFormPdf(v)} disabled={busy}
                  className={cx("press h-8 rounded-full px-3 text-[13px]", useFormPdf === v ? "bg-solid text-on-solid" : "text-ink-muted shadow-[0_0_0_1px_var(--hairline)] hover:bg-surface-1")}>
                  {label}
                </button>
              ))}
            </div>
            {useFormPdf && <DropZone id="formpdf" title="Drop the application form PDF" hint="The fund’s form, as the founder sent it" file={formPdf} onFile={setFormPdf} disabled={busy} />}
          </div>
        )}
      </section>

      {showFields && (
        <>
          <section className="elev-1 grid gap-3 rounded-[20px] bg-canvas p-5 md:grid-cols-2">
            <h2 className="font-display text-[22px] font-normal md:col-span-2">Company</h2>
            <Field label="Company name *"><input name="company" required maxLength={80} className={input} /></Field>
            <Field label="Website"><input name="website" maxLength={120} placeholder="www.example.com" className={input} /></Field>
            <Field label="One-line description *" className="md:col-span-2"><input name="oneLiner" required maxLength={200} className={input} /></Field>
            <Field label="Sector *">
              <input name="sector" required list="sectors" maxLength={60} className={input} />
              <datalist id="sectors">{SECTORS.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="Stage *">
              <select name="stage" required defaultValue="" className={input}>
                <option value="" disabled>Choose…</option>
                {STAGES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Location"><input name="location" maxLength={80} placeholder="City, State" className={input} /></Field>
          </section>

          <section className="elev-1 space-y-4 rounded-[20px] bg-canvas p-5">
            <h2 className="font-display text-[22px] font-normal">Founders</h2>
            {founders.map((f, i) => (
              <fieldset key={i} className="grid gap-3 rounded-[14px] bg-surface-1 p-3 md:grid-cols-2">
                <legend className="sr-only">Founder {i + 1}</legend>
                <Field label={`Founder ${i + 1} name${i === 0 ? " *" : ""}`}><input value={f.name} onChange={(e) => setFounder(i, "name", e.target.value)} maxLength={80} required={i === 0} className={input} /></Field>
                <Field label="Role"><input value={f.role} onChange={(e) => setFounder(i, "role", e.target.value)} maxLength={40} placeholder="CEO, CTO…" className={input} /></Field>
                <Field label={`Email${i === 0 ? " *" : ""}`} hint={i === 0 ? "We reply here. It isn’t shared." : undefined}><input type="email" value={f.email} onChange={(e) => setFounder(i, "email", e.target.value)} maxLength={120} required={i === 0} className={input} /></Field>
                <Field label="LinkedIn"><input value={f.linkedin} onChange={(e) => setFounder(i, "linkedin", e.target.value)} maxLength={160} placeholder="linkedin.com/in/…" className={input} /></Field>
                <Field label="Background" className="md:col-span-2"><textarea value={f.background} onChange={(e) => setFounder(i, "background", e.target.value)} maxLength={500} rows={2} className={input} /></Field>
                {i > 0 && (
                  <button type="button" onClick={() => setFounders((fs) => fs.filter((_, j) => j !== i))} className="press justify-self-start text-[12px] text-ink-muted hover:text-ink">Remove founder</button>
                )}
              </fieldset>
            ))}
            {founders.length < 3 && (
              <button type="button" onClick={() => setFounders((fs) => [...fs, { ...NO_FOUNDER }])} className="press h-8 rounded-full px-3 text-[13px] text-ink-muted shadow-[0_0_0_1px_var(--hairline)] hover:bg-surface-1">
                Add a co-founder
              </button>
            )}
          </section>

          <section className="elev-1 grid gap-3 rounded-[20px] bg-canvas p-5 md:grid-cols-2">
            <h2 className="font-display text-[22px] font-normal md:col-span-2">Product and traction</h2>
            <Field label="What have you built? *" className="md:col-span-2"><textarea name="built" required maxLength={1500} rows={3} className={input} /></Field>
            <Field label="Revenue / GMV" hint="e.g. MRR INR 78,000"><input name="revenue" maxLength={400} className={input} /></Field>
            <Field label="Growth" hint="e.g. 15% month on month since March"><input name="growth" maxLength={400} className={input} /></Field>
          </section>

          <section className="elev-1 grid gap-3 rounded-[20px] bg-canvas p-5 md:grid-cols-2">
            <h2 className="font-display text-[22px] font-normal md:col-span-2">Fundraising</h2>
            <Field label="Amount raising *" hint="e.g. INR 1.5 Cr"><input name="raising" required maxLength={80} className={input} /></Field>
            <Field label="Valuation expectation" hint="e.g. INR 10 Cr post-money"><input name="valuation" maxLength={80} className={input} /></Field>
            <Field label="Existing investors"><input name="existingInvestors" maxLength={300} className={input} /></Field>
            <Field label="Use of funds"><input name="useOfFunds" maxLength={500} className={input} /></Field>
            <Field label="How did you hear about us?" hint="If someone introduced you, name them."><input name="heard" maxLength={200} className={input} /></Field>
            <Field label="Anything else we should know?" className="md:col-span-2"><textarea name="anythingElse" maxLength={1500} rows={3} className={input} /></Field>
          </section>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy}
          className="press h-11 rounded-full bg-primary px-5 text-[14px] font-medium text-on-primary hover:bg-primary-hover disabled:opacity-60">
          {busy ? step : team ? "Add and start the review" : "Submit application"}
        </button>
        <span aria-live="polite" className="text-[12px] text-ink-subtle">{busy ? "Keep this page open." : null}</span>
      </div>
      {error && <p role="alert" className="rounded-[10px] bg-red-bg px-3 py-2 text-[13px] text-red">{error}</p>}
    </form>
  );
}
