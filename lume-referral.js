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
     LumeReferral.stats()          -> { qualified, credit_earned, … } | null
     LumeReferral.inviteMessage(lang, url) -> text for a WhatsApp invite
     LumeReferral.payout([{upi, ageDeclared}]) -> Promise<answer|null>
     LumeReferral.decorate(url[,code]) -> url + ?ref= (sync, cached)
     LumeReferral.claim(event)     -> Promise<{counted, needsPhone, offer}>
     LumeReferral.claimWithPhone(event) -> claim, offering OTP if needed
     LumeReferral.forget()         -> clear the inbound stash
   ================================================================== */
(function(){
  "use strict";

  var CODE_ENDPOINT = "/api/referrals/code";
  var CLAIM_ENDPOINT = "/api/referrals/claim";
  var PAYOUT_ENDPOINT = "/api/referrals/payout";

  var IN_KEY = "lumeRefInbound";   // { code, ts }
  var MY_KEY = "lumeRefMine";      // { code, uid, stats }
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

  /* The code this page view is carrying, whether or not it could be
     written down. Storage throws in a private window and silently drops
     writes when the quota is full; on a quiz page the referral is still
     perfectly real for the rest of this page view, and the student is
     usually about to finish the quiz on it. It just will not survive a
     navigation, which is the part we cannot help. */
  var memo = "";

  function stashed(){
    var row = read(IN_KEY);
    if(!row || !row.code) return memo;
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
    memo = code;
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
     dashboard and a claim can all want this within the same second.

     Only a SUCCESS is kept. Caching a failure would mean a page that
     failed once can never recover — the dashboard's "try again" button
     would hand back the same rejected promise forever, and a student who
     signs in after the first call would be told they have no code. */
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
          /* The totals ride along with the code so the share sheet can
             say "2 friends joined" without a second round trip. They are
             a cache of a server number, never the source of one. */
          write(MY_KEY, {
            code: code, uid: user.uid,
            stats: (data && data.stats) || null,
            friendOffer: (data && data.friend_offer) || null
          });
          return code;
        });
      });
    }).catch(function(){ return ""; });

    /* Forget anything that did not produce a code, so the next caller
       retries rather than replaying the failure. */
    pending = pending.then(function(code){
      if(!code) pending = null;
      return code;
    });

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

  /* What the last fetch said this student has earned. Null until
     ready() has resolved at least once. Display only — the ledger is
     the server's, and this is a copy of it that can go stale. */
  function stats(){
    var row = read(MY_KEY);
    return (row && row.stats) || null;
  }

  /* What the friend gets, as the server last reported it. Null when
     there is no live offer to promise. */
  function friendOffer(){
    var row = read(MY_KEY);
    return (row && row.friendOffer) || null;
  }

  /* ---------------------------------------------------------------- */
  /* The invite                                                        */
  /* ---------------------------------------------------------------- */

  /*
     A referral message, not a result. The story card is the right thing
     to post to a status; a 1:1 WhatsApp chat wants a sentence and a
     link, which is why this is separate from the card's captions.

     It deliberately does not mention the reward. A friend who is told
     "take this so I get ₹50" is being asked for a favour; one who is
     told the quiz is worth two minutes is being given something. The
     reward is the referrer's business, and it is shown to them.
  */
  function inviteMessage(lang, url){
    var link = String(url || "");
    return (lang === "hi")
      ? "मैंने अभी ये 2 मिनट का career quiz किया — बिना पैसे के, और result सच में सटीक था.\n" +
        "तुम भी करके देखो, फिर बताना क्या आया 👇\n" + link
      : "Just did this 2-minute career quiz — it's free and honestly a bit too accurate.\n" +
        "Take it and tell me what you get 👇\n" + link;
  }

  /* ---------------------------------------------------------------- */
  /* Payouts                                                           */
  /* ---------------------------------------------------------------- */

  /*
     Ask the server what this student can be paid, or ask to be paid.

       payout()                                  -> { summary }
       payout({ upi, ageDeclared: true })        -> { ok, reason, summary }

     Never cached. A balance is the one number on the dashboard that
     must not be a moment out of date, and this is called rarely.
  */
  function payout(opts){
    var o = opts || {};
    var body = o.upi
      ? { request: true, upi: o.upi, age_declared: o.ageDeclared === true }
      : {};

    return account().then(function(user){
      if(!user || !user.uid) return null;
      return token().then(function(idToken){
        if(!idToken) return null;
        return post(PAYOUT_ENDPOINT, body, idToken);
      });
    }).catch(function(){ return null; });
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
    var no = { counted: false, needsPhone: false, offer: null };
    if(!name || !code || alreadyClaimed(name)) return Promise.resolve(no);

    return account().then(function(user){
      if(!user || !user.uid) return no;
      return token().then(function(idToken){
        if(!idToken) return no;
        return post(CLAIM_ENDPOINT, { ref: code, event: name }, idToken).then(function(data){
          if(!data) return { counted: false, needsPhone: false };

          /*
             A missing phone number is the one refusal that is NOT final:
             the student can verify one and the same claim then counts.
             So it is deliberately not marked as claimed — everything
             else is, because repeating it would change nothing and a 429
             or a 503 is not an answer at all.
          */
          if(data.needs_phone) return { counted: false, needsPhone: true, offer: null };

          markClaimed(name);
          return { counted: Boolean(data.counted), needsPhone: false, offer: data.offer || null };
        });
      });
    }).catch(function(){ return no; });
  }

  /*
     Claim, and stop there.

     This used to open the phone-verification card when a claim came
     back needing a number — which meant somebody who had just signed in
     with their name, email and a code was immediately asked for a
     mobile number and an SMS. Two verifications for one sign-in reads as
     a site that cannot make up its mind, and since phone auth needs
     Firebase's Blaze plan, the card could not finish even when they
     said yes: a dead end, mid-quiz, right after the result they came
     for.

     So the claim is made and its answer is returned as-is. A referral
     that needs a number simply does not count yet — refer.html still
     offers the number explicitly, for anyone who has gone looking for
     their reward — and nothing interrupts the person who was only here
     to see their result.

     The name is kept because two pages call it. It is now claim() plus
     one thing: when the referral lands, the friend is told about their
     own ₹100. That is the opposite of the interruption removed above —
     it is not asking them for anything, it is giving them something,
     and it appears under a result they already have.
  */
  function claimWithPhone(event){
    return claim(event).then(function(answer){
      announce(answer);
      return answer;
    });
  }

  /* ---------------------------------------------------------------- */
  /* The friend's offer                                                */
  /* ---------------------------------------------------------------- */

  /*
     A student who arrived on a friend's link has just earned that friend
     ₹50 and, until now, got nothing themselves. This is their half.

     Shown once, as a dismissible bar under the result, and never again
     on this device — it is information, not a nag, and the code stays
     valid whether or not they read it here. Rendered from what the
     SERVER sent: if FRIEND100 is switched off, no offer comes back and
     nothing is promised.
  */
  var OFFER_SEEN = "lumeRefOfferSeen";

  function announce(answer){
    var offer = answer && answer.offer;
    if(!offer || !offer.code || !(offer.amount > 0)) return;
    if(read(OFFER_SEEN)) return;
    if(typeof document === "undefined" || !document.body) return;

    write(OFFER_SEEN, { code: offer.code, at: Date.now() });

    try{ renderOfferBar(offer); }catch(e){}
  }

  function renderOfferBar(offer){
    if(!document.getElementById("lumeOfferCSS")){
      var css = document.createElement("style");
      css.id = "lumeOfferCSS";
      css.textContent = [
        ".lro{position:fixed;left:50%;bottom:16px;transform:translate(-50%,12px);z-index:9999;",
        "width:min(460px,calc(100vw - 24px));display:flex;gap:12px;align-items:flex-start;",
        "background:#0D1B40;color:#fff;border-radius:16px;padding:14px 16px;",
        "box-shadow:0 18px 50px rgba(8,16,38,.4);font:600 .86rem/1.45 'Inter',system-ui,Arial,sans-serif;",
        "opacity:0;transition:opacity .25s,transform .25s}",
        ".lro.on{opacity:1;transform:translate(-50%,0)}",
        ".lro-b{flex:1}",
        ".lro-c{display:inline-block;margin-top:6px;padding:4px 9px;border-radius:7px;background:rgba(255,255,255,.14);",
        "font:800 .85rem/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.5px;cursor:pointer}",
        ".lro-x{background:transparent;border:0;color:rgba(255,255,255,.6);font-size:1.05rem;line-height:1;",
        "cursor:pointer;padding:2px 4px;flex-shrink:0}",
        ".lro-x:hover{color:#fff}"
      ].join("");
      document.head.appendChild(css);
    }

    var bar = document.createElement("div");
    bar.className = "lro";
    bar.setAttribute("role", "status");

    var body = document.createElement("div");
    body.className = "lro-b";
    body.appendChild(document.createTextNode(
      "\uD83C\uDF81 A friend invited you \u2014 here's \u20B9" + offer.amount +
      " off your first report or counselling session."));

    var code = document.createElement("span");
    code.className = "lro-c";
    code.textContent = offer.code;
    code.title = "Tap to copy";
    code.addEventListener("click", function(){
      try{
        if(navigator.clipboard && navigator.clipboard.writeText){
          navigator.clipboard.writeText(offer.code);
          code.textContent = "Copied \u2713";
          setTimeout(function(){ code.textContent = offer.code; }, 1400);
        }
      }catch(e){}
    });
    body.appendChild(document.createElement("br"));
    body.appendChild(code);
    bar.appendChild(body);

    var x = document.createElement("button");
    x.className = "lro-x";
    x.type = "button";
    x.setAttribute("aria-label", "Dismiss");
    x.textContent = "\u2715";
    x.addEventListener("click", function(){
      bar.classList.remove("on");
      setTimeout(function(){ if(bar.parentNode) bar.parentNode.removeChild(bar); }, 260);
    });
    bar.appendChild(x);

    document.body.appendChild(bar);
    requestAnimationFrame(function(){ bar.classList.add("on"); });
  }

  /* ---------------------------------------------------------------- */

  var inboundCode = "";
  try{ inboundCode = capture(); }catch(e){ inboundCode = ""; }

  window.LumeReferral = {
    inbound: function(){ return inboundCode; },
    mine: function(){ return cached(""); },
    ready: ready,
    stats: stats,
    friendOffer: friendOffer,
    payout: payout,
    claimWithPhone: claimWithPhone,
    inviteMessage: inviteMessage,
    decorate: decorate,
    claim: claim,
    forget: function(){ drop(IN_KEY); memo = ""; inboundCode = ""; },
    PARAM: PARAM
  };

})();
