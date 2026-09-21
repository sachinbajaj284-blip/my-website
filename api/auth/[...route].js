/*
  Every /api/auth/* route, in one serverless function. See
  api/_lib/dispatch.js for why.

  This one was not optional. Vercel's Hobby plan deploys at most twelve
  functions; send-code.js and verify-code.js took the site to thirteen,
  and every deploy from fb219bb onwards failed — which meant the email
  sign-in they belong to never reached production at all.
*/
const { dispatcher } = require("../_lib/dispatch");

const routes = {
  "send-code":   require("../_lib/routes/auth/send-code.js"),
  "verify-code": require("../_lib/routes/auth/verify-code.js")
};

module.exports = dispatcher("auth", routes);
// exported so a test can check the map against the handler files on disk
module.exports.routes = routes;
