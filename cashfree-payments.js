(function(){
  "use strict";

  var DEFAULTS = {
    mode: "production",
    createOrderEndpoint: "/api/cashfree/create-order",
    orderStatusEndpoint: "/api/cashfree/order-status",
    redirectTarget: "_self",
    whatsappNumber: "917015671280"
  };

  function getConfig(){
    var pageConfig = window.LUME_CASHFREE || {};
    var cfg = {};
    Object.keys(DEFAULTS).forEach(function(key){ cfg[key] = DEFAULTS[key]; });
    Object.keys(pageConfig).forEach(function(key){ cfg[key] = pageConfig[key]; });
    return cfg;
  }

  function notify(message){
    if(typeof window.showToast === "function"){ window.showToast(message); return; }
    if(typeof window.toast === "function"){ window.toast(message); return; }
    window.alert(message);
  }

  function safeOpen(url){
    var opened = window.open(url, "_blank", "noopener");
    if(!opened){ window.location.href = url; }
  }

  function waMessage(options){
    var lines = [
      "Hi Lume Live!",
      "I want to complete payment for " + (options.label || "a Lume Live service") + ".",
      "Amount: Rs " + (options.amount || ""),
      options.customerName ? "Name: " + options.customerName : "",
      options.customerPhone ? "WhatsApp: " + options.customerPhone : "",
      options.customerEmail ? "Email: " + options.customerEmail : "",
      "Please help me complete the payment and confirm access."
    ].filter(Boolean);
    return lines.join("\n");
  }

  function fallback(options){
    if(options && typeof options.onFallback === "function"){
      return options.onFallback(options);
    }
    var cfg = getConfig();
    safeOpen("https://wa.me/" + cfg.whatsappNumber + "?text=" + encodeURIComponent(waMessage(options || {})));
  }

  function paymentUnavailable(message, options, detail){
    var suffix = " Please try again from the live website. The UPI / WhatsApp backup stays available below if you need manual support.";
    notify(message + suffix);
    if(options && (options.allowWhatsappFallback === true || options.autoWhatsappFallback === true)){
      fallback(options);
      markPaymentStarted(options, { fallback: true, error: String(detail && detail.message || detail || "") }, {});
      return Promise.resolve({ ok: false, fallback: true, error: detail || null });
    }
    return Promise.resolve({ ok: false, fallback: false, error: detail || null });
  }

  function browserCanUseBackend(cfg){
    if(!cfg.createOrderEndpoint){ return false; }
    if(window.location.protocol === "file:"){ return false; }
    return true;
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

  function markPaymentStarted(options, data, result){
    if(typeof options.onStarted === "function"){
      options.onStarted(data || {}, result || {});
    }
  }

  function readAccessStore(){
    try{ return JSON.parse(localStorage.getItem("lumeCashfreeAccess") || "{}") || {}; }
    catch(err){ return {}; }
  }

  function writeAccessStore(store){
    try{ localStorage.setItem("lumeCashfreeAccess", JSON.stringify(store || {})); }
    catch(err){}
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

  window.lumeCashfreePay = function(options){
    options = options || {};
    var cfg = getConfig();

    if(!browserCanUseBackend(cfg)){
      return paymentUnavailable("Cashfree checkout needs the live payment backend.", options, "backend-unavailable");
    }

    if(typeof window.Cashfree !== "function"){
      return paymentUnavailable("Cashfree checkout is still loading.", options, "sdk-unavailable");
    }

    var payload = {
      sku: options.sku || "",
      amount: Number(options.amount || 0),
      label: options.label || "",
      customer: {
        name: options.customerName || "",
        phone: options.customerPhone || "",
        email: options.customerEmail || ""
      },
      notes: options.notes || {},
      pageUrl: window.location.href,
      returnUrl: buildReturnUrl(options)
    };

    return fetch(cfg.createOrderEndpoint, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    })
    .then(function(res){
      if(!res.ok){ throw new Error("Cashfree order creation failed: " + res.status); }
      return res.json();
    })
    .then(function(data){
      var sessionId = data.payment_session_id || data.paymentSessionId || data.payment_sessions_id;
      if(!sessionId){ throw new Error("Cashfree order response did not include payment_session_id."); }
      var cashfree = window.Cashfree({ mode: cfg.mode || "production" });
      markPaymentStarted(options, data, { stage: "checkout-opened" });
      return cashfree.checkout({
        paymentSessionId: sessionId,
        redirectTarget: options.redirectTarget || cfg.redirectTarget || "_modal"
      }).then(function(result){
        if(typeof options.onCompleted === "function"){ options.onCompleted(data, result || {}); }
        return { ok: true, order: data, result: result };
      });
    })
    .catch(function(err){
      console.warn("[Lume Cashfree]", err);
      return paymentUnavailable("Cashfree checkout could not start.", options, err);
    });
  };

  if(typeof document !== "undefined" && document.documentElement){
    document.documentElement.setAttribute("data-lume-cashfree", "ready");
  }
  try{ window.dispatchEvent(new CustomEvent("lume:cashfree-ready")); }
  catch(err){}
})();
