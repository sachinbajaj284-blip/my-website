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
