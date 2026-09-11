/*
  Tests for the Cashfree payment webhook — run with:  npm run webhook:test

  The webhook exists because fulfilment used to depend on the customer's
  browser coming back from the gateway. It often doesn't, and when it
  doesn't the payment succeeds and nothing is recorded: no entitlement,
  so the customer can't open what they bought, and no owner notification,
  so nobody finds out until they ask for a refund.

  That makes this endpoint the one that has to be right. Two things are
  worth a test here and both are about money:

    - a forged or replayed delivery must not be able to mint access,
      because "you got paid" is exactly the message worth forging when
      granting it is free;
    - a genuine delivery must record the purchase even though no browser
      was ever involved.

  Runs against tools/firestore-stub.mjs with fetch stubbed, so the whole
  path is exercised with no network and no browser.
*/

import { createRequire } from "node:module";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { install } from "./firestore-stub.mjs";

// Must happen before anything requires firebase-admin.
const store = install();

const require = createRequire(import.meta.url);

const SECRET = "test_webhook_secret";
process.env.CASHFREE_CLIENT_ID = "test_id";
process.env.CASHFREE_CLIENT_SECRET = SECRET;
process.env.CASHFREE_ENV = "sandbox";
// Keep the owner notification out of these tests: it is best-effort and
// would otherwise try to reach a real URL.
delete process.env.OWNER_WEBHOOK_URL;
delete process.env.LEAD_WEBHOOK_URL;

const handler = require("../api/cashfree/webhook.js");
const { findPaidEntitlements } = require("../api/_lib/entitlements.js");

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

function group(name){ console.log("\n" + name); }

// --- harness -------------------------------------------------------------

// The order Cashfree would hand back for a real, paid checkout — tagged
// by create-order.js exactly as it tags one in production.
function paidOrder(overrides){
  return Object.assign({
    order_id: "lume_student999_abc123",
    cf_order_id: "cf_123",
    order_status: "PAID",
    order_amount: 999,
    order_currency: "INR",
    order_note: "Lume Live Full Clarity Report",
    customer_details: {
      customer_name: "Test Customer",
      customer_email: "buyer@example.com",
      customer_phone: "9812345678"
    },
    order_tags: {
      sku: "student-full-report",
      source: "lume-live-website",
      account_uid: "uid_test_1"
    }
  }, overrides);
}

// Stands in for the Cashfree order-lookup the webhook does after it has
// verified the signature.
function stubFetch(order, ok = true){
  const calls = [];
  globalThis.fetch = (url, init) => {
    calls.push({ url: String(url), init });
    return Promise.resolve({
      ok,
      status: ok ? 200 : 500,
      json: () => Promise.resolve(order)
    });
  };
  return calls;
}

function sign(timestamp, rawBody, secret = SECRET){
  return crypto.createHmac("sha256", secret).update(timestamp + rawBody).digest("base64");
}

// A minimal req/res pair. The body is delivered as a stream, the way the
// endpoint reads it in production, so the raw bytes the signature covers
// are the bytes that get hashed.
function call(rawBody, headers, method = "POST"){
  const listeners = {};
  const req = {
    method,
    headers: headers || {},
    on(event, fn){ listeners[event] = fn; return req; },
    destroy(){}
  };
  const res = {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(k, v){ this.headers[k.toLowerCase()] = v; },
    end(payload){ this.body = payload ? JSON.parse(payload) : null; }
  };
  const done = handler(req, res);
  // Deliver the body once the handler has attached its listeners.
  setImmediate(() => {
    if(listeners.data) listeners.data(Buffer.from(rawBody));
    if(listeners.end) listeners.end();
  });
  return done.then(() => res);
}

function delivery(order, opts){
  const options = opts || {};
  const body = JSON.stringify({
    type: options.type || "PAYMENT_SUCCESS_WEBHOOK",
    data: { order: { order_id: order.order_id } }
  });
  const ts = String(options.timestamp || Math.floor(Date.now() / 1000));
  const sig = options.signature !== undefined ? options.signature : sign(ts, body, options.secret);
  const headers = {};
  if(ts !== "__none__") headers["x-webhook-timestamp"] = ts;
  if(sig !== "__none__") headers["x-webhook-signature"] = sig;
  return call(body, headers);
}

// --- tests ---------------------------------------------------------------

group("a delivery has to prove it came from Cashfree");

await test("a correctly signed delivery is accepted", async () => {
  const order = paidOrder();
  stubFetch(order);
  const res = await delivery(order);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.ok, true);
});

await test("an unsigned delivery is refused", async () => {
  const order = paidOrder({ order_id: "lume_unsigned_1" });
  stubFetch(order);
  const res = await delivery(order, { signature: "__none__" });
  assert.equal(res.statusCode, 401);
});

await test("a delivery signed with the wrong secret is refused", async () => {
  const order = paidOrder({ order_id: "lume_wrongsecret_1" });
  stubFetch(order);
  const res = await delivery(order, { secret: "attacker_guess" });
  assert.equal(res.statusCode, 401);
});

await test("a tampered body no longer matches its signature", async () => {
  const order = paidOrder({ order_id: "lume_tampered_1" });
  stubFetch(order);
  const body = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK", data: { order: { order_id: order.order_id } } });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = sign(ts, body);
  // Same signature, different order — the swap a forger would attempt.
  const swapped = body.replace(order.order_id, "lume_someone_elses_order");
  const res = await call(swapped, { "x-webhook-timestamp": ts, "x-webhook-signature": sig });
  assert.equal(res.statusCode, 401);
});

await test("a replayed delivery from hours ago is refused", async () => {
  const order = paidOrder({ order_id: "lume_replay_1" });
  stubFetch(order);
  const old = Math.floor(Date.now() / 1000) - (3 * 60 * 60);
  const res = await delivery(order, { timestamp: old });
  assert.equal(res.statusCode, 401);
});

await test("a delivery with no timestamp is refused", async () => {
  const order = paidOrder({ order_id: "lume_nots_1" });
  stubFetch(order);
  const res = await delivery(order, { timestamp: "__none__" });
  assert.equal(res.statusCode, 401);
});

await test("only POST is accepted", async () => {
  stubFetch(paidOrder());
  const res = await call("", {}, "GET");
  assert.equal(res.statusCode, 405);
});

group("a genuine payment is recorded without any browser");

await test("a paid order becomes an entitlement the customer can restore", async () => {
  const order = paidOrder({ order_id: "lume_student999_restore" });
  stubFetch(order);
  const res = await delivery(order);
  assert.equal(res.statusCode, 200);

  const access = await findPaidEntitlements({ email: "buyer@example.com" });
  const found = access.find(a => a.order_id === "lume_student999_restore");
  assert.ok(found, "the purchase should be findable by the buyer's email");
  assert.equal(found.sku, "student-full-report");
});

await test("the order is verified against Cashfree, not taken from the payload", async () => {
  const order = paidOrder({ order_id: "lume_lookup_1" });
  const calls = stubFetch(order);
  await delivery(order);
  assert.equal(calls.length, 1, "the webhook should look the order up");
  assert.ok(calls[0].url.includes("/orders/lume_lookup_1"), calls[0].url);
});

await test("a redelivery does not grant the purchase twice", async () => {
  const order = paidOrder({ order_id: "lume_twice_1", customer_details: {
    customer_name: "Repeat Customer", customer_email: "repeat@example.com", customer_phone: "9800000001"
  }});
  stubFetch(order);
  await delivery(order);
  await delivery(order);
  const access = await findPaidEntitlements({ email: "repeat@example.com" });
  const matches = access.filter(a => a.order_id === "lume_twice_1");
  assert.equal(matches.length, 1, "Cashfree retries — one order must stay one entitlement");
});

await test("an order Cashfree does not report as PAID grants nothing", async () => {
  const order = paidOrder({ order_id: "lume_unpaid_1", order_status: "ACTIVE", customer_details: {
    customer_name: "Unpaid", customer_email: "unpaid@example.com", customer_phone: "9800000002"
  }});
  stubFetch(order);
  const res = await delivery(order);
  assert.equal(res.statusCode, 200);
  const access = await findPaidEntitlements({ email: "unpaid@example.com" });
  assert.equal(access.length, 0, "an unpaid order must never become access");
});

await test("a failed order lookup asks Cashfree to retry rather than dropping the sale", async () => {
  const order = paidOrder({ order_id: "lume_lookupfail_1" });
  stubFetch(order, false);
  const res = await delivery(order);
  assert.equal(res.statusCode, 502, "a 5xx keeps the delivery in Cashfree's retry queue");
});

await test("an event that isn't a successful payment is acknowledged, not retried", async () => {
  const order = paidOrder({ order_id: "lume_failedpay_1" });
  stubFetch(order);
  const res = await delivery(order, { type: "PAYMENT_FAILED_WEBHOOK" });
  assert.equal(res.statusCode, 200, "a non-2xx here would buy an endless retry loop");
  assert.equal(res.body.ignored, "PAYMENT_FAILED_WEBHOOK");
});

await test("a reply is never cached", async () => {
  const order = paidOrder({ order_id: "lume_cache_1" });
  stubFetch(order);
  const res = await delivery(order);
  assert.equal(res.headers["cache-control"], "no-store");
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
