/*
  Cashfree payment webhook for Lume Live.

  Endpoint:
  POST /api/cashfree/webhook

  Why this exists
  ---------------
  Until this endpoint, a payment was only ever recorded if the customer's
  browser came back from Cashfree and polled order-status.js. That is the
  one part of a checkout nobody controls. A UPI app that doesn't hand
  control back, a closed tab, a dropped connection on the redirect — the
  money arrives at Cashfree and the site learns nothing: no entitlement,
  so the customer cannot open what they bought and restore-access has
  nothing to find; and no owner notification, so nobody knows to chase it.

  Cashfree retries a webhook until it gets a 2xx, so this is the reliable
  path to fulfilment and the browser poll is now only the fast one. Both
  call the same fulfilPaidOrder(), and every step of it is idempotent per
  order, so whichever arrives first does the work.

  Setup
  -----
  Cashfree Dashboard → Developers → Webhooks → add
      https://lumelive.co.in/api/cashfree/webhook
  subscribed to at least PAYMENT_SUCCESS_WEBHOOK, then set:

  CASHFREE_WEBHOOK_SECRET   The signing secret for that webhook. Falls
                            back to CASHFREE_CLIENT_SECRET, which is what
                            Cashfree signs with unless you set a separate
                            one. Without either, every delivery is
                            rejected — an unsigned "you got paid" is
                            exactly the message an attacker would forge.

  /api/cashfree/health reports whether this is configured.
*/

const crypto = require("crypto");
const { json } = require("../_lib/http");
const { fetchOrder, isPaid, isConfigured } = require("../_lib/cashfree");
const { fulfilPaidOrder } = require("../_lib/fulfil");

// Deliveries older than this are refused, so a signed body captured off
// the wire can't be replayed back at us indefinitely.
const MAX_SKEW_MS = 15 * 60 * 1000;
const MAX_BODY_BYTES = 64 * 1024;

function signingSecret(){
  return process.env.CASHFREE_WEBHOOK_SECRET || process.env.CASHFREE_CLIENT_SECRET || "";
}

/*
  The raw bytes, not a parsed object.

  The signature covers the exact string Cashfree sent, so re-serialising
  a parsed body would change the whitespace and key order and fail every
  time. Some hosts hand a pre-read body over on req.rawBody; when they
  do, that is the authoritative copy and the stream is already drained.
*/
function readRaw(req){
  if(typeof req.rawBody === "string") return Promise.resolve(req.rawBody);
  if(Buffer.isBuffer(req.rawBody)) return Promise.resolve(req.rawBody.toString("utf8"));
  return new Promise(function(resolve, reject){
    let raw = "";
    let size = 0;
    let aborted = false;
    req.on("data", function(chunk){
      if(aborted) return;
      size += chunk.length;
      if(size > MAX_BODY_BYTES){
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
  Cashfree signs base64(HMAC-SHA256(timestamp + rawBody, secret)).

  Compared with timingSafeEqual so a wrong signature can't be narrowed
  down a byte at a time. Lengths are checked first because
  timingSafeEqual throws on a mismatch rather than returning false.
*/
function signatureMatches(timestamp, rawBody, provided){
  const secret = signingSecret();
  if(!secret || !provided) return false;
  const expected = crypto.createHmac("sha256", secret)
    .update(timestamp + rawBody)
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(provided));
  if(a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function timestampIsFresh(timestamp){
  // Cashfree sends seconds since the epoch; tolerate milliseconds too.
  const n = Number(timestamp);
  if(!Number.isFinite(n) || n <= 0) return false;
  const ms = n > 1e11 ? n : n * 1000;
  return Math.abs(Date.now() - ms) <= MAX_SKEW_MS;
}

// The order id is the only thing read out of the delivery, and it is
// used purely to decide which order to go and ask Cashfree about.
function orderIdOf(payload){
  const data = (payload && payload.data) || {};
  const order = data.order || {};
  return String(order.order_id || data.order_id || payload.order_id || "").trim();
}

module.exports = async function handler(req, res){
  // No CORS headers: this is a server-to-server endpoint. A browser has
  // no business calling it, and nothing should advertise that it may.
  if(req.method !== "POST"){
    return json(res, 405, { error: "Method not allowed" });
  }

  if(!signingSecret()){
    console.error("[lume webhook] no signing secret configured — delivery refused");
    return json(res, 500, { error: "Webhook signing secret is not configured." });
  }

  let raw;
  try{
    raw = await readRaw(req);
  }catch(err){
    return json(res, err && err.statusCode === 413 ? 413 : 400, { error: "Could not read webhook body." });
  }

  const timestamp = String(req.headers["x-webhook-timestamp"] || "");
  const signature = String(req.headers["x-webhook-signature"] || "");

  if(!timestampIsFresh(timestamp)){
    return json(res, 401, { error: "Stale or missing webhook timestamp." });
  }
  if(!signatureMatches(timestamp, raw, signature)){
    console.error("[lume webhook] signature mismatch — delivery refused");
    return json(res, 401, { error: "Invalid webhook signature." });
  }

  let payload;
  try{ payload = raw ? JSON.parse(raw) : {}; }
  catch(err){ return json(res, 400, { error: "Invalid JSON body." }); }

  const type = String(payload.type || "");
  const orderId = orderIdOf(payload);

  /*
    Anything that isn't a successful payment is acknowledged and dropped.

    A 2xx is the only way to stop Cashfree retrying, and there is nothing
    to retry for a failed or dropped payment — returning an error would
    buy us a redelivery loop over an event we were never going to act on.
  */
  if(type !== "PAYMENT_SUCCESS_WEBHOOK"){
    return json(res, 200, { ok: true, ignored: type || "unknown" });
  }

  if(!orderId){
    console.warn("[lume webhook] PAYMENT_SUCCESS_WEBHOOK with no order id");
    return json(res, 200, { ok: true, ignored: "no-order-id" });
  }

  if(!isConfigured()){
    // Can't verify the order, so don't act on it. A 500 keeps the
    // delivery in Cashfree's retry queue until the credentials are set,
    // rather than losing the sale to a config mistake.
    console.error("[lume webhook] Cashfree credentials missing — cannot verify order", orderId);
    return json(res, 500, { error: "Cashfree credentials are not configured." });
  }

  /*
    The delivery said this order was paid. Ask Cashfree whether it was.

    The signature already proves the message came from Cashfree, so this
    is not about trust — it is about reading the order's tags (sku,
    account, coupon) and confirmed customer details from the one record
    that create-order.js wrote them onto, in exactly the shape the
    browser poll fulfils from.
  */
  const looked = await fetchOrder(orderId);
  if(!looked.ok){
    // Transport failure or a 5xx from Cashfree — ask for the retry.
    console.error("[lume webhook] order lookup failed for", orderId, looked.status, looked.error || "");
    return json(res, 502, { error: "Could not verify the order. Please retry." });
  }

  if(!isPaid(looked.data)){
    // Cashfree says this order isn't paid, so there is nothing to grant
    // and no point retrying.
    console.warn("[lume webhook] order not PAID on lookup:", orderId, looked.data && looked.data.order_status);
    return json(res, 200, { ok: true, ignored: "not-paid" });
  }

  const report = await fulfilPaidOrder(looked.data, "webhook");

  /*
    A failed entitlement write is the one thing worth a retry: it is the
    record the customer's access depends on. The coupon count and the
    owner ping are best-effort by design and never hold up the 200.
  */
  if(report.sku && !report.entitlement){
    return json(res, 500, { error: "Could not record the purchase. Please retry." });
  }

  return json(res, 200, { ok: true, order_id: report.orderId, sku: report.sku });
};
