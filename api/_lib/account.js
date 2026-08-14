/*
  Which Lume Live account is making this request.

  Every purchase belongs to an account. The page asks the client to sign
  in before it opens the payment modal, but a page gate is only a
  courtesy — anyone can POST to /api/cashfree/create-order directly. This
  is where the rule is actually enforced, against a Firebase ID token the
  browser cannot forge.

  Only what the verified token says is ever used. The payload's own name,
  email and phone are still read for delivery details, but they never
  decide *whose* purchase this is: order_tags carries the uid from here,
  so an order can be tied back to a real account later even if the client
  typed someone else's email into the form.

  Requires the same Firebase Admin credentials as restore-access:
  FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.

  Kill switch: set LUME_REQUIRE_ACCOUNT=0 to stop requiring an account.
  It exists so that a credential problem on the Firebase side — expired
  service account, project moved — can be answered in one environment
  variable rather than by leaving the site unable to take money. It is
  on by default and should stay on.
*/

function isEnforced(){
  const raw = String(process.env.LUME_REQUIRE_ACCOUNT == null ? "1" : process.env.LUME_REQUIRE_ACCOUNT).trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off" || raw === "no");
}

// Whether we *can* check an account at all. Checked before verifying so
// a missing deployment secret reports itself as a configuration problem
// (503, and loudly in the log) instead of looking like every customer
// suddenly having an invalid sign-in.
function isConfigured(){
  return Boolean(process.env.FIREBASE_PROJECT_ID &&
                 process.env.FIREBASE_CLIENT_EMAIL &&
                 process.env.FIREBASE_PRIVATE_KEY);
}

function getBearerToken(req){
  const header = String((req && req.headers && req.headers.authorization) || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

/*
  Resolves to one of:

    { ok:true,  account:{ uid, email, emailVerified, name } }
    { ok:true,  account:null }                     enforcement switched off
    { ok:false, status, code, error }              tell the client this

  `verifyIdToken` is injectable so the rules can be tested without
  Firebase Admin, credentials, or a network.
*/
async function requireAccount(req, options){
  const opts = options || {};
  if(!isEnforced()){
    return { ok:true, account:null, enforced:false };
  }

  const token = getBearerToken(req);
  if(!token){
    return {
      ok:false, status:401, code:"NO_ACCOUNT",
      error:"Please create your Lume Live account or sign in before paying."
    };
  }

  if(!opts.verifyIdToken && !isConfigured()){
    // Nothing the client did wrong, and nothing they can fix.
    console.error("[lume account] FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY are not set, so no sign-in can be verified. Set them, or set LUME_REQUIRE_ACCOUNT=0 to stop requiring an account.");
    return {
      ok:false, status:503, code:"ACCOUNT_CHECK_UNAVAILABLE",
      error:"We can't verify your sign-in right now. Please try again in a few minutes, or message us on WhatsApp and we'll complete your payment with you."
    };
  }

  const verify = opts.verifyIdToken || (function(idToken){
    return require("./firebaseAdmin").auth().verifyIdToken(idToken);
  });

  let decoded;
  try{
    decoded = await verify(token);
  }catch(err){
    return {
      ok:false, status:401, code:"INVALID_ACCOUNT",
      error:"Your sign-in has expired. Please sign in again to complete your payment."
    };
  }

  if(!decoded || !decoded.uid){
    return {
      ok:false, status:401, code:"INVALID_ACCOUNT",
      error:"Your sign-in has expired. Please sign in again to complete your payment."
    };
  }

  // A verified email is not required to buy: the verification mail is
  // sent at sign-up, but a client who hasn't opened their inbox yet is
  // still a client who wants to pay. emailVerified is recorded so the
  // owner can see which orders came from a confirmed address.
  if(opts.requireVerifiedEmail && !decoded.email_verified){
    return {
      ok:false, status:403, code:"EMAIL_NOT_VERIFIED",
      error:"Please verify your email first — check your inbox for the verification link, then try again."
    };
  }

  return {
    ok: true,
    account: {
      uid: String(decoded.uid),
      email: String(decoded.email || "").trim().toLowerCase(),
      emailVerified: Boolean(decoded.email_verified),
      name: String(decoded.name || "").slice(0, 80)
    }
  };
}

module.exports = { requireAccount, getBearerToken, isEnforced, isConfigured };
