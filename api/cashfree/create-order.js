/*
  Deployable Cashfree create-order endpoint for Lume Live.

  Endpoint:
  /api/cashfree/create-order

  Required environment variables:
  CASHFREE_CLIENT_ID=...
  CASHFREE_CLIENT_SECRET=...
  CASHFREE_ENV=production or sandbox
  CASHFREE_API_VERSION=2025-01-01
  LUME_PUBLIC_BASE_URL=https://lumelive.co.in
*/

const crypto = require("crypto");
const { checkRateLimit, clientKey } = require("../_lib/rateLimit");
const { json, setCors, readBody } = require("../_lib/http");
const { getProduct } = require("../_lib/catalog");
const { quote } = require("../_lib/coupons");
const { requireAccount } = require("../_lib/account");

/*
  Before paying, the client chooses how they want the session to happen —
  video call, voice call, or chat. That choice is made on our page and then
  the browser leaves for Cashfree and comes back on a fresh page load, so
  the order itself is the only place it can survive the round trip. Tag it
  on here and order-status.js reads it back when the payment is confirmed.

  Normalised to a fixed set rather than stored verbatim: the value arrives
  from the browser, and nothing free-typed should land in the owner's Sheet.
  Video is tested first because "Video Call (Google Meet / Zoom)" would also
  match the voice pattern on the word "call".
*/
const SESSION_MODES = [
  { match: /video|meet|zoom/i, label: "Video call" },
  { match: /chat|whatsapp|text|message/i, label: "Chat (WhatsApp)" },
  { match: /voice|phone|call/i, label: "Voice call" }
];

function sessionModeOf(notes){
  const raw = notes && typeof notes === "object" ? String(notes.sessionMode || "") : "";
  if(!raw) return "";
  const hit = SESSION_MODES.find(function(m){ return m.match.test(raw); });
  return hit ? hit.label : "";
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

  const allowed = await checkRateLimit({
    key: "create-order:" + clientKey(req),
    limit: 8,
    windowMs: 10 * 60 * 1000
  });
  if(!allowed){
    return json(res, 429, { error: "Too many requests. Please wait a few minutes and try again, or pay by UPI." });
  }

  const clientId = process.env.CASHFREE_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
  if(!clientId || !clientSecret){
    return json(res, 500, { error: "Cashfree credentials are not configured." });
  }

  /*
    Who is buying. Checked before the body is even read: an order that
    belongs to nobody should not reach Cashfree, cost a rate-limit slot's
    worth of work, or burn a coupon's per-customer allowance.

    The page shows a sign-in screen before it gets here, so in normal use
    this never fires. It fires for a request that skipped the page.
  */
  const identity = await requireAccount(req);
  if(!identity.ok){
    return json(res, identity.status, { error: identity.error, code: identity.code });
  }
  const account = identity.account;

  let body;
  try{ body = await readBody(req); }
  catch(err){
    if(err && err.statusCode === 413){
      return json(res, 413, { error: "Request body too large." });
    }
    return json(res, 400, { error: "Invalid JSON body." });
  }

  const sku = String(body.sku || "");
  const product = getProduct(sku);
  if(!product){
    return json(res, 400, { error: "Unknown payment item." });
  }

  const customer = body.customer || {};
  const phone = String(customer.phone || "").replace(/\D/g, "").slice(-10);
  // The account's email is a better fallback than a Lume Live inbox
  // address: it came from the token, and it is where this person already
  // expects to hear from us.
  const accountEmail = account ? account.email : "";
  const email = String(customer.email || accountEmail || "hello@lumelive.co.in").slice(0, 120);
  const name = String(customer.name || (account && account.name) || "Lume Live Customer").slice(0, 80);
  // Only the handbook is bought without a phone number — everything else
  // is a session or a report we have to be able to deliver.
  if(!phone && sku !== "parents-handbook"){
    return json(res, 400, { error: "Customer phone is required." });
  }

  /*
    The price is decided here and nowhere else.

    body.amount exists in the payload the browser sends and is
    deliberately ignored: the charge is product.amount from the
    server-side catalogue, minus a discount this endpoint recalculates
    from the coupon code. /api/coupons/validate ran the same quote()
    a moment ago to draw the checkout screen, but its answer is not
    carried over — the client only gets to send a code, never a number.

    The customer goes in too, because per-person rules are the whole
    point of a "first session" offer and the validate call often could
    not evaluate them — it runs before the phone number has been typed.
    This is where "one per customer" is actually enforced, against the
    contact details we are about to charge.

    A code that has expired, been fully claimed, been switched off, or
    already been used by this person in the seconds between validating
    and paying loses its discount here. That is the safe way for the
    race to end; the alternative is honouring a dead offer.
  */
  const requestedCoupon = String(body.coupon_code || body.coupon || "").trim();
  const priced = await quote({
    code: requestedCoupon,
    packId: sku,
    /*
      The account's email counts as the customer's email here even when
      the form didn't ask for one. Before accounts, leaving the email
      blank was a way to look like a new person to a "one per customer"
      offer; now every order carries an identity, so that limit means
      what it says.
    */
    customer: { phone: phone, email: (body.customer && body.customer.email) ? email : accountEmail }
  });
  const couponApplied = priced.ok && priced.reason === "applied" && priced.coupon;

  // A code was asked for and refused. Stop here rather than creating a
  // full-price order at Cashfree the client never agreed to — they chose
  // this price with a discount on it. The page shows the reason and lets
  // them decide whether to pay full price or try another code.
  if(requestedCoupon && !couponApplied){
    return json(res, 409, {
      error: priced.message,
      coupon_rejected: { code: requestedCoupon, reason: priced.reason, message: priced.message },
      list_amount: product.amount
    });
  }

  const chargeAmount = couponApplied ? priced.final_amount : product.amount;
  const couponCode = couponApplied ? priced.coupon.code : "";

  const env = (process.env.CASHFREE_ENV || "production").toLowerCase();
  const base = env === "sandbox" ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg";
  const publicBase = process.env.LUME_PUBLIC_BASE_URL || "https://lumelive.co.in";
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const orderId = ("lume_" + product.alias + "_" + suffix).slice(0, 45);
  const requestId = crypto.randomUUID();
  const returnUrl = body.returnUrl || (publicBase + "/payment-return.html?order_id={order_id}");
  const sessionMode = sessionModeOf(body.notes);

  const cashfreePayload = {
    order_id: orderId,
    order_amount: chargeAmount,
    order_currency: "INR",
    order_note: couponCode ? product.label + " (" + couponCode + ")" : product.label,
    customer_details: {
      customer_id: phone || ("guest_" + Date.now()),
      customer_name: name,
      customer_email: email,
      customer_phone: phone || "9999999999"
    },
    order_meta: {
      return_url: returnUrl,
      notify_url: process.env.CASHFREE_NOTIFY_URL || undefined,
      payment_methods: "cc,dc,upi,nb,app,paylater"
    },
    // Cashfree returns order_tags verbatim on the status call, which is how
    // the coupon survives the redirect to the gateway and back. The tag is
    // written from the server's own verdict, so what order-status.js counts
    // as redeemed is what was actually discounted here. Values must be
    // strings.
    order_tags: Object.assign(
      { sku, source: "lume-live-website" },
      // Whose purchase this is, taken from the verified token and not
      // from the payload. order-status.js reads it back when Cashfree
      // confirms payment, so the entitlement is written against the
      // account rather than only against typed-in contact details.
      account ? { account_uid: account.uid } : {},
      account && account.email ? { account_email: account.email } : {},
      sessionMode ? { session_mode: sessionMode } : {},
      couponCode ? {
        coupon_code: couponCode,
        coupon_discount: String(priced.discount_amount),
        list_amount: String(product.amount)
      } : {}
    )
  };

  let response, data;
  try{
    const controller = new AbortController();
    const timer = setTimeout(function(){ controller.abort(); }, 12000);
    try{
      response = await fetch(base + "/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-id": clientId,
          "x-client-secret": clientSecret,
          "x-api-version": process.env.CASHFREE_API_VERSION || "2025-01-01",
          "x-request-id": requestId,
          "x-idempotency-key": requestId
        },
        body: JSON.stringify(cashfreePayload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  }catch(err){
    return json(res, 502, { error: "Could not reach the payment gateway. Please try again in a moment, or pay by UPI." });
  }

  data = await response.json().catch(() => ({}));
  if(!response.ok){
    return json(res, response.status, { error: "Cashfree order creation failed.", details: data });
  }

  return json(res, 200, {
    order_id: data.order_id,
    cf_order_id: data.cf_order_id,
    payment_session_id: data.payment_session_id || data.payment_sessions_id,
    // What was actually charged, so the modal can correct itself if its
    // own arithmetic ever disagrees. order_amount comes back from Cashfree
    // rather than from our own variable — it is the number the client is
    // about to be asked for.
    order_amount: data.order_amount,
    list_amount: product.amount,
    discount_amount: couponApplied ? priced.discount_amount : 0,
    coupon_code: couponCode
  });
};
