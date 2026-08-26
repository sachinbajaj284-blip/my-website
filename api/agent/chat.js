/*
  POST /api/agent/chat

  The same turn the WhatsApp webhook runs, reachable directly so the
  agent can be exercised without a phone: the safety gate, the budget,
  the lock and the tool loop all behave identically.

  Armed by AGENT_ADMIN_TOKEN. This is NOT a public chat endpoint — it
  takes a phone number as a parameter, and a public route that lets a
  caller name whose conversation to continue would hand any thread to
  anybody. The webhook is the public door, and it proves the number with
  an HMAC.

    curl -X POST .../api/agent/chat -H "Authorization: Bearer $AGENT_ADMIN_TOKEN" \
      -d '{"phone":"919812345678","text":"what does a CA earn?"}'

  Also exposes the two things a counsellor needs while watching a thread:

    { "action":"read",   "phone":"..." }   the transcript and risk flags
    { "action":"unlock", "phone":"...", "by":"Name" }   take the lock off
*/

const { json, setCors, readBody } = require("../_lib/http");
const { checkRateLimit, clientKey } = require("../_lib/rateLimit");
const { checkAdminToken } = require("../_lib/adminAuth");
const { handleInbound } = require("../_lib/chatTurn");
const conversations = require("../_lib/conversations");

module.exports = async function handler(req, res){
  const gate = checkAdminToken(req, "AGENT_ADMIN_TOKEN", "agent");
  if(!gate.ok) return json(res, gate.status, gate.body);

  setCors(req, res, "POST,OPTIONS");
  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }
  if(req.method !== "POST"){
    return json(res, 405, { ok:false, error:"Method not allowed" });
  }

  const allowed = await checkRateLimit({
    key: "agent-chat:" + clientKey(req),
    limit: 300,
    windowMs: 60 * 60 * 1000
  });
  if(!allowed) return json(res, 429, { ok:false, error:"Too many requests. Please wait." });

  let body;
  try{ body = await readBody(req); }
  catch(err){ return json(res, 400, { ok:false, error:"Invalid JSON body." }); }

  const phone = String(body.phone || "").trim();
  if(!phone) return json(res, 400, { ok:false, error:"A phone number is required." });

  try{
    if(body.action === "read"){
      const thread = await conversations.getThread(phone);
      return json(res, 200, { ok:true,
        thread_id: thread.threadId,
        human_locked: Boolean(thread.humanLocked),
        lock_reason: thread.lockReason || null,
        messages_today: conversations.messagesToday(thread),
        risk_flags: thread.riskFlags || [],
        turns: thread.turns || [] });
    }

    if(body.action === "unlock"){
      const by = String(body.by || "").trim();
      if(!by) return json(res, 400, { ok:false, error:"Who is unlocking it? A name is required." });
      const thread = await conversations.getThread(phone);
      conversations.unlockThread(thread, by);
      await conversations.saveThread(thread);
      return json(res, 200, { ok:true, unlocked:true, by:by });
    }

    const text = String(body.text || "").trim();
    if(!text) return json(res, 400, { ok:false, error:"A message is required." });

    const result = await handleInbound({ phone: phone, text: text });
    return json(res, 200, Object.assign({ ok:true }, result));
  }catch(err){
    console.error("[lume agent] chat failed:", err && err.message);
    return json(res, 503, { ok:false, error:"That turn could not be completed." });
  }
};
