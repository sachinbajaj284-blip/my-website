/*
  Lume Live — coupon codes and discounts.

  ───────────────────────────────────────────────────────────────────────
  Where a coupon lives
  ───────────────────────────────────────────────────────────────────────
  Firestore collection `coupons`, one document per code, document id =
  the uppercased code. Written by tools/seed-coupons.mjs (or by hand in
  the Firebase console); read here with the Admin SDK, which bypasses
  security rules, so the browser can never read or write this collection
  directly.

    coupons/{CODE} = {
      code             string   uppercase, unique (== document id)
      discount_type    string   'percentage' | 'flat'
      discount_value   number   50 (= 50%)  |  200 (= ₹200 off)
      applicable_packs string[] SKU ids this code works on.
                                EMPTY ARRAY means "every pack" — see
                                appliesToPack() below.
      is_active        boolean  default true
      expiration_date  string?  ISO date; optional, null = never expires
      usage_limit      number?  optional, null = unlimited
      times_used       number   default 0, incremented on CONFIRMED payment
      -- optional extras, all safe to omit --
      min_amount       number?  order must be at least this much
      description      string?  shown in the hero banner
      headline         string?  shown in the hero banner
      promote          boolean  surface this code in the hero banner

      -- per-person rules; both need a phone or email to evaluate --
      per_customer_limit number?  how many times ONE person may use it
      first_time_only    boolean  refuse if they have bought before
      first_time_skus    string[] what "bought before" means; defaults to
                                  applicable_packs
    }

  usage_limit is a global cap; per_customer_limit is per person. A code
  meant as "your first session" needs the second — without it the same
  client claims it every month, which is exactly what FIRST50 did before
  these two fields existed.

  DEFAULT_COUPONS below is the same data in code form. It is the fallback
  when Firestore is unreachable or not yet seeded, so the offer keeps
  working on a fresh deploy instead of erroring at checkout. A Firestore
  document of the same code fully replaces its default.

  ───────────────────────────────────────────────────────────────────────
  Why the maths lives here and not in the browser
  ───────────────────────────────────────────────────────────────────────
  /api/coupons/validate exists so the client can SHOW a discount. It is
  not what makes the discount real. create-order.js calls quote() again,
  from the same code path, and charges what quote() returns — so editing
  the price in devtools changes what the page displays and nothing else.
*/

const { getProduct } = require("./catalog");
const { normalizePhone, normalizeEmail } = require("./identity");

const COLLECTION = "coupons";
const REDEMPTIONS = "couponRedemptions";
// One document per (code, person), holding how many times that person has
// redeemed that code. See identityKeys() for what "person" means.
const CUSTOMER_USES = "couponCustomers";

// Cashfree will not create an order for ₹0, and a free session should be
// a deliberate act (a free-slot link), not something a 100%-off code can
// produce by accident. Every discount leaves at least this much payable.
const MIN_CHARGE = 1;

/* ============================================================
   The live offer catalogue (fallback + seed source)
   ============================================================ */
const DEFAULT_COUPONS = [
  {
    code: "FIRST50",
    discount_type: "percentage",
    discount_value: 50,
    applicable_packs: ["wellness-session"],
    is_active: true,
    expiration_date: null,
    usage_limit: null,
    times_used: 0,
    // One per person, and only if they have never bought a session before.
    // first_time_skus names the retired ₹49 SKU too, so someone who took
    // the old introductory session does not get a "first" session twice.
    per_customer_limit: 1,
    first_time_only: true,
    first_time_skus: ["wellness-session", "intro-session"],
    headline: "50% off your first counselling session",
    // No prices in here — the badge renders base/final from the catalogue
    // right beside the headline, so repeating them reads as a stutter.
    description: "A 45-minute 1:1 with a qualified counsellor (M.Sc Clinical Psychology). Tap the code, use it at checkout.",
    promote: true
  },
  {
    code: "MIND50",
    discount_type: "percentage",
    discount_value: 50,
    applicable_packs: ["wellness-session"],
    is_active: false,   // switched off — FIRST50 is the only live offer
    expiration_date: null,
    usage_limit: 200,
    times_used: 0,
    headline: "50% off a counselling session",
    description: "Mental-health awareness offer on any 1:1 counselling session.",
    promote: false,
    first_time_only: false
  },
  {
    code: "CAREER30",
    discount_type: "percentage",
    discount_value: 30,
    applicable_packs: ["student-full-report", "career-intelligence-roadmap"],
    is_active: false,   // switched off — FIRST50 is the only live offer
    expiration_date: null,
    usage_limit: null,
    times_used: 0,
    headline: "30% off the Full Clarity Report",
    description: "For students booking a psychometric assessment pack.",
    promote: false,
    first_time_only: false
  },
  {
    code: "PARENT200",
    discount_type: "flat",
    discount_value: 200,
    applicable_packs: ["student-full-report", "stream-clarity-session"],
    is_active: false,   // switched off — FIRST50 is the only live offer
    expiration_date: null,
    usage_limit: null,
    times_used: 0,
    headline: "₹200 off for parents",
    description: "₹200 off a Full Clarity Report or a Stream Clarity session.",
    promote: false,
    first_time_only: false
  },
  {
    code: "REFER200",
    discount_type: "flat",
    discount_value: 200,
    applicable_packs: ["student-full-report"],
    is_active: false,   // switched off — FIRST50 is the only live offer
    expiration_date: null,
    usage_limit: null,
    times_used: 0,
    headline: "₹200 off when a friend refers you",
    description: "Matches the ₹200 referral credit promised on the booking page.",
    promote: false,
    first_time_only: false
  },
  {
    code: "INTERN500",
    discount_type: "flat",
    discount_value: 500,
    applicable_packs: ["internship-1-month", "internship-2-month", "internship-240-hour"],
    is_active: false,   // switched off — FIRST50 is the only live offer
    expiration_date: null,
    usage_limit: 50,
    times_used: 0,
    headline: "₹500 off an internship track",
    description: "Early-cohort pricing for psychology students.",
    promote: false,
    first_time_only: false
  },
  {
    /*
      A single free Full Clarity Report, to be handed to one person.

      Two things about this code are deliberate and worth knowing before
      anyone edits it:

      - It charges ₹1, not ₹0. Cashfree will not create a zero-value
        order, so discountFor() caps every discount at base - MIN_CHARGE.
        100% here means "as free as this gateway allows"; the client sees
        ₹999 struck through and ₹1 payable. Raising discount_value above
        100 changes nothing — the cap decides.

      - promote:false keeps it out of /api/coupons/active, which is what
        draws the offer badges on the site. A one-use 100%-off code shown
        publicly would be claimed by the first stranger to see it, not by
        the person it was meant for. Do not set this true.

      usage_limit:1 is counted in Firestore by recordRedemption, and only
      once Cashfree confirms payment — so the code stays claimable until
      someone actually completes checkout with it, rather than being
      burned by anyone who merely types it in.
    */
    code: "CLARITY100",
    discount_type: "percentage",
    discount_value: 100,
    applicable_packs: ["student-full-report"],
    /*
      PARKED, ON PURPOSE. Switch this to true in the same edit that fills
      in restricted_to_emails below.

      The report checkout now shows its coupon box to every visitor, so a
      live 100%-off code is claimable by anyone who learns the string.
      This one is meant for a single named person, and until their address
      is here there is no way to tell them apart from anyone else — so it
      is off rather than open.
    */
    is_active: false,
    // The account this code was issued to. Matched against the email in
    // the verified Firebase token, so it cannot be satisfied by typing
    // somebody else's address into a form. Empty = anyone, which is
    // exactly what this code must not be.
    restricted_to_emails: [],
    expiration_date: null,
    // One use, in total, across everybody, for ever. There is no reset
    // short of clearing the counter in Firestore by hand.
    usage_limit: 1,
    times_used: 0,
    per_customer_limit: 1,
    headline: "Full Clarity Report on us",
    description: "A one-time invitation code for the ₹999 Full Clarity Report.",
    promote: false,
    first_time_only: false
  }
];

/* ============================================================
   Normalising
   ============================================================ */

// Codes are matched uppercase with spaces and dashes stripped, so
// "first 50", "First-50" and "FIRST50" are the same coupon. Bounded
// length because this string reaches a Firestore document id.
function normalizeCode(code){
  return String(code == null ? "" : code)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 32);
}

function toNumberOrNull(value){
  if(value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// expiration_date can arrive as an ISO string (seed script, JSON import)
// or as a Firestore Timestamp (edited in the console). Anything we can't
// read as a date is treated as "no expiry" rather than "expired" — a
// malformed field should not silently kill a live offer.
function toDateOrNull(value){
  if(value == null || value === "") return null;
  if(value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if(typeof value.toDate === "function"){
    try{
      const d = value.toDate();
      return isNaN(d.getTime()) ? null : d;
    }catch(err){ return null; }
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// Shapes whatever came out of Firestore (or the defaults) into the exact
// field set the rest of this file relies on.
function normalizeCoupon(raw, fallbackCode){
  if(!raw || typeof raw !== "object") return null;
  const code = normalizeCode(raw.code || fallbackCode);
  if(!code) return null;

  const type = String(raw.discount_type || "").toLowerCase() === "flat" ? "flat" : "percentage";
  const packs = Array.isArray(raw.applicable_packs)
    ? raw.applicable_packs.map(function(p){ return String(p || "").trim(); }).filter(Boolean)
    : [];

  return {
    code: code,
    discount_type: type,
    discount_value: Math.max(0, Number(raw.discount_value) || 0),
    applicable_packs: packs,
    is_active: raw.is_active !== false,
    expiration_date: toDateOrNull(raw.expiration_date),
    usage_limit: toNumberOrNull(raw.usage_limit),
    times_used: Math.max(0, Number(raw.times_used) || 0),
    min_amount: toNumberOrNull(raw.min_amount),
    headline: raw.headline ? String(raw.headline).slice(0, 120) : "",
    description: raw.description ? String(raw.description).slice(0, 240) : "",
    promote: raw.promote === true,
    per_customer_limit: toNumberOrNull(raw.per_customer_limit),
    first_time_only: raw.first_time_only === true,
    // "Bought before" defaults to the packs the code itself applies to —
    // the useful reading of "first", and the one that doesn't accidentally
    // disqualify someone for having bought an unrelated PDF.
    first_time_skus: Array.isArray(raw.first_time_skus) && raw.first_time_skus.length
      ? raw.first_time_skus.map(function(s){ return String(s || "").trim(); }).filter(Boolean)
      : packs,
    /*
      Addressed to specific people, by account email.

      An empty list means "anyone may use it" — the same permissive
      reading as applicable_packs, and the right default, since almost
      every offer is open. A non-empty list is checked in
      checkCustomerRules, which fails closed: no email means no match.
    */
    restricted_to_emails: Array.isArray(raw.restricted_to_emails)
      ? raw.restricted_to_emails.map(normalizeEmail).filter(Boolean)
      : []
  };
}

const DEFAULTS_BY_CODE = DEFAULT_COUPONS.reduce(function(map, raw){
  const c = normalizeCoupon(raw);
  if(c) map[c.code] = c;
  return map;
}, {});

/* ============================================================
   Loading
   ============================================================ */

/*
  Firestore is optional here on purpose: without it the built-in
  catalogue still serves every offer, so a deploy with no FIREBASE_*
  variables sells at the right price instead of erroring at checkout.

  Returns the Firestore handle, or null when it isn't available. "Not
  configured" is an expected state and is logged once; a genuine failure
  is logged by the caller.
*/
let firestoreUnavailable = false;
function firestoreOrNull(){
  if(firestoreUnavailable) return null;
  try{
    const { db } = require("./firebaseAdmin");
    return db();
  }catch(err){
    firestoreUnavailable = true;
    console.warn("[lume coupons] Firestore unavailable, serving the built-in catalogue:", String(err && err.message || err));
    return null;
  }
}

async function loadCoupon(code){
  const key = normalizeCode(code);
  if(!key) return null;

  try{
    const firestore = firestoreOrNull();
    if(!firestore) return DEFAULTS_BY_CODE[key] || null;

    const snap = await firestore.collection(COLLECTION).doc(key).get();
    if(snap.exists){
      /*
        Firestore fields are layered OVER the built-in definition rather
        than replacing it.

        This matters because not every `coupons/{CODE}` document is a
        full definition. recordRedemption writes { code, times_used } with
        merge:true, so on a deployment that was never seeded the first
        redemption creates a document containing only a counter. Treating
        that as the whole coupon would leave it with no discount_value, no
        applicable_packs (which reads as "every pack") and none of its
        per-customer limits — the code would silently become 0% off
        everything, unrestricted, the moment somebody used it.
      */
      const found = normalizeCoupon(Object.assign({}, DEFAULTS_BY_CODE[key], snap.data()), key);
      if(found) return found;
    }
    // A code that exists in Firestore is authoritative; a code that
    // doesn't may still be one of the built-in offers below.
  }catch(err){
    console.error("[lume coupons] lookup failed for " + key + ", using built-in catalogue:", String(err && err.message || err));
  }

  return DEFAULTS_BY_CODE[key] || null;
}

// Every coupon that is currently usable — active, unexpired, not fully
// claimed — whether or not it is advertised.
async function listUsableCoupons(){
  const byCode = {};
  Object.keys(DEFAULTS_BY_CODE).forEach(function(code){
    byCode[code] = DEFAULTS_BY_CODE[code];
  });

  try{
    const firestore = firestoreOrNull();
    if(firestore){
      const snap = await firestore.collection(COLLECTION).get();
      snap.forEach(function(doc){
        const c = normalizeCoupon(Object.assign({}, DEFAULTS_BY_CODE[normalizeCode(doc.id)], doc.data()), doc.id);
        if(c) byCode[c.code] = c;
      });
    }
  }catch(err){
    console.error("[lume coupons] listing failed, using built-in catalogue:", String(err && err.message || err));
  }

  const now = new Date();
  return Object.keys(byCode).map(function(code){ return byCode[code]; }).filter(function(c){
    if(!c.is_active) return false;
    if(c.expiration_date && c.expiration_date.getTime() <= now.getTime()) return false;
    if(c.usage_limit != null && c.times_used >= c.usage_limit) return false;
    return true;
  });
}

// Every coupon flagged `promote`, for the hero banner. Firestore documents
// win over the built-ins of the same code.
async function listPromotedCoupons(){
  const usable = await listUsableCoupons();
  return usable.filter(function(c){ return c.promote; });
}

/* ============================================================
   Who is asking — per-person rules
   ============================================================ */

/*
  A person is their phone number and their email, and we count against
  BOTH. Checking only one would make the limit trivial to sidestep: same
  phone, different email, discount again.

  Returns the document ids used as counters in `couponCustomers`. A
  deterministic id means the check is a direct get() rather than a query,
  so there is no composite index to create and no chance of the limit
  silently failing open because an index was missing in production.
*/
function identityKeys(customer){
  const c = customer || {};
  const phone = normalizePhone(c.phone);
  const email = normalizeEmail(c.email);
  const keys = [];
  if(phone) keys.push("p_" + phone);
  // "/" is the one character a Firestore document id cannot contain.
  if(email) keys.push("e_" + email.replace(/\//g, "_"));
  return keys;
}

function customerDocId(code, key){
  return code + "__" + key;
}

/*
  How many times this person has already redeemed this code.

  Fails OPEN (returns 0) exactly like rateLimit and the entitlement
  writes: a Firestore hiccup must not tell a genuine first-time client
  that their advertised discount is unavailable. The cost of the other
  choice — a repeat client occasionally slipping through during an
  outage — is much smaller than a broken checkout.
*/
async function customerRedemptionCount(code, customer){
  const keys = identityKeys(customer);
  if(!keys.length) return 0;

  try{
    const firestore = firestoreOrNull();
    if(!firestore) return 0;
    const snaps = await Promise.all(keys.map(function(key){
      return firestore.collection(CUSTOMER_USES).doc(customerDocId(code, key)).get();
    }));
    return snaps.reduce(function(max, snap){
      const n = snap.exists ? Number(snap.data().count) || 0 : 0;
      return n > max ? n : max;
    }, 0);
  }catch(err){
    console.error("[lume coupons] per-customer count failed, allowing:", String(err && err.message || err));
    return 0;
  }
}

/*
  Has this person already bought one of these packs?

  Reads the entitlement records — the server-side "who paid for what"
  written only after Cashfree confirms a payment — so it sees purchases
  made with or without a coupon. That distinction matters: someone who
  paid ₹499 for a session with no code has still had their first session,
  and per_customer_limit alone would happily give them FIRST50 next time.

  Fails OPEN for the same reason as above.
*/
async function hasPriorPurchase(skus, customer){
  const wanted = (skus || []).filter(Boolean);
  const c = customer || {};
  if(!wanted.length) return false;
  if(!normalizePhone(c.phone) && !normalizeEmail(c.email)) return false;

  try{
    const { findPaidEntitlements } = require("./entitlements");
    const prior = await findPaidEntitlements({ phone: c.phone, email: c.email });
    return prior.some(function(p){ return wanted.indexOf(p.sku) !== -1; });
  }catch(err){
    console.error("[lume coupons] first-time check failed, allowing:", String(err && err.message || err));
    return false;
  }
}

/*
  The per-person half of validation, split out because it needs Firestore
  and checkCoupon is deliberately synchronous and pure.

  Returns null when the coupon is still fine. When the caller has no
  phone or email yet — the checkout shows a price before it asks for
  contact details — these rules cannot be evaluated and are skipped;
  create-order re-runs them with the real customer before charging, and
  that is the gate that actually counts.
*/
async function checkCustomerRules(coupon, customer){
  const c = customer || {};
  const email = normalizeEmail(c.email);

  /*
    A code addressed to named people.

    Deliberately checked BEFORE the "do we know who this is?" shortcut
    below, and it fails closed: an anonymous request is precisely the
    case this restriction exists to refuse, so treating a missing email
    as "no objection" would hand an invitation code to anyone who left
    the field empty.

    The email compared here is the account's, not a typed one.
    create-order passes the address out of the verified Firebase token,
    so this cannot be satisfied by typing somebody else's address into a
    form.
  */
  if(coupon.restricted_to_emails.length &&
     (!email || coupon.restricted_to_emails.indexOf(email) === -1)){
    return {
      ok: false,
      reason: "not_invited",
      message: "This code was issued to a specific Lume Live account. Sign in with the email it was sent to, or continue without the code."
    };
  }

  const known = Boolean(normalizePhone(c.phone) || email);
  if(!known) return null;

  if(coupon.per_customer_limit != null){
    const used = await customerRedemptionCount(coupon.code, c);
    if(used >= coupon.per_customer_limit){
      return {
        ok: false,
        reason: "per_customer_limit",
        message: coupon.per_customer_limit === 1
          ? "You've already used this code."
          : "You've used this code the maximum number of times."
      };
    }
  }

  if(coupon.first_time_only && await hasPriorPurchase(coupon.first_time_skus, c)){
    return {
      ok: false,
      reason: "not_first_time",
      message: "This code is only for your first session."
    };
  }

  return null;
}

/* ============================================================
   Validating
   ============================================================ */

// An empty applicable_packs list means "works on anything". That is the
// permissive reading, so it is only ever reached when someone has
// deliberately left the list empty — every seeded coupon names its packs.
function appliesToPack(coupon, packId){
  if(!coupon.applicable_packs.length) return true;
  return coupon.applicable_packs.indexOf(String(packId || "")) !== -1;
}

function inr(n){
  return "₹" + Number(n || 0).toLocaleString("en-IN");
}

/*
  Returns { ok:true, coupon } or { ok:false, reason, message }.

  `reason` is a stable machine-readable slug for logs and analytics;
  `message` is the exact sentence shown to the client, written so they
  know what to do next rather than just that something went wrong.
*/
function checkCoupon(coupon, product, packId, now){
  const at = now || new Date();

  if(!coupon){
    return { ok: false, reason: "not_found", message: "That code isn't valid. Please check the spelling and try again." };
  }
  if(!coupon.is_active){
    return { ok: false, reason: "inactive", message: "This code is no longer active." };
  }
  if(coupon.expiration_date && coupon.expiration_date.getTime() <= at.getTime()){
    return { ok: false, reason: "expired", message: "This code has expired." };
  }
  if(coupon.usage_limit != null && coupon.times_used >= coupon.usage_limit){
    return { ok: false, reason: "limit_reached", message: "This code has been fully claimed." };
  }
  if(!appliesToPack(coupon, packId)){
    return {
      ok: false,
      reason: "not_applicable",
      message: "This code isn't valid for " + (product ? product.label : "this item") + "."
    };
  }
  if(coupon.min_amount != null && product && product.amount < coupon.min_amount){
    return {
      ok: false,
      reason: "below_minimum",
      message: "This code applies on orders of " + inr(coupon.min_amount) + " or more."
    };
  }
  return { ok: true, reason: "valid", coupon: coupon };
}

/* ============================================================
   Pricing
   ============================================================ */

// Percentages round to the nearest rupee (₹499 at 50% => ₹250 off, ₹249
// payable). Every discount is capped so at least MIN_CHARGE is left.
function discountFor(coupon, baseAmount){
  const base = Math.max(0, Number(baseAmount) || 0);
  if(!coupon) return 0;

  const raw = coupon.discount_type === "flat"
    ? Number(coupon.discount_value) || 0
    : Math.round(base * (Number(coupon.discount_value) || 0) / 100);

  const ceiling = Math.max(0, base - MIN_CHARGE);
  return Math.max(0, Math.min(Math.round(raw), ceiling));
}

/*
  The single source of truth for "what does this cost with this code".

  Used by /api/coupons/validate to show a price and by create-order.js to
  charge one. Both call it with the same arguments, so the number the
  client sees is the number they pay — there is no second code path where
  the two could drift apart.

  Returns:
    { ok, sku, label, base_amount, discount_amount, final_amount,
      coupon: {...} | null, reason, message }
*/
async function quote({ code, packId, now, customer }){
  const product = getProduct(packId);
  if(!product){
    return {
      ok: false,
      reason: "unknown_pack",
      message: "We couldn't find that item. Please refresh the page and try again.",
      sku: String(packId || ""),
      base_amount: null,
      discount_amount: 0,
      final_amount: null,
      coupon: null
    };
  }

  const base = {
    sku: String(packId),
    label: product.label,
    base_amount: product.amount,
    discount_amount: 0,
    final_amount: product.amount,
    coupon: null
  };

  const normalized = normalizeCode(code);
  if(!normalized){
    return Object.assign({ ok: true, reason: "no_coupon", message: "" }, base);
  }

  const coupon = await loadCoupon(normalized);
  const verdict = checkCoupon(coupon, product, packId, now);
  if(!verdict.ok){
    return Object.assign({ ok: false, reason: verdict.reason, message: verdict.message }, base);
  }

  // Per-person rules run second: they cost a Firestore read, so there is
  // no point paying for them on a code that is expired or wrong anyway.
  const personal = await checkCustomerRules(coupon, customer);
  if(personal){
    return Object.assign({ ok: false, reason: personal.reason, message: personal.message }, base);
  }

  const discount = discountFor(coupon, product.amount);
  return Object.assign({}, base, {
    ok: true,
    reason: "applied",
    message: coupon.discount_type === "percentage"
      ? coupon.discount_value + "% off applied — you save " + inr(discount) + "."
      : inr(discount) + " off applied.",
    discount_amount: discount,
    final_amount: product.amount - discount,
    coupon: {
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      headline: coupon.headline,
      description: coupon.description
    }
  });
}

/* ============================================================
   Redemption
   ============================================================ */

/*
  Counts one use of a coupon, once, when Cashfree has confirmed the money
  arrived — not when the code is typed, and not when the order is created.
  An abandoned checkout must not burn a limited code.

  order-status.js is polled (return page, modal, refreshes), so this has
  to survive being called repeatedly for the same order. The redemption
  document is the claim: whoever creates it first is the one that
  increments the counter, inside the same transaction.

  Never throws. A failed count is a reporting inaccuracy; a thrown error
  here would break the page that tells a paying client their booking went
  through.
*/
async function recordRedemption({ code, orderId, sku, amount, discount, customer }){
  const key = normalizeCode(code);
  const order = String(orderId || "");
  if(!key || !order) return false;
  // Whose redemption this was. Written in the same transaction as the
  // global counter so per_customer_limit has something to count next time.
  const keys = identityKeys(customer);

  try{
    // No Firestore means no durable counter. The discount was still
    // applied correctly — only the tally is lost — so this stays a
    // warning rather than anything the client ever sees.
    const firestore = firestoreOrNull();
    if(!firestore) return false;

    const couponRef = firestore.collection(COLLECTION).doc(key);
    const claimRef = firestore.collection(REDEMPTIONS).doc(order);

    const customerRefs = keys.map(function(k){
      return firestore.collection(CUSTOMER_USES).doc(customerDocId(key, k));
    });

    return await firestore.runTransaction(async function(tx){
      // Firestore requires every read before any write in a transaction.
      const claim = await tx.get(claimRef);
      if(claim.exists) return false;

      const couponSnap = await tx.get(couponRef);
      const customerSnaps = await Promise.all(customerRefs.map(function(ref){ return tx.get(ref); }));
      const current = couponSnap.exists ? Math.max(0, Number(couponSnap.data().times_used) || 0) : 0;
      const at = new Date().toISOString();

      tx.set(claimRef, {
        code: key,
        orderId: order,
        sku: String(sku || ""),
        amount: amount != null ? Number(amount) : null,
        discount: discount != null ? Number(discount) : null,
        phone: normalizePhone(customer && customer.phone) || null,
        email: normalizeEmail(customer && customer.email) || null,
        redeemedAt: at
      });

      // merge:true so a code that only exists in DEFAULT_COUPONS still
      // gets a counter document rather than the write being dropped.
      tx.set(couponRef, { code: key, times_used: current + 1, updatedAt: at }, { merge: true });

      customerRefs.forEach(function(ref, i){
        const prev = customerSnaps[i].exists ? Math.max(0, Number(customerSnaps[i].data().count) || 0) : 0;
        tx.set(ref, { code: key, count: prev + 1, lastOrderId: order, updatedAt: at }, { merge: true });
      });

      return true;
    });
  }catch(err){
    console.error("[lume coupons] redemption count failed:", String(err && err.message || err));
    return false;
  }
}

/* ============================================================
   Seeding
   ============================================================ */

/*
  Writes DEFAULT_COUPONS into Firestore and reads it back to check.

  Lives here rather than in the CLI because two things now seed — the
  script and the admin endpoint — and a second copy of "what a coupon
  document should contain" is precisely the drift that would let the two
  disagree about a price.

  Re-running is safe: times_used is read first and carried forward, so a
  re-seed can never hand a used-up code back out, and never resets the
  counter a live redemption has already incremented.

  Returns a structured result; never throws for an expected condition
  (no Firestore, a mismatch) so both callers can report it their own way.
*/
async function seedCoupons({ dryRun = false } = {}){
  const live = DEFAULT_COUPONS.filter(function(c){ return c.is_active !== false; })
    .map(function(c){ return c.code; });

  const firestore = firestoreOrNull();
  if(!firestore){
    return { ok: false, configured: false, dryRun: Boolean(dryRun), written: [], problems: [],
             live: live, message: "Firebase Admin is not configured (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)." };
  }

  const written = [];
  try{
    for(const coupon of DEFAULT_COUPONS){
      const ref = firestore.collection(COLLECTION).doc(coupon.code);
      const existing = await ref.get();
      const timesUsed = existing.exists ? Math.max(0, Number(existing.data().times_used) || 0) : 0;

      written.push({ code: coupon.code, action: existing.exists ? "updated" : "created", times_used: timesUsed });
      if(dryRun) continue;

      await ref.set(Object.assign({}, coupon, {
        times_used: timesUsed,
        updatedAt: new Date().toISOString()
      }), { merge: true });
    }
  }catch(err){
    return { ok: false, configured: true, dryRun: Boolean(dryRun), written: written, problems: [],
             live: live, message: "Write failed: " + String(err && err.message || err) };
  }

  if(dryRun){
    return { ok: true, configured: true, dryRun: true, written: written, problems: [], live: live,
             message: "Dry run — nothing written." };
  }

  /*
    Read back and compare the fields that decide money. "The writes did
    not throw" is a weaker claim than it looks: a rule silently missing
    from Firestore is the kind of thing nobody notices until a coupon
    behaves wrongly for a paying client.
  */
  const problems = [];
  const MUST_MATCH = ["discount_type", "discount_value", "is_active", "usage_limit",
                      "per_customer_limit", "first_time_only"];
  try{
    for(const coupon of DEFAULT_COUPONS){
      const snap = await firestore.collection(COLLECTION).doc(coupon.code).get();
      if(!snap.exists){ problems.push(coupon.code + ": document missing after write"); continue; }
      const got = snap.data();
      for(const field of MUST_MATCH){
        const want = coupon[field] === undefined ? null : coupon[field];
        const have = got[field] === undefined ? null : got[field];
        if(JSON.stringify(want) !== JSON.stringify(have)){
          problems.push(coupon.code + "." + field + ": expected " + JSON.stringify(want) + ", found " + JSON.stringify(have));
        }
      }
      const wantPacks = JSON.stringify(coupon.applicable_packs || []);
      const havePacks = JSON.stringify(got.applicable_packs || []);
      if(wantPacks !== havePacks){
        problems.push(coupon.code + ".applicable_packs: expected " + wantPacks + ", found " + havePacks);
      }
    }
  }catch(err){
    return { ok: false, configured: true, dryRun: false, written: written, problems: problems,
             live: live, message: "Verification read failed: " + String(err && err.message || err) };
  }

  return {
    ok: problems.length === 0,
    configured: true,
    dryRun: false,
    written: written,
    problems: problems,
    live: live,
    message: problems.length
      ? "The catalogue in Firestore does not match the code."
      : "Seeded and verified " + written.length + " coupon documents."
  };
}

module.exports = {
  COLLECTION,
  REDEMPTIONS,
  CUSTOMER_USES,
  MIN_CHARGE,
  DEFAULT_COUPONS,
  normalizeCode,
  normalizeCoupon,
  loadCoupon,
  listPromotedCoupons,
  appliesToPack,
  listUsableCoupons,
  checkCoupon,
  checkCustomerRules,
  identityKeys,
  discountFor,
  quote,
  recordRedemption,
  seedCoupons
};
