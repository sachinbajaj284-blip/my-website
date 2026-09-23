/*
  POST /api/cashfree/webhook — Cashfree calls this, nobody else does.

  ───────────────────────────────────────────────────────────────────────
  Why this exists
  ───────────────────────────────────────────────────────────────────────
  Until this endpoint, a payment was only ever *learned about* by the
  customer's browser coming back to payment-return.html and polling
  /api/cashfree/order-status. That made fulfilment depend on the customer
  completing a redirect, which is the one part of a checkout nobody
  controls. A client who paid on a UPI app and closed the tab, or lost
  signal on the way back, left no entitlement record anywhere: the
  assessment stayed locked, restore-access found nothing to restore
  (there was no row to find), and the only fix was a manual grant.

  Cashfree knows about the payment regardless. This endpoint is it
  telling us, so fulfilment no longer depends on the customer's browser.

  ───────────────────────────────────────────────────────────────────────
  Trust
  ───────────────────────────────────────────────────────────────────────
  This is a public URL that hands out paid product, so it believes two
  things and no more:

  1. The signature. Cashfree signs every delivery with
     base64(HMAC-SHA256(timestamp + raw body, client secret)). The body is
     compared byte-for-byte as received — re-serialising parsed JSON would
     change the bytes and break every signature — and the comparison is
     constant-time. An unsigned or wrongly-signed request is refused
     without being looked at.

  2. Nothing else in the payload. Even correctly signed, the body is only
     read for an order id; the amount, the status, the sku and the
     customer are then read from Cashfree's own /pg/orders/{id} response,
     exactly as the polling path reads them. So a replayed or tampered
     delivery can at worst ask us to re-check an order we already have,
     and re-checking is a no-op.

  That second point is also why there is no timestamp-freshness rejection
  here: fulfilment is idempotent and re-derived from the gateway, so a
  replay achieves nothing, while a freshness window would drop the
  legitimate retries Cashfree sends for hours after an outage.

  ───────────────────────────────────────────────────────────────────────
  Acknowledgement
  ───────────────────────────────────────────────────────────────────────
  Cashfree retries anything that isn't a 2xx. That is a feature and this
  endpoint uses it deliberately: if the entitlement write fails (Firestore
  down, credentials missing), it answers 503 so the delivery comes back
  later. Everything genuinely final — a signature that doesn't check out,
  an event we don't act on, an order the gateway says isn't paid — is
  answered 2xx so Cashfree stops trying.

  ───────────────────────────────────────────────────────────────────────
  Setup
  ───────────────────────────────────────────────────────────────────────
  Cashfree Dashboard → Developers → Webhooks → Add endpoint:

    https://lumelive.co.in/api/cashfree/webhook

  Subscribe to PAYMENT_SUCCESS_WEBHOOK. No new environment variable is
  needed — the signing key is CASHFREE_CLIENT_SECRET, which is already
  set for create-order.js. Set CASHFREE_WEBHOOK_SECRET only if you rotate
  the webhook key separately from the API key.
*/

const crypto = require("crypto");
const { json, setCors } = require("../../http");
const { fulfillPaidOrder } = require("../../fulfillment");
const { fetchCashfreeOrder, hasCredentials } = require("../../cashfree");

// Deliveries are small. A cap keeps an oversized body from being buffered
// and HMAC'd before anything has established that it's really Cashfree.
const MAX_WEBHOOK_BYTES = 64 * 1024;

/*
  Which events are worth acting on.

  Matched on a substring rather than an exact string, because the exact
  one depends on the webhook version configured in the Cashfree dashboard
  and that is a setting nobody here controls — 2022-09-01 sends
  PAYMENT_SUCCESS_WEBHOOK, and a future version is free to spell it
  differently. Being loose here costs nothing: a match only means "go ask
  the gateway about this order", and the order is fulfilled solely on
  Cashfree's own PAID verdict. An event we match but shouldn't have is a
  wasted lookup, not a wrongful grant.

  Anything else is acknowledged and ignored — refunds and failures are
  reconciled in the dashboard, not by revoking access from under someone
  mid-assessment.
*/
function actsOn(type){
  return String(type || "").toUpperCase().includes("PAYMENT_SUCCESS");
}

function signingSecret(){
  return process.env.CASHFREE_WEBHOOK_SECRET || process.env.CASHFREE_CLIENT_SECRET || "";
}

function readRawBody(req){
  return new Promise(function(resolve, reject){
    // Some runtimes hand the body over already buffered. Use those bytes
    // rather than waiting on a stream that has already ended.
    if(Buffer.isBuffer(req.body)) return resolve(req.body.toString("utf8"));
    if(typeof req.body === "string") return resolve(req.body);

    /*
      A parsed object means something consumed the stream and threw the
      raw bytes away — the config below was lost or ignored. The signature
      cannot be checked without those bytes, and listening to a stream
      that has already ended would hang here until the platform killed the
      function, which reads to Cashfree as a timeout and burns a retry.
      Fail loudly and immediately instead.
    */
    if(req.body && typeof req.body === "object"){
      const err = new Error("Body was parsed before the signature could be checked.");
      err.statusCode = 503;
      return reject(err);
    }

    let raw = "";
    let size = 0;
    let aborted = false;
    req.on("data", function(chunk){
      if(aborted) return;
      size += chunk.length;
      if(size > MAX_WEBHOOK_BYTES){
        aborted = true;
        const err = new Error("Webhook body too large.");
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on("end", function(){ if(!aborted) resolve(raw); });
    req.on("error", reject);
  });
}

/*
  Constant-time comparison of the delivered signature against our own.

  timingSafeEqual throws on a length mismatch, so the lengths are checked
  first — and compared on the decoded bytes, since two different base64
  spellings of the same digest should not read as different signatures.
*/
function signatureMatches(signature, timestamp, rawBody, secret){
  if(!signature || !timestamp || !secret) return false;
  const expected = crypto.createHmac("sha256", secret)
    .update(String(timestamp) + rawBody)
    .digest();
  let received;
  try{
    received = Buffer.from(String(signature), "base64");
  }catch(err){
    return false;
  }
  if(received.length !== expected.length) return false;
  return crypto.timingSafeEqual(received, expected);
}

/*
  The order id is the only thing read out of the delivered payload, and it
  is validated against the same shape order-status accepts before it is
  ever put in a URL.

  Two nestings are accepted for the same reason the event match is loose:
  the payload shape is the dashboard's choice of webhook version, not
  ours. Both spellings mean the same thing and neither is trusted for
  anything beyond naming an order to go and look up.
*/
function readOrderId(payload){
  const data = (payload && payload.data) || {};
  const order = data.order || {};
  const id = String(order.order_id || data.order_id || "").trim();
  return /^[A-Za-z0-9_-]{3,45}$/.test(id) ? id : "";
}

module.exports = async function handler(req, res){
  setCors(req, res, "POST,OPTIONS");

  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }
  if(req.method !== "POST"){
    return json(res, 405, { error: "Method not allowed" });
  }

  const secret = signingSecret();
  if(!secret){
    // Nothing can be verified, so nothing can be trusted. 503 rather than
    // a silent 200: this is a misconfiguration, and letting Cashfree retry
    // means the payments that arrive during it aren't lost.
    console.error("[lume webhook] no signing secret configured — cannot verify deliveries.");
    return json(res, 503, { error: "Webhook verification is not configured." });
  }

  let raw;
  try{
    raw = await readRawBody(req);
  }catch(err){
    const status = err && err.statusCode === 413 ? 413
      : err && err.statusCode === 503 ? 503
      : 400;
    if(status === 503){
      console.error("[lume webhook] " + String(err && err.message || err));
    }
    return json(res, status, { error: "Could not read the webhook body." });
  }

  if(!signatureMatches(req.headers["x-webhook-signature"], req.headers["x-webhook-timestamp"], raw, secret)){
    // Deliberately terse, and deliberately final: a caller who cannot sign
    // learns nothing from us and should not be invited to retry.
    console.warn("[lume webhook] rejected a delivery with an invalid signature.");
    return json(res, 401, { error: "Invalid signature." });
  }

  let payload;
  try{
    payload = raw ? JSON.parse(raw) : {};
  }catch(err){
    // Signed by us and still unparseable — retrying won't change that.
    return json(res, 200, { ok: true, ignored: "unparseable" });
  }

  const type = String(payload && payload.type || "");
  if(!actsOn(type)){
    /*
      Logged, not silently dropped. A delivery this endpoint decides not
      to act on is indistinguishable — from the dashboard, which just sees
      a 200 — from one it fulfilled. If a webhook version ever sends a
      success under a name we don't recognise, this line is what makes
      that visible in the logs instead of showing up as a customer who
      paid and stayed locked out.
    */
    console.log("[lume webhook] ignored a delivery of type: " + (type || "(untyped)"));
    return json(res, 200, { ok: true, ignored: type || "untyped" });
  }

  const orderId = readOrderId(payload);
  if(!orderId){
    console.warn("[lume webhook] " + type + " with no usable order_id.");
    return json(res, 200, { ok: true, ignored: "no order_id" });
  }

  if(!hasCredentials()){
    console.error("[lume webhook] Cashfree credentials are not configured — cannot confirm " + orderId + ".");
    return json(res, 503, { error: "Cashfree credentials are not configured." });
  }

  // The payload said a payment succeeded. Ask Cashfree directly what the
  // order actually is, and fulfil from that — same source of truth, same
  // code path, as a browser poll.
  let lookup;
  try{
    lookup = await fetchCashfreeOrder(orderId);
  }catch(err){
    console.error("[lume webhook] could not reach Cashfree for " + orderId + ":", String(err && err.message || err));
    return json(res, 503, { error: "Could not reach the payment gateway. Please retry." });
  }

  if(!lookup.ok){
    // 404 and friends are Cashfree's own verdict on an order it owns;
    // there is nothing to come back for. 5xx is Cashfree having a moment,
    // and that is worth a retry.
    const retry = lookup.status >= 500;
    console.warn("[lume webhook] order lookup for " + orderId + " returned " + lookup.status);
    return json(res, retry ? 503 : 200, { ok: !retry, error: "Order lookup failed.", status: lookup.status });
  }

  let outcome;
  try{
    outcome = await fulfillPaidOrder(lookup.data);
  }catch(err){
    console.error("[lume webhook] fulfilment threw for " + orderId + ":", String(err && err.message || err));
    return json(res, 503, { error: "Fulfilment failed. Please retry." });
  }

  if(outcome.fulfilled && !outcome.recorded){
    // The one failure worth the retry machinery: the payment is real, the
    // entitlement did not get written, and without it the customer's
    // assessment stays locked. Exactly the case this endpoint exists for.
    console.error("[lume webhook] entitlement not recorded for " + orderId + " — asking Cashfree to retry.");
    return json(res, 503, { error: "Could not record the purchase. Please retry." });
  }

  return json(res, 200, { ok: true, order_id: orderId, fulfilled: outcome.fulfilled });
};

/*
  Vercel parses a JSON body by default and throws the raw bytes away. The
  signature is over those bytes, so the parsing has to be turned off.

  That config does NOT live here any more. Vercel reads it from the file
  it routes to, and this file is no longer one — api/cashfree/[...route].js
  is, so the config sits there. Setting it here as well would look
  load-bearing while doing nothing, which is worse than not setting it:
  the endpoint would still deploy, still receive deliveries, and reject
  every one of them for a bad signature while a reader saw a line that
  appeared to prevent exactly that.

  readRawBody() above is the backstop either way. If something does parse
  the body first it answers 503 rather than waiting on a stream that has
  already ended — a hang reads to Cashfree as a timeout and burns a retry.
*/

// Exported for tools/webhook.test.mjs. The signature check is the whole
// security boundary here, so it is tested directly rather than only
// through a mocked request.
module.exports.signatureMatches = signatureMatches;
module.exports.readOrderId = readOrderId;
module.exports.actsOn = actsOn;
module.exports.MAX_WEBHOOK_BYTES = MAX_WEBHOOK_BYTES;
