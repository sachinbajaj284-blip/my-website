/*
  Lume Live — coupon UI (hero badge + checkout widget)

  Two pieces, one file, no dependencies:

  1. Hero badge — a promo pill whose code copies to the clipboard on tap.
     Any element with [data-lume-coupon-badge] is upgraded automatically
     on DOM ready. It renders from its own markup first, then refreshes
     from /api/coupons/active if that endpoint answers, so the banner is
     correct before the network and follows the live catalogue after it.

  2. Checkout widget — the collapsible "Have a coupon code?" field.
     Mount it with:

       var coupon = LumeCoupons.mountCheckout(container, {
         getPack: function(){ return { sku:"wellness-session", amount:499 }; },
         onChange: function(state){ ...redraw your price row... }
       });

     `state` is null when nothing is applied, otherwise
       { code, base, discount, total, label }

     At pay time read coupon.getCode() and pass it to the server. The
     PRICE IS NEVER TAKEN FROM HERE — this widget exists to show a
     number, and /api/cashfree/create-order recalculates it from the
     code before charging anything. Nothing in this file is trusted.

  A code copied from the hero badge is remembered for the tab
  (sessionStorage) and pre-filled at checkout, so the client doesn't have
  to paste something they just tapped.
*/
(function(){
  "use strict";

  var VALIDATE_ENDPOINT = "/api/coupons/validate";
  var ACTIVE_ENDPOINT = "/api/coupons/active";
  var STASH_KEY = "lumeCouponCode";

  /* ============================================================
     Helpers
     ============================================================ */

  function esc(v){
    return String(v == null ? "" : v).replace(/[&<>"']/g, function(ch){
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch];
    });
  }

  function inr(amount){
    var n = Number(amount || 0);
    return "₹" + (isNaN(n) ? "0" : n.toLocaleString("en-IN"));
  }

  // Same normalisation the server applies, so what the client sees in the
  // box is what the server will look up.
  function normalizeCode(value){
    return String(value == null ? "" : value).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
  }

  // Pages already carry a toast (index.html's showToast, or the payment
  // modal's). Reuse whichever exists rather than stacking a second
  // notification system on top; fall back to our own only if neither is
  // there.
  function toast(message){
    if(typeof window.showToast === "function"){ window.showToast(message); return; }
    if(typeof window.toast === "function"){ window.toast(message); return; }
    ownToast(message);
  }

  var toastEl = null;
  var toastTimer = null;
  function ownToast(message){
    if(!toastEl){
      toastEl = document.createElement("div");
      toastEl.className = "lcp-toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.classList.remove("show"); }, 2600);
  }

  // execCommand is the fallback for the two cases navigator.clipboard
  // doesn't cover: an insecure origin, and older mobile browsers.
  function copyText(text){
    if(navigator.clipboard && navigator.clipboard.writeText){
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function(resolve, reject){
      try{
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-1000px";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error("copy rejected"));
      }catch(err){ reject(err); }
    });
  }

  function stashCode(code){
    try{ window.sessionStorage.setItem(STASH_KEY, code); }catch(err){}
  }
  function readStashedCode(){
    try{ return normalizeCode(window.sessionStorage.getItem(STASH_KEY) || ""); }
    catch(err){ return ""; }
  }

  // ?coupon=FIRST50 in the URL beats anything stashed — it's how a
  // campaign link hands a code to the page.
  function urlCode(){
    try{ return normalizeCode(new URLSearchParams(window.location.search).get("coupon") || ""); }
    catch(err){ return ""; }
  }

  function track(event, label){
    if(typeof window.gtag === "function"){
      window.gtag("event", event, { event_category: "coupon", event_label: label || "" });
    }
  }

  /* ============================================================
     Styles
     ============================================================ */

  function injectStyles(){
    if(document.getElementById("lcp-styles")) return;
    var css = [
/* ---------- hero badge ---------- */
".lcp-badge{display:flex;align-items:center;gap:12px;flex-wrap:wrap;width:100%;max-width:520px;margin:0 0 18px;padding:12px 14px;border-radius:16px;background:linear-gradient(120deg,rgba(201,147,58,.20),rgba(10,110,110,.18));border:1px solid rgba(232,185,90,.42);color:#fff;box-shadow:0 10px 30px rgba(8,16,38,.22);font-family:inherit;box-sizing:border-box}",
".lcp-badge-body{flex:1 1 190px;min-width:0}",
".lcp-badge-eyebrow{display:flex;align-items:center;gap:6px;font-size:.6rem;font-weight:900;letter-spacing:1.3px;text-transform:uppercase;color:#E8B95A;margin-bottom:3px}",
".lcp-badge-dot{width:6px;height:6px;border-radius:50%;background:#4ADE80;box-shadow:0 0 0 0 rgba(74,222,128,.7);animation:lcp-pulse 2s infinite}",
"@keyframes lcp-pulse{70%{box-shadow:0 0 0 7px rgba(74,222,128,0)}100%{box-shadow:0 0 0 0 rgba(74,222,128,0)}}",
".lcp-badge-h{display:block;font-size:.92rem;font-weight:800;line-height:1.3;color:#fff}",
".lcp-badge-sub{display:block;margin-top:3px;font-size:.75rem;line-height:1.4;color:rgba(255,255,255,.76)}",
".lcp-badge-price{white-space:nowrap}",
".lcp-badge-was{text-decoration:line-through;opacity:.6;margin-right:5px}",
".lcp-badge-now{color:#4ADE80;font-weight:800}",
/* the code itself — looks like a torn-off ticket stub, and is the tap target */
".lcp-code{position:relative;display:inline-flex;align-items:center;gap:8px;flex:0 0 auto;border:1.5px dashed rgba(232,185,90,.75);background:rgba(8,16,38,.34);color:#fff;border-radius:11px;padding:9px 13px;font:inherit;font-size:.86rem;font-weight:900;letter-spacing:1.2px;cursor:pointer;transition:background .18s,border-color .18s,transform .12s}",
".lcp-code:hover{background:rgba(8,16,38,.5);border-color:#E8B95A}",
".lcp-code:active{transform:scale(.97)}",
".lcp-code:focus-visible{outline:2px solid #E8B95A;outline-offset:2px}",
".lcp-code-ico{flex:0 0 auto;opacity:.85}",
".lcp-code.copied{border-color:#4ADE80;background:rgba(22,101,52,.42)}",
".lcp-code.copied .lcp-code-ico{opacity:1;color:#4ADE80}",
/* light surfaces (a badge on a white card rather than the navy hero) */
".lcp-badge.lcp-light{background:linear-gradient(120deg,#FFF7E8,#F1FAF8);border-color:#EBD9B4;color:#16264d;box-shadow:0 10px 26px rgba(13,27,64,.08)}",
".lcp-badge.lcp-light .lcp-badge-eyebrow{color:#0A6E6E}",
".lcp-badge.lcp-light .lcp-badge-h{color:#0D1B40}",
".lcp-badge.lcp-light .lcp-badge-sub{color:#4A6060}",
".lcp-badge.lcp-light .lcp-badge-now{color:#0B8F62}",
".lcp-badge.lcp-light .lcp-code{background:#fff;color:#0D1B40;border-color:#C9933A}",
".lcp-badge.lcp-light .lcp-code:hover{background:#FFFBF3}",
/* ---------- checkout widget ---------- */
".lcp-wrap{margin:14px 0;font-family:inherit;text-align:left}",
".lcp-toggle{display:flex;align-items:center;gap:9px;width:100%;background:#F7F9FC;border:1.5px dashed #D6DFEC;border-radius:13px;padding:12px 14px;font:inherit;font-size:.86rem;font-weight:700;color:#33425c;cursor:pointer;transition:border-color .18s,background .18s;box-sizing:border-box}",
".lcp-toggle:hover{border-color:#0A6E6E;background:#F2F8F7}",
".lcp-toggle:focus-visible{outline:2px solid #0A6E6E;outline-offset:2px}",
".lcp-toggle-ico{flex:0 0 auto;font-size:1rem;line-height:1}",
".lcp-toggle-t{flex:1;min-width:0;text-align:left}",
".lcp-toggle-hint{flex:0 0 auto;font-size:.68rem;font-weight:900;letter-spacing:.6px;text-transform:uppercase;color:#0A6E6E;background:#E4F3F0;border-radius:999px;padding:3px 8px}",
".lcp-chev{flex:0 0 auto;transition:transform .22s;color:#8493ab;font-size:.7rem}",
".lcp-toggle[aria-expanded=true] .lcp-chev{transform:rotate(180deg)}",
".lcp-panel{padding:12px 2px 0;animation:lcp-slide .22s ease}",
"@keyframes lcp-slide{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}",
".lcp-row{display:flex;gap:8px;align-items:stretch}",
".lcp-inp{flex:1;min-width:0;border:1.5px solid #DDE7E5;border-radius:11px;padding:12px 13px;font:inherit;font-size:.92rem;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:#0D1B40;background:#fff;box-sizing:border-box}",
".lcp-inp::placeholder{font-weight:600;letter-spacing:.4px;text-transform:none;color:#9aa8bf}",
".lcp-inp:focus{outline:2px solid #0A6E6E;outline-offset:1px;border-color:#0A6E6E}",
".lcp-inp.lcp-shake{animation:lcp-shake .34s}",
"@keyframes lcp-shake{10%,90%{transform:translateX(-2px)}30%,70%{transform:translateX(4px)}50%{transform:translateX(-4px)}}",
".lcp-apply{flex:0 0 auto;min-width:92px;display:inline-flex;align-items:center;justify-content:center;gap:7px;border:0;border-radius:11px;padding:0 18px;background:#0D1B40;color:#fff;font:inherit;font-size:.86rem;font-weight:800;cursor:pointer;transition:background .18s,opacity .18s}",
".lcp-apply:hover:not(:disabled){background:#16264f}",
".lcp-apply:disabled{opacity:.62;cursor:not-allowed}",
".lcp-apply:focus-visible{outline:2px solid #0A6E6E;outline-offset:2px}",
".lcp-spin{width:14px;height:14px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:lcp-spin .8s linear infinite}",
"@keyframes lcp-spin{to{transform:rotate(360deg)}}",
".lcp-msg{margin:9px 2px 0;font-size:.79rem;line-height:1.45;font-weight:700;min-height:1px}",
".lcp-msg.err{color:#C0392B}",
".lcp-msg.ok{color:#0B8F62}",
".lcp-msg.hint{color:#7587a0;font-weight:600}",
/* applied state */
".lcp-applied{display:flex;align-items:center;gap:10px;background:#ECFAF3;border:1.5px solid #A9E3C8;border-radius:13px;padding:11px 13px;animation:lcp-pop .26s ease;box-sizing:border-box}",
"@keyframes lcp-pop{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}",
".lcp-applied-tick{flex:0 0 auto;width:22px;height:22px;border-radius:50%;background:#0B8F62;color:#fff;display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:900}",
".lcp-applied-body{flex:1;min-width:0}",
".lcp-applied-code{display:block;font-size:.86rem;font-weight:900;letter-spacing:1px;color:#0D1B40}",
".lcp-applied-sub{display:block;font-size:.74rem;font-weight:700;color:#0B8F62;margin-top:1px}",
".lcp-remove{flex:0 0 auto;background:none;border:0;font:inherit;font-size:.76rem;font-weight:800;color:#7587a0;text-decoration:underline;cursor:pointer;padding:4px 2px}",
".lcp-remove:hover{color:#C0392B}",
".lcp-remove:focus-visible{outline:2px solid #C0392B;outline-offset:2px;border-radius:4px}",
/* price breakdown */
".lcp-sum{margin-top:11px;border-top:1px dashed #D6DFEC;padding-top:11px}",
".lcp-sum-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font-size:.84rem;color:#56657d;padding:3px 0}",
".lcp-sum-row .lcp-strike{text-decoration:line-through;color:#9aa8bf}",
".lcp-sum-row.disc{color:#0B8F62;font-weight:800}",
".lcp-sum-row.total{margin-top:6px;padding-top:9px;border-top:1px solid #E7ECF5;font-size:1.02rem;font-weight:900;color:#0D1B40}",
".lcp-sum-row.total .lcp-sum-v{color:#0B8F62;font-size:1.24rem}",
".lcp-saved{display:inline-block;margin-top:8px;background:#0B8F62;color:#fff;font-size:.68rem;font-weight:900;letter-spacing:.5px;text-transform:uppercase;border-radius:999px;padding:4px 11px}",
/* own toast, only used when the page has none */
".lcp-toast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,14px);z-index:100000;background:#0D1B40;color:#fff;font-family:'Segoe UI',system-ui,Arial,sans-serif;font-size:.86rem;font-weight:700;padding:12px 20px;border-radius:999px;box-shadow:0 14px 40px rgba(8,16,38,.4);opacity:0;pointer-events:none;transition:opacity .22s,transform .22s;max-width:calc(100vw - 32px);text-align:center}",
".lcp-toast.show{opacity:1;transform:translate(-50%,0)}",
"@media(max-width:520px){.lcp-badge{gap:10px;padding:11px 12px}.lcp-code{width:100%;justify-content:center}.lcp-apply{min-width:78px;padding:0 13px}}",
"@media (prefers-reduced-motion:reduce){.lcp-badge-dot,.lcp-panel,.lcp-applied,.lcp-inp.lcp-shake,.lcp-spin{animation:none!important}}"
    ].join("\n");
    var style = document.createElement("style");
    style.id = "lcp-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ============================================================
     Server calls
     ============================================================ */

  // Resolves to the endpoint's JSON verdict. A network failure resolves
  // (not rejects) with a rejection shaped like the server's, so callers
  // have exactly one shape to render.
  function validateOnServer(code, packId, customer){
    return fetch(VALIDATE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code, pack_id: packId, customer: customer || null })
    })
      .then(function(res){
        if(res.status === 429){
          return { valid: false, reason: "rate_limited", message: "Too many attempts. Please wait a few minutes and try again." };
        }
        if(!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .catch(function(err){
        console.warn("[lume coupons]", err);
        return {
          valid: false,
          reason: "network",
          message: "We couldn't check that code just now. Please check your connection and try again."
        };
      });
  }

  /* ============================================================
     1. Hero badge
     ============================================================ */

  function badgePriceHtml(offer){
    if(offer.base_amount == null || offer.final_amount == null) return "";
    return ' <span class="lcp-badge-price"><span class="lcp-badge-was">' + esc(inr(offer.base_amount)) +
      '</span><span class="lcp-badge-now">' + esc(inr(offer.final_amount)) + '</span></span>';
  }

  function copyIcon(){
    return '<svg class="lcp-code-ico" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="9" y="9" width="12" height="12" rx="2"></rect>' +
      '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
  }

  function tickIcon(){
    return '<svg class="lcp-code-ico" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M20 6 9 17l-5-5"></path></svg>';
  }

  function renderBadge(el, offer){
    var light = el.getAttribute("data-lume-coupon-theme") === "light";
    el.className = "lcp-badge" + (light ? " lcp-light" : "");
    el.innerHTML =
      '<div class="lcp-badge-body">' +
        '<span class="lcp-badge-eyebrow"><span class="lcp-badge-dot"></span>' + esc(offer.eyebrow || "Limited offer") + '</span>' +
        '<span class="lcp-badge-h">' + esc(offer.headline) + badgePriceHtml(offer) + '</span>' +
        (offer.description ? '<span class="lcp-badge-sub">' + esc(offer.description) + '</span>' : "") +
      '</div>' +
      '<button type="button" class="lcp-code" aria-label="Copy coupon code ' + esc(offer.code) + '">' +
        copyIcon() + '<span class="lcp-code-t">' + esc(offer.code) + '</span>' +
      '</button>';

    var btn = el.querySelector(".lcp-code");
    var label = btn.querySelector(".lcp-code-t");
    var resetTimer = null;

    btn.addEventListener("click", function(){
      copyText(offer.code).then(function(){
        // Remembered for this tab so the checkout box pre-fills — the
        // whole point of the tap is not having to retype it.
        stashCode(offer.code);
        track("coupon_code_copied", offer.code);
        toast("Code copied! " + offer.code + " — apply it at checkout.");
        btn.classList.add("copied");
        btn.innerHTML = tickIcon() + '<span class="lcp-code-t">Copied</span>';
        clearTimeout(resetTimer);
        resetTimer = setTimeout(function(){
          btn.classList.remove("copied");
          btn.innerHTML = copyIcon() + '<span class="lcp-code-t">' + esc(offer.code) + '</span>';
        }, 2200);
      }).catch(function(){
        // Clipboard blocked (permissions, insecure origin). Select the
        // text so a long-press/Ctrl-C still works instead of dead-ending.
        toast("Copy blocked by your browser — the code is " + offer.code);
        try{
          var range = document.createRange();
          range.selectNodeContents(label);
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }catch(err){}
      });
    });
  }

  // The offer baked into the markup, used until (and if) the API answers.
  function offerFromAttributes(el){
    var code = normalizeCode(el.getAttribute("data-lume-coupon-badge") || "");
    if(!code) return null;
    return {
      code: code,
      eyebrow: el.getAttribute("data-lume-coupon-eyebrow") || "Limited offer",
      headline: el.getAttribute("data-lume-coupon-headline") || "",
      description: el.getAttribute("data-lume-coupon-description") || "",
      base_amount: el.hasAttribute("data-lume-coupon-base") ? Number(el.getAttribute("data-lume-coupon-base")) : null,
      final_amount: el.hasAttribute("data-lume-coupon-final") ? Number(el.getAttribute("data-lume-coupon-final")) : null
    };
  }

  function mountBadge(el){
    if(!el || el.getAttribute("data-lcp-mounted") === "1") return;
    el.setAttribute("data-lcp-mounted", "1");
    injectStyles();

    var fallback = offerFromAttributes(el);
    if(fallback) renderBadge(el, fallback);

    // Then reconcile with the live catalogue. If the offer was paused in
    // Firestore the badge removes itself rather than advertising a code
    // that will be refused at checkout.
    fetch(ACTIVE_ENDPOINT)
      .then(function(res){ return res.ok ? res.json() : null; })
      .then(function(data){
        if(!data || !Array.isArray(data.offers)) return;
        var wanted = fallback ? fallback.code : "";
        var live = data.offers.filter(function(o){ return !wanted || normalizeCode(o.code) === wanted; })[0];

        if(!live){
          if(fallback) el.remove();
          return;
        }
        renderBadge(el, {
          code: normalizeCode(live.code),
          eyebrow: el.getAttribute("data-lume-coupon-eyebrow") ||
            (live.first_time_only ? "First session offer" : "Limited offer"),
          headline: live.headline || (fallback && fallback.headline) || "",
          description: live.description || (fallback && fallback.description) || "",
          base_amount: live.base_amount,
          final_amount: live.final_amount
        });
      })
      .catch(function(){ /* the markup fallback is already on screen */ });
  }

  /* ============================================================
     2. Checkout widget
     ============================================================ */

  function mountCheckout(container, options){
    if(!container) return null;
    injectStyles();
    options = options || {};

    var getPack = typeof options.getPack === "function"
      ? options.getPack
      : function(){ return { sku: options.sku || "", amount: Number(options.amount) || 0, label: options.label || "" }; };
    var onChange = typeof options.onChange === "function" ? options.onChange : function(){};
    /*
      The code this pack is advertised at, if any.

      The site promises "first session ₹249" in the hero, the countdown
      bar and 50-odd landing pages. Making the client find and type
      FIRST50 to reach the price they were shown is a bait-and-switch,
      so a suggested code is applied for them on open. It still goes
      through the same server validation as a typed one — if the offer
      has been paused, the price simply stays ₹499 and no promise is
      made that checkout won't honour.
    */
    var getSuggestedCode = typeof options.getSuggestedCode === "function"
      ? options.getSuggestedCode
      : function(){ return normalizeCode(options.suggestedCode || ""); };
    /*
      Who is buying, if the form knows yet.

      Per-person rules ("one per customer", "first session only") can't be
      evaluated until there is a phone number, and the price is drawn
      before the client types one. Sending it when it exists means a
      returning client sees ₹499 on this screen rather than getting as far
      as the payment step and being refused there.
    */
    var getCustomer = typeof options.getCustomer === "function"
      ? options.getCustomer
      : function(){ return null; };

    container.classList.add("lcp-wrap");
    container.innerHTML =
      '<button type="button" class="lcp-toggle" aria-expanded="false">' +
        '<span class="lcp-toggle-ico" aria-hidden="true">🎟️</span>' +
        '<span class="lcp-toggle-t">Have a coupon code?</span>' +
        '<span class="lcp-toggle-hint" hidden>Code ready</span>' +
        '<span class="lcp-chev" aria-hidden="true">▼</span>' +
      '</button>' +
      '<div class="lcp-panel" hidden>' +
        '<div class="lcp-row">' +
          '<input class="lcp-inp" type="text" inputmode="latin" autocomplete="off" autocapitalize="characters" ' +
            'spellcheck="false" maxlength="32" placeholder="Enter coupon code" aria-label="Coupon code">' +
          '<button type="button" class="lcp-apply">Apply</button>' +
        '</div>' +
        '<p class="lcp-msg" role="status" aria-live="polite"></p>' +
      '</div>' +
      '<div class="lcp-applied" hidden>' +
        '<span class="lcp-applied-tick" aria-hidden="true">✓</span>' +
        '<span class="lcp-applied-body">' +
          '<span class="lcp-applied-code"></span>' +
          '<span class="lcp-applied-sub"></span>' +
        '</span>' +
        '<button type="button" class="lcp-remove">Remove</button>' +
      '</div>' +
      '<div class="lcp-sum" hidden></div>';

    var toggleBtn = container.querySelector(".lcp-toggle");
    var hintChip = container.querySelector(".lcp-toggle-hint");
    var panel = container.querySelector(".lcp-panel");
    var input = container.querySelector(".lcp-inp");
    var applyBtn = container.querySelector(".lcp-apply");
    var msgEl = container.querySelector(".lcp-msg");
    var appliedEl = container.querySelector(".lcp-applied");
    var appliedCode = container.querySelector(".lcp-applied-code");
    var appliedSub = container.querySelector(".lcp-applied-sub");
    var removeBtn = container.querySelector(".lcp-remove");
    var sumEl = container.querySelector(".lcp-sum");

    var applied = null;   // { code, base, discount, total, label }
    var busy = false;
    // Bumped on every apply/remove/reset. A late response whose token no
    // longer matches is discarded, so a slow first request can't overwrite
    // the result of a second one the client typed after it.
    var requestToken = 0;

    function setMessage(text, kind){
      msgEl.textContent = text || "";
      msgEl.className = "lcp-msg" + (text ? " " + (kind || "hint") : "");
    }

    function setBusy(next){
      busy = next;
      applyBtn.disabled = next;
      input.disabled = next;
      applyBtn.innerHTML = next
        ? '<span class="lcp-spin" aria-hidden="true"></span><span>Checking</span>'
        : "Apply";
    }

    function setOpen(open){
      panel.hidden = !open;
      toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
      if(open) setTimeout(function(){ input.focus(); }, 30);
    }

    function renderSummary(){
      if(!applied){
        sumEl.hidden = true;
        sumEl.innerHTML = "";
        return;
      }
      sumEl.hidden = false;
      sumEl.innerHTML =
        '<div class="lcp-sum-row"><span>' + esc(applied.label || "Session fee") + '</span>' +
          '<span class="lcp-sum-v lcp-strike">' + esc(inr(applied.base)) + '</span></div>' +
        '<div class="lcp-sum-row disc"><span>Discount (' + esc(applied.code) + ')</span>' +
          '<span class="lcp-sum-v">− ' + esc(inr(applied.discount)) + '</span></div>' +
        '<div class="lcp-sum-row total"><span>You pay</span>' +
          '<span class="lcp-sum-v">' + esc(inr(applied.total)) + '</span></div>' +
        '<span class="lcp-saved">You save ' + esc(inr(applied.discount)) + '</span>';
    }

    function renderApplied(){
      if(!applied){
        appliedEl.hidden = true;
        toggleBtn.hidden = false;
        return;
      }
      appliedEl.hidden = false;
      // The collapsible prompt has nothing left to offer once a code is on.
      toggleBtn.hidden = true;
      panel.hidden = true;
      appliedCode.textContent = applied.code + " applied";
      appliedSub.textContent = inr(applied.discount) + " off — you pay " + inr(applied.total);
    }

    function publish(){
      renderApplied();
      renderSummary();
      try{ onChange(applied ? Object.assign({}, applied) : null); }
      catch(err){ console.warn("[lume coupons] onChange threw", err); }
    }

    // `silent` suppresses the toast and the shake for an application the
    // client didn't ask for — an auto-applied offer should feel like the
    // advertised price, not like something they did.
    function apply(silent){
      if(busy) return;
      var code = normalizeCode(input.value);
      if(!code){
        if(silent) return;
        setMessage("Please enter a coupon code.", "err");
        input.classList.remove("lcp-shake");
        void input.offsetWidth;
        input.classList.add("lcp-shake");
        input.focus();
        return;
      }

      var pack = getPack() || {};
      var token = ++requestToken;
      setBusy(true);
      setMessage("Checking your code…", "hint");
      track("coupon_apply_attempt", code);

      validateOnServer(code, pack.sku, getCustomer()).then(function(result){
        if(token !== requestToken) return; // superseded
        setBusy(false);

        if(!result.valid){
          applied = null;
          publish();
          track("coupon_apply_rejected", code + ":" + (result.reason || "unknown"));
          // A suggested code that no longer works is our problem, not the
          // client's — leave the field untouched at the full price rather
          // than opening with an error they didn't cause.
          if(silent){ setMessage("", "hint"); return; }
          setMessage(result.message || "That code isn't valid.", "err");
          input.classList.remove("lcp-shake");
          void input.offsetWidth;
          input.classList.add("lcp-shake");
          return;
        }

        applied = {
          code: result.coupon && result.coupon.code ? result.coupon.code : code,
          base: result.base_amount,
          discount: result.discount_amount,
          total: result.final_amount,
          label: result.label || pack.label || "Session fee"
        };
        stashCode(applied.code);
        setMessage("", "ok");
        publish();
        if(!silent) toast(applied.code + " applied — you save " + inr(applied.discount) + "!");
        track(silent ? "coupon_auto_applied" : "coupon_applied", applied.code);
      });
    }

    function remove(){
      var code = applied ? applied.code : "";
      requestToken += 1;
      applied = null;
      input.value = "";
      setMessage("", "hint");
      publish();
      setOpen(true);
      track("coupon_removed", code);
      toast("Coupon removed.");
    }

    toggleBtn.addEventListener("click", function(){ setOpen(panel.hidden); });
    applyBtn.addEventListener("click", function(){ apply(false); });
    removeBtn.addEventListener("click", remove);

    input.addEventListener("input", function(){
      var caretAtEnd = input.selectionStart === input.value.length;
      input.value = normalizeCode(input.value);
      if(caretAtEnd) input.setSelectionRange(input.value.length, input.value.length);
      if(msgEl.textContent) setMessage("", "hint");
      // "FIRST50 ready" describes what was pre-filled. The moment the
      // client types over it, it's describing something that is no longer
      // in the box.
      hintChip.hidden = true;
    });

    input.addEventListener("keydown", function(e){
      if(e.key === "Enter"){ e.preventDefault(); apply(false); }
    });

    // Tracks which code was auto-applied for which pack, so re-opening the
    // same checkout doesn't fire a fresh validation every time.
    var autoTried = "";
    function autoApply(){
      var pack = getPack() || {};
      var code = normalizeCode(getSuggestedCode());
      var key = code + "|" + (pack.sku || "");
      if(!code || applied || autoTried === key) return;
      autoTried = key;
      input.value = code;
      apply(true);
    }

    var api = {
      // The only thing checkout should read. Deliberately just a string:
      // there is no way to hand a price back to the caller from here.
      getCode: function(){ return applied ? applied.code : ""; },
      getState: function(){ return applied ? Object.assign({}, applied) : null; },
      // Called when the client switches to a different pack — the old
      // verdict was for the old price and must not survive the change.
      reset: function(){
        requestToken += 1;
        applied = null;
        input.value = "";
        setBusy(false);
        setMessage("", "hint");
        setOpen(false);
        // The new pack gets its own auto-apply — clearing this is what
        // lets the offer re-evaluate against the pack that just changed.
        autoTried = "";
        prefill();
        publish();
        autoApply();
      },
      /*
        Re-check the applied code now that the customer is known.

        Call this when the phone or email field changes. If the client
        turns out to be a returning one, the discount is dropped here with
        an explanation instead of surviving until the payment step. Only
        re-checks a code that is currently applied, and never nags: a code
        that is still valid produces no visible change at all.
      */
      recheckCustomer: function(){
        if(!applied || busy) return;
        var code = applied.code;
        var pack = getPack() || {};
        var token = ++requestToken;
        validateOnServer(code, pack.sku, getCustomer()).then(function(result){
          if(token !== requestToken) return;
          if(result.valid) return;
          // A network blip must not silently strip a valid discount.
          if(result.reason === "network" || result.reason === "rate_limited") return;
          applied = null;
          input.value = code;
          publish();
          setOpen(true);
          setMessage(result.message || "That code isn't available for this booking.", "err");
          track("coupon_dropped_on_recheck", code + ":" + (result.reason || "unknown"));
        });
      },
      // For the "the code died between validating and paying" case: the
      // server refused it at order time, so drop it and say why.
      rejectServerSide: function(message){
        requestToken += 1;
        applied = null;
        publish();
        setOpen(true);
        setMessage(message || "That code could not be applied. Please try another.", "err");
      }
    };

    // Pre-fill from ?coupon= or from a code tapped in the hero badge, and
    // point at the field so it's obvious there's something to apply.
    function prefill(){
      var code = urlCode() || readStashedCode();
      if(!code) return;
      input.value = code;
      hintChip.hidden = false;
      hintChip.textContent = code + " ready";
      setMessage("Tap Apply to use this code.", "hint");
    }

    register(api, getPack);
    prefill();
    publish();
    autoApply();
    return api;
  }

  /* ============================================================
     3. Declarative checkout — the shared path
     ============================================================

     Every mounted widget registers here, so the payment layer can ask
     "is there a coupon on this SKU?" without each page having to thread
     the code through its own pay call by hand. That hand-threading is
     why the offer originally existed on one checkout out of six.
  */
  var registry = [];

  function register(api, getPack){
    registry.push({ api: api, getPack: getPack });
  }

  function entryForSku(sku){
    var want = String(sku || "");
    if(!want) return null;
    for(var i = 0; i < registry.length; i++){
      var pack = registry[i].getPack() || {};
      if(String(pack.sku || "") === want && registry[i].api.getState()) return registry[i];
    }
    return null;
  }

  // What the payment layer calls. Returns null when no coupon is applied
  // to this SKU — including when the page has no coupon widget at all.
  function stateForSku(sku){
    var entry = entryForSku(sku);
    return entry ? entry.api.getState() : null;
  }

  function widgetForSku(sku){
    var want = String(sku || "");
    for(var i = 0; i < registry.length; i++){
      var pack = registry[i].getPack() || {};
      if(String(pack.sku || "") === want) return registry[i].api;
    }
    return null;
  }

  /*
    The SKUs that currently have any live offer, from /api/coupons/active.
    A declarative widget stays hidden unless its SKU is in this set — a
    "Have a coupon code?" box on a product with no possible code is an
    invitation to abandon checkout and go hunting for one that does not
    exist. It reveals itself anyway if the visitor arrived holding a code
    (?coupon= or one tapped in the hero), because then they have one to
    try and hiding the field would be the worse failure.
  */
  var offerSkusPromise = null;
  function offerSkus(){
    if(!offerSkusPromise){
      offerSkusPromise = fetch(ACTIVE_ENDPOINT)
        .then(function(res){ return res.ok ? res.json() : null; })
        .then(function(data){ return (data && data.offer_skus) || []; })
        .catch(function(){ return []; });
    }
    return offerSkusPromise;
  }

  // The page's own price line — rewritten so it can never disagree with
  // the widget's summary sitting directly beneath it.
  function priceRenderer(scope, opts){
    // Convention: every session checkout on this site is the same modal
    // markup. `data-price-el` / `data-detail-el` are the escape hatch for
    // the ones that aren't (the internship enrol modal, for instance).
    var amtEl = (opts && opts.priceSel && scope.querySelector(opts.priceSel)) ||
                scope.querySelector(".price-row .amt");
    var detailEl = (opts && opts.detailSel && scope.querySelector(opts.detailSel)) ||
                   scope.querySelector(".price-row .detail");
    var payEls = scope.querySelectorAll("[data-lume-coupon-pay-amount]");
    var originalDetail = detailEl ? detailEl.innerHTML : "";
    var originalAmt = amtEl ? amtEl.innerHTML : "";

    return function(state, pack){
      if(amtEl) amtEl.innerHTML = state ? esc(inr(state.total)) : originalAmt;
      if(detailEl){
        detailEl.innerHTML = state
          ? esc(pack.label || "Session") +
            '<br><span style="text-decoration:line-through;opacity:.65">' + esc(inr(state.base)) +
            '</span> <span style="color:#0B8F62;font-weight:800">' + esc(state.code) + " applied</span>"
          : originalDetail;
      }
      Array.prototype.forEach.call(payEls, function(el){
        el.textContent = inr(state ? state.total : pack.amount);
      });
    };
  }

  /*
    Upgrades <div data-lume-coupon-checkout data-sku=… data-amount=…>.

    Convention over configuration: the widget finds the price row, the
    phone field and the "Pay ₹X" step inside its own modal, because every
    checkout on this site is built from the same modal markup. A page
    adds the div and the script tag; nothing else.
  */
  function mountDeclarative(host){
    if(host.getAttribute("data-lcp-mounted") === "1") return;
    host.setAttribute("data-lcp-mounted", "1");

    var scope = host.closest("[data-lume-coupon-scope]") || host.closest(".modal") || document;
    var pack = {
      sku: host.getAttribute("data-sku") || "",
      amount: Number(host.getAttribute("data-amount")) || 0,
      label: host.getAttribute("data-label") || ""
    };
    var suggested = normalizeCode(host.getAttribute("data-suggest") || "");
    var phoneEl = scope.querySelector(host.getAttribute("data-phone") || "#sessionPhone") ||
                  scope.querySelector('input[type="tel"]');
    var renderPrice = priceRenderer(scope, {
      priceSel: host.getAttribute("data-price-el"),
      detailSel: host.getAttribute("data-detail-el")
    });

    /*
      Hidden until we know an offer could apply here — a coupon box with
      nothing to put in it just advertises that a discount exists.

      data-always-show opts a checkout out of that. It is for a page that
      hands out codes which are deliberately never promoted (an invitation
      code has no offer badge and is absent from /api/coupons/active, so
      none of the reveal conditions below would ever fire, and the client
      would have nowhere to type it). Adding it means anyone can try a
      code here, so use it where that is the point.
    */
    var alwaysShow = host.hasAttribute("data-always-show");
    var held = !(alwaysShow || urlCode() || readStashedCode());
    if(held) host.style.display = "none";

    var api = mountCheckout(host, {
      getPack: function(){ return pack; },
      getSuggestedCode: function(){ return suggested; },
      getCustomer: function(){
        return phoneEl ? { phone: String(phoneEl.value || "").replace(/\D/g, "").slice(-10), email: "" } : null;
      },
      onChange: function(state){ renderPrice(state, pack); }
    });

    if(held){
      offerSkus().then(function(skus){
        if(skus.indexOf(pack.sku) === -1) return;   // nothing to offer here
        host.style.display = "";
      });
    }

    if(phoneEl){
      var timer = null;
      phoneEl.addEventListener("input", function(){
        clearTimeout(timer);
        if(String(phoneEl.value || "").replace(/\D/g, "").length < 10) return;
        timer = setTimeout(function(){ api.recheckCustomer(); }, 450);
      });
    }

    return api;
  }

  /* ============================================================
     Boot
     ============================================================ */

  function upgradeBadges(root){
    (root || document).querySelectorAll("[data-lume-coupon-badge]").forEach(mountBadge);
  }

  function upgradeCheckouts(root){
    (root || document).querySelectorAll("[data-lume-coupon-checkout]").forEach(mountDeclarative);
  }

  window.LumeCoupons = {
    mountBadge: mountBadge,
    mountCheckout: mountCheckout,
    upgradeBadges: upgradeBadges,
    upgradeCheckouts: upgradeCheckouts,
    // Read by cashfree-payments.js at pay time.
    stateForSku: stateForSku,
    codeForSku: function(sku){ var s = stateForSku(sku); return s ? s.code : ""; },
    widgetForSku: widgetForSku,
    normalizeCode: normalizeCode,
    inr: inr
  };

  function boot(){ upgradeBadges(); upgradeCheckouts(); }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot);
  }else{
    boot();
  }

  // Mirrors lume:cashfree-ready — lets a page that may open its checkout
  // before this file has parsed mount the widget as soon as it can.
  try{ window.dispatchEvent(new CustomEvent("lume:coupons-ready")); }catch(err){}
})();
