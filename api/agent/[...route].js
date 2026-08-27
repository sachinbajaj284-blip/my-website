/*
  Every /api/agent/* route, in one serverless function. See
  api/_lib/dispatch.js for why they are not twelve separate files.
*/
const { dispatcher } = require("../_lib/dispatch");

const routes = {
  "chat":             require("../_lib/routes/agent/chat.js"),
  "cohort":           require("../_lib/routes/agent/cohort.js"),
  "cohort-attention": require("../_lib/routes/agent/cohort-attention.js"),
  "draft":            require("../_lib/routes/agent/draft.js"),
  "link-code":        require("../_lib/routes/agent/link-code.js"),
  "queue":            require("../_lib/routes/agent/queue.js"),
  "report":           require("../_lib/routes/agent/report.js"),
  "sign":             require("../_lib/routes/agent/sign.js"),
  "web":              require("../_lib/routes/agent/web.js"),
  "webhook":          require("../_lib/routes/agent/webhook.js")
};

module.exports = dispatcher("agent", routes);
// exported so a test can check the map against the handler files on disk
module.exports.routes = routes;
