# Getting every enquiry into a Google Sheet

Everything a client types on the site — a paid booking, a session request, a
school enquiry, a quiz answer — is POSTed as one JSON object to a webhook you
own. This sets that webhook up as a Google Sheet, which costs nothing and needs
no new accounts.

Until `OWNER_WEBHOOK_URL` is set nothing is lost: every event is written to the
Vercel runtime log instead (**Vercel → your project → Deployment → Runtime
Logs**, search `[lume notify]`). It is just far less convenient than a Sheet.

## 1. Create the Sheet

1. Make a new Google Sheet. Name it something like `Lume Live — enquiries`.
2. **Extensions → Apps Script**. Delete whatever is in the editor and paste:

```javascript
// Lume Live — receives site enquiries and appends one row per event.
const HEADERS = ['Received', 'Type', 'Name', 'Phone', 'Email', 'Amount',
                 'SKU', 'Order ID', 'Summary', 'Details', 'Page', 'Message'];

// Optional: set this to the same value as OWNER_WEBHOOK_TOKEN in Vercel to
// reject anything that is not from your site. Leave '' to accept all.
const SHARED_TOKEN = '';

// ── Being told, not just recorded ──────────────────────────────────────
// The Sheet is a log; these are the interruption. Leave both blank and the
// script stays silent, exactly as before.
const ALERT_EMAIL = '';         // e.g. 'hello@lumelive.co.in'
const TELEGRAM_BOT_TOKEN = '';  // from @BotFather — this is the one that
const TELEGRAM_CHAT_ID = '';    // from @userinfobot — reaches your phone
const ALERT_ON = ['payment'];   // event types worth interrupting you for

// ── The "message this client" link ─────────────────────────────────────
// Clients type a 10-digit number, so a country code has to be added back on.
const WA_COUNTRY_CODE = '91';
// Kept in step with DEFAULTS.bookingCalendarUrl in cashfree-payments.js.
const BOOKING_CALENDAR_URL = 'https://calendar.app.google/s59WHyuHJenjfPbQ6';

// wa.me wants digits only, no +, no spaces. A number that already carries a
// country code is left alone rather than having a second one bolted on.
function waNumber(phone) {
  const digits = String(phone == null ? '' : phone).replace(/\D/g, '');
  if (digits.length < 10) return '';                 // not a usable number
  if (digits.length > 10) return digits;             // already has a country code
  return WA_COUNTRY_CODE + digits;
}

// A first name to open with. Falls back to something that still reads politely.
function firstNameOf(name) {
  const first = String(name == null ? '' : name).trim().split(/\s+/)[0];
  return first || 'there';
}

// Builds the WhatsApp deep link, pre-written. Tapping it opens WhatsApp with
// the message ready — you still press send, so nothing goes out by itself.
function clientWaLink(data) {
  const num = waNumber(data.phone);
  if (!num) return '';
  const mode = data.details && data.details.session_mode;
  const text = [
    'Hi ' + firstNameOf(data.name) + ', this is Sachin from Lume Live.',
    data.type === 'payment' ? 'Thank you for booking your session.' : '',
    mode ? 'I have you down for a ' + String(mode).toLowerCase() + '.' : '',
    'Have you picked your day and time yet? If not, here is the link:',
    BOOKING_CALENDAR_URL
  ].filter(Boolean).join(' ');
  return 'https://wa.me/' + num + '?text=' + encodeURIComponent(text);
}

// Doubling a quote is how a quote survives inside a Sheets formula string.
function forFormula(value) {
  return String(value == null ? '' : value).replace(/"/g, '""');
}

// Sent after the row is safely written, and never allowed to throw — an
// alert that fails must not cost you the record of the booking.
function alertOwner(data, link) {
  const mode = data.details && data.details.session_mode;
  const body = [
    data.type === 'payment' ? '💰 Paid booking' : 'New ' + (data.type || 'enquiry'),
    data.name ? 'Name: ' + data.name : '',
    data.phone ? 'Phone: ' + data.phone : '',
    data.amount == null ? '' : 'Amount: ₹' + data.amount,
    data.sku ? 'Service: ' + data.sku : '',
    mode ? 'Wants: ' + mode : '',
    link ? '' : '(no usable phone number on this one)',
    link ? 'Message them: ' + link : ''
  ].filter(Boolean).join('\n');

  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    try {
      UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
        method: 'post',
        payload: { chat_id: TELEGRAM_CHAT_ID, text: body, disable_web_page_preview: 'true' },
        muteHttpExceptions: true
      });
    } catch (err) { console.error('telegram alert failed', err); }
  }
  if (ALERT_EMAIL) {
    try {
      MailApp.sendEmail(ALERT_EMAIL,
        'Lume Live — ' + (data.type === 'payment' ? 'paid booking' : (data.type || 'enquiry')),
        body);
    } catch (err) { console.error('email alert failed', err); }
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);                       // serialise concurrent bookings
  try {
    const data = JSON.parse(e.postData.contents);
    if (SHARED_TOKEN && data.token !== SHARED_TOKEN) {
      return ContentService.createTextOutput('forbidden');
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    // A paid order is confirmed by more than one page view, so skip an
    // order id we have already logged.
    if (data.orderId) {
      const ids = sheet.getRange(1, 8, Math.max(sheet.getLastRow(), 1), 1).getValues();
      if (ids.some(row => String(row[0]) === String(data.orderId))) {
        return ContentService.createTextOutput('duplicate');
      }
    }

    const details = data.details && typeof data.details === 'object'
      ? Object.keys(data.details).map(k => k + ': ' + data.details[k]).join('\n')
      : '';

    // One tap from the row to a pre-written WhatsApp to this client.
    const link = clientWaLink(data);
    const message = link
      ? '=HYPERLINK("' + forFormula(link) + '","💬 Message ' + forFormula(firstNameOf(data.name)) + '")'
      : '';

    sheet.appendRow([
      new Date(data.at || Date.now()), data.type || '', data.name || '',
      data.phone || '', data.email || '', data.amount == null ? '' : data.amount,
      data.sku || '', data.orderId || '', data.summary || '', details, data.page || '',
      message
    ]);

    if (ALERT_ON.indexOf(data.type) !== -1) { alertOwner(data, link); }
    return ContentService.createTextOutput('ok');
  } catch (err) {
    console.error(err);
    return ContentService.createTextOutput('error');
  } finally {
    lock.releaseLock();
  }
}
```

3. **Deploy → New deployment → Web app**
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**  ← required; without it Vercel gets a login page instead of your script
4. Authorise when prompted, then copy the **Web app URL** (ends in `/exec`).

"Anyone" means anyone with the URL can append a row. The URL is unguessable, and
setting `SHARED_TOKEN` above plus `OWNER_WEBHOOK_TOKEN` below closes it properly
— worth doing.

## 2. Point the site at it

In **Vercel → your project → Settings → Environment Variables**, add:

| Name | Value |
| --- | --- |
| `OWNER_WEBHOOK_URL` | the `/exec` URL from step 1 |
| `OWNER_WEBHOOK_TOKEN` | *(optional)* any long random string, matching `SHARED_TOKEN` |

Redeploy for the variables to take effect.

## 3. Get a push on your phone the moment someone pays

Step 3 is a record. This is being told, within seconds, wherever you are.

The script sends the alert itself — no Zapier, no Make, no subscription. Two
options, and you can run both:

**Telegram (reaches your phone, free, ~3 minutes)**

1. In Telegram, message **@BotFather** → `/newbot` → give it any name. It
   replies with a **bot token**.
2. Message **@userinfobot** → it replies with your numeric **chat id**.
3. Open a chat with *your own new bot* and send it anything — Telegram will not
   let a bot message you until you have messaged it once.
4. Paste both values into `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` at the top
   of the script, and redeploy the web app.

**Email**

Set `ALERT_EMAIL` to your address. Uses Google's own `MailApp`, so there is
nothing else to configure.

**Or nothing at all**

If you would rather not touch the script, Sheets can nudge you by itself:
**Tools → Notification settings → Notify me when… any changes are made →
Email — right away**, or install the Google Sheets app and turn on
notifications for the file. Coarser — it fires on every row, not just the ones
that matter — but it is two clicks.

`ALERT_ON` controls what is worth interrupting you for. It ships as
`['payment']` — only money. Add `'whatsapp'` or `'lead'` if you want those too;
`'checkout-started'` will page you for people who never pay, which gets noisy
fast.

Alerts are sent *after* the row is written and can never throw, so a Telegram
outage or a wrong token costs you the notification but never the record.

## What you can do from a row

The **Message** column holds a one-tap WhatsApp link to that client —
*💬 Message Priya* — opening WhatsApp with a message already written:

> Hi Priya, this is Sachin from Lume Live. Thank you for booking your session.
> I have you down for a voice call. Have you picked your day and time yet? If
> not, here is the link: https://calendar.app.google/…

You still press send. A `wa.me` link can only *open* WhatsApp with text ready —
nothing is ever sent automatically, by this script or by the site. Truly
automatic messages need the WhatsApp Business Platform (Meta's Cloud API, or a
reseller), which means business verification, a dedicated sender number and
pre-approved templates.

The number is taken from what the client typed and `91` is added back on, since
the site stores ten digits. A number that already carries a country code is left
as it is, and a row with no usable number simply gets a blank cell.

Edit the wording in `clientWaLink()` — it is meant to be a starting point, not a
script to read out.

## What arrives

| Field | Meaning |
| --- | --- |
| `type` | `payment`, `whatsapp`, `checkout-started`, `lead` |
| `name` / `phone` / `email` | whatever the client gave |
| `amount` / `sku` / `orderId` | present on `payment` rows |
| `summary` | the full message they were sending you |
| `details` | every other labelled field from the form |
| `page` | which page they were on |
| Message | a one-tap WhatsApp link to that client — see above |

A paid booking usually produces two rows: `checkout-started` when they open
checkout (has the session and meeting-mode they chose), and `payment` once
Cashfree confirms the money. The `payment` row is the one to trust — it is
written by the server from Cashfree's own response, not by the browser.

The `payment` row also carries how the client asked to meet — in the `summary`
line and as `session_mode` in `details`. Getting that same answer onto the
Google Calendar event needs one setting change: see
[session-mode-on-calendar.md](session-mode-on-calendar.md).

## Checking it works

```bash
curl -X POST "$OWNER_WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -d '{"type":"test","name":"Test row","summary":"Checking the webhook","at":"2026-01-01T00:00:00Z"}'
```

A row should appear within a second or two. If not, the usual cause is *Who has
access* not being set to **Anyone** on the deployment.

## A note on privacy

These forms already address their contents to Lume Live — this captures the same
message, to the same recipient, at the moment the client taps the button rather
than depending on them finishing the hand-off in WhatsApp. It is still personal
data you are now storing, so keep the Sheet restricted to yourself and make sure
the privacy policy reflects that enquiry details are stored.
