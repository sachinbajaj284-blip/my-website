/*
  POST /api/referrals/payout      — signed in

  Two shapes, because a dashboard needs to ask before it can tell:

    {}                                     → what can I ask for?
    { upi, age_declared: true, request:true } → ask for it

  A GET-shaped read is folded into the same POST so the dashboard makes
  one call and so nothing about a person's earnings is ever reachable by
  a URL that could be prefetched, logged or shared.

  This endpoint never moves money. It writes a request that a human
  settles from tools/referral-payouts.mjs — see api/_lib/referrals.js for
  why that is deliberate.
*/

const { json, setCors, readBody } = require("../../http");
const { requireAccount } = require("../../account");
const { checkRateLimit, clientKey } = require("../../rateLimit");
const { payoutSummary, requestPayout, isEnabled, requiresPhone, normalizePhone } = require("../../referrals");

/*
  What the student is told. Unlike /claim — where a named reason would
  map out the anti-abuse rules — every refusal here is something they
  can act on, so each one says what to do about it.
*/
const MESSAGES = {
  AGE_NOT_DECLARED: "Please confirm you're 18 or older, or that a parent is happy for you to be paid.",
  BAD_UPI: "That doesn't look like a UPI ID. It should look like yourname@bank.",
  NO_CODE: "You don't have a referral link yet.",
  ALREADY_PENDING: "You already have a payout on the way. We'll message you when it's sent.",
  MIN_NOT_MET: "Not quite there yet — keep sharing.",
  PHONE_REQUIRED: "Please verify your mobile number first — we need a way to reach you about the payment."
};

module.exports = async function handler(req, res){
  if(!isEnabled()) return json(res, 404, { error: "Not found" });

  setCors(req, res, "POST,OPTIONS");
  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }
  if(req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  // Tighter than /claim: this one ends in somebody's bank account.
  const allowed = await checkRateLimit({
    key: "referral-payout:" + clientKey(req),
    limit: 15,
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
  if(!account.account) return json(res, 401, { error: "Sign in first.", code: "NO_ACCOUNT" });

  const uid = account.account.uid;

  try{
    // Whether this account carries a verified number decides which
    // control the dashboard shows, so it rides along with the summary.
    const phoneOk = !requiresPhone() || Boolean(normalizePhone(account.account.phone));

    if(body.request !== true){
      const summary = await payoutSummary(uid);
      if(!summary) return json(res, 200, { ok: true, summary: null });
      return json(res, 200, { ok: true, summary: Object.assign({ phone_verified: phoneOk }, summary) });
    }

    const result = await requestPayout({
      uid,
      upi: body.upi,
      phone: account.account.phone,
      ageDeclared: body.age_declared === true
    });

    // The fresh summary rides back with every answer so the dashboard
    // redraws from the server rather than from what it hoped happened.
    const raw = await payoutSummary(uid);
    const summary = raw ? Object.assign({ phone_verified: phoneOk }, raw) : null;

    if(!result.ok){
      return json(res, 200, {
        ok: false,
        reason: result.reason,
        message: MESSAGES[result.reason] || "We couldn't request that payout. Please message us and we'll sort it out.",
        summary
      });
    }
    return json(res, 200, { ok: true, requested: result.amount, summary });
  }catch(err){
    console.error("[lume referrals] payout failed:", err && err.message);
    return json(res, 503, { error: "We can't reach your payout details right now. Please try again in a few minutes." });
  }
};
