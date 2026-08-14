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
       window.lumeAccount.prompt()   -> opens whatever sign-in UI exists
       window.lumeAccount.onSignIn(fn) -> called once, when a user appears
       window.lumeAccount.token()    -> Promise<idToken|"">

     Where the page already has its own modal, that is what opens —
     this does not replace a working sign-in flow, it just gives the
     checkout one number to call. Pages without one get the fallback
     form below.

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
     Opens the page's own sign-in UI when it has one, so a client sees
     the form they'd see anywhere else on that page. Only pages with no
     sign-in of their own fall through to the form below. */
  function prompt(mode){
    if(typeof window.openAuth === "function"){
      try{ window.openAuth(mode || "signup"); return; }catch(err){}
    }
    openFallback(mode || "signup");
  }

  /* ============================================================
     Fallback sign-in / sign-up form

     Only used on pages that have no auth UI of their own. Deliberately
     small: an account here exists so a purchase has an owner, so it
     asks for the least that makes that true.
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
".la-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:48px;border:0;border-radius:999px;font-size:.94rem;font-weight:800;cursor:pointer;font-family:inherit;margin-bottom:10px}",
".la-btn.gold{background:linear-gradient(135deg,#C9933A,#E8B95A);color:#0D1B40;box-shadow:0 10px 26px rgba(201,147,58,.32)}",
".la-btn.gold:disabled{opacity:.6;cursor:default;box-shadow:none}",
".la-alt{background:none;border:0;width:100%;font-family:inherit;font-size:.84rem;color:#33425c;cursor:pointer;padding:6px}",
".la-alt b{color:#0D1B40}",
".la-err{margin:0 0 12px;padding:10px 12px;border-radius:11px;background:#FDECEC;color:#933;font-size:.82rem;line-height:1.45;display:none}",
".la-err.on{display:block}",
".la-note{margin:12px 0 0;font-size:.72rem;line-height:1.5;color:#8493ab;text-align:center}"
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
          '<p class="la-sub">Your report, session and receipts stay with your account — on any device.</p>' +
        '</div>' +
        '<div class="la-body">' +
          '<p class="la-err"></p>' +
          '<div class="la-field la-name-field"><label for="laName">Full name</label><input id="laName" type="text" autocomplete="name"></div>' +
          '<div class="la-field"><label for="laEmail">Email</label><input id="laEmail" type="email" autocomplete="email"></div>' +
          '<div class="la-field"><label for="laPassword">Password</label><input id="laPassword" type="password" autocomplete="current-password"></div>' +
          '<button class="la-btn gold la-submit" type="button">Create account</button>' +
          '<button class="la-alt" type="button">Already have an account? <b>Sign in</b></button>' +
          '<p class="la-note">We only use this to deliver what you paid for.</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(o);
    EL.overlay = o;
    EL.title = o.querySelector(".la-title");
    EL.sub = o.querySelector(".la-sub");
    EL.err = o.querySelector(".la-err");
    EL.nameField = o.querySelector(".la-name-field");
    EL.name = o.querySelector("#laName");
    EL.email = o.querySelector("#laEmail");
    EL.password = o.querySelector("#laPassword");
    EL.submit = o.querySelector(".la-submit");
    EL.alt = o.querySelector(".la-alt");

    o.querySelector(".la-x").addEventListener("click", closeFallback);
    o.addEventListener("click", function(e){ if(e.target === o){ closeFallback(); } });
    EL.alt.addEventListener("click", function(){ openFallback(EL.mode === "signup" ? "signin" : "signup"); });
    EL.submit.addEventListener("click", submit);
    [EL.name, EL.email, EL.password].forEach(function(input){
      input.addEventListener("keydown", function(e){ if(e.key === "Enter"){ submit(); } });
    });
  }

  function openFallback(mode){
    ensureModal();
    EL.mode = mode === "signin" ? "signin" : "signup";
    var isUp = EL.mode === "signup";
    EL.title.textContent = isUp ? "Create your Lume Live account" : "Sign in to continue";
    EL.sub.textContent = isUp
      ? "Your report, session and receipts stay with your account — on any device."
      : "Welcome back. Sign in to complete your payment.";
    EL.nameField.style.display = isUp ? "" : "none";
    EL.submit.textContent = isUp ? "Create account" : "Sign in";
    EL.alt.innerHTML = isUp
      ? "Already have an account? <b>Sign in</b>"
      : "New to Lume Live? <b>Create an account</b>";
    EL.password.setAttribute("autocomplete", isUp ? "new-password" : "current-password");
    showError("");
    EL.overlay.classList.add("la-open");
    setTimeout(function(){ (isUp ? EL.name : EL.email).focus(); }, 60);
  }

  function closeFallback(){
    if(EL.overlay){ EL.overlay.classList.remove("la-open"); }
  }

  function showError(message){
    if(!EL.err){ return; }
    EL.err.textContent = message || "";
    EL.err.classList.toggle("on", Boolean(message));
  }

  function messageFor(error){
    switch(error && error.code){
      case "auth/email-already-in-use": return "An account already exists for this email. Please sign in instead.";
      case "auth/invalid-email":        return "Please enter a valid email address.";
      case "auth/weak-password":        return "Choose a stronger password with at least 6 characters.";
      case "auth/invalid-credential":
      case "auth/user-not-found":
      case "auth/wrong-password":       return "The email or password is incorrect.";
      case "auth/too-many-requests":    return "Too many attempts. Please wait a little while and try again.";
      case "auth/network-request-failed": return "Network connection failed. Please check your internet and try again.";
      default: return "We could not complete your account request. Please try again.";
    }
  }

  function submit(){
    var isUp = EL.mode === "signup";
    var name = (EL.name.value || "").trim();
    var email = (EL.email.value || "").trim();
    var password = EL.password.value || "";

    if(isUp && !name){ return showError("Please enter your name."); }
    if(!email){ return showError("Please enter your email address."); }
    if(!password){ return showError("Please enter a password."); }
    if(isUp && password.length < 6){ return showError("Choose a password with at least 6 characters."); }

    showError("");
    EL.submit.disabled = true;
    EL.submit.textContent = isUp ? "Creating your account…" : "Signing you in…";

    ensureAuth().then(function(auth){
      watch(auth);
      if(!isUp){
        return authMod.signInWithEmailAndPassword(auth, email, password);
      }
      return authMod.createUserWithEmailAndPassword(auth, email, password).then(function(result){
        return authMod.updateProfile(result.user, { displayName: name }).then(function(){
          // Sent, but never required to pay — a client who has not opened
          // their inbox yet is still a client who wants to buy something.
          return authMod.sendEmailVerification(result.user).catch(function(){});
        }).then(function(){ return result; });
      });
    }).then(function(){
      closeFallback();
    }).catch(function(err){
      showError(messageFor(err));
    }).then(function(){
      EL.submit.disabled = false;
      EL.submit.textContent = isUp ? "Create account" : "Sign in";
    });
  }

  window.lumeAccount = {
    ready: ready,
    current: function(){ return currentUser; },
    prompt: prompt,
    onSignIn: onSignIn,
    token: token
  };
})();
