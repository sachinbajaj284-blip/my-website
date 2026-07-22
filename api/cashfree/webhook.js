/*
  Cashfree webhook receiver for Lume Live.

  Endpoint:
  POST /api/cashfree/webhook

  This is the AUTHORITATIVE, server-to-server record of a completed
  payment. When Cashfree confirms a session payment, we store the
  customer's phone so the next booking is priced as a returning session
  (₹499) rather than the ₹49 first-session offer.

  Configure in the Cashfree dashboard:
    Webhooks -> add  https://lumelive.co.in/api/cashfree/webhook
    subscribe to the "Payment Success" event.

  Signature is verified with your CASHFREE_CLIENT_SECRET:
    base64( HMAC-SHA256( `${timestamp}${rawBody}`, clientSecret ) )

  Required environment variables:
    CASHFREE_CLIENT_SECRET   (used to verify the webhook signature)
  Optional:
    CASHFREE_WEBHOOK_SECRET  (if you set a distinct webhook secret, it is
                              tried first, then CASHFREE_CLIENT_SECRET)
*/

const crypto = require("crypto");
const { recordPaidSession, isSessionSku } = require("./_sessions");

function json(res, status, body){
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body || {}));
}

const MAX_BODY_BYTES = 64 * 1024;

function readRawBody(req){
  return new Promise((resolve, reject) => {
    let raw = "";
    let size = 0;
    let aborted = false;
    req.on("data", chunk => {
      if(aborted) return;
      size += chunk.length;
      if(size > MAX_BODY_BYTES){
        aborted = true;
        const err = new Error("Request body too large.");
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on("end", () => { if(!aborted){ resolve(raw); } });
    req.on("error", reject);
  });
}

function computeSignature(secret, timestamp, rawBody){
  return crypto.createHmac("sha256", secret).update(timestamp + rawBody).digest("base64");
}

function safeEqual(a, b){
  const ba = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if(ba.length !== bb.length){ return false; }
  try{ return crypto.timingSafeEqual(ba, bb); }
  catch(err){ return false; }
}

module.exports = async function handler(req, res){
  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }
  if(req.method !== "POST"){
    return json(res, 405, { error: "Method not allowed" });
  }

  const signature = req.headers["x-webhook-signature"] || "";
  const timestamp = req.headers["x-webhook-timestamp"] || "";
  if(!signature || !timestamp){
    return json(res, 400, { error: "Missing webhook signature headers." });
  }

  let rawBody;
  try{ rawBody = await readRawBody(req); }
  catch(err){
    const code = err && err.statusCode === 413 ? 413 : 400;
    return json(res, code, { error: "Could not read webhook body." });
  }

  const secrets = [process.env.CASHFREE_WEBHOOK_SECRET, process.env.CASHFREE_CLIENT_SECRET].filter(Boolean);
  if(!secrets.length){
    // Cannot verify authenticity — refuse rather than trust an unsigned event.
    return json(res, 500, { error: "Webhook secret is not configured." });
  }
  const verified = secrets.some(function(secret){
    return safeEqual(signature, computeSignature(secret, timestamp, rawBody));
  });
  if(!verified){
    return json(res, 401, { error: "Invalid webhook signature." });
  }

  let payload;
  try{ payload = rawBody ? JSON.parse(rawBody) : {}; }
  catch(err){ return json(res, 400, { error: "Invalid JSON payload." }); }

  // Acknowledge quickly; only act on successful payments for session SKUs.
  try{
    const type = String(payload.type || "");
    const data = payload.data || {};
    const order = data.order || {};
    const paymentStatus = String((data.payment && data.payment.payment_status) || "").toUpperCase();
    const isSuccess = /PAYMENT_SUCCESS/.test(type) || paymentStatus === "SUCCESS";

    const sku = (order.order_tags && order.order_tags.sku) ? order.order_tags.sku : "";
    const phone = (data.customer_details && data.customer_details.customer_phone) ? data.customer_details.customer_phone : "";

    if(isSuccess && isSessionSku(sku) && phone){
      await recordPaidSession(phone, {
        sku: sku,
        orderId: order.order_id,
        amount: order.order_amount
      });
    }
  }catch(err){
    // Never fail the webhook on a recording error — Cashfree would retry and
    // we have already verified the signature. Log and acknowledge.
    console.warn("[cashfree webhook] processing error:", err && err.message);
  }

  return json(res, 200, { received: true });
};
