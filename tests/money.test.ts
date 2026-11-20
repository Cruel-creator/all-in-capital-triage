import { test } from "node:test";
import assert from "node:assert/strict";
import { formatInr, parseAmount, deltaPct } from "../src/lib/reconcile/money";

test("parseAmount reads Indian units", () => {
  assert.equal(parseAmount("INR 91,200 Cr"), 91_200e7);
  assert.equal(parseAmount("₹1.9 L"), 1.9e5);
  assert.equal(parseAmount("INR 1.44 lakh Cr"), 1.44e12);
  assert.equal(parseAmount("38M"), 38e6);
  assert.equal(parseAmount("300K"), 3e5);
  assert.equal(parseAmount("INR 340"), 340);
  assert.equal(parseAmount("n/a"), null);
});

test("formatInr uses lakh / crore / lakh crore", () => {
  assert.equal(formatInr(9_120e7), "₹9,120 Cr");
  assert.equal(formatInr(1.44e12), "₹1.44 lakh Cr");
  assert.equal(formatInr(1.7e5), "₹1.7 L");
  assert.equal(formatInr(2_860), "₹2,860");
});

test("deltaPct is relative to the computed value", () => {
  assert.equal(deltaPct(7, 3.68), 90.2);
  assert.equal(deltaPct(100, 100), 0);
});
