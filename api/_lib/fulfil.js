/*
  What happens when money has actually arrived.

  Three things have to follow a confirmed payment: the entitlement is
  written (that record is the only proof the customer ever paid), the
  coupon is counted, and the owner is told. Until now all three lived
  inside order-status.js, which only ever runs if the customer's browser
  comes back from the gateway and keeps polling.

  It very often doesn't. A UPI app that doesn't hand control back, a tab
  closed on the receipt screen, a phone that drops to a lock screen mid
  redirect — in every one of those the payment succeeds at Cashfree and
  nothing at all is recorded here. The customer has no access, restore
  -access has nothing to find because it reads the same records this
  writes, and the owner never learns there was a sale.

  So fulfilment moved here, and the webhook calls it too. Cashfree
  retries a webhook until it is acknowledged, which makes it the reliable
  path and the browser poll merely the fast one. Both are safe to run:
  every step below is idempotent per order, so whichever arrives first
  does the work and the other is a no-op.
*/

const { recordPaidEntitlement, claimPaidNotification } = require("./entitlements");
const { recordRedemption } = require("./coupons");
const { notifyOwner } = require("./notify");

// SKUs where the client books their own slot on the Google Calendar page,
// so the owner knows not to chase them for a date and time.
// intro-session is retired and can no longer be bought, but orders placed
// while it was on sale are still resolved here and must still work.
const BOOKING_SKUS = new Set([
  "intro-session", "wellness-session", "career-direction-session",
  "stream-clarity-session", "industry-expert-session"
]);

function tag(order, name){
  return order && order.order_tags && order.order_tags[name] != null
    ? order.order_tags[name]
    : "";
}

/*
  Pulls the fields worth trusting out of a Cashfree order.

  Everything here comes from the gateway's own copy of the order: the
  tags were written server-side by create-order.js, and the customer
  details are the ones Cashfree verified. Nothing the browser sent is
  read.
*/
function describeOrder(order){
  const customer = (order && order.customer_details) || {};
  return {
    orderId: order && order.order_id,
    cfOrderId: order && order.cf_order_id,
    sku: String(tag(order, "sku") || ""),
    sessionMode: String(tag(order, "session_mode") || "").slice(0, 40),
    couponCode: String(tag(order, "coupon_code") || "").slice(0, 32),
    couponDiscount: Number(tag(order, "coupon_discount")) || 0,
    accountUid: tag(order, "account_uid") ? String(tag(order, "account_uid")) : "",
    amount: order && order.order_amount,
    currency: (order && order.order_currency) || "INR",
    name: customer.customer_name || "",
    phone: customer.customer_phone || "",
    email: customer.customer_email || "",
    note: (order && order.order_note) || ""
  };
}

/*
  Runs the three fulfilment steps for a PAID order.

  `source` is "poll" or "webhook" and only ever reaches the logs — it is
  how you tell, after the fact, whether customers are being served by the
  redirect coming back or by Cashfree's retry.

  Never throws. A caller is either a customer's receipt screen or a
  webhook acknowledgement, and neither should fail because a
  notification webhook had a bad day. Returns a small report instead.
*/
async function fulfilPaidOrder(order, source){
  const info = describeOrder(order);
  const report = { orderId: info.orderId, sku: info.sku, entitlement: false, coupon: false, notified: false };

  if(!info.orderId) return report;

  if(!info.sku){
    // Every order create-order.js creates is tagged with a sku, so this
    // should only happen for a legacy or manually-created order. Surfaced
    // as a warning rather than dropped silently, because it means no
    // entitlement record gets written — that order will never show up in
    // restore-access, and it won't unlock anything either.
    console.warn("[lume fulfil] PAID order with no order_tags.sku — no entitlement recorded:", info.orderId);
    return report;
  }

  // The durable, server-side purchase record. This is the source of
  // truth for "who paid for what".
  try{
    await recordPaidEntitlement({
      orderId: info.orderId,
      sku: info.sku,
      amount: info.amount,
      currency: info.currency,
      phone: info.phone,
      email: info.email,
      name: info.name,
      // The account that paid, stamped onto the order by create-order.js
      // from a verified sign-in. Contact details can be typed wrong or
      // changed later; this doesn't.
      uid: info.accountUid
    });
    report.entitlement = true;
  }catch(err){
    console.error("[lume fulfil] entitlement write failed (" + source + "):", String(err && err.message || err));
  }

  // Count the coupon now, and only now — the money has arrived. Counting
  // at validate-time would let anyone burn a limited offer by typing the
  // code, and counting at order-creation would burn it on every abandoned
  // checkout. recordRedemption is idempotent per order id, which matters
  // because the poll and the webhook both land here.
  if(info.couponCode){
    try{
      await recordRedemption({
        code: info.couponCode,
        orderId: info.orderId,
        sku: info.sku,
        amount: info.amount,
        discount: info.couponDiscount,
        // Recorded against the customer Cashfree confirmed, not anything
        // the browser claimed, so per_customer_limit counts real people.
        customer: { phone: info.phone, email: info.email }
      });
      report.coupon = true;
    }catch(err){
      console.error("[lume fulfil] coupon redemption failed (" + source + "):", String(err && err.message || err));
    }
  }

  // Tell the owner a booking has been paid for, once per order.
  try{
    if(await claimPaidNotification(info.orderId)){
      await notifyOwner({
        type: "payment",
        sku: info.sku,
        orderId: info.orderId,
        amount: info.amount,
        name: info.name,
        phone: info.phone,
        email: info.email,
        summary: "Payment confirmed for " + (info.sku || "a Lume Live service") +
          " (₹" + (info.amount != null ? info.amount : "?") + ")." +
          (info.couponCode ? " Coupon " + info.couponCode + " applied (₹" + info.couponDiscount + " off)." : "") +
          (info.sessionMode ? " Preferred mode: " + info.sessionMode + "." : "") +
          (BOOKING_SKUS.has(info.sku) ? " They now pick their own slot on the Google Calendar link." : ""),
        details: {
          cf_order_id: info.cfOrderId,
          currency: info.currency,
          session_mode: info.sessionMode,
          coupon_code: info.couponCode,
          coupon_discount: info.couponCode ? info.couponDiscount : "",
          picks_own_slot: BOOKING_SKUS.has(info.sku) ? "yes" : "no",
          confirmed_via: source === "webhook" ? "Cashfree webhook" : "return to site",
          note: info.note
        }
      });
      report.notified = true;
    }
  }catch(err){
    console.error("[lume fulfil] owner notification failed (" + source + "):", String(err && err.message || err));
  }

  return report;
}

module.exports = { fulfilPaidOrder, describeOrder, BOOKING_SKUS };
