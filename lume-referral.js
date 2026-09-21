/* ==================================================================
   Lume Live — Referral (lumeReferral)
   ------------------------------------------------------------------
   Two halves of the same loop, and they never run on the same visit:

   INBOUND  — this browser arrived on ?ref=AARAV7K2. The code is stashed
              for 30 days, first touch wins, and reported to the server
              once the student finishes a quiz. Nothing is shown; a
              student who followed a friend's link should get the quiz,
              not a banner about somebody else's reward.

   OUTBOUND — this student has a code of their own. It is fetched once
              per session (only when they are signed in) and cached, so
              that decorate() can answer synchronously at the moment the
              story card is drawn — a QR cannot wait for a round trip.

   Everything here fails silently. A referral is a bonus on top of the
   product; not one line of it may break a quiz result, a share sheet or
   a page load. Every network call is wrapped, every storage access is
   wrapped, and every public method has a defined answer when the whole
   thing is unavailable.

   Public API:
     LumeReferral.inbound()        -> "AARAV7K2" | ""   (who sent me)
     LumeReferral.mine()           -> "AARAV7K2" | ""   (cached, sync)
     LumeReferral.ready()          -> Promise<code|"">  (fetch if needed)
     LumeReferral.decorate(url[,code]) -> url + ?ref= (sync, cached)
     LumeReferral.claim(event)     -> Promise<boolean>  ("snapshot")
     LumeReferral.forget()         -> clear the inbound stash
   ================================================================== */
(function(){
  "use strict";

  var CODE_ENDPOINT = "/api/referrals/code";
  var CLAIM_ENDPOINT = "/api/referrals/claim";

  var IN_KEY = "lumeRefInbound";   // { code, ts }
  var MY_KEY = "lumeRefMine";      // { code, uid }
  var CLAIMED_KEY = "lumeRefClaimed"; // "snapshot,stream"

  /* A friend who takes the quiz a month later is still that friend's
     referral; one who follows a different link next term is not. */
  var WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

  var PARAM = "ref";

  /* ---------------------------------------------------------------- */
  /* Storage that cannot throw                                         */
  /* ---------------------------------------------------------------- */
  /* Private mode, blocked cookies and a full quota all throw on plain
     localStorage access, and one of those on a quiz page is a blank
     result screen. */
  function read(key){
    try{
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  }
  function write(key, value){
    try{ window.localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch(e){ return false; }
  }
  function drop(key){
    try{ window.localStorage.removeItem(key); }catch(e){}
  }

  /* Same normalisation the server applies (api/_lib/referrals.js), so a
     code that survives this is a code the server will recognise. */
  function normalize(value){
    return String(value == null ? "" : value)
      .toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  }
  function looksLikeCode(value){
    var code = normalize(value);
    return code.length >= 6 ? code : "";
  }

  /* ---------------------------------------------------------------- */
  /* Inbound                                                           */
  /* ---------------------------------------------------------------- */

  function stashed(){
    var row = read(IN_KEY);
    if(!row || !row.code) return "";
    if(!row.ts || (Date.now() - Number(row.ts)) > WINDOW_MS){
      drop(IN_KEY);
      return "";
    }
    return looksLikeCode(row.code);
  }

  /* First touch wins. A student who opens two friends' links belongs to
     the one who actually got them here; overwriting would hand the
     referral to whoever shared most recently, which rewards spam. */
  function capture(){
    var code = "";
    try{
      code = looksLikeCode(new URLSearchParams(window.location.search).get(PARAM));
    }catch(e){ code = ""; }
    if(!code) return stashed();

    var existing = stashed();
    if(existing) return existing;

    write(IN_KEY, { code: code, ts: Date.now() });
    return code;
  }

  /* ---------------------------------------------------------------- */
  /* Outbound                                                          */
  /* ---------------------------------------------------------------- */

  /* Cached against the uid it was minted for: a shared laptop where a
     second student signs in must not hand them the first one's code and
     credit their referrals to the wrong account. */
  function cached(uid){
    var row = read(MY_KEY);
    if(!row || !row.code) return "";
    if(uid && row.uid && row.uid !== uid) return "";
    return looksLikeCode(row.code);
  }

  function account(){
    return (window.lumeAccount && typeof window.lumeAccount.ready === "function")
      ? window.lumeAccount.ready()
      : Promise.resolve(null);
  }

  function token(){
    return (window.lumeAccount && typeof window.lumeAccount.token === "function")
      ? window.lumeAccount.token()
      : Promise.resolve("");
  }

  function post(url, body, idToken){
    return fetch(url, {
      method: "POST",
      headers: idToken
        ? { "Content-Type": "application/json", "Authorization": "Bearer " + idToken }
        : { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    }).then(function(r){
      return r.ok ? r.json() : null;
    });
  }

  /* One fetch per page, however many callers ask. The share sheet, the
     dashboard and a claim can all want this within the same second. */
  var pending = null;

  function ready(){
    if(pending) return pending;

    pending = account().then(function(user){
      if(!user || !user.uid) return "";

      var hit = cached(user.uid);
      if(hit) return hit;

      /* Cached, but minted for a different account — a shared phone or a
         second sign-in. Drop it before the fetch so nothing reads it in
         the meantime and credits this student's shares to the last one. */
      drop(MY_KEY);

      return token().then(function(idToken){
        if(!idToken) return "";
        return post(CODE_ENDPOINT, {}, idToken).then(function(data){
          var code = data && looksLikeCode(data.code);
          if(!code) return "";
          write(MY_KEY, { code: code, uid: user.uid });
          return code;
        });
      });
    }).catch(function(){ return ""; });

    return pending;
  }

  /* Synchronous, because the QR encoder and the caption builder both run
     inside a draw call. Returns the URL untouched when there is no code
     yet — the share sheet re-renders when ready() lands and calls this
     again with the real code.

     An existing ref is REPLACED, not kept. On a shared laptop the cache
     can briefly hold the previous student's code, and the second call
     (with the fetched code passed in) is what corrects it; skipping a
     URL that already has a ref would leave the wrong one on the card. */
  function decorate(url, code){
    var base = String(url == null ? "" : url);
    var ref = looksLikeCode(code || cached(""));
    if(!base || !ref) return base;

    var clean = base
      .replace(new RegExp("([?&])" + PARAM + "=[^&#]*&", "g"), "$1")
      .replace(new RegExp("([?&])" + PARAM + "=[^&#]*$"), "")
      .replace(/\?$/, "");

    return clean + (clean.indexOf("?") === -1 ? "?" : "&") + PARAM + "=" + encodeURIComponent(ref);
  }

  /* ---------------------------------------------------------------- */
  /* Claiming                                                          */
  /* ---------------------------------------------------------------- */

  function alreadyClaimed(event){
    var row = read(CLAIMED_KEY);
    return Boolean(row && row[event]);
  }
  function markClaimed(event){
    var row = read(CLAIMED_KEY) || {};
    row[event] = Date.now();
    write(CLAIMED_KEY, row);
  }

  /*
     Called when a student finishes a quiz. The server decides whether it
     counts — this only decides whether it is worth asking. The local
     mark is an optimisation against a re-take, not a control: the real
     once-per-person rule lives in referralAttributions.
  */
  function claim(event){
    var name = String(event || "");
    var code = stashed();
    if(!name || !code || alreadyClaimed(name)) return Promise.resolve(false);

    return account().then(function(user){
      if(!user || !user.uid) return false;
      return token().then(function(idToken){
        if(!idToken) return false;
        return post(CLAIM_ENDPOINT, { ref: code, event: name }, idToken).then(function(data){
          /* Marked only when the server actually answered. Every decision
             it makes is final and repeating it would change nothing, so a
             refusal is worth remembering — but a 429 or a 503 is not an
             answer, and marking one would lose the referral for good. */
          if(!data) return false;
          markClaimed(name);
          return Boolean(data.counted);
        });
      });
    }).catch(function(){ return false; });
  }

  /* ---------------------------------------------------------------- */

  var inboundCode = "";
  try{ inboundCode = capture(); }catch(e){ inboundCode = ""; }

  window.LumeReferral = {
    inbound: function(){ return inboundCode; },
    mine: function(){ return cached(""); },
    ready: ready,
    decorate: decorate,
    claim: claim,
    forget: function(){ drop(IN_KEY); inboundCode = ""; },
    PARAM: PARAM
  };

})();
