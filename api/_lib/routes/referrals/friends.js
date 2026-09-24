/*
  POST /api/referrals/friends     — signed in

  The list behind the number. A student who has earned ₹150 and cannot
  withdraw it wants to see the three referrals it came from and which of
  them have cleared the hold.

  ───────────────────────────────────────────────────────────────────────
  What this can and cannot answer
  ───────────────────────────────────────────────────────────────────────
  An attribution row is written at the moment a referral qualifies and
  never before, so everyone here counted. There is no record of somebody
  who opened a link and stopped — this cannot say "your friend hasn't
  taken it yet", and nothing in the response pretends otherwise.

  ───────────────────────────────────────────────────────────────────────
  First names, and nothing else
  ───────────────────────────────────────────────────────────────────────
  The friend never agreed to appear on somebody else's dashboard. They
  agreed to take a quiz.

  So the most this returns about them is a FIRST NAME, and only if they
  gave one when signing up. No email, no phone, no surname, no uid — a
  referrer who is shown "Aarav" learns nothing they did not already know,
  because they are the person who sent Aarav the link. An email address
  would be different in kind: it is a handle for contacting somebody who
  did not offer it.

  Names are read from Firebase Auth at request time rather than copied
  onto the attribution when it is written. That costs one batched lookup
  per dashboard view and buys two things: the name is never duplicated
  into a document belonging to someone else, and a friend who deletes
  their account stops appearing here without anything having to remember
  to delete it.

  If the lookup fails the list still renders — dates and amounts are the
  load-bearing part, and "A friend" is an honest stand-in for a name we
  could not read.
*/

const { json, setCors, readBody } = require("../../http");
const { requireAccount } = require("../../account");
const { checkRateLimit, clientKey } = require("../../rateLimit");
const { friendsFor, isEnabled, HOLD_MS } = require("../../referrals");

// A first name is the whole of what we are willing to show. Take the
// first word of whatever they typed, cap it, and drop anything that is
// not a name-shaped run of characters.
function firstName(displayName){
  const raw = String(displayName || "").trim();

  /*
    Some people type their email address into the name field. Stripping
    the punctuation out of one would leave the local part sitting on
    somebody else's dashboard looking like a name — "aaravgmailcom" — so
    anything with an @ or a digit run long enough to be a phone number is
    refused outright and shows as "A friend" instead.
  */
  if(raw.indexOf("@") !== -1) return "";
  if(/\d{6,}/.test(raw)) return "";

  const first = raw.split(/\s+/)[0] || "";
  const clean = first.replace(/[^\p{L}\p{M}'\-]/gu, "").slice(0, 24);
  return clean.length >= 2 ? clean : "";
}

/*
  uid -> first name, in one call rather than one per row.

  Never throws: a name is a nicety and the list is useful without it.
*/
async function namesFor(uids){
  const names = {};
  if(!uids.length) return names;
  try{
    const { auth } = require("../../firebaseAdmin");
    const result = await auth().getUsers(uids.map(function(uid){ return { uid: uid }; }));
    (result.users || []).forEach(function(user){
      const name = firstName(user.displayName);
      if(name) names[user.uid] = name;
    });
  }catch(err){
    console.error("[lume referrals] could not resolve friend names:", err && err.message);
  }
  return names;
}

module.exports = async function handler(req, res){
  if(!isEnabled()) return json(res, 404, { error: "Not found" });

  setCors(req, res, "POST,OPTIONS");
  if(req.method === "OPTIONS"){
    res.statusCode = 204;
    return res.end();
  }
  if(req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const allowed = await checkRateLimit({
    key: "referral-friends:" + clientKey(req),
    limit: 60,
    windowMs: 60 * 60 * 1000
  });
  if(!allowed) return json(res, 429, { error: "Too many requests. Please try again shortly." });

  // Read and discard, so the request shape matches every other POST here
  // and the body stays size-capped.
  try{ await readBody(req); }
  catch(err){
    if(err && err.statusCode === 413) return json(res, 413, { error: "Request body too large." });
    return json(res, 400, { error: "Invalid JSON body." });
  }

  const account = await requireAccount(req);
  if(!account.ok) return json(res, account.status, { error: account.error, code: account.code });
  if(!account.account) return json(res, 401, { error: "Sign in first.", code: "NO_ACCOUNT" });

  try{
    const rows = await friendsFor(account.account.uid);
    const names = await namesFor(rows.map(function(row){ return row.uid; }));

    return json(res, 200, {
      ok: true,
      hold_days: Math.round(HOLD_MS / (24 * 60 * 60 * 1000)),
      // The uid is dropped here: it identifies the friend's account and
      // the browser has no use for it.
      friends: rows.map(function(row){
        return {
          name: names[row.uid] || "",
          amount: row.amount,
          when: row.created_at,
          cleared: row.cleared
        };
      })
    });
  }catch(err){
    console.error("[lume referrals] friends list failed:", err && err.message);
    return json(res, 503, { error: "We can't load that list right now. Please try again in a few minutes." });
  }
};

// Exported for the tests: this is the whole of what the friend's account
// is allowed to contribute to somebody else's screen.
module.exports.firstName = firstName;
