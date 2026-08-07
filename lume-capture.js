/*
  Lume Live — client submission capture (lumeCapture)

  Every enquiry form on this site ends the same way: it builds a WhatsApp
  message and opens wa.me on the *client's* phone. If they don't press
  send in WhatsApp — app not installed, wrong number logged in, second
  thoughts, or just a fumbled tap — everything they typed is gone and we
  never knew they were interested.

  This mirrors that same message to /api/submit the moment the button is
  tapped, so the enquiry reaches the owner whether or not the client
  completes the second step in another app. It is a copy of a message the
  client was already addressing to Lume Live, sent to the same recipient
  — not extra data collection.

  Deliberately passive: it hooks the two ways this site opens WhatsApp
  (a link click, and window.open) rather than asking every form handler to
  call it. Nothing here can break a form — every path is wrapped, and the
  WhatsApp hand-off happens regardless of what we do.

  Pages can also report structured data directly:
    window.lumeCapture({ type:'booking', name:'…', phone:'…', details:{…} })
*/
(function(){
  "use strict";

  var ENDPOINT = "/api/submit";
  var WA_RE = /^https?:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//i;

  // A given message is only worth sending once, however many times the
  // client taps the button.
  var sent = Object.create(null);

  function post(payload){
    try{
      var body = JSON.stringify(payload);
      // keepalive so the request survives the page being backgrounded
      // when WhatsApp takes over — this fires as the client leaves.
      if(window.fetch){
        fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body,
          keepalive: true
        }).catch(function(){});
      }else if(navigator.sendBeacon){
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type:"application/json" }));
      }
    }catch(err){}
  }

  window.lumeCapture = function(input){
    try{
      var payload = input || {};
      payload.page = payload.page || location.pathname + location.search;
      var key = (payload.type || "") + "|" + (payload.summary || "") + "|" + (payload.phone || "");
      if(sent[key]) return;
      sent[key] = 1;
      post(payload);
    }catch(err){}
  };

  /* ---------- read a WhatsApp URL back into fields ---------- */

  // The bulleted messages this site builds look like:
  //   Hello Lume Live!
  //   • Name: Roli
  //   • WhatsApp: 98765 43210
  // so the labelled lines give us name/phone/email without each form
  // having to be rewritten to report them.
  function fieldsFrom(text){
    var out = { details:{} };
    String(text || "").split("\n").forEach(function(line){
      var m = line.replace(/^[•\-\s]+/, "").match(/^([A-Za-z][A-Za-z /&'-]{1,40}?)\s*:\s*(.+)$/);
      if(!m) return;
      var label = m[1].trim().toLowerCase(), value = m[2].trim();
      if(!value || value === "—") return;
      if(!out.name && /^(name|your name|coordinator name|student name)$/.test(label)) out.name = value;
      else if(!out.phone && /(whatsapp|phone|mobile|contact number)/.test(label)) out.phone = value;
      else if(!out.email && /e-?mail/.test(label)) out.email = value;
      else if(Object.keys(out.details).length < 25) out.details[m[1].trim()] = value;
    });
    return out;
  }

  function captureWaUrl(url){
    try{
      var u = new URL(url, location.href);
      if(!WA_RE.test(u.href)) return;
      var text = u.searchParams.get("text") || "";
      if(!text) return;
      var f = fieldsFrom(text);
      window.lumeCapture({
        type: "whatsapp",
        name: f.name,
        phone: f.phone,
        email: f.email,
        summary: text,
        details: f.details
      });
    }catch(err){}
  }

  /* ---------- hook the two ways WhatsApp gets opened ---------- */

  // 1. Anchor clicks — captured at the document level so links added
  //    later (and links whose href is rewritten on click) are covered.
  document.addEventListener("click", function(e){
    try{
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if(a && WA_RE.test(a.getAttribute("href") || "")) captureWaUrl(a.href);
    }catch(err){}
  }, true);

  // 2. window.open, used by the forms that build their message in JS.
  try{
    var nativeOpen = window.open;
    window.open = function(url){
      try{ if(url && WA_RE.test(String(url))) captureWaUrl(String(url)); }catch(err){}
      return nativeOpen.apply(window, arguments);
    };
  }catch(err){}

  /* ---------- paid bookings ----------
     The server already reports these from order-status once Cashfree has
     confirmed the payment, which is the copy to trust. This adds the
     detail the browser knows and the server does not — which session was
     being bought, and how the client wants to meet — keyed by order id so
     the two rows can be read together. */
  function hookCheckout(){
    if(typeof window.lumeCashfreePay !== "function" || window.lumeCashfreePay.__lumeCaptured) return;
    var pay = window.lumeCashfreePay;
    window.lumeCashfreePay = function(options){
      try{
        var o = options || {};
        window.lumeCapture({
          type: "checkout-started",
          name: o.customerName,
          phone: o.customerPhone,
          email: o.customerEmail,
          sku: o.sku,
          amount: o.amount,
          summary: "Started checkout for " + (o.label || o.sku || "a Lume Live service"),
          details: o.notes || {}
        });
      }catch(err){}
      return pay.apply(window, arguments);
    };
    window.lumeCashfreePay.__lumeCaptured = true;
  }
  // The helper may load before or after this file, so cover both: the
  // event for "not yet", the ready flag it sets for "already done".
  window.addEventListener("lume:cashfree-ready", hookCheckout);
  hookCheckout();
})();
