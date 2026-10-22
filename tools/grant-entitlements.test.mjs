/*
  Tests for the corporate bulk-grant CLI — run with:
    npm run entitlements:grant:test

  The CLI's own job is the pure part: read a staff CSV, map its columns,
  derive one stable+unique reference per employee from the single invoice
  reference, and decide which rows can be granted. That logic is what these
  tests pin down, with no files and no Firestore. One final test drives the
  real recordManualEntitlement through the in-memory Firestore to prove the
  derived references actually behave — distinct people get distinct grants,
  and a re-run grants nobody twice.
*/

import assert from "node:assert/strict";
import { install } from "./firestore-stub.mjs";

// Must happen before grant-entitlements.mjs is imported, because it pulls
// in entitlements.js → firebaseAdmin.js → firebase-admin at load time.
install();

const { parseCsv, headerIndex, toRecords, deriveReference, planGrants } =
  await import("./grant-entitlements.mjs");
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const { recordManualEntitlement, peekManualGrant, normalizeReference } =
  require("../api/_lib/entitlements.js");

const SKU = "lume-lens-working-profile";
const PRICE = 1999; // catalogue price, api/_lib/catalog.js

let passed = 0;
let failed = 0;

async function test(name, fn){
  try{
    await fn();
    passed += 1;
    console.log("  ✓ " + name);
  }catch(err){
    failed += 1;
    console.log("  ✗ " + name + "\n      " + (err && err.message || err));
  }
}

console.log("\nCSV parsing");

await test("splits plain rows", () => {
  const rows = parseCsv("email,phone,name\na@x.com,9812345678,Asha");
  assert.deepEqual(rows, [["email", "phone", "name"], ["a@x.com", "9812345678", "Asha"]]);
});

await test("honours quoted fields with commas and escaped quotes", () => {
  const rows = parseCsv('email,name\nb@x.com,"Patel, Riya"\nc@x.com,"She said ""hi"""');
  assert.deepEqual(rows[1], ["b@x.com", "Patel, Riya"]);
  assert.deepEqual(rows[2], ["c@x.com", 'She said "hi"']);
});

await test("normalises CRLF line endings", () => {
  const rows = parseCsv("email\r\na@x.com\r\n");
  assert.deepEqual(rows, [["email"], ["a@x.com"]]);
});

console.log("\nheader mapping");

await test("finds columns regardless of case, spacing and separators", () => {
  const cols = headerIndex(["Full Name", "E-Mail", "Mobile Number"]);
  assert.equal(cols.name, 0);
  assert.equal(cols.email, 1);
  assert.equal(cols.phone, 2);
});

await test("reports -1 for a column that isn't there", () => {
  const cols = headerIndex(["email"]);
  assert.equal(cols.email, 0);
  assert.equal(cols.phone, -1);
  assert.equal(cols.name, -1);
});

console.log("\nrecord extraction");

await test("maps rows to records and keeps true file line numbers", () => {
  const { records } = toRecords(parseCsv("email,phone,name\na@x.com,9812345678,Asha\nb@x.com,,Ben"));
  assert.equal(records.length, 2);
  assert.deepEqual(records[0], { email: "a@x.com", phone: "9812345678", name: "Asha", line: 2 });
  assert.equal(records[1].line, 3);
});

await test("skips blank spacer rows without counting them as data", () => {
  const { records } = toRecords(parseCsv("email\na@x.com\n\n\nb@x.com\n"));
  assert.equal(records.length, 2);
  assert.equal(records[1].email, "b@x.com");
});

await test("errors when no email or phone column is present", () => {
  const out = toRecords(parseCsv("name,department\nAsha,Sales"));
  assert.ok(out.error && /email.*phone/i.test(out.error));
  assert.equal(out.records.length, 0);
});

console.log("\nreference derivation");

await test("is stable — same invoice and person give the same reference", () => {
  assert.equal(
    deriveReference("ERAUTO-INV-001", "asha@er.com"),
    deriveReference("ERAUTO-INV-001", "asha@er.com")
  );
});

await test("is unique per person", () => {
  assert.notEqual(
    deriveReference("ERAUTO-INV-001", "asha@er.com"),
    deriveReference("ERAUTO-INV-001", "ben@er.com")
  );
});

await test("carries the normalised invoice reference as its prefix", () => {
  const ref = deriveReference("ER-AUTO/INV 001", "asha@er.com");
  const base = normalizeReference("ER-AUTO/INV 001");
  assert.ok(ref.startsWith(base), ref + " should start with " + base);
  assert.equal(ref.length, base.length + 12); // base + 12 hex chars of hash
});

console.log("\nplanning");

function plan(csv, extra){
  const { records } = toRecords(parseCsv(csv));
  return planGrants(Object.assign({ records, baseReference: "ERAUTO-INV-001", sku: SKU, note: "n" }, extra));
}

await test("builds one grant per valid row at the catalogue price by default", () => {
  const p = plan("email,phone,name\nasha@er.com,9812345678,Asha\nben@er.com,9898989898,Ben");
  assert.equal(p.grants.length, 2);
  assert.equal(p.problems.length, 0);
  assert.equal(p.grants[0].amount, PRICE);
  assert.equal(p.total, 2 * PRICE);
  assert.equal(p.grants[0].sku, SKU);
});

await test("uses the negotiated per-head amount when given, and sums to it", () => {
  const p = plan("email\nasha@er.com\nben@er.com", { amount: 1200 });
  assert.equal(p.grants[0].amount, 1200);
  assert.equal(p.total, 2400);
});

await test("skips a row whose email isn't an address, keeps the rest", () => {
  const p = plan("email,name\nnot-an-email,Asha\nben@er.com,Ben");
  assert.equal(p.grants.length, 1);
  assert.equal(p.grants[0].email, "ben@er.com");
  assert.equal(p.problems.length, 1);
  assert.equal(p.problems[0].line, 2);
  assert.match(p.problems[0].reason, /valid address/);
});

await test("grants a phone-only row but warns it can't self-restore", () => {
  const p = plan("email,phone,name\n,9812345678,Asha");
  assert.equal(p.grants.length, 1);
  assert.equal(p.grants[0].email, null);
  assert.equal(p.grants[0].phone, "9812345678");
  assert.equal(p.warnings.length, 1);
  assert.match(p.warnings[0].note, /self-restore/);
});

await test("skips a row with neither a usable email nor a 10-digit phone", () => {
  const p = plan("email,phone,name\n,12345,Asha");
  assert.equal(p.grants.length, 0);
  assert.equal(p.problems.length, 1);
  assert.match(p.problems[0].reason, /no email or phone|10-digit/);
});

await test("treats +91 and spaces as the same ten-digit phone", () => {
  const p = plan("email,phone\n,+91 98123 45678");
  assert.equal(p.grants.length, 1);
  assert.equal(p.grants[0].phone, "9812345678");
});

await test("reports a duplicated person as a skipped row, not a second grant", () => {
  const p = plan("email,name\nasha@er.com,Asha\nASHA@er.com,Asha again");
  assert.equal(p.grants.length, 1);
  assert.equal(p.problems.length, 1);
  assert.match(p.problems[0].reason, /same person as line 2/);
});

console.log("\nwriting through the in-memory Firestore");

await test("distinct employees get distinct grants, and a re-run grants nobody twice", async () => {
  const p = plan("email,name\nasha@er.com,Asha\nben@er.com,Ben");
  assert.equal(p.grants.length, 2);

  async function runOnce(){
    const out = [];
    for(const g of p.grants){
      const res = await recordManualEntitlement({
        sku: g.sku, amount: g.amount, phone: g.phone, email: g.email,
        name: g.name, reference: g.reference, note: g.note
      });
      out.push(res);
    }
    return out;
  }

  const first = await runOnce();
  assert.equal(first[0].created, true);
  assert.equal(first[1].created, true);
  assert.notEqual(first[0].orderId, first[1].orderId); // two real, separate entitlements

  const second = await runOnce();
  assert.equal(second[0].created, false); // idempotent on the derived reference
  assert.equal(second[1].created, false);
  assert.equal(second[0].orderId, first[0].orderId);
  assert.equal(second[1].orderId, first[1].orderId);

  // And the reference the plan derived is what actually got stored.
  const peek = await peekManualGrant(p.grants[0].reference);
  assert.ok(peek && peek.orderId === first[0].orderId);
});

console.log("\n" + passed + " passed, " + failed + " failed\n");
process.exit(failed ? 1 : 0);
