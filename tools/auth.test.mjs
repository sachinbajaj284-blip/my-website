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
  That is how the OTP resend countdown came to never run: it was called
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

test("sign-in asks for a name, a number and an OTP", () => {
  ["laName", "laPhone2", "laOtp"].forEach(id => {
    assert.ok(SOURCE.includes('id="' + id + '"'), "missing the " + id + " field");
  });
  assert.ok(SOURCE.includes("signInWithPhoneNumber"), "the OTP is what signs anyone in");
});

test("nothing signs anyone in with a password", () => {
  assert.ok(!SOURCE.includes("createUserWithEmailAndPassword"), "an account is a number now");
  assert.ok(!SOURCE.includes("signInWithEmailAndPassword"), "an account is a number now");
});

test("openAuth is claimed, so the old page modals stay shut", () => {
  assert.ok(SOURCE.includes("window.openAuth = openFallback"), "the page buttons call openAuth by name");
});

test("an SMS needs its reCAPTCHA built fresh per attempt", () => {
  // A solved verifier cannot be reused: the second send fails with
  // captcha-check-failed, which reads as a broken Send-again button.
  const send = SOURCE.slice(SOURCE.indexOf("function sendOtp"), SOURCE.indexOf("function confirmOtp"));
  assert.ok(send.includes("new authMod.RecaptchaVerifier"), "the verifier is built inside the send");
  assert.ok(send.includes("EL.verifier.clear()"), "the previous one is cleared first");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
