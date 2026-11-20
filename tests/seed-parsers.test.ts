import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseForm } from "../src/lib/seed/parse-form";
import { parseMemos, parseMeetings } from "../src/lib/seed/chunk-memos";

const load = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "seed", "text", name), "utf8")).pages;

test("all 10 forms parse a company, sector, stage and at least one founder", () => {
  const forms = readdirSync(join(process.cwd(), "seed", "text")).filter((f) => /_Form\.json$/.test(f));
  assert.equal(forms.length, 10);
  for (const f of forms) {
    const p = parseForm(load(f));
    assert.ok(p.company_name && p.company_name.length > 2, `${f}: company`);
    assert.ok(p.sector_label, `${f}: sector`);
    assert.ok(p.stage_label, `${f}: stage`);
    assert.ok(p.founders.length >= 1, `${f}: founders`);
    for (const fd of p.founders) assert.match(fd.full_name, /^[A-Z]/, `${f}: founder name "${fd.full_name}"`);
  }
});

test("form specifics: names, honorifics, warm intro, sector label as selected", () => {
  const ss = parseForm(load("StockSathi_Form.json"));
  assert.equal(ss.company_name, "StockSathi");
  assert.equal(ss.source, "warm_intro");
  assert.deepEqual(ss.founders.map((f) => f.full_name), ["Aarav Deshmukh", "Pooja Nair"]);
  assert.equal(ss.founders[0].linkedin_url, "linkedin.com/in/aarav-deshmukh-example");

  const cc = parseForm(load("CareCorner_Form.json"));
  assert.equal(cc.founders[0].full_name, "Dr. Lakshmi Reddy");
  assert.equal(cc.sector_label, "Other (Healthcare)");

  const yt = parseForm(load("Yatrika_Form.json"));
  assert.equal(yt.founders[0].full_name, "Manish Joshi");

  const gk = parseForm(load("GrainKind_Form.json"));
  assert.equal(gk.founders[0].linkedin_url, "linkedin.com/in/ritu-hegde-example");
  assert.equal(gk.source, "form");

  const tb = parseForm(load("Talkbook_Form.json"));
  assert.equal(tb.sector_label, "Consumer tech"); // labelled consumer tech, actually B2B SaaS (golden)

  const st = parseForm(load("Settlr_Form.json"));
  assert.equal(st.stage_label, "Series A");

  const pw = parseForm(load("Pumpwise_Form.json"));
  assert.equal(pw.source, "form"); // "incubator mentor suggested" is not a warm intro from the network
});

test("12 memos with correct outcomes and page ranges", () => {
  const memos = parseMemos(load("Deal_Memos.json"));
  assert.equal(memos.length, 12);
  const invested = memos.filter((m) => m.outcome === "invested").map((m) => m.company).sort();
  assert.deepEqual(invested, ["Giva", "Jai Kisan", "SuperK", "The ePlane Company", "Unbox Robotics", "Wint Wealth"]);
  const passed = memos.filter((m) => m.outcome === "passed").map((m) => m.company).sort();
  assert.deepEqual(passed, ["AeroDrop", "CampusCredit", "Coinlane", "HopBox", "Petalry", "Prepnest"]);
  for (const m of memos) {
    assert.ok(m.chunks.length >= 4, `${m.company}: ${m.chunks.length} chunks`);
    assert.ok(m.page_from >= 1 && m.page_to >= m.page_from);
  }
  const petalry = memos.find((m) => m.company === "Petalry")!;
  assert.equal(petalry.page_from, 1);
  assert.equal(petalry.page_to, 2);
  assert.ok(petalry.chunks.find((c) => c.section === "Why we passed")!.page_no === 2);
});

test("5 meetings, each chunked with page numbers", () => {
  const ms = parseMeetings(load("Partner_Meeting_Notes.json"));
  assert.deepEqual(ms.map((m) => m.meeting_no), [1, 2, 3, 4, 5]);
  for (const m of ms) assert.ok(m.chunks.length >= 2 && m.chunks.every((c) => c.page_no === m.page_no));
  const m4 = ms.find((m) => m.meeting_no === 4)!;
  assert.ok(m4.chunks.some((c) => c.text.includes("MeetRecord")));
});
