/*
  Tests for the referral ledger — run with:  npm run referrals:test

  These cover the rules that decide money: who a referral belongs to,
  when one stops being worth anything, and the four ways a farm tries to
  get paid twice. They run against the in-memory Firestore stub rather
  than the built-in-catalogue fallback the coupon tests use, because
  every rule here is a rule about *state* — "this person has already
  been counted" is not testable without somewhere to have counted them.
*/

import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { install } from "./firestore-stub.mjs";

// Must happen before anything requires firebase-admin.
const store = install();

const require = createRequire(import.meta.url);
const referrals = require("../api/_lib/referrals.js");

const { normalizeCode, isValidCode, makeCode, rewardFor, todayKey, publicStats,
        ensureCode, statsFor, lookupCode, recordQualified,
        normalizeUpi, isValidUpi, payoutSummary, requestPayout, settlePayout, listPayouts,
        friendsFor,
        normalizePhone, phoneKey, requiresPhone, bindPhone, PHONES, ATTRIBUTIONS,
        EARNINGS_CAP, DAILY_QUALIFY_LIMIT, HOLD_MS, MIN_PAYOUT, REFERRERS } = referrals;

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

/*
  Every referred account needs its own verified number now, so these two
  wrappers supply one derived from the uid. Tests that are ABOUT the
  phone gate call recordQualified/requestPayout directly instead.
*/
let phoneSeq = 6000000000;
const phones = new Map();
function phoneFor(uid){
  if(!phones.has(uid)) phones.set(uid, String(phoneSeq++));
  return phones.get(uid);
}
function qualify(args){
  return recordQualified(Object.assign({
    referredPhone: phoneFor(args.referredUid)
  }, args));
}
function askPayout(args){
  return requestPayout(Object.assign({ phone: phoneFor(args.uid) }, args));
}

// A code generator with no randomness, so a test can assert on the code
// instead of on a regex.
function fixedRandom(value){
  return () => value;
}

// Mint a referrer and hand back their code.
async function referrer(uid, name, suffix){
  const result = await ensureCode({ uid, name }, { random: fixedRandom(suffix) });
  return result.stats.code;
}

console.log("\ncode shape");

await test("normalisation matches the coupon field", () => {
  assert.equal(normalizeCode(" aar av-7k2 "), "AARAV7K2");
  assert.equal(normalizeCode("aarav7k2"), "AARAV7K2");
  assert.equal(normalizeCode(null), "");
});

await test("a code is between six and twelve characters", () => {
  assert.equal(isValidCode("AARAV7K2"), true);
  assert.equal(isValidCode("ABC"), false, "too short to be anyone's code");
  assert.equal(isValidCode("A".repeat(20)), true, "over-long input is truncated, not rejected");
});

await test("the code carries the student's own name", () => {
  assert.equal(makeCode("Aarav Sharma", fixedRandom("7K2P")), "AARA7K2P");
});

await test("a name with no usable letters falls back to the brand", () => {
  assert.equal(makeCode("+91 98765 43210", fixedRandom("7K2P")), "LUME7K2P");
  assert.equal(makeCode("", fixedRandom("7K2P")), "LUME7K2P");
  // Two letters is not a stem worth showing.
  assert.equal(makeCode("Jo", fixedRandom("7K2P")), "LUME7K2P");
});

await test("generated codes avoid characters that misread off a screen", () => {
  const code = makeCode("Aarav");
  assert.equal(/[BIOSZ0158]/.test(code.slice(4)), false,
    "the random half must not contain B, I, O, S, Z, 0, 1, 5 or 8: " + code);
});

console.log("\nreward maths");

await test("a referral is worth the tier amount", () => {
  assert.equal(rewardFor(0, 0), 50);
  assert.equal(rewardFor(3, 150), 50);
});

await test("the cap is never exceeded", () => {
  assert.equal(rewardFor(10, EARNINGS_CAP), 0);
  assert.equal(rewardFor(10, EARNINGS_CAP + 100), 0, "an over-cap balance cannot go negative");
});

await test("the last referral before the cap is worth the remainder", () => {
  assert.equal(rewardFor(5, EARNINGS_CAP - 20), 20);
});

await test("stats report what is left, not just what is earned", () => {
  const stats = publicStats({ code: "X", qualified: 2, earned: 100 });
  assert.equal(stats.remaining, EARNINGS_CAP - 100);
  assert.equal(stats.next_reward, 50);
});

await test("todayKey is a stable calendar day", () => {
  assert.equal(todayKey(Date.UTC(2026, 8, 21, 23, 59)), "2026-09-21");
});

console.log("\nminting");

await test("a code is minted once and reused after that", async () => {
  store.clear();
  const first = await ensureCode({ uid: "u1", name: "Aarav" }, { random: fixedRandom("7K2P") });
  assert.equal(first.created, true);
  assert.equal(first.stats.code, "AARA7K2P");

  // A different random source: a second mint would produce a different
  // code, so an unchanged one proves nothing was re-minted.
  const again = await ensureCode({ uid: "u1", name: "Aarav" }, { random: fixedRandom("ZZZZ") });
  assert.equal(again.created, false);
  assert.equal(again.stats.code, "AARA7K2P");
});

await test("a collision is retried rather than handed out twice", async () => {
  store.clear();
  await ensureCode({ uid: "u1", name: "Aarav" }, { random: fixedRandom("7K2P") });

  // Same name, and the first draw collides; the second must not.
  let draws = 0;
  const drift = () => (draws++ === 0 ? "7K2P" : "9M4Q");
  const second = await ensureCode({ uid: "u2", name: "Aarav" }, { random: drift });
  assert.equal(second.stats.code, "AARA9M4Q");
  assert.equal(draws, 2, "the taken code must have been retried");
});

await test("a code resolves back to the account that owns it", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  assert.deepEqual(await lookupCode(code), { code, uid: "u1" });
  assert.equal(await lookupCode("NOSUCH1"), null);
  assert.equal(await lookupCode("??"), null, "a malformed code is not a lookup");
});

await test("an account with no code has no stats", async () => {
  store.clear();
  assert.equal(await statsFor("nobody"), null);
});

console.log("\nqualifying");

await test("a real referral pays the referrer", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  const out = await qualify({ code, referredUid: "friend", event: "snapshot" });
  assert.equal(out.ok, true);
  assert.equal(out.amount, 50);
  assert.equal(out.stats.qualified, 1);
  assert.equal((await statsFor("u1")).earned, 50);
});

await test("the same friend never counts twice", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  await qualify({ code, referredUid: "friend", event: "snapshot" });
  const again = await qualify({ code, referredUid: "friend", event: "snapshot" });
  assert.equal(again.ok, false);
  assert.equal(again.reason, "ALREADY_ATTRIBUTED");
  assert.equal((await statsFor("u1")).earned, 50, "a replay must not pay twice");
});

await test("a friend already claimed by one referrer cannot be resold to another", async () => {
  store.clear();
  const a = await referrer("u1", "Aarav", "7K2P");
  const b = await referrer("u2", "Bhavya", "9M4Q");
  await qualify({ code: a, referredUid: "friend", event: "snapshot" });
  const poached = await qualify({ code: b, referredUid: "friend", event: "snapshot" });
  assert.equal(poached.ok, false);
  assert.equal(poached.reason, "ALREADY_ATTRIBUTED");
  assert.equal((await statsFor("u2")).earned, 0);
});

await test("nobody refers themselves", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  const out = await qualify({ code, referredUid: "u1", event: "snapshot" });
  assert.equal(out.reason, "SELF_REFERRAL");
  assert.equal((await statsFor("u1")).earned, 0);
});

await test("an unknown code pays nobody", async () => {
  store.clear();
  const out = await qualify({ code: "GHOST99", referredUid: "friend", event: "snapshot" });
  assert.equal(out.reason, "UNKNOWN_CODE");
});

await test("only an allow-listed event qualifies", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  const out = await qualify({ code, referredUid: "friend", event: "pageview" });
  assert.equal(out.reason, "EVENT_NOT_QUALIFYING");
  assert.equal((await statsFor("u1")).earned, 0,
    "a client must not be able to invent an event that pays");
});

await test("the daily limit stops a burst", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  const day = Date.UTC(2026, 8, 21, 10, 0);

  for(let i = 0; i < DAILY_QUALIFY_LIMIT; i++){
    const out = await qualify({ code, referredUid: "f" + i, event: "snapshot", now: day });
    assert.equal(out.ok, true, "referral " + i + " should have counted");
  }
  const blocked = await qualify({ code, referredUid: "one-too-many", event: "snapshot", now: day });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "DAILY_LIMIT");
});

await test("the daily limit resets the next day", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  const day1 = Date.UTC(2026, 8, 21, 10, 0);
  const day2 = Date.UTC(2026, 8, 22, 10, 0);

  for(let i = 0; i < DAILY_QUALIFY_LIMIT; i++){
    await qualify({ code, referredUid: "f" + i, event: "snapshot", now: day1 });
  }
  const tomorrow = await qualify({ code, referredUid: "later", event: "snapshot", now: day2 });
  assert.equal(tomorrow.ok, true);
  assert.equal(tomorrow.amount, 50);
});

await test("earning stops at the cap but the referral is still recorded", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  // Straight to the cap, so the next one is the interesting case.
  await store.seed(REFERRERS, "u1", {
    code, qualified: 6, earned: EARNINGS_CAP, day: "2000-01-01", day_count: 0
  });

  const out = await qualify({ code, referredUid: "friend", event: "snapshot" });
  assert.equal(out.ok, true);
  assert.equal(out.reason, "CAP_REACHED");
  assert.equal(out.amount, 0);

  const after = await statsFor("u1");
  assert.equal(after.earned, EARNINGS_CAP, "the cap must hold");
  assert.equal(after.qualified, 7, "the referral still counted, it just paid nothing");

  // And the friend is spent: they cannot be re-used once the cap lifts.
  const replay = await qualify({ code, referredUid: "friend", event: "snapshot" });
  assert.equal(replay.reason, "ALREADY_ATTRIBUTED");
});

await test("a missing account is refused before anything is read", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  const out = await qualify({ code, referredUid: "", event: "snapshot" });
  assert.equal(out.reason, "NO_ACCOUNT");
});

console.log("\nphone numbers");

await test("a number is the same number however it was typed", () => {
  assert.equal(normalizePhone("+91 98765 43210"), "9876543210");
  assert.equal(normalizePhone("09876543210"), "9876543210");
  assert.equal(normalizePhone("919876543210"), "9876543210");
  assert.equal(normalizePhone("98765-43210"), "9876543210");
  assert.equal(normalizePhone("12345"), "", "too short to be a number");
  assert.equal(normalizePhone(null), "");
});

await test("the same number hashes the same way, and different ones differ", () => {
  assert.equal(phoneKey("+919876543210"), phoneKey("09876543210"));
  assert.notEqual(phoneKey("9876543210"), phoneKey("9876543211"));
  assert.equal(phoneKey("nonsense"), "", "nothing to hash");
});

await test("a number is never stored in the clear", () => {
  const key = phoneKey("9876543210");
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(key.includes("9876543210"), false);
});

await test("the salt actually changes the hash", () => {
  // Without it the space of Indian mobile numbers is small enough to
  // enumerate, so a hash of an unsalted number is barely a hash.
  const before = process.env.LUME_PHONE_SALT;
  process.env.LUME_PHONE_SALT = "salt-one";
  const a = phoneKey("9876543210");
  process.env.LUME_PHONE_SALT = "salt-two";
  const b = phoneKey("9876543210");
  process.env.LUME_PHONE_SALT = before === undefined ? "" : before;
  assert.notEqual(a, b);
});

await test("first account to verify a number keeps it", async () => {
  store.clear();
  const first = await bindPhone({ uid: "u1", phone: "9876543210" });
  assert.equal(first.ok, true);

  const second = await bindPhone({ uid: "u2", phone: "+91 98765 43210" });
  assert.equal(second.ok, false);
  assert.equal(second.owner, "u1", "and it names who has it");
});

await test("re-binding a number to the same account is a no-op", async () => {
  store.clear();
  await bindPhone({ uid: "u1", phone: "9876543210" });
  const again = await bindPhone({ uid: "u1", phone: "9876543210" });
  assert.equal(again.ok, true, "safe to call on every request that carries one");
});

console.log("\nthe phone gate");

await test("the gate is on unless it is switched off", () => {
  assert.equal(requiresPhone(), true);
});

await test("a referred account with no verified number does not qualify", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  const out = await recordQualified({ code, referredUid: "friend", event: "snapshot" });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "PHONE_REQUIRED");
  assert.equal((await statsFor("u1")).earned, 0);
});

await test("one SIM cannot qualify two accounts", async () => {
  // The whole point. Ten throwaway emails, one phone, one referral.
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  const SIM = "9876543210";

  const first = await recordQualified({ code, referredUid: "friend1", event: "snapshot", referredPhone: SIM });
  assert.equal(first.ok, true);

  const second = await recordQualified({ code, referredUid: "friend2", event: "snapshot", referredPhone: SIM });
  assert.equal(second.ok, false);
  assert.equal(second.reason, "PHONE_ALREADY_USED");
  assert.equal((await statsFor("u1")).earned, 50, "paid once, for one person");
});

await test("a second account on the referrer's own phone is self-referral", async () => {
  // Named for what it is rather than as a phone problem, because that is
  // what it is: the same human, twice.
  store.clear();
  const code = await ensureCode({ uid: "u1", name: "Aarav", phone: "9876543210" },
    { random: () => "7K2P" }).then(r => r.stats.code);

  const out = await recordQualified({
    code, referredUid: "u1-alt", event: "snapshot", referredPhone: "+91 98765 43210"
  });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "SELF_REFERRAL");
});

await test("a qualified referral records which number paid for it", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  await recordQualified({ code, referredUid: "friend", event: "snapshot", referredPhone: "9876543210" });
  const row = store.read(ATTRIBUTIONS, "friend");
  assert.equal(row.phone_key, phoneKey("9876543210"), "so an audit can follow it later");
});

await test("with the gate switched off, a phoneless referral still counts", async () => {
  // The escape hatch: Firebase phone auth needs Blaze, an authorised
  // domain and a working reCAPTCHA, and if any is wrong every referral
  // silently stops qualifying.
  store.clear();
  process.env.LUME_REFERRAL_REQUIRE_PHONE = "0";
  try{
    const code = await referrer("u1", "Aarav", "7K2P");
    const out = await recordQualified({ code, referredUid: "friend", event: "snapshot" });
    assert.equal(out.ok, true);
    assert.equal(out.amount, 50);
  }finally{
    delete process.env.LUME_REFERRAL_REQUIRE_PHONE;
  }
  assert.equal(requiresPhone(), true, "and the gate is back on afterwards");
});

console.log("\nwho joined");

await test("only people who qualified are listed", async () => {
  // A row exists because a referral counted. Somebody who opened the link
  // and stopped leaves no trace, so this can never answer "who hasn't
  // taken it yet" — and nothing here pretends it can.
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  await qualify({ code, referredUid: "friend1", event: "snapshot" });
  await recordQualified({ code, referredUid: "nobody", event: "pageview",
    referredPhone: "9990001111" });

  const list = await friendsFor("u1");
  assert.equal(list.length, 1);
  assert.equal(list[0].uid, "friend1");
});

await test("newest first — the one they just earned is what they came for", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  const base = Date.now() - (30 * 24 * 60 * 60 * 1000);
  await qualify({ code, referredUid: "older", event: "snapshot", now: base });
  await qualify({ code, referredUid: "newer", event: "snapshot", now: base + 86400000 });

  const list = await friendsFor("u1");
  assert.deepEqual(list.map(f => f.uid), ["newer", "older"]);
});

await test("each row says whether it has cleared the hold", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  // OLD/NEW are declared further down the file; HOLD_MS is imported.
  await qualify({ code, referredUid: "matured", event: "snapshot", now: Date.now() - (HOLD_MS + 3600000) });
  await qualify({ code, referredUid: "fresh", event: "snapshot", now: Date.now() - 3600000 });

  const list = await friendsFor("u1");
  const by = Object.fromEntries(list.map(f => [f.uid, f]));
  assert.equal(by.matured.cleared, true);
  assert.equal(by.fresh.cleared, false, "this is the row that explains an unwithdrawable balance");
});

await test("one referrer never sees another's friends", async () => {
  store.clear();
  const a = await referrer("u1", "Aarav", "7K2P");
  const b = await referrer("u2", "Bhavya", "9M4Q");
  await qualify({ code: a, referredUid: "mine", event: "snapshot" });
  await qualify({ code: b, referredUid: "theirs", event: "snapshot" });

  assert.deepEqual((await friendsFor("u1")).map(f => f.uid), ["mine"]);
  assert.deepEqual((await friendsFor("u2")).map(f => f.uid), ["theirs"]);
});

await test("the ledger returns uids and never a name", async () => {
  // Resolving a uid to a person is Firebase Auth's job and the route's
  // decision. Keeping it out of here is what stops the ledger quietly
  // becoming a place third-party names live.
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  await qualify({ code, referredUid: "friend1", event: "snapshot" });

  const row = (await friendsFor("u1"))[0];
  assert.deepEqual(Object.keys(row).sort(), ["amount", "cleared", "created_at", "uid"]);
});

await test("a referral worth nothing still appears", async () => {
  // At the cap a referral is recorded and pays ₹0. The student should
  // still see that their friend joined.
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  await store.seed(REFERRERS, "u1", {
    code, qualified: 6, earned: EARNINGS_CAP, day: "2000-01-01", day_count: 0
  });
  await qualify({ code, referredUid: "capped", event: "snapshot" });

  const list = await friendsFor("u1");
  assert.equal(list.length, 1);
  assert.equal(list[0].amount, 0);
});

await test("an account with no referrals has an empty list, not an error", async () => {
  store.clear();
  assert.deepEqual(await friendsFor("nobody"), []);
  assert.deepEqual(await friendsFor(""), []);
});

console.log("\nwhat a friend's account may put on someone else's screen");

const { firstName } = require("../api/_lib/routes/referrals/friends.js");

await test("a first name, and only the first", () => {
  assert.equal(firstName("Aarav Sharma"), "Aarav", "a surname is more than the referrer needs");
  assert.equal(firstName("  Priya   Nair  "), "Priya");
  assert.equal(firstName("aarav"), "aarav");
});

await test("names that are not plain words still work", () => {
  assert.equal(firstName("D'Souza Maria"), "D'Souza");
  assert.equal(firstName("Jean-Luc Picard"), "Jean-Luc");
});

await test("an email typed into the name field is refused, not mangled", () => {
  // Stripping the punctuation would leave the local part sitting on
  // somebody else's dashboard looking like a name.
  assert.equal(firstName("aarav@gmail.com"), "");
  assert.equal(firstName("Aarav aarav@gmail.com"), "");
});

await test("a phone number typed into the name field is refused", () => {
  assert.equal(firstName("9876543210"), "");
  assert.equal(firstName("+91 98765 43210"), "");
});

await test("nothing usable resolves to nothing, and the page says 'A friend'", () => {
  for(const bad of ["", "   ", "J", "!", null, undefined]){
    assert.equal(firstName(bad), "", "leaked from: " + String(bad));
  }
});

await test("a long name cannot stretch the row", () => {
  assert.equal(firstName("A".repeat(200)).length, 24);
});

console.log("\npayout addresses");

await test("a UPI ID is recognised, and a non-address is not", () => {
  assert.equal(isValidUpi("aarav@okhdfcbank"), true);
  assert.equal(isValidUpi("9876543210@ybl"), true);
  assert.equal(isValidUpi("  Aarav@OKHDFCBANK  "), true, "trimmed and lowercased first");
  assert.equal(isValidUpi("aarav"), false, "no handle is not an address");
  assert.equal(isValidUpi("i'll tell you later"), false);
  assert.equal(isValidUpi(""), false);
  assert.equal(normalizeUpi("  Aarav@OKHDFCBank "), "aarav@okhdfcbank");
});

console.log("\nwhat a student may ask for");

// Enough qualified referrals to clear the minimum, dated `age` ago.
async function earn(code, count, age){
  const at = Date.now() - (age || 0);
  for(let i = 0; i < count; i++){
    await qualify({ code, referredUid: "f" + i + "_" + at, event: "snapshot", now: at + i });
  }
}

const OLD = HOLD_MS + (60 * 60 * 1000);   // matured
const NEW = 60 * 60 * 1000;               // still held

await test("fresh earnings are not payable until they have aged", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  await earn(code, 5, NEW);

  const summary = await payoutSummary("u1");
  assert.equal(summary.earned, 250, "earned immediately");
  assert.equal(summary.matured, 0, "but none of it has aged");
  assert.equal(summary.payable, 0);
  assert.equal(summary.can_request, false);
});

await test("earnings past the hold become payable", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  await earn(code, 5, OLD);

  const summary = await payoutSummary("u1");
  assert.equal(summary.matured, 250);
  assert.equal(summary.payable, 250);
  assert.equal(summary.can_request, true);
});

await test("a mix of held and matured earnings only offers the matured part", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  await earn(code, 4, OLD);   // 200, payable
  await earn(code, 2, NEW);   // 100, held
  const summary = await payoutSummary("u1");
  assert.equal(summary.earned, 300);
  assert.equal(summary.payable, 200);
});

await test("an account with no code has nothing to summarise", async () => {
  store.clear();
  assert.equal(await payoutSummary("nobody"), null);
});

console.log("\nrequesting a payout");

await test("a request below the minimum is refused", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  await earn(code, 2, OLD);   // ₹100, under MIN_PAYOUT
  const out = await askPayout({ uid: "u1", upi: "aarav@okhdfcbank", ageDeclared: true });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "MIN_NOT_MET");
  assert.equal(out.payable, 100);
  assert.ok(MIN_PAYOUT > 100, "this test assumes the minimum is above ₹100");
});

await test("a payout needs a verified number too", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  await earn(code, 5, OLD);
  const out = await requestPayout({ uid: "u1", upi: "aarav@okhdfcbank", ageDeclared: true });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "PHONE_REQUIRED");
  assert.equal((await listPayouts("pending")).length, 0, "and nothing is written");
});

await test("nobody is paid without being asked about their age", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  await earn(code, 5, OLD);
  const out = await askPayout({ uid: "u1", upi: "aarav@okhdfcbank", ageDeclared: false });
  assert.equal(out.reason, "AGE_NOT_DECLARED");
  assert.equal((await listPayouts("pending")).length, 0, "and nothing is written");
});

await test("a bad UPI address is refused before anything is written", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  await earn(code, 5, OLD);
  const out = await askPayout({ uid: "u1", upi: "pay me on whatsapp", ageDeclared: true });
  assert.equal(out.reason, "BAD_UPI");
  assert.equal((await listPayouts("pending")).length, 0);
});

await test("a good request is recorded and held against the balance", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  await earn(code, 5, OLD);

  const out = await askPayout({ uid: "u1", upi: "aarav@okhdfcbank", ageDeclared: true });
  assert.equal(out.ok, true);
  assert.equal(out.amount, 250);

  const pending = await listPayouts("pending");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].amount, 250);
  assert.equal(pending[0].upi, "aarav@okhdfcbank");
  assert.equal(pending[0].status, "pending");

  // The same money cannot also still be payable.
  const after = await payoutSummary("u1");
  assert.equal(after.pending, 250);
  assert.equal(after.payable, 0);
});

await test("a second request while one is pending is refused", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  await earn(code, 5, OLD);
  await askPayout({ uid: "u1", upi: "aarav@okhdfcbank", ageDeclared: true });

  const again = await askPayout({ uid: "u1", upi: "aarav@okhdfcbank", ageDeclared: true });
  assert.equal(again.ok, false);
  assert.equal(again.reason, "ALREADY_PENDING");
  assert.equal((await listPayouts("pending")).length, 1, "and no second row is written");
});

console.log("\nsettling a payout");

async function pendingPayout(){
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  await earn(code, 5, OLD);
  await askPayout({ uid: "u1", upi: "aarav@okhdfcbank", ageDeclared: true });
  return (await listPayouts("pending"))[0];
}

await test("marking a payout paid moves it out of pending and into paid", async () => {
  const row = await pendingPayout();
  const out = await settlePayout({ id: row.id, status: "paid", note: "UTR 12345" });
  assert.equal(out.ok, true);
  assert.equal(out.amount, 250);

  const summary = await payoutSummary("u1");
  assert.equal(summary.paid, 250);
  assert.equal(summary.pending, 0);
  assert.equal(summary.payable, 0, "paid money is not payable again");
  assert.equal((await listPayouts("pending")).length, 0);
  assert.equal((await listPayouts("paid")).length, 1);
});

await test("settling twice cannot pay twice", async () => {
  const row = await pendingPayout();
  await settlePayout({ id: row.id, status: "paid" });
  const again = await settlePayout({ id: row.id, status: "paid" });
  assert.equal(again.ok, false);
  assert.equal(again.reason, "ALREADY_SETTLED");
  assert.equal((await payoutSummary("u1")).paid, 250, "the CLI run twice must not double-pay");
});

await test("a rejection gives the money back rather than destroying it", async () => {
  const row = await pendingPayout();
  const out = await settlePayout({ id: row.id, status: "rejected", note: "looks like a farm" });
  assert.equal(out.ok, true);

  const summary = await payoutSummary("u1");
  assert.equal(summary.paid, 0, "nothing was transferred");
  assert.equal(summary.pending, 0, "and nothing is still being asked for");
  assert.equal(summary.payable, 250, "the student keeps what they earned");
});

await test("a rejected student can ask again", async () => {
  const row = await pendingPayout();
  await settlePayout({ id: row.id, status: "rejected" });
  const retry = await askPayout({ uid: "u1", upi: "aarav@okhdfcbank", ageDeclared: true });
  assert.equal(retry.ok, true);
  assert.equal(retry.amount, 250);
});

await test("settling something that does not exist is a named refusal", async () => {
  store.clear();
  const out = await settlePayout({ id: "nope_123", status: "paid" });
  assert.equal(out.reason, "NOT_FOUND");
});

console.log("");
console.log(passed + " passed, " + failed + " failed");
if(failed > 0) process.exit(1);
