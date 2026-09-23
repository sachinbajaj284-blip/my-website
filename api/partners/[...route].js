/*
  Every /api/partners/* route, in one serverless function. See
  api/_lib/dispatch.js for why.
*/
const { dispatcher } = require("../_lib/dispatch");

const routes = {
  "me": require("../_lib/routes/partners/me.js")
};

module.exports = dispatcher("partners", routes);
// exported so a test can check the map against the handler files on disk
module.exports.routes = routes;
