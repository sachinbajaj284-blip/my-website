/* ==================================================================
   Lume Live — reusable email lead-magnet block (lumeLeadmagnet)
   ------------------------------------------------------------------
   Drop this anywhere to turn a visitor into a list you own, using the
   same pipeline the rest of the site uses:

     <div class="lume-lm"
          data-source="results-hub"                         (required: list tag)
          data-title="Get the free Stream-Selection Checklist"
          data-sub="One page to choose Science / Commerce / Arts..."
          data-resource="Parent's Stream-Selection Checklist" (named in WhatsApp handoff)
          data-download="parents-stream-selection-checklist.pdf"  (optional PDF)
          data-cta="Send it to me"></div>
     <script src="lume-leadmagnet.js" defer></script>

   On submit it POSTs { email, source } to /api/lead (which pipes to the
   owner's list and always succeeds, so the visitor experience never
   breaks), fires a GA event, hands off to WhatsApp with the email
   pre-filled, and offers the download. It never blocks on the network.
   No personal data is stored in the browser.
   ================================================================== */
(function () {
  "use strict";
  var WA = "917015671280";
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var injected = false;

  function css() {
    if (injected) return; injected = true;
    var s = document.createElement("style");
    s.textContent =
      ".lume-lm{--lmg:linear-gradient(135deg,#F5B13D 0%,#FF7A66 100%);background:linear-gradient(135deg,#FFF4E3 0%,#FDE9F0 55%,#E7F7F3 100%);border:1px solid #F3E2CE;border-radius:22px;padding:24px 22px;margin:24px 0;box-shadow:0 16px 44px rgba(245,177,61,.14)}" +
      ".lume-lm .lm-eyebrow{font-size:.72rem;font-weight:900;letter-spacing:.5px;text-transform:uppercase;color:#C2410C;margin-bottom:8px}" +
      ".lume-lm .lm-title{font-family:'Inter',Arial,sans-serif;font-weight:900;font-size:1.25rem;line-height:1.2;color:#0C1836;margin:0 0 6px;letter-spacing:-.01em}" +
      ".lume-lm .lm-sub{color:#4a5568;font-size:.95rem;margin:0 0 16px;max-width:560px}" +
      ".lume-lm form{display:flex;gap:10px;flex-wrap:wrap}" +
      ".lume-lm input[type=email]{flex:1;min-width:200px;border:1.5px solid #E6D7C4;border-radius:999px;padding:14px 18px;font-size:1rem;font-family:inherit;color:#0C1836;background:#fff}" +
      ".lume-lm input[type=email]:focus{outline:none;border-color:#FF7A66;box-shadow:0 0 0 3px rgba(255,122,102,.18)}" +
      ".lume-lm button{cursor:pointer;border:0;font-family:inherit;background:var(--lmg);color:#3a1600;font-weight:900;font-size:1rem;padding:14px 24px;border-radius:999px;box-shadow:0 10px 26px rgba(255,122,102,.32);transition:transform .16s ease,box-shadow .16s ease}" +
      ".lume-lm button:hover{transform:translateY(-2px);box-shadow:0 14px 32px rgba(255,122,102,.42)}" +
      ".lume-lm .lm-err{display:none;color:#B3261E;font-size:.85rem;font-weight:700;margin-top:8px}" +
      ".lume-lm .lm-fine{color:#6b7280;font-size:.76rem;margin-top:10px}" +
      ".lume-lm .lm-fine a{color:#0A6E6E;font-weight:700}" +
      ".lume-lm .lm-done{display:none}" +
      ".lume-lm.is-done .lm-form-wrap{display:none}.lume-lm.is-done .lm-done{display:block}" +
      ".lume-lm .lm-done h3{font-family:'Inter',sans-serif;font-weight:900;color:#0C1836;font-size:1.2rem;margin:0 0 8px}" +
      ".lume-lm .lm-done p{color:#4a5568;font-size:.95rem;margin:0 0 14px}" +
      ".lume-lm .lm-done-row{display:flex;gap:10px;flex-wrap:wrap}" +
      ".lume-lm .lm-btn2{display:inline-flex;align-items:center;gap:8px;text-decoration:none;font-weight:800;font-size:.92rem;padding:12px 20px;border-radius:999px}" +
      ".lume-lm .lm-wa{background:linear-gradient(135deg,#25D366,#12a150);color:#fff}" +
      ".lume-lm .lm-dl{background:#fff;border:1.5px solid #E2D6C4;color:#0C1836}" +
      "@media(prefers-reduced-motion:reduce){.lume-lm button{transition:none}}";
    document.head.appendChild(s);
  }

  function esc(s) { return String(s || "").replace(/[<>&"]/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]; }); }

  function mount(box) {
    var source = box.getAttribute("data-source") || "leadmagnet";
    var title = box.getAttribute("data-title") || "Get it free on WhatsApp";
    var sub = box.getAttribute("data-sub") || "";
    var cta = box.getAttribute("data-cta") || "Send it to me";
    var resource = box.getAttribute("data-resource") || "free resource";
    var dl = box.getAttribute("data-download") || "";
    var eyebrow = box.getAttribute("data-eyebrow") || "Free · no spam";

    box.innerHTML =
      '<div class="lm-form-wrap">' +
      '<div class="lm-eyebrow">' + esc(eyebrow) + '</div>' +
      '<h3 class="lm-title">' + esc(title) + '</h3>' +
      (sub ? '<p class="lm-sub">' + esc(sub) + '</p>' : '') +
      '<form novalidate>' +
      '<input type="email" inputmode="email" autocomplete="email" placeholder="you@email.com" aria-label="Your email" required>' +
      '<button type="submit">' + esc(cta) + ' →</button>' +
      '</form>' +
      '<div class="lm-err">Please enter a valid email so we can send it.</div>' +
      '<p class="lm-fine">We’ll only send what you asked for and how we can help — no spam, unsubscribe anytime. <a href="privacy-policy.html">Privacy</a>.</p>' +
      '</div>' +
      '<div class="lm-done" aria-live="polite">' +
      '<h3>✅ Done — it’s on its way.</h3>' +
      '<p>Tap below to get it instantly on WhatsApp' + (dl ? ', or download it now' : '') + '. We’ll also send your next steps.</p>' +
      '<div class="lm-done-row">' +
      '<a class="lm-btn2 lm-wa" target="_blank" rel="noopener" href="#">💬 Get it on WhatsApp</a>' +
      (dl ? '<a class="lm-btn2 lm-dl" href="' + esc(dl) + '" download>⬇️ Download now</a>' : '') +
      '</div></div>';

    var form = box.querySelector("form");
    var input = box.querySelector("input[type=email]");
    var err = box.querySelector(".lm-err");
    var waBtn = box.querySelector(".lm-wa");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = (input.value || "").trim();
      if (!EMAIL_RE.test(email)) { err.style.display = "block"; input.focus(); return; }
      err.style.display = "none";
      try { if (window.gtag) gtag("event", "leadmagnet_submit", { event_category: "lead_capture", event_label: source, value: 1 }); } catch (e1) {}
      try {
        fetch("/api/lead", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email, source: source }), keepalive: true }).catch(function () {});
      } catch (e2) {}
      var msg = "Hello Lume Live! Please send me the " + resource + ". My email: " + email + ". And how does the ₹499 first session work?";
      waBtn.href = "https://wa.me/" + WA + "?text=" + encodeURIComponent(msg);
      box.classList.add("is-done");
      if (dl) { try { var a = box.querySelector(".lm-dl"); if (a) a.click(); } catch (e3) {} }
    });
  }

  function init() {
    var boxes = document.querySelectorAll(".lume-lm[data-source]");
    if (!boxes.length) return;
    css();
    Array.prototype.forEach.call(boxes, mount);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
