/*
  Buddy — the assistant on lumelive.co.in.

  A launcher, a panel, and a POST to /api/agent/web. No framework, no
  build step, no external request: the site's CSP allows scripts from
  'self' and this has to work under it unchanged.

  Three things here are deliberate.

  The session id is stored, not generated. The server issues it and this
  keeps it in localStorage so a reply survives a page change; a browser
  that has never spoken gets no id at all and asks for one by sending a
  message. Storage can throw — private windows, blocked site data — so
  every read and write is wrapped and the widget works without it, just
  forgetting the thread on navigation.

  A locked conversation stops the composer. When a counsellor takes over,
  or the safety screen locks the thread, the input is disabled and says
  why rather than accepting messages nobody will answer.

  Nothing personal is shown unless the visitor is signed in. The panel
  says which of the two it is, because "it knows my scores" and "it does
  not" are very different products and the visitor should not have to
  guess which one they are talking to.
*/
(function(){
  "use strict";

  var ENDPOINT = "/api/agent/web";
  var STORE_KEY = "lume-buddy-session";
  var WA = "https://wa.me/917015671280";

  var session = null;
  var busy = false;
  var locked = false;
  var opened = false;
  var el = {};

  // ── storage that is allowed to fail ─────────────────────────────────
  function readStore(){
    try{ return window.localStorage.getItem(STORE_KEY); }catch(err){ return null; }
  }
  function writeStore(value){
    try{ window.localStorage.setItem(STORE_KEY, value); }catch(err){ /* private window */ }
  }

  function el_(tag, cls, text){
    var node = document.createElement(tag);
    if(cls) node.className = cls;
    if(text != null) node.textContent = text;
    return node;
  }

  function styles(){
    if(document.getElementById("lume-buddy-css")) return;
    var css = document.createElement("style");
    css.id = "lume-buddy-css";
    css.textContent = [
      /*
        A quiet circle, not a second call to action.

        The bottom-right corner already belongs to "Book ₹249" — the first
        version of this sat at the same bottom:20px right:20px and covered
        it outright. So the launcher stacks above that button rather than
        competing with it, and is styled down to match: white, a hairline
        border, the same 52px as the WhatsApp float on the left. The one
        saturated thing on it is the brandmark, which is how the assistant
        is identified everywhere else.

        The label expands on hover because a bare initial is a riddle, and
        because that is the site's own pattern — .float-wa does exactly the
        same thing.
      */
      ".lb-launch{position:fixed;right:20px;bottom:20px;z-index:998;display:flex;align-items:center;",
      "height:52px;width:52px;padding:0 13px;overflow:hidden;background:#fff;color:#0D1B40;",
      "border:1px solid rgba(13,27,64,.10);border-radius:26px;cursor:pointer;",
      "font:800 .82rem/1 'Inter',system-ui,sans-serif;box-shadow:0 4px 18px rgba(13,27,64,.14);",
      "transition:width .35s cubic-bezier(.25,.46,.45,.94),box-shadow .3s}",
      /* Stacked above the booking CTA when the page has one. */
      ".lb-launch.lb-stacked{bottom:84px}",
      "@media(hover:hover){.lb-launch:hover{width:158px;box-shadow:0 8px 26px rgba(13,27,64,.20)}",
      ".lb-launch:hover .lb-label{max-width:110px;opacity:1;margin-left:9px}}",
      ".lb-launch:focus-visible{outline:2px solid #0A6E6E;outline-offset:2px}",
      ".lb-launch .lb-dot{width:26px;height:26px;flex:none;border-radius:50%;",
      "background:linear-gradient(135deg,#C9933A,#E8B95A);",
      "display:grid;place-items:center;color:#0D1B40;font-weight:900;font-size:.8rem}",
      ".lb-label{max-width:0;opacity:0;white-space:nowrap;overflow:hidden;",
      "transition:max-width .35s cubic-bezier(.25,.46,.45,.94),opacity .25s,margin-left .35s}",
      /* The assessment report takes over the screen; the site hides its own
         floats for it and this is one of them now. */
      "body.sa-report-visible .lb-launch,body.seasonal-active .lb-launch{display:none!important}",
      "@media(max-width:768px){.lb-launch.lb-stacked{bottom:68px;right:14px}}",
      ".lb-panel{position:fixed;right:20px;bottom:20px;z-index:9999;width:min(390px,calc(100vw - 32px));",
      "height:min(600px,calc(100vh - 40px));background:#fff;border-radius:22px;display:none;flex-direction:column;",
      "overflow:hidden;box-shadow:0 28px 70px rgba(13,27,64,.34);font:400 .92rem/1.6 'Inter',system-ui,sans-serif;color:#1A2C2C}",
      ".lb-panel.open{display:flex}",
      ".lb-hd{background:linear-gradient(135deg,#0D1B40,#1A2E5E);color:#fff;padding:15px 16px;display:flex;align-items:center;gap:11px}",
      ".lb-hd .lb-dot{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#C9933A,#E8B95A);",
      "display:grid;place-items:center;color:#0D1B40;font-weight:900}",
      ".lb-hd b{display:block;font-size:.95rem;line-height:1.25}",
      ".lb-hd span{font-size:.72rem;color:#9FB6B6}",
      ".lb-x{margin-left:auto;background:transparent;border:0;color:#9FB6B6;font-size:1.5rem;line-height:1;cursor:pointer;padding:0 4px}",
      ".lb-x:hover{color:#fff}",
      ".lb-log{flex:1;overflow-y:auto;padding:16px;background:#F7FAF9;display:flex;flex-direction:column;gap:10px}",
      ".lb-msg{max-width:86%;padding:10px 13px;border-radius:15px;white-space:pre-wrap;overflow-wrap:anywhere}",
      ".lb-them{background:#fff;border:1px solid #DDE7E5;border-bottom-left-radius:4px}",
      ".lb-me{background:#0A6E6E;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}",
      ".lb-note{font-size:.78rem;color:#4A6060;text-align:center;padding:2px 8px}",
      ".lb-note a{color:#0A6E6E;font-weight:700}",
      ".lb-form{display:flex;gap:8px;padding:12px;border-top:1px solid #DDE7E5;background:#fff}",
      ".lb-in{flex:1;border:1px solid #DDE7E5;border-radius:999px;padding:11px 15px;font:inherit;color:inherit;min-width:0}",
      ".lb-in:focus{outline:2px solid #0A6E6E;outline-offset:1px}",
      ".lb-in:disabled{background:#F4F6F5;color:#8FA3A3}",
      ".lb-send{background:#0D1B40;color:#fff;border:0;border-radius:999px;padding:0 18px;font:800 .88rem 'Inter',system-ui,sans-serif;cursor:pointer}",
      ".lb-send:disabled{opacity:.5;cursor:not-allowed}",
      ".lb-typing span{display:inline-block;width:6px;height:6px;margin-right:3px;border-radius:50%;background:#8FA3A3;animation:lb-b 1.2s infinite}",
      ".lb-typing span:nth-child(2){animation-delay:.15s}.lb-typing span:nth-child(3){animation-delay:.3s}",
      "@keyframes lb-b{0%,60%,100%{opacity:.3}30%{opacity:1}}",
      "@media(prefers-reduced-motion:reduce){.lb-typing span{animation:none}}",
      "@media(max-width:480px){.lb-panel{right:8px;left:8px;bottom:8px;width:auto;height:min(78vh,600px)}}"
    ].join("");
    document.head.appendChild(css);
  }

  function say(text, mine){
    var node = el_("div", "lb-msg " + (mine ? "lb-me" : "lb-them"), text);
    el.log.appendChild(node);
    el.log.scrollTop = el.log.scrollHeight;
    return node;
  }

  function note(html){
    var node = el_("p", "lb-note");
    node.innerHTML = html;
    el.log.appendChild(node);
    el.log.scrollTop = el.log.scrollHeight;
  }

  function typing(on){
    if(on){
      el.typing = el_("div", "lb-msg lb-them lb-typing");
      el.typing.innerHTML = "<span></span><span></span><span></span>";
      el.typing.setAttribute("aria-label", "Buddy is typing");
      el.log.appendChild(el.typing);
      el.log.scrollTop = el.log.scrollHeight;
    }else if(el.typing){
      el.typing.remove();
      el.typing = null;
    }
  }

  function lock(reason){
    locked = true;
    el.input.disabled = true;
    el.send.disabled = true;
    el.input.placeholder = reason || "A counsellor is picking this up";
  }

  function build(){
    styles();

    el.launch = el_("button", "lb-launch");
    el.launch.type = "button";
    el.launch.setAttribute("aria-label", "Ask Buddy a career question");
    el.launch.title = "Ask Buddy";
    el.launch.innerHTML = '<span class="lb-dot">B</span><span class="lb-label">Ask Buddy</span>';

    /*
      Sit above the booking CTA where there is one. Asked of the DOM rather
      than hardcoded, because index.html has that button and buddy.html does
      not — and a fixed offset would leave a gap on one of them.
    */
    if(document.querySelector(".float-cta")) el.launch.classList.add("lb-stacked");

    el.panel = el_("div", "lb-panel");
    el.panel.setAttribute("role", "dialog");
    el.panel.setAttribute("aria-label", "Buddy, the Lume Live assistant");

    var hd = el_("div", "lb-hd");
    hd.innerHTML = '<span class="lb-dot">B</span><span><b>Buddy</b><span>Lume Live &middot; assistant, not a counsellor</span></span>';
    el.close = el_("button", "lb-x", "×");
    el.close.type = "button";
    el.close.setAttribute("aria-label", "Close");
    hd.appendChild(el.close);

    el.log = el_("div", "lb-log");
    el.log.setAttribute("role", "log");
    el.log.setAttribute("aria-live", "polite");

    el.form = el_("form", "lb-form");
    el.input = el_("input", "lb-in");
    el.input.type = "text";
    el.input.placeholder = "Ask about streams, courses, exams…";
    el.input.setAttribute("aria-label", "Your message");
    el.input.maxLength = 2000;
    el.send = el_("button", "lb-send", "Send");
    el.send.type = "submit";
    el.form.appendChild(el.input);
    el.form.appendChild(el.send);

    el.panel.appendChild(hd);
    el.panel.appendChild(el.log);
    el.panel.appendChild(el.form);
    document.body.appendChild(el.launch);
    document.body.appendChild(el.panel);

    el.launch.addEventListener("click", open);
    el.close.addEventListener("click", close);
    el.form.addEventListener("submit", submit);
    document.addEventListener("keydown", function(e){
      if(e.key === "Escape" && el.panel.classList.contains("open")) close();
    });
  }

  function open(){
    el.panel.classList.add("open");
    el.launch.style.display = "none";
    if(!opened){
      opened = true;
      say("Hi — I'm Buddy, Lume Live's assistant. I'm not a counsellor, but I can help you think a decision through.", false);
      say("What's on your mind? A stream choice, a course, an exam — or just that you're not sure where to start.", false);
    }
    el.input.focus();
  }

  function close(){
    el.panel.classList.remove("open");
    el.launch.style.display = "";
  }

  /*
    A signed-in visitor gets a personal answer, so the token goes up when
    there is one. lumeAccount is loaded on some pages and not others, and
    its absence simply means anonymous.
  */
  function authHeader(){
    if(!window.lumeAccount || typeof window.lumeAccount.token !== "function"){
      return Promise.resolve(null);
    }
    /*
      Bounded, because this can hang rather than fail.

      lumeAccount.token() waits on the Firebase SDK loading from
      gstatic.com. If that request is slow, blocked by a network, or
      refused by an extension, the promise simply never settles — and a
      browser test caught exactly that: the message was never sent and
      the visitor sat watching a typing indicator with no error to
      explain it. Signing in is a bonus here, not a requirement, so a
      slow answer is treated as "not signed in" and the question goes
      anyway.
    */
    var timeout = new Promise(function(resolve){ setTimeout(function(){ resolve(null); }, 2500); });
    var token = window.lumeAccount.token()
      .then(function(t){ return t || null; })
      .catch(function(){ return null; });
    return Promise.race([token, timeout]);
  }

  function submit(e){
    e.preventDefault();
    if(busy || locked) return;
    var text = el.input.value.trim();
    if(!text) return;

    say(text, true);
    el.input.value = "";
    busy = true;
    el.send.disabled = true;
    typing(true);

    authHeader().then(function(token){
      var headers = { "Content-Type": "application/json" };
      if(token) headers.Authorization = "Bearer " + token;
      return fetch(ENDPOINT, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ message: text, session: session || undefined })
      });
    }).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(body){
        return { status: res.status, body: body };
      });
    }).then(function(r){
      typing(false);
      busy = false;
      el.send.disabled = false;

      if(r.body && r.body.session){
        session = r.body.session;
        writeStore(session);
      }

      var reply = r.body && (r.body.reply || r.body.error);
      if(!reply){
        reply = "Something went wrong at my end. You can reach us on WhatsApp and a counsellor will help.";
      }
      say(reply, false);

      if(r.body && r.body.locked){
        lock("A counsellor is picking this up");
        note('Or message us directly on <a href="' + WA + '" target="_blank" rel="noopener">WhatsApp</a>.');
      }
      el.input.focus();
    }).catch(function(){
      typing(false);
      busy = false;
      el.send.disabled = false;
      say("I couldn't reach Lume Live just then — check your connection and try again.", false);
      note('Still stuck? <a href="' + WA + '" target="_blank" rel="noopener">Message us on WhatsApp</a>.');
    });
  }

  function start(){
    if(document.getElementById("lume-buddy-css")) return;
    session = readStore();
    build();
    /* Anything on the page can open the panel — the hero button on
       buddy.html is just the first caller. */
    document.addEventListener("click", function(e){
      var trigger = e.target && e.target.closest && e.target.closest("[data-buddy-open]");
      if(trigger){ e.preventDefault(); open(); }
    });
    if(location.hash === "#buddy-chat") open();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", start);
  }else{
    start();
  }
})();
