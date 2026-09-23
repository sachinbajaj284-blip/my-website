/*
  Tests for the partner programme — run with:  npm run partners:test

  The rules that decide money: who may pay the joining fee, which
  report earns which partner what, and that a commission is paid once.
  Runs against the in-memory Firestore stub, and stubs fetch so no test
  reaches the real gateway.
*/

import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { install } from "./firestore-stub.mjs";

// Must happen before anything requires firebase-admin.
const store = install();

const require = createRequire(import.meta.url);

process.env.CASHFREE_CLIENT_ID = "test_client_id";
process.env.CASHFREE_CLIENT_SECRET = "test_client_secret";
delete process.env.OWNER_WEBHOOK_URL;
delete process.env.LEAD_WEBHOOK_URL;

const partners = require("../api/_lib/partners.js");
const { fulfillPaidOrder } = require("../api/_lib/fulfillment.js");
const createOrder = require("../api/_lib/routes/cashfree/create-order.js");
const meRoute = require("../api/_lib/routes/partners/me.js");

const { commissionFor, earnsCommission, approve, revoke, joinState, canJoin, activate,
        lookupCode, creditReport, summary, setUpi, listPayable, settle, voidEarning,
        HOLD_MS, JOIN_SKU, PARTNERS, EARNINGS, CLIENTS, INVITES } = partners;

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

function fixedRandom(value){ return () => value; }

// An active partner with a known code.
async function makePartner(uid, email, name, suffix){
  await approve({ email });
  const joined = await activate({ uid, email, name, orderId: "join_" + uid }, { random: fixedRandom(suffix) });
  return joined.code;
}

/* ---- request plumbing for the two routes --------------------------- */

// Signed-in tokens the stubbed Firebase Auth will accept.
const TOKENS = {};
require("firebase-admin").app().auth = () => ({
  verifyIdToken: async (token) => {
    if(!TOKENS[token]) throw new Error("bad token");
    return TOKENS[token];
  }
});

let ipSeq = 1;
function makeReq(body, token){
  const req = Readable.from([Buffer.from(JSON.stringify(body || {}), "utf8")]);
  req.method = "POST";
  req.url = "/api/test";
  // A fresh address per request, so the rate limiter never interferes.
  req.headers = { "content-type": "application/json", "x-forwarded-for": "10.0.0." + (ipSeq++) };
  if(token) req.headers.authorization = "Bearer " + token;
  return req;
}

function makeRes(){
  const res = {
    statusCode: 200, headers: {}, body: "",
    setHeader(k, v){ this.headers[k.toLowerCase()] = v; },
    getHeader(k){ return this.headers[k.toLowerCase()]; },
    end(chunk){ if(chunk) this.body += chunk; this.done = true; }
  };
  return res;
}

async function call(handler, body, token){
  const res = makeRes();
  await handler(makeReq(body, token), res);
  return { status: res.statusCode, data: res.body ? JSON.parse(res.body) : null };
}

let lastCashfreeOrder = null;
globalThis.fetch = async function(url, options){
  lastCashfreeOrder = JSON.parse(options.body);
  return {
    ok: true, status: 200,
    json: async () => ({ order_id: lastCashfreeOrder.order_id, cf_order_id: "cf_1",
                         payment_session_id: "sess_1", order_amount: lastCashfreeOrder.order_amount })
  };
};

/* ------------------------------------------------------------------ */

console.log("\ncommission maths");

await test("a full-price report earns exactly ₹300", () => {
  assert.equal(commissionFor(999), 300);
});

await test("a discounted report earns 30% of what was paid", () => {
  assert.equal(commissionFor(899), 270);
  assert.equal(commissionFor(1), 0, "a ₹1 demo or 100%-off code pays out nothing");
  assert.equal(commissionFor(0), 0);
});

await test("commission never exceeds ₹300, whatever the amount", () => {
  assert.equal(commissionFor(7500), 300);
});

await test("only the report earns commission", () => {
  assert.equal(earnsCommission("student-full-report"), true);
  assert.equal(earnsCommission("wellness-session"), false);
  assert.equal(earnsCommission(JOIN_SKU), false);
  assert.equal(earnsCommission(""), false);
});

console.log("\njoining");

store.clear();

await test("nobody may pay the joining fee until the owner approves them", async () => {
  assert.equal(await joinState({ uid: "c1", email: "coach@example.com" }), "none");
  assert.deepEqual(await canJoin({ uid: "c1", email: "coach@example.com" }), { ok: false, reason: "NOT_APPROVED" });
});

await test("approval is by email, case-insensitively", async () => {
  await approve({ email: "  Coach@Example.com " });
  assert.equal(await joinState({ uid: "c1", email: "coach@example.com" }), "approved");
  assert.deepEqual(await canJoin({ uid: "c1", email: "COACH@example.com" }), { ok: true });
});

await test("a malformed email is refused rather than approved", async () => {
  assert.deepEqual(await approve({ email: "not an email" }), { ok: false, reason: "BAD_EMAIL" });
});

await test("a revoked approval closes the joining fee again", async () => {
  await approve({ email: "maybe@example.com" });
  await revoke({ email: "maybe@example.com" });
  assert.equal(await joinState({ uid: "m1", email: "maybe@example.com" }), "none");
});

await test("paying activates the partner with a code of their own", async () => {
  const joined = await activate({ uid: "c1", email: "coach@example.com", name: "Priya Sharma", orderId: "o_join" },
                                { random: fixedRandom("7K2P") });
  assert.equal(joined.ok, true);
  assert.equal(joined.code, "PRIY7K2P");
  const doc = store.read(PARTNERS, "c1");
  assert.equal(doc.status, "active");
  assert.equal(doc.join_order_id, "o_join");
  assert.equal(store.read(INVITES, "coach@example.com").joined_uid, "c1");
});

await test("activation is idempotent — a second call keeps the first code", async () => {
  const again = await activate({ uid: "c1", email: "coach@example.com", name: "Priya Sharma" },
                               { random: fixedRandom("XXXX") });
  assert.equal(again.created, false);
  assert.equal(again.code, "PRIY7K2P");
});

await test("an active partner is not asked to pay again", async () => {
  assert.equal(await joinState({ uid: "c1", email: "coach@example.com" }), "active");
  assert.deepEqual(await canJoin({ uid: "c1", email: "coach@example.com" }), { ok: false, reason: "ALREADY_PARTNER" });
});

await test("two partners drawing the same code get different ones", async () => {
  await approve({ email: "priyanka@example.com" });
  let calls = 0;
  const random = () => (calls++ === 0 ? "7K2P" : "9QRT");
  const joined = await activate({ uid: "c2", email: "priyanka@example.com", name: "Priyanka" }, { random });
  assert.equal(joined.code, "PRIY9QRT");
});

await test("a code resolves only to an active partner", async () => {
  assert.deepEqual(await lookupCode("priy7k2p"), { code: "PRIY7K2P", uid: "c1" });
  assert.equal(await lookupCode("NOPE1234"), null);
  store.seed(PARTNERS, "gone", { code: "GONE1234", status: "left" });
  store.seed(partners.CODES, "GONE1234", { uid: "gone" });
  assert.equal(await lookupCode("GONE1234"), null);
});

console.log("\ncrediting reports");

store.clear();
const A = await makePartner("pa", "a@example.com", "Asha", "AAAA");
const B = await makePartner("pb", "b@example.com", "Bela", "BBBB");

await test("a client's full-price report earns their partner ₹300", async () => {
  const r = await creditReport({ orderId: "o1", sku: "student-full-report", amountPaid: 999, clientUid: "k1", partnerCode: A });
  assert.equal(r.ok, true);
  assert.equal(r.commission, 300);
  assert.equal(r.partnerUid, "pa");
  const row = store.read(EARNINGS, "o1");
  assert.equal(row.status, "owed");
  assert.equal(row.commission, 300);
  const p = store.read(PARTNERS, "pa");
  assert.equal(p.clients, 1);
  assert.equal(p.reports, 1);
  assert.equal(p.earned, 300);
});

await test("the same order is credited once, however often fulfilment runs", async () => {
  const again = await creditReport({ orderId: "o1", sku: "student-full-report", amountPaid: 999, clientUid: "k1", partnerCode: A });
  assert.equal(again.reason, "ALREADY_CREDITED");
  assert.equal(store.read(PARTNERS, "pa").earned, 300);
});

await test("a client stays with the partner who brought them, even on another link", async () => {
  const r = await creditReport({ orderId: "o2", sku: "student-full-report", amountPaid: 999, clientUid: "k1", partnerCode: B });
  assert.equal(r.partnerUid, "pa", "k1 came through Asha first");
  assert.equal(store.read(PARTNERS, "pb").earned || 0, 0);
});

await test("a returning client with no link still credits their partner — without counting twice", async () => {
  const r = await creditReport({ orderId: "o3", sku: "student-full-report", amountPaid: 999, clientUid: "k1", partnerCode: "" });
  assert.equal(r.partnerUid, "pa");
  const p = store.read(PARTNERS, "pa");
  assert.equal(p.clients, 1, "still one client");
  assert.equal(p.reports, 3);
});

await test("a discounted report earns 30% of the discounted price", async () => {
  const r = await creditReport({ orderId: "o4", sku: "student-full-report", amountPaid: 899, clientUid: "k2", partnerCode: B });
  assert.equal(r.commission, 270);
});

await test("nothing is credited for a session, a demo, a ₹1 order or an unknown code", async () => {
  assert.equal((await creditReport({ orderId: "s1", sku: "wellness-session", amountPaid: 499, clientUid: "k3", partnerCode: A })).reason, "NOT_ELIGIBLE");
  assert.equal((await creditReport({ orderId: "d1", sku: "student-full-report", amountPaid: 1, clientUid: "k3", partnerCode: A, isDemo: true })).reason, "DEMO");
  assert.equal((await creditReport({ orderId: "z1", sku: "student-full-report", amountPaid: 1, clientUid: "k3", partnerCode: A })).reason, "NOTHING_PAID");
  assert.equal((await creditReport({ orderId: "u1", sku: "student-full-report", amountPaid: 999, clientUid: "k3", partnerCode: "NOPE1234" })).reason, "NO_PARTNER");
  assert.equal(store.read(CLIENTS, "k3"), undefined, "a refused credit binds nobody");
});

await test("a partner buying on their own link earns nothing", async () => {
  const r = await creditReport({ orderId: "self1", sku: "student-full-report", amountPaid: 999, clientUid: "pa", partnerCode: A });
  assert.equal(r.reason, "SELF");
});

console.log("\nbalances and payouts");

await test("new commission is clearing, not payable, until the hold passes", async () => {
  const now = Date.now();
  const s = await summary("pa", { now });
  assert.equal(s.earned, 900);
  assert.equal(s.payable, 0);
  assert.equal(s.clearing, 900);
  const later = await summary("pa", { now: now + HOLD_MS + 1000 });
  assert.equal(later.payable, 900);
  assert.ok(later.url.endsWith("?partner=" + A + "#self-assessments"));
});

await test("the owner's list shows matured commission with where to send it", async () => {
  await setUpi({ uid: "pa", upi: "asha@okaxis" });
  const rows = await listPayable({ now: Date.now() + HOLD_MS + 1000 });
  const asha = rows.find(r => r.uid === "pa");
  assert.equal(asha.amount, 900);
  assert.equal(asha.upi, "asha@okaxis");
  assert.equal((await listPayable({ now: Date.now() })).length, 0, "nothing before the hold");
});

await test("marking paid needs a reference, and pays each row once", async () => {
  const later = Date.now() + HOLD_MS + 1000;
  assert.equal((await settle({ uid: "pa", note: "", now: later })).reason, "NOTE_REQUIRED");
  const paid = await settle({ uid: "pa", note: "UTR 402913", now: later });
  assert.deepEqual(paid, { ok: true, amount: 900, count: 3 });
  assert.equal((await settle({ uid: "pa", note: "UTR again", now: later })).reason, "NOTHING_PAYABLE");
  const s = await summary("pa", { now: later });
  assert.equal(s.paid, 900);
  assert.equal(s.owed, 0);
  assert.equal(store.read(EARNINGS, "o1").payout_note, "UTR 402913");
});

await test("an unpaid commission can be voided; a paid one cannot", async () => {
  const v = await voidEarning({ orderId: "o4", note: "refunded" });
  assert.equal(v.ok, true);
  assert.equal(v.amount, 270);
  assert.equal((await summary("pb")).earned, 0);
  assert.equal((await voidEarning({ orderId: "o1" })).reason, "ALREADY_PAID");
  assert.equal((await voidEarning({ orderId: "o4" })).reason, "ALREADY_VOID");
});

await test("a UPI ID is checked before it is saved", async () => {
  assert.equal((await setUpi({ uid: "pb", upi: "call me" })).reason, "BAD_UPI");
  assert.equal((await setUpi({ uid: "nobody", upi: "x@okaxis" })).reason, "NOT_PARTNER");
});

console.log("\nthrough fulfilment");

store.clear();

await test("a paid joining fee makes the buyer a partner", async () => {
  await approve({ email: "new@example.com" });
  const result = await fulfillPaidOrder({
    order_id: "lume_partner1999_abc", order_status: "PAID", order_amount: 1999, order_currency: "INR",
    customer_details: { customer_name: "Neha Verma", customer_email: "new@example.com", customer_phone: "9812345678" },
    order_tags: { sku: JOIN_SKU, account_uid: "n1", account_email: "new@example.com" }
  });
  assert.equal(result.partner.ok, true);
  assert.equal(store.read(PARTNERS, "n1").status, "active");
});

await test("a paid report on a partner's link credits the partner", async () => {
  const code = store.read(PARTNERS, "n1").code;
  const result = await fulfillPaidOrder({
    order_id: "lume_student999_xyz", order_status: "PAID", order_amount: 999, order_currency: "INR",
    customer_details: { customer_name: "Client One", customer_email: "k@example.com", customer_phone: "9812345670" },
    order_tags: { sku: "student-full-report", account_uid: "kk1", partner_code: code }
  });
  assert.equal(result.partner.ok, true);
  assert.equal(store.read(EARNINGS, "lume_student999_xyz").commission, 300);
});

await test("an unpaid order credits nobody", async () => {
  const code = store.read(PARTNERS, "n1").code;
  await fulfillPaidOrder({
    order_id: "lume_student999_pending", order_status: "ACTIVE", order_amount: 999,
    order_tags: { sku: "student-full-report", account_uid: "kk2", partner_code: code }
  });
  assert.equal(store.read(EARNINGS, "lume_student999_pending"), undefined);
});

console.log("\nthrough checkout");

store.clear();
TOKENS.approved = { uid: "ap1", email: "ok@example.com", email_verified: true, name: "Okay Person" };
TOKENS.stranger = { uid: "st1", email: "who@example.com", email_verified: true, name: "Who" };
TOKENS.client = { uid: "cl1", email: "client@example.com", email_verified: true, name: "Client" };

await test("create-order refuses the joining fee to an account nobody approved", async () => {
  lastCashfreeOrder = null;
  const r = await call(createOrder, { sku: JOIN_SKU }, "stranger");
  assert.equal(r.status, 412);
  assert.equal(r.data.code, "NOT_APPROVED");
  assert.equal(lastCashfreeOrder, null, "no order reached Cashfree");
});

await test("create-order sells the joining fee to an approved account, at the catalogue price", async () => {
  await approve({ email: "ok@example.com" });
  const r = await call(createOrder, { sku: JOIN_SKU, amount: 1 }, "approved");
  assert.equal(r.status, 200);
  assert.equal(lastCashfreeOrder.order_amount, 1999, "the browser's amount is ignored");
  assert.equal(lastCashfreeOrder.order_tags.sku, JOIN_SKU);
});

await test("a report order carries the partner code; other orders never do", async () => {
  await call(createOrder, { sku: "student-full-report", partner_code: "asha-7k2p" }, "client");
  assert.equal(lastCashfreeOrder.order_tags.partner_code, "ASHA7K2P");
  await call(createOrder, { sku: "wellness-session", partner_code: "ASHA7K2P" }, "client");
  assert.equal(lastCashfreeOrder.order_tags.partner_code, undefined);
  await call(createOrder, { sku: "student-full-report", partner_code: "x" }, "client");
  assert.equal(lastCashfreeOrder.order_tags.partner_code, undefined, "a malformed code is dropped");
});

console.log("\nthe dashboard endpoint");

await test("/me needs a sign-in", async () => {
  const r = await call(meRoute, {}, "");
  assert.equal(r.status, 401);
});

await test("/me tells an approved account it may pay, and at what price", async () => {
  const r = await call(meRoute, {}, "approved");
  assert.equal(r.data.state, "approved");
  assert.deepEqual([r.data.join.sku, r.data.join.amount], [JOIN_SKU, 1999]);
  assert.equal(r.data.partner, null);
});

await test("/me gives a partner their link and numbers, and saves a UPI ID", async () => {
  await activate({ uid: "ap1", email: "ok@example.com", name: "Okay Person" }, { random: fixedRandom("3467") });
  const r = await call(meRoute, { upi: "Okay@OkAxis" }, "approved");
  assert.equal(r.data.ok, true);
  assert.equal(r.data.state, "active");
  assert.equal(r.data.partner.code, "OKAY3467");
  assert.equal(r.data.partner.upi, "okay@okaxis");
  const bad = await call(meRoute, { upi: "nope" }, "approved");
  assert.equal(bad.data.ok, false);
  assert.equal(bad.data.reason, "BAD_UPI");
});

await test("/me shows a stranger they are not approved", async () => {
  const r = await call(meRoute, {}, "stranger");
  assert.equal(r.data.state, "none");
});

console.log("\n" + passed + " passed, " + failed + " failed\n");
process.exit(failed ? 1 : 0);
