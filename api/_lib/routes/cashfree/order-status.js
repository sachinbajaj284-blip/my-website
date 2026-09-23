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

const { isManualOrderId, findManualEntitlement } = require("../../entitlements");
const { json, setCors } = require("../../http");
const { fulfillPaidOrder, readOrder } = require("../../fulfillment");
const { fetchCashfreeOrder, hasCredentials } = require("../../cashfree");

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

  const orderId = getOrderId(req);
  if(!/^[A-Za-z0-9_-]{3,45}$/.test(orderId)){
    return json(res, 400, { error: "Valid order_id is required." });
  }

  /*
    Manual grants resolve from Firestore, not from Cashfree.

    An off-platform payment (see /api/entitlements/grant) has no order at
    the gateway, so asking Cashfree about one would 404 and
    lumeCashfreeVerifyAccess would then delete the very access
    restore-access had just handed the browser. Answering it here — in the
    same shape, from the entitlement record that *is* the proof of payment
    — means the whole existing chain works for these grants unchanged.

    This runs before the credentials check because a manual grant needs no
    Cashfree credentials to verify.
  */
  if(isManualOrderId(orderId)){
    let record;
    try{
      record = await findManualEntitlement(orderId);
    }catch(err){
      console.error("[lume order-status] manual entitlement lookup failed:", String(err && err.message || err));
      // Fail closed, and say it's a lookup failure rather than a verdict —
      // the client retries instead of treating this as "not paid".
      return json(res, 502, { error: "Could not verify that order right now. Please retry in a moment." });
    }
    if(!record){
      return json(res, 404, { error: "Order not found." });
    }
    return json(res, 200, {
      order_id: orderId,
      cf_order_id: null,
      order_status: "PAID",
      order_amount: record.amount != null ? record.amount : null,
      order_currency: record.currency || "INR",
      sku: String(record.sku || ""),
      coupon_code: "",
      coupon_discount: 0,
      session_mode: "",
      // Same restraint as the Cashfree path below: first name only, so
      // this public, order-id-only endpoint never leaks contact details.
      customer: {
        name: record.name ? String(record.name).split(" ")[0] : ""
      }
    });
  }

  if(!hasCredentials()){
    return json(res, 500, { error: "Cashfree credentials are not configured." });
  }

  let lookup;
  try{
    lookup = await fetchCashfreeOrder(orderId);
  }catch(err){
    return json(res, 502, { error: "Could not reach the payment gateway to verify status. Please retry in a moment." });
  }

  const data = lookup.data;
  if(!lookup.ok){
    return json(res, lookup.status, { error: "Cashfree order status check failed.", details: data });
  }

  /*
    Everything a PAID order triggers — the entitlement record, the coupon
    count, the owner notification — lives in _lib/fulfillment.js, because
    the webhook has to do the identical thing for a payment the browser
    never comes back to report. Idempotent, so polling this endpoint
    twenty times still fulfils once.

    Never fails the status check: the client is waiting on an answer about
    their own payment, and a Firestore hiccup is not their problem.
  */
  const order = readOrder(data);
  try{
    await fulfillPaidOrder(data);
  }catch(err){
    console.error("[lume order-status] fulfilment failed:", String(err && err.message || err));
  }

  return json(res, 200, {
    order_id: data.order_id,
    cf_order_id: data.cf_order_id,
    order_status: data.order_status,
    order_amount: data.order_amount,
    order_currency: data.order_currency,
    sku: order.sku,
    // So the receipt screen can show "₹499 − ₹250 (FIRST50)" rather than a
    // bare amount the client doesn't recognise.
    coupon_code: order.couponCode,
    coupon_discount: order.couponCode ? order.couponDiscount : 0,
    // Returned so the post-payment screen can show the client the line to
    // paste into Google's booking form — a preference, not a contact detail.
    session_mode: order.sessionMode,
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
