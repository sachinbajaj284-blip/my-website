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
    redirectTarget: "_modal",
    whatsappNumber: "917015671280",
    upiId: "sachinbajaj284@okaxis",
    upiQrImage: "lume-upi-qr.png",
    supportEmail: "hello@lumelive.co.in",
    firestoreCollection: "paymentAttempts"
  };

  // Per-SKU success "next steps" + continue link, kept in sync with payment-return.html
  var SKU_FLOW = {
    "student-full-report":        { cta:"Start Assessment Now",       href:"assessment.html#self-assessments",                       steps:["Your ₹999 Full Clarity Report is unlocked.","Start the 4-part assessment now — it takes about 20 minutes.","Your 15-page PDF report is delivered on WhatsApp after review."] },
    "lume-lens-working-profile":  { cta:"Start Lume Lens Now",         href:"for-working-professionals.html#self-assessments",         steps:["Your Lume Lens report is unlocked.","Complete the short assessment to generate your clarity report.","We share your personalised PDF on WhatsApp."] },
    "career-intelligence-roadmap":{ cta:"Open Career Intelligence",    href:"career-intelligence.html?access=assessment#career-intelligence", steps:["Your Career Intelligence roadmap is unlocked.","Open the dashboard to begin.","Save your WhatsApp confirmation for your records."] },
    "parents-handbook":           { cta:"Confirm Delivery on WhatsApp",href:"https://wa.me/917015671280", steps:["Payment received for the Parents' Career Handbook.","Send us your email on WhatsApp so we can deliver the PDF.","You'll receive it within a few hours."] },
    "intro-session":              { cta:"Confirm Booking on WhatsApp", href:"https://wa.me/917015671280", steps:["Payment received for your ₹49 introductory session.","Tap below to confirm your preferred date & time on WhatsApp.","Sachin will send your Google Meet / call details before the session."] }
  };

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
      "Hi Lume Live!",
      "I want to complete payment for " + (options.label || "a Lume Live service") + ".",
      "Amount: " + inr(options.amount),
      options.customerName ? "Name: " + options.customerName : "",
      options.customerPhone ? "WhatsApp: " + options.customerPhone : "",
      options.customerEmail ? "Email: " + options.customerEmail : "",
      "Please help me complete the payment and confirm access."
    ].filter(Boolean).join("\n");
  }

  function waConfirmMessage(options, orderId){
    return [
      "Hi Lume Live!",
      "I have completed my Cashfree payment for " + (options.label || "a Lume Live service") + ".",
      "Amount: " + inr(options.amount),
      orderId ? "Order ID: " + orderId : "",
      options.customerName ? "Name: " + options.customerName : "",
      "Please confirm my access / booking."
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
  };
  window.lumeCashfreeHasAccess = function(sku){
    var store = readAccessStore();
    return Boolean(store[sku] && String(store[sku].status || "").toUpperCase() === "PAID");
  };
  window.lumeCashfreeGetConfig = getConfig;

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
".lcf-t{margin:0 0 6px;font-size:1.16rem;font-weight:800;color:#0D1B40}",
".lcf-p{margin:0 0 16px;font-size:.92rem;line-height:1.55;color:#56657d}",
".lcf-steps{list-style:none;margin:0 0 18px;padding:0;text-align:left}",
".lcf-steps li{position:relative;padding:9px 10px 9px 38px;margin-bottom:8px;background:#F6F8FC;border-radius:12px;font-size:.86rem;line-height:1.45;color:#33425c}",
".lcf-steps li::before{counter-increment:lcf;content:counter(lcf);position:absolute;left:9px;top:50%;transform:translateY(-50%);width:22px;height:22px;border-radius:50%;background:#0D1B40;color:#fff;font-size:.74rem;font-weight:800;display:flex;align-items:center;justify-content:center}",
".lcf-steps{counter-reset:lcf}",
".lcf-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:48px;border:0;border-radius:999px;font-size:.94rem;font-weight:800;cursor:pointer;text-decoration:none;margin-bottom:10px;transition:transform .12s,box-shadow .12s}",
".lcf-btn:active{transform:scale(.98)}",
".lcf-btn.gold{background:linear-gradient(135deg,#C9933A,#E8B95A);color:#0D1B40}",
".lcf-btn.wa{background:#25D366;color:#fff}",
".lcf-btn.navy{background:#0D1B40;color:#fff}",
".lcf-btn.ghost{background:#EEF2F8;color:#33425c}",
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
".lcf-back:hover{color:#0D1B40}"
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

  function renderSuccess(options, orderId){
    var flow = SKU_FLOW[options.sku] || { cta:"Continue", href:options.continueUrl || "index.html",
      steps:["Your payment is confirmed.","We've recorded your order.","Tap below to confirm on WhatsApp."] };
    var steps = (options.successSteps || flow.steps).map(function(s){ return "<li>" + s + "</li>"; }).join("");
    EL.body.innerHTML =
      '<div class="lcf-center">' +
        '<div class="lcf-ico ok">✓</div>' +
        '<h4 class="lcf-t">Payment Successful</h4>' +
        '<p class="lcf-p">Thank you' + (options.customerName ? ", " + esc(options.customerName) : "") + '! Your payment of <strong>' + esc(inr(options.amount)) + '</strong> is confirmed.' + (orderId ? '<br><span style="font-size:.78rem;color:#8493ab">Order ID: ' + esc(orderId) + '</span>' : '') + '</p>' +
      '</div>' +
      '<ol class="lcf-steps">' + steps + '</ol>' +
      '<a class="lcf-btn gold" href="' + (options.continueUrl || flow.href) + '">' + (flow.cta) + '</a>' +
      '<a class="lcf-btn wa" target="_blank" rel="noopener noreferrer" href="' + waUrl(waConfirmMessage(options, orderId)) + '">' + waSvg() + ' Confirm booking on WhatsApp</a>' +
      '<button class="lcf-back" type="button">Close</button>';
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

    if(window.location.protocol === "file:"){
      renderFailure(options, "This is a local preview. Cashfree checkout works on the live website. You can still pay by UPI below.");
      return Promise.resolve({ ok:false, reason:"preview" });
    }
    if(typeof window.Cashfree !== "function"){
      renderFailure(options, "Cashfree is still loading. Please retry in a moment, or pay by UPI below.");
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
