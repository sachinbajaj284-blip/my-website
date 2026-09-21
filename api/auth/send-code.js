/*
  POST /api/auth/send-code   { email }

  Emails a six-digit sign-in code. Always answers the same way whether
  or not that address has an account — see api/_lib/emailCodes.js for
  why that matters — so the only things that change the reply are a rate
  limit, a malformed address, and our own inability to send.

  Rate limits, both fail-open (a broken limiter must not break sign-in):

    per address   5 an hour   — stops one inbox being used as a mailbomb
    per IP       15 an hour   — stops one machine walking a list of them

  The address limit is keyed on a hash, so the limiter's own collection
  is not a list of everyone who has tried to sign in.
*/

const crypto = require("crypto");
const { json, setCors, readBody } = require("../_lib/http");
const { checkRateLimit, clientKey } = require("../_lib/rateLimit");
const { issueCode, normalizeEmail, looksLikeEmail, RESEND_COOLDOWN_MS } = require("../_lib/emailCodes");
const { sendEmail, codeEmail } = require("../_lib/sendEmail");

const HOUR_MS = 60 * 60 * 1000;

function addrLimitKey(email){
  return "authcode:addr:" + crypto.createHash("sha256").update(normalizeEmail(email)).digest("hex").slice(0, 32);
}

module.exports = async (req, res) => {
  setCors(req, res, "POST,OPTIONS");
  if(req.method === "OPTIONS"){ res.statusCode = 204; return res.end(); }
  if(req.method !== "POST"){ return json(res, 405, { ok:false, error:"Method not allowed." }); }

  let body;
  try{ body = await readBody(req); }
  catch(err){
    if(err && err.statusCode === 413){ return json(res, 413, { ok:false, error:"Request body too large." }); }
    return json(res, 400, { ok:false, error:"Invalid JSON body." });
  }

  const email = normalizeEmail(body && body.email);
  if(!looksLikeEmail(email)){
    return json(res, 400, { ok:false, code:"BAD_EMAIL", error:"Please enter a valid email address." });
  }

  const withinIp = await checkRateLimit({ key: "authcode:ip:" + clientKey(req), limit: 15, windowMs: HOUR_MS });
  const withinAddr = await checkRateLimit({ key: addrLimitKey(email), limit: 5, windowMs: HOUR_MS });
  if(!withinIp || !withinAddr){
    return json(res, 429, {
      ok:false, code:"RATE_LIMITED",
      error:"That's a lot of codes. Please wait a little while, then try again — or message us on WhatsApp and we'll sign you in."
    });
  }

  let issued;
  try{
    issued = await issueCode(email);
  }catch(err){
    console.error("[lume auth] could not issue a sign-in code:", String(err && err.message || err));
    return json(res, 503, {
      ok:false, code:"UNAVAILABLE",
      error:"We can't send a code right now. Please try again in a few minutes, or message us on WhatsApp."
    });
  }

  if(!issued.ok && issued.code === "TOO_SOON"){
    // Not an error: the previous code is still good, and saying so beats
    // sending a second email that makes the first one wrong.
    return json(res, 200, {
      ok:true, resent:false,
      retryInMs: issued.retryInMs != null ? issued.retryInMs : RESEND_COOLDOWN_MS,
      message:"We've already sent you a code. Check your inbox — and your Spam folder."
    });
  }

  const mail = codeEmail(issued.code);
  const sent = await sendEmail({ to: email, subject: mail.subject, text: mail.text });
  if(!sent.ok){
    // Honest failure. Telling someone to check an inbox for an email
    // that was never sent is the cruellest possible version of this.
    return json(res, 502, {
      ok:false, code:"SEND_FAILED",
      error:"We couldn't send the email just now. Please try again in a minute, or message us on WhatsApp."
    });
  }

  return json(res, 200, { ok:true, resent:true });
};
