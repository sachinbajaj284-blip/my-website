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
  const out = await recordQualified({ code, referredUid: "friend", event: "snapshot" });
  assert.equal(out.ok, true);
  assert.equal(out.amount, 50);
  assert.equal(out.stats.qualified, 1);
  assert.equal((await statsFor("u1")).earned, 50);
});

await test("the same friend never counts twice", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  await recordQualified({ code, referredUid: "friend", event: "snapshot" });
  const again = await recordQualified({ code, referredUid: "friend", event: "snapshot" });
  assert.equal(again.ok, false);
  assert.equal(again.reason, "ALREADY_ATTRIBUTED");
  assert.equal((await statsFor("u1")).earned, 50, "a replay must not pay twice");
});

await test("a friend already claimed by one referrer cannot be resold to another", async () => {
  store.clear();
  const a = await referrer("u1", "Aarav", "7K2P");
  const b = await referrer("u2", "Bhavya", "9M4Q");
  await recordQualified({ code: a, referredUid: "friend", event: "snapshot" });
  const poached = await recordQualified({ code: b, referredUid: "friend", event: "snapshot" });
  assert.equal(poached.ok, false);
  assert.equal(poached.reason, "ALREADY_ATTRIBUTED");
  assert.equal((await statsFor("u2")).earned, 0);
});

await test("nobody refers themselves", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  const out = await recordQualified({ code, referredUid: "u1", event: "snapshot" });
  assert.equal(out.reason, "SELF_REFERRAL");
  assert.equal((await statsFor("u1")).earned, 0);
});

await test("an unknown code pays nobody", async () => {
  store.clear();
  const out = await recordQualified({ code: "GHOST99", referredUid: "friend", event: "snapshot" });
  assert.equal(out.reason, "UNKNOWN_CODE");
});

await test("only an allow-listed event qualifies", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  const out = await recordQualified({ code, referredUid: "friend", event: "pageview" });
  assert.equal(out.reason, "EVENT_NOT_QUALIFYING");
  assert.equal((await statsFor("u1")).earned, 0,
    "a client must not be able to invent an event that pays");
});

await test("the daily limit stops a burst", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  const day = Date.UTC(2026, 8, 21, 10, 0);

  for(let i = 0; i < DAILY_QUALIFY_LIMIT; i++){
    const out = await recordQualified({ code, referredUid: "f" + i, event: "snapshot", now: day });
    assert.equal(out.ok, true, "referral " + i + " should have counted");
  }
  const blocked = await recordQualified({ code, referredUid: "one-too-many", event: "snapshot", now: day });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "DAILY_LIMIT");
});

await test("the daily limit resets the next day", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  const day1 = Date.UTC(2026, 8, 21, 10, 0);
  const day2 = Date.UTC(2026, 8, 22, 10, 0);

  for(let i = 0; i < DAILY_QUALIFY_LIMIT; i++){
    await recordQualified({ code, referredUid: "f" + i, event: "snapshot", now: day1 });
  }
  const tomorrow = await recordQualified({ code, referredUid: "later", event: "snapshot", now: day2 });
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

  const out = await recordQualified({ code, referredUid: "friend", event: "snapshot" });
  assert.equal(out.ok, true);
  assert.equal(out.reason, "CAP_REACHED");
  assert.equal(out.amount, 0);

  const after = await statsFor("u1");
  assert.equal(after.earned, EARNINGS_CAP, "the cap must hold");
  assert.equal(after.qualified, 7, "the referral still counted, it just paid nothing");

  // And the friend is spent: they cannot be re-used once the cap lifts.
  const replay = await recordQualified({ code, referredUid: "friend", event: "snapshot" });
  assert.equal(replay.reason, "ALREADY_ATTRIBUTED");
});

await test("a missing account is refused before anything is read", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  const out = await recordQualified({ code, referredUid: "", event: "snapshot" });
  assert.equal(out.reason, "NO_ACCOUNT");
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
    await recordQualified({ code, referredUid: "f" + i + "_" + at, event: "snapshot", now: at + i });
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
  const out = await requestPayout({ uid: "u1", upi: "aarav@okhdfcbank", ageDeclared: true });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "MIN_NOT_MET");
  assert.equal(out.payable, 100);
  assert.ok(MIN_PAYOUT > 100, "this test assumes the minimum is above ₹100");
});

await test("nobody is paid without being asked about their age", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  await earn(code, 5, OLD);
  const out = await requestPayout({ uid: "u1", upi: "aarav@okhdfcbank", ageDeclared: false });
  assert.equal(out.reason, "AGE_NOT_DECLARED");
  assert.equal((await listPayouts("pending")).length, 0, "and nothing is written");
});

await test("a bad UPI address is refused before anything is written", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  await earn(code, 5, OLD);
  const out = await requestPayout({ uid: "u1", upi: "pay me on whatsapp", ageDeclared: true });
  assert.equal(out.reason, "BAD_UPI");
  assert.equal((await listPayouts("pending")).length, 0);
});

await test("a good request is recorded and held against the balance", async () => {
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  await earn(code, 5, OLD);

  const out = await requestPayout({ uid: "u1", upi: "aarav@okhdfcbank", ageDeclared: true });
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
  await requestPayout({ uid: "u1", upi: "aarav@okhdfcbank", ageDeclared: true });

  const again = await requestPayout({ uid: "u1", upi: "aarav@okhdfcbank", ageDeclared: true });
  assert.equal(again.ok, false);
  assert.equal(again.reason, "ALREADY_PENDING");
  assert.equal((await listPayouts("pending")).length, 1, "and no second row is written");
});

console.log("\nsettling a payout");

async function pendingPayout(){
  store.clear();
  const code = await referrer("u1", "Aarav", "7K2P");
  await earn(code, 5, OLD);
  await requestPayout({ uid: "u1", upi: "aarav@okhdfcbank", ageDeclared: true });
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
  const retry = await requestPayout({ uid: "u1", upi: "aarav@okhdfcbank", ageDeclared: true });
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
