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

const SKU_PRICES = {
  "student-full-report": { amount: 999, label: "Lume Live Full Clarity Report", alias: "student999" },
  "lume-lens-working-profile": { amount: 1999, label: "Lume Lens Working Profile", alias: "lens1999" },
  "intro-session": { amount: 49, label: "Introductory Guidance Session", alias: "intro49" },
  "parents-handbook": { amount: 199, label: "Parents Career Handbook", alias: "parents199" },
  "career-intelligence-roadmap": { amount: 1499, label: "Career Intelligence Detailed Roadmap", alias: "roadmap1499" },
  "stream-clarity-session": { amount: 999, label: "Stream Clarity Counselling Session", alias: "stream999" },
  "career-direction-session": { amount: 1499, label: "Career Direction Counselling Session", alias: "careerdir1499" },
  // Internship tracks are sold in supervised hours. The SKU keys are kept as-is
  // so orders placed before the hours-based relaunch still resolve.
  "internship-1-month": { amount: 3499, label: "Practitioner Foundations (60 supervised hours)", alias: "intern60h3499" },
  "internship-2-month": { amount: 5999, label: "Advanced Fellowship (120 supervised hours)", alias: "intern120h5999" },
  "internship-240-hour": { amount: 11999, label: "University Credit Track (240 supervised hours)", alias: "intern240h11999" },
  "internship-lume-lens": { amount: 500, label: "Lume Lens Report (Intern Add-On)", alias: "internlens500" }
};

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
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const MAX_BODY_BYTES = 16 * 1024; // 16 KB is far more than a checkout payload needs

function readBody(req){
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
    req.on("end", () => {
      if(aborted) return;
      try{ resolve(raw ? JSON.parse(raw) : {}); }
      catch(err){ reject(err); }
    });
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res){
  setCors(req, res);

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

  let body;
  try{ body = await readBody(req); }
  catch(err){
    if(err && err.statusCode === 413){
      return json(res, 413, { error: "Request body too large." });
    }
    return json(res, 400, { error: "Invalid JSON body." });
  }

  const sku = String(body.sku || "");
  const product = SKU_PRICES[sku];
  if(!product){
    return json(res, 400, { error: "Unknown payment item." });
  }

  const customer = body.customer || {};
  const phone = String(customer.phone || "").replace(/\D/g, "").slice(-10);
  const email = String(customer.email || "hello@lumelive.co.in").slice(0, 120);
  const name = String(customer.name || "Lume Live Customer").slice(0, 80);
  if(!phone && sku !== "parents-handbook" && sku !== "intro-session"){
    return json(res, 400, { error: "Customer phone is required." });
  }

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
    order_amount: product.amount,
    order_currency: "INR",
    order_note: product.label,
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
    order_tags: Object.assign(
      { sku, source: "lume-live-website" },
      sessionMode ? { session_mode: sessionMode } : {}
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
    payment_session_id: data.payment_session_id || data.payment_sessions_id
  });
};
