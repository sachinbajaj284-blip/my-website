/*
  Every /api/coupons/* route, in one serverless function. See
  api/_lib/dispatch.js for why.
*/
const { dispatcher } = require("../_lib/dispatch");

const routes = {
  "active":   require("../_lib/routes/coupons/active.js"),
  "validate": require("../_lib/routes/coupons/validate.js"),
  "seed":     require("../_lib/routes/coupons/seed.js")
};

module.exports = dispatcher("coupons", routes);
// exported so a test can check the map against the handler files on disk
module.exports.routes = routes;
