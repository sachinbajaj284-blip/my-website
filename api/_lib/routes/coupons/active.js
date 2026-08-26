/*
  GET /api/coupons/active

  The offers currently worth shouting about — every coupon flagged
  `promote` that is active, unexpired and not fully claimed, with the
  price it produces on its first applicable pack.

  Response:
    { "offers": [ {
        "code": "FIRST50",
        "headline": "50% off your first wellness session",
        "description": "…",
        "sku": "wellness-session",
        "label": "Emotional Wellness Session",
        "base_amount": 499,
        "discount_amount": 250,
        "final_amount": 249,
        "expires_at": null
      } ] }

  The hero banner ships with the same offer hard-coded as its default, so
  the page is correct before this ever responds; this endpoint just lets
  the banner follow the Firestore catalogue without a redeploy. It is
  read-only and exposes nothing a client couldn't learn by typing the
  code into the checkout box.
*/

const { json, setCors } = require("../../http");
const { listPromotedCoupons, listUsableCoupons, discountFor } = require("../../coupons");
const { getProduct, SKU_PRICES } = require("../../catalog");

module.exports = async function handler(req, res){
  setCors(req, res, "GET,OPTIONS");

  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }

  if(req.method !== "GET"){
    return json(res, 405, { error: "Method not allowed" });
  }

  let coupons, usable;
  try{
    usable = await listUsableCoupons();
    coupons = usable.filter(function(c){ return c.promote; });
  }catch(err){
    console.error("[lume coupons] active listing failed:", String(err && err.message || err));
    return json(res, 200, { offers: [], offer_skus: [] });
  }

  /*
    Which SKUs have any live coupon — names deliberately omitted.

    The checkout widget uses this to decide whether to show a "Have a
    coupon code?" field at all. A coupon box on a product with no possible
    code is an invitation to leave and hunt for one, so it stays hidden
    where nothing could apply. Only the SKU list is exposed: an
    unadvertised code's name is not something a visitor should be able to
    read off an endpoint.
  */
  const offerSkus = [];
  usable.forEach(function(c){
    // An empty applicable_packs means "every pack" — expand it, so the
    // widget's simple `indexOf(sku)` check stays correct.
    const packs = c.applicable_packs.length ? c.applicable_packs : Object.keys(SKU_PRICES);
    packs.forEach(function(sku){
      if(offerSkus.indexOf(sku) === -1) offerSkus.push(sku);
    });
  });

  const offers = coupons.map(function(c){
    // The headline price is the one on the first pack the code names.
    // A code with no packs at all applies everywhere, so there is no
    // single price to quote — the banner shows the code without one.
    const sku = c.applicable_packs[0] || "";
    const product = sku ? getProduct(sku) : null;
    const discount = product ? discountFor(c, product.amount) : 0;

    return {
      code: c.code,
      headline: c.headline,
      description: c.description,
      discount_type: c.discount_type,
      discount_value: c.discount_value,
      first_time_only: c.first_time_only,
      sku: sku,
      label: product ? product.label : "",
      base_amount: product ? product.amount : null,
      discount_amount: product ? discount : null,
      final_amount: product ? product.amount - discount : null,
      expires_at: c.expiration_date ? c.expiration_date.toISOString() : null
    };
  });

  // A promo banner that lags a paused offer is worse than a slightly
  // stale one — 5 minutes of CDN caching, revalidated in the background.
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  return json(res, 200, { offers: offers, offer_skus: offerSkus });
};
