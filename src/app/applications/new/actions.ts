"use server";
// Riya adds an application herself: drop the deck, then either drop the founder's form PDF or fill in the form.
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/google/session";
import { ApplicationFields } from "@/lib/intake/form-text";
import { IntakeError, ingest, uploadSlot } from "@/lib/intake/intake";

const SIGN_IN = "Sign in with Google first.";

export async function teamUploadSlot() {
  if (!(await currentUser())) return { error: SIGN_IN };
  try {
    return { ok: true as const, ...(await uploadSlot()) };
  } catch (e) {
    return { error: `Couldn't start the upload: ${(e as Error).message}` };
  }
}

export async function addApplication(input: { fields?: unknown; deckPath: string; formPath?: string }) {
  if (!(await currentUser())) return { error: SIGN_IN };
  let fields;
  if (!input.formPath) {
    const parsed = ApplicationFields.safeParse(input.fields);
    if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).slice(0, 4).join(" ") };
    fields = parsed.data;
  }
  try {
    const r = await ingest({ deckPath: String(input.deckPath), formPath: input.formPath ? String(input.formPath) : undefined, fields });
    revalidatePath("/");
    return { ok: true as const, applicationId: r.applicationId, company: r.company };
  } catch (e) {
    if (e instanceof IntakeError) return { error: e.message };
    return { error: `Couldn't add the application: ${(e as Error).message}` };
  }
}
