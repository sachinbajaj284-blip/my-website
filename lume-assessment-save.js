/*
  Lume Live — saving a finished assessment to the client's account.

  assessment.html has always scored in the browser and kept the result in
  localStorage. That is fine right up until somebody clears site data,
  finishes the test on a phone and books the session from a laptop, or
  simply comes back a month later — and it is no use at all to the
  counsellor writing their report, who currently starts from a blank page
  with a profile that was computed and then discarded.

  This offers to keep it. Three rules shape the whole file.

  IT ASKS. The checkbox starts unchecked and the Save button does nothing
  until it is ticked. A pre-ticked box is not consent, and this is a
  psychometric profile, frequently belonging to a minor. If somebody
  ignores the card entirely, nothing is stored and the report on screen
  is exactly as complete as it was before.

  IT NEVER BLOCKS THE REPORT. The card is appended after the report has
  rendered. Every failure path here — offline, signed out, server down,
  the endpoint not deployed yet — ends with the report still on screen
  and the result still in localStorage. Saving is a bonus, not a step.

  IT CAN BE UNDONE. Whatever we ask somebody to agree to, they can take
  back from the same card, which is why /api/assessment/delete exists.
*/
(function(){
  "use strict";

  var CARD_ID = "lumeSaveCard";
  var API_SAVE = "/api/assessment/save";
  var API_DELETE = "/api/assessment/delete";

  function el(tag, className, text){
    var node = document.createElement(tag);
    if(className) node.className = className;
    if(text != null) node.textContent = text;
    return node;
  }

  function injectStyles(){
    if(document.getElementById("lumeSaveStyles")) return;
    var css = document.createElement("style");
    css.id = "lumeSaveStyles";
    css.textContent = [
      "#" + CARD_ID + "{margin:28px 0 8px;padding:20px 22px;border:1px solid #E2E8F0;border-radius:14px;background:#F8FAFC;font-family:inherit}",
      "#" + CARD_ID + " h4{margin:0 0 6px;font-size:1rem;font-weight:700;color:#0D1B40}",
      "#" + CARD_ID + " p{margin:0 0 14px;font-size:.88rem;line-height:1.55;color:#4A5568}",
      "#" + CARD_ID + " label{display:flex;gap:10px;align-items:flex-start;font-size:.88rem;line-height:1.5;color:#1A2C3D;cursor:pointer}",
      "#" + CARD_ID + " input[type=checkbox]{margin-top:3px;width:17px;height:17px;flex:0 0 auto;cursor:pointer}",
      "#" + CARD_ID + " .lsc-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:14px}",
      "#" + CARD_ID + " button{font:inherit;font-size:.87rem;font-weight:600;padding:9px 18px;border-radius:9px;border:0;cursor:pointer;background:#0D1B40;color:#fff}",
      "#" + CARD_ID + " button[disabled]{opacity:.45;cursor:not-allowed}",
      "#" + CARD_ID + " button.lsc-quiet{background:none;color:#7A8899;text-decoration:underline;padding:9px 4px;font-weight:500}",
      "#" + CARD_ID + " .lsc-msg{font-size:.84rem;line-height:1.5;color:#4A5568;margin-top:10px}",
      "#" + CARD_ID + " .lsc-msg.ok{color:#0A6E6E;font-weight:600}",
      "#" + CARD_ID + " .lsc-msg.bad{color:#A0341E}",
      "#" + CARD_ID + " .lsc-fine{font-size:.78rem;color:#7A8899;margin-top:12px;line-height:1.5}",
      "#" + CARD_ID + " a{color:#0A6E6E}"
    ].join("\n");
    document.head.appendChild(css);
  }

  /*
    The profile, from the page's own scoring functions. window.saScores is
    exported by the assessment script; if it isn't there — an old cached
    copy of the page, a script that failed to parse — we simply don't
    offer to save, rather than guessing at a shape.
  */
  function collect(){
    if(typeof window.saScores !== "function") return null;
    try{
      var out = window.saScores();
      if(!out || !out.scores) return null;

      /*
        An unanswered part scores as NaN, and JSON.stringify turns NaN
        into null, which the server rightly refuses. saGenerate won't
        render a report until every part is complete, so this should
        never fire — but offering a Save button that is guaranteed to
        fail is worse than offering nothing.
      */
      var names = Object.keys(out.scores);
      for(var i = 0; i < names.length; i++){
        var group = out.scores[names[i]];
        for(var key in group){
          if(!Object.prototype.hasOwnProperty.call(group, key)) continue;
          if(typeof group[key] !== "number" || !isFinite(group[key])) return null;
        }
      }
      return out;
    }catch(err){ return null; }
  }

  function signedIn(){
    try{
      return Boolean(window.lumeAccount && window.lumeAccount.current && window.lumeAccount.current());
    }catch(err){ return false; }
  }

  function token(){
    if(!window.lumeAccount || typeof window.lumeAccount.token !== "function"){
      return Promise.resolve("");
    }
    return window.lumeAccount.token();
  }

  function post(url, idToken, payload){
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
      body: JSON.stringify(payload)
    }).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(body){
        return { status: res.status, body: body };
      });
    });
  }

  // ── the card ────────────────────────────────────────────────────────

  function build(profile){
    injectStyles();

    var card = el("div", null);
    card.id = CARD_ID;

    card.appendChild(el("h4", null, "Keep this result on your account?"));
    card.appendChild(el("p", null,
      "If you save it, your counsellor can open it before your session instead of starting from scratch, " +
      "and you can see it again on any device. We keep your scores — not your individual answers."));

    var label = el("label");
    var box = document.createElement("input");
    box.type = "checkbox";
    box.id = "lumeSaveConsent";
    label.appendChild(box);
    label.appendChild(el("span", null,
      "Yes, save my assessment scores to my Lume Live account. I can delete them at any time. " +
      "If I am under 18, I have my parent's or guardian's permission."));
    card.appendChild(label);

    var actions = el("div", "lsc-actions");
    var save = el("button", null, "Save to my account");
    save.type = "button";
    save.disabled = true;
    actions.appendChild(save);
    card.appendChild(actions);

    var msg = el("div", "lsc-msg");
    msg.setAttribute("role", "status");
    msg.setAttribute("aria-live", "polite");
    card.appendChild(msg);

    var fine = el("div", "lsc-fine");
    fine.innerHTML = 'Stored against your account and used to prepare your guidance. ' +
                     'See our <a href="privacy-policy.html">privacy policy</a>.';
    card.appendChild(fine);

    function say(text, kind){
      msg.textContent = text || "";
      msg.className = "lsc-msg" + (kind ? " " + kind : "");
    }

    box.addEventListener("change", function(){
      save.disabled = !box.checked;
      if(box.checked) say("");
    });

    function showSaved(){
      box.disabled = true;
      save.remove();
      say("Saved. Your counsellor can see this before your session.", "ok");

      var remove = el("button", "lsc-quiet", "Delete my saved result");
      remove.type = "button";
      remove.addEventListener("click", function(){
        remove.disabled = true;
        say("Deleting…");
        token().then(function(idToken){
          if(!idToken) throw new Error("signed out");
          return post(API_DELETE, idToken, { confirm: true });
        }).then(function(res){
          if(res.status === 200 && res.body.deleted){
            remove.remove();
            box.checked = false;
            box.disabled = false;
            say("Deleted. Nothing is stored on your account.", "ok");
          }else{
            remove.disabled = false;
            say(res.body.error || "We couldn't delete it just now. Please try again.", "bad");
          }
        }).catch(function(){
          remove.disabled = false;
          say("We couldn't delete it just now. Please try again, or email hello@lumelive.co.in.", "bad");
        });
      });
      actions.appendChild(remove);
    }

    /*
      One retry, and only on a network failure or a 5xx. A 400 means the
      page and the server disagree about the shape of a profile and
      sending it again will not help; a 401 means sign in, which the
      client has to do themselves.
    */
    function send(attempt){
      say("Saving…");
      save.disabled = true;

      token().then(function(idToken){
        if(!idToken){
          save.disabled = false;
          say("Please sign in first, then press Save.", "bad");
          try{ window.lumeAccount.prompt("signin"); }catch(err){}
          return null;
        }
        return post(API_SAVE, idToken, {
          instrument: "student-full-v1",
          consent: true,
          scores: profile.scores,
          context: profile.context || {}
        });
      }).then(function(res){
        if(!res) return;

        if(res.status === 201 && res.body.saved){
          showSaved();
          return;
        }
        if(res.status === 401){
          save.disabled = false;
          say("Your sign-in has expired. Please sign in again, then press Save.", "bad");
          try{ window.lumeAccount.prompt("signin"); }catch(err){}
          return;
        }
        if(res.status >= 500 && attempt === 0){
          return send(1);
        }
        save.disabled = false;
        say(res.body.error || "We couldn't save it just now. Your report is still here on this device.", "bad");
      }).catch(function(){
        if(attempt === 0) return send(1);
        save.disabled = false;
        say("We couldn't reach the server. Your report is still here on this device.", "bad");
      });
    }

    save.addEventListener("click", function(){
      if(!box.checked) return;
      if(!signedIn()){
        say("Create your free account or sign in, and we'll save it.", "bad");
        try{ window.lumeAccount.prompt("signup"); }catch(err){}
        return;
      }
      send(0);
    });

    return card;
  }

  // ── entry point, called at the end of saGenerate ─────────────────────

  function offer(){
    var report = document.getElementById("saReport");
    if(!report) return;

    var existing = document.getElementById(CARD_ID);
    if(existing) existing.remove();     // a re-generated report gets a fresh card

    var profile = collect();
    if(!profile) return;

    report.appendChild(build(profile));
  }

  window.lumeAssessmentSave = { offer: offer };
})();
