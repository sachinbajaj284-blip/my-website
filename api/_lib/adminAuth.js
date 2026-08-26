/*
  The back-office token gate.

  grant.js worked this out first: an admin route is closed by default,
  answers 404 rather than 401 when it isn't armed, and compares hashes
  so the comparison leaks neither the token nor its length. The agent
  routes need exactly the same rule, and _lib/http.js already records
  why a security control copied into three files is a bad idea — it
  drifts, and the copy that drifts is the one nobody is looking at.

  Each caller names its own environment variable, so revoking the
  drafting token does not revoke the entitlement token.
*/

const crypto = require("crypto");

// A short token is not a secret. Refusing to run beats quietly accepting
// something guessable on a route that spends money and writes reports.
const MIN_TOKEN_LENGTH = 24;

function tokenMatches(provided, expected){
  const a = crypto.createHash("sha256").update(String(provided)).digest();
  const b = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

function bearer(req){
  const header = String((req && req.headers && req.headers.authorization) || "");
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : "";
}

/*
  Resolves to one of:

    { ok:true }
    { ok:false, status:404 }   not armed — say nothing, look undeployed
    { ok:false, status:401 }   armed, wrong token

  `envName` is the variable that arms this route; `label` only appears in
  the server log when the token is set but too short to use.
*/
function checkAdminToken(req, envName, label){
  const expected = String(process.env[envName] || "");

  if(!expected){
    return { ok:false, status:404, body:{ error:"Not found" } };
  }
  if(expected.length < MIN_TOKEN_LENGTH){
    console.error("[lume " + (label || envName) + "] " + envName + " is shorter than " +
                  MIN_TOKEN_LENGTH + " characters — route disabled.");
    return { ok:false, status:404, body:{ error:"Not found" } };
  }

  const provided = bearer(req);
  if(!provided || !tokenMatches(provided, expected)){
    return { ok:false, status:401, body:{ error:"Unauthorized" } };
  }

  return { ok:true };
}

module.exports = { checkAdminToken, tokenMatches, bearer, MIN_TOKEN_LENGTH };
