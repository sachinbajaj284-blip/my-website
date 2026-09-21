/*
  Lume Live — sending one email to a client.

  Everything else on this site posts to a webhook you own and forgets
  about it: a notification that never arrives is a row missing from a
  spreadsheet, which is annoying. A sign-in code that never arrives is a
  person who cannot sign in, which is the whole transaction. So unlike
  notify.js, this one reports failure honestly and the caller tells the
  client rather than pretending the email is on its way.

  It goes through the same Google Apps Script Web App that already sends
  your owner alerts, which means no new account, no new bill and one
  place that holds the sending credentials. The script needs the small
  addition in docs/owner-notifications.md ("Sending a sign-in code") to
  recognise type:"auth_email" and call MailApp.sendEmail.

  Set in Vercel → Project → Settings → Environment Variables:

  AUTH_EMAIL_WEBHOOK_URL  The Apps Script Web App URL. Falls back to
                          OWNER_WEBHOOK_URL, so if your notifications
                          already work, this does too once the script is
                          updated.
  OWNER_WEBHOOK_TOKEN     The same shared secret the notifications use.

  Gmail caps a free account at roughly 100 recipients a day (1,500 on
  Workspace). That is a ceiling on sign-ups per day, not on page views,
  and hitting it looks like "the code never came" — so it is logged
  loudly enough to recognise.
*/

const TIMEOUT_MS = 8000;

function webhookUrl(){
  return process.env.AUTH_EMAIL_WEBHOOK_URL || process.env.OWNER_WEBHOOK_URL || "";
}

function isConfigured(){
  return Boolean(webhookUrl());
}

/*
  Resolves { ok:true } or { ok:false, reason } — never throws, because a
  thrown error here becomes a 500 and the client learns nothing useful.
*/
async function sendEmail({ to, subject, text }){
  const url = webhookUrl();
  if(!url){
    console.error("[lume email] AUTH_EMAIL_WEBHOOK_URL / OWNER_WEBHOOK_URL is not set, so no sign-in code can be sent.");
    return { ok:false, reason:"NOT_CONFIGURED" };
  }

  const token = process.env.OWNER_WEBHOOK_TOKEN || "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try{
    const res = await fetch(url, {
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
      signal: controller.signal,
      redirect: "follow" // Apps Script answers with a 302 to script.googleusercontent.com
    });
    if(!res.ok){
      // The address is not logged: a failure report should not become a
      // record of who tried to sign in.
      console.error("[lume email] webhook returned", res.status);
      return { ok:false, reason:"WEBHOOK_" + res.status };
    }
    return { ok:true };
  }catch(err){
    console.error("[lume email] webhook failed:", String(err && err.message || err));
    return { ok:false, reason:"WEBHOOK_UNREACHABLE" };
  }finally{
    clearTimeout(timer);
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

module.exports = { sendEmail, codeEmail, isConfigured };
