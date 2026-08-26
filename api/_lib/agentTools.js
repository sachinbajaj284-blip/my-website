/*
  What the conversational agent can actually do.

  Tool definitions and their handlers. Two rules run through the whole
  file and neither is negotiable.

  ── A SKU, NEVER AN AMOUNT ──

  create_checkout takes a sku and nothing that resembles a price.
  _lib/catalog.js says, at the top, that it is the one place the price of
  a thing lives and that the browser is never trusted with a number. A
  model is not a more trustworthy client than a browser; it is a less
  predictable one. There is no schema field here that could carry a
  rupee figure, so the question of validating one never arises.

  ── THE AGENT INHERITS AN IDENTITY, IT DOES NOT HAVE ONE ──

  Every tool that touches a person's data takes the uid from the context
  the caller established — a linked account, proven once from a signed-in
  page — and never from a tool argument. There is deliberately no
  `uid` or `phone` parameter anywhere in these schemas. An agent that
  could be talked into naming a different account would be exactly the
  hole restore-access.js closed, reopened by conversation.

  Tools are declared with strict:true and additionalProperties:false, so
  a malformed call fails at the API rather than inside a handler.
*/

const { searchCareers, searchGovJobs, getCareer, getGovJob } = require("./careerCorpus");
const { latestRun } = require("./assessments");
const { findPaidEntitlements } = require("./entitlements");
const { getProduct, SKU_PRICES } = require("./catalog");
const { quote } = require("./coupons");
const { notifyOwner } = require("./notify");
const { redeemLinkCode } = require("./conversations");

const BOOKING_URL = "https://lumelive.co.in/book-session.html";
const CHECKOUT_URL = "https://lumelive.co.in/services-pricing.html";
const LINK_PAGE = "https://lumelive.co.in/start.html";

// SKUs the agent may offer. The internship tracks and the parent handbook
// are sold in conversations with a human, so they are not here — an agent
// quietly selling a ₹11,999 supervised-hours programme over WhatsApp is
// not a thing anybody asked for.
const OFFERABLE = [
  "wellness-session",
  "student-full-report",
  "lume-lens-working-profile",
  "career-intelligence-roadmap",
  "stream-clarity-session",
  "career-direction-session"
];

function tool(name, description, properties, required){
  return {
    name: name,
    description: description,
    strict: true,
    input_schema: {
      type: "object",
      properties: properties,
      required: required || Object.keys(properties),
      additionalProperties: false
    }
  };
}

const str = (description) => ({ type: "string", description });

function definitions(){
  return [
    tool("get_my_scores",
      "Read this client's own saved assessment scores. Only works if they have linked their Lume Live account to this WhatsApp number. Use it before giving any personal interpretation.",
      {}, []),

    tool("lookup_career",
      "Search Lume Live's own career library — 97 careers with Indian salary bands, entrance exams and what the work is actually like. Use this for any factual claim about a career. Never describe a career that is not in the library.",
      { query: str("What to search for, e.g. 'chartered accountant' or 'jobs after B.Sc'."),
        themes: { type:"array", items:{ type:"string", enum:["R","I","A","S","E","C"] },
                  description:"Optional RIASEC codes from the client's own profile, to nudge results." } },
      ["query"]),

    tool("lookup_government_job",
      "Search Lume Live's government-job library — 51 routes with eligibility, exam and pay details.",
      { query: str("What to search for, e.g. 'railway', 'SSC CGL', 'bank PO'.") }),

    tool("predict_colleges",
      "Look up JoSAA closing ranks for an engineering rank and category.",
      { rank: { type:"integer", description:"The client's JEE rank." },
        category: { type:"string", enum:["OPEN","EWS","OBC-NCL","SC","ST"] } }),

    tool("check_entitlements",
      "Check what this client has already paid for. Requires a linked account. Use it before suggesting they buy something they already own.",
      {}, []),

    tool("validate_coupon",
      "Check what a coupon code is worth on a product. Returns the real price from the server. Never state a price you did not get from this tool.",
      { code: str("The coupon code the client mentioned."),
        sku: { type:"string", enum: OFFERABLE, description:"Which product." } }),

    tool("create_checkout",
      "Get a payment link for a product. Requires a linked account. You choose the product; the price comes from the server and is not yours to set or quote.",
      { sku: { type:"string", enum: OFFERABLE, description:"Which product to sell." } }),

    tool("get_booking_link",
      "Get the link to book a 1:1 counselling session with a qualified counsellor.",
      {}, []),

    tool("capture_lead",
      "Record that this person is interested, so a counsellor can follow up. Use it when someone is clearly interested but not ready to book.",
      { note: str("One line on what they want help with, in their own words where possible.") }),

    tool("handoff_to_human",
      "Hand this conversation to a Lume Live counsellor. Use it when the client asks for a person, when you are out of your depth, or when something needs judgement you should not be making.",
      { reason: str("Why a human is needed. One short line for the counsellor.") }),

    tool("link_account",
      "Link this WhatsApp number to a Lume Live account, using the six-character code the client generated while signed in on the website.",
      { code: str("The six-character linking code they sent.") })
  ];
}

// ── handlers ──────────────────────────────────────────────────────────

const NEEDS_LINK = {
  linked: false,
  message: "This client has not linked their Lume Live account to this number yet. " +
           "They can do it in under a minute: sign in at " + LINK_PAGE +
           ", generate a linking code, and send it here. Do not guess or ask for personal details instead."
};

/*
  `context` carries what the caller established, not what the model said:
    { uid, phone, threadId }
  uid is null for anybody who has not linked.
*/
async function run(name, input, context){
  const ctx = context || {};
  const args = input || {};

  switch(name){

    case "get_my_scores": {
      if(!ctx.uid) return NEEDS_LINK;
      const run = await latestRun(ctx.uid);
      if(!run) return { found:false, message:"This client has no saved assessment yet. The free assessment is at https://lumelive.co.in/assessment.html" };
      return { found:true, scores: run.scores, context: run.context, taken_at: run.createdAt };
    }

    case "lookup_career": {
      const results = searchCareers(args.query, { themes: args.themes || [] });
      if(!results.length){
        return { found:false,
          message:"Nothing in the Lume Live career library matches that. Say so plainly rather than describing the career from general knowledge." };
      }
      return { found:true, count: results.length, careers: results };
    }

    case "lookup_government_job": {
      const results = searchGovJobs(args.query);
      if(!results.length){
        return { found:false, message:"Nothing in the government-job library matches that. Say so rather than improvising." };
      }
      return { found:true, count: results.length, jobs: results };
    }

    case "predict_colleges": {
      /*
        The JoSAA ingest has never produced a row — the scheduled workflow
        fails at the form probe. Until it does, this answers honestly.
        Inventing a cutoff would be the single most damaging thing this
        agent could do: a student picks a college on it.
      */
      let dataset = null;
      try{ dataset = require("../../data/josaa/manifest.json"); }catch(err){ dataset = null; }
      if(!dataset){
        return { available:false,
          message:"The JoSAA cutoff dataset is not published on this site yet. Tell the client plainly that you cannot look up cutoffs, point them at the official JoSAA site, and offer a session instead. Do not estimate a cutoff from memory." };
      }
      return { available:true, rank: args.rank, category: args.category, note:"Dataset present; predictor wiring pending." };
    }

    case "check_entitlements": {
      if(!ctx.uid) return NEEDS_LINK;
      const rows = await findPaidEntitlements({ phone: ctx.phone, email: null });
      return { owned: rows.map(r => ({ sku:r.sku, label:(getProduct(r.sku) || {}).label || r.sku, granted_at:r.grantedAt })) };
    }

    case "validate_coupon": {
      const product = getProduct(args.sku);
      if(!product) return { valid:false, message:"That is not a product Lume Live sells." };
      const result = await quote({ code: args.code, packId: args.sku, customer: null });
      return {
        valid: result.ok && result.reason === "applied",
        reason: result.reason,
        message: result.message,
        label: product.label,
        base_amount: result.base_amount,
        final_amount: result.final_amount,
        currency: "INR"
      };
    }

    case "create_checkout": {
      if(!ctx.uid) return NEEDS_LINK;
      if(OFFERABLE.indexOf(args.sku) === -1){
        return { ok:false, message:"That product is not one you can sell in this conversation. Offer a session with a counsellor instead." };
      }
      const product = getProduct(args.sku);
      if(!product) return { ok:false, message:"Unknown product." };
      /*
        A link to the page, not a created order. The checkout there
        already enforces sign-in, applies coupons and re-derives the price
        from catalog.js. Minting an order here would duplicate that
        pipeline and put an agent inside the payment path, which is a much
        bigger surface than a link.
      */
      return {
        ok: true,
        sku: args.sku,
        label: product.label,
        amount: product.amount,
        currency: "INR",
        url: CHECKOUT_URL + "#" + args.sku,
        note: "Quote the amount exactly as given here. It came from the server."
      };
    }

    case "get_booking_link":
      return { url: BOOKING_URL,
               note:"First 1:1 session is ₹249 with code FIRST50, against ₹499 list. A qualified counsellor, M.Sc Clinical Psychology." };

    case "capture_lead": {
      await notifyOwner({
        type: "whatsapp-agent-lead",
        phone: ctx.phone || "",
        summary: String(args.note || "").slice(0, 500),
        details: { thread: ctx.threadId || "", linked: Boolean(ctx.uid) }
      });
      return { ok:true, message:"Recorded. A counsellor will follow up." };
    }

    case "handoff_to_human": {
      await notifyOwner({
        type: "whatsapp-agent-handoff",
        phone: ctx.phone || "",
        summary: String(args.reason || "").slice(0, 500),
        details: { thread: ctx.threadId || "", linked: Boolean(ctx.uid) }
      });
      return { ok:true, handoff:true,
               message:"A counsellor has been told. Tell the client someone will message them, and do not keep trying to solve it yourself." };
    }

    case "link_account": {
      const result = await redeemLinkCode({ code: args.code, phone: ctx.phone });
      if(result.ok) return { ok:true, message:"Linked. You can now read their saved assessment and what they have paid for." };
      const why = {
        unknown: "That code is not recognised. Codes are six characters and are generated while signed in at " + LINK_PAGE + ".",
        expired: "That code has expired — they last fifteen minutes. Ask them to generate a fresh one.",
        already_used: "That code has already been used. Ask them to generate a fresh one.",
        invalid: "That does not look like a linking code."
      };
      return { ok:false, message: why[result.reason] || why.invalid };
    }

    default:
      return { error: "Unknown tool: " + name };
  }
}

module.exports = { definitions, run, OFFERABLE, BOOKING_URL, CHECKOUT_URL, LINK_PAGE, NEEDS_LINK };
