/*
  Lume Live — lead capture endpoint.

  Endpoint:
  POST /api/lead
  Body (JSON): { "email": "you@example.com", "source": "stream-checklist", "name": "optional" }

  Turns the free lead-magnet email capture into a list you actually own —
  no page code changes needed to point it at your storage of choice.

  Optional environment variables (set in Vercel → Project → Settings → Environment):
  LEAD_WEBHOOK_URL   A webhook that receives each lead as JSON. Point this at a
                     Google Apps Script Web App, Zapier/Make catch hook, a
                     Google Form, Airtable automation, or your own store.
                     If unset, the endpoint still returns success (so the
                     visitor experience never breaks) and simply logs the lead.
  LUME_ALLOWED_ORIGINS  Extra comma-separated origins allowed to call this API.
*/

const DEFAULT_ALLOWED_ORIGINS = [
  "https://lumelive.co.in",
  "https://www.lumelive.co.in",
  "http://127.0.0.1:8765",
  "http://localhost:8765"
];

function allowedOrigins(){
  return new Set(DEFAULT_ALLOWED_ORIGINS.concat(
    String(process.env.LUME_ALLOWED_ORIGINS || "")
      .split(",").map(function(o){ return o.trim(); }).filter(Boolean)
  ));
}

function json(res, status, body){
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function applyCors(req, res){
  var origin = req.headers.origin;
  if (origin && allowedOrigins().has(origin)){
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readBody(req){
  return new Promise(function(resolve){
    if (req.body && typeof req.body === "object") return resolve(req.body);
    var raw = "";
    req.on("data", function(c){ raw += c; if (raw.length > 1e5) req.destroy(); });
    req.on("end", function(){ try { resolve(raw ? JSON.parse(raw) : {}); } catch(e){ resolve({}); } });
    req.on("error", function(){ resolve({}); });
  });
}

var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

var rateLimit = require("./_lib/rateLimit");

module.exports = async function handler(req, res){
  applyCors(req, res);
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method !== "POST") return json(res, 405, { ok:false, error:"Method not allowed" });

  var allowed = await rateLimit.checkRateLimit({
    key: "lead:" + rateLimit.clientKey(req),
    limit: 10,
    windowMs: 10 * 60 * 1000
  });
  if (!allowed){
    return json(res, 429, { ok:false, error:"Too many requests. Please try again in a few minutes." });
  }

  var body = await readBody(req);
  var email = String(body.email || "").trim().toLowerCase();
  var source = String(body.source || "unknown").slice(0, 80);
  var name = String(body.name || "").trim().slice(0, 120);

  if (!EMAIL_RE.test(email) || email.length > 254){
    return json(res, 400, { ok:false, error:"A valid email is required" });
  }

  var lead = {
    email: email,
    name: name || null,
    source: source,
    ts: new Date().toISOString(),
    ua: String(req.headers["user-agent"] || "").slice(0, 300),
    ref: String(req.headers["referer"] || "").slice(0, 300)
  };

  var webhook = process.env.LEAD_WEBHOOK_URL;
  if (webhook){
    try {
      var ctrl = new AbortController();
      var t = setTimeout(function(){ ctrl.abort(); }, 5000);
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead),
        signal: ctrl.signal
      });
      clearTimeout(t);
      return json(res, 200, { ok:true, stored:true });
    } catch (err){
      // Never fail the visitor's download because storage hiccuped.
      console.error("[lume lead] webhook error:", String(err && err.message || err), lead.email);
      return json(res, 200, { ok:true, stored:false });
    }
  }

  // No webhook configured yet — log so the lead isn't lost, and succeed.
  console.log("[lume lead]", JSON.stringify(lead));
  return json(res, 200, { ok:true, stored:false });
};
