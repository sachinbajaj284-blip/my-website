/*
  Cashfree config health check for Lume Live.

  Endpoint:
  GET /api/cashfree/health

  Reports whether the serverless function is deployed and whether the
  required Cashfree environment variables are present. It NEVER returns
  the secret values themselves — only booleans and lengths — so it is
  safe to call from a browser or curl while diagnosing checkout issues.
*/

function json(res, status, body){
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

module.exports = function handler(req, res){
  var hasId = !!process.env.CASHFREE_CLIENT_ID;
  var hasSecret = !!process.env.CASHFREE_CLIENT_SECRET;
  var env = (process.env.CASHFREE_ENV || "production").toLowerCase();
  var ready = hasId && hasSecret;

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
    public_base_url_set: !!process.env.LUME_PUBLIC_BASE_URL,
    message: ready
      ? "Cashfree credentials are configured. If checkout still fails, verify the keys are valid for the selected CASHFREE_ENV."
      : "Cashfree credentials are MISSING. Set CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET in Vercel project environment variables, then redeploy."
  });
};
