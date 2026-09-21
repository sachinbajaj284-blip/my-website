/*
  Every /api/referrals/* route, in one serverless function. See
  api/_lib/dispatch.js for why.
*/
const { dispatcher } = require("../_lib/dispatch");

const routes = {
  "code":   require("../_lib/routes/referrals/code.js"),
  "claim":  require("../_lib/routes/referrals/claim.js"),
  "payout": require("../_lib/routes/referrals/payout.js")
};

module.exports = dispatcher("referrals", routes);
// exported so a test can check the map against the handler files on disk
module.exports.routes = routes;
