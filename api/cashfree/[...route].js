/*
  Every /api/cashfree/* route, in one serverless function. See
  api/_lib/dispatch.js for why.

  ───────────────────────────────────────────────────────────────────────
  The bodyParser config below is load-bearing
  ───────────────────────────────────────────────────────────────────────
  webhook.js verifies Cashfree's signature over the RAW request body. It
  used to carry `config` itself, which worked while it was its own route;
  Vercel reads that export from the file it routes to, so behind a
  catch-all it would have been read from here and silently ignored there
  — and a parsed body means the bytes the signature covers are gone.

  webhook.js does not fail quietly if that happens: it answers 503 rather
  than listening to a stream that has already ended, because a hang reads
  to Cashfree as a timeout and burns a retry. But 503 on every webhook is
  still every webhook failing, which is fulfilment stopping for anyone
  whose browser never comes back from the payment page.

  It is safe for the other four because none of them wants a parsed body:
    create-order    reads the stream itself, through _lib/http readBody
    restore-access  takes everything from the Authorization header
    order-status    GET, no body
    health          GET, no body
*/
const { dispatcher } = require("../_lib/dispatch");

const routes = {
  "create-order":   require("../_lib/routes/cashfree/create-order.js"),
  "health":         require("../_lib/routes/cashfree/health.js"),
  "order-status":   require("../_lib/routes/cashfree/order-status.js"),
  "restore-access": require("../_lib/routes/cashfree/restore-access.js"),
  "webhook":        require("../_lib/routes/cashfree/webhook.js")
};

module.exports = dispatcher("cashfree", routes);
// exported so a test can check the map against the handler files on disk
module.exports.routes = routes;
// Raw bytes for the webhook's signature check — see above.
module.exports.config = { api: { bodyParser: false } };
