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
      first_time_only  boolean  copy-only flag; shown to the client
    }

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

const COLLECTION = "coupons";
const REDEMPTIONS = "couponRedemptions";

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
    headline: "50% off your first counselling session",
    // No prices in here — the badge renders base/final from the catalogue
    // right beside the headline, so repeating them reads as a stutter.
    description: "A 45-minute 1:1 with a qualified counsellor (M.Sc Clinical Psychology). Tap the code, use it at checkout.",
    promote: true,
    first_time_only: true
  },
  {
    code: "MIND50",
    discount_type: "percentage",
    discount_value: 50,
    applicable_packs: ["wellness-session"],
    is_active: true,
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
    is_active: true,
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
    is_active: true,
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
    is_active: true,
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
    is_active: true,
    expiration_date: null,
    usage_limit: 50,
    times_used: 0,
    headline: "₹500 off an internship track",
    description: "Early-cohort pricing for psychology students.",
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
    first_time_only: raw.first_time_only === true
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
      const found = normalizeCoupon(snap.data(), key);
      if(found) return found;
    }
    // A code that exists in Firestore is authoritative; a code that
    // doesn't may still be one of the built-in offers below.
  }catch(err){
    console.error("[lume coupons] lookup failed for " + key + ", using built-in catalogue:", String(err && err.message || err));
  }

  return DEFAULTS_BY_CODE[key] || null;
}

// Every coupon flagged `promote`, for the hero banner. Firestore documents
// win over the built-ins of the same code.
async function listPromotedCoupons(){
  const byCode = {};
  Object.keys(DEFAULTS_BY_CODE).forEach(function(code){
    byCode[code] = DEFAULTS_BY_CODE[code];
  });

  try{
    const firestore = firestoreOrNull();
    if(firestore){
      const snap = await firestore.collection(COLLECTION).get();
      snap.forEach(function(doc){
        const c = normalizeCoupon(doc.data(), doc.id);
        if(c) byCode[c.code] = c;
      });
    }
  }catch(err){
    console.error("[lume coupons] listing failed, using built-in catalogue:", String(err && err.message || err));
  }

  const now = new Date();
  return Object.keys(byCode)
    .map(function(code){ return byCode[code]; })
    .filter(function(c){
      if(!c.promote || !c.is_active) return false;
      if(c.expiration_date && c.expiration_date.getTime() <= now.getTime()) return false;
      if(c.usage_limit != null && c.times_used >= c.usage_limit) return false;
      return true;
    });
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
async function quote({ code, packId, now }){
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
async function recordRedemption({ code, orderId, sku, amount, discount }){
  const key = normalizeCode(code);
  const order = String(orderId || "");
  if(!key || !order) return false;

  try{
    // No Firestore means no durable counter. The discount was still
    // applied correctly — only the tally is lost — so this stays a
    // warning rather than anything the client ever sees.
    const firestore = firestoreOrNull();
    if(!firestore) return false;

    const couponRef = firestore.collection(COLLECTION).doc(key);
    const claimRef = firestore.collection(REDEMPTIONS).doc(order);

    return await firestore.runTransaction(async function(tx){
      const claim = await tx.get(claimRef);
      if(claim.exists) return false;

      const couponSnap = await tx.get(couponRef);
      const current = couponSnap.exists ? Math.max(0, Number(couponSnap.data().times_used) || 0) : 0;

      tx.set(claimRef, {
        code: key,
        orderId: order,
        sku: String(sku || ""),
        amount: amount != null ? Number(amount) : null,
        discount: discount != null ? Number(discount) : null,
        redeemedAt: new Date().toISOString()
      });

      // merge:true so a code that only exists in DEFAULT_COUPONS still
      // gets a counter document rather than the write being dropped.
      tx.set(couponRef, { code: key, times_used: current + 1, updatedAt: new Date().toISOString() }, { merge: true });
      return true;
    });
  }catch(err){
    console.error("[lume coupons] redemption count failed:", String(err && err.message || err));
    return false;
  }
}

module.exports = {
  COLLECTION,
  REDEMPTIONS,
  MIN_CHARGE,
  DEFAULT_COUPONS,
  normalizeCode,
  normalizeCoupon,
  loadCoupon,
  listPromotedCoupons,
  appliesToPack,
  checkCoupon,
  discountFor,
  quote,
  recordRedemption
};
