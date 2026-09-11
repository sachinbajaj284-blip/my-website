/*
  Talking to Cashfree.

  The credentials, the environment switch and the 12-second timeout were
  written out twice — once in create-order.js and once in order-status.js
  — before the webhook needed the same order lookup a third time. The
  timeout matters in particular: a fetch with no AbortController hangs the
  function until the platform kills it, which on a webhook means Cashfree
  never gets its acknowledgement and retries a payment we already have.
*/

const ORDER_FETCH_TIMEOUT_MS = 12000;

function apiBase(){
  const env = (process.env.CASHFREE_ENV || "production").toLowerCase();
  return env === "sandbox" ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg";
}

function hasCredentials(){
  return Boolean(process.env.CASHFREE_CLIENT_ID && process.env.CASHFREE_CLIENT_SECRET);
}

/*
  GET /pg/orders/{order_id}.

  Returns { ok, status, data } — `ok` false with a status is Cashfree
  answering "no" (a 404 for an unknown order, say), which the caller is
  expected to pass on. A network failure or a timeout throws instead,
  because "we could not ask" and "we asked and the answer was no" must
  never collapse into the same branch on a payments path.
*/
async function fetchCashfreeOrder(orderId){
  const controller = new AbortController();
  const timer = setTimeout(function(){ controller.abort(); }, ORDER_FETCH_TIMEOUT_MS);
  let response;
  try{
    response = await fetch(apiBase() + "/orders/" + encodeURIComponent(String(orderId)), {
      method: "GET",
      headers: {
        "x-client-id": process.env.CASHFREE_CLIENT_ID,
        "x-client-secret": process.env.CASHFREE_CLIENT_SECRET,
        "x-api-version": process.env.CASHFREE_API_VERSION || "2025-01-01"
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data: data };
}

module.exports = { fetchCashfreeOrder, apiBase, hasCredentials, ORDER_FETCH_TIMEOUT_MS };
