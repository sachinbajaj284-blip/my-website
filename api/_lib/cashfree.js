/*
  The Cashfree API client, in one place.

  create-order.js, order-status.js and webhook.js each used to resolve
  the environment, build the base URL and hand-roll a timed-out fetch of
  their own. The environment choice in particular is not a detail worth
  duplicating: one endpoint left on sandbox while the others talk to
  production is a silent, total payment failure that no test would see.
*/

const TIMEOUT_MS = 12000;

function credentials(){
  return {
    clientId: process.env.CASHFREE_CLIENT_ID || "",
    clientSecret: process.env.CASHFREE_CLIENT_SECRET || ""
  };
}

function isConfigured(){
  const c = credentials();
  return !!(c.clientId && c.clientSecret);
}

function apiBase(){
  const env = String(process.env.CASHFREE_ENV || "production").toLowerCase();
  return env === "sandbox"
    ? "https://sandbox.cashfree.com/pg"
    : "https://api.cashfree.com/pg";
}

function apiVersion(){
  return process.env.CASHFREE_API_VERSION || "2025-01-01";
}

// Aborts rather than hanging: a serverless function that waits on a
// silent gateway burns its whole execution budget and the customer sees
// a blank screen instead of the UPI fallback.
async function cashfreeFetch(path, init){
  const { clientId, clientSecret } = credentials();
  const controller = new AbortController();
  const timer = setTimeout(function(){ controller.abort(); }, TIMEOUT_MS);
  try{
    return await fetch(apiBase() + path, Object.assign({}, init, {
      headers: Object.assign({
        "x-client-id": clientId,
        "x-client-secret": clientSecret,
        "x-api-version": apiVersion()
      }, (init && init.headers) || {}),
      signal: controller.signal
    }));
  } finally {
    clearTimeout(timer);
  }
}

/*
  Reads an order back from Cashfree.

  Both the browser poll and the webhook fulfil from this, rather than
  from whatever shape each of them happened to be handed. The webhook's
  own payload is only ever trusted for one thing — which order to go and
  look up — so the money decision is always made against the gateway's
  own record of the order.

  Returns { ok, status, data }. A transport failure is ok:false with
  status 0, which callers surface as "retry in a moment" rather than as
  "not paid".
*/
async function fetchOrder(orderId){
  let response;
  try{
    response = await cashfreeFetch("/orders/" + encodeURIComponent(orderId), { method: "GET" });
  }catch(err){
    return { ok: false, status: 0, data: {}, error: String(err && err.message || err) };
  }
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data: data };
}

function isPaid(order){
  return String((order && order.order_status) || "").toUpperCase() === "PAID";
}

module.exports = {
  credentials, isConfigured, apiBase, apiVersion,
  cashfreeFetch, fetchOrder, isPaid, TIMEOUT_MS
};
