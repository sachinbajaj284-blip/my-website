/*
  Cashfree + Firebase Admin config health check for Lume Live.

  Endpoint:
  GET /api/cashfree/health

  Reports whether the serverless function is deployed and whether the
  required Cashfree and Firebase Admin environment variables are present
  (and, for Firebase, whether they actually authenticate). It NEVER
  returns the secret values themselves — only booleans and lengths — so
  it is safe to call from a browser or curl while diagnosing checkout or
  entitlement-restore issues.
*/

const { db } = require("../_lib/firebaseAdmin");

function json(res, status, body){
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res){
  var hasId = !!process.env.CASHFREE_CLIENT_ID;
  var hasSecret = !!process.env.CASHFREE_CLIENT_SECRET;
  var env = (process.env.CASHFREE_ENV || "production").toLowerCase();
  var cashfreeReady = hasId && hasSecret;

  var hasProjectId = !!process.env.FIREBASE_PROJECT_ID;
  var hasClientEmail = !!process.env.FIREBASE_CLIENT_EMAIL;
  var hasPrivateKey = !!process.env.FIREBASE_PRIVATE_KEY;
  var firebaseConfigured = hasProjectId && hasClientEmail && hasPrivateKey;
  var firebaseConnected = false;
  var firebaseError = null;

  if(firebaseConfigured){
    try{
      // A harmless read that only succeeds if the credentials are valid
      // and actually authorised for this Firestore project.
      await db().collection("entitlements").limit(1).get();
      firebaseConnected = true;
    }catch(err){
      firebaseError = String(err && err.message || err).slice(0, 200);
    }
  }

  var ready = cashfreeReady; // Firebase is optional — checkout still works without it

  return json(res, ready ? 200 : 503, {
    ok: ready,
    deployed: true,
    env: env,
    credentials: {
      client_id_present: hasId,
      client_secret_present: hasSecret,
      // lengths only — helps catch an empty/whitespace value without exposing it
      client_id_length: (process.env.CASHFREE_CLIENT_ID || "").trim().length,
      client_secret_length: (process.env.CASHFREE_CLIENT_SECRET || "").trim().length
    },
    firebase_admin: {
      project_id_present: hasProjectId,
      client_email_present: hasClientEmail,
      private_key_present: hasPrivateKey,
      configured: firebaseConfigured,
      connected: firebaseConnected,
      error: firebaseError
    },
    public_base_url_set: !!process.env.LUME_PUBLIC_BASE_URL,
    message: ready
      ? "Cashfree credentials are configured. If checkout still fails, verify the keys are valid for the selected CASHFREE_ENV."
      : "Cashfree credentials are MISSING. Set CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET in Vercel project environment variables, then redeploy.",
    firebase_message: !firebaseConfigured
      ? "Firebase Admin env vars are not set yet — purchase restore-on-new-device will silently no-op until you add FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY, then redeploy."
      : firebaseConnected
        ? "Firebase Admin is configured and successfully authenticated against Firestore."
        : "Firebase Admin env vars are present but the connection failed — check firebase_admin.error, and double-check FIREBASE_PRIVATE_KEY was pasted in full (including the BEGIN/END lines)."
  });
};
