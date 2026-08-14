/*
  Tests for manual entitlement grants — run with:  npm run entitlements:test

  These cover the rules that decide who holds paid product without having
  paid through the gateway: that a grant is idempotent on the transfer
  reference, that it is findable the same way a real payment is, that
  order-status will resolve it (so the verify step doesn't revoke it), and
  that it can be revoked.

  Runs against tools/firestore-stub.mjs — an in-memory Firestore — because
  every one of those rules is about what is or isn't in the database.
*/

import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { install } from "./firestore-stub.mjs";

// Must happen before anything requires firebase-admin.
const store = install();

const require = createRequire(import.meta.url);
const {
  recordManualEntitlement, peekManualGrant, findManualEntitlement,
  findPaidEntitlements, isManualOrderId, normalizeReference,
  MANUAL_ORDER_PREFIX
} = require("../api/_lib/entitlements.js");

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

function grant(overrides){
  return Object.assign({
    sku: "student-full-report",
    amount: 999,
    phone: "9812345678",
    email: "someone@example.com",
    name: "Test Customer",
    reference: "UPI-402913887654",
    note: "Direct transfer verified against bank statement"
  }, overrides);
}

console.log("\nreference normalisation");

await test("uppercases and strips punctuation, so one transfer is one reference", () => {
  assert.equal(normalizeReference(" upi-4029 1388 "), "UPI40291388");
  assert.equal(normalizeReference("UPI40291388"), "UPI40291388");
});

await test("survives junk without throwing", () => {
  assert.equal(normalizeReference(null), "");
  assert.equal(normalizeReference(undefined), "");
  assert.equal(normalizeReference("!!!"), "");
  assert.equal(normalizeReference(12345), "12345");
});

await test("caps length so it can't overflow a document id", () => {
  assert.equal(normalizeReference("A".repeat(200)).length, 64);
});

console.log("\norder ids");

await test("a manual order id is recognised, a Cashfree one is not", () => {
  assert.equal(isManualOrderId(MANUAL_ORDER_PREFIX + "abc123"), true);
  assert.equal(isManualOrderId("order_MTQ4NzY1"), false);
  assert.equal(isManualOrderId(""), false);
  assert.equal(isManualOrderId(null), false);
});

await test("the minted id is unguessable and fits order-status's validator", async () => {
  store.clear();
  const a = await recordManualEntitlement(grant({ reference: "REF-A" }));
  const b = await recordManualEntitlement(grant({ reference: "REF-B" }));

  assert.notEqual(a.orderId, b.orderId, "two grants must not share an order id");
  // 16 random bytes as hex, behind the prefix.
  assert.match(a.orderId, /^manual_[0-9a-f]{32}$/);
  // The regex order-status validates order_id against.
  assert.match(a.orderId, /^[A-Za-z0-9_-]{3,45}$/);
});

console.log("\nrecording a grant");

await test("writes a PAID entitlement stamped as manual, with its reference", async () => {
  store.clear();
  const result = await recordManualEntitlement(grant());

  assert.equal(result.created, true);
  const doc = store.read("entitlements", result.orderId);
  assert.equal(doc.status, "PAID");
  assert.equal(doc.source, "manual");
  assert.equal(doc.sku, "student-full-report");
  assert.equal(doc.amount, 999);
  assert.equal(doc.reference, "UPI402913887654");
  assert.equal(doc.email, "someone@example.com");
  assert.equal(doc.phone, "9812345678");
});

await test("normalises contact details the same way a real payment does", async () => {
  store.clear();
  const result = await recordManualEntitlement(grant({
    phone: "+91 98123 45678",
    email: "  SomeOne@Example.COM  "
  }));
  const doc = store.read("entitlements", result.orderId);
  assert.equal(doc.phone, "9812345678");
  assert.equal(doc.email, "someone@example.com");
});

await test("refuses a grant with nobody to attach it to", async () => {
  store.clear();
  await assert.rejects(
    () => recordManualEntitlement(grant({ phone: "", email: "" })),
    /phone or an email/
  );
});

await test("refuses the guest placeholder phone as an identity", async () => {
  store.clear();
  // normalizePhone discards 9999999999, so this grant has no identity at
  // all — it must be refused rather than written and never restorable.
  await assert.rejects(
    () => recordManualEntitlement(grant({ phone: "9999999999", email: "" })),
    /phone or an email/
  );
});

await test("refuses a grant with no reference, so every grant has an audit trail", async () => {
  store.clear();
  await assert.rejects(() => recordManualEntitlement(grant({ reference: "" })), /reference is required/);
  await assert.rejects(() => recordManualEntitlement(grant({ reference: "!!!" })), /reference is required/);
});

console.log("\nidempotency — the same transfer must not grant twice");

await test("re-posting the same reference returns the first grant, not a second", async () => {
  store.clear();
  const first = await recordManualEntitlement(grant());
  const second = await recordManualEntitlement(grant());

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.orderId, first.orderId);

  const all = Object.keys(store.dump()).filter(k => k.startsWith("entitlements/"));
  assert.equal(all.length, 1, "a repeated reference must not create a second entitlement");
});

await test("differently-typed spellings of one reference are one grant", async () => {
  store.clear();
  const first = await recordManualEntitlement(grant({ reference: "UPI-4029 1388" }));
  const second = await recordManualEntitlement(grant({ reference: "upi40291388" }));
  assert.equal(second.orderId, first.orderId);
  assert.equal(second.created, false);
});

await test("a different reference is a different grant", async () => {
  store.clear();
  const first = await recordManualEntitlement(grant({ reference: "REF-ONE" }));
  const second = await recordManualEntitlement(grant({ reference: "REF-TWO" }));
  assert.notEqual(second.orderId, first.orderId);
  assert.equal(second.created, true);
});

await test("peek reports an existing grant without creating one", async () => {
  store.clear();
  assert.equal(await peekManualGrant("REF-NEW"), null);
  const written = Object.keys(store.dump()).length;
  assert.equal(written, 0, "peek must not write");

  const made = await recordManualEntitlement(grant({ reference: "REF-NEW" }));
  const seen = await peekManualGrant("ref new");
  assert.equal(seen.orderId, made.orderId);
});

console.log("\nresolving a grant the way the site does");

await test("order-status can resolve it, so verify won't revoke the access", async () => {
  store.clear();
  const made = await recordManualEntitlement(grant());
  const found = await findManualEntitlement(made.orderId);

  assert.ok(found, "a live manual grant must resolve");
  assert.equal(found.sku, "student-full-report");
  assert.equal(String(found.status).toUpperCase(), "PAID");
});

await test("restore-access finds it by the verified email, like any purchase", async () => {
  store.clear();
  await recordManualEntitlement(grant());
  const access = await findPaidEntitlements({ email: "someone@example.com" });

  assert.equal(access.length, 1);
  assert.equal(access[0].sku, "student-full-report");
  assert.match(access[0].order_id, /^manual_/);
});

await test("a phone-only grant is recorded but is not restorable by email", async () => {
  store.clear();
  await recordManualEntitlement(grant({ email: "" }));

  assert.equal((await findPaidEntitlements({ phone: "9812345678" })).length, 1);
  // restore-access only ever looks up the token's verified email, so this
  // grant exists in the books but the customer cannot self-restore it.
  // The grant endpoint warns about exactly this case.
  assert.equal((await findPaidEntitlements({ email: "someone@example.com" })).length, 0);
});

await test("a Cashfree order id is never resolved as a manual grant", async () => {
  store.clear();
  assert.equal(await findManualEntitlement("order_MTQ4NzY1"), null);
  assert.equal(await findManualEntitlement(""), null);
});

await test("an unknown manual id resolves to nothing", async () => {
  store.clear();
  assert.equal(await findManualEntitlement(MANUAL_ORDER_PREFIX + "deadbeef"), null);
});

console.log("\nrevocation");

await test("flipping status in the console revokes access", async () => {
  store.clear();
  const made = await recordManualEntitlement(grant());
  assert.ok(await findManualEntitlement(made.orderId));

  // What an owner would do in the Firebase console to take it back.
  store.seed("entitlements", made.orderId,
    Object.assign({}, store.read("entitlements", made.orderId), { status: "REVOKED" }));

  assert.equal(await findManualEntitlement(made.orderId), null, "a revoked grant must stop resolving");
  assert.equal((await findPaidEntitlements({ email: "someone@example.com" })).length, 0);
});

await test("a record that isn't marked manual can't be resolved through the manual path", async () => {
  store.clear();
  // A forged doc written under a manual-looking id, but without the
  // provenance stamp the grant endpoint sets.
  const id = MANUAL_ORDER_PREFIX + "0".repeat(32);
  store.seed("entitlements", id, { orderId: id, sku: "student-full-report", status: "PAID" });
  assert.equal(await findManualEntitlement(id), null);
});

/* ============================================================
   The endpoint's own gate.

   The library above decides what a grant *is*; this decides who is
   allowed to make one. It is the part that gives away paid product, so
   the closed-by-default behaviour is worth asserting rather than
   eyeballing.
   ============================================================ */

const handler = require("../api/entitlements/grant.js");

const GOOD_TOKEN = "a".repeat(32);

function mockRes(){
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(k, v){ this.headers[k] = v; },
    end(payload){ this.body = payload ? JSON.parse(payload) : null; }
  };
}

function mockReq({ method = "POST", token, body = {} } = {}){
  const raw = JSON.stringify(body);
  const headers = { "content-type": "application/json" };
  if(token) headers.authorization = "Bearer " + token;
  return {
    method,
    headers,
    socket: { remoteAddress: "127.0.0.1" },
    on(event, cb){
      if(event === "data") cb(Buffer.from(raw));
      if(event === "end") cb();
      return this;
    }
  };
}

async function call(options){
  const res = mockRes();
  await handler(mockReq(options), res);
  return res;
}

const validBody = {
  sku: "student-full-report",
  email: "someone@example.com",
  phone: "9812345678",
  name: "Test Customer",
  reference: "UPI-402913887654"
};

console.log("\nendpoint access");

await test("unarmed, it answers 404 — indistinguishable from an undeployed route", async () => {
  delete process.env.ENTITLEMENT_ADMIN_TOKEN;
  const res = await call({ token: GOOD_TOKEN, body: validBody });
  assert.equal(res.statusCode, 404);
});

await test("a token under 24 characters disables the route", async () => {
  process.env.ENTITLEMENT_ADMIN_TOKEN = "tooshort";
  const res = await call({ token: "tooshort", body: validBody });
  assert.equal(res.statusCode, 404);
});

await test("armed, a wrong token is a flat 401 that says nothing", async () => {
  process.env.ENTITLEMENT_ADMIN_TOKEN = GOOD_TOKEN;
  const res = await call({ token: "b".repeat(32), body: validBody });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, "Unauthorized");
});

await test("a missing token is refused", async () => {
  process.env.ENTITLEMENT_ADMIN_TOKEN = GOOD_TOKEN;
  const res = await call({ body: validBody });
  assert.equal(res.statusCode, 401);
});

await test("GET is refused — handing out paid product must not be a link", async () => {
  process.env.ENTITLEMENT_ADMIN_TOKEN = GOOD_TOKEN;
  const res = await call({ method: "GET", token: GOOD_TOKEN, body: validBody });
  assert.equal(res.statusCode, 405);
});

console.log("\nendpoint validation");

await test("an unknown sku is refused", async () => {
  store.clear();
  process.env.ENTITLEMENT_ADMIN_TOKEN = GOOD_TOKEN;
  const res = await call({ token: GOOD_TOKEN, body: Object.assign({}, validBody, { sku: "free-lunch" }) });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Unknown sku/);
});

await test("a missing reference is refused", async () => {
  store.clear();
  const res = await call({ token: GOOD_TOKEN, body: Object.assign({}, validBody, { reference: "" }) });
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /reference is required/);
});

await test("a grant with no contact details is refused", async () => {
  store.clear();
  const res = await call({ token: GOOD_TOKEN, body: Object.assign({}, validBody, { phone: "", email: "" }) });
  assert.equal(res.statusCode, 400);
});

await test("a negative amount is refused", async () => {
  store.clear();
  const res = await call({ token: GOOD_TOKEN, body: Object.assign({}, validBody, { amount: -100 }) });
  assert.equal(res.statusCode, 400);
});

console.log("\nendpoint behaviour");

await test("a dry run reports what would happen and writes nothing", async () => {
  store.clear();
  const res = await call({ token: GOOD_TOKEN, body: Object.assign({}, validBody, { dry_run: true }) });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.dry_run, true);
  assert.equal(res.body.already_recorded, false);
  // Scoped to the two collections a grant touches: the rate limiter
  // legitimately writes its own counter on every call, dry run included.
  const written = Object.keys(store.dump())
    .filter(k => k.startsWith("entitlements/") || k.startsWith("manualGrantRefs/"));
  assert.deepEqual(written, [], "a dry run must not write a grant");
});

await test("a real call records the grant and returns its order id", async () => {
  store.clear();
  const res = await call({ token: GOOD_TOKEN, body: validBody });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.created, true);
  assert.match(res.body.grant.order_id, /^manual_/);
  assert.equal(res.body.grant.amount, 999, "defaults to the catalogue price");
});

await test("repeating the call returns the same grant, not a second one", async () => {
  store.clear();
  const first = await call({ token: GOOD_TOKEN, body: validBody });
  const second = await call({ token: GOOD_TOKEN, body: validBody });

  assert.equal(second.statusCode, 200);
  assert.equal(second.body.created, false);
  assert.equal(second.body.grant.order_id, first.body.grant.order_id);
});

await test("an emailless grant is allowed but warns it cannot be self-restored", async () => {
  store.clear();
  const res = await call({ token: GOOD_TOKEN, body: Object.assign({}, validBody, { email: "" }) });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.warnings.length, 1);
  assert.match(res.body.warnings[0], /cannot self-restore/);
});

await test("the response never echoes the token", async () => {
  store.clear();
  const res = await call({ token: GOOD_TOKEN, body: validBody });
  assert.ok(!JSON.stringify(res.body).includes(GOOD_TOKEN));
});

console.log("\n" + passed + " passed, " + failed + " failed\n");
process.exit(failed ? 1 : 0);
