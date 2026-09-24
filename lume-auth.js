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
     is the one place that knows how to get a signed-in user:

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
     One sign-in for the whole site, and it is the one below.
     `openAuth` is claimed below for the same reason: every Login /
     Create Account button on the site already calls it. */
  function prompt(mode){
    openFallback(mode || "signup");
  }

  /* ============================================================
     Sign in / sign up — Google, or an email address and a password

     One card, laid out the same way in both directions: Google first,
     then "or enter details", then the fields. "Sign in" and "Sign up"
     swap in place from the line under the button, so someone who
     picked the wrong one never has to close anything.

     Email and password is Firebase's own provider, so nothing
     downstream changes: after either route there is an ordinary
     Firebase user with an ordinary ID token, and api/_lib/account.js
     verifies it exactly as it always has. A Google sign-in and a
     password sign-in for one address are the same account (Firebase's
     "link accounts that use the same email" default).

     The emailed six-digit code this used to use (/api/auth/send-code,
     /api/auth/verify-code) still exists on the server; it is in the
     history of this file if it is ever wanted back.
     ============================================================ */
  var EL = {};

  // Google's "G", as their branding guidelines ask for it: four colours,
  // on white, left of the words.
  var GOOGLE_G = '<svg viewBox="0 0 48 48" aria-hidden="true">' +
    '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
    '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
    '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
    '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>' +
    '</svg>';

  // Line icons for the fields — stroke only, so they take the field's colour.
  function icon(paths){
    return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  }
  var ICON_BACK = icon('<path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/>');
  var ICON_MAIL = icon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>');
  var ICON_LOCK = icon('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>');
  var ICON_USER = icon('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>');
  var ICON_EYE  = icon('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>');
  var ICON_EYE_OFF = icon('<path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>');

  function injectStyles(){
    if(document.getElementById("la-styles")){ return; }
    /* Comfortaa, the rounded face the card was designed in. Loaded only
       when the card is first opened; until it arrives (or if it never
       does) the card falls back to the page's own fonts. */
    if(!document.getElementById("la-font")){
      var f = document.createElement("link");
      f.id = "la-font";
      f.rel = "stylesheet";
      f.href = "https://fonts.googleapis.com/css2?family=Comfortaa:wght@400;500;600;700&display=swap";
      document.head.appendChild(f);
    }
    var css = [
".la-overlay{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.45);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}",
".la-overlay.la-open{display:flex}",
".la-card{width:min(420px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:28px;box-shadow:0 30px 80px rgba(15,23,42,.22);font-family:'Comfortaa','Montserrat','Segoe UI',system-ui,Arial,sans-serif;color:#111827;box-sizing:border-box;padding:30px 26px 28px}",
".la-hd{margin-bottom:22px}",
".la-hd-row{display:flex;align-items:center;gap:14px}",
".la-hd h3{margin:0;font-size:1.55rem;font-weight:700;letter-spacing:-.01em;color:#111827;line-height:1.2}",
".la-hd p{margin:10px 0 0;font-size:.92rem;color:#6B7280;line-height:1.5}",
".la-x{flex:none;display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;border:0;background:#F3F4F6;color:#111827;cursor:pointer;box-shadow:0 4px 12px rgba(15,23,42,.12);padding:0}",
".la-x:hover{background:#E5E7EB}",
".la-x svg{width:20px;height:20px;stroke-width:2.4}",
".la-body{padding:0}",
".la-field{margin-bottom:18px}",
".la-field label{display:block;font-size:.8rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#1F2937;margin:0 0 8px 4px}",
".la-field input{width:100%;box-sizing:border-box;padding:14px 16px;border:1px solid #E5E7EB;border-radius:14px;font-size:.95rem;font-family:inherit;color:#111827;background:#F8FAFC;transition:border-color .15s,background .15s,box-shadow .15s}",
".la-field input::placeholder{color:#9CA3AF}",
".la-field input:focus{outline:0;border-color:#111827;background:#fff;box-shadow:0 0 0 3px rgba(17,24,39,.08)}",
/* A field with an icon on the left (and on the password one, the eye on the right). */
".la-in{position:relative}",
".la-in > svg{position:absolute;left:16px;top:50%;transform:translateY(-50%);width:19px;height:19px;color:#6B7280;pointer-events:none}",
".la-in input{padding-left:48px}",
".la-in.la-pw input{padding-right:50px}",
".la-eye{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:38px;height:38px;display:flex;align-items:center;justify-content:center;border:0;background:none;color:#4B5563;cursor:pointer;border-radius:10px;padding:0}",
".la-eye:hover{background:#EEF2F7}",
".la-eye svg{width:20px;height:20px}",
".la-forgot{display:block;margin:-8px 0 20px auto;background:none;border:0;padding:4px;font-family:inherit;font-size:.84rem;font-weight:500;color:#1D4ED8;cursor:pointer}",
".la-forgot:hover{text-decoration:underline}",
".la-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:54px;border:0;border-radius:14px;font-size:1rem;font-weight:600;cursor:pointer;font-family:inherit;margin-bottom:10px}",
/* `gold` is the old name for the primary button; the verify and phone
   panels still use it, and they should look like the rest of the card. */
".la-btn.gold,.la-btn.primary{background:#111827;color:#fff;box-shadow:0 10px 24px rgba(17,24,39,.22)}",
".la-btn.gold:hover,.la-btn.primary:hover{background:#1F2937}",
".la-btn.gold:disabled,.la-btn.primary:disabled{opacity:.6;cursor:default;box-shadow:none}",
".la-switch{margin:18px 0 0;text-align:center;font-size:.92rem;color:#374151}",
".la-switch button{background:none;border:0;padding:0 0 0 2px;font-family:inherit;font-size:inherit;font-weight:600;color:#1D4ED8;cursor:pointer}",
".la-switch button:hover{text-decoration:underline}",
".la-alt{background:none;border:0;width:100%;font-family:inherit;font-size:.86rem;color:#374151;cursor:pointer;padding:6px}",
".la-alt b{color:#1D4ED8;font-weight:600}",
".la-alt:disabled{opacity:.55;cursor:default}",
".la-err{margin:0 0 16px;padding:11px 13px;border-radius:12px;background:#FEF2F2;color:#B91C1C;font-size:.84rem;line-height:1.45;display:none}",
".la-err.on{display:block}",
".la-note{margin:14px 0 0;font-size:.74rem;line-height:1.5;color:#9CA3AF;text-align:center}",
".la-sent{margin:0 0 16px;padding:11px 13px;border-radius:12px;background:#ECFDF5;color:#047857;font-size:.84rem;line-height:1.45;display:none}",
".la-sent.on{display:block}",
".la-sent b{word-break:break-all}",
/* The "check your inbox" panel. Shares the card, so it reads as the next
   step of the same flow rather than a different screen. */
".lv-mark{width:48px;height:48px;margin:0 auto 12px;border-radius:50%;background:#F3F4F6;display:flex;align-items:center;justify-content:center;font-size:1.5rem}",
".lv-to{margin:0 0 14px;text-align:center;font-size:.95rem;line-height:1.55;color:#111827}",
".lv-to b{display:block;margin-top:4px;font-size:1rem;color:#111827;word-break:break-all}",
".lv-steps{margin:0 0 14px;padding:0;list-style:none;counter-reset:lv}",
".lv-steps li{position:relative;counter-increment:lv;padding:0 0 10px 34px;font-size:.86rem;line-height:1.5;color:#374151}",
".lv-steps li:before{content:counter(lv);position:absolute;left:0;top:-1px;width:23px;height:23px;border-radius:50%;background:#F3F4F6;color:#111827;font-size:.72rem;font-weight:800;display:flex;align-items:center;justify-content:center}",
".lv-steps b{color:#111827}",
/* The spam line is the single most useful sentence on this panel, so it
   is not a footnote — most "I never got the email" reports end here. */
".lv-spam{margin:0 0 14px;padding:11px 13px;border-radius:12px;background:#FFF8E8;border:1px solid #F2E2BC;font-size:.82rem;line-height:1.55;color:#6B5524}",
".lv-spam b{color:#111827}",
".lv-row{display:flex;gap:9px;margin-bottom:10px}",
".lv-row .la-btn{margin-bottom:0}",
".la-btn.ghost{background:#fff;border:1px solid #E5E7EB;color:#111827;box-shadow:none}",
".la-btn.ghost:disabled{opacity:.55;cursor:default}",
".lv-msg{margin:0 0 10px;padding:10px 12px;border-radius:11px;font-size:.82rem;line-height:1.45;display:none}",
".lv-msg.on{display:block}",
".lv-msg.ok{background:#ECFDF5;color:#047857}",
".lv-msg.bad{background:#FEF2F2;color:#B91C1C}",
".la-google{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;min-height:54px;border:1px solid #E5E7EB;border-radius:14px;background:#fff;color:#1F2937;font-size:.98rem;font-weight:500;font-family:inherit;cursor:pointer;box-shadow:0 2px 6px rgba(15,23,42,.08)}",
".la-google:hover{background:#F9FAFB}",
".la-google:disabled{opacity:.6;cursor:default}",
".la-google svg{width:20px;height:20px;flex:none}",
".la-or{display:flex;align-items:center;gap:14px;margin:24px 0 22px;font-size:.78rem;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#9CA3AF}",
".la-or:before,.la-or:after{content:\"\";flex:1;height:1px;background:#E5E7EB}",
"@media(max-width:420px){.la-card{padding:26px 20px 24px;border-radius:24px}.la-hd h3{font-size:1.35rem}.lv-row{flex-direction:column}}"
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
          '<div class="la-hd-row">' +
            '<button class="la-x" type="button" aria-label="Back">' + ICON_BACK + '</button>' +
            '<h3 class="la-title">Welcome back</h3>' +
          '</div>' +
          '<p class="la-sub">Enter your credentials to access your account</p>' +
        '</div>' +
        '<div class="la-body">' +
          '<p class="la-err" role="alert"></p>' +
          '<p class="la-sent"></p>' +
          '<div class="la-google-wrap">' +
            '<button class="la-google" type="button">' + GOOGLE_G + '<span>Continue with Google</span></button>' +
            '<div class="la-or">Or enter details</div>' +
          '</div>' +
          '<div class="la-field la-name-field"><label for="laName">Full name</label>' +
            '<div class="la-in">' + ICON_USER + '<input id="laName" type="text" autocomplete="name" placeholder="Your name" maxlength="80"></div></div>' +
          '<div class="la-field la-email-field"><label for="laEmail2">Email</label>' +
            '<div class="la-in">' + ICON_MAIL + '<input id="laEmail2" type="email" inputmode="email" autocomplete="email" placeholder="name@example.com" maxlength="254"></div></div>' +
          '<div class="la-field la-pw-field"><label for="laPass">Password</label>' +
            '<div class="la-in la-pw">' + ICON_LOCK + '<input id="laPass" type="password" autocomplete="current-password" placeholder="Password" maxlength="128">' +
              '<button class="la-eye" type="button" aria-label="Show password">' + ICON_EYE + '</button></div></div>' +
          '<button class="la-forgot" type="button">Forgot password?</button>' +
          '<button class="la-btn primary la-submit" type="button">Sign in</button>' +
          '<button class="la-alt la-signout" type="button" style="display:none">Not you? <b>Sign out</b></button>' +
          '<p class="la-switch"><span class="la-switch-q">Don’t have an account?</span> <button type="button" class="la-switch-go">Sign up</button></p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(o);
    EL.overlay = o;
    EL.title = o.querySelector(".la-title");
    EL.sub = o.querySelector(".la-sub");
    EL.back = o.querySelector(".la-x");
    EL.err = o.querySelector(".la-err");
    EL.sent = o.querySelector(".la-sent");
    EL.nameField = o.querySelector(".la-name-field");
    EL.emailField = o.querySelector(".la-email-field");
    EL.pwField = o.querySelector(".la-pw-field");
    EL.name = o.querySelector("#laName");
    EL.email = o.querySelector("#laEmail2");
    EL.pass = o.querySelector("#laPass");
    EL.eye = o.querySelector(".la-eye");
    EL.forgot = o.querySelector(".la-forgot");
    EL.submit = o.querySelector(".la-submit");
    EL.signout = o.querySelector(".la-signout");
    EL.switchLine = o.querySelector(".la-switch");
    EL.switchQ = o.querySelector(".la-switch-q");
    EL.switchGo = o.querySelector(".la-switch-go");
    EL.googleWrap = o.querySelector(".la-google-wrap");
    EL.google = o.querySelector(".la-google");
    EL.google.addEventListener("click", signInWithGoogle);

    /* The arrow is "back": out of the reset-password step to where the
       person was, otherwise out of the card. It is registered first, so
       on the reset step it can stop the phone panel's own close handler
       (added to the same button) from closing the card as well. */
    EL.back.addEventListener("click", function(e){
      if(EL.step === "reset" && EL.body && EL.body.style.display !== "none"){
        e.stopImmediatePropagation();
        showStep(EL.mode);
        return;
      }
      closeFallback();
    });
    o.addEventListener("click", function(e){ if(e.target === o){ closeFallback(); } });
    EL.submit.addEventListener("click", submit);
    EL.forgot.addEventListener("click", function(){ showStep("reset"); });
    EL.switchGo.addEventListener("click", function(){
      EL.mode = EL.step === "signup" ? "signin" : "signup";
      showStep(EL.mode);
    });
    EL.eye.addEventListener("click", function(){
      var show = EL.pass.type === "password";
      EL.pass.type = show ? "text" : "password";
      EL.eye.innerHTML = show ? ICON_EYE_OFF : ICON_EYE;
      EL.eye.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
    EL.signout.addEventListener("click", signOutNow);
    [EL.name, EL.email, EL.pass].forEach(function(input){
      input.addEventListener("keydown", function(e){ if(e.key === "Enter"){ submit(); } });
    });
  }

  /* A plausible address, not a valid one — Firebase has the final say. */
  function cleanEmail(raw){
    return String(raw || "").trim().toLowerCase();
  }

  function looksLikeEmail(raw){
    var value = cleanEmail(raw);
    if(value.length < 6 || /\s/.test(value)){ return false; }
    var at = value.indexOf("@");
    if(at < 1 || at !== value.lastIndexOf("@")){ return false; }
    var domain = value.slice(at + 1);
    return domain.indexOf(".") > 0 && domain.charAt(domain.length - 1) !== ".";
  }

  var BUTTON_LABEL = {
    signin: "Sign in",
    signup: "Create account",
    reset: "Send reset link",
    account: "Done"
  };

  /* Four states of one card: sign in, sign up, reset password, and —
     for someone already signed in — who they are and how to leave. */
  function showStep(step){
    EL.step = step;
    var onIn    = step === "signin";
    var onUp    = step === "signup";
    var onReset = step === "reset";
    var onAcct  = step === "account";

    EL.googleWrap.style.display = (onIn || onUp) ? "" : "none";
    EL.nameField.style.display  = onUp ? "" : "none";
    EL.emailField.style.display = onAcct ? "none" : "";
    EL.pwField.style.display    = (onIn || onUp) ? "" : "none";
    EL.forgot.style.display     = onIn ? "" : "none";
    EL.switchLine.style.display = (onIn || onUp) ? "" : "none";
    EL.signout.style.display    = onAcct ? "" : "none";
    EL.pass.setAttribute("autocomplete", onUp ? "new-password" : "current-password");
    EL.pass.setAttribute("placeholder", onUp ? "At least 6 characters" : "Password");
    EL.back.setAttribute("aria-label", onReset ? "Back to sign in" : "Close");
    EL.submit.textContent = BUTTON_LABEL[step];

    if(onIn){
      EL.title.textContent = "Welcome back";
      EL.sub.textContent = "Enter your credentials to access your account";
      EL.switchQ.textContent = "Don’t have an account?";
      EL.switchGo.textContent = "Sign up";
      showSent("");
    } else if(onUp){
      EL.title.textContent = "Create account";
      EL.sub.textContent = "Your report, session and receipts stay with your account — on any device.";
      EL.switchQ.textContent = "Already have an account?";
      EL.switchGo.textContent = "Sign in";
      showSent("");
    } else if(onReset){
      EL.title.textContent = "Reset password";
      EL.sub.textContent = "Enter your email and we’ll send you a link to set a new password.";
      showSent("");
    } else if(onAcct){
      var u = activeUser();
      EL.title.textContent = "You’re signed in";
      EL.sub.textContent = (u && u.displayName) ? u.displayName : "Your purchases follow this account.";
      showSent(u && u.email
        ? "Signed in as <b>" + esc(u.email) + "</b>"
        : (u && u.phoneNumber ? "Signed in as <b>" + esc(u.phoneNumber) + "</b>" : ""));
    }

    showError("");
    EL.submit.disabled = false;
    setTimeout(function(){
      try{
        if(onUp){ EL.name.focus(); }
        else if(onIn || onReset){ EL.email.focus(); }
        else { EL.submit.focus(); }
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
    EL.pass.value = "";
    EL.pass.type = "password";
    EL.eye.innerHTML = ICON_EYE;
    /* The same button says Login and then Account. Re-asking a signed-in
       client for the address they signed in with reads as being logged
       out, so they get told who they are and how to leave instead. */
    showStep(activeUser() ? "account" : EL.mode);
    EL.overlay.classList.add("la-open");
    // Start loading Firebase now, so that by the time "Continue with
    // Google" is tapped the popup can open inside the tap itself —
    // a popup opened after a slow import is one a browser blocks.
    ensureAuth().then(function(auth){ readyAuth = auth; watch(auth); }).catch(function(){});
  }

  function closeFallback(){
    if(EL.overlay){ EL.overlay.classList.remove("la-open"); }
  }

  /* The red and green banners are mutually exclusive, enforced here
     rather than remembered at every call site: a card saying two
     opposite things at once leaves the person to guess. */
  function showError(message){
    if(!EL.err){ return; }
    EL.err.textContent = message || "";
    EL.err.classList.toggle("on", Boolean(message));
    if(message && EL.sent){
      EL.sent.innerHTML = "";
      EL.sent.classList.remove("on");
    }
  }

  function showSent(html){
    if(!EL.sent){ return; }
    EL.sent.innerHTML = html || "";
    EL.sent.classList.toggle("on", Boolean(html));
    if(html && EL.err){
      EL.err.textContent = "";
      EL.err.classList.remove("on");
    }
  }

  function submit(){
    if(EL.submit.disabled){ return; }
    if(EL.step === "account"){ return closeFallback(); }
    if(EL.step === "reset"){ return sendReset(); }
    return signInWithPassword(EL.step === "signup");
  }

  /* Firebase's error codes, in words. The code goes on the card too
     (see signInWithGoogle): a screenshot of it is the whole bug report. */
  function passwordError(err, creating){
    var code = (err && err.code) || "";
    try{ console.error("[lume auth] email sign-in failed:", code || (err && err.message)); }catch(e){}
    switch(code){
      case "auth/invalid-credential":
      case "auth/invalid-login-credentials":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "That email and password don’t match. Try again, or use “Forgot password?”.";
      case "auth/email-already-in-use":
        return "There’s already an account with this email. Sign in instead — or use Continue with Google if you made it that way.";
      case "auth/weak-password":
        return "Please choose a password of at least 6 characters.";
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/user-disabled":
        return "This account has been switched off. Please message us on WhatsApp.";
      case "auth/too-many-requests":
        return "Too many attempts. Please wait a few minutes and try again.";
      case "auth/network-request-failed":
        return "We couldn’t reach Lume Live. Check your connection and try again.";
      case "auth/operation-not-allowed":
        return "Email sign-in isn’t switched on yet. Please use Continue with Google for now.";
      default:
        return creating
          ? "We couldn’t create your account just now. Please try again in a moment."
          : "We couldn’t sign you in just now. Please try again in a moment.";
    }
  }

  function busy(on, label){
    EL.submit.disabled = Boolean(on);
    EL.submit.textContent = on ? label : BUTTON_LABEL[EL.step];
  }

  function signInWithPassword(creating){
    var name = (EL.name.value || "").trim();
    var email = cleanEmail(EL.email.value);
    var pass = EL.pass.value || "";

    if(creating && !name){ return showError("Please enter your name."); }
    if(!looksLikeEmail(email)){ return showError("Please enter a valid email address."); }
    if(!pass){ return showError("Please enter your password."); }
    if(creating && pass.length < 6){ return showError("Please choose a password of at least 6 characters."); }

    showError("");
    busy(true, creating ? "Creating account…" : "Signing in…");

    ensureAuth().then(function(auth){
      watch(auth);
      return creating
        ? authMod.createUserWithEmailAndPassword(auth, email, pass)
        : authMod.signInWithEmailAndPassword(auth, email, pass);
    }).then(function(result){
      var user = (result && result.user) || activeUser();
      currentUser = user || currentUser;
      window.currentFirebaseUser = currentUser;
      if(!creating || !user){
        busy(false);
        closeFallback();
        return;
      }
      /* A new account: put the name on it, then send the verification
         link and say where it went. The name is set before anything else
         reads the profile, and the ID token refreshed so the server sees
         it too. Neither failing is a reason to undo the sign-up. */
      return authMod.updateProfile(user, { displayName: name })
        .then(function(){ relabelNav(user); return user.getIdToken(true); })
        .catch(function(){})
        .then(function(){
          return authMod.sendEmailVerification(user).then(function(){ return true; }, function(){ return false; });
        })
        .then(function(sent){
          busy(false);
          lastResendAt = sent ? Date.now() : 0;
          showVerifyHelp({ email: email, sent: sent });
        });
    }).catch(function(err){
      busy(false);
      var message = passwordError(err, creating);
      var code = (err && err.code) || "";
      showError(code && message.indexOf(code) < 0 ? message + " (" + code + ")" : message);
    });
  }

  /* The pages with a Login link in the nav show the person's first name
     there once they are signed in. They redraw it when Firebase reports
     the sign-in — which, for a new account, is a moment before the name
     above has been saved — so it is redrawn once more when it has. */
  function relabelNav(user){
    try{
      if(typeof window.renderAuthUser === "function"){ window.renderAuthUser(user); }
    }catch(err){}
  }

  function sendReset(){
    var email = cleanEmail(EL.email.value);
    if(!looksLikeEmail(email)){ return showError("Please enter the email you signed up with."); }
    showError("");
    busy(true, "Sending…");
    ensureAuth().then(function(auth){
      return authMod.sendPasswordResetEmail(auth, email);
    }).then(function(){
      busy(false);
      /* Firebase answers the same whether or not the address has an
         account, and so does this — it is not a way to find out who
         has one. */
      showSent("If <b>" + esc(email) + "</b> has a Lume Live account, a reset link is on its way. Check Spam if it’s not there.");
    }).catch(function(err){
      busy(false);
      var code = (err && err.code) || "";
      if(code === "auth/user-not-found"){
        showSent("If <b>" + esc(email) + "</b> has a Lume Live account, a reset link is on its way. Check Spam if it’s not there.");
        return;
      }
      showError(passwordError(err, false));
    });
  }

  /* ============================================================
     Continue with Google

     One tap, no password. Google has already checked the address, so
     the account arrives with emailVerified: true and api/_lib/account.js
     and restore-access treat it like any other.

     A popup, never a redirect: the redirect flow round-trips through
     lume-live-cf865.firebaseapp.com, and browsers that partition
     third-party storage (Safari, Chrome's newer defaults) lose the
     result on the way back unless the site proxies /__/auth. The popup
     has no such problem. If it is blocked, the person is told how to
     allow it.
     ============================================================ */
  var readyAuth = null;

  function googleError(err){
    var code = (err && err.code) || "";
    try{ console.error("[lume auth] Google sign-in failed:", code || (err && err.message)); }catch(e){}
    switch(code){
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
      case "auth/user-cancelled":
        return "";
      case "auth/popup-blocked":
        return "Your browser blocked the Google window. Allow pop-ups for this site and try again.";
      case "auth/unauthorized-domain":
        return "Google sign-in isn’t enabled for this web address yet. Please message us on WhatsApp and we’ll help.";
      case "auth/operation-not-allowed":
        return "Google sign-in isn’t switched on yet. Please message us on WhatsApp and we’ll help.";
      case "auth/network-request-failed":
        return "We couldn’t reach Google. Check your connection and try again.";
      case "auth/account-exists-with-different-credential":
        return "This email already has a Lume Live account under a different sign-in. Please message us on WhatsApp and we’ll sort it out.";
      default:
        return "Google sign-in didn’t work just now. Please try again in a moment.";
    }
  }

  function signInWithGoogle(){
    if(EL.google.disabled){ return; }
    showError("");
    EL.google.disabled = true;

    function popup(auth){
      readyAuth = auth;
      watch(auth);
      var provider = new authMod.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      return authMod.signInWithPopup(auth, provider);
    }

    // With Firebase already loaded (the usual case — opening the card
    // started it) the popup opens synchronously, inside the click.
    var attempt;
    try{
      attempt = readyAuth && authMod ? popup(readyAuth) : ensureAuth().then(popup);
    }catch(err){
      attempt = Promise.reject(err);
    }

    attempt.then(function(result){
      var user = (result && result.user) || activeUser();
      currentUser = user || currentUser;
      window.currentFirebaseUser = currentUser;
      EL.google.disabled = false;
      showSent("");
      closeFallback();
    }).catch(function(err){
      EL.google.disabled = false;
      var message = googleError(err);
      // The code goes on the card too: a screenshot of it is the whole
      // bug report, and "didn't work" alone could be any of a dozen things.
      var code = (err && err.code) || "";
      if(message){ showError(code ? message + " (" + code + ")" : message); }
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
      EL.pass.value = "";
      showStep("signin");
    }).catch(function(){
      EL.signout.disabled = false;
      showError("We could not sign you out just now. Please try again.");
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

  /* Firebase wants E.164. Indian numbers arrive as ten digits, with a
     leading zero, or already prefixed, and all three are the same number
     to the person typing. Only this panel needs it now that signing in
     is an address. */
  function toE164(raw){
    var digits = String(raw || "").replace(/\D/g, "");
    if(digits.length < 10){ return ""; }
    return "+91" + digits.slice(-10);
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
