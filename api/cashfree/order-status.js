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

const { isManualOrderId, findManualEntitlement } = require("../_lib/entitlements");
const { json, setCors } = require("../_lib/http");
const { fetchOrder, isPaid, isConfigured } = require("../_lib/cashfree");
const { fulfilPaidOrder, describeOrder } = require("../_lib/fulfil");

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

  if(!isConfigured()){
    return json(res, 500, { error: "Cashfree credentials are not configured." });
  }

  const looked = await fetchOrder(orderId);
  if(!looked.ok && looked.status === 0){
    return json(res, 502, { error: "Could not reach the payment gateway to verify status. Please retry in a moment." });
  }
  if(!looked.ok){
    return json(res, looked.status, { error: "Cashfree order status check failed.", details: looked.data });
  }
  const data = looked.data;

  /*
    The same three fulfilment steps the webhook runs, from the same
    function, against the same order record. Whichever of the two gets
    here first does the work; every step is idempotent per order, so the
    second is a no-op rather than a double grant or a second owner ping.

    This used to be the only place fulfilment happened, which meant a
    customer whose browser never made it back from the gateway paid and
    got nothing. See api/cashfree/webhook.js.
  */
  const info = describeOrder(data);
  if(isPaid(data)){
    await fulfilPaidOrder(data, "poll");
  }

  return json(res, 200, {
    order_id: data.order_id,
    cf_order_id: data.cf_order_id,
    order_status: data.order_status,
    order_amount: data.order_amount,
    order_currency: data.order_currency,
    sku: info.sku,
    // So the receipt screen can show "₹499 − ₹250 (FIRST50)" rather than a
    // bare amount the client doesn't recognise.
    coupon_code: info.couponCode,
    coupon_discount: info.couponCode ? info.couponDiscount : 0,
    // Returned so the post-payment screen can show the client the line to
    // paste into Google's booking form — a preference, not a contact detail.
    session_mode: info.sessionMode,
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
