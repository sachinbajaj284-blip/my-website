/*
  Lume Live — sending one email to a client.

  Everything else on this site posts to a webhook you own and forgets
  about it: a notification that never arrives is a row missing from a
  spreadsheet, which is annoying. A sign-in code that never arrives is a
  person who cannot sign in, which is the whole transaction. So unlike
  notify.js, this one reports failure honestly and the caller tells the
  client rather than pretending the email is on its way.

  Three ways to send, tried in this order — the first one configured
  is the one used, and there is no silent fall-through between them
  (a code that went out twice, or through the provider you thought you
  had switched off, is harder to debug than one that failed loudly):

  1. Resend (resend.com)    RESEND_API_KEY
  2. Brevo  (brevo.com)     BREVO_API_KEY
       Both need AUTH_EMAIL_FROM, e.g.  Lume Live <login@lumelive.co.in>
       — an address on a domain you have verified with that provider.
       A real mail service is the recommended path: it signs mail for
       your domain (SPF/DKIM), so codes land in the inbox instead of
       Spam, and there is no Gmail daily cap.

  3. The Google Apps Script Web App that already sends your owner
     alerts — AUTH_EMAIL_WEBHOOK_URL, falling back to OWNER_WEBHOOK_URL,
     with OWNER_WEBHOOK_TOKEN. Needs the snippet in
     docs/owner-notifications.md ("Sending the sign-in code"). Gmail caps
     it at roughly 100 recipients a day, and hitting that looks like
     "the code never came".

  See docs/accounts-and-checkout.md for the setup steps.
*/

const TIMEOUT_MS = 8000;

function webhookUrl(){
  return process.env.AUTH_EMAIL_WEBHOOK_URL || process.env.OWNER_WEBHOOK_URL || "";
}

function provider(){
  if(process.env.RESEND_API_KEY){ return "resend"; }
  if(process.env.BREVO_API_KEY){ return "brevo"; }
  if(webhookUrl()){ return "webhook"; }
  return "";
}

function isConfigured(){
  return Boolean(provider());
}

/* "Lume Live <login@lumelive.co.in>" -> { name, email }. A bare address
   is accepted too, and gets the brand name. */
function parseFrom(raw){
  const value = String(raw || "").trim();
  const m = value.match(/^(.*?)\s*<([^<>\s]+@[^<>\s]+)>$/);
  if(m){ return { name: m[1].replace(/^"|"$/g, "").trim() || "Lume Live", email: m[2] }; }
  if(/^[^\s@]+@[^\s@]+$/.test(value)){ return { name: "Lume Live", email: value }; }
  return null;
}

async function withTimeout(fn){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try{ return await fn(controller.signal); }
  finally{ clearTimeout(timer); }
}

/*
  Resolves { ok:true } or { ok:false, reason } — never throws, because a
  thrown error here becomes a 500 and the client learns nothing useful.
*/
async function sendEmail(msg){
  const which = provider();
  if(!which){
    console.error("[lume email] no mail sender is configured (RESEND_API_KEY, BREVO_API_KEY or AUTH_EMAIL_WEBHOOK_URL), so no sign-in code can be sent.");
    return { ok:false, reason:"NOT_CONFIGURED" };
  }
  if(which === "webhook"){ return sendViaWebhook(msg); }

  const from = parseFrom(process.env.AUTH_EMAIL_FROM);
  if(!from){
    console.error("[lume email] " + which + " is configured but AUTH_EMAIL_FROM is missing or malformed. Set it to e.g. \"Lume Live <login@lumelive.co.in>\".");
    return { ok:false, reason:"FROM_NOT_SET" };
  }
  return which === "resend" ? sendViaResend(msg, from) : sendViaBrevo(msg, from);
}

/* The provider's own error body is logged (it names the fix — "domain is
   not verified", "invalid key"), but the recipient never is: a failure
   report should not become a record of who tried to sign in. */
async function providerFailure(name, res){
  const detail = (await res.text().catch(function(){ return ""; })).slice(0, 300);
  console.error("[lume email] " + name + " returned", res.status, detail);
  return { ok:false, reason: name.toUpperCase() + "_" + res.status };
}

async function sendViaResend({ to, subject, text }, from){
  try{
    const res = await withTimeout((signal) => fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.RESEND_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ from: from.name + " <" + from.email + ">", to: [to], subject, text }),
      signal
    }));
    if(!res.ok){ return providerFailure("resend", res); }
    return { ok:true };
  }catch(err){
    console.error("[lume email] resend unreachable:", String(err && err.message || err));
    return { ok:false, reason:"RESEND_UNREACHABLE" };
  }
}

async function sendViaBrevo({ to, subject, text }, from){
  try{
    const res = await withTimeout((signal) => fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ sender: from, to: [{ email: to }], subject, textContent: text }),
      signal
    }));
    if(!res.ok){ return providerFailure("brevo", res); }
    return { ok:true };
  }catch(err){
    console.error("[lume email] brevo unreachable:", String(err && err.message || err));
    return { ok:false, reason:"BREVO_UNREACHABLE" };
  }
}

async function sendViaWebhook({ to, subject, text }){
  const url = webhookUrl();
  const token = process.env.OWNER_WEBHOOK_TOKEN || "";
  try{
    const res = await withTimeout((signal) => fetch(url, {
      method: "POST",
      headers: Object.assign(
        { "Content-Type": "application/json" },
        token ? { "X-Lume-Token": token } : {}
      ),
      // `type` is what the Apps Script switches on: an auth_email is
      // delivered to the client, every other type is a row for you.
      body: JSON.stringify(Object.assign(
        { type: "auth_email", to: to, subject: subject, text: text },
        token ? { token } : {}
      )),
      signal,
      redirect: "follow" // Apps Script answers with a 302 to script.googleusercontent.com
    }));
    if(!res.ok){
      console.error("[lume email] webhook returned", res.status);
      return { ok:false, reason:"WEBHOOK_" + res.status };
    }

    /*
      A 200 is not proof it sent.

      An Apps Script Web App deployed as "Anyone with a Google Account"
      answers an anonymous POST with a sign-in *page* — status 200, and
      our script never ran. So the body is checked: the snippet in the
      docs answers "sent", and the notification path answers with its own
      short string. An HTML document coming back means we reached
      Google's login screen rather than the script.
    */
    const body = (await res.text().catch(function(){ return ""; })).trim();
    if(/^\s*<(!doctype|html)/i.test(body)){
      console.error("[lume email] the webhook answered with a sign-in page, so the script never ran. Set the deployment's access to \"Anyone\".");
      return { ok:false, reason:"WEBHOOK_NEEDS_ANYONE_ACCESS" };
    }

    return { ok:true };
  }catch(err){
    console.error("[lume email] webhook failed:", String(err && err.message || err));
    return { ok:false, reason:"WEBHOOK_UNREACHABLE" };
  }
}

/*
  The code email itself. Plain text on purpose: it renders identically
  everywhere, it is what a phone notification previews, and an HTML
  template with a button is exactly what a spam filter is looking for.
*/
function codeEmail(code){
  return {
    subject: code + " is your Lume Live sign-in code",
    text: [
      "Your Lume Live sign-in code is:",
      "",
      "    " + code,
      "",
      "Type it on the page you came from. It expires in 10 minutes and can only be used once.",
      "",
      "If you didn't ask to sign in, you can ignore this email — nobody can get in without this code.",
      "",
      "— Lume Live",
      "https://lumelive.co.in"
    ].join("\n")
  };
}

module.exports = { sendEmail, codeEmail, isConfigured, provider, parseFrom };
