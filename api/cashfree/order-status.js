/*
  Deployable Cashfree order-status endpoint for Lume Live.

  Endpoint:
  /api/cashfree/order-status?order_id=...

  Required environment variables:
  CASHFREE_CLIENT_ID=...
  CASHFREE_CLIENT_SECRET=...
  CASHFREE_ENV=production or sandbox
  CASHFREE_API_VERSION=2025-01-01

  Optional (enables server-side purchase records so access can be
  restored on a new device — see restore-access.js):
  FIREBASE_PROJECT_ID=...
  FIREBASE_CLIENT_EMAIL=...
  FIREBASE_PRIVATE_KEY=...
*/

const { recordPaidEntitlement, claimPaidNotification } = require("../_lib/entitlements");
const { notifyOwner } = require("../_lib/notify");

// SKUs where the client books their own slot on the Google Calendar page,
// so the owner knows not to chase them for a date and time.
const BOOKING_SKUS = new Set(["intro-session", "career-direction-session", "stream-clarity-session"]);

function json(res, status, body){
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

const DEFAULT_ALLOWED_ORIGINS = [
  "https://lumelive.co.in",
  "https://www.lumelive.co.in",
  "http://127.0.0.1:8765",
  "http://localhost:8765"
];

function allowedOrigins(){
  return new Set(DEFAULT_ALLOWED_ORIGINS.concat(
    String(process.env.LUME_ALLOWED_ORIGINS || "")
      .split(",")
      .map(function(origin){ return origin.trim(); })
      .filter(Boolean)
  ));
}

function setCors(req, res){
  const origin = req.headers.origin || "";
  if(origin && allowedOrigins().has(origin)){
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function getOrderId(req){
  try{
    const url = new URL(req.url, "https://lumelive.co.in");
    return String(url.searchParams.get("order_id") || "").trim();
  }catch(err){
    return "";
  }
}

module.exports = async function handler(req, res){
  setCors(req, res);

  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }

  if(req.method !== "GET"){
    return json(res, 405, { error: "Method not allowed" });
  }

  const clientId = process.env.CASHFREE_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
  if(!clientId || !clientSecret){
    return json(res, 500, { error: "Cashfree credentials are not configured." });
  }

  const orderId = getOrderId(req);
  if(!/^[A-Za-z0-9_-]{3,45}$/.test(orderId)){
    return json(res, 400, { error: "Valid order_id is required." });
  }

  const env = (process.env.CASHFREE_ENV || "production").toLowerCase();
  const base = env === "sandbox" ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg";
  let response, data;
  try{
    const controller = new AbortController();
    const timer = setTimeout(function(){ controller.abort(); }, 12000);
    try{
      response = await fetch(base + "/orders/" + encodeURIComponent(orderId), {
        method: "GET",
        headers: {
          "x-client-id": clientId,
          "x-client-secret": clientSecret,
          "x-api-version": process.env.CASHFREE_API_VERSION || "2025-01-01"
        },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  }catch(err){
    return json(res, 502, { error: "Could not reach the payment gateway to verify status. Please retry in a moment." });
  }

  data = await response.json().catch(() => ({}));
  if(!response.ok){
    return json(res, response.status, { error: "Cashfree order status check failed.", details: data });
  }

  const sku = data.order_tags && data.order_tags.sku ? data.order_tags.sku : "";
  const isPaid = String(data.order_status || "").toUpperCase() === "PAID";

  if(isPaid && !sku){
    // Every order create-order.js creates is tagged with a sku, so this
    // should only happen for a legacy/manually-created order. Surfaced as
    // a warning (not silently dropped) since it means no entitlement
    // record gets written — that order will never show up in
    // restore-access, and lumeCashfreeVerifyAccess requires an exact sku
    // match, so it won't unlock anything either.
    console.warn("[lume order-status] PAID order with no order_tags.sku — no entitlement recorded:", data.order_id);
  }

  if(isPaid && sku){
    // Write the durable, server-side purchase record. This is the actual
    // source of truth for "who paid for what" — never fails the status
    // check itself if Firebase isn't configured or the write hiccups, so
    // checkout never breaks over this.
    try{
      await recordPaidEntitlement({
        orderId: data.order_id,
        sku: sku,
        amount: data.order_amount,
        currency: data.order_currency,
        phone: data.customer_details && data.customer_details.customer_phone,
        email: data.customer_details && data.customer_details.customer_email,
        name: data.customer_details && data.customer_details.customer_name
      });
    }catch(err){
      console.error("[lume order-status] entitlement write failed:", String(err && err.message || err));
    }

    // Tell the owner a booking has been paid for, once per order. This is
    // the trustworthy copy of the client's details — Cashfree has verified
    // the payment, and these fields come from Cashfree rather than from
    // anything the browser could have edited.
    try{
      if(await claimPaidNotification(data.order_id)){
        const notes = data.order_note || (data.order_tags && data.order_tags.label) || "";
        await notifyOwner({
          type: "payment",
          sku: sku,
          orderId: data.order_id,
          amount: data.order_amount,
          name: data.customer_details && data.customer_details.customer_name,
          phone: data.customer_details && data.customer_details.customer_phone,
          email: data.customer_details && data.customer_details.customer_email,
          summary: "Payment confirmed for " + (sku || "a Lume Live service") +
            " (₹" + (data.order_amount != null ? data.order_amount : "?") + ")." +
            (BOOKING_SKUS.has(sku) ? " They now pick their own slot on the Google Calendar link." : ""),
          details: {
            cf_order_id: data.cf_order_id,
            currency: data.order_currency,
            picks_own_slot: BOOKING_SKUS.has(sku) ? "yes" : "no",
            note: notes
          }
        });
      }
    }catch(err){
      console.error("[lume order-status] owner notification failed:", String(err && err.message || err));
    }
  }

  return json(res, 200, {
    order_id: data.order_id,
    cf_order_id: data.cf_order_id,
    order_status: data.order_status,
    order_amount: data.order_amount,
    order_currency: data.order_currency,
    sku: sku,
    // Only the first name is returned for a friendly greeting. Phone/email are
    // deliberately withheld so this public, order-id-only endpoint never leaks
    // personal contact details to anyone who guesses or shares an order id.
    customer: {
      name: data.customer_details && data.customer_details.customer_name
        ? String(data.customer_details.customer_name).split(" ")[0]
        : ""
    }
  });
};
