(function(){
  "use strict";

  function esc(v){
    return String(v==null?"":v).replace(/[&<>"']/g,function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":'&#39;'}[c];
    });
  }

  /* ============================================================
     Lume Live — Cashfree payment helper
     - Inline, on-page payment modal (no separate pop-up window)
     - Loading / Success / Failure states
     - Polished UPI QR backup panel
     - Payment attempt metadata logged to Firebase Firestore
     Public API (unchanged, backwards compatible):
       window.lumeCashfreePay(options)
       window.lumeCashfreeGrantAccess(sku, details)
       window.lumeCashfreeHasAccess(sku)
       window.lumeCashfreeGetConfig()
     ============================================================ */

  var DEFAULTS = {
    mode: "production",
    createOrderEndpoint: "/api/cashfree/create-order",
    orderStatusEndpoint: "/api/cashfree/order-status",
    restoreAccessEndpoint: "/api/cashfree/restore-access",
    redirectTarget: "_modal",
    whatsappNumber: "917015671280",
    upiId: "sachinbajaj284@okaxis",
    upiQrImage: "lume-upi-qr.png",
    supportEmail: "hello@lumelive.co.in",
    firestoreCollection: "paymentAttempts",
    // Google Calendar appointment schedule. Clients pick a real slot from
    // Lume Live's live availability and get an instant invite + Meet link, so
    // no date/time has to be negotiated over WhatsApp after payment.
    // Single source of truth for the whole site — change it here only.
    bookingCalendarUrl: "https://calendar.app.google/s59WHyuHJenjfPbQ6"
  };

  // Per-SKU success "next steps" + continue link, kept in sync with payment-return.html
  // book:true  => the purchase is a live 1:1 slot, so the primary call to action
  //               after payment is the Google Calendar picker, not WhatsApp.
  var SKU_FLOW = {
    "student-full-report":        { cta:"Start Assessment Now",       href:"assessment.html#self-assessments",                       steps:["Your ₹999 Full Clarity Report is unlocked.","Start the 4-part assessment now — it takes about 20 minutes.","Your 15-page PDF report is delivered on WhatsApp after review."] },
    "stream-clarity-session":     { cta:"Pick Your Slot",             href:"assessment.html#self-assessments", book:true,            steps:["Your ₹999 Stream Clarity session is paid for.","Pick your slot below — you'll get an instant Google Calendar invite with the video-call link.","Your assessment is also unlocked: start the 4-part assessment (about 20 minutes) before the call."] },
    "lume-lens-working-profile":  { cta:"Start Lume Lens Now",         href:"for-working-professionals.html#self-assessments",         steps:["Your Lume Lens report is unlocked.","Complete the short assessment to generate your clarity report.","We share your personalised PDF on WhatsApp."] },
    "career-intelligence-roadmap":{ cta:"Open Career Intelligence",    href:"career-intelligence.html?access=assessment#career-intelligence", steps:["Your Career Intelligence roadmap is unlocked.","Open the dashboard to begin.","Save your WhatsApp confirmation for your records."] },
    "parents-handbook":           { cta:"Confirm Delivery on WhatsApp",href:"https://wa.me/917015671280", steps:["Payment received for the Parents' Career Handbook.","Send us your email on WhatsApp so we can deliver the PDF.","You'll receive it within a few hours."] },
    "intro-session":              { cta:"Pick Your Slot",             href:"", book:true,                   steps:["Payment received for your ₹49 introductory session.","Pick a day and time from Lume Live's calendar below — takes 20 seconds.","Google sends you the confirmation and video-call link straight away."] },
    "career-direction-session":   { cta:"Pick Your Slot",             href:"", book:true,                   steps:["Payment received for your Career Direction session.","Pick a day and time from Lume Live's calendar below — takes 20 seconds.","Google sends you the confirmation and video-call link straight away."] },
    "internship-1-month":         { cta:"Confirm on WhatsApp",        href:"https://wa.me/917015671280", steps:["Your seat in the 1-Month Practical Internship is booked.","We confirm your cohort dates and session schedule on WhatsApp within 24 hours.","Keep your payment confirmation — you'll need it if you upgrade to the fellowship later."] },
    "internship-2-month":         { cta:"Confirm on WhatsApp",        href:"https://wa.me/917015671280", steps:["Your seat in the 2-Month Advanced Fellowship is booked.","We confirm your cohort dates and session schedule on WhatsApp within 24 hours.","Shadowing sessions are scheduled once your first month is under way."] },
    "internship-lume-lens":       { cta:"Start Lume Lens Now",        href:"for-working-professionals.html#self-assessments", steps:["Your intern-priced Lume Lens report is unlocked.","Complete the assessment to generate your own profile report.","Bring your result to your next supervision session — it's the first case you'll debrief."] }
  };

  function bookingUrl(){ return getConfig().bookingCalendarUrl || ""; }

  // A SKU books a live slot when SKU_FLOW says so, or when the page passes
  // bookingUrl/isBooking explicitly (for one-off session offers not in SKU_FLOW).
  function isBooking(options){
    if(!options){ return false; }
    if(options.isBooking === true){ return true; }
    var flow = SKU_FLOW[options.sku];
    return Boolean(flow && flow.book);
  }

  function getConfig(){
    var pageConfig = window.LUME_CASHFREE || {};
    var cfg = {};
    Object.keys(DEFAULTS).forEach(function(k){ cfg[k] = DEFAULTS[k]; });
    Object.keys(pageConfig).forEach(function(k){ cfg[k] = pageConfig[k]; });
    return cfg;
  }

  function notify(message){
    if(typeof window.showToast === "function"){ window.showToast(message); return; }
    if(typeof window.toast === "function"){ window.toast(message); return; }
  }

  function safeOpen(url){
    var opened = window.open(url, "_blank", "noopener");
    if(!opened){ window.location.href = url; }
  }

  function inr(amount){
    var n = Number(amount || 0);
    return "₹" + (isNaN(n) ? "" : n.toLocaleString("en-IN"));
  }

  function waMessage(options){
    return [
      "Hello Lume Live!",
      "I want to complete payment for " + (options.label || "a Lume Live service") + ".",
      "Amount: " + inr(options.amount),
      options.customerName ? "Name: " + options.customerName : "",
      options.customerPhone ? "WhatsApp: " + options.customerPhone : "",
      options.customerEmail ? "Email: " + options.customerEmail : "",
      "Please help me complete the payment and confirm access."
    ].filter(Boolean).join("\n");
  }

  function waConfirmMessage(options, orderId){
    // For live-session SKUs the client picks their own slot on the Google
    // Calendar page, so the message says which slot they took rather than
    // opening a "what date and time suit you?" thread.
    var booking = isBooking(options);
    return [
      "Hello Lume Live!",
      "I have completed my Cashfree payment for " + (options.label || "a Lume Live service") + ".",
      "Amount: " + inr(options.amount),
      orderId ? "Order ID: " + orderId : "",
      options.customerName ? "Name: " + options.customerName : "",
      booking
        ? "I have booked my slot on your Google Calendar link. (If I haven't yet, I'll book it here: " + bookingUrl() + ")"
        : "Please confirm my access / booking."
    ].filter(Boolean).join("\n");
  }

  function waUrl(text){
    var cfg = getConfig();
    return "https://wa.me/" + cfg.whatsappNumber + "?text=" + encodeURIComponent(text);
  }

  function fallback(options){
    if(options && typeof options.onFallback === "function"){ return options.onFallback(options); }
    safeOpen(waUrl(waMessage(options || {})));
  }

  /* ---------- access store (kept for backward compatibility) ---------- */
  function readAccessStore(){
    try{ return JSON.parse(localStorage.getItem("lumeCashfreeAccess") || "{}") || {}; }
    catch(err){ return {}; }
  }
  function writeAccessStore(store){
    try{ localStorage.setItem("lumeCashfreeAccess", JSON.stringify(store || {})); }catch(err){}
  }
  window.lumeCashfreeGrantAccess = function(sku, details){
    if(!sku){ return; }
    var store = readAccessStore();
    store[sku] = Object.assign({ status:"PAID", grantedAt:new Date().toISOString() }, details || {});
    writeAccessStore(store);
    // A prior lumeCashfreeVerifyAccess(sku) call earlier on this same page
    // load (e.g. the initial "is this already unlocked?" check that runs
    // before the user has paid) may have cached a negative result. Without
    // clearing it here, a customer who pays via the in-page modal — no
    // full reload, so the cache survives — could see "payment not
    // received" for up to 5 minutes despite having just paid. Also tell
    // any listening page to re-check and refresh its unlocked UI now,
    // not just after the restore-access flow.
    _verifyCache = {};
    try{ window.dispatchEvent(new CustomEvent("lume:access-restored")); }catch(err){}
  };
  window.lumeCashfreeHasAccess = function(sku){
    var store = readAccessStore();
    return Boolean(store[sku] && String(store[sku].status || "").toUpperCase() === "PAID");
  };
  window.lumeCashfreeGetConfig = getConfig;

  /* ------------------------------------------------------------
     Server-verified access check.

     localStorage.lumeCashfreeAccess is only ever a *hint* — anyone can
     open devtools and set it to {status:"PAID"} without paying. Any page
     gating real paid content must call lumeCashfreeVerifyAccess(sku)
     instead of lumeCashfreeHasAccess(sku), and only unlock once it
     resolves true. It re-checks the stored order_id against Cashfree's
     own order-status endpoint (the source of truth) before trusting a
     PAID claim, and revokes/ignores any entry that doesn't check out.
     ------------------------------------------------------------ */
  var _verifyCache = {};
  var VERIFY_TTL_MS = 5 * 60 * 1000; // avoid re-hitting the API on every re-render

  window.lumeCashfreeVerifyAccess = function(sku){
    if(!sku){ return Promise.resolve(false); }
    var now = Date.now();
    var cached = _verifyCache[sku];
    if(cached && (now - cached.ts) < VERIFY_TTL_MS){ return cached.promise; }

    var store = readAccessStore();
    var entry = store[sku];
    if(!entry || !entry.order_id){
      // Nothing locally that even claims a real order — no network call needed.
      return Promise.resolve(false);
    }

    var cfg = getConfig();
    var promise = fetch(cfg.orderStatusEndpoint + "?order_id=" + encodeURIComponent(entry.order_id))
      .then(function(res){ if(!res.ok){ throw new Error("status check failed"); } return res.json(); })
      .then(function(data){
        var status = String(data.order_status || "").toUpperCase();
        // Every order create-order.js creates is tagged with its sku, so a
        // real match is always possible — treating a missing/blank sku as
        // "any sku is fine" would let a cheap order's order_id be reused
        // (via a hand-edited localStorage entry) to unlock a pricier one.
        var ok = status === "PAID" && data.sku === sku;
        if(ok){
          entry.status = "PAID";
          entry.verifiedAt = new Date().toISOString();
          store[sku] = entry;
        } else {
          // The stored claim didn't check out against Cashfree — drop it
          // so a forged/expired entry can't be reused on the next call.
          delete store[sku];
        }
        writeAccessStore(store);
        return ok;
      })
      .catch(function(){
        // Fail closed on a network hiccup: never grant paid content on an
        // unverifiable claim. The calling page should show a friendly
        // "couldn't verify, please retry" state, not a hard rejection.
        return false;
      });
    _verifyCache[sku] = { ts: now, promise: promise };
    return promise;
  };

  /* ------------------------------------------------------------
     Restore access on a new device.

     Access is normally tied to whichever browser was used at checkout
     (that's where the order_id lives). Restoring it on a new device
     requires proof of ownership: the visitor must be signed in (Firebase
     Auth, shared across lumelive.co.in pages) with a *verified* email.
     A signed, server-verified ID token is sent — never a typed-in phone
     or email string — so this can't be used to pull up someone else's
     paid content just by knowing their contact details. Looks up
     purchases against that verified email (written by
     /api/cashfree/order-status.js when Cashfree confirms PAID) and, if
     found, repopulates local storage with the real order_id(s) so
     lumeCashfreeVerifyAccess() can confirm them the normal way.
     Returns { ok, count, needsAuth?, needsVerification?, error? }.
     ------------------------------------------------------------ */
  window.lumeCashfreeRestoreAccess = function(){
    var user = window.firebaseAuth && window.firebaseAuth.currentUser;
    if(!user){
      return Promise.resolve({ ok:false, count:0, needsAuth:true, error:"Please sign in to restore your access." });
    }
    if(!user.emailVerified){
      return Promise.resolve({ ok:false, count:0, needsVerification:true, error:"Please verify your email first — check your inbox for the verification link, then try again." });
    }
    var cfg = getConfig();
    return user.getIdToken().then(function(idToken){
      return fetch(cfg.restoreAccessEndpoint || "/api/cashfree/restore-access", {
        method:"POST", headers:{ "Authorization":"Bearer " + idToken }
      });
    })
      .then(function(res){ return res.json().then(function(data){ return { res:res, data:data }; }); })
      .then(function(r){
        if(!r.res.ok || !r.data || r.data.ok === false){
          return {
            ok:false, count:0,
            needsAuth: r.data && r.data.code === "NO_TOKEN",
            needsVerification: r.data && r.data.code === "EMAIL_NOT_VERIFIED",
            error:(r.data && r.data.error) || "Could not look up your access. Please retry or message us on WhatsApp."
          };
        }
        var found = Array.isArray(r.data.access) ? r.data.access : [];
        if(found.length){
          var store = readAccessStore();
          found.forEach(function(item){
            if(!item || !item.sku || !item.order_id) return;
            store[item.sku] = { status:"PAID", order_id:item.order_id, grantedAt:item.grantedAt || new Date().toISOString(), restoredAt:new Date().toISOString() };
          });
          writeAccessStore(store);
          // Clear the verify cache so the next check re-confirms these fresh entries.
          _verifyCache = {};
        }
        return { ok:true, count:found.length };
      })
      .catch(function(){
        return { ok:false, count:0, error:"Could not reach Lume Live right now. Please retry or message us on WhatsApp." };
      });
  };

  // Convenience UI wrapper: checks sign-in state, restores access,
  // notifies, and tells any listening page (via a custom event) to
  // re-check its gates. Wire a "Paid on another device?" link/button to
  // this rather than re-implementing the sign-in+refresh dance per page.
  window.lumeCashfreeRestoreAccessPrompt = function(){
    var user = window.firebaseAuth && window.firebaseAuth.currentUser;
    if(!user){
      notify("Please sign in first, then tap Restore access again.");
      if(typeof window.openAuth === "function"){ window.openAuth("signin"); }
      else { notify("Please sign in on the Assessment page (lumelive.co.in/assessment.html), then come back here and tap Restore access again."); }
      return;
    }
    if(!user.emailVerified){
      notify("Please verify your email first — check your inbox for the verification link, then try again.");
      return;
    }
    notify("Checking your payment records…");
    window.lumeCashfreeRestoreAccess().then(function(result){
      if(!result.ok){
        notify(result.error || "Could not look up your access. Please message us on WhatsApp.");
        return;
      }
      if(result.count > 0){
        notify("Access restored — you're all set on this device.");
        window.dispatchEvent(new CustomEvent("lume:access-restored"));
      } else {
        notify("No completed payment found for your signed-in email. If you just paid, wait a minute and try again, or message us on WhatsApp.");
      }
    });
  };

  /* ============================================================
     Firestore logging — metadata only (orderId, amount, timestamp,
     sku, status). Never stores psychometric answers. Fails silently
     so it can never block a payment.
     ============================================================ */
  var _firestore = null;
  var _fsHelpers = null;
  function getFirestore(){
    if(_firestore){ return Promise.resolve({ db:_firestore, h:_fsHelpers }); }
    if(!window.firebaseApp){ return Promise.resolve(null); }
    return import("https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js")
      .then(function(mod){
        _firestore = mod.getFirestore(window.firebaseApp);
        _fsHelpers = { collection:mod.collection, addDoc:mod.addDoc, doc:mod.doc,
                       setDoc:mod.setDoc, serverTimestamp:mod.serverTimestamp };
        return { db:_firestore, h:_fsHelpers };
      })
      .catch(function(err){ console.warn("[Lume Cashfree] Firestore unavailable", err); return null; });
  }

  // Logs (or updates) one attempt document. Returns the doc id where possible.
  function logAttempt(options, patch){
    var cfg = getConfig();
    return getFirestore().then(function(fs){
      if(!fs){ return null; }
      var uid = (window.currentFirebaseUser && window.currentFirebaseUser.uid) || null;
      var base = {
        sku: options.sku || "",
        label: options.label || "",
        amount: Number(options.amount || 0),
        currency: "INR",
        uid: uid,
        customerName: options.customerName || "",
        customerEmail: options.customerEmail || "",
        customerPhone: options.customerPhone || "",
        pageUrl: window.location.href,
        userAgent: navigator.userAgent || "",
        updatedAt: fs.h.serverTimestamp()
      };
      var data = Object.assign(base, patch || {});
      try{
        if(options._attemptId){
          // update existing attempt doc
          return fs.h.setDoc(fs.h.doc(fs.db, cfg.firestoreCollection, options._attemptId), data, { merge:true })
            .then(function(){ return options._attemptId; });
        }
        data.createdAt = fs.h.serverTimestamp();
        return fs.h.addDoc(fs.h.collection(fs.db, cfg.firestoreCollection), data)
          .then(function(ref){ options._attemptId = ref.id; return ref.id; });
      }catch(err){
        console.warn("[Lume Cashfree] log failed", err);
        return null;
      }
    });
  }

  /* ============================================================
     Inline modal UI
     ============================================================ */
  var EL = {};
  function injectStyles(){
    if(document.getElementById("lcf-styles")){ return; }
    var css = [
".lcf-overlay{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(8,16,38,.62);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}",
".lcf-overlay.lcf-open{display:flex}",
".lcf-card{width:min(440px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:22px;box-shadow:0 30px 80px rgba(8,16,38,.4);font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#102033;animation:lcf-pop .28s ease}",
"@keyframes lcf-pop{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}",
".lcf-hd{position:relative;background:linear-gradient(135deg,#0D1B40,#13306b);color:#fff;padding:20px 22px 18px;border-radius:22px 22px 0 0;text-align:center}",
".lcf-hd img{width:46px;height:46px;object-fit:contain;margin-bottom:6px}",
".lcf-hd h3{margin:0;font-size:1.12rem;font-weight:800}",
".lcf-hd .lcf-amt{margin-top:4px;font-size:.86rem;color:#E8B95A;font-weight:700;letter-spacing:.3px}",
".lcf-x{position:absolute;top:12px;right:14px;background:rgba(255,255,255,.16);border:0;color:#fff;width:30px;height:30px;border-radius:50%;font-size:1rem;cursor:pointer;line-height:1}",
".lcf-x:hover{background:rgba(255,255,255,.3)}",
".lcf-body{padding:22px}",
".lcf-center{text-align:center}",
".lcf-spinner{width:46px;height:46px;margin:6px auto 14px;border:4px solid #E7ECF5;border-top-color:#0D1B40;border-radius:50%;animation:lcf-spin .9s linear infinite}",
"@keyframes lcf-spin{to{transform:rotate(360deg)}}",
".lcf-ico{width:64px;height:64px;margin:2px auto 12px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:2rem}",
".lcf-ico.ok{background:#E6F7EF;color:#12925A}",
".lcf-ico.err{background:#FDECEC;color:#C0392B}",
".lcf-ico.wait{background:#FFF6E6;color:#9A6414}",
/* Success tick — the ring settles, then the check draws itself in. */
".lcf-mark{display:block;width:78px;height:78px;margin:2px auto 14px;overflow:visible}",
".lcf-mark .lcf-mark-ring{fill:#E6F7EF;stroke:#12925A;stroke-width:2;transform-origin:50% 50%;animation:lcf-pop-in .42s cubic-bezier(.2,.9,.3,1.4) both}",
".lcf-mark .lcf-mark-halo{fill:none;stroke:#12925A;stroke-width:2;transform-origin:50% 50%;animation:lcf-halo 1.15s .3s ease-out both}",
".lcf-mark .lcf-mark-check{fill:none;stroke:#12925A;stroke-width:3.6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:30;stroke-dashoffset:30;animation:lcf-draw .42s .3s cubic-bezier(.65,0,.35,1) forwards}",
"@keyframes lcf-pop-in{from{opacity:0;transform:scale(.5)}to{opacity:1;transform:scale(1)}}",
"@keyframes lcf-draw{to{stroke-dashoffset:0}}",
"@keyframes lcf-halo{from{opacity:.55;transform:scale(1)}to{opacity:0;transform:scale(1.7)}}",
".lcf-t{margin:0 0 6px;font-size:1.16rem;font-weight:800;color:#0D1B40}",
".lcf-p{margin:0 0 16px;font-size:.92rem;line-height:1.55;color:#56657d}",
/* Affirmation — a short human note between the receipt and the next step. */
".lcf-affirm{position:relative;text-align:left;margin:2px 0 18px;padding:15px 17px 15px 21px;border-radius:16px;background:linear-gradient(135deg,#FFFAF0 0%,#F4FBF9 100%);border:1px solid #F1E4C9;overflow:hidden;animation:lcf-rise .5s .34s both}",
".lcf-affirm::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:linear-gradient(180deg,#E8B95A,#0A6E6E)}",
".lcf-affirm::after{content:'\\201C';position:absolute;right:13px;top:8px;font-family:Georgia,serif;font-size:3rem;line-height:1;color:#E8B95A;opacity:.26;pointer-events:none}",
".lcf-affirm-eyebrow{display:block;font-size:.62rem;font-weight:900;letter-spacing:1.1px;text-transform:uppercase;color:#0A6E6E;margin-bottom:7px}",
".lcf-affirm-q{margin:0;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:.95rem;line-height:1.6;color:#16264d;position:relative;z-index:1;padding-right:14px}",
".lcf-affirm-sign{display:block;margin-top:9px;font-family:'Segoe UI',system-ui,Arial,sans-serif;font-style:normal;font-size:.71rem;font-weight:800;letter-spacing:.2px;color:#8493ab}",
"@keyframes lcf-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}",
".lcf-steps{list-style:none;margin:0 0 18px;padding:0;text-align:left}",
".lcf-steps li{position:relative;padding:11px 12px 11px 44px;margin-bottom:8px;background:#F7F9FC;border:1px solid #EBF0F7;border-radius:14px;font-size:.86rem;line-height:1.45;color:#33425c}",
".lcf-steps li::before{counter-increment:lcf;content:counter(lcf);position:absolute;left:12px;top:11px;width:23px;height:23px;border-radius:50%;background:linear-gradient(135deg,#0D1B40,#22417f);color:#fff;font-size:.74rem;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(13,27,64,.24)}",
/* The one step the client has to act on right now. */
".lcf-steps li.lcf-now{background:linear-gradient(135deg,#FFF8EA,#FFFDF8);border-color:#EFDDB8;color:#26364f;font-weight:600}",
".lcf-steps li.lcf-now::before{background:linear-gradient(135deg,#C9933A,#E8B95A);color:#0D1B40;box-shadow:0 2px 8px rgba(201,147,58,.45)}",
".lcf-steps{counter-reset:lcf}",
".lcf-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:48px;border:0;border-radius:999px;font-size:.94rem;font-weight:800;cursor:pointer;text-decoration:none;margin-bottom:10px;transition:transform .12s,box-shadow .18s,filter .18s}",
".lcf-btn:active{transform:scale(.98)}",
".lcf-btn.gold{background:linear-gradient(135deg,#C9933A,#E8B95A);color:#0D1B40;box-shadow:0 10px 26px rgba(201,147,58,.32)}",
".lcf-btn.gold:hover{filter:brightness(1.04);box-shadow:0 14px 32px rgba(201,147,58,.42)}",
/* The booking button is the whole point of this screen — let it breathe. */
".lcf-btn.book{min-height:54px;font-size:1rem;letter-spacing:.2px;animation:lcf-breathe 2.8s ease-in-out 1s infinite}",
"@keyframes lcf-breathe{0%,100%{box-shadow:0 10px 26px rgba(201,147,58,.30)}50%{box-shadow:0 13px 36px rgba(201,147,58,.58)}}",
".lcf-btn.wa{background:#25D366;color:#fff}",
/* On a booking screen WhatsApp is only the fallback — it must not compete
   with the gold "Pick Your Slot" button for attention. */
".lcf-btn.wa.quiet{background:#fff;color:#0E8A6B;border:1.5px solid #CFE9DF;font-weight:700;min-height:44px;font-size:.88rem}",
".lcf-btn.wa.quiet:hover{background:#F2FBF7;border-color:#9FD8C3}",
".lcf-btn.navy{background:#0D1B40;color:#fff}",
".lcf-btn.ghost{background:#EEF2F8;color:#33425c}",
".lcf-note{margin:-3px 0 14px;font-size:.78rem;line-height:1.55;color:#7587a0;text-align:center;padding:0 6px}",
".lcf-trust{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:10px;font-size:.74rem;color:#8493ab}",
".lcf-upi{border:1px solid #E3E9F2;border-radius:16px;padding:16px;text-align:center;margin-top:6px;background:#FBFCFE}",
".lcf-upi h4{margin:0 0 4px;font-size:.96rem;color:#0D1B40;font-weight:800}",
".lcf-upi .lcf-upi-sub{margin:0 0 12px;font-size:.78rem;color:#7587a0}",
".lcf-qr{width:168px;height:168px;margin:0 auto 10px;border:3px solid #0D1B40;border-radius:14px;overflow:hidden;background:#fff;padding:6px}",
".lcf-qr img{width:100%;height:100%;object-fit:contain}",
".lcf-upiid{display:inline-flex;align-items:center;gap:7px;background:#EEF2F8;border-radius:10px;padding:9px 13px;font-weight:700;font-size:.9rem;color:#0D1B40;cursor:pointer;margin-bottom:8px}",
".lcf-upiid:hover{background:#E3E9F2}",
".lcf-apps{font-size:.76rem;color:#7587a0;margin:0 0 12px}",
".lcf-divider{display:flex;align-items:center;gap:10px;color:#9aa8bf;font-size:.74rem;margin:16px 0}",
".lcf-divider::before,.lcf-divider::after{content:'';flex:1;height:1px;background:#E3E9F2}",
".lcf-back{display:block;text-align:center;margin-top:8px;font-size:.82rem;color:#7587a0;background:none;border:0;cursor:pointer;width:100%}",
".lcf-back:hover{color:#0D1B40}",
"@media (prefers-reduced-motion:reduce){.lcf-card,.lcf-affirm,.lcf-mark *,.lcf-btn.book{animation:none!important}.lcf-mark .lcf-mark-check{stroke-dashoffset:0}.lcf-mark .lcf-mark-halo{opacity:0}}"
    ].join("\n");
    var s = document.createElement("style");
    s.id = "lcf-styles";
    s.textContent = css;
    document.head.appendChild(s);
  }

  function ensureModal(){
    if(EL.overlay){ return; }
    injectStyles();
    var o = document.createElement("div");
    o.className = "lcf-overlay";
    o.setAttribute("role","dialog");
    o.setAttribute("aria-modal","true");
    o.innerHTML =
      '<div class="lcf-card">' +
        '<div class="lcf-hd">' +
          '<button class="lcf-x" type="button" aria-label="Close">✕</button>' +
          '<img src="logo.png" alt="Lume Live" onerror="this.style.display=\'none\'">' +
          '<h3 class="lcf-title">Secure Payment</h3>' +
          '<div class="lcf-amt"></div>' +
        '</div>' +
        '<div class="lcf-body"></div>' +
      '</div>';
    document.body.appendChild(o);
    EL.overlay = o;
    EL.card = o.querySelector(".lcf-card");
    EL.title = o.querySelector(".lcf-title");
    EL.amt = o.querySelector(".lcf-amt");
    EL.body = o.querySelector(".lcf-body");
    o.querySelector(".lcf-x").addEventListener("click", closeModal);
    o.addEventListener("click", function(e){ if(e.target === o){ closeModal(); } });
    document.addEventListener("keydown", function(e){
      if(e.key === "Escape" && o.classList.contains("lcf-open")){ closeModal(); }
    });
  }

  function openModal(options){
    ensureModal();
    EL.title.textContent = options.label || "Secure Payment";
    EL.amt.textContent = options.amount ? inr(options.amount) : "";
    EL.overlay.classList.add("lcf-open");
    document.body.style.overflow = "hidden";
  }
  function closeModal(){
    if(!EL.overlay){ return; }
    EL.overlay.classList.remove("lcf-open");
    document.body.style.overflow = "";
  }

  function waSvg(){
    return '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.556 4.121 1.528 5.856L.057 23.215a.75.75 0 00.922.921l5.344-1.47A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.89 0-3.663-.523-5.183-1.432l-.37-.219-3.171.871.884-3.175-.237-.386A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>';
  }

  function renderLoading(message){
    EL.body.innerHTML =
      '<div class="lcf-center">' +
        '<div class="lcf-spinner"></div>' +
        '<h4 class="lcf-t">' + esc(message || "Setting up secure checkout…") + '</h4>' +
        '<p class="lcf-p">Please don\'t close this window. You\'ll be able to pay by UPI, card, net-banking or wallet.</p>' +
        '<div class="lcf-trust">🔒 Payments are processed securely by Cashfree</div>' +
      '</div>';
  }

  function upiPanelHtml(options){
    var cfg = getConfig();
    return '' +
      '<div class="lcf-upi">' +
        '<h4>Pay by UPI — backup option</h4>' +
        '<p class="lcf-upi-sub">Scan with any UPI app, or copy the UPI ID below</p>' +
        '<div class="lcf-qr"><img src="' + cfg.upiQrImage + '" alt="Lume Live UPI QR — ' + cfg.upiId + '"></div>' +
        '<div class="lcf-upiid" data-upi="' + cfg.upiId + '"><span>' + cfg.upiId + '</span>📋</div>' +
        '<p class="lcf-apps">PhonePe · Google Pay · Paytm · BHIM — Amount: <strong>' + inr(options.amount) + '</strong></p>' +
        '<a class="lcf-btn wa" target="_blank" rel="noopener noreferrer" href="' + waUrl(waConfirmMessage(options, options._cfOrderId || options._attemptId)) + '">' + waSvg() + ' Send payment screenshot on WhatsApp</a>' +
      '</div>';
  }

  function wireUpi(){
    var idEl = EL.body.querySelector(".lcf-upiid");
    if(idEl){
      idEl.addEventListener("click", function(){
        var val = idEl.getAttribute("data-upi");
        if(navigator.clipboard){ navigator.clipboard.writeText(val).then(function(){ notify("UPI ID copied: " + val); }); }
        else { notify("UPI ID: " + val); }
      });
    }
  }

  function calSvg(){
    return '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>';
  }

  function okMarkSvg(){
    return '<svg class="lcf-mark" viewBox="0 0 52 52" aria-hidden="true">' +
      '<circle class="lcf-mark-halo" cx="26" cy="26" r="23"/>' +
      '<circle class="lcf-mark-ring" cx="26" cy="26" r="23"/>' +
      '<path class="lcf-mark-check" d="M15.5 26.8l7 7 14-14.5"/>' +
      '</svg>';
  }

  /* ------------------------------------------------------------
     A short affirmation shown after payment. Paying for counselling
     is a vulnerable moment, so the screen says something human
     before it asks for the next click.

     Picked from a stable hash of the order ID, not at random, so the
     in-page modal and payment-return.html show the client the same
     line — and a refresh doesn't swap it for a different one.
     ------------------------------------------------------------ */
  var AFFIRMATIONS = {
    // Before a live 1:1 session.
    session: {
      eyebrow: "a note before we meet",
      lines: [
        "Most people sit with these questions for months. You've just turned yours into an appointment — that's the hardest part done.",
        "Clarity isn't something you're born with. It's built, one honest conversation at a time. This is conversation one.",
        "Asking for direction isn't a sign you're lost. It's a sign you're serious about where you're going.",
        "You don't need every answer today. You need the next real step — and you've just taken it.",
        "Whatever you've been weighing up on your own, you don't have to weigh it up alone any more.",
        "The pressure you're feeling is real, and it isn't a verdict on what you're capable of. We'll look at it together."
      ]
    },
    // Before an assessment or report.
    report: {
      eyebrow: "a note before you start",
      lines: [
        "Understanding how you're actually wired is worth more than any single exam score. That's what the next few minutes are for.",
        "There are no wrong answers ahead — only honest ones. Answer as you are, not as you think you should be.",
        "You've chosen to look at this properly instead of guessing. That already puts you ahead of the crowd.",
        "Nothing you find here is a label or a limit. It's a starting point you get to work with."
      ]
    }
  };

  function affirmationFor(kind, seed){
    var pool = (AFFIRMATIONS[kind] || AFFIRMATIONS.session).lines;
    var key = String(seed || ""), h = 0;
    for(var i = 0; i < key.length; i++){ h = (h * 31 + key.charCodeAt(i)) >>> 0; }
    return pool[(key ? h : Math.floor(Math.random() * pool.length)) % pool.length];
  }

  function affirmHtml(kind, seed, name){
    var set = AFFIRMATIONS[kind] || AFFIRMATIONS.session;
    var eyebrow = name ? esc(name) + ", " + set.eyebrow : set.eyebrow.charAt(0).toUpperCase() + set.eyebrow.slice(1);
    return '<div class="lcf-affirm">' +
      '<span class="lcf-affirm-eyebrow">' + eyebrow + '</span>' +
      '<p class="lcf-affirm-q">' + esc(affirmationFor(kind, seed)) + '</p>' +
      '<span class="lcf-affirm-sign">— The Lume Live Counselling Team</span>' +
      '</div>';
  }
  window.lumeAffirmationHtml = affirmHtml;

  function renderSuccess(options, orderId){
    if(window.gtag) gtag('event','payment_success',{event_category:'payment_funnel',event_label:options.sku||options.label||'',value:Number(options.amount||0),transaction_id:orderId||''});
    var flow = SKU_FLOW[options.sku] || { cta:"Continue", href:options.continueUrl || "index.html",
      steps:["Your payment is confirmed.","We've recorded your order.","Tap below to confirm on WhatsApp."] };
    var booking = isBooking(options);
    var calUrl = options.bookingUrl || bookingUrl();
    // On a booking flow the second step is the one the client must act on
    // now — highlight it so the eye lands on it and then on the gold button.
    var steps = (options.successSteps || flow.steps).map(function(s, i){
      return "<li" + (booking && i === 1 ? ' class="lcf-now"' : "") + ">" + s + "</li>";
    }).join("");

    // Live-session purchases lead with the calendar picker; anything the SKU
    // also unlocks (e.g. the Stream Clarity assessment) drops to a second,
    // quieter button. Non-session SKUs keep their original single CTA.
    var primary = booking && calUrl
      ? '<a class="lcf-btn gold book" target="_blank" rel="noopener noreferrer" data-act="book" href="' + esc(calUrl) + '">' + calSvg() + ' ' + esc(flow.cta || "Pick Your Slot") + '</a>' +
        '<p class="lcf-note">Choose from Lume Live\'s live availability — Google emails your confirmation and video-call link instantly. Nothing more to arrange on WhatsApp.</p>'
      : '<a class="lcf-btn gold" href="' + esc(options.continueUrl || flow.href) + '">' + esc(flow.cta) + '</a>';

    var secondary = "";
    if(booking && calUrl && (options.continueUrl || flow.href)){
      secondary = '<a class="lcf-btn ghost" href="' + esc(options.continueUrl || flow.href) + '">Or start my assessment first</a>';
    }

    EL.body.innerHTML =
      '<div class="lcf-center">' +
        okMarkSvg() +
        '<h4 class="lcf-t">You\'re in' + (options.customerName ? ", " + esc(options.customerName) : "") + '.</h4>' +
        '<p class="lcf-p">Your payment of <strong>' + esc(inr(options.amount)) + '</strong> is confirmed.' + (orderId ? '<br><span style="font-size:.78rem;color:#8493ab">Order ID: ' + esc(orderId) + '</span>' : '') + '</p>' +
      '</div>' +
      affirmHtml(booking ? "session" : "report", orderId || options.sku, options.customerName) +
      '<ol class="lcf-steps">' + steps + '</ol>' +
      primary +
      secondary +
      '<a class="lcf-btn wa' + (booking ? ' quiet' : '') + '" target="_blank" rel="noopener noreferrer" href="' + esc(waUrl(waConfirmMessage(options, orderId))) + '">' + waSvg() + (booking ? ' Need help? Message us' : ' Confirm booking on WhatsApp') + '</a>' +
      '<button class="lcf-back" type="button">Close</button>';
    var bookBtn = EL.body.querySelector('[data-act="book"]');
    if(bookBtn && window.gtag){
      bookBtn.addEventListener("click", function(){
        gtag('event','calendar_book_click',{event_category:'booking',event_label:options.sku||options.label||''});
      });
    }
    EL.body.querySelector(".lcf-back").addEventListener("click", closeModal);
  }

  function renderPending(options, orderId, statusLabel){
    EL.body.innerHTML =
      '<div class="lcf-center">' +
        '<div class="lcf-ico wait">⏳</div>' +
        '<h4 class="lcf-t">Payment Pending</h4>' +
        '<p class="lcf-p">Cashfree shows your payment as <strong>' + esc(statusLabel || "pending") + '</strong>. If money was debited, it usually confirms within a minute.' + (orderId ? '<br><span style="font-size:.78rem;color:#8493ab">Order ID: ' + esc(orderId) + '</span>' : '') + '</p>' +
      '</div>' +
      '<button class="lcf-btn navy" type="button" data-act="verify">Check status again</button>' +
      '<a class="lcf-btn wa" target="_blank" rel="noopener noreferrer" href="' + waUrl(waConfirmMessage(options, orderId)) + '">' + waSvg() + ' Confirm on WhatsApp</a>' +
      '<button class="lcf-back" type="button">Close</button>';
    EL.body.querySelector('[data-act="verify"]').addEventListener("click", function(){ verifyAndRender(options, orderId); });
    EL.body.querySelector(".lcf-back").addEventListener("click", closeModal);
  }

  function renderFailure(options, message){
    EL.body.innerHTML =
      '<div class="lcf-center">' +
        '<div class="lcf-ico err">!</div>' +
        '<h4 class="lcf-t">Payment didn\'t go through</h4>' +
        '<p class="lcf-p">' + esc(message || "Your payment could not be completed. Don't worry — no money is deducted for a failed attempt. You can try again or pay by UPI below.") + '</p>' +
      '</div>' +
      '<button class="lcf-btn gold" type="button" data-act="retry">Try payment again</button>' +
      '<a class="lcf-btn wa" target="_blank" rel="noopener" href="' +
        esc(waUrl("Hello Lume Live! I had trouble completing my payment" + (options.label ? " for " + options.label : "") + ". Please help me complete it.")) +
        '">Message us on WhatsApp</a>' +
      '<div class="lcf-divider">or pay directly by UPI</div>' +
      upiPanelHtml(options) +
      '<button class="lcf-back" type="button">Cancel</button>';
    var retry = EL.body.querySelector('[data-act="retry"]');
    if(retry){ retry.addEventListener("click", function(){ startCheckout(options); }); }
    EL.body.querySelector(".lcf-back").addEventListener("click", closeModal);
    wireUpi();
  }

  /* ============================================================
     Checkout flow
     ============================================================ */
  function verifyOrder(orderId){
    var cfg = getConfig();
    if(window.location.protocol === "file:"){ return Promise.resolve({ order_status:"PREVIEW" }); }
    return fetch(cfg.orderStatusEndpoint + "?order_id=" + encodeURIComponent(orderId))
      .then(function(res){ if(!res.ok){ throw new Error("status " + res.status); } return res.json(); });
  }

  function verifyAndRender(options, orderId){
    renderLoading("Verifying your payment…");
    verifyOrder(orderId).then(function(data){
      var status = String(data.order_status || "").toUpperCase();
      if(status === "PAID"){
        window.lumeCashfreeGrantAccess(options.sku, { order_id:orderId, amount:data.order_amount || options.amount });
        logAttempt(options, { status:"PAID", orderId:orderId, cfOrderId:data.cf_order_id || "" });
        if(typeof options.onCompleted === "function"){ try{ options.onCompleted(data, { ok:true }); }catch(e){} }
        renderSuccess(options, orderId);
      }else{
        logAttempt(options, { status:status || "PENDING", orderId:orderId });
        renderPending(options, orderId, status.toLowerCase());
      }
    }).catch(function(){
      // Can't verify (e.g. no backend) — show optimistic success but route confirmation via WhatsApp
      renderSuccess(options, orderId);
    });
  }

  function startCheckout(options){
    var cfg = getConfig();
    openModal(options);
    renderLoading("Creating your secure order…");
    logAttempt(options, { status:"INITIATED" });
    if(window.gtag) gtag('event','payment_initiated',{event_category:'payment_funnel',event_label:options.sku||options.label||'',value:Number(options.amount||0)});

    if(window.location.protocol === "file:"){
      renderFailure(options, "This is a local preview. Cashfree checkout works on the live website. You can still pay by UPI below.");
      return Promise.resolve({ ok:false, reason:"preview" });
    }
    if(typeof window.Cashfree !== "function"){
      renderFailure(options, "The secure payment window couldn't load — this is usually a network or ad-blocker issue. Please retry in a moment, pay by UPI below, or message us on WhatsApp and we'll complete it with you.");
      return Promise.resolve({ ok:false, reason:"sdk-unavailable" });
    }

    var payload = {
      sku: options.sku || "",
      amount: Number(options.amount || 0),
      label: options.label || "",
      customer: { name:options.customerName || "", phone:options.customerPhone || "", email:options.customerEmail || "" },
      notes: options.notes || {},
      pageUrl: window.location.href,
      returnUrl: buildReturnUrl(options)
    };

    return fetch(cfg.createOrderEndpoint, {
      method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(payload)
    })
    .then(function(res){ if(!res.ok){ throw new Error("order creation failed: " + res.status); } return res.json(); })
    .then(function(data){
      var sessionId = data.payment_session_id || data.paymentSessionId || data.payment_sessions_id;
      var orderId = data.order_id || data.orderId || "";
      if(!sessionId){ throw new Error("missing payment_session_id"); }
      options._cfOrderId = orderId;
      logAttempt(options, { status:"ORDER_CREATED", orderId:orderId });
      if(typeof options.onStarted === "function"){ try{ options.onStarted(data, { stage:"checkout-opened" }); }catch(e){} }

      renderLoading("Opening Cashfree checkout…");
      var cashfree = window.Cashfree({ mode: cfg.mode || "production" });
      return cashfree.checkout({ paymentSessionId: sessionId, redirectTarget: "_modal" })
        .then(function(result){
          if(result && result.error){
            logAttempt(options, { status:"FAILED", orderId:orderId, error:String(result.error.message || result.error) });
            renderFailure(options, (result.error.message || "Payment was not completed.") + " You can try again or pay by UPI.");
            return { ok:false, order:data, result:result };
          }
          // result.redirect (true) or result.paymentDetails — confirm via order status
          verifyAndRender(options, orderId);
          return { ok:true, order:data, result:result };
        });
    })
    .catch(function(err){
      console.warn("[Lume Cashfree]", err);
      logAttempt(options, { status:"ERROR", error:String(err && err.message || err) });
      renderFailure(options, "We couldn't start Cashfree checkout. Please try again, or pay by UPI below.");
      return { ok:false, error:err };
    });
  }

  function buildReturnUrl(options){
    if(options.returnUrl){ return options.returnUrl; }
    var cfg = getConfig();
    if(cfg.returnUrl){ return cfg.returnUrl; }
    var origin = cfg.publicBaseUrl || cfg.publicBase || "https://lumelive.co.in";
    var continuePath = encodeURIComponent((window.location.pathname || "/assessment.html") + (window.location.search || "") + (window.location.hash || ""));
    var sku = encodeURIComponent(options.sku || "");
    return origin + "/payment-return.html?order_id={order_id}&sku=" + sku + "&continue=" + continuePath;
  }

  /* ---------- public entry point ---------- */
  window.lumeCashfreePay = function(options){
    options = options || {};
    return startCheckout(options);
  };

  if(typeof document !== "undefined" && document.documentElement){
    document.documentElement.setAttribute("data-lume-cashfree", "ready");
  }
  try{ window.dispatchEvent(new CustomEvent("lume:cashfree-ready")); }catch(err){}
})();
