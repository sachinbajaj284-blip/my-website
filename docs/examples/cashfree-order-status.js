/*
  Cashfree order-status backend example for Lume Live.

  Deploy this logic as a server endpoint:
  /api/cashfree/order-status?order_id=...

  The browser must never call Cashfree directly with your secret key. This endpoint
  checks the Cashfree order from your backend and returns only the safe status data
  needed by payment-return.html.

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

function getOrderId(req){
  try{
    const url = new URL(req.url, "https://lumelive.co.in");
    return String(url.searchParams.get("order_id") || "").trim();
  }catch(err){
    return "";
  }
}

module.exports = async function handler(req, res){
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
  const response = await fetch(base + "/orders/" + encodeURIComponent(orderId), {
    method: "GET",
    headers: {
      "x-client-id": clientId,
      "x-client-secret": clientSecret,
      "x-api-version": process.env.CASHFREE_API_VERSION || "2025-01-01"
    }
  });

  const data = await response.json().catch(() => ({}));
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
    customer: {
      name: data.customer_details && data.customer_details.customer_name ? data.customer_details.customer_name : "",
      phone: data.customer_details && data.customer_details.customer_phone ? data.customer_details.customer_phone : "",
      email: data.customer_details && data.customer_details.customer_email ? data.customer_details.customer_email : ""
    }
  });
};
