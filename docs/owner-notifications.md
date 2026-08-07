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
                 'SKU', 'Order ID', 'Summary', 'Details', 'Page'];

// Optional: set this to the same value as OWNER_WEBHOOK_TOKEN in Vercel to
// reject anything that is not from your site. Leave '' to accept all.
const SHARED_TOKEN = '';

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

    sheet.appendRow([
      new Date(data.at || Date.now()), data.type || '', data.name || '',
      data.phone || '', data.email || '', data.amount == null ? '' : data.amount,
      data.sku || '', data.orderId || '', data.summary || '', details, data.page || ''
    ]);
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

## 3. Get told about new rows

The Sheet is a record, not an alert. To be nudged:

- **Sheets → Tools → Notification settings → Notify me when… any changes are
  made → Email — right away.**
- Or on your phone: install the Google Sheets app and turn on notifications for
  this file.

## What arrives

| Field | Meaning |
| --- | --- |
| `type` | `payment`, `whatsapp`, `checkout-started`, `lead` |
| `name` / `phone` / `email` | whatever the client gave |
| `amount` / `sku` / `orderId` | present on `payment` rows |
| `summary` | the full message they were sending you |
| `details` | every other labelled field from the form |
| `page` | which page they were on |

A paid booking usually produces two rows: `checkout-started` when they open
checkout (has the session and meeting-mode they chose), and `payment` once
Cashfree confirms the money. The `payment` row is the one to trust — it is
written by the server from Cashfree's own response, not by the browser.

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
