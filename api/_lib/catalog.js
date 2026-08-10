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
  "intro-session": { amount: 49, label: "Introductory Guidance Session", alias: "intro49" },
  "parents-handbook": { amount: 199, label: "Parents Career Handbook", alias: "parents199" },
  "career-intelligence-roadmap": { amount: 1499, label: "Career Intelligence Detailed Roadmap", alias: "roadmap1499" },
  "stream-clarity-session": { amount: 999, label: "Stream Clarity Counselling Session", alias: "stream999" },
  "career-direction-session": { amount: 1499, label: "Career Direction Counselling Session", alias: "careerdir1499" },
  // The standard-priced 1:1 wellness hour. The ₹49 intro-session above is a
  // deliberately cheap first step and stays as it is; this is the session a
  // client books at full price, and the one FIRST50 halves.
  "wellness-session": { amount: 499, label: "Emotional Wellness Session", alias: "wellness499" },
  // Internship tracks are sold in supervised hours. The SKU keys are kept as-is
  // so orders placed before the hours-based relaunch still resolve.
  "internship-1-month": { amount: 3499, label: "Practitioner Foundations (60 supervised hours)", alias: "intern60h3499" },
  "internship-2-month": { amount: 5999, label: "Advanced Fellowship (120 supervised hours)", alias: "intern120h5999" },
  "internship-240-hour": { amount: 11999, label: "University Credit Track (240 supervised hours)", alias: "intern240h11999" },
  "internship-lume-lens": { amount: 500, label: "Lume Lens Report (Intern Add-On)", alias: "internlens500" }
};

function getProduct(sku){
  const key = String(sku || "");
  return Object.prototype.hasOwnProperty.call(SKU_PRICES, key) ? SKU_PRICES[key] : null;
}

module.exports = { SKU_PRICES, getProduct };
