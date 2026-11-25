"use server";
// The founders' public form. No sign-in, so every call checks the hourly cap, and a hidden field catches simple bots.
import { ApplicationFields } from "@/lib/intake/form-text";
import { IntakeError, ingest, publicCapReached, uploadSlot } from "@/lib/intake/intake";

const BUSY = "We're getting a lot of applications right now. Please try again in an hour.";

export async function founderUploadSlot() {
  try {
    if (await publicCapReached()) return { error: BUSY };
    return { ok: true as const, ...(await uploadSlot()) };
  } catch (e) {
    console.error("apply: upload slot failed:", (e as Error).message);
    return { error: "Uploads aren't working right now. Please try again shortly." };
  }
}

export async function submitApplication(input: { fields: unknown; deckPath: string; trap?: string }) {
  if (input.trap) return { ok: true as const, company: "" }; // a bot filled the hidden field: say nothing useful
  const parsed = ApplicationFields.safeParse(input.fields);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).slice(0, 4).join(" ") };
  try {
    if (await publicCapReached()) return { error: BUSY };
    const r = await ingest({ deckPath: String(input.deckPath), fields: parsed.data });
    return { ok: true as const, company: r.company };
  } catch (e) {
    if (e instanceof IntakeError) return { error: e.message };
    console.error("apply: submit failed:", (e as Error).message);
    return { error: "Something went wrong on our side. Nothing was saved; please try again." };
  }
}
