/*
  Restore-access endpoint for Lume Live.

  Lets a customer who paid on one device (e.g. their phone) unlock their
  purchase on another device (e.g. a laptop) by looking up purchases
  against the email on their signed-in, verified Firebase account.

  Ownership proof: the caller must send a valid Firebase ID token for a
  signed-in user whose email is verified (Authorization: Bearer <token>).
  The token is verified server-side with the Firebase Admin SDK — it
  cannot be forged — and only the verified email inside it is ever used
  for the lookup. A client-supplied phone/email string is never trusted;
  this closes the earlier gap where anyone who merely knew someone else's
  phone number or email could pull up that person's paid content.

  Endpoint:
  POST /api/cashfree/restore-access
  Headers: Authorization: Bearer <Firebase ID token>

  Response never distinguishes "no such customer" from "no purchase yet"
  beyond an empty access[] array, to avoid leaking who has an account.

  Required environment variables:
  FIREBASE_PROJECT_ID=...
  FIREBASE_CLIENT_EMAIL=...
  FIREBASE_PRIVATE_KEY=...
*/

const { auth } = require("../../firebaseAdmin");
const { findPaidEntitlements } = require("../../entitlements");

function json(res, status, body){
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

const DEFAULT_ALLOWED_ORIGINS = [
  "https://lumelive.co.in",
  "https://www.lumelive.co.in",
  "http://127.0.0.1:8765",
  "http://localhost:8765"
];

function allowedOrigins(){
  return new Set(DEFAULT_ALLOWED_ORIGINS.concat(
    String(process.env.LUME_ALLOWED_ORIGINS || "")
      .split(",")
      .map(function(origin){ return origin.trim(); })
      .filter(Boolean)
  ));
}

function setCors(req, res){
  const origin = req.headers.origin || "";
  if(origin && allowedOrigins().has(origin)){
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function getBearerToken(req){
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

module.exports = async function handler(req, res){
  setCors(req, res);

  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }
  if(req.method !== "POST"){
    return json(res, 405, { error: "Method not allowed" });
  }

  const token = getBearerToken(req);
  if(!token){
    return json(res, 401, { ok: false, code: "NO_TOKEN", error: "Please sign in to restore your access." });
  }

  let decoded;
  try{
    decoded = await auth().verifyIdToken(token);
  }catch(err){
    return json(res, 401, { ok: false, code: "INVALID_TOKEN", error: "Your sign-in has expired. Please sign in again." });
  }

  /*
    Two keys, and they are trusted for different reasons.

    The uid is the account itself, proven by the token we just verified,
    and it is what create-order.js stamped onto the order at the time of
    payment. Nobody can present someone else's uid, so a uid lookup needs
    no further proof and runs whether or not the email is verified. This
    is also the key that survives a purchase made with one address and a
    sign-in with another, which is the common case and used to be
    indistinguishable from "you never paid".

    The email is only a claim — anyone can type anyone's address into a
    sign-up form — so that lookup still requires Firebase to have
    confirmed the person owns the inbox. It stays because orders placed
    before accounts were required carry no uid at all.
  */
  const uid = String(decoded.uid || "");
  const email = decoded.email_verified ? String(decoded.email || "").trim().toLowerCase() : "";
  /*
    Firebase only puts phone_number on a token after an SMS code came
    back, so the claim IS the verification — the same standing the
    email gets from a clicked link. It matters most for orders placed
    before accounts existed, which carry no uid but do carry the number
    the client typed at checkout.
  */
  const phone = String(decoded.phone_number || "").trim();

  if(!uid && !email && !phone){
    return json(res, 403, { ok: false, code: "NO_EMAIL", error: "Your account has no verified number or email on file." });
  }

  try{
    const access = await findPaidEntitlements({ uid, email, phone });

    /*
      Nothing found and the email was never confirmed: verifying it opens
      a second way to match, so say so rather than reporting a flat "no
      purchases" that the person cannot act on. Still a 403 with the same
      code, so the existing UI keeps showing its verification help.
    */
    if(!access.length && !decoded.email_verified && !phone){
      return json(res, 403, { ok: false, code: "EMAIL_NOT_VERIFIED", error: "Please check your email first. Tap the link we sent — it may be in your Spam folder — then try again." });
    }

    return json(res, 200, { ok: true, access: access });
  }catch(err){
    console.error("[lume restore-access]", String(err && err.message || err));
    return json(res, 502, { ok: false, error: "Could not look up your access right now. Please retry, or message us on WhatsApp with your payment details." });
  }
};
