// pnpm tsx scripts/b6/eval.ts [variants] — B6 step 5: the harness. Scores email drafts on the SEALED test set against
// Riya's standard: deterministic checks plus a judge that sees the email she actually sent. Variants:
//   A  the old system's draft from the export (what Riya saw: the baseline today)
//   B  the current build's email prompt (email_draft@v1)
//   C  the improved prompt (email_draft@v2) with Riya's 3 most similar past emails as examples (the "loop", no training)
//   D  a fine-tuned model's outputs, if seed/b6/out/finetuned.outputs.jsonl exists ({id, email} per line)
//   E  the improved prompt with no examples (what production does before Riya's own edits accumulate)
// The judge is calibrated first: on variant A we know which drafts Riya really sent unchanged.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { admin, must } from "../../src/lib/db/admin";
import { callModel } from "../../src/lib/llm/gateway";
import { loadPrompt, render } from "../../src/lib/llm/prompts";
import { flush } from "../../src/lib/llm/langfuse";
import { OUT, allPass, checkEmail, type Check, type Example } from "./common";

const read = (f: string) => readFileSync(`${OUT}/${f}`, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Example);
const sealedText = readFileSync(`${OUT}/test.sealed.jsonl`, "utf8");
const seal = readFileSync(`${OUT}/SEAL.txt`, "utf8").match(/sha256 ([0-9a-f]+)/)?.[1];
if (createHash("sha256").update(sealedText).digest("hex") !== seal) throw new Error("The sealed test set has changed since it was sealed");
const test = read("test.sealed.jsonl");
const trainReal = read("train.real.jsonl");
const { maxWords } = JSON.parse(readFileSync(`${OUT}/meta.json`, "utf8")) as { maxWords: number };
const field = (e: Example, k: string) => e.input.match(new RegExp(`^${k}: (.*)$`, "m"))?.[1] ?? "";
const slots = (e: Example) => field(e, "Slots to offer").replace(/, afternoon$/, "").split(" or ");

const Draft = z.object({ subject: z.string().default(""), body: z.string().min(20), opening_claim_id: z.string().nullable().default(null) });
const Verdict = z.object({ send_as_is: z.boolean(), reason: z.string() });

async function register(name: string, version: number) {
  const t = loadPrompt(name, version);
  const pv = must(await admin().from("prompt_versions").upsert({ name, version, template: t.template, sha256: t.sha256 }, { onConflict: "name,version" }).select("id").single(), `prompt ${name}`);
  return { ...t, versionId: pv.id as string };
}

// the same variables the production draft step renders (src/lib/pipeline/draft-email.ts), built from the export row
function userVars(e: Example) {
  const claims = field(e, "Traction").split(/;\s*/).filter(Boolean).map((c, i) => `c${String(i + 1).padStart(2, "0")} | deck | traction | ${c}`).join("\n");
  return { one_liner: field(e, "Founder background"), company: `${field(e, "Sector")} startup, ${field(e, "Stage")}`, founders: "[F1]", action: "take_call", context: "Gates tripped: none", claims, redo: "" };
}
const V1_RULES = (hw: boolean) => `CALL INVITE. Propose a 30-minute call. Mention one or two things we'd want to cover, drawn from: their numbers.${hw ? " Aditya, our partner who leads deeptech, will join: say so." : ""} End with exactly one question offering "{slot_1}" or "{slot_2}" (keep those placeholders verbatim).`;
export const V2_RULES = (hw: boolean) => `CALL INVITE. The third sentence asks whether 30 minutes on {slot_1} or {slot_2} works, in the afternoon (keep those placeholders verbatim).${hw ? ' Hardware founder: add "Our partner Aditya will join us for the technical part."' : ""}`;

/** Riya's 3 most similar past emails (same founder type first, then sector), from training rows only. */
function similar(e: Example) {
  const score = (x: Example) => (x.founder_type === e.founder_type ? 2 : 0) + (x.sector === e.sector ? 1 : 0);
  return [...trainReal].sort((a, b) => score(b) - score(a)).slice(0, 3);
}

async function draftWith(tpl: Awaited<ReturnType<typeof register>>, e: Example, rules: string, examples: Example[]) {
  const system = render(tpl.system, {
    template_rules: rules,
    style_examples: examples.length ? `Emails Riya actually sent to similar founders (match her shape and tone, not her facts):\n${examples.map((x, i) => `Example ${i + 1}:\n${x.target}`).join("\n\n")}` : "",
  });
  const { data } = await callModel({ step: "b6:draft", prompt: { name: tpl.name, version: tpl.version, versionId: tpl.versionId, system, user: render(tpl.user, userVars(e)) }, schema: Draft, temperature: 0.4 });
  const [s1, s2] = slots(e);
  return data.body.split("{slot_1}").join(s1 ?? "{slot_1}").split("{slot_2}").join(s2 ?? "{slot_2}").trim();
}

async function main() {
  const variants = (process.argv[2] ?? "ABCD").toUpperCase().split("");
  const [v1, v2, judgeT] = await Promise.all([register("email_draft", 1), register("email_draft", 2), register("b6_judge", 1)]);
  const ft = existsSync(`${OUT}/finetuned.outputs.jsonl`) ? new Map(readFileSync(`${OUT}/finetuned.outputs.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { id: string; email: string }).map((x) => [x.id, x.email])) : null;

  const judge = async (e: Example, draft: string) =>
    (await callModel({ step: "b6:judge", prompt: { name: judgeT.name, version: judgeT.version, versionId: judgeT.versionId, system: judgeT.system, user: render(judgeT.user, { input: e.input, draft, reference: e.target }) }, schema: Verdict, temperature: 0 })).data;

  type Row = { id: string; type: string; variant: string; email: string; checks: Check[]; checksPass: boolean; judge: { send_as_is: boolean; reason: string }; pass: boolean };
  const rows: Row[] = [];
  for (const v of variants) {
    if (v === "D" && !ft) { console.log("D skipped: no fine-tuned outputs yet"); continue; }
    for (const e of test) {
      try {
        const email =
          v === "A" ? e.system_draft! :
          v === "B" ? await draftWith(v1, e, V1_RULES(e.founder_type === "hardware"), []) :
          v === "C" ? await draftWith(v2, e, V2_RULES(e.founder_type === "hardware"), similar(e)) :
          v === "E" ? await draftWith(v2, e, V2_RULES(e.founder_type === "hardware"), []) :
          ft!.get(e.id) ?? "";
        const checks = checkEmail(email, { traction: field(e, "Traction"), founder_type: e.founder_type, maxWords });
        const j = await judge(e, email);
        rows.push({ id: e.id, type: e.founder_type, variant: v, email, checks, checksPass: allPass(checks), judge: j, pass: allPass(checks) && j.send_as_is });
      } catch (err) {
        rows.push({ id: e.id, type: e.founder_type, variant: v, email: "", checks: [], checksPass: false, judge: { send_as_is: false, reason: `error: ${(err as Error).message.slice(0, 120)}` }, pass: false });
      }
    }
    const mine = rows.filter((r) => r.variant === v);
    console.log(`${v}: ${mine.filter((r) => r.pass).length}/${mine.length} would be sent as-is (checks ${mine.filter((r) => r.checksPass).length}, judge ${mine.filter((r) => r.judge.send_as_is).length})`);
  }

  // judge calibration on A: Riya's real behaviour is known there
  const a = rows.filter((r) => r.variant === "A");
  const truth = new Map(test.map((e) => [e.id, !!e.unchanged]));
  const agree = a.filter((r) => r.judge.send_as_is === truth.get(r.id)).length;
  const summary = {
    sealed: seal, test: test.length, maxWords,
    riyaActuallySentUnchanged: test.filter((e) => e.unchanged).length,
    judgeAgreementWithRiyaOnA: a.length ? `${agree}/${a.length}` : "n/a",
    byVariant: Object.fromEntries([...new Set(rows.map((r) => r.variant))].map((v) => {
      const m = rows.filter((r) => r.variant === v);
      const checkRate = Object.fromEntries((m[0]?.checks ?? []).map((c) => [c.id, `${m.filter((r) => r.checks.find((x) => x.id === c.id)?.pass).length}/${m.length}`]));
      return [v, { sendAsIs: `${m.filter((r) => r.pass).length}/${m.length}`, checksPass: m.filter((r) => r.checksPass).length, judgeYes: m.filter((r) => r.judge.send_as_is).length, checks: checkRate }];
    })),
  };
  // keep earlier variants' results when only some are re-run
  const file = `${OUT}/eval.results.json`;
  const prev = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { summary: typeof summary; rows: Row[] }) : null;
  const ran = new Set(rows.map((r) => r.variant));
  const merged = { summary: { ...summary, byVariant: { ...(prev?.summary.byVariant ?? {}), ...summary.byVariant }, judgeAgreementWithRiyaOnA: ran.has("A") ? summary.judgeAgreementWithRiyaOnA : prev?.summary.judgeAgreementWithRiyaOnA }, rows: [...(prev?.rows ?? []).filter((r) => !ran.has(r.variant)), ...rows] };
  writeFileSync(file, JSON.stringify(merged, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  await flush();
}
main().catch((e) => { console.error((e as Error).message); process.exitCode = 1; });
