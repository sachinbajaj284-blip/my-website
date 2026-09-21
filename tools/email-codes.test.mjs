/*
  Tests for the email sign-in code — run with:
    npm run authcodes:test

  These are the rules that stand between a six-digit number and someone
  else's account, so they are tested against a fake Firestore rather than
  trusted to review. The fake implements just enough of the real API —
  doc/get/set/delete and a transaction — for the module to run unchanged.
*/

import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.LUME_AUTH_CODE_PEPPER = "test-pepper-not-a-real-one";
const codes = require("../api/_lib/emailCodes.js");

let passed = 0;
let failed = 0;

async function test(name, fn){
  try{
    await fn();
    passed += 1;
    console.log("  ✓ " + name);
  }catch(err){
    failed += 1;
    console.log("  ✗ " + name + "\n      " + (err && err.message || err));
  }
}

// A Firestore that lives in a Map. runTransaction here is serial rather
// than optimistic, which is enough: what the tests care about is that
// the module reads, decides and writes inside one, not that this fake
// reproduces contention.
function fakeDb(){
  const docs = new Map();
  const api = {
    _docs: docs,
    collection(){
      return {
        doc(id){ return makeRef(id); }
      };
    },
    async runTransaction(fn){
      const tx = {
        async get(ref){ return ref.get(); },
        set(ref, value, options){
          const prev = (options && options.merge && docs.get(ref.id)) || {};
          docs.set(ref.id, Object.assign({}, prev, value));
        },
        delete(ref){ docs.delete(ref.id); }
      };
      return fn(tx);
    }
  };
  function makeRef(id){
    return {
      id,
      async get(){
        const data = docs.get(id);
        return { exists: data !== undefined, data: () => data };
      },
      async set(value){ docs.set(id, value); },
      async delete(){ docs.delete(id); }
    };
  }
  return api;
}

const EMAIL = "Someone@Example.com";

await test("a code is six digits, and the address's case does not matter", async () => {
  const store = fakeDb();
  const issued = await codes.issueCode(EMAIL, { store });
  assert.equal(issued.ok, true);
  assert.match(issued.code, /^\d{6}$/);
  // Issued for one spelling, accepted for another.
  const check = await codes.verifyCode("someone@example.com", issued.code, { store });
  assert.equal(check.ok, true);
});

await test("the code itself is never stored", async () => {
  const store = fakeDb();
  const issued = await codes.issueCode(EMAIL, { store });
  const stored = JSON.stringify(Array.from(store._docs.values()));
  assert.ok(!stored.includes(issued.code), "the plain code is in the document");
  assert.ok(!stored.toLowerCase().includes("someone@example.com"), "the address is in the document");
});

await test("a correct code works exactly once", async () => {
  const store = fakeDb();
  const issued = await codes.issueCode(EMAIL, { store });
  assert.equal((await codes.verifyCode(EMAIL, issued.code, { store })).ok, true);
  const again = await codes.verifyCode(EMAIL, issued.code, { store });
  assert.equal(again.ok, false);
  assert.equal(again.code, "NO_CODE");
});

await test("a code dies after ten minutes", async () => {
  const store = fakeDb();
  const issued = await codes.issueCode(EMAIL, { store, now: 1000 });
  const late = await codes.verifyCode(EMAIL, issued.code, { store, now: 1000 + codes.CODE_TTL_MS + 1 });
  assert.equal(late.ok, false);
  assert.equal(late.code, "EXPIRED");
});

await test("five wrong guesses and the code is gone, not merely refused", async () => {
  const store = fakeDb();
  const issued = await codes.issueCode(EMAIL, { store });
  const wrong = issued.code === "000000" ? "111111" : "000000";
  for(let i = 0; i < codes.MAX_ATTEMPTS; i += 1){
    const attempt = await codes.verifyCode(EMAIL, wrong, { store });
    assert.equal(attempt.ok, false);
  }
  // The right code no longer helps — the lockout is not a waiting game.
  const after = await codes.verifyCode(EMAIL, issued.code, { store });
  assert.equal(after.ok, false);
});

await test("a wrong guess says how many are left, so nobody is locked out by surprise", async () => {
  const store = fakeDb();
  const issued = await codes.issueCode(EMAIL, { store });
  const wrong = issued.code === "000000" ? "111111" : "000000";
  const first = await codes.verifyCode(EMAIL, wrong, { store });
  assert.equal(first.code, "WRONG_CODE");
  assert.equal(first.attemptsLeft, codes.MAX_ATTEMPTS - 1);
});

await test("asking again straight away keeps the code that was already sent", async () => {
  const store = fakeDb();
  const first = await codes.issueCode(EMAIL, { store, now: 5000 });
  const second = await codes.issueCode(EMAIL, { store, now: 5000 + 1000 });
  assert.equal(second.ok, false);
  assert.equal(second.code, "TOO_SOON");
  // And the first code still works — a resend must never quietly
  // invalidate the email the person is already reading.
  assert.equal((await codes.verifyCode(EMAIL, first.code, { store, now: 6000 })).ok, true);
});

await test("after the cooldown a new code replaces the old one", async () => {
  const store = fakeDb();
  // Forced values, so "the old one stopped working" is a statement about
  // the rule rather than about two random numbers happening to differ.
  const first = await codes.issueCode(EMAIL, { store, now: 0, codeForTest: "111111" });
  const second = await codes.issueCode(EMAIL, { store, now: codes.RESEND_COOLDOWN_MS + 1, codeForTest: "222222" });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);

  const old = await codes.verifyCode(EMAIL, "111111", { store, now: codes.RESEND_COOLDOWN_MS + 2 });
  assert.equal(old.ok, false, "the superseded code still worked");
  const current = await codes.verifyCode(EMAIL, "222222", { store, now: codes.RESEND_COOLDOWN_MS + 3 });
  assert.equal(current.ok, true, "the newest code should be the live one");
});

await test("a code that could not be emailed is thrown away, not left to block the retry", async () => {
  // The send happens after the write, so a failed send leaves a live
  // code nobody has seen. Left there, the next attempt is refused as a
  // resend and the person is told an email exists that does not.
  const store = fakeDb();
  const issued = await codes.issueCode(EMAIL, { store, now: 1000 });
  assert.equal(issued.ok, true);

  await codes.dropCode(EMAIL, { store });

  const retry = await codes.issueCode(EMAIL, { store, now: 1500 });
  assert.equal(retry.ok, true, "the retry was refused as a resend");
  // And the code from the email that never arrived is dead.
  const stale = await codes.verifyCode(EMAIL, issued.code, { store, now: 1600 });
  assert.equal(stale.ok, false);
});

await test("a code for one address does not open another", async () => {
  const store = fakeDb();
  const issued = await codes.issueCode("first@example.com", { store });
  const crossed = await codes.verifyCode("second@example.com", issued.code, { store });
  assert.equal(crossed.ok, false);
  assert.equal(crossed.code, "NO_CODE");
});

await test("an address is checked for shape, not for validity", () => {
  ["a@b.co", "someone@example.com", "first.last+tag@sub.domain.in"].forEach(good => {
    assert.ok(codes.looksLikeEmail(good), good + " should be accepted");
  });
  ["", "nope", "no@domain", "two@@example.com", "spaces in@example.com", "@example.com", "a@b."].forEach(bad => {
    assert.ok(!codes.looksLikeEmail(bad), bad + " should be rejected");
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
