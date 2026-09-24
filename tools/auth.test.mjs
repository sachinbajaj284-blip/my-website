/*
  Tests for lume-auth.js — run with:
    npm run auth:test

  The sign-in flow needs a real DOM and a real Firebase SDK, so the
  behaviour is exercised in a browser against a stubbed SDK rather than
  here. What is checked here is the shape of the file, and it exists
  because of one bug that shape alone would have caught.

  The whole module is a single IIFE. Two function declarations of one
  name in that scope are not two functions — the second one silently
  replaces the first, everywhere, including in calls written above it.
  That is how the old OTP resend countdown came to never run: it was called
  tickResend, and so was the email panel's, five hundred lines below.
  Nothing threw, nothing logged, the button simply stayed enabled.
*/

import fs from "node:fs";
import assert from "node:assert/strict";

const SOURCE = fs.readFileSync(new URL("../lume-auth.js", import.meta.url), "utf8");

let passed = 0;
let failed = 0;

function test(name, fn){
  try{
    fn();
    passed += 1;
    console.log("  ✓ " + name);
  }catch(err){
    failed += 1;
    console.log("  ✗ " + name + "\n      " + (err && err.message || err));
  }
}

// Declarations at the IIFE's own indentation — two spaces. Anything
// nested is in a scope of its own and may shadow freely.
function topLevelNames(keyword){
  const re = new RegExp("^  " + keyword + " ([A-Za-z_$][\\w$]*)", "gm");
  return Array.from(SOURCE.matchAll(re), m => m[1]);
}

function duplicates(names){
  const seen = new Set();
  const dupes = new Set();
  names.forEach(n => (seen.has(n) ? dupes.add(n) : seen.add(n)));
  return Array.from(dupes);
}

test("no function is declared twice in the module scope", () => {
  const dupes = duplicates(topLevelNames("function"));
  assert.deepEqual(dupes, [], "the second declaration silently replaces the first: " + dupes.join(", "));
});

test("no var is declared twice in the module scope", () => {
  const dupes = duplicates(topLevelNames("var"));
  assert.deepEqual(dupes, [], "re-declared and re-assigned on load: " + dupes.join(", "));
});

test("sign-in asks for an address and a password, and sign-up for a name too", () => {
  ["laName", "laEmail2", "laPass"].forEach(id => {
    assert.ok(SOURCE.includes('id="' + id + '"'), "missing the " + id + " field");
  });
  assert.ok(SOURCE.includes("signInWithEmailAndPassword"), "signing in uses Firebase's own password provider");
  assert.ok(SOURCE.includes("createUserWithEmailAndPassword"), "and so does signing up");
  assert.ok(SOURCE.includes("signInWithPopup"), "Continue with Google is still offered");
  assert.ok(SOURCE.includes("sendPasswordResetEmail"), "a forgotten password can be reset");
});

test("a new account gets its name and a verification email", () => {
  const flow = SOURCE.slice(SOURCE.indexOf("function signInWithPassword"), SOURCE.indexOf("function relabelNav"));
  assert.ok(flow.includes("updateProfile(user, { displayName: name })"), "the name typed at sign-up is put on the account");
  assert.ok(flow.includes("sendEmailVerification"), "the address is sent a verification link");
  assert.ok(flow.includes("showVerifyHelp"), "and the person is told where it went");
});

test("openAuth is claimed, so the old page modals stay shut", () => {
  assert.ok(SOURCE.includes("window.openAuth = openFallback"), "the page buttons call openAuth by name");
});

test("nothing reaches Firebase before the form is checked", () => {
  const flow = SOURCE.slice(SOURCE.indexOf("function signInWithPassword"), SOURCE.indexOf("function relabelNav"));
  const firstCall = flow.indexOf("ensureAuth()");
  assert.ok(firstCall > 0, "the sign-in goes through ensureAuth");
  const checks = flow.slice(0, firstCall);
  assert.ok(checks.includes("looksLikeEmail(email)"), "a malformed address is caught on the page");
  assert.ok(checks.includes("pass.length < 6"), "a new password shorter than Firebase allows is caught on the page");
  assert.ok(checks.includes("creating && !name"), "a sign-up without a name is caught on the page");
});

test("a password reset does not say whether an address has an account", () => {
  const reset = SOURCE.slice(SOURCE.indexOf("function sendReset"), SOURCE.indexOf("Continue with Google\n"));
  assert.ok(reset.includes("auth/user-not-found"), "an unknown address gets the same answer as a known one");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
