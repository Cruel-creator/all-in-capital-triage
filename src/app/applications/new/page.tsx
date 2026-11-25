// Riya's drop-zone: add an application that arrived by email or intro. It is queued and reviewed like any other.
import Link from "next/link";
import { IntakeForm } from "@/components/intake-form";
import { addApplication, teamUploadSlot } from "./actions";

export default function NewApplicationPage() {
  return (
    <div className="mx-auto max-w-[760px] pb-16">
      <header className="mb-6 flex flex-col gap-3">
        <Link href="/" className="press self-start text-[13px] text-ink-muted hover:text-ink">← Pipeline</Link>
        <h1 className="font-display text-[40px] font-normal leading-[1.05] tracking-[-0.6px]">Add an application</h1>
        <p className="max-w-[560px] text-[14px] text-ink-muted">
          Drop the founder’s deck, then add their form PDF or fill in the details. The AI starts reading within five minutes and it appears in a lane on the pipeline.
          Founders can apply themselves at <Link href="/apply" className="font-medium text-primary">/apply</Link>.
        </p>
      </header>
      <IntakeForm mode="team" getSlot={teamUploadSlot} submit={addApplication} />
    </div>
  );
}
