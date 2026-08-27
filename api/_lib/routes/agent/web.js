/*
  POST /api/agent/web   the assistant on lumelive.co.in

  The same agent the WhatsApp webhook runs, reachable from a browser.
  Same safety gate, same tools, same career library, same refusal to
  invent a cut-off — chatTurn exports one order of operations and both
  channels go through it.

  What is different is who is asking, and that changes two things.

  ── Identity ──

  A phone number arrives proven, by an HMAC from the provider. A browser
  arrives as nobody. So a web session is issued by this route, not chosen
  by the caller: 24 random bytes, returned once, sent back on every later
  message. It is a bearer token for one transcript and nothing else — it
  grants no access to an account, a saved assessment, or a purchase.

  Personal answers need a real sign-in. If the request carries a verified
  Firebase ID token the agent gets that uid and can read that client's own
  assessment; without one it answers well in general and reads nothing.
  There is no middle setting, and in particular a session id is never
  upgraded into an identity — that is exactly the hole restore-access.js
  was written to close, and this route is a wider door than that one was.

  ── Money ──

  This is a public endpoint that calls a frontier model. An abusive
  caller cannot be argued with, so there are three ceilings and they
  are checked cheapest-first:

    1. per IP        — a flood guard, loose enough for a school lab
    2. per session   — the real limit on one conversation
    3. per day, site — a cap on the worst possible day

  The daily site cap is the one that matters at 3am. Everything else on
  this site fails open so a broken limiter cannot stop somebody paying;
  this one fails closed, because a broken limiter here spends money.
*/

const { json, setCors, readBody } = require("../../http");
const { checkRateLimit, clientKey } = require("../../rateLimit");
const { requireAccount } = require("../../account");
const conversations = require("../../conversations");
const { handleWeb } = require("../../chatTurn");

const MAX_MESSAGE_CHARS = 2000;

/* Loose: a school computer lab is one address and thirty students. */
const IP_LIMIT = 240;
const IP_WINDOW_MS = 60 * 60 * 1000;

/* The real per-conversation limit lives in conversations.withinBudget;
   this is only a burst guard against a script hammering one session. */
const SESSION_LIMIT = 40;
const SESSION_WINDOW_MS = 60 * 60 * 1000;

/* The worst-day ceiling. Deliberately a blunt instrument. */
const SITE_DAILY_LIMIT = Number.parseInt(process.env.AGENT_WEB_DAILY_CAP || "", 10) || 2000;

const BUSY_REPLY =
  "We've had a lot of conversations today and I've hit my limit. " +
  "Message us on WhatsApp at +91 70156 71280 and a counsellor will pick it up.";

function today(){
  return new Date().toISOString().slice(0, 10);
}

/*
  `deps` is never passed in production — Vercel calls handlers with
  (req, res). It exists for the same reason chatTurn's does: so the HTTP
  layer can be tested against a stubbed agent instead of an API key.
  Without it the route tests below would pass by exercising the error
  path, which is a test that agrees with itself.
*/
module.exports = async function handler(req, res, deps){
  setCors(req, res, "POST,OPTIONS");
  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }
  if(req.method !== "POST"){
    return json(res, 405, { ok:false, error:"Method not allowed" });
  }

  // ── 1. flood guard, before anything costs anything ──────────────────
  const ipOk = await checkRateLimit({
    key: "agent-web-ip:" + clientKey(req),
    limit: IP_LIMIT,
    windowMs: IP_WINDOW_MS
  });
  if(!ipOk){
    return json(res, 429, { ok:false, error:"Too many messages from this network just now. Please try again shortly." });
  }

  let body;
  try{ body = await readBody(req); }
  catch(err){ return json(res, 400, { ok:false, error:"Invalid request." }); }

  const message = String(body.message || "").trim();
  if(!message){
    return json(res, 400, { ok:false, error:"Say something and I'll answer." });
  }
  if(message.length > MAX_MESSAGE_CHARS){
    return json(res, 400, { ok:false, error:"That's longer than I can read in one go — could you shorten it?" });
  }

  /*
    An unrecognised session id starts a new conversation rather than
    being trusted as a key. A caller who invents one gets their own empty
    thread, not somebody else's.
  */
  const claimed = String(body.session || "");
  const sessionId = conversations.validWebSession(claimed) ? claimed : conversations.webSessionId();
  const isNew = sessionId !== claimed;

  // ── 2. per-session burst guard ──────────────────────────────────────
  const sessionOk = await checkRateLimit({
    key: "agent-web-session:" + sessionId,
    limit: SESSION_LIMIT,
    windowMs: SESSION_WINDOW_MS
  });
  if(!sessionOk){
    return json(res, 429, { ok:false, session: sessionId,
      reply: "We've covered a lot in one sitting. Give it a few minutes, or message us on WhatsApp and a counsellor will take it from here." });
  }

  // ── 3. the worst-day ceiling ────────────────────────────────────────
  const siteOk = await checkRateLimit({
    key: "agent-web-day:" + today(),
    limit: SITE_DAILY_LIMIT,
    windowMs: 24 * 60 * 60 * 1000
  });
  if(!siteOk){
    return json(res, 200, { ok:true, session: sessionId, reply: BUSY_REPLY, locked: true, capped: true });
  }

  /*
    Sign-in is optional here, so an unverifiable token is not an error —
    it is simply an anonymous visitor. Only a verified one produces a uid,
    and requireAccount is the same verifier the paying routes use.
  */
  let uid = null;
  try{
    const account = await requireAccount(req);
    if(account.ok && account.account && account.account.uid) uid = account.account.uid;
  }catch(err){
    uid = null;
  }

  try{
    const turn = (deps && deps.turn) || handleWeb;
    const result = await turn({ sessionId, text: message, uid }, deps);
    return json(res, 200, {
      ok: true,
      session: sessionId,
      new_session: isNew,
      reply: result.reply,
      locked: Boolean(result.locked),
      personalised: Boolean(uid)
    });
  }catch(err){
    console.error("[lume agent] web turn failed:", err && err.message);
    return json(res, 503, { ok:false, session: sessionId,
      error:"Something went wrong at my end. Please message us on WhatsApp at +91 70156 71280 and a counsellor will help." });
  }
};
