/*
  Restore-access endpoint for Lume Live.

  Lets a customer who paid on one device (e.g. their phone) unlock their
  purchase on another device (e.g. a laptop) by looking up the phone
  number or email they paid with, against the server-side purchase
  records written by order-status.js when Cashfree confirms PAID.

  Endpoint:
  POST /api/cashfree/restore-access
  Body (JSON): { "phone": "9876543210" } or { "email": "you@example.com" }

  Response never distinguishes "no such customer" from "no purchase yet"
  beyond an empty access[] array, to avoid leaking who has an account.

  Required environment variables:
  FIREBASE_PROJECT_ID=...
  FIREBASE_CLIENT_EMAIL=...
  FIREBASE_PRIVATE_KEY=...
*/

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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readBody(req){
  return new Promise((resolve, reject) => {
    let raw = "";
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if(size > 4096){ reject(new Error("Request body too large.")); req.destroy(); return; }
      raw += chunk;
    });
    req.on("end", () => {
      try{ resolve(raw ? JSON.parse(raw) : {}); }
      catch(err){ reject(err); }
    });
    req.on("error", reject);
  });
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

  let body;
  try{ body = await readBody(req); }
  catch(err){ return json(res, 400, { error: "Invalid request." }); }

  const phone = String(body.phone || "").replace(/\D/g, "").slice(-10);
  const email = String(body.email || "").trim().toLowerCase();
  if(!phone && !email){
    return json(res, 400, { error: "Enter the phone number or email you paid with." });
  }
  if(phone && phone.length !== 10){
    return json(res, 400, { error: "Enter a valid 10-digit phone number." });
  }

  try{
    const access = await findPaidEntitlements({ phone, email });
    return json(res, 200, { ok: true, access: access });
  }catch(err){
    console.error("[lume restore-access]", String(err && err.message || err));
    return json(res, 502, { ok: false, error: "Could not look up your access right now. Please retry, or message us on WhatsApp with your payment details." });
  }
};
