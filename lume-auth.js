(function(){
  "use strict";

  /* ============================================================
     Lume Live — the account a purchase belongs to

     Every checkout now requires one, so every page that sells
     something needs a way to get one. Three pages already had a full
     sign-in modal of their own (index, assessment,
     for-working-professionals); career-intelligence had Firebase but
     nothing to sign in with; for-parents and internships had no
     account layer at all.

     Rather than copy a sign-in form onto the pages that lack it, this
     is the one place that knows how to get a signed-in user — and, since
     the sign-in is a mobile number and an OTP, the only place:

       window.lumeAccount.ready()    -> Promise<user|null>  once known
       window.lumeAccount.current()  -> user|null
       window.lumeAccount.prompt()   -> opens the sign-in form below
       window.lumeAccount.onSignIn(fn) -> called once, when a user appears
       window.lumeAccount.token()    -> Promise<idToken|"">

     The form it opens is the one below, on every page. The three pages
     that used to run their own email-and-password modal open this
     instead: their buttons call openAuth(), and this file claims that
     name once it loads.

     Nothing here runs on page load. Firebase is imported the first
     time an account is actually needed, which on most pages is never.
     ============================================================ */

  var SDK_BASE = "https://www.gstatic.com/firebasejs/12.13.0/";

  // Same project as the inline blocks on index.html / assessment.html.
  // A Firebase web config is public by design — access is controlled by
  // security rules and by the Admin SDK on our own endpoints.
  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyDWifVIos_IGC7RT0xojH8gjMZekacR6bk",
    authDomain: "lume-live-cf865.firebaseapp.com",
    projectId: "lume-live-cf865",
    storageBucket: "lume-live-cf865.firebasestorage.app",
    messagingSenderId: "524991686804",
    appId: "1:524991686804:web:e7019de465f5065901ec81"
  };

  function esc(v){
    return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }

  var authMod = null;      // the firebase-auth module, once imported
  var authPromise = null;  // Promise<auth>
  var readyPromise = null; // Promise<user|null> — settles on first auth state
  var currentUser = null;
  var signInWaiters = [];

  /* The page may already have initialised Firebase in an inline module.
     If so we adopt its instance rather than starting a second app —
     two auth instances would disagree about who is signed in. */
  function ensureAuth(){
    if(authPromise){ return authPromise; }
    authPromise = Promise.all([
      window.firebaseAuth ? null : import(SDK_BASE + "firebase-app.js"),
      import(SDK_BASE + "firebase-auth.js")
    ]).then(function(mods){
      authMod = mods[1];
      // Re-check: an inline module may have finished while we imported.
      if(window.firebaseAuth){ return window.firebaseAuth; }
      var app = window.firebaseApp || mods[0].initializeApp(FIREBASE_CONFIG);
      var auth = authMod.getAuth(app);
      window.firebaseApp = app;
      window.firebaseAuth = auth;
      return auth;
    }).catch(function(err){
      // Let a later attempt retry rather than caching the failure.
      authPromise = null;
      throw err;
    });
    return authPromise;
  }

  function watch(auth){
    if(watch._on){ return; }
    watch._on = true;
    authMod.onAuthStateChanged(auth, function(user){
      currentUser = user || null;
      window.currentFirebaseUser = currentUser;
      if(currentUser){
        var waiting = signInWaiters.splice(0, signInWaiters.length);
        waiting.forEach(function(fn){ try{ fn(currentUser); }catch(err){} });
      }
    });
  }

  /* Resolves once Firebase has told us whether anyone is signed in, and
     always with whoever is signed in *now*. The distinction matters: the
     first answer is usually "nobody", and the checkout then asks the
     client to sign in and calls this again. Caching that first answer
     instead of re-reading currentUser would leave a client who has just
     created an account still being told to create an account. */
  function ready(){
    if(readyPromise){ return readyPromise.then(function(){ return currentUser; }); }
    readyPromise = ensureAuth().then(function(auth){
      watch(auth);
      // onAuthStateChanged fires once with the restored session (or null)
      // as soon as Firebase has read persistence — that first call is the
      // only reliable "we now know" signal.
      return new Promise(function(resolve){
        var stop = authMod.onAuthStateChanged(auth, function(user){
          currentUser = user || null;
          window.currentFirebaseUser = currentUser;
          if(typeof stop === "function"){ stop(); }
          resolve(currentUser);
        });
      });
    }).catch(function(){
      // Firebase unreachable. Treated as "not signed in" — the checkout
      // shows the account screen, which is honest and recoverable.
      readyPromise = null;
      return null;
    });
    return readyPromise;
  }

  function onSignIn(fn){
    if(currentUser){ fn(currentUser); return; }
    signInWaiters.push(fn);
    // Make sure something is listening even if ready() was never called.
    ensureAuth().then(watch).catch(function(){});
  }

  function token(){
    return ready().then(function(user){
      return user ? user.getIdToken() : "";
    }).catch(function(){ return ""; });
  }

  /* ---------------------------------------------------------- prompt --
     One sign-in for the whole site, and it is the phone one below.

     This used to hand off to whatever sign-in a page had of its own,
     which meant three pages asked for an email and a password while the
     rest asked for a number. Signing in is now the same three steps
     everywhere — name, number, OTP — so there is nothing left to hand
     off to. `openAuth` is claimed below for the same reason: every
     Login / Create Account button on those pages already calls it. */
  function prompt(mode){
    openFallback(mode || "signup");
  }

  /* ============================================================
     Sign in / sign up — name, mobile number, OTP

     The account a purchase belongs to is now the phone number that
     bought it. That is the field every other part of this site already
     keys on: entitlements are looked up by phone, coupons count "one
     per customer" by phone, and a session is delivered by calling one.
     An email address was an extra thing to remember that none of that
     used ever needed.

     So there is no password here and no separate sign-up: a number
     either has an account behind it or gets one the moment the OTP
     checks out, and the person never has to know which of the two they
     were. The name is asked once — on the way in, or straight after a
     first OTP if they arrived through "Sign in".

     Firebase needs an invisible reCAPTCHA to send an SMS at all, which
     is why there is a container div here doing nothing visible.
     ============================================================ */
  var EL = {};

  function injectStyles(){
    if(document.getElementById("la-styles")){ return; }
    var css = [
".la-overlay{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(8,16,38,.62);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}",
".la-overlay.la-open{display:flex}",
".la-card{width:min(410px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:22px;box-shadow:0 30px 80px rgba(8,16,38,.4);font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#102033}",
".la-hd{position:relative;background:linear-gradient(135deg,#0D1B40,#13306b);color:#fff;padding:20px 22px 18px;border-radius:22px 22px 0 0;text-align:center}",
".la-hd h3{margin:0;font-size:1.1rem;font-weight:800}",
".la-hd p{margin:5px 0 0;font-size:.8rem;color:rgba(255,255,255,.72);line-height:1.5}",
".la-x{position:absolute;top:12px;right:14px;background:rgba(255,255,255,.16);border:0;color:#fff;width:30px;height:30px;border-radius:50%;font-size:1rem;cursor:pointer;line-height:1}",
".la-x:hover{background:rgba(255,255,255,.3)}",
".la-body{padding:22px}",
".la-field{margin-bottom:12px}",
".la-field label{display:block;font-size:.74rem;font-weight:800;letter-spacing:.3px;text-transform:uppercase;color:#56657d;margin-bottom:5px}",
".la-field input{width:100%;box-sizing:border-box;padding:11px 13px;border:1.5px solid #E3E9F2;border-radius:12px;font-size:.94rem;font-family:inherit;color:#102033;background:#FBFCFE}",
".la-field input:focus{outline:0;border-color:#0D1B40;background:#fff}",
/* The phone box reads as one field with the +91 that never changes. */
".la-tel{display:flex;align-items:stretch;border:1.5px solid #E3E9F2;border-radius:12px;background:#FBFCFE;overflow:hidden}",
".la-tel:focus-within{border-color:#0D1B40;background:#fff}",
".la-tel span{display:flex;align-items:center;padding:0 10px 0 13px;font-size:.94rem;font-weight:700;color:#56657d;border-right:1.5px solid #E3E9F2}",
".la-tel input{border:0;border-radius:0;background:transparent}",
".la-tel input:focus{background:transparent}",
/* The code itself: wide spacing so a 6-digit SMS code is easy to check. */
"#laOtp{letter-spacing:.42em;font-size:1.12rem;font-weight:800;text-align:center}",
".la-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:48px;border:0;border-radius:999px;font-size:.94rem;font-weight:800;cursor:pointer;font-family:inherit;margin-bottom:10px}",
".la-btn.gold{background:linear-gradient(135deg,#C9933A,#E8B95A);color:#0D1B40;box-shadow:0 10px 26px rgba(201,147,58,.32)}",
".la-btn.gold:disabled{opacity:.6;cursor:default;box-shadow:none}",
".la-alt{background:none;border:0;width:100%;font-family:inherit;font-size:.84rem;color:#33425c;cursor:pointer;padding:6px}",
".la-alt b{color:#0D1B40}",
".la-alt:disabled{opacity:.55;cursor:default}",
".la-err{margin:0 0 12px;padding:10px 12px;border-radius:11px;background:#FDECEC;color:#933;font-size:.82rem;line-height:1.45;display:none}",
".la-err.on{display:block}",
".la-note{margin:12px 0 0;font-size:.72rem;line-height:1.5;color:#8493ab;text-align:center}",
".la-sent{margin:0 0 12px;padding:10px 12px;border-radius:11px;background:#E9F7F0;color:#186A4B;font-size:.82rem;line-height:1.45;display:none}",
".la-sent.on{display:block}",
".la-sent b{white-space:nowrap}",
/* The "check your inbox" panel. Shares the card, so it reads as the next
   step of the same flow rather than a different screen. */
".lv-mark{width:48px;height:48px;margin:0 auto 12px;border-radius:50%;background:linear-gradient(135deg,#0A6E6E,#12A3A3);display:flex;align-items:center;justify-content:center;font-size:1.5rem}",
".lv-to{margin:0 0 14px;text-align:center;font-size:.95rem;line-height:1.55;color:#102033}",
".lv-to b{display:block;margin-top:4px;font-size:1rem;color:#0D1B40;word-break:break-all}",
".lv-steps{margin:0 0 14px;padding:0;list-style:none;counter-reset:lv}",
".lv-steps li{position:relative;counter-increment:lv;padding:0 0 10px 34px;font-size:.86rem;line-height:1.5;color:#33425c}",
".lv-steps li:before{content:counter(lv);position:absolute;left:0;top:-1px;width:23px;height:23px;border-radius:50%;background:#EDF1F8;color:#0D1B40;font-size:.72rem;font-weight:900;display:flex;align-items:center;justify-content:center}",
".lv-steps b{color:#0D1B40}",
/* The spam line is the single most useful sentence on this panel, so it
   is not a footnote — most "I never got the email" reports end here. */
".lv-spam{margin:0 0 14px;padding:11px 13px;border-radius:12px;background:#FFF8E8;border:1px solid #F2E2BC;font-size:.82rem;line-height:1.55;color:#6B5524}",
".lv-spam b{color:#0D1B40}",
".lv-row{display:flex;gap:9px;margin-bottom:10px}",
".lv-row .la-btn{margin-bottom:0}",
".la-btn.ghost{background:#fff;border:1.5px solid #D9E1EE;color:#0D1B40;box-shadow:none}",
".la-btn.ghost:disabled{opacity:.55;cursor:default}",
".lv-msg{margin:0 0 10px;padding:10px 12px;border-radius:11px;font-size:.82rem;line-height:1.45;display:none}",
".lv-msg.on{display:block}",
".lv-msg.ok{background:#E9F7F0;color:#186A4B}",
".lv-msg.bad{background:#FDECEC;color:#933}",
"@media(max-width:420px){.lv-row{flex-direction:column}}"
    ].join("\n");
    var s = document.createElement("style");
    s.id = "la-styles";
    s.textContent = css;
    document.head.appendChild(s);
  }

  function ensureModal(){
    if(EL.overlay){ return; }
    injectStyles();
    var o = document.createElement("div");
    o.className = "la-overlay";
    o.setAttribute("role", "dialog");
    o.setAttribute("aria-modal", "true");
    o.innerHTML =
      '<div class="la-card">' +
        '<div class="la-hd">' +
          '<button class="la-x" type="button" aria-label="Close">✕</button>' +
          '<h3 class="la-title">Create your Lume Live account</h3>' +
          '<p class="la-sub">Your report, session and receipts stay with your number — on any device.</p>' +
        '</div>' +
        '<div class="la-body">' +
          '<p class="la-err"></p>' +
          '<p class="la-sent"></p>' +
          '<div class="la-field la-name-field"><label for="laName">Full name</label><input id="laName" type="text" autocomplete="name" placeholder="Your name"></div>' +
          '<div class="la-field la-phone-field"><label for="laPhone2">Mobile number</label>' +
            '<div class="la-tel"><span>+91</span><input id="laPhone2" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="98765 43210" maxlength="15"></div></div>' +
          '<div class="la-field la-otp-field" style="display:none"><label for="laOtp">6-digit OTP</label>' +
            '<input id="laOtp" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="••••••" maxlength="6"></div>' +
          '<button class="la-btn gold la-submit" type="button">Send OTP</button>' +
          '<button class="la-alt la-resend" type="button" style="display:none">Didn’t get it? <b>Send again</b></button>' +
          '<button class="la-alt la-edit" type="button" style="display:none">Wrong number? <b>Change it</b></button>' +
          '<button class="la-alt la-signout" type="button" style="display:none">Not you? <b>Sign out</b></button>' +
          '<p class="la-note">We send one SMS to confirm it’s you. No password to remember, no marketing.</p>' +
          '<div class="la-captcha"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(o);
    EL.overlay = o;
    EL.title = o.querySelector(".la-title");
    EL.sub = o.querySelector(".la-sub");
    EL.err = o.querySelector(".la-err");
    EL.sent = o.querySelector(".la-sent");
    EL.nameField = o.querySelector(".la-name-field");
    EL.phoneField = o.querySelector(".la-phone-field");
    EL.otpField = o.querySelector(".la-otp-field");
    EL.name = o.querySelector("#laName");
    EL.phone = o.querySelector("#laPhone2");
    EL.otp = o.querySelector("#laOtp");
    EL.submit = o.querySelector(".la-submit");
    EL.resend = o.querySelector(".la-resend");
    EL.edit = o.querySelector(".la-edit");
    EL.signout = o.querySelector(".la-signout");
    EL.captcha = o.querySelector(".la-captcha");

    o.querySelector(".la-x").addEventListener("click", closeFallback);
    o.addEventListener("click", function(e){ if(e.target === o){ closeFallback(); } });
    EL.submit.addEventListener("click", submit);
    EL.resend.addEventListener("click", function(){ sendOtp(true); });
    EL.edit.addEventListener("click", function(){
      if(EL.pendingPhone && !EL.phone.value){ EL.phone.value = String(EL.pendingPhone).replace(/\D/g, "").slice(-10); }
      showStep("phone");
    });
    EL.signout.addEventListener("click", signOutNow);
    [EL.name, EL.phone, EL.otp].forEach(function(input){
      input.addEventListener("keydown", function(e){ if(e.key === "Enter"){ submit(); } });
    });
    // Six digits is the whole code, so verify as soon as they are there
    // rather than asking for a tap the SMS autofill has already earned.
    EL.otp.addEventListener("input", function(){
      var digits = String(EL.otp.value || "").replace(/\D/g, "").slice(0, 6);
      if(EL.otp.value !== digits){ EL.otp.value = digits; }
      if(digits.length === 6 && !EL.submit.disabled){ submit(); }
    });
  }

  /* Firebase wants E.164. Indian numbers arrive as ten digits, with a
     leading zero, or already prefixed, and all three are the same number
     to the person typing. */
  function toE164(raw){
    var digits = String(raw || "").replace(/\D/g, "");
    if(digits.length < 10){ return ""; }
    return "+91" + digits.slice(-10);
  }

  function prettyNumber(e164){
    var d = String(e164 || "").replace(/\D/g, "").slice(-10);
    return d ? "+91 " + d.slice(0, 5) + " " + d.slice(5) : "";
  }

  /* One card, three steps: the number, the code, and — only for someone
     we have never met — their name. Sign-in and sign-up are the same
     three steps, because a number either has an account behind it or
     gets one; the person should not have to know which. */
  function showStep(step){
    EL.step = step;
    var onPhone = step === "phone";
    var onCode  = step === "code";
    var onName  = step === "name";
    var onAcct  = step === "account";

    EL.phoneField.style.display = onPhone ? "" : "none";
    EL.otpField.style.display   = onCode ? "" : "none";
    EL.nameField.style.display  = (onName || (onPhone && EL.mode === "signup")) ? "" : "none";
    EL.resend.style.display     = onCode ? "" : "none";
    EL.edit.style.display       = onCode ? "" : "none";
    EL.signout.style.display    = onAcct ? "" : "none";

    if(onPhone){
      EL.title.textContent = EL.mode === "signup" ? "Create your Lume Live account" : "Sign in to continue";
      EL.sub.textContent = EL.mode === "signup"
        ? "Your report, session and receipts stay with your number — on any device."
        : "Enter your mobile number. We’ll send you an OTP.";
      EL.submit.textContent = "Send OTP";
      showSent("");
    } else if(onCode){
      EL.title.textContent = "Enter the OTP";
      EL.sub.textContent = "It usually arrives within a few seconds.";
      EL.submit.textContent = "Verify and continue";
    } else if(onName){
      EL.title.textContent = "One last thing";
      EL.sub.textContent = "What should we call you?";
      EL.submit.textContent = "Finish";
      showSent("");
    } else if(onAcct){
      var u = activeUser();
      EL.title.textContent = "You’re signed in";
      EL.sub.textContent = (u && u.displayName) ? u.displayName : "Your purchases follow this number.";
      EL.submit.textContent = "Done";
      showSent(u && u.phoneNumber
        ? "Signed in as <b>" + esc(prettyNumber(u.phoneNumber)) + "</b>"
        : (u && u.email ? "Signed in as <b>" + esc(u.email) + "</b>" : ""));
    }

    showError("");
    EL.submit.disabled = false;
    setTimeout(function(){
      try{
        if(onCode){ EL.otp.focus(); }
        else if(onName){ EL.name.focus(); }
        else if(EL.mode === "signup"){ EL.name.focus(); }
        else { EL.phone.focus(); }
      }catch(err){}
    }, 60);
  }

  function openFallback(mode){
    ensureModal();
    // The verify panels replace the form in the same card, so re-opening
    // the form has to put it back — otherwise this opens an empty card.
    if(VER.body){ VER.body.style.display = "none"; }
    if(PH.body){ PH.body.style.display = "none"; }
    EL.body = EL.body || EL.overlay.querySelector(".la-body:not(.lv-body)");
    EL.body.style.display = "";
    EL.mode = mode === "signin" ? "signin" : "signup";
    EL.otp.value = "";
    /* The same button says Login and then Account. Re-asking a signed-in
       client for the number they signed in with reads as being logged
       out, so they get told who they are and how to leave instead. */
    showStep(activeUser() ? "account" : "phone");
    EL.overlay.classList.add("la-open");
  }

  function closeFallback(){
    if(EL.overlay){ EL.overlay.classList.remove("la-open"); }
    stopResendTimer();
  }

  function showError(message){
    if(!EL.err){ return; }
    EL.err.textContent = message || "";
    EL.err.classList.toggle("on", Boolean(message));
  }

  function showSent(html){
    if(!EL.sent){ return; }
    EL.sent.innerHTML = html || "";
    EL.sent.classList.toggle("on", Boolean(html));
  }

  /* An SMS costs money and Firebase rate-limits it hard, so a second tap
     30 seconds in has to read as "not yet" rather than as a dead button.

     Named apart from the email panel's tickResend below: two function
     declarations of one name in this scope is not two functions, it is
     the second one, and the countdown here silently never ran. */
  var OTP_COOLDOWN_MS = 45 * 1000;
  var lastOtpAt = 0;

  function stopResendTimer(){
    if(EL.timer){ clearInterval(EL.timer); EL.timer = null; }
  }

  function tickOtpResend(){
    if(!EL.resend){ return; }
    var left = Math.max(0, OTP_COOLDOWN_MS - (Date.now() - lastOtpAt));
    if(left <= 0){
      EL.resend.disabled = false;
      EL.resend.innerHTML = "Didn’t get it? <b>Send again</b>";
      stopResendTimer();
      return;
    }
    EL.resend.disabled = true;
    EL.resend.textContent = "You can ask for another OTP in " + Math.ceil(left / 1000) + "s";
    if(!EL.timer){ EL.timer = setInterval(tickOtpResend, 1000); }
  }

  function otpError(err){
    var code = (err && err.code) || "";
    switch(code){
      case "auth/invalid-verification-code": return "That OTP didn’t match. Check the SMS and type it again.";
      case "auth/code-expired":              return "That OTP has expired. Ask for a new one.";
      case "auth/invalid-phone-number":      return "That doesn’t look like a valid mobile number.";
      case "auth/missing-phone-number":      return "Please enter your mobile number.";
      case "auth/quota-exceeded":            return "We can’t send an OTP right now. Please try again in a few minutes, or message us on WhatsApp.";
      case "auth/too-many-requests":         return "Too many attempts from this device. Please wait a few minutes and try again.";
      case "auth/network-request-failed":    return "Network connection failed. Please check your internet and try again.";
      case "auth/captcha-check-failed":
      case "auth/internal-error":            return "We couldn’t run the security check. Reload the page and try once more.";
      default: return "We could not send the OTP just now. Please try again in a moment.";
    }
  }

  function submit(){
    if(EL.step === "account"){ return closeFallback(); }
    if(EL.step === "code"){ return confirmOtp(); }
    if(EL.step === "name"){ return saveName(); }
    return sendOtp(false);
  }

  function sendOtp(isResend){
    if(isResend && Math.max(0, OTP_COOLDOWN_MS - (Date.now() - lastOtpAt)) > 0){ return; }

    var name = (EL.name.value || "").trim();
    // The number is what the account IS, so it is asked for first and the
    // name is carried along rather than gating the SMS.
    if(EL.mode === "signup" && !name){ return showError("Please enter your name."); }

    // On the number step the field is the truth — otherwise "Change it",
    // a new number, "Send OTP" would quietly text the old one. A resend
    // from the code step has no field on screen, so it uses what was sent.
    var e164 = toE164(EL.step === "code" ? (EL.pendingPhone || EL.phone.value) : EL.phone.value);
    if(!e164){ return showError("Please enter your 10-digit mobile number."); }

    EL.pendingName = name;
    EL.pendingPhone = e164;
    showError("");
    EL.submit.disabled = true;
    EL.submit.textContent = "Sending OTP…";

    ensureAuth().then(function(auth){
      watch(auth);
      /* A fresh verifier per attempt. A reCAPTCHA that has already been
         solved cannot be reused, and re-rendering into the same div is
         what the SDK expects. */
      if(EL.verifier){ try{ EL.verifier.clear(); }catch(err){} }
      EL.captcha.innerHTML = "";
      EL.verifier = new authMod.RecaptchaVerifier(auth, EL.captcha, { size: "invisible" });
      return authMod.signInWithPhoneNumber(auth, e164, EL.verifier);
    }).then(function(confirmation){
      EL.confirmation = confirmation;
      lastOtpAt = Date.now();
      EL.otp.value = "";
      showStep("code");
      showSent("OTP sent to <b>" + esc(prettyNumber(e164)) + "</b>");
      tickOtpResend();
    }).catch(function(err){
      EL.submit.disabled = false;
      EL.submit.textContent = EL.step === "code" ? "Verify and continue" : "Send OTP";
      showError(otpError(err));
    });
  }

  function confirmOtp(){
    var code = String(EL.otp.value || "").replace(/\D/g, "");
    if(code.length < 6){ return showError("Enter the 6-digit OTP from the SMS."); }
    if(!EL.confirmation){ return showError("Please ask for a new OTP."); }

    showError("");
    EL.submit.disabled = true;
    EL.submit.textContent = "Checking…";

    EL.confirmation.confirm(code).then(function(result){
      var user = (result && result.user) || activeUser();
      currentUser = user || currentUser;
      window.currentFirebaseUser = currentUser;
      stopResendTimer();

      // A name typed on the way in is kept; a returning client keeps the
      // one already on the account. Only someone with neither is asked.
      var wanted = EL.pendingName || "";
      if(user && wanted && !user.displayName){
        return authMod.updateProfile(user, { displayName: wanted }).catch(function(){}).then(done);
      }
      if(user && !user.displayName){
        EL.name.value = "";
        showStep("name");
        return;
      }
      return done();

      function done(){
        showSent("");
        closeFallback();
      }
    }).catch(function(err){
      EL.submit.disabled = false;
      EL.submit.textContent = "Verify and continue";
      showError(otpError(err));
    });
  }

  function signOutNow(){
    EL.signout.disabled = true;
    ensureAuth().then(function(auth){
      return authMod.signOut(auth);
    }).then(function(){
      currentUser = null;
      window.currentFirebaseUser = null;
      EL.signout.disabled = false;
      EL.mode = "signin";
      EL.phone.value = "";
      EL.pendingPhone = "";
      EL.pendingName = "";
      showStep("phone");
    }).catch(function(){
      EL.signout.disabled = false;
      showError("We could not sign you out just now. Please try again.");
    });
  }

  function saveName(){
    var name = (EL.name.value || "").trim();
    if(!name){ return showError("Please enter your name."); }
    var user = activeUser();
    if(!user){ closeFallback(); return; }

    EL.submit.disabled = true;
    EL.submit.textContent = "Saving…";
    ensureAuth().then(function(){
      return authMod.updateProfile(user, { displayName: name });
    }).catch(function(){}).then(function(){
      EL.submit.disabled = false;
      EL.submit.textContent = "Finish";
      closeFallback();
    });
  }

  /* ============================================================
     "Check your inbox" — the step after creating an account

     Firebase sends the verification link the moment an account is
     created, and until now that was the whole of it: a toast on three
     pages, nothing at all on the rest. The link then sits unopened,
     usually in Spam, and the person only discovers it matters much
     later — at Restore access, which refuses to run for an unverified
     email. By then they have forgotten there was an email, and it reads
     as the site being broken.

     So this says the three things that actually get someone verified:
     which address it went to (typos are common, and the address is not
     shown anywhere else), that it is probably in Spam, and how to get
     another one. Everything else is a footnote.

     It never blocks anything. Verification is not required to pay —
     that is deliberate, a client who has not opened their inbox is
     still a client who wants to buy something — so this panel is
     always dismissible and never gates a checkout.
     ============================================================ */
  var VER = {};
  var RESEND_COOLDOWN_MS = 60 * 1000;
  var lastResendAt = 0;

  /*
    Whoever is signed in, wherever they were signed in.

    Three pages initialise Firebase in their own inline module and run
    their own sign-up form, so this file's `currentUser` can still be
    null while somebody is very much signed in — its watcher only
    attaches once something here has asked for auth. Reading the shared
    instance too means Resend and I've-verified work on those pages
    instead of insisting the person signs in first.
  */
  function activeUser(){
    return currentUser
      || (window.firebaseAuth && window.firebaseAuth.currentUser)
      || window.currentFirebaseUser
      || null;
  }

  function verMsg(text, kind){
    if(!VER.msg){ return; }
    VER.msg.textContent = text || "";
    VER.msg.className = "lv-msg" + (text ? " on " + (kind || "ok") : "");
  }

  function cooldownLeft(){
    return Math.max(0, RESEND_COOLDOWN_MS - (Date.now() - lastResendAt));
  }

  /* Firebase rate-limits verification sends, and answering a rapid
     second tap with "too many requests" reads as a broken button. The
     countdown says the wait is expected and how long it is. */
  function tickResend(){
    if(!VER.resend){ return; }
    var left = cooldownLeft();
    if(left <= 0){
      VER.resend.disabled = false;
      VER.resend.textContent = "Send it again";
      if(VER.timer){ clearInterval(VER.timer); VER.timer = null; }
      return;
    }
    VER.resend.disabled = true;
    VER.resend.textContent = "Wait " + Math.ceil(left / 1000) + "s";
    if(!VER.timer){ VER.timer = setInterval(tickResend, 1000); }
  }

  function buildVerifyPanel(){
    if(VER.body){ return; }
    ensureModal();
    var body = document.createElement("div");
    body.className = "la-body lv-body";
    body.style.display = "none";
    body.innerHTML =
      '<div class="lv-mark">✉️</div>' +
      '<p class="lv-to">We sent a link to<b class="lv-email"></b></p>' +
      '<p class="lv-msg"></p>' +
      '<ol class="lv-steps">' +
        '<li>Open your email.</li>' +
        '<li>Find the email from <b>Lume Live</b>. Tap the link inside it.</li>' +
        '<li>Come back here and tap <b>I\u2019ve done it</b>.</li>' +
      '</ol>' +
      '<p class="lv-spam"><b>Can\u2019t find it?</b> Look in your <b>Spam</b> or <b>Junk</b> folder. On Gmail, also look in the <b>Promotions</b> tab. That is where it usually hides.<br><br>Found it there? Tap <b>\u201cNot spam\u201d</b> so our emails reach you next time.</p>' +
      '<div class="lv-row">' +
        '<button class="la-btn ghost lv-resend" type="button">Send it again</button>' +
        '<button class="la-btn gold lv-check" type="button">I\u2019ve done it</button>' +
      '</div>' +
      '<button class="la-alt lv-later" type="button">I\u2019ll do it later</button>' +
      '<p class="la-note">You can skip this for now. But doing it means your report still works if you change phone.</p>';

    VER.body = body;
    VER.email = body.querySelector(".lv-email");
    VER.msg = body.querySelector(".lv-msg");
    VER.resend = body.querySelector(".lv-resend");
    VER.check = body.querySelector(".lv-check");
    VER.later = body.querySelector(".lv-later");

    VER.resend.addEventListener("click", resendVerification);
    VER.check.addEventListener("click", recheckVerification);
    VER.later.addEventListener("click", closeFallback);

    EL.overlay.querySelector(".la-card").appendChild(body);
  }

  function resendVerification(){
    if(cooldownLeft() > 0){ return; }
    var user = activeUser();
    if(!user){
      return verMsg("Please sign in first, then ask for a new link.", "bad");
    }
    VER.resend.disabled = true;
    VER.resend.textContent = "Sending\u2026";
    ensureAuth().then(function(){
      return authMod.sendEmailVerification(user);
    }).then(function(){
      lastResendAt = Date.now();
      verMsg("Sent. Wait a minute, then look in Spam and Promotions too.", "ok");
      tickResend();
    }).catch(function(err){
      // Say which failure it was. "Try again" on a rate-limit is advice
      // that cannot work, and the person retries until they give up.
      var code = err && err.code;
      if(code === "auth/too-many-requests"){
        lastResendAt = Date.now();
        verMsg("That\u2019s a lot of emails! Wait a minute, then try again. The first one is probably in your Spam folder.", "bad");
      } else {
        verMsg("We could not send it right now. Try again in a minute, or message us on WhatsApp.", "bad");
      }
      tickResend();
    });
  }

  /* Firebase caches emailVerified on the local user object, so a link
     clicked in another tab or on a phone does not show up here until
     the record is reloaded. Without this the button would keep saying
     "not yet" to someone who has just verified. */
  function recheckVerification(){
    var user = activeUser();
    if(!user){ return verMsg("Please sign in first.", "bad"); }
    VER.check.disabled = true;
    VER.check.textContent = "Checking\u2026";
    user.reload().then(function(){
      if(user.emailVerified){
        verMsg("All done! You\u2019re set.", "ok");
        setTimeout(closeFallback, 1200);
      } else {
        verMsg("Not done yet. Open the link in the email first. Remember to look in Spam.", "bad");
      }
    }).catch(function(){
      verMsg("We could not check just now. Try again in a minute.", "bad");
    }).then(function(){
      VER.check.disabled = false;
      VER.check.textContent = "I\u2019ve done it";
    });
  }

  /*
    Show the panel. `sent` false means Firebase refused to send the link
    (rate limit, network) — the person is told that plainly rather than
    being sent to hunt for an email that was never sent.
  */
  function showVerifyHelp(options){
    var opts = options || {};
    buildVerifyPanel();
    var u = activeUser();
    var email = opts.email || (u && u.email) || "";

    EL.title.textContent = "Check your email";
    EL.sub.textContent = "We sent you a link. Tapping it takes about 10 seconds.";
    VER.email.textContent = email;
    VER.email.style.display = email ? "" : "none";

    if(opts.sent === false){
      verMsg("The email did not send. Tap \u201cSend it again\u201d to try once more.", "bad");
    } else if(opts.message){
      verMsg(opts.message, opts.messageKind || "ok");
    } else {
      verMsg("", "");
    }

    // Swap the form out for this panel; openFallback puts it back.
    EL.body = EL.body || EL.overlay.querySelector(".la-body:not(.lv-body)");
    EL.body.style.display = "none";
    VER.body.style.display = "";
    EL.overlay.classList.add("la-open");
    tickResend();
  }

  /* ============================================================
     Phone verification

     Referrals pay real money, and an email address costs nothing to
     manufacture. A phone number does — so a referral only counts when
     the account carries one that Firebase has actually sent a code to.
     This is the panel that gets it.

     The number is LINKED to the account the student already has, rather
     than becoming a second way to sign in. Nobody is asked to abandon
     the Google or email account they signed up with, and the uid the
     referral ledger knows about stays the same one.

     Firebase needs an invisible reCAPTCHA to send an SMS at all, which
     is why there is a container div here doing nothing visible.
     ============================================================ */
  var PH = {};

  function phMsg(text, kind){
    if(!PH.msg){ return; }
    PH.msg.textContent = text || "";
    PH.msg.className = "lv-msg" + (text ? " on " + (kind || "ok") : "");
  }

  function buildPhonePanel(){
    if(PH.body){ return; }
    ensureModal();
    var body = document.createElement("div");
    body.className = "la-body lv-body";
    body.style.display = "none";
    body.innerHTML =
      '<p class="lv-msg"></p>' +
      '<div class="la-field lp-numf"><label for="laPhone">Mobile number</label>' +
        '<input id="laPhone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="98765 43210" maxlength="15"></div>' +
      '<div class="la-field lp-codef" style="display:none"><label for="laCode">6-digit code</label>' +
        '<input id="laCode" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" maxlength="6"></div>' +
      '<button class="la-btn gold lp-go" type="button">Send code</button>' +
      '<button class="la-alt lp-later" type="button">Not now</button>' +
      '<p class="la-note">We use it to confirm you\u2019re a real person, and to reach you about a payout. No marketing.</p>' +
      '<div class="lp-captcha"></div>';
    EL.overlay.querySelector(".la-card").appendChild(body);

    PH.body = body;
    PH.msg = body.querySelector(".lv-msg");
    PH.numField = body.querySelector(".lp-numf");
    PH.codeField = body.querySelector(".lp-codef");
    PH.num = body.querySelector("#laPhone");
    PH.code = body.querySelector("#laCode");
    PH.go = body.querySelector(".lp-go");
    PH.later = body.querySelector(".lp-later");
    PH.captcha = body.querySelector(".lp-captcha");

    PH.go.addEventListener("click", function(){ PH.step === "code" ? confirmCode() : sendCode(); });
    [PH.num, PH.code].forEach(function(input){
      input.addEventListener("keydown", function(e){ if(e.key === "Enter"){ PH.go.click(); } });
    });
    PH.later.addEventListener("click", function(){ finishPhone(false); });
    EL.overlay.querySelector(".la-x").addEventListener("click", function(){ finishPhone(false); });
  }

  function finishPhone(ok){
    if(PH.resolve){
      var done = PH.resolve;
      PH.resolve = null;
      done(Boolean(ok));
    }
    closeFallback();
  }

  function phBusy(on, label){
    if(!PH.go){ return; }
    PH.go.disabled = Boolean(on);
    PH.go.textContent = label || (PH.step === "code" ? "Verify" : "Send code");
  }

  function sendCode(){
    var e164 = toE164(PH.num.value);
    if(!e164){
      phMsg("That doesn\u2019t look like a 10-digit mobile number.", "bad");
      return;
    }
    phBusy(true, "Sending\u2026");
    phMsg("", "");

    ensureAuth().then(function(auth){
      var user = activeUser();
      if(!user){ throw new Error("NO_USER"); }

      /* A fresh verifier per attempt. A reCAPTCHA that has already been
         solved cannot be reused, and re-rendering into the same div is
         what the SDK expects. */
      if(PH.verifier){ try{ PH.verifier.clear(); }catch(err){} }
      PH.captcha.innerHTML = "";
      PH.verifier = new authMod.RecaptchaVerifier(auth, PH.captcha, { size: "invisible" });

      return authMod.linkWithPhoneNumber(user, e164, PH.verifier);
    }).then(function(confirmation){
      PH.confirmation = confirmation;
      PH.step = "code";
      PH.numField.style.display = "none";
      PH.codeField.style.display = "";
      PH.code.value = "";
      phBusy(false, "Verify");
      phMsg("Code sent to " + e164 + ".", "ok");
      try{ PH.code.focus(); }catch(err){}
    }).catch(function(err){
      phBusy(false);
      phMsg(phoneError(err), "bad");
    });
  }

  function confirmCode(){
    var code = String(PH.code.value || "").replace(/\D/g, "");
    if(code.length < 6){
      phMsg("Enter the 6-digit code from the SMS.", "bad");
      return;
    }
    phBusy(true, "Checking\u2026");

    PH.confirmation.confirm(code).then(function(result){
      /*
        The ID token in memory was minted before the link and does not
        carry the number. Force a refresh, or the very next request tells
        the server there is still no phone on this account — which is
        exactly the request the student verified in order to make work.
      */
      var user = (result && result.user) || activeUser();
      return user ? user.getIdToken(true) : "";
    }).then(function(){
      phBusy(false);
      phMsg("Verified. Thanks.", "ok");
      setTimeout(function(){ finishPhone(true); }, 700);
    }).catch(function(err){
      phBusy(false);
      phMsg(phoneError(err), "bad");
    });
  }

  function phoneError(err){
    var code = (err && err.code) || "";
    if(code === "auth/invalid-verification-code"){ return "That code didn\u2019t match. Check the SMS and try again."; }
    if(code === "auth/code-expired"){ return "That code expired. Send a new one."; }
    if(code === "auth/invalid-phone-number"){ return "That doesn\u2019t look like a valid mobile number."; }
    if(code === "auth/too-many-requests"){ return "Too many attempts from this device. Please wait a few minutes."; }
    if(code === "auth/provider-already-linked"){ return "This account already has a verified number."; }
    /* The number is on somebody else's account. Said plainly, because
       the honest reason — one number, one account — is also the rule,
       and a student who shares a phone with a sibling needs to know
       that rather than be told to try again. */
    if(code === "auth/credential-already-in-use" || code === "auth/account-exists-with-different-credential"){
      return "That number is already verified on another Lume Live account. Each number can only be used once.";
    }
    if(code === "auth/captcha-check-failed" || code === "auth/internal-error"){
      return "We couldn\u2019t run the security check. Reload the page and try once more.";
    }
    return "We couldn\u2019t verify that number. Please try again in a moment.";
  }

  /*
     Opens the panel and resolves true only once a number is actually
     verified. Resolves false when the student closes it or taps
     “Not now” — the caller decides what that means, and nothing
     here treats it as an error.
  */
  function verifyPhone(){
    var existing = activeUser();
    if(existing && existing.phoneNumber){ return Promise.resolve(true); }
    if(!existing){ return Promise.resolve(false); }

    buildPhonePanel();
    PH.step = "number";
    PH.numField.style.display = "";
    PH.codeField.style.display = "none";
    PH.num.value = "";
    phBusy(false, "Send code");
    phMsg("", "");

    EL.title.textContent = "Verify your mobile number";
    EL.sub.textContent = "One SMS. It confirms you\u2019re a real person.";

    EL.body = EL.body || EL.overlay.querySelector(".la-body:not(.lv-body)");
    EL.body.style.display = "none";
    if(VER.body){ VER.body.style.display = "none"; }
    PH.body.style.display = "";
    EL.overlay.classList.add("la-open");
    try{ PH.num.focus(); }catch(err){}

    return new Promise(function(resolve){ PH.resolve = resolve; });
  }

  function phoneNumber(){
    var u = activeUser();
    return (u && u.phoneNumber) || "";
  }

  /*
    Every page's Login and Create Account button already calls
    openAuth(). Three pages define their own — an email-and-password
    modal from before this existed — and this file is loaded after them,
    so claiming the name here is what actually retires those forms. It
    is re-claimed on DOMContentLoaded in case a page defines its own
    later in the parse.
  */
  function claimOpenAuth(){
    if(window.openAuth === openFallback){ return; }
    window.openAuth = openFallback;
  }
  claimOpenAuth();
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", claimOpenAuth);
  }
  window.addEventListener("load", claimOpenAuth);

  window.lumeAccount = {
    ready: ready,
    current: function(){ return currentUser; },
    prompt: prompt,
    onSignIn: onSignIn,
    token: token,
    verifyPhone: verifyPhone,
    // The same modal the page buttons open, for anything that wants it
    // by name rather than through prompt().
    open: openFallback,
    phone: phoneNumber,
    // Shown by the pages that run their own sign-up UI, so the guidance
    // after creating an account is the same everywhere.
    verifyHelp: showVerifyHelp
  };
})();
