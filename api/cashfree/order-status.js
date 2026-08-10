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
const { json, setCors } = require("../_lib/http");
const { recordRedemption } = require("../_lib/coupons");

// SKUs where the client books their own slot on the Google Calendar page,
// so the owner knows not to chase them for a date and time.
// intro-session is retired and can no longer be bought, but orders placed
// while it was on sale are still polled here and must still resolve.
const BOOKING_SKUS = new Set(["intro-session", "wellness-session", "career-direction-session", "stream-clarity-session"]);

function getOrderId(req){
  try{
    const url = new URL(req.url, "https://lumelive.co.in");
    return String(url.searchParams.get("order_id") || "").trim();
  }catch(err){
    return "";
  }
}

module.exports = async function handler(req, res){
  setCors(req, res, "GET,OPTIONS");

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
  // How the client asked to meet — video, voice or chat. Tagged onto the order
  // by create-order.js because it is chosen before payment and would otherwise
  // be lost on the redirect. Google's booking page never sees it, so this is
  // the copy that reaches the owner.
  const sessionMode = data.order_tags && data.order_tags.session_mode
    ? String(data.order_tags.session_mode).slice(0, 40)
    : "";
  // Written by create-order.js from its own recalculation, never from the
  // browser, so this is a trustworthy record of what was discounted.
  const couponCode = data.order_tags && data.order_tags.coupon_code
    ? String(data.order_tags.coupon_code).slice(0, 32)
    : "";
  const couponDiscount = data.order_tags && data.order_tags.coupon_discount != null
    ? Number(data.order_tags.coupon_discount) || 0
    : 0;
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

    // Count the coupon now, and only now — the money has arrived. Counting
    // at validate-time would let anyone burn a limited offer by typing the
    // code, and counting at order-creation would burn it on every abandoned
    // checkout. recordRedemption is idempotent per order_id, which matters
    // because this endpoint is polled.
    if(couponCode){
      await recordRedemption({
        code: couponCode,
        orderId: data.order_id,
        sku: sku,
        amount: data.order_amount,
        discount: couponDiscount,
        // Recorded against the customer Cashfree confirmed, not anything
        // the browser claimed, so per_customer_limit counts real people.
        customer: {
          phone: data.customer_details && data.customer_details.customer_phone,
          email: data.customer_details && data.customer_details.customer_email
        }
      });
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
            (couponCode ? " Coupon " + couponCode + " applied (₹" + couponDiscount + " off)." : "") +
            (sessionMode ? " Preferred mode: " + sessionMode + "." : "") +
            (BOOKING_SKUS.has(sku) ? " They now pick their own slot on the Google Calendar link." : ""),
          details: {
            cf_order_id: data.cf_order_id,
            currency: data.order_currency,
            session_mode: sessionMode,
            coupon_code: couponCode,
            coupon_discount: couponCode ? couponDiscount : "",
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
    // So the receipt screen can show "₹499 − ₹250 (FIRST50)" rather than a
    // bare amount the client doesn't recognise.
    coupon_code: couponCode,
    coupon_discount: couponCode ? couponDiscount : 0,
    // Returned so the post-payment screen can show the client the line to
    // paste into Google's booking form — a preference, not a contact detail.
    session_mode: sessionMode,
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
