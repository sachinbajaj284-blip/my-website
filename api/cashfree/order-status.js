/*
  Deployable Cashfree order-status endpoint for Lume Live.

  Endpoint:
  /api/cashfree/order-status?order_id=...

  Required environment variables:
  CASHFREE_CLIENT_ID=...
  CASHFREE_CLIENT_SECRET=...
  CASHFREE_ENV=production or sandbox
  CASHFREE_API_VERSION=2025-01-01
*/

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

  return json(res, 200, {
    order_id: data.order_id,
    cf_order_id: data.cf_order_id,
    order_status: data.order_status,
    order_amount: data.order_amount,
    order_currency: data.order_currency,
    sku: data.order_tags && data.order_tags.sku ? data.order_tags.sku : "",
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
