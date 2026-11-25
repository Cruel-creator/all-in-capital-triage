// The founders' public application page. No sign-in, and no team data: the root layout renders it bare.
import type { Metadata } from "next";
import { IntakeForm } from "@/components/intake-form";
import { founderUploadSlot, submitApplication } from "./actions";

export const metadata: Metadata = { title: "Apply · All In Capital", description: "Apply to All In Capital with your pitch deck." };

export default function ApplyPage() {
  return (
    <div className="mx-auto max-w-[760px] pb-16">
      <header className="mb-6 mt-4 flex flex-col gap-3">
        <span className="eyebrow-pill self-start">All In Capital · Pre-seed and seed</span>
        <h1 className="font-display text-[40px] font-normal leading-[1.05] tracking-[-0.6px] md:text-[48px]">Apply with your <em className="text-primary">pitch deck</em></h1>
        <p className="max-w-[560px] text-[14px] text-ink-muted">
          Add your deck as a PDF and tell us about the company. It takes about ten minutes. A partner reads every application, and we reply by email.
        </p>
      </header>
      <IntakeForm mode="founder" getSlot={founderUploadSlot} submit={submitApplication} />
    </div>
  );
}
