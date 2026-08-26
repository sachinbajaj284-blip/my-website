/*
  POST /api/agent/link-code

  Mints the six-character code a client sends to the WhatsApp agent to
  link that number to their account.

  Requires a signed-in account — a verified Firebase ID token, the same
  gate as /api/assessment/save. That is the whole point: the code is
  proof that whoever holds this WhatsApp number also, at some moment,
  controlled a signed-in session on this account.

  Without this step, an agent that reads saved assessments from whoever
  messages it would reopen the hole restore-access.js deliberately
  closed. A phone number is not a secret; a signed-in session is.

  Response 200:
    { "ok": true, "code": "K7M4XQ", "expires_in_minutes": 15,
      "whatsapp": "https://wa.me/917015671280?text=LINK%20K7M4XQ" }
*/

const { json, setCors, readBody } = require("../_lib/http");
const { checkRateLimit, clientKey } = require("../_lib/rateLimit");
const { requireAccount } = require("../_lib/account");
const { createLinkCode, unlinkAccount } = require("../_lib/conversations");

const WA_NUMBER = "917015671280";

module.exports = async function handler(req, res){
  setCors(req, res, "POST,OPTIONS");
  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }
  if(req.method !== "POST"){
    return json(res, 405, { ok:false, error:"Method not allowed" });
  }

  const notFlooding = await checkRateLimit({
    key: "agent-link-ip:" + clientKey(req),
    limit: 300,
    windowMs: 10 * 60 * 1000
  });
  if(!notFlooding) return json(res, 429, { ok:false, error:"Too many attempts from this network." });

  const account = await requireAccount(req);
  if(!account.ok) return json(res, account.status, { ok:false, code:account.code, error:account.error });
  if(!account.account){
    return json(res, 503, { ok:false, code:"ACCOUNT_CHECK_DISABLED",
      error:"We can't verify your sign-in right now, so we can't link WhatsApp." });
  }

  const withinBudget = await checkRateLimit({
    key: "agent-link-uid:" + account.account.uid,
    limit: 10,
    windowMs: 60 * 60 * 1000
  });
  if(!withinBudget) return json(res, 429, { ok:false, error:"Too many linking codes. Please wait a while." });

  let body;
  try{ body = await readBody(req); }
  catch(err){ return json(res, 400, { ok:false, error:"Invalid JSON body." }); }

  try{
    // Unlinking is here rather than on its own route because it is the
    // same decision viewed from the other side, and a client who wants
    // out should not have to find a second page.
    if(body.action === "unlink"){
      const phone = String(body.phone || "").trim();
      if(!phone) return json(res, 400, { ok:false, error:"Which number should we unlink?" });
      await unlinkAccount(phone);
      return json(res, 200, { ok:true, unlinked:true });
    }

    const { code, expiresInMinutes } = await createLinkCode(account.account.uid);
    return json(res, 200, {
      ok: true,
      code: code,
      expires_in_minutes: expiresInMinutes,
      whatsapp: "https://wa.me/" + WA_NUMBER + "?text=" + encodeURIComponent("LINK " + code)
    });
  }catch(err){
    console.error("[lume agent] link code failed:", err && err.message);
    return json(res, 503, { ok:false, error:"Couldn't create a linking code just now." });
  }
};
