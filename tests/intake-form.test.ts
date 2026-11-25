import { test } from "node:test";
import assert from "node:assert/strict";
import { parseForm } from "../src/lib/seed/parse-form";
import { ApplicationFields, dedupeKey, founderRows, formPages } from "../src/lib/intake/form-text";

const base = {
  company: "Kiranaflow",
  website: "www.kiranaflow.example",
  location: "Pune, Maharashtra",
  oneLiner: "Credit and stock app for neighbourhood kirana stores.",
  sector: "Fintech",
  stage: "Seed",
  founders: [
    { name: "Asha Rao", role: "CEO", email: "Asha@Example.com", linkedin: "https://www.linkedin.com/in/asha-rao-example/", background: "Ran a 40-store distribution business\nfor 6 years" },
    { name: "Vikram Iyer", role: "CTO", email: "", linkedin: "", background: "" },
  ],
  built: "An Android app\nused by 300 stores.",
  revenue: "MRR INR 2.1 L",
  growth: "18% month on month",
  raising: "INR 3 Cr",
  valuation: "INR 18 Cr post-money",
  existingInvestors: "",
  useOfFunds: "Sales and engineering",
  heard: "",
  anythingElse: "",
};

test("a web form becomes page text the pipeline's own form parser reads back", () => {
  const v = ApplicationFields.parse(base);
  const p = parseForm(formPages(v));
  assert.equal(p.company_name, "Kiranaflow");
  assert.equal(p.one_liner, base.oneLiner);
  assert.equal(p.sector_label, "Fintech");
  assert.equal(p.stage_label, "Seed");
  assert.equal(p.location, "Pune, Maharashtra");
  assert.equal(p.source, "form");
  assert.equal(p.founders.length, 2);
  assert.equal(p.founders[0].full_name, "Asha Rao");
  assert.equal(p.founders[0].role_title, "CEO");
  assert.equal(p.founders[0].linkedin_url, "linkedin.com/in/asha-rao-example");
  assert.equal(p.founders[1].full_name, "Vikram Iyer");
  // answers typed over several lines stay one field
  assert.equal(p.fields["What have you built?"].value, "An Android app used by 300 stores.");
  assert.equal(p.fields["Amount raising"].value, "INR 3 Cr");
  assert.equal(p.fields["Valuation expectation"].value, "INR 18 Cr post-money");
  assert.equal(p.fields["Amount raising"].page_no, 2);
});

test("founder emails go to the founders table, never into the form text", () => {
  const v = ApplicationFields.parse(base);
  const text = formPages(v).map((p) => p.text).join("\n");
  assert.ok(!/@/.test(text));
  const rows = founderRows(v);
  assert.equal(rows[0].email, "asha@example.com");
  assert.equal(rows[1].email, null);
  assert.equal(rows[0].linkedin_url, "linkedin.com/in/asha-rao-example");
});

test("an introduction is read as a warm intro, like the PDF forms", () => {
  const p = parseForm(formPages(ApplicationFields.parse({ ...base, heard: "Introduced by Meera at a portfolio company" })));
  assert.equal(p.source, "warm_intro");
});

test("one founder alone is still read as a founder", () => {
  const p = parseForm(formPages(ApplicationFields.parse({ ...base, founders: [base.founders[0]] })));
  assert.equal(p.founders.length, 1);
  assert.equal(p.founders[0].full_name, "Asha Rao");
});

test("the form refuses what the pipeline can't use", () => {
  const bad = (o: object) => !ApplicationFields.safeParse({ ...base, ...o }).success;
  assert.ok(bad({ company: " " }));
  assert.ok(bad({ stage: "Growth" }));
  assert.ok(bad({ founders: [{ name: "Asha Rao", email: "" }] }), "needs one founder email to reply to");
  assert.ok(bad({ founders: [{ name: "asha", email: "a@b.co" }] }), "lowercase names break the founder parser");
  assert.ok(bad({ founders: [{ name: "Asha Rao", email: "not-an-email" }] }));
  assert.ok(bad({ raising: "" }));
});

test("the duplicate key matches the seed's rule", () => {
  assert.equal(dedupeKey("CAPilot (CAPilot Labs Pvt. Ltd.)"), "capilot");
  assert.equal(dedupeKey("Rent Route"), "rentroute");
});
