/*
  Tests for the account gate — run with:  npm run account:test

  Every purchase has to belong to a Lume Live account. The page asks for
  a sign-in before it opens the payment modal, but that is only a
  courtesy: anyone can POST straight to /api/cashfree/create-order. These
  cover the rule where it is actually enforced.

  requireAccount takes an injectable verifier, so all of this runs with
  no Firebase Admin, no credentials and no network.
*/

import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { requireAccount, getBearerToken, isEnforced, isConfigured } = require("../api/_lib/account.js");

let passed = 0;
let failed = 0;

async function test(name, fn){
  const saved = {
    LUME_REQUIRE_ACCOUNT: process.env.LUME_REQUIRE_ACCOUNT,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY
  };
  try{
    await fn();
    passed += 1;
    console.log("  ✓ " + name);
  }catch(err){
    failed += 1;
    console.log("  ✗ " + name + "\n      " + (err && err.message || err));
  }finally{
    for(const [k, v] of Object.entries(saved)){
      if(v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function req(headers){ return { headers: headers || {} }; }
function bearer(token){ return req({ authorization: "Bearer " + token }); }

// Stands in for Firebase Admin's verifyIdToken.
function verifierFor(tokens){
  return async token => {
    if(!Object.prototype.hasOwnProperty.call(tokens, token)){
      throw new Error("Firebase ID token has invalid signature.");
    }
    return tokens[token];
  };
}

const GOOD = verifierFor({
  "good-token": { uid:"uid_123", email:"Client@Example.com", email_verified:true, name:"A Client" },
  "unverified-token": { uid:"uid_456", email:"new@example.com", email_verified:false, name:"New Client" }
});

console.log("\nthe account gate");

await test("a request with no Authorization header is refused", async () => {
  const result = await requireAccount(req(), { verifyIdToken: GOOD });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.code, "NO_ACCOUNT");
  // The client reads this, so it has to say what to do about it.
  assert.match(result.error, /sign in|account/i);
});

await test("a forged or expired token is refused", async () => {
  const result = await requireAccount(bearer("nonsense"), { verifyIdToken: GOOD });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.code, "INVALID_ACCOUNT");
});

await test("a token that verifies to no uid is refused", async () => {
  const result = await requireAccount(bearer("t"), { verifyIdToken: async () => ({ email:"x@y.z" }) });
  assert.equal(result.ok, false);
  assert.equal(result.code, "INVALID_ACCOUNT");
});

await test("a valid sign-in is accepted, and the email is normalised", async () => {
  const result = await requireAccount(bearer("good-token"), { verifyIdToken: GOOD });
  assert.equal(result.ok, true);
  assert.equal(result.account.uid, "uid_123");
  // Lower-cased so it matches how entitlements and coupons store it.
  assert.equal(result.account.email, "client@example.com");
  assert.equal(result.account.emailVerified, true);
  assert.equal(result.account.name, "A Client");
});

await test("an unverified email can still pay", async () => {
  // Deliberate: the verification mail goes out at sign-up, but someone
  // who hasn't opened their inbox yet is still someone trying to buy.
  const result = await requireAccount(bearer("unverified-token"), { verifyIdToken: GOOD });
  assert.equal(result.ok, true);
  assert.equal(result.account.uid, "uid_456");
  assert.equal(result.account.emailVerified, false);
});

await test("verification can be demanded where a flow needs it", async () => {
  const result = await requireAccount(bearer("unverified-token"), { verifyIdToken: GOOD, requireVerifiedEmail: true });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.code, "EMAIL_NOT_VERIFIED");
});

await test("missing Firebase credentials read as a server fault, not a bad sign-in", async () => {
  delete process.env.FIREBASE_PROJECT_ID;
  delete process.env.FIREBASE_CLIENT_EMAIL;
  delete process.env.FIREBASE_PRIVATE_KEY;
  process.env.LUME_REQUIRE_ACCOUNT = "1";

  // No injected verifier, so it has to fall back to the real one — which
  // it must not even attempt without credentials.
  const result = await requireAccount(bearer("good-token"));
  assert.equal(result.ok, false);
  // 503, not 401: telling a paying customer their sign-in is invalid
  // when the real problem is our deployment sends them round a loop
  // they cannot get out of.
  assert.equal(result.status, 503);
  assert.equal(result.code, "ACCOUNT_CHECK_UNAVAILABLE");
});

await test("the kill switch lifts the requirement", async () => {
  process.env.LUME_REQUIRE_ACCOUNT = "0";
  const result = await requireAccount(req(), { verifyIdToken: GOOD });
  assert.equal(result.ok, true);
  assert.equal(result.account, null);
  assert.equal(result.enforced, false);
});

await test("the requirement is on unless explicitly switched off", async () => {
  delete process.env.LUME_REQUIRE_ACCOUNT;
  assert.equal(isEnforced(), true, "an unset LUME_REQUIRE_ACCOUNT must mean enforced");
  for(const off of ["0", "false", "off", "no", "FALSE"]){
    process.env.LUME_REQUIRE_ACCOUNT = off;
    assert.equal(isEnforced(), false, off + " should switch it off");
  }
  for(const on of ["1", "true", "yes", "", "anything-else"]){
    process.env.LUME_REQUIRE_ACCOUNT = on;
    assert.equal(isEnforced(), true, JSON.stringify(on) + " should leave it on");
  }
});

await test("isConfigured reflects the three Firebase variables", async () => {
  process.env.FIREBASE_PROJECT_ID = "p";
  process.env.FIREBASE_CLIENT_EMAIL = "e";
  delete process.env.FIREBASE_PRIVATE_KEY;
  assert.equal(isConfigured(), false, "a missing private key is not configured");
  process.env.FIREBASE_PRIVATE_KEY = "k";
  assert.equal(isConfigured(), true);
});

console.log("\nreading the header");

await test("the bearer token is read, and nothing else is", async () => {
  assert.equal(getBearerToken(bearer("abc.def.ghi")), "abc.def.ghi");
  assert.equal(getBearerToken(req({ authorization: "bearer abc" })), "abc", "the scheme is case-insensitive");
  assert.equal(getBearerToken(req({ authorization: "Basic abc" })), "", "Basic auth is not a Lume Live account");
  assert.equal(getBearerToken(req({})), "");
  assert.equal(getBearerToken({}), "");
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
