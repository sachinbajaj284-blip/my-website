/*
  Lume Live — client submission capture.

  Endpoint:
  POST /api/submit
  Body (JSON): { type, name, phone, email, summary, details, page }

  Every enquiry form on the site builds a WhatsApp message and opens it on
  the *client's* phone. If they never press send in WhatsApp — and plenty
  don't — everything they just typed is lost. This endpoint mirrors that
  same information to the owner's webhook at the moment the button is
  tapped, so no enquiry depends on the client completing a second step in
  another app.

  It is deliberately forgiving: it always answers 200 so a capture problem
  can never block someone from reaching us. Validation exists to keep
  junk out of the Sheet, not to reject visitors.

  Note this endpoint is public by necessity (it is called before anyone
  identifies themselves), so it is rate limited per client and every field
  is length-capped in notify.js before forwarding.
*/

const rateLimit = require("./_lib/rateLimit");
const { notifyOwner } = require("./_lib/notify");

const DEFAULT_ALLOWED_ORIGINS = [
  "https://lumelive.co.in",
  "https://www.lumelive.co.in",
  "http://127.0.0.1:8765",
  "http://localhost:8765"
];

function allowedOrigins(){
  return new Set(DEFAULT_ALLOWED_ORIGINS.concat(
    String(process.env.LUME_ALLOWED_ORIGINS || "")
      .split(",").map(o => o.trim()).filter(Boolean)
  ));
}

function json(res, status, body){
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function applyCors(req, res){
  const origin = req.headers.origin;
  if(origin && allowedOrigins().has(origin)){
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readBody(req){
  return new Promise(resolve => {
    if(req.body && typeof req.body === "object") return resolve(req.body);
    let raw = "";
    req.on("data", c => { raw += c; if(raw.length > 20000) req.destroy(); });
    req.on("end", () => { try{ resolve(raw ? JSON.parse(raw) : {}); }catch(e){ resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

module.exports = async function handler(req, res){
  applyCors(req, res);
  if(req.method === "OPTIONS") return json(res, 204, {});
  if(req.method !== "POST") return json(res, 405, { ok:false, error:"Method not allowed" });

  const allowed = await rateLimit.checkRateLimit({
    key: "submit:" + rateLimit.clientKey(req),
    limit: 20,
    windowMs: 10 * 60 * 1000
  });
  // Answer 200 even when throttled: a client hitting the limit is far more
  // likely to be someone re-tapping a button than an attacker, and they
  // should still get through to WhatsApp.
  if(!allowed) return json(res, 200, { ok:true, captured:false });

  const body = await readBody(req);

  // Require *something* identifying, or it is noise not an enquiry.
  const hasContent = ["name", "phone", "email", "summary"].some(k => String(body[k] || "").trim());
  if(!hasContent) return json(res, 200, { ok:true, captured:false });

  const result = await notifyOwner({
    type: body.type || "form",
    name: body.name,
    phone: body.phone,
    email: body.email,
    summary: body.summary,
    sku: body.sku,
    amount: body.amount,
    orderId: body.orderId,
    page: body.page || req.headers["referer"] || "",
    details: body.details
  });

  return json(res, 200, { ok:true, captured: result.delivered });
};
