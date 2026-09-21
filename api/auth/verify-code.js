/*
  POST /api/auth/verify-code   { email, code, name? }
    -> { ok:true, token }      a Firebase custom token, good for one
                               signInWithCustomToken() in the browser

  This is the only place an account is created. Someone who can read the
  inbox gets the account for that address; someone who cannot, does not,
  and never learns whether it existed.

  The account is marked emailVerified because it is: the code went to
  that inbox and came back. That is the same proof Firebase's own
  verification link provides, so restore-access and everything else that
  reads the flag can keep trusting it.

  A custom token is minted rather than a session cookie because the rest
  of the site already speaks Firebase: the browser exchanges it for a
  normal ID token, and /api/_lib/account.js verifies that the way it
  always has. Nothing downstream needs to know sign-in changed.
*/

const { json, setCors, readBody } = require("../_lib/http");
const { checkRateLimit, clientKey } = require("../_lib/rateLimit");
const { verifyCode, normalizeEmail, looksLikeEmail } = require("../_lib/emailCodes");

const HOUR_MS = 60 * 60 * 1000;

function reasonFor(code){
  switch(code){
    case "EXPIRED":    return "That code has expired. Ask for a new one.";
    case "LOCKED":     return "Too many wrong tries. Ask for a new code.";
    case "NO_CODE":    return "That code has already been used, or was never sent. Ask for a new one.";
    default:           return "That code didn't match. Check the email and type it again.";
  }
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
  const code = String((body && body.code) || "").replace(/\D/g, "");
  const name = String((body && body.name) || "").trim().slice(0, 80);

  if(!looksLikeEmail(email)){
    return json(res, 400, { ok:false, code:"BAD_EMAIL", error:"Please enter a valid email address." });
  }
  if(code.length !== 6){
    return json(res, 400, { ok:false, code:"BAD_CODE", error:"Enter the 6-digit code from the email." });
  }

  /*
    The per-code lockout lives in emailCodes.js and is the real defence.
    This one is against a machine working through many addresses at once,
    which that lockout cannot see.
  */
  const within = await checkRateLimit({ key: "authverify:ip:" + clientKey(req), limit: 40, windowMs: HOUR_MS });
  if(!within){
    return json(res, 429, { ok:false, code:"RATE_LIMITED", error:"Too many attempts. Please wait a little while and try again." });
  }

  let outcome;
  try{
    outcome = await verifyCode(email, code);
  }catch(err){
    console.error("[lume auth] could not check a sign-in code:", String(err && err.message || err));
    return json(res, 503, { ok:false, code:"UNAVAILABLE", error:"We can't check that code right now. Please try again in a few minutes." });
  }

  if(!outcome.ok){
    return json(res, 401, { ok:false, code:outcome.code, error:reasonFor(outcome.code), attemptsLeft:outcome.attemptsLeft });
  }

  try{
    const auth = require("../_lib/firebaseAdmin").auth();

    let user = null;
    try{
      user = await auth.getUserByEmail(email);
    }catch(err){
      if(!err || err.code !== "auth/user-not-found"){ throw err; }
    }

    if(!user){
      user = await auth.createUser({
        email: email,
        emailVerified: true,
        displayName: name || undefined
      });
    } else {
      /*
        The form asks for a name on every sign-in, so what was typed is
        what the account gets — otherwise correcting a name that went in
        wrong would be impossible, and the field would be a lie. It is
        their own account and they have just proved it, so there is
        nobody else's name to overwrite.

        An unverified older account becomes verified here too, because
        they just proved the inbox is theirs.
      */
      const patch = {};
      if(name && name !== user.displayName){ patch.displayName = name; }
      if(!user.emailVerified){ patch.emailVerified = true; }
      if(Object.keys(patch).length){ user = await auth.updateUser(user.uid, patch); }
    }

    const token = await auth.createCustomToken(user.uid);
    return json(res, 200, { ok:true, token: token, isNew: !user.displayName });
  }catch(err){
    console.error("[lume auth] could not mint a sign-in token:", String(err && err.message || err));
    return json(res, 503, {
      ok:false, code:"UNAVAILABLE",
      error:"We couldn't finish signing you in. Please try again in a few minutes, or message us on WhatsApp."
    });
  }
};
