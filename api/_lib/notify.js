/*
  Lume Live — "tell the owner" notifications.

  Every piece of information a client hands over — a paid booking, an
  enquiry form, a session request — is forwarded as one JSON POST to a
  webhook you own, so it lands somewhere you actually read instead of
  sitting in the Cashfree dashboard waiting to be noticed.

  Set in Vercel → Project → Settings → Environment Variables:

  OWNER_WEBHOOK_URL   Where each event is POSTed. A Google Apps Script Web
                      App that appends a row to a Sheet is the zero-cost
                      default — see docs/owner-notifications.md for the
                      script and the five-minute setup. Zapier/Make catch
                      hooks, Airtable automations and n8n all accept the
                      same payload.
                      Falls back to LEAD_WEBHOOK_URL when unset, so an
                      existing lead webhook keeps receiving everything
                      without any extra configuration.
  OWNER_WEBHOOK_TOKEN Optional shared secret. Sent as `token` in the body
                      and as an X-Lume-Token header, so your Apps Script
                      can reject anything that isn't from this site.

  Nothing here ever throws or blocks the visitor: if the webhook is slow,
  misconfigured or down, the event is logged and the request carries on.
  A client must never see an error because our notification plumbing had
  a bad day.
*/

const TIMEOUT_MS = 5000;

function webhookUrl(){
  return process.env.OWNER_WEBHOOK_URL || process.env.LEAD_WEBHOOK_URL || "";
}

// Keeps one runaway field from blowing up a spreadsheet cell or a log line.
function clamp(value, max){
  if(value == null) return null;
  const s = typeof value === "string" ? value : String(value);
  const trimmed = s.trim();
  if(!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) + "…" : trimmed;
}

/*
  Flattens whatever a caller passes into a stable, spreadsheet-friendly
  shape. Column order in the Sheet is fixed by the Apps Script, so adding
  a field here never shifts existing columns.
*/
function buildEvent(input){
  const details = input.details && typeof input.details === "object" ? input.details : {};
  const flat = {};
  for(const key of Object.keys(details).slice(0, 40)){
    const v = details[key];
    if(v == null || v === "") continue;
    flat[clamp(key, 60)] = clamp(typeof v === "object" ? JSON.stringify(v) : v, 500);
  }
  return {
    type: clamp(input.type, 60) || "unknown",
    at: new Date().toISOString(),
    name: clamp(input.name, 120),
    phone: clamp(input.phone, 30),
    email: clamp(input.email, 254),
    summary: clamp(input.summary, 1500),
    sku: clamp(input.sku, 80),
    amount: input.amount == null ? null : Number(input.amount),
    orderId: clamp(input.orderId, 60),
    page: clamp(input.page, 300),
    details: flat
  };
}

/*
  Fire-and-report. Returns { ok, delivered } rather than throwing, so
  callers can log the outcome without wrapping every call in try/catch.
*/
async function notifyOwner(input){
  const event = buildEvent(input || {});
  const url = webhookUrl();

  if(!url){
    // Nothing configured yet — log it so the enquiry still exists
    // somewhere retrievable (Vercel → Deployment → Runtime Logs).
    console.log("[lume notify]", JSON.stringify(event));
    return { ok: true, delivered: false };
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
      body: JSON.stringify(token ? Object.assign({ token }, event) : event),
      signal: controller.signal,
      redirect: "follow" // Apps Script Web Apps answer with a 302 to script.googleusercontent.com
    });
    if(!res.ok){
      console.error("[lume notify] webhook returned", res.status, JSON.stringify(event));
      return { ok: true, delivered: false };
    }
    return { ok: true, delivered: true };
  }catch(err){
    console.error("[lume notify] webhook failed:", String(err && err.message || err), JSON.stringify(event));
    return { ok: true, delivered: false };
  }finally{
    clearTimeout(timer);
  }
}

module.exports = { notifyOwner, buildEvent };
