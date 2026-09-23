/*
  Tests for the Cashfree webhook — run with:  npm run webhook:test

  This endpoint is a public URL that grants paid product, and it is the
  only fulfilment path that runs when the customer's browser never comes
  back. So the things worth pinning down are its trust boundary (what it
  refuses) and its acknowledgement contract (what it lets Cashfree retry),
  not its happy path alone.

  Runs against tools/firestore-stub.mjs, and stubs fetch so no test ever
  reaches the real gateway.
*/

import { createRequire } from "node:module";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { install } from "./firestore-stub.mjs";

// Must happen before anything requires firebase-admin.
const store = install();

const require = createRequire(import.meta.url);

const SECRET = "test_webhook_secret_value";
process.env.CASHFREE_WEBHOOK_SECRET = SECRET;
process.env.CASHFREE_CLIENT_ID = "test_client_id";
process.env.CASHFREE_CLIENT_SECRET = "test_client_secret";
// Keep the owner notification from trying to reach anything real.
delete process.env.LUME_NOTIFY_WEBHOOK;
delete process.env.LUME_NOTIFY_URL;

const handler = require("../api/_lib/routes/cashfree/webhook.js");
const { signatureMatches, readOrderId, actsOn } = handler;

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

function sign(timestamp, rawBody, secret = SECRET){
  return crypto.createHmac("sha256", secret).update(String(timestamp) + rawBody).digest("base64");
}

// A minimal stand-in for the Node request/response pair the platform hands
// the handler. The request is a real stream so the raw-body reader is
// exercised rather than bypassed.
function makeReq(rawBody, headers = {}, method = "POST"){
  const req = Readable.from([Buffer.from(rawBody, "utf8")]);
  req.method = method;
  req.url = "/api/cashfree/webhook";
  req.headers = Object.assign({ "content-type": "application/json" }, headers);
  return req;
}

function makeRes(){
  const res = {
    statusCode: 200,
    headers: {},
    body: "",
    ended: false,
    setHeader(k, v){ this.headers[k.toLowerCase()] = v; },
    end(chunk){ this.body = chunk == null ? "" : String(chunk); this.ended = true; }
  };
  return res;
}

async function deliver(payload, { timestamp = String(Date.now()), secret = SECRET, signature, method = "POST" } = {}){
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
  const sig = signature !== undefined ? signature : sign(timestamp, raw, secret);
  const req = makeReq(raw, {
    "x-webhook-signature": sig,
    "x-webhook-timestamp": timestamp
  }, method);
  const res = makeRes();
  await handler(req, res);
  let parsed = {};
  try{ parsed = res.body ? JSON.parse(res.body) : {}; }catch(err){ /* leave as {} */ }
  return { status: res.statusCode, body: parsed };
}

function paymentSuccess(orderId = "lume_student999_mtx40lur2f2io"){
  return {
    type: "PAYMENT_SUCCESS_WEBHOOK",
    event_time: new Date().toISOString(),
    data: {
      order: { order_id: orderId, order_amount: 999, order_currency: "INR" },
      payment: { payment_status: "SUCCESS", cf_payment_id: "1234567890" },
      customer_details: { customer_name: "Chhavi Sehgal", customer_email: "c@example.com", customer_phone: "9812345678" }
    }
  };
}

// The authoritative order Cashfree returns when the handler re-checks.
function paidOrder(overrides = {}){
  return Object.assign({
    order_id: "lume_student999_mtx40lur2f2io",
    cf_order_id: "cf_987654",
    order_status: "PAID",
    order_amount: 999,
    order_currency: "INR",
    customer_details: { customer_name: "Chhavi Sehgal", customer_email: "c@example.com", customer_phone: "9812345678" },
    order_tags: { sku: "student-full-report", label: "Lume Live Full Clarity Report" }
  }, overrides);
}

let fetchCalls = [];
function stubFetch(responder){
  fetchCalls = [];
  globalThis.fetch = async function(url, options){
    fetchCalls.push({ url: String(url), options: options });
    const r = typeof responder === "function" ? responder(String(url)) : responder;
    if(r instanceof Error) throw r;
    return {
      ok: r.ok !== false,
      status: r.status || 200,
      json: async () => r.body || {}
    };
  };
}

console.log("\nsignature verification");

await test("accepts a correctly signed body", () => {
  const raw = JSON.stringify({ hello: "world" });
  const ts = "1700000000000";
  assert.equal(signatureMatches(sign(ts, raw), ts, raw, SECRET), true);
});

await test("rejects a body that changed after signing", () => {
  const ts = "1700000000000";
  const sig = sign(ts, JSON.stringify({ amount: 999 }));
  assert.equal(signatureMatches(sig, ts, JSON.stringify({ amount: 1 }), SECRET), false);
});

await test("rejects a signature made with the wrong secret", () => {
  const raw = JSON.stringify({ hello: "world" });
  const ts = "1700000000000";
  assert.equal(signatureMatches(sign(ts, raw, "not-the-secret"), ts, raw, SECRET), false);
});

await test("rejects a replayed signature paired with a different timestamp", () => {
  const raw = JSON.stringify({ hello: "world" });
  assert.equal(signatureMatches(sign("1700000000000", raw), "1700000000001", raw, SECRET), false);
});

await test("refuses missing, empty and malformed signatures without throwing", () => {
  const raw = "{}";
  const ts = "1700000000000";
  for(const bad of [undefined, null, "", "not-base64!!", "short", "a".repeat(500)]){
    assert.equal(signatureMatches(bad, ts, raw, SECRET), false, "accepted: " + String(bad));
  }
});

await test("refuses when no secret is configured, whatever is sent", () => {
  const raw = "{}";
  const ts = "1700000000000";
  assert.equal(signatureMatches(sign(ts, raw), ts, raw, ""), false);
});

console.log("\norder id extraction");

await test("reads the order id out of a delivery", () => {
  assert.equal(readOrderId(paymentSuccess()), "lume_student999_mtx40lur2f2io");
});

await test("refuses ids that don't match the accepted shape", () => {
  for(const bad of ["", "ab", "a".repeat(46), "../../etc/passwd", "id with spaces", "id/../x", "<script>"]){
    const payload = paymentSuccess();
    payload.data.order.order_id = bad;
    assert.equal(readOrderId(payload), "", "accepted: " + bad);
  }
});

await test("survives a payload with no order at all", () => {
  assert.equal(readOrderId({}), "");
  assert.equal(readOrderId({ data: {} }), "");
  assert.equal(readOrderId(null), "");
});

console.log("\nevent matching across webhook versions");

await test("acts on the 2022-09-01 success event", () => {
  assert.equal(actsOn("PAYMENT_SUCCESS_WEBHOOK"), true);
});

await test("acts on a success event spelled differently by another version", () => {
  for(const t of ["PAYMENT_SUCCESS", "payment_success_webhook", "PG_PAYMENT_SUCCESS_WEBHOOK"]){
    assert.equal(actsOn(t), true, "did not act on: " + t);
  }
});

await test("does not act on failures, drops, refunds or junk", () => {
  for(const t of ["PAYMENT_FAILED_WEBHOOK", "PAYMENT_USER_DROPPED_WEBHOOK", "REFUND_STATUS_WEBHOOK", "", null, undefined, "SOMETHING_ELSE"]){
    assert.equal(actsOn(t), false, "acted on: " + String(t));
  }
});

await test("reads the order id from either nesting a version might use", () => {
  assert.equal(readOrderId({ data: { order: { order_id: "lume_student999_aaa" } } }), "lume_student999_aaa");
  assert.equal(readOrderId({ data: { order_id: "lume_student999_bbb" } }), "lume_student999_bbb");
});

console.log("\ndelivery handling");

await test("an unsigned delivery is refused 401 and never reaches the gateway", async () => {
  stubFetch({ body: paidOrder() });
  const r = await deliver(paymentSuccess(), { signature: "" });
  assert.equal(r.status, 401);
  assert.equal(fetchCalls.length, 0, "an unverified delivery hit the gateway");
});

await test("a tampered delivery is refused 401", async () => {
  stubFetch({ body: paidOrder() });
  const raw = JSON.stringify(paymentSuccess());
  const ts = String(Date.now());
  const sig = sign(ts, raw);
  const req = makeReq(raw.replace("999", "111"), { "x-webhook-signature": sig, "x-webhook-timestamp": ts });
  const res = makeRes();
  await handler(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(fetchCalls.length, 0);
});

await test("a non-POST is refused", async () => {
  stubFetch({ body: paidOrder() });
  const r = await deliver(paymentSuccess(), { method: "GET" });
  assert.equal(r.status, 405);
});

await test("a signed success writes the entitlement and acknowledges 200", async () => {
  stubFetch({ body: paidOrder() });
  const r = await deliver(paymentSuccess());
  assert.equal(r.status, 200, "body: " + JSON.stringify(r.body));
  assert.equal(r.body.ok, true);
  assert.equal(r.body.fulfilled, true);
  const row = store.read("entitlements", "lume_student999_mtx40lur2f2io");
  assert.ok(row, "no entitlement row was written");
  assert.equal(row.sku, "student-full-report");
  assert.equal(row.status, "PAID");
  assert.equal(row.amount, 999);
});

await test("the sku comes from the gateway, not from the delivered payload", async () => {
  // A signed delivery claiming an expensive sku must not be able to grant
  // it: only the gateway's own order_tags decide what was bought.
  stubFetch({ body: paidOrder({ order_id: "lume_parents199_forged", order_tags: { sku: "parents-handbook" } }) });
  const payload = paymentSuccess("lume_parents199_forged");
  payload.data.order.order_tags = { sku: "internship-240-hour" };
  const r = await deliver(payload);
  assert.equal(r.status, 200);
  assert.equal(store.read("entitlements", "lume_parents199_forged").sku, "parents-handbook");
});

await test("a redelivery of the same payment fulfils once, not twice", async () => {
  stubFetch({ body: paidOrder({ order_id: "lume_student999_repeat" }) });
  const payload = paymentSuccess("lume_student999_repeat");
  await deliver(payload);
  const first = store.read("entitlements", "lume_student999_repeat");
  await deliver(payload);
  const second = store.read("entitlements", "lume_student999_repeat");
  assert.equal(second.sku, first.sku);
  assert.equal(second.grantedAt, first.grantedAt, "a retry re-granted instead of being idempotent");
  assert.ok(second.ownerNotifiedAt, "the owner notification claim was not recorded");
});

await test("an event we don't act on is acknowledged, not retried", async () => {
  stubFetch({ body: paidOrder() });
  const r = await deliver({ type: "PAYMENT_FAILED_WEBHOOK", data: { order: { order_id: "lume_student999_failedone" } } });
  assert.equal(r.status, 200);
  assert.equal(r.body.ignored, "PAYMENT_FAILED_WEBHOOK");
  assert.equal(store.read("entitlements", "lume_student999_failedone"), undefined, "a failed payment granted access");
});

await test("an order the gateway does not call PAID grants nothing", async () => {
  stubFetch({ body: paidOrder({ order_id: "lume_student999_pending", order_status: "ACTIVE" }) });
  const r = await deliver(paymentSuccess("lume_student999_pending"));
  assert.equal(r.status, 200);
  assert.equal(r.body.fulfilled, false);
  assert.equal(store.read("entitlements", "lume_student999_pending"), undefined);
});

await test("a PAID order with no sku records nothing and is not retried", async () => {
  stubFetch({ body: paidOrder({ order_id: "lume_legacy_notags", order_tags: {} }) });
  const r = await deliver(paymentSuccess("lume_legacy_notags"));
  assert.equal(r.status, 200);
  assert.equal(r.body.fulfilled, false);
  assert.equal(store.read("entitlements", "lume_legacy_notags"), undefined);
});

console.log("\nretry contract");

await test("a gateway outage asks Cashfree to retry", async () => {
  stubFetch(new Error("socket hang up"));
  const r = await deliver(paymentSuccess("lume_student999_outage"));
  assert.equal(r.status, 503, "a transient failure was acknowledged as final");
});

await test("a gateway 5xx asks Cashfree to retry", async () => {
  stubFetch({ ok: false, status: 500, body: {} });
  const r = await deliver(paymentSuccess("lume_student999_five"));
  assert.equal(r.status, 503);
});

await test("a gateway 404 is final — there is nothing to come back for", async () => {
  stubFetch({ ok: false, status: 404, body: { message: "order not found" } });
  const r = await deliver(paymentSuccess("lume_student999_nosuch"));
  assert.equal(r.status, 200);
});

await test("an oversized body is refused before any HMAC work", async () => {
  stubFetch({ body: paidOrder() });
  const huge = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK", padding: "x".repeat(handler.MAX_WEBHOOK_BYTES + 1024) });
  const req = makeReq(huge, { "x-webhook-signature": "whatever", "x-webhook-timestamp": "1" });
  const res = makeRes();
  await handler(req, res);
  assert.equal(res.statusCode, 413);
  assert.equal(fetchCalls.length, 0);
});

await test("a missing signing secret asks for a retry rather than dropping the payment", async () => {
  const saved = { hook: process.env.CASHFREE_WEBHOOK_SECRET, client: process.env.CASHFREE_CLIENT_SECRET };
  delete process.env.CASHFREE_WEBHOOK_SECRET;
  delete process.env.CASHFREE_CLIENT_SECRET;
  try{
    const r = await deliver(paymentSuccess("lume_student999_nosecret"));
    assert.equal(r.status, 503);
  } finally {
    process.env.CASHFREE_WEBHOOK_SECRET = saved.hook;
    process.env.CASHFREE_CLIENT_SECRET = saved.client;
  }
});

await test("falls back to the API client secret when no webhook secret is set", async () => {
  const saved = process.env.CASHFREE_WEBHOOK_SECRET;
  delete process.env.CASHFREE_WEBHOOK_SECRET;
  try{
    stubFetch({ body: paidOrder({ order_id: "lume_student999_fallback" }) });
    const ts = String(Date.now());
    const raw = JSON.stringify(paymentSuccess("lume_student999_fallback"));
    const req = makeReq(raw, {
      "x-webhook-signature": sign(ts, raw, process.env.CASHFREE_CLIENT_SECRET),
      "x-webhook-timestamp": ts
    });
    const res = makeRes();
    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.ok(store.read("entitlements", "lume_student999_fallback"));
  } finally {
    process.env.CASHFREE_WEBHOOK_SECRET = saved;
  }
});

await test("a pre-parsed body fails fast instead of hanging on a dead stream", async () => {
  stubFetch({ body: paidOrder() });
  const req = makeReq("", { "x-webhook-signature": "x", "x-webhook-timestamp": "1" });
  req.body = { type: "PAYMENT_SUCCESS_WEBHOOK" }; // a parser got here first
  const res = makeRes();
  await handler(req, res);
  assert.equal(res.statusCode, 503, "a lost raw body must ask for a retry, not hang or 200");
  assert.equal(fetchCalls.length, 0);
});

console.log("\ncoupon redemptions");

await test("a redemption is counted against the account, not the typed address", async () => {
  /*
    create-order checks per_customer_limit and restricted_to_emails against
    the email on the verified sign-in. If the redemption were counted
    against the contact address instead, the two would look at different
    people and the limit would not be a limit: buy once with the account's
    address, buy again with anything else typed into the form.

    So the account_email tag — which create-order stamps from the token —
    is what the counter is keyed on.
  */
  store.clear();
  stubFetch({ body: paidOrder({
    order_id: "lume_student999_couponid",
    order_tags: {
      sku: "student-full-report",
      coupon_code: "CAREER30",
      coupon_discount: "300",
      account_email: "signed-in@example.com"
    },
    customer_details: { customer_name: "Chhavi Sehgal", customer_email: "typed@example.com", customer_phone: "9812345678" }
  }) });

  const r = await deliver(paymentSuccess("lume_student999_couponid"));
  assert.equal(r.status, 200, "body: " + JSON.stringify(r.body));

  const counted = store.read("couponCustomers", "CAREER30__e_signed-in@example.com");
  assert.ok(counted, "the redemption was not counted against the signed-in account");
  assert.equal(counted.count, 1);
  assert.equal(store.read("couponCustomers", "CAREER30__e_typed@example.com"), undefined,
    "counted against the typed address — create-order would never look there");

  // The phone is an identity too, and still counts.
  assert.ok(store.read("couponCustomers", "CAREER30__p_9812345678"), "the phone key should be counted as well");
});

await test("an order placed before accounts still counts against its contact address", async () => {
  // No account_email tag: orders from before sign-in was required, and any
  // deploy running with LUME_REQUIRE_ACCOUNT=0. Falling back is what keeps
  // the limit working there rather than silently counting nobody.
  store.clear();
  stubFetch({ body: paidOrder({
    order_id: "lume_student999_legacycoupon",
    order_tags: { sku: "student-full-report", coupon_code: "CAREER30", coupon_discount: "300" },
    customer_details: { customer_name: "Chhavi Sehgal", customer_email: "only@example.com", customer_phone: "9812345678" }
  }) });

  const r = await deliver(paymentSuccess("lume_student999_legacycoupon"));
  assert.equal(r.status, 200);
  assert.ok(store.read("couponCustomers", "CAREER30__e_only@example.com"),
    "with no account on the order the contact address is the only identity there is");
});

console.log("\ndemo orders");

// The tag create-order stamps on an order paid for with a demo coupon.
function demoOrder(overrides = {}){
  return paidOrder(Object.assign({
    order_id: "lume_student999_demorun",
    order_amount: 1,
    order_tags: {
      sku: "student-full-report",
      coupon_code: "LUMEDEMO",
      coupon_discount: "998",
      list_amount: "999",
      demo: "1"
    }
  }, overrides));
}

// Reads the body of the POST fulfilment sent to the owner's webhook.
function ownerEvent(){
  const hit = fetchCalls.find(c => c.url.indexOf("owner.example") !== -1);
  return hit ? JSON.parse(hit.options.body) : null;
}

await test("a demo order is recorded as a demo, not as income", async () => {
  store.clear();
  stubFetch({ body: demoOrder() });
  const r = await deliver(paymentSuccess("lume_student999_demorun"));
  assert.equal(r.status, 200, "body: " + JSON.stringify(r.body));

  const row = store.read("entitlements", "lume_student999_demorun");
  assert.ok(row, "no entitlement row was written");
  assert.equal(row.source, "demo",
    "the ₹1 would be indistinguishable from a sale when adding up revenue");
  // ...and the access itself is completely ordinary. A demo that doesn't
  // hand over the real product demonstrates nothing.
  assert.equal(row.status, "PAID");
  assert.equal(row.sku, "student-full-report");
  assert.equal(row.amount, 1);
});

await test("an ordinary sale is never marked as a demo", async () => {
  // The failure that actually costs money: a real payment quietly
  // filtered out of the books.
  store.clear();
  stubFetch({ body: paidOrder() });
  await deliver(paymentSuccess());
  const row = store.read("entitlements", "lume_student999_mtx40lur2f2io");
  assert.equal(row.source, null, "a gateway sale must carry no source");
});

await test("a coupon that is not a demo code leaves the order a sale", async () => {
  // Only the demo tag decides this — not merely having a coupon on the
  // order, or FIRST50 would stop counting as revenue.
  store.clear();
  stubFetch({ body: paidOrder({
    order_id: "lume_session499_first50",
    order_amount: 249,
    order_tags: { sku: "wellness-session", coupon_code: "FIRST50", coupon_discount: "250" }
  }) });
  await deliver(paymentSuccess("lume_session499_first50"));
  assert.equal(store.read("entitlements", "lume_session499_first50").source, null);
});

await test("only the exact demo tag counts, so a stray value is still a sale", async () => {
  store.clear();
  for(const [id, demo] of [["lume_a_zero", "0"], ["lume_b_false", "false"], ["lume_c_empty", ""]]){
    stubFetch({ body: paidOrder({ order_id: id, order_tags: { sku: "student-full-report", demo: demo } }) });
    await deliver(paymentSuccess(id));
    assert.equal(store.read("entitlements", id).source, null,
      'demo tag "' + demo + '" must not hide a real sale');
  }
});

await test("the owner's notification says a demo is a demo", async () => {
  const prev = process.env.OWNER_WEBHOOK_URL;
  process.env.OWNER_WEBHOOK_URL = "https://owner.example/hook";
  try{
    store.clear();
    stubFetch({ body: demoOrder({ order_id: "lume_student999_demonote" }) });
    await deliver(paymentSuccess("lume_student999_demonote"));

    const event = ownerEvent();
    assert.ok(event, "the owner was not notified at all");
    assert.equal(event.details.demo, "yes", "no column to filter the Sheet on");
    assert.ok(/DEMO/.test(event.summary),
      "a ₹1 row that reads like a sale is the one someone adds up by hand: " + event.summary);
  }finally{
    if(prev == null) delete process.env.OWNER_WEBHOOK_URL;
    else process.env.OWNER_WEBHOOK_URL = prev;
  }
});

await test("an ordinary sale's notification is not labelled a demo", async () => {
  const prev = process.env.OWNER_WEBHOOK_URL;
  process.env.OWNER_WEBHOOK_URL = "https://owner.example/hook";
  try{
    store.clear();
    stubFetch({ body: paidOrder({ order_id: "lume_student999_realnote" }) });
    await deliver(paymentSuccess("lume_student999_realnote"));

    const event = ownerEvent();
    assert.ok(event);
    assert.equal(event.details.demo, "no");
    assert.ok(!/DEMO/.test(event.summary), event.summary);
  }finally{
    if(prev == null) delete process.env.OWNER_WEBHOOK_URL;
    else process.env.OWNER_WEBHOOK_URL = prev;
  }
});

console.log("\nwiring");

await test("the handler is exported as the handler itself", () => {
  assert.equal(typeof handler, "function", "the module must export the handler itself");
});

/*
  The config that keeps the raw bytes is checked on the CATCH-ALL, not on
  this handler, because Vercel reads it from the file it routes to and
  that is no longer this one. Asserting it here would pass against a dead
  export while production rejected every delivery for a bad signature —
  which is the failure this test exists to prevent, so it has to follow
  the config rather than the file it used to live in.
*/
await test("the body parser is disabled on the route, or every signature would fail", () => {
  const route = require("../api/cashfree/[...route].js");
  assert.ok(route.config && route.config.api && route.config.api.bodyParser === false,
    "bodyParser must be false on api/cashfree/[...route].js — the signature is over the raw bytes");
});

await test("the webhook is actually wired into that route", () => {
  // The config above is worth nothing if deliveries never reach this
  // handler through it.
  const route = require("../api/cashfree/[...route].js");
  assert.equal(route.routes.webhook, handler,
    "api/cashfree/[...route].js must dispatch /webhook to this exact handler");
});

console.log("\n" + passed + " passed, " + failed + " failed\n");
process.exit(failed ? 1 : 0);
