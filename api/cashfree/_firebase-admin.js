/*
  Shared Firebase Admin initializer for Lume Live serverless functions.

  Files in /api that start with "_" are treated as helper modules by
  Vercel (never exposed as HTTP endpoints).

  This gives the server AUTHORITATIVE, rules-independent access to
  Firestore so it can track which phone numbers have already paid for a
  session — the basis for enforcing the "₹49 first session only" offer.

  Required environment variable (set ONE of these):
    FIREBASE_SERVICE_ACCOUNT_KEY  — the service-account JSON, either as
                                    raw JSON or base64-encoded JSON.
    GOOGLE_APPLICATION_CREDENTIALS — path to a service-account JSON file
                                    (Google Application Default Credentials).

  Optional:
    FIREBASE_PROJECT_ID           — overrides the project id if needed.

  If firebase-admin is not installed or no credentials are configured,
  getDb() returns null and every caller falls back to its previous
  behaviour. Nothing here can ever block a checkout.
*/

let _db = null;
let _tried = false;

function loadServiceAccount(){
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if(!raw){ return null; }
  try{
    const text = raw.charAt(0) === "{" ? raw : Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(text);
  }catch(err){
    console.warn("[firebase-admin] Could not parse FIREBASE_SERVICE_ACCOUNT_KEY:", err.message);
    return null;
  }
}

// Returns a Firestore instance, or null if unavailable/unconfigured.
function getDb(){
  if(_db){ return _db; }
  if(_tried){ return _db; }
  _tried = true;

  let admin;
  try{
    admin = require("firebase-admin");
  }catch(err){
    console.warn("[firebase-admin] package not installed — server-side session tracking disabled.");
    return null;
  }

  try{
    if(!admin.apps.length){
      const serviceAccount = loadServiceAccount();
      const projectId = process.env.FIREBASE_PROJECT_ID || (serviceAccount && serviceAccount.project_id);
      if(serviceAccount){
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId });
      }else if(process.env.GOOGLE_APPLICATION_CREDENTIALS){
        admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
      }else{
        console.warn("[firebase-admin] No credentials configured — server-side session tracking disabled.");
        return null;
      }
    }
    _db = admin.firestore();
    return _db;
  }catch(err){
    console.warn("[firebase-admin] init failed:", err.message);
    return null;
  }
}

// Convenience access to FieldValue helpers (server timestamps, etc.).
function fieldValue(){
  try{ return require("firebase-admin").firestore.FieldValue; }
  catch(err){ return null; }
}

module.exports = { getDb, fieldValue };
