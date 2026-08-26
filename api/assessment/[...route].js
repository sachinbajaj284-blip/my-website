/*
  Every /api/assessment/* route, in one serverless function. See
  api/_lib/dispatch.js for why.
*/
const { dispatcher } = require("../_lib/dispatch");

const routes = {
  "save":   require("../_lib/routes/assessment/save.js"),
  "latest": require("../_lib/routes/assessment/latest.js"),
  "delete": require("../_lib/routes/assessment/delete.js")
};

module.exports = dispatcher("assessment", routes);
// exported so a test can check the map against the handler files on disk
module.exports.routes = routes;
