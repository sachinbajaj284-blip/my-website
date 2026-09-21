/*
  POST /api/referrals/claim       — signed in
  { "ref": "AARAV7K2", "event": "snapshot" }

  "I arrived on someone's link and I have just finished the Snapshot."

  The browser is reporting two things it knows and we do not: which code
  it was carrying, and that the student reached the end of the quiz. Both
  are taken as a *request* to qualify a referral, never as the decision
  — api/_lib/referrals.js checks that the code is real, that it is not
  the caller's own, that this person has never been attributed before,
  and that the referrer is inside their daily and lifetime caps.

  Every outcome is 200 with a reason. A client that can tell
  "already counted" apart from "you tripped the daily limit" is a client
  that can map the anti-abuse rules, and there is nothing useful the page
  can do differently anyway — the UI says thank you either way.
*/

const { json, setCors, readBody } = require("../../http");
const { requireAccount } = require("../../account");
const { checkRateLimit, clientKey } = require("../../rateLimit");
const { recordQualified, isEnabled } = require("../../referrals");

module.exports = async function handler(req, res){
  if(!isEnabled()) return json(res, 404, { error: "Not found" });

  setCors(req, res, "POST,OPTIONS");
  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }
  if(req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  // Tighter than the code route: this one moves money. A single IP has
  // no legitimate reason to qualify referrals in bulk — a school lab
  // behind one NAT is the edge case, and twenty an hour covers a class.
  const allowed = await checkRateLimit({
    key: "referral-claim:" + clientKey(req),
    limit: 20,
    windowMs: 60 * 60 * 1000
  });
  if(!allowed) return json(res, 429, { error: "Too many requests. Please try again shortly." });

  let body = {};
  try{ body = await readBody(req); }
  catch(err){
    if(err && err.statusCode === 413) return json(res, 413, { error: "Request body too large." });
    return json(res, 400, { error: "Invalid JSON body." });
  }

  const account = await requireAccount(req);
  if(!account.ok) return json(res, account.status, { error: account.error, code: account.code });
  if(!account.account){
    return json(res, 401, { error: "Sign in first.", code: "NO_ACCOUNT" });
  }

  try{
    const result = await recordQualified({
      code: body.ref,
      referredUid: account.account.uid,
      event: body.event
    });
    // `counted` is all the page is told. The reason is logged, not sent.
    return json(res, 200, { ok: true, counted: Boolean(result.ok && result.credit > 0) });
  }catch(err){
    console.error("[lume referrals] claim failed:", err && err.message);
    // A failed claim must never break the quiz result behind it.
    return json(res, 200, { ok: true, counted: false });
  }
};
