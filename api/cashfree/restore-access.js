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

const { auth } = require("../_lib/firebaseAdmin");
const { findPaidEntitlements } = require("../_lib/entitlements");
/*
  The CORS allow-list and the JSON reply come from _lib/http.js rather
  than from a second copy kept here. That copy had already drifted into
  its own setCors() with a hardcoded method list, which is precisely the
  thing _lib/http.js exists to stop: an allow-list is a security control,
  and two of them means one of them is out of date.
*/
const { json, setCors } = require("../_lib/http");

function getBearerToken(req){
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

module.exports = async function handler(req, res){
  setCors(req, res, "POST,OPTIONS");

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

  if(!decoded.email_verified){
    return json(res, 403, { ok: false, code: "EMAIL_NOT_VERIFIED", error: "Please verify your email first — check your inbox for the verification link, then try again." });
  }

  const email = String(decoded.email || "").trim().toLowerCase();
  if(!email){
    return json(res, 403, { ok: false, code: "NO_EMAIL", error: "Your account has no verified email on file." });
  }

  try{
    const access = await findPaidEntitlements({ email });
    return json(res, 200, { ok: true, access: access });
  }catch(err){
    console.error("[lume restore-access]", String(err && err.message || err));
    return json(res, 502, { ok: false, error: "Could not look up your access right now. Please retry, or message us on WhatsApp with your payment details." });
  }
};
