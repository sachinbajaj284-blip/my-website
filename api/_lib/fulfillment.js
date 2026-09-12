/*
  What happens the moment an order is known to be PAID.

  Three things have to follow a successful payment, in this order and
  exactly once each: the durable entitlement record (the source of truth
  for "who paid for what"), the coupon redemption count, and the owner
  notification.

  This used to live inline in order-status.js, which was fine while the
  browser polling that endpoint was the only way a payment could ever be
  learned about. It isn't any more — the webhook learns about payments the
  browser never comes back to report (see cashfree/webhook.js) — and two
  copies of fulfilment is exactly the bug you don't want: a payment that
  writes an entitlement down one path and a coupon count down the other.

  Everything here is idempotent, because both callers can fire for the
  same order: order-status is polled, and Cashfree retries a webhook
  until it is acknowledged.
*/

const { recordPaidEntitlement, claimPaidNotification } = require("./entitlements");
const { recordRedemption } = require("./coupons");
const { notifyOwner } = require("./notify");

// SKUs where the client books their own slot on the Google Calendar page,
// so the owner knows not to chase them for a date and time.
// intro-session is retired and can no longer be bought, but orders placed
// while it was on sale are still fulfilled here and must still resolve.
const BOOKING_SKUS = new Set(["intro-session", "wellness-session", "career-direction-session", "stream-clarity-session", "industry-expert-session"]);

// Reads the fields fulfilment needs out of a Cashfree order object — the
// shape /pg/orders/{id} returns. Both callers hand us that same shape, so
// the unwrapping lives here rather than in each of them.
function readOrder(data){
  const tags = (data && data.order_tags) || {};
  const customer = (data && data.customer_details) || {};
  return {
    orderId: String(data && data.order_id || ""),
    status: String(data && data.order_status || "").toUpperCase(),
    amount: data && data.order_amount != null ? data.order_amount : null,
    currency: (data && data.order_currency) || "INR",
    cfOrderId: (data && data.cf_order_id) || null,
    note: (data && data.order_note) || tags.label || "",
    sku: tags.sku ? String(tags.sku) : "",
    // How the client asked to meet — video, voice or chat. Tagged onto the
    // order by create-order.js because it is chosen before payment and
    // would otherwise be lost on the redirect. Google's booking page never
    // sees it, so this is the copy that reaches the owner.
    sessionMode: tags.session_mode ? String(tags.session_mode).slice(0, 40) : "",
    // Written by create-order.js from its own recalculation, never from the
    // browser, so this is a trustworthy record of what was discounted.
    couponCode: tags.coupon_code ? String(tags.coupon_code).slice(0, 32) : "",
    couponDiscount: tags.coupon_discount != null ? (Number(tags.coupon_discount) || 0) : 0,
    // The account that paid, stamped onto the order by create-order.js from
    // a verified sign-in. Contact details can be typed wrong or changed
    // later; this doesn't.
    uid: tags.account_uid || null,
    // The same account's email, also stamped from the verified sign-in.
    // Kept distinct from `email` below, which is the contact address on
    // the order and may have been typed by hand: the coupon rules decide
    // "who this is" from the account, so the redemption has to be counted
    // against the same thing the check looked at.
    accountEmail: tags.account_email || null,
    name: customer.customer_name || null,
    phone: customer.customer_phone || null,
    email: customer.customer_email || null
  };
}

/*
  Runs the three post-payment effects for a Cashfree order object.

  Never throws: each effect is independently guarded, because none of them
  is worth failing a status check or bouncing a webhook over. A caller
  that wants to know whether anything happened can read the returned
  flags, which is what the tests assert on.

  Returns { fulfilled, recorded, notified, sku }.
*/
async function fulfillPaidOrder(data){
  const order = readOrder(data);
  const result = { fulfilled: false, recorded: false, notified: false, sku: order.sku };

  if(order.status !== "PAID" || !order.orderId) return result;

  if(!order.sku){
    // Every order create-order.js creates is tagged with a sku, so this
    // should only happen for a legacy/manually-created order. Surfaced as
    // a warning (not silently dropped) since it means no entitlement
    // record gets written — that order will never show up in
    // restore-access, and lumeCashfreeVerifyAccess requires an exact sku
    // match, so it won't unlock anything either.
    console.warn("[lume fulfilment] PAID order with no order_tags.sku — no entitlement recorded:", order.orderId);
    return result;
  }

  result.fulfilled = true;

  // The durable, server-side purchase record. This is the actual source of
  // truth for "who paid for what" — never fails the caller if Firebase
  // isn't configured or the write hiccups, so checkout never breaks over
  // this.
  try{
    await recordPaidEntitlement({
      orderId: order.orderId,
      sku: order.sku,
      amount: order.amount,
      currency: order.currency,
      phone: order.phone,
      email: order.email,
      name: order.name,
      uid: order.uid
    });
    result.recorded = true;
  }catch(err){
    console.error("[lume fulfilment] entitlement write failed:", String(err && err.message || err));
  }

  // Count the coupon now, and only now — the money has arrived. Counting
  // at validate-time would let anyone burn a limited offer by typing the
  // code, and counting at order-creation would burn it on every abandoned
  // checkout. recordRedemption is idempotent per order_id, which matters
  // because this runs on every poll and every webhook retry.
  if(order.couponCode){
    try{
      await recordRedemption({
        code: order.couponCode,
        orderId: order.orderId,
        sku: order.sku,
        amount: order.amount,
        discount: order.couponDiscount,
        /*
          Recorded against the customer Cashfree confirmed, not anything
          the browser claimed, so per_customer_limit counts real people.

          The account's email is preferred over the contact address for
          exactly one reason: create-order checks the limit against the
          account's email, and a limit checked against one address and
          counted against another is not a limit. The contact address is
          still the fallback, for orders placed before accounts existed
          and for a deploy running with LUME_REQUIRE_ACCOUNT=0.
        */
        customer: { phone: order.phone, email: order.accountEmail || order.email }
      });
    }catch(err){
      console.error("[lume fulfilment] coupon redemption failed:", String(err && err.message || err));
    }
  }

  // Tell the owner a booking has been paid for, once per order. This is
  // the trustworthy copy of the client's details — Cashfree has verified
  // the payment, and these fields come from Cashfree rather than from
  // anything the browser could have edited.
  try{
    if(await claimPaidNotification(order.orderId)){
      await notifyOwner({
        type: "payment",
        sku: order.sku,
        orderId: order.orderId,
        amount: order.amount,
        name: order.name,
        phone: order.phone,
        email: order.email,
        summary: "Payment confirmed for " + (order.sku || "a Lume Live service") +
          " (₹" + (order.amount != null ? order.amount : "?") + ")." +
          (order.couponCode ? " Coupon " + order.couponCode + " applied (₹" + order.couponDiscount + " off)." : "") +
          (order.sessionMode ? " Preferred mode: " + order.sessionMode + "." : "") +
          (BOOKING_SKUS.has(order.sku) ? " They now pick their own slot on the Google Calendar link." : ""),
        details: {
          cf_order_id: order.cfOrderId,
          currency: order.currency,
          session_mode: order.sessionMode,
          coupon_code: order.couponCode,
          coupon_discount: order.couponCode ? order.couponDiscount : "",
          picks_own_slot: BOOKING_SKUS.has(order.sku) ? "yes" : "no",
          note: order.note
        }
      });
      result.notified = true;
    }
  }catch(err){
    console.error("[lume fulfilment] owner notification failed:", String(err && err.message || err));
  }

  return result;
}

module.exports = { fulfillPaidOrder, readOrder, BOOKING_SKUS };
