/*
  POST /api/agent/webhook   inbound WhatsApp
  GET  /api/agent/webhook   the provider's subscription handshake

  Verified with WHATSAPP_VERIFY_TOKEN (handshake) and WHATSAPP_APP_SECRET
  (per-request HMAC). With the secret unset this route answers 404 — the
  same closed-by-default posture as the other agent routes, because an
  unauthenticated webhook is a stranger's direct line to a model that
  spends money and reads client data.

  The signature is checked BEFORE the body is parsed for meaning and
  before anything is written, so an unsigned request costs one HMAC and
  nothing else.

  Replies are sent back through the provider by the caller-supplied
  `send` (see sendReply); the handler answers 200 quickly either way,
  because a webhook that is slow to acknowledge gets retried and a
  retried message is a message answered twice.
*/

const crypto = require("crypto");
const { json, setCors } = require("../../http");
const { checkRateLimit, clientKey } = require("../../rateLimit");
const { handleInbound } = require("../../chatTurn");

const MAX_BODY_BYTES = 128 * 1024;

function readRaw(req){
  return new Promise((resolve, reject) => {
    let raw = "";
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if(size > MAX_BODY_BYTES){ req.destroy(); reject(new Error("too large")); return; }
      raw += chunk;
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

/*
  Meta sends `sha256=<hex>` over the raw body. Compared with
  timingSafeEqual over equal-length buffers; a length mismatch is a
  mismatch and is answered before the comparison.
*/
function signatureValid(raw, header, secret){
  const provided = String(header || "");
  const match = /^sha256=([a-f0-9]{64})$/i.exec(provided.trim());
  if(!match) return false;

  const expected = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const a = Buffer.from(match[1].toLowerCase(), "hex");
  const b = Buffer.from(expected, "hex");
  if(a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/*
  Pulls the messages out of a Meta Cloud API payload. Anything that is
  not a text message from a person — delivery receipts, read receipts,
  reactions, media — is ignored rather than guessed at.
*/
function extractMessages(body){
  const out = [];
  for(const entry of (body.entry || [])){
    for(const change of (entry.changes || [])){
      const value = (change && change.value) || {};
      for(const message of (value.messages || [])){
        if(!message || message.type !== "text") continue;
        out.push({
          id: String(message.id || ""),
          phone: String(message.from || ""),
          text: String((message.text && message.text.body) || "")
        });
      }
    }
  }
  return out;
}

async function sendReply({ phone, text }){
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const numberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if(!token || !numberId){
    console.error("[lume agent] no WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID — reply not sent to", phone);
    return false;
  }
  try{
    const res = await fetch("https://graph.facebook.com/v21.0/" + numberId + "/messages", {
      method: "POST",
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "text", text: { body: text } })
    });
    if(!res.ok) console.error("[lume agent] send failed:", res.status, await res.text().catch(() => ""));
    return res.ok;
  }catch(err){
    console.error("[lume agent] send threw:", err && err.message);
    return false;
  }
}

module.exports = async function handler(req, res){
  const secret = String(process.env.WHATSAPP_APP_SECRET || "");
  const verifyToken = String(process.env.WHATSAPP_VERIFY_TOKEN || "");

  if(!secret){
    return json(res, 404, { error: "Not found" });
  }

  setCors(req, res, "GET,POST,OPTIONS");
  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }

  // Subscription handshake.
  if(req.method === "GET"){
    const url = new URL(req.url, "http://localhost");
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if(mode === "subscribe" && verifyToken && token === verifyToken){
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain");
      return res.end(String(challenge || ""));
    }
    return json(res, 403, { error: "Forbidden" });
  }

  if(req.method !== "POST"){
    return json(res, 405, { error: "Method not allowed" });
  }

  let raw;
  try{ raw = await readRaw(req); }
  catch(err){ return json(res, 413, { error: "Request body too large." }); }

  if(!signatureValid(raw, req.headers["x-hub-signature-256"], secret)){
    return json(res, 401, { error: "Bad signature" });
  }

  // After the signature, so an attacker cannot spend anybody's budget.
  const allowed = await checkRateLimit({
    key: "agent-webhook:" + clientKey(req),
    limit: 600,
    windowMs: 10 * 60 * 1000
  });
  if(!allowed) return json(res, 200, { ok: true, throttled: true });

  let body;
  try{ body = raw ? JSON.parse(raw) : {}; }
  catch(err){ return json(res, 400, { error: "Invalid JSON body." }); }

  const messages = extractMessages(body);
  if(!messages.length) return json(res, 200, { ok: true, handled: 0 });

  let handled = 0;
  for(const message of messages){
    if(!message.phone || !message.text) continue;
    try{
      const result = await handleInbound({ phone: message.phone, text: message.text });
      if(result && result.reply) await sendReply({ phone: message.phone, text: result.reply });
      handled++;
    }catch(err){
      // Never 500 a webhook: the provider retries, and a retry re-runs a
      // conversation turn that may already have replied.
      console.error("[lume agent] inbound failed:", err && err.message);
    }
  }

  return json(res, 200, { ok: true, handled: handled });
};

module.exports.signatureValid = signatureValid;
module.exports.extractMessages = extractMessages;
