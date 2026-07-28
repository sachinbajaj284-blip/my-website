# Lead capture setup — free checklist → a list you own

The free **Parent's Stream-Selection Checklist** (`parents-stream-checklist.html`)
posts each email to `/api/lead` (the serverless function in `api/lead.js`).
That function forwards the lead to whatever URL you set in the
`LEAD_WEBHOOK_URL` environment variable. Point it at the Google Apps Script
below and every download lands as a row in a Google Sheet you control.

If `LEAD_WEBHOOK_URL` is **not** set, nothing breaks — the visitor still gets
the PDF, and the lead is written to the server logs. Setting the webhook just
turns that into a durable, owned list.

## Steps (~5 minutes)

1. **Create a Google Sheet** — this is your leads list. Name it e.g. *Lume Leads*.
2. In the Sheet: **Extensions → Apps Script**.
3. Delete the sample `myFunction`, then **paste the contents of
   [`lead-webhook.gs`](./lead-webhook.gs)**. (Optional: set `NOTIFY_EMAIL` at
   the top to get an email for each new lead.) Save.
4. **Deploy → New deployment**. Click the gear → **Web app**. Set:
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
   Click **Deploy**, authorise the permissions, and **copy the Web app URL**
   (it looks like `https://script.google.com/macros/s/AKfy.../exec`).
5. Confirm it's live: open that URL in a browser — you should see
   `{"ok":true,"service":"lume-lead-webhook"}`.
6. In **Vercel → your project → Settings → Environment Variables**, add:
   - **Name:** `LEAD_WEBHOOK_URL`
   - **Value:** the Web app URL from step 4
   Save and **redeploy** the project so the variable takes effect.

## Test it

- Open `https://lumelive.co.in/parents-stream-checklist.html`, enter a test
  email, and submit. A new row should appear in your Sheet within a second or two.
- Or from a terminal:
  ```bash
  curl -X POST https://lumelive.co.in/api/lead \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","source":"manual-test"}'
  # → {"ok":true,"stored":true}
  ```

## Notes

- **Treat the Web app URL as a secret** — anyone with it can append rows.
  It only ever receives an email + source, so the exposure is low, but don't
  publish it. For extra safety you can add a shared-token check in both
  `api/lead.js` and `doPost` later.
- **Re-using it elsewhere:** any other form can capture emails the same way —
  just `POST {"email":"…","source":"…"}` to `/api/lead`.
- **Other destinations:** `LEAD_WEBHOOK_URL` can point at Zapier/Make catch
  hooks, Airtable automations, or your own endpoint instead of Apps Script —
  the payload is plain JSON.
