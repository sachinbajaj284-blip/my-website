/*
  Tests for the browser half of referrals — run with:
    npm run referrals:client:test

  lume-referral.js decides two things that are easy to get quietly wrong
  and impossible to notice in production: which code a browser is
  carrying, and what URL ends up inside the QR on a story card. Both are
  pure string work over localStorage, so they need no DOM — just a fresh
  module instance per case with storage we control.

  The module is loaded in a vm rather than imported, because everything
  it does happens once, on load, against whatever window it finds.
*/

import vm from "node:vm";
import fs from "node:fs";
import assert from "node:assert/strict";

const SOURCE = fs.readFileSync(new URL("../lume-referral.js", import.meta.url), "utf8");

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

// A localStorage that behaves, plus a switch to make it throw the way a
// private window or a full quota does.
function storage(initial){
  const map = new Map(Object.entries(initial || {}));
  return {
    throws: false,
    getItem(k){ if(this.throws) throw new Error("denied"); return map.has(k) ? map.get(k) : null; },
    setItem(k, v){ if(this.throws) throw new Error("denied"); map.set(k, String(v)); },
    removeItem(k){ if(this.throws) throw new Error("denied"); map.delete(k); },
    _map: map
  };
}

// Load the module against a window we built, and hand back its API.
function load({ search, store }){
  const win = {
    location: { search: search || "", origin: "https://lumelive.co.in", pathname: "/start.html" },
    localStorage: store || storage(),
    URLSearchParams
  };
  const sandbox = { window: win, URLSearchParams, fetch: () => Promise.reject(new Error("no network")), console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox);
  return { api: win.LumeReferral, win };
}

function stash(code, ts){
  return { lumeRefInbound: JSON.stringify({ code, ts: ts == null ? Date.now() : ts }) };
}

console.log("\ninbound capture");

test("a code in the URL is picked up", () => {
  const { api } = load({ search: "?ref=AARA7K2P" });
  assert.equal(api.inbound(), "AARA7K2P");
});

test("a code is normalised the way the server will read it", () => {
  const { api } = load({ search: "?ref=aara-7k2p" });
  assert.equal(api.inbound(), "AARA7K2P");
});

test("something too short to be a code is ignored", () => {
  const { api } = load({ search: "?ref=AB" });
  assert.equal(api.inbound(), "");
});

test("no parameter and no stash means no code", () => {
  const { api } = load({ search: "" });
  assert.equal(api.inbound(), "");
});

test("first touch wins — a second link does not steal the referral", () => {
  const { api } = load({ search: "?ref=SECOND22", store: storage(stash("FIRST11")) });
  assert.equal(api.inbound(), "FIRST11",
    "the friend who actually got them here keeps the referral");
});

test("a stash older than the window is dropped", () => {
  const stale = Date.now() - (31 * 24 * 60 * 60 * 1000);
  const { api } = load({ search: "", store: storage(stash("OLD1234", stale)) });
  assert.equal(api.inbound(), "");
});

test("a stash inside the window still counts", () => {
  const recent = Date.now() - (29 * 24 * 60 * 60 * 1000);
  const { api } = load({ search: "", store: storage(stash("NEW1234", recent)) });
  assert.equal(api.inbound(), "NEW1234");
});

test("an expired stash does not block a fresh code", () => {
  const stale = Date.now() - (31 * 24 * 60 * 60 * 1000);
  const { api } = load({ search: "?ref=FRESH11", store: storage(stash("OLD1234", stale)) });
  assert.equal(api.inbound(), "FRESH11");
});

test("forget() clears the stash", () => {
  const { api } = load({ search: "?ref=AARA7K2P" });
  api.forget();
  assert.equal(api.inbound(), "");
});

console.log("\nstorage that refuses");

test("a localStorage that throws does not take the page down", () => {
  const store = storage();
  store.throws = true;
  // Loading is the risky part: capture() runs on load.
  const { api } = load({ search: "?ref=AARA7K2P", store });
  assert.equal(api.mine(), "");
  assert.equal(api.stats(), null);
  assert.equal(api.decorate("https://x.co/a"), "https://x.co/a");
});

test("a referral survives in memory when it cannot be written down", () => {
  // Private window, blocked cookies, full quota. The referral is still
  // real for the rest of this page view — and a quiz is usually finished
  // on the page the link landed on, so it is still claimable.
  const store = storage();
  store.throws = true;
  const { api } = load({ search: "?ref=AARA7K2P", store });
  assert.equal(api.inbound(), "AARA7K2P");
  api.forget();
  assert.equal(api.inbound(), "", "and forgetting still forgets it");
});

test("corrupt JSON in storage is survivable", () => {
  const { api } = load({ search: "", store: storage({ lumeRefInbound: "{not json" }) });
  assert.equal(api.inbound(), "");
});

console.log("\ndecorating a share URL");

const decorate = load({ search: "" }).api.decorate;

test("a code is appended to a clean URL", () => {
  assert.equal(decorate("https://x.co/a.html", "AARA7K2P"), "https://x.co/a.html?ref=AARA7K2P");
});

test("an existing query is preserved", () => {
  assert.equal(decorate("https://x.co/a.html?lang=hi", "AARA7K2P"),
    "https://x.co/a.html?lang=hi&ref=AARA7K2P");
});

test("a stale ref is replaced, not duplicated", () => {
  // The shared-laptop case: the cache briefly holds the previous
  // student's code and the fetched one has to win.
  assert.equal(decorate("https://x.co/a.html?ref=OLD12345", "AARA7K2P"),
    "https://x.co/a.html?ref=AARA7K2P");
});

test("a stale ref in the middle of a query is replaced in place", () => {
  assert.equal(decorate("https://x.co/a.html?ref=OLD12345&lang=hi", "AARA7K2P"),
    "https://x.co/a.html?lang=hi&ref=AARA7K2P");
});

test("no code means the URL comes back untouched", () => {
  assert.equal(decorate("https://x.co/a.html", ""), "https://x.co/a.html");
  assert.equal(decorate("https://x.co/a.html?ref=OLD12345", ""), "https://x.co/a.html?ref=OLD12345",
    "with nothing to put there, an existing ref is left alone rather than stripped");
});

test("an empty URL stays empty", () => {
  assert.equal(decorate("", "AARA7K2P"), "");
  assert.equal(decorate(null, "AARA7K2P"), "");
});

test("decorating twice is stable", () => {
  const once = decorate("https://x.co/a.html", "AARA7K2P");
  assert.equal(decorate(once, "AARA7K2P"), once);
});

console.log("\nthe invite message");

const invite = load({ search: "" }).api.inviteMessage;

test("the link is in the message", () => {
  assert.ok(invite("en", "https://x.co/a?ref=AARA7K2P").includes("https://x.co/a?ref=AARA7K2P"));
  assert.ok(invite("hi", "https://x.co/a?ref=AARA7K2P").includes("https://x.co/a?ref=AARA7K2P"));
});

test("Hindi and English are actually different", () => {
  assert.notEqual(invite("en", "u"), invite("hi", "u"));
});

test("the invite does not mention the reward", () => {
  // A friend asked for a favour converts worse than a friend given
  // something. The reward is the referrer's business.
  for(const lang of ["en", "hi"]){
    const text = invite(lang, "https://x.co/a");
    assert.equal(/₹|\brs\b|credit|cash/i.test(text), false,
      lang + " invite must not mention money: " + text);
  }
});

console.log("");
console.log(passed + " passed, " + failed + " failed");
if(failed > 0) process.exit(1);
