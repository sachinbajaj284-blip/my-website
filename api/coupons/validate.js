/*
  POST /api/coupons/validate

  Request:
    { "code": "FIRST50", "pack_id": "wellness-session" }
    (`sku` is accepted as an alias for `pack_id`.)

  Response 200 — valid:
    {
      "valid": true,
      "reason": "applied",
      "message": "50% off applied — you save ₹250.",
      "sku": "wellness-session",
      "label": "Emotional Wellness Session",
      "base_amount": 499,
      "discount_amount": 250,
      "final_amount": 249,
      "currency": "INR",
      "coupon": { "code": "FIRST50", "discount_type": "percentage", "discount_value": 50, ... }
    }

  Response 200 — rejected (a wrong code is not a failed request):
    {
      "valid": false,
      "reason": "expired",
      "message": "This code has expired.",
      "sku": "wellness-session",
      "base_amount": 499,
      "discount_amount": 0,
      "final_amount": 499
    }

  Rejections come back 200 with valid:false rather than 4xx so the widget
  has one success path to render from, and so a mistyped code doesn't
  show up as an error in monitoring. Genuine faults (bad method, bad
  JSON, rate limit) still use their proper status codes.

  This endpoint is for DISPLAY ONLY. Nothing here decides what a client
  is charged — create-order.js re-runs the same quote() before it asks
  Cashfree for a rupee.
*/

const { json, setCors, readBody } = require("../_lib/http");
const { checkRateLimit, clientKey } = require("../_lib/rateLimit");
const { quote } = require("../_lib/coupons");

module.exports = async function handler(req, res){
  setCors(req, res, "POST,OPTIONS");

  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }

  if(req.method !== "POST"){
    return json(res, 405, { error: "Method not allowed" });
  }

  // Tighter than checkout's budget: this is the endpoint someone would
  // point a script at to discover which codes exist. 20 tries per 10
  // minutes is generous for a client fixing a typo and useless for
  // enumerating a code space.
  const allowed = await checkRateLimit({
    key: "coupon-validate:" + clientKey(req),
    limit: 20,
    windowMs: 10 * 60 * 1000
  });
  if(!allowed){
    return json(res, 429, {
      valid: false,
      reason: "rate_limited",
      message: "Too many attempts. Please wait a few minutes and try again."
    });
  }

  let body;
  try{ body = await readBody(req); }
  catch(err){
    if(err && err.statusCode === 413){
      return json(res, 413, { error: "Request body too large." });
    }
    return json(res, 400, { error: "Invalid JSON body." });
  }

  const code = body.code;
  const packId = String(body.pack_id || body.sku || "");

  if(!String(code || "").trim()){
    return json(res, 200, {
      valid: false,
      reason: "empty",
      message: "Please enter a coupon code."
    });
  }

  const result = await quote({ code: code, packId: packId });

  return json(res, 200, {
    valid: result.ok && result.reason === "applied",
    reason: result.reason,
    message: result.message,
    sku: result.sku,
    label: result.label || "",
    base_amount: result.base_amount,
    discount_amount: result.discount_amount,
    final_amount: result.final_amount,
    currency: "INR",
    coupon: result.coupon
  });
};
