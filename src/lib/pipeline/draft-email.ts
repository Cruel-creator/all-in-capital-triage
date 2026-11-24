// draft_email step (build prompt §8). The model drafts; a deterministic linter decides. Founder names never reach
// the model ([F1] tokens are filled with first names afterwards). Nothing here sends anything.
import { z } from "zod";
import { admin, must } from "../db/admin";
import { callModel, ModelOutputError } from "../llm/gateway";
import { render } from "../llm/prompts";
import { lintEmail, lintFeedback, type LintReport, type Template } from "../email/lint";
import { loadContext } from "./context";
import { prompt } from "./gates";

export const REDO_CHIPS = {
  shorter: "Make it shorter: cut to the essentials, well under 100 words.",
  warmer: "Make it warmer and more personal, without flattery.",
  direct: "Make it more direct: lead with the ask, fewer qualifiers.",
  opening: "Use a different opening fact from the claims list.",
  sharper: "Ask a sharper, more specific question tied to their numbers.",
} as const;
export type RedoChip = keyof typeof REDO_CHIPS;

// Call invites use email_draft@v2: the shape of Riya's real sent invites (one fact, one question, the slots). On the
// B6 sealed test it took Riya's "send as-is" rate from 35% (old drafts) to 90% with her past emails as examples
// (70% without). Dig, pass and follow-up emails have a different shape and stay on v1. See docs/fine-tuning/.
const PROMPT_VERSION: Record<Template, number> = { invite: 2, dig: 1, pass: 1, follow_up: 1 };

const TEMPLATE_RULES: Record<Template, (o: { deeptech: boolean; questions: string[]; change: string | null; integrity: boolean }) => string> = {
  invite: ({ deeptech }) =>
    `CALL INVITE. The third sentence asks whether 30 minutes on {slot_1} or {slot_2} works, in the afternoon (keep those placeholders verbatim).` +
    `${deeptech ? ' Deeptech or hardware founder: add "Our partner Aditya will join us for the technical part."' : ""}`,
  dig: ({ questions, integrity }) =>
    `DIG. Ask 1 or 2 specific questions before we decide on a call, chosen from: ${questions.join(" | ") || "the weakest evidence in the claims"}. ` +
    `${integrity ? "Where the deck and form disagree, ask them to share the underlying numbers; never suggest wrongdoing. " : ""}No call slots.`,
  pass: ({ change, integrity }) =>
    `PASS. Say kindly that we are not moving forward now, give the specific reason, and say what would change our view: ${change ?? "name the evidence that would make us look again"}. ` +
    `${integrity ? "If numbers disagree, invite them to share the numbers rather than alleging anything. " : ""}Be kind and specific, never accusatory. At most one question.`,
  follow_up: () => "FOLLOW-UP. One or two sentences referring to the earlier note, restate the single next step. At most one question.",
};

const Out = z.object({ subject: z.string().min(2), body: z.string().min(20), opening_claim_id: z.string().nullable().default(null) });

export const templateFor = (action: string | null): Template => (action === "take_call" ? "invite" : action === "dig" ? "dig" : "pass");

/** [F1] → founder first name (display/storage only; never sent to a model). */
export function fillNames(text: string, founders: { position: number; full_name: string }[]) {
  return founders.reduce((t, f) => t.split(`[F${f.position}]`).join(f.full_name.replace(/^Dr\.?\s*/i, "").split(/\s+/)[0]), text);
}

export async function draftEmail(o: {
  applicationId: string;
  template?: Template;
  redo?: { chip?: RedoChip; note?: string; previous?: { subject: string; body: string } };
  draftId?: string;
  author?: string | null;
  traceId?: string;
}) {
  const db = admin();
  const ctx = await loadContext(o.applicationId);
  const rec = (await db.from("recommendations").select("action, dig_questions, what_would_change").eq("application_id", o.applicationId).maybeSingle()).data;
  const gates = must(await db.from("gates").select("gate, tripped, reasons").eq("application_id", o.applicationId), "gates");
  const founders = must(await db.from("founders").select("position, full_name").eq("application_id", o.applicationId).order("position"), "founders");
  const sector = (await db.from("applications").select("sector_inferred").eq("id", o.applicationId).single()).data?.sector_inferred ?? "";
  const template = o.template ?? templateFor(rec?.action ?? null);
  const deeptech = sector.includes("deeptech");
  const integrity = gates.some((g) => g.gate === "G4" && g.tripped);
  const examples = must(await db.from("style_examples").select("draft_text, sent_text").eq("template", template).order("created_at", { ascending: false }).limit(3), "style examples");
  const p = await prompt("email_draft", PROMPT_VERSION[template]);

  const system = render(p.system, {
    template_rules: TEMPLATE_RULES[template]({ deeptech, questions: (rec?.dig_questions as string[]) ?? [], change: rec?.what_would_change ?? null, integrity }),
    style_examples: !examples.length
      ? ""
      : PROMPT_VERSION[template] === 2
        ? `Emails Riya actually sent (match her shape and tone, not her facts):\n${examples.map((e, i) => `Example ${i + 1}:\n${e.sent_text}`).join("\n\n")}`
        : `Riya's own edits to past drafts (follow her preferences):\n${examples.map((e, i) => `Example ${i + 1}, draft:\n${e.draft_text}\nWhat Riya sent:\n${e.sent_text}`).join("\n\n")}`,
  });
  const tripped = gates.filter((g) => g.tripped).map((g) => `${g.gate}: ${(g.reasons as { text: string }[]).map((r) => r.text).join("; ")}`);
  const redoText = o.redo
    ? `Rewrite this previous draft.\nPrevious subject: ${o.redo.previous?.subject ?? ""}\nPrevious body:\n${o.redo.previous?.body ?? ""}\n` +
      `${o.redo.chip ? `Change requested: ${REDO_CHIPS[o.redo.chip]}\n` : ""}${o.redo.note ? `Riya's note: ${o.redo.note}\n` : ""}`
    : "";
  const baseUser = render(p.user, {
    one_liner: ctx.app.one_liner ?? "",
    company: ctx.app.company_name,
    founders: founders.map((f) => `[F${f.position}]`).join(", "),
    action: rec?.action ?? "pending",
    context: `Gates tripped: ${tripped.join(" | ") || "none"}\nWhat would change our view: ${rec?.what_would_change ?? "n/a"}`,
    claims: ctx.claimsText,
    redo: redoText,
  });

  // the linter decides: up to 3 generations, each told exactly what failed
  let out: z.infer<typeof Out> | null = null;
  let report: LintReport | null = null;
  let feedback = "";
  for (let attempt = 0; attempt < 3 && !report?.ok; attempt++) {
    try {
      const { data } = await callModel({
        step: "draft_email",
        applicationId: o.applicationId,
        prompt: { name: p.name, version: p.version, versionId: p.versionId, system, user: feedback ? `${baseUser}\n\nThe last draft failed these checks, fix all of them: ${feedback}` : baseUser },
        schema: Out,
        founders: ctx.refs,
        traceId: o.traceId,
        temperature: 0.4,
        validate: (x) => {
          const r = lintEmail({ subject: x.subject, body: x.body, template });
          return r.ok ? null : lintFeedback(r);
        },
      });
      out = data;
    } catch (e) {
      if (!(e instanceof ModelOutputError)) throw e;
      feedback = e.message;
      continue;
    }
    report = lintEmail({ subject: out.subject, body: out.body, template });
    feedback = lintFeedback(report);
  }
  if (!out) throw new Error(`Could not draft an email that passes the checks: ${feedback}`);

  const opening = out.opening_claim_id ? ctx.cites.get(out.opening_claim_id) : undefined;
  const subject = fillNames(out.subject, founders);
  const body = fillNames(out.body, founders);
  const finalReport = lintEmail({ subject, body, template });

  let draftId = o.draftId;
  if (!draftId) {
    const d = must(
      await db.from("email_drafts").insert({ application_id: o.applicationId, template, opening_claim_id: opening?.kind === "claim" ? opening.uuid : null }).select("id").single(),
      "email_drafts",
    );
    draftId = d.id as string;
  }
  const last = (await db.from("email_versions").select("n").eq("draft_id", draftId).order("n", { ascending: false }).limit(1).maybeSingle()).data;
  const v = must(
    await db
      .from("email_versions")
      .insert({
        draft_id: draftId, n: (last?.n ?? 0) + 1, subject, body, origin: o.redo ? "redo" : "generated",
        redo_chip: o.redo?.chip ?? null, redo_note: o.redo?.note ?? null, lint_report: finalReport, author: o.author ?? null,
      })
      .select("id")
      .single(),
    "email_versions",
  );
  must(await db.from("email_drafts").update({ current_version_id: v.id }).eq("id", draftId), "current version");
  await db.from("timeline_events").insert({ application_id: o.applicationId, kind: o.redo ? "email_redo" : "email_drafted", payload: { template, draft_id: draftId, lint_ok: finalReport.ok } });
  return { draftId, versionId: v.id as string, report: finalReport };
}
