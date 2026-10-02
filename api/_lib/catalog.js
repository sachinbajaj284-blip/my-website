/*
  The one place the price of a thing lives.

  create-order.js used to hold this map privately, which was fine while it
  was the only endpoint that needed to know what something costs. The
  coupon endpoints need the same numbers, and two copies of a price list
  is exactly the bug you don't want: a discount validated against ₹499
  and then charged against ₹999.

  Every amount here is in whole rupees and is server-side only. Nothing
  the browser sends is ever used as a price — the browser sends a `sku`,
  and the number comes from this file.
*/

const SKU_PRICES = {
  "student-full-report": { amount: 999, label: "Lume Live Full Clarity Report", alias: "student999" },
  "lume-lens-working-profile": { amount: 1999, label: "Lume Lens Working Profile", alias: "lens1999" },
  "parents-handbook": { amount: 199, label: "Parents Career Handbook", alias: "parents199" },
  "career-intelligence-roadmap": { amount: 1499, label: "Career Intelligence Detailed Roadmap", alias: "roadmap1499" },
  "stream-clarity-session": { amount: 999, label: "Stream Clarity Counselling Session", alias: "stream999" },
  "career-direction-session": { amount: 1499, label: "Career Direction Counselling Session", alias: "careerdir1499" },
  /*
    The one 1:1 session. Career guidance and emotional wellness are the
    same 45 minutes with the same counsellor, so they are one product
    priced once; the framing that suits a given visitor lives in the page
    copy, not in a second SKU.

    This replaced the ₹49 "intro-session", which was retired when FIRST50
    became the first-session offer (₹499 → ₹249). The old SKU is gone
    from this catalogue so no new order can be created at ₹49, but it is
    deliberately still recognised by order-status.js, the payment-return
    page and the SKU_FLOW map — clients who bought one still have an
    entitlement, and those paths must keep resolving it.
  */
  "wellness-session": { amount: 499, label: "1:1 Counselling Session", alias: "session499" },
  /*
    Optional senior-clinician 1:1 — the same 45 minutes as wellness-session
    but with a senior counsellor, priced higher so visitors who read price
    as a quality signal have a tier to choose. Still a booking SKU: the
    client picks their own slot after paying.
  */
  "senior-clinician-session": { amount: 1099, label: "Senior Clinician 1:1 Session", alias: "senior1099" },
  /*
    Bundled offers — "The Clarity Ladder". These are sold once at a single
    price here; what a visitor sees as the "regular / separate" number is
    page copy only (the anchor), never a second charge. Fulfilment treats
    the session-bearing packs as booking SKUs so the client picks their own
    slots and the owner is told to expect the bundled number of sessions.
  */
  "career-clarity-pack": { amount: 2499, label: "Career Clarity Pack (Full Report + 2 Sessions + Roadmap)", alias: "claritypack2499" },
  "complete-clarity-program": { amount: 4499, label: "Complete Clarity Program (Report + 4 Sessions + Roadmap + 30-day Follow-up)", alias: "complete4499" },
  "mental-health-support-plan": { amount: 1799, label: "Mental Health 4-Session Support Plan", alias: "mhplan1799" },
  // Internship tracks are sold in supervised hours. The SKU keys are kept as-is
  // so orders placed before the hours-based relaunch still resolve.
  "internship-1-month": { amount: 3499, label: "Practitioner Foundations (60 supervised hours)", alias: "intern60h3499" },
  "internship-2-month": { amount: 5999, label: "Advanced Fellowship (120 supervised hours)", alias: "intern120h5999" },
  "internship-240-hour": { amount: 11999, label: "University Credit Track (240 supervised hours)", alias: "intern240h11999" },
  // Optional low-cost entry to the internship ladder: an observership plus a
  // certificate, priced to compete with ₹2,000–2,500 rivals and funnel up to
  // the supervised tracks. Seat confirmed after a screening call, like the
  // other internship SKUs — not a self-booking calendar product.
  "internship-observership": { amount: 1999, label: "Observership + Certificate", alias: "observe1999" },
  /*
    Premium upgrade offered on the assessment checkout: a 1:1 hour with
    Dheeraj Ghughtyal (Founder's Office Head, CoverYou) on top of the
    Full Clarity Report. Priced once here, like everything else.
  */
  "industry-expert-session": { amount: 7500, label: "Talk to Industry Expert - Dheeraj Ghughtyal", alias: "expert7500" },
  "internship-lume-lens": { amount: 500, label: "Lume Lens Report (Intern Add-On)", alias: "internlens500" },
  /*
    One month of online psychology tuition (CBSE Class 11 or 12), notes,
    PYQs and PPTs included. A one-time payment per month, not a mandate:
    the student pays again to continue. Class timings are fixed with the
    tutor after payment, so this is not a calendar-booking SKU.
  */
  "psychology-tuition-monthly": { amount: 7999, label: "Psychology Tuition - 1 Month (Class 11/12)", alias: "psytuition7999" }
};

function getProduct(sku){
  const key = String(sku || "");
  return Object.prototype.hasOwnProperty.call(SKU_PRICES, key) ? SKU_PRICES[key] : null;
}

module.exports = { SKU_PRICES, getProduct };
