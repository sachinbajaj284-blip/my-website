/*
  Tests for the coupon rules — run with:  npm run coupons:test

  These cover the logic that decides money: which codes apply to which
  packs, when a code stops working, and exactly what the client is
  charged. Everything here runs against the built-in catalogue with no
  Firestore, which is also the path a fresh deploy takes.
*/

import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { install } from "./firestore-stub.mjs";

// Must happen before coupons.js is loaded: it caches "Firestore is
// unavailable" the first time the module fails to load.
const store = install();

const require = createRequire(import.meta.url);
const coupons = require("../api/_lib/coupons.js");
const { getProduct, SKU_PRICES } = require("../api/_lib/catalog.js");

const { normalizeCode, normalizeCoupon, checkCoupon, checkCustomerRules, discountFor, quote,
        appliesToPack, identityKeys, recordRedemption, DEFAULT_COUPONS } = coupons;

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

function coupon(overrides){
  return normalizeCoupon(Object.assign({
    code: "TEST50",
    discount_type: "percentage",
    discount_value: 50,
    applicable_packs: ["wellness-session"],
    is_active: true,
    expiration_date: null,
    usage_limit: null,
    times_used: 0
  }, overrides));
}

const wellness = getProduct("wellness-session");

console.log("\ncode normalisation");

await test("uppercases and strips punctuation", () => {
  assert.equal(normalizeCode(" first-50 "), "FIRST50");
  assert.equal(normalizeCode("First 50"), "FIRST50");
});

await test("survives junk input without throwing", () => {
  assert.equal(normalizeCode(null), "");
  assert.equal(normalizeCode(undefined), "");
  assert.equal(normalizeCode(12345), "12345");
  assert.equal(normalizeCode("!!!"), "");
});

await test("caps length so it can't overflow a document id", () => {
  assert.equal(normalizeCode("A".repeat(200)).length, 32);
});

console.log("\nvalidation rules");

await test("a good code on the right pack passes", () => {
  const v = checkCoupon(coupon(), wellness, "wellness-session");
  assert.equal(v.ok, true);
});

await test("an unknown code is rejected with a spelling hint", () => {
  const v = checkCoupon(null, wellness, "wellness-session");
  assert.equal(v.ok, false);
  assert.equal(v.reason, "not_found");
  assert.match(v.message, /check the spelling/i);
});

await test("a switched-off code is rejected", () => {
  const v = checkCoupon(coupon({ is_active: false }), wellness, "wellness-session");
  assert.equal(v.reason, "inactive");
});

await test("a past expiry date is rejected", () => {
  const v = checkCoupon(coupon({ expiration_date: "2020-01-01T00:00:00Z" }), wellness, "wellness-session");
  assert.equal(v.reason, "expired");
  assert.equal(v.message, "This code has expired.");
});

await test("a future expiry date still passes", () => {
  const v = checkCoupon(coupon({ expiration_date: "2099-01-01T00:00:00Z" }), wellness, "wellness-session");
  assert.equal(v.ok, true);
});

await test("expiry is evaluated at the moment of the check, not at load", () => {
  const c = coupon({ expiration_date: "2026-06-01T00:00:00Z" });
  assert.equal(checkCoupon(c, wellness, "wellness-session", new Date("2026-05-31T00:00:00Z")).ok, true);
  assert.equal(checkCoupon(c, wellness, "wellness-session", new Date("2026-06-02T00:00:00Z")).reason, "expired");
});

await test("an unreadable expiry date does not kill the offer", () => {
  const v = checkCoupon(coupon({ expiration_date: "not a date" }), wellness, "wellness-session");
  assert.equal(v.ok, true);
});

await test("a fully claimed code is rejected", () => {
  const v = checkCoupon(coupon({ usage_limit: 10, times_used: 10 }), wellness, "wellness-session");
  assert.equal(v.reason, "limit_reached");
});

await test("one use left still passes", () => {
  const v = checkCoupon(coupon({ usage_limit: 10, times_used: 9 }), wellness, "wellness-session");
  assert.equal(v.ok, true);
});

await test("the wrong pack is rejected, and the message names the item", () => {
  const report = getProduct("student-full-report");
  const v = checkCoupon(coupon(), report, "student-full-report");
  assert.equal(v.reason, "not_applicable");
  assert.match(v.message, /Full Clarity Report/);
});

await test("an empty pack list means every pack", () => {
  assert.equal(appliesToPack(coupon({ applicable_packs: [] }), "internship-1-month"), true);
  assert.equal(appliesToPack(coupon(), "internship-1-month"), false);
});

await test("a minimum spend is enforced", () => {
  const v = checkCoupon(coupon({ min_amount: 1000 }), wellness, "wellness-session");
  assert.equal(v.reason, "below_minimum");
  assert.match(v.message, /1,000/);
});

console.log("\ndiscount maths");

await test("50% of ₹499 is ₹250 off, ₹249 payable", () => {
  assert.equal(discountFor(coupon(), 499), 250);
});

await test("a flat discount comes off at face value", () => {
  assert.equal(discountFor(coupon({ discount_type: "flat", discount_value: 200 }), 999), 200);
});

await test("a flat discount larger than the price leaves ₹1 payable", () => {
  assert.equal(discountFor(coupon({ discount_type: "flat", discount_value: 5000 }), 499), 498);
});

await test("100% off still leaves ₹1 payable — nothing reaches ₹0", () => {
  assert.equal(discountFor(coupon({ discount_value: 100 }), 499), 498);
});

await test("a negative discount value cannot become a surcharge", () => {
  assert.equal(discountFor(coupon({ discount_value: -50 }), 499), 0);
  assert.equal(discountFor(coupon({ discount_type: "flat", discount_value: -200 }), 499), 0);
});

await test("no coupon means no discount", () => {
  assert.equal(discountFor(null, 499), 0);
});

console.log("\nend-to-end quotes (built-in catalogue, no Firestore)");

await test("FIRST50 on the wellness session: ₹499 → ₹249", async () => {
  const q = await quote({ code: "FIRST50", packId: "wellness-session" });
  assert.equal(q.ok, true);
  assert.equal(q.reason, "applied");
  assert.equal(q.base_amount, 499);
  assert.equal(q.discount_amount, 250);
  assert.equal(q.final_amount, 249);
  assert.equal(q.coupon.code, "FIRST50");
});

await test("FIRST50 typed sloppily still works", async () => {
  const q = await quote({ code: " first50 ", packId: "wellness-session" });
  assert.equal(q.final_amount, 249);
});

await test("FIRST50 on the ₹999 report is refused, price unchanged", async () => {
  const q = await quote({ code: "FIRST50", packId: "student-full-report" });
  assert.equal(q.ok, false);
  assert.equal(q.reason, "not_applicable");
  assert.equal(q.final_amount, 999);
  assert.equal(q.discount_amount, 0);
});

await test("only the intended codes are live", () => {
  const live = DEFAULT_COUPONS.filter(c => c.is_active !== false).map(c => c.code);
  assert.deepEqual(live, ["FIRST50", "CLARITY100"]);
});

await test("CLARITY100 cannot go live without the account it was issued to", () => {
  const clarity = DEFAULT_COUPONS.find(c => c.code === "CLARITY100");
  const restricted = Array.isArray(clarity.restricted_to_emails) && clarity.restricted_to_emails.length > 0;
  // The report checkout shows its coupon box to everyone, so an active
  // 100%-off code with no named recipient is claimable by whoever types
  // the string first. One of the two has to be true.
  assert.ok(clarity.is_active === false || restricted,
    "CLARITY100 is active with an empty restricted_to_emails — it would be free to whoever guesses the code");
});

await test("FIRST50 is the only offer advertised on the site", () => {
  // `promote` is what puts a code on the page. CLARITY100 is a one-use
  // 100%-off code handed to one person: advertising it would mean the
  // first stranger to read a badge claims the free report.
  const promoted = DEFAULT_COUPONS.filter(c => c.promote).map(c => c.code);
  assert.deepEqual(promoted, ["FIRST50"]);
});

await test("a switched-off code leaves every other SKU at full price", async () => {
  for(const [code, sku, price] of [
    ["CAREER30", "student-full-report", 999],
    ["PARENT200", "student-full-report", 999],
    ["REFER200", "student-full-report", 999],
    ["INTERN500", "internship-1-month", 3499],
    ["MIND50", "wellness-session", 499]
  ]){
    const q = await quote({ code, packId: sku });
    assert.equal(q.ok, false, code + " should be refused");
    assert.equal(q.reason, "inactive", code + " reason");
    assert.equal(q.final_amount, price, code + " must not discount " + sku);
  }
});

await test("a made-up code leaves the price alone", async () => {
  const q = await quote({ code: "TOTALLYFAKE", packId: "wellness-session" });
  assert.equal(q.ok, false);
  assert.equal(q.reason, "not_found");
  assert.equal(q.final_amount, 499);
});

await test("no code at all quotes the list price", async () => {
  const q = await quote({ code: "", packId: "wellness-session" });
  assert.equal(q.ok, true);
  assert.equal(q.reason, "no_coupon");
  assert.equal(q.final_amount, 499);
  assert.equal(q.coupon, null);
});

await test("an unknown pack never produces a price", async () => {
  const q = await quote({ code: "FIRST50", packId: "not-a-real-pack" });
  assert.equal(q.ok, false);
  assert.equal(q.reason, "unknown_pack");
  assert.equal(q.final_amount, null);
});

await test("the counselling session lists at ₹499", () => {
  assert.equal(getProduct("wellness-session").amount, 499);
});

await test("the retired ₹49 intro session can no longer be ordered", async () => {
  assert.equal(getProduct("intro-session"), null);
  const q = await quote({ code: "", packId: "intro-session" });
  assert.equal(q.reason, "unknown_pack");
  assert.equal(q.final_amount, null);
});

console.log("\nper-customer rules (against the in-memory Firestore)");

const ALICE = { phone: "9876543210", email: "Alice@Example.com" };
const BOB = { phone: "9000000001", email: "bob@example.com" };

await test("identity is phone AND email, normalised", () => {
  assert.deepEqual(identityKeys(ALICE), ["p_9876543210", "e_alice@example.com"]);
  assert.deepEqual(identityKeys({ phone: "+91 90000 00001" }), ["p_9000000001"]);
  assert.deepEqual(identityKeys({}), []);
});

await test("the guest placeholder phone is not a person", () => {
  // create-order sends 9999999999 for phone-less guests. Counting it as an
  // identity would make every guest the same customer and burn the limit.
  assert.deepEqual(identityKeys({ phone: "9999999999" }), []);
});

await test("a first-time customer gets FIRST50", async () => {
  store.clear();
  const q = await quote({ code: "FIRST50", packId: "wellness-session", customer: ALICE });
  assert.equal(q.ok, true);
  assert.equal(q.final_amount, 249);
});

await test("the price is shown before contact details are known", async () => {
  // The checkout draws a price before it asks for a phone number, so the
  // per-person rules cannot run yet. create-order is the real gate.
  store.clear();
  const q = await quote({ code: "FIRST50", packId: "wellness-session", customer: {} });
  assert.equal(q.ok, true);
  assert.equal(q.final_amount, 249);
});

await test("the same person cannot use FIRST50 twice", async () => {
  store.clear();
  await recordRedemption({ code: "FIRST50", orderId: "lume_a1", sku: "wellness-session",
                           amount: 249, discount: 250, customer: ALICE });
  const q = await quote({ code: "FIRST50", packId: "wellness-session", customer: ALICE });
  assert.equal(q.ok, false);
  assert.equal(q.reason, "per_customer_limit");
  assert.equal(q.message, "You've already used this code.");
  assert.equal(q.final_amount, 499);
});

await test("a different person is unaffected by someone else's redemption", async () => {
  const q = await quote({ code: "FIRST50", packId: "wellness-session", customer: BOB });
  assert.equal(q.ok, true);
  assert.equal(q.final_amount, 249);
});

await test("swapping the email but keeping the phone does not reset the limit", async () => {
  const q = await quote({ code: "FIRST50", packId: "wellness-session",
                          customer: { phone: ALICE.phone, email: "alice2@example.com" } });
  assert.equal(q.reason, "per_customer_limit");
});

await test("swapping the phone but keeping the email does not reset the limit", async () => {
  const q = await quote({ code: "FIRST50", packId: "wellness-session",
                          customer: { phone: "9111111111", email: ALICE.email } });
  assert.equal(q.reason, "per_customer_limit");
});

await test("redemption is counted once per order, however often it is polled", async () => {
  store.clear();
  await recordRedemption({ code: "FIRST50", orderId: "lume_dup", sku: "wellness-session", customer: ALICE });
  await recordRedemption({ code: "FIRST50", orderId: "lume_dup", sku: "wellness-session", customer: ALICE });
  await recordRedemption({ code: "FIRST50", orderId: "lume_dup", sku: "wellness-session", customer: ALICE });
  assert.equal(store.read("couponCustomers", "FIRST50__p_9876543210").count, 1);
  assert.equal(store.read("coupons", "FIRST50").times_used, 1);
});

await test("someone who already paid full price for a session is not a first-timer", async () => {
  store.clear();
  // No coupon was ever used — only an entitlement exists. per_customer_limit
  // alone would happily hand them a "first session" discount.
  store.seed("entitlements", "lume_old", {
    orderId: "lume_old", sku: "wellness-session", status: "PAID",
    phone: ALICE.phone, email: null, updatedAt: "2026-01-01T00:00:00Z"
  });
  const q = await quote({ code: "FIRST50", packId: "wellness-session", customer: ALICE });
  assert.equal(q.ok, false);
  assert.equal(q.reason, "not_first_time");
  assert.equal(q.message, "This code is only for your first session.");
  assert.equal(q.final_amount, 499);
});

await test("someone who took the retired ₹49 intro session is not a first-timer", async () => {
  store.clear();
  // Matched on email alone, and stored lowercased the way
  // recordPaidEntitlement writes it.
  store.seed("entitlements", "lume_legacy", {
    orderId: "lume_legacy", sku: "intro-session", status: "PAID",
    phone: null, email: ALICE.email.toLowerCase(), updatedAt: "2025-01-01T00:00:00Z"
  });
  const q = await quote({ code: "FIRST50", packId: "wellness-session", customer: ALICE });
  assert.equal(q.reason, "not_first_time");
});

await test("an unrelated past purchase does not disqualify anyone", async () => {
  store.clear();
  store.seed("entitlements", "lume_pdf", {
    orderId: "lume_pdf", sku: "parents-handbook", status: "PAID",
    phone: ALICE.phone, email: null, updatedAt: "2026-01-01T00:00:00Z"
  });
  const q = await quote({ code: "FIRST50", packId: "wellness-session", customer: ALICE });
  assert.equal(q.ok, true);
  assert.equal(q.final_amount, 249);
});

await test("an unpaid past order does not disqualify anyone", async () => {
  store.clear();
  store.seed("entitlements", "lume_pending", {
    orderId: "lume_pending", sku: "wellness-session", status: "PENDING",
    phone: ALICE.phone, email: null, updatedAt: "2026-01-01T00:00:00Z"
  });
  const q = await quote({ code: "FIRST50", packId: "wellness-session", customer: ALICE });
  assert.equal(q.ok, true);
});

/*
  CLARITY100 is live and issued to one account. These run against the
  shipped definition with no Firestore override, so they assert the real
  production configuration rather than a convenient stand-in.
*/
const CLARITY = DEFAULT_COUPONS.find(c => c.code === "CLARITY100");
const INVITED = { phone: "9811111111", email: CLARITY.restricted_to_emails[0] };
const UNINVITED = { phone: "9822222222", email: "someone@example.com" };

await test("CLARITY100 takes the ₹999 report down to the ₹1 the gateway needs", async () => {
  store.clear();
  const q = await quote({ code: "CLARITY100", packId: "student-full-report", customer: INVITED });
  assert.equal(q.ok, true);
  assert.equal(q.reason, "applied");
  assert.equal(q.base_amount, 999);
  // Not ₹0: Cashfree refuses a zero-value order, so MIN_CHARGE stays payable.
  assert.equal(q.final_amount, 1);
  assert.equal(q.discount_amount, 998);
});

await test("CLARITY100 is refused for anyone but the account it was issued to", async () => {
  store.clear();
  const q = await quote({ code: "CLARITY100", packId: "student-full-report", customer: UNINVITED });
  assert.equal(q.ok, false);
  assert.equal(q.reason, "not_invited");
  assert.equal(q.final_amount, 999, "and they are quoted the full price");

  // Not signed in at all: the code must not fall open.
  const anon = await quote({ code: "CLARITY100", packId: "student-full-report" });
  assert.equal(anon.ok, false);
  assert.equal(anon.reason, "not_invited");
});

await test("CLARITY100 is issued to exactly one account", () => {
  assert.equal(CLARITY.is_active, true);
  assert.equal(CLARITY.restricted_to_emails.length, 1,
    "one invitation code, one recipient — a second address doubles what it gives away");
  // Stored lower-cased, because that is how the verified token's email is
  // normalised before it is compared.
  assert.equal(CLARITY.restricted_to_emails[0], CLARITY.restricted_to_emails[0].toLowerCase());
});

await test("CLARITY100 is one use in total, and only on the clarity report", async () => {
  const clarity = DEFAULT_COUPONS.find(c => c.code === "CLARITY100");
  assert.equal(clarity.usage_limit, 1, "one use across everybody, for ever");
  assert.equal(clarity.per_customer_limit, 1);
  assert.deepEqual(clarity.applicable_packs, ["student-full-report"]);
  assert.equal(clarity.promote, false, "a free-report code must never be advertised");

  // It buys nothing else, at any price, even switched on.
  for(const sku of ["wellness-session", "career-intelligence-roadmap", "internship-1-month", "parents-handbook"]){
    store.clear();
    const q = await quote({ code: "CLARITY100", packId: sku, customer: INVITED });
    assert.equal(q.ok, false, sku + " must not accept CLARITY100");
    assert.equal(q.reason, "not_applicable");
    assert.equal(q.discount_amount, 0);
  }
});

await test("CLARITY100 stops working once it has been claimed", async () => {
  store.clear();
  const before = await quote({ code: "CLARITY100", packId: "student-full-report", customer: INVITED });
  assert.equal(before.ok, true);

  // Someone completes checkout with it. recordRedemption is what counts,
  // and it only runs after Cashfree confirms the payment.
  const counted = await recordRedemption({
    code: "CLARITY100", orderId: "lume_student999_free", sku: "student-full-report",
    amount: 1, discount: 998, customer: INVITED
  });
  assert.equal(counted, true);

  // Not even the person it was issued to gets a second one.
  const again = await quote({ code: "CLARITY100", packId: "student-full-report", customer: INVITED });
  assert.equal(again.ok, false);
  assert.equal(again.final_amount, 999);
});

await test("FIRST50 is configured as one-per-customer, first-session-only", () => {
  const first50 = DEFAULT_COUPONS.find(c => c.code === "FIRST50");
  assert.equal(first50.per_customer_limit, 1);
  assert.equal(first50.first_time_only, true);
  assert.ok(first50.first_time_skus.includes("intro-session"),
    "the retired ₹49 SKU must count as a prior session");
});

console.log("\nseeding");

await test("seeding writes every rule that decides money", async () => {
  store.clear();
  const r = await coupons.seedCoupons({});
  assert.equal(r.ok, true, r.message);
  assert.equal(r.problems.length, 0);
  const doc = store.read("coupons", "FIRST50");
  assert.equal(doc.discount_value, 50);
  assert.equal(doc.per_customer_limit, 1);
  assert.equal(doc.first_time_only, true);
  assert.deepEqual(doc.applicable_packs, ["wellness-session"]);
  assert.equal(store.read("coupons", "MIND50").is_active, false);
});

await test("re-seeding never resets a counter a real redemption incremented", async () => {
  store.clear();
  store.seed("coupons", "FIRST50", { code: "FIRST50", times_used: 12 });
  await coupons.seedCoupons({});
  assert.equal(store.read("coupons", "FIRST50").times_used, 12);
});

await test("a dry run reports what would change and writes nothing", async () => {
  store.clear();
  const r = await coupons.seedCoupons({ dryRun: true });
  assert.equal(r.ok, true);
  assert.equal(r.dryRun, true);
  assert.equal(r.written.length, DEFAULT_COUPONS.length);
  assert.equal(store.read("coupons", "FIRST50"), undefined, "nothing should be written");
});

await test("seeding reports which codes are live at checkout", async () => {
  store.clear();
  const r = await coupons.seedCoupons({});
  // Live means usable at checkout, which is not the same as advertised:
  // CLARITY100 is a one-use invitation code and is never promoted.
  assert.deepEqual(r.live, ["FIRST50", "CLARITY100"]);
});

console.log("\ncatalogue guards");

store.clear();

await test("no pack in the catalogue is priced below ₹199", () => {
  // Guards against the ₹49 tier creeping back in as a second cheap SKU:
  // the first-session offer is FIRST50 now, not a separate product.
  Object.entries(SKU_PRICES).forEach(function([sku, product]){
    assert.ok(product.amount >= 199, sku + " is priced at ₹" + product.amount);
  });
});

console.log("\n" + passed + " passed, " + failed + " failed\n");
process.exit(failed ? 1 : 0);
