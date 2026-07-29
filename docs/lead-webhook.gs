/**
 * Lume Live — Lead capture webhook (Google Apps Script)
 * -----------------------------------------------------
 * Receives each lead POSTed by /api/lead and appends it as a row to a
 * Google Sheet you own. Optionally emails you when a new lead arrives.
 *
 * SETUP (5 minutes) — see docs/lead-capture-setup.md for the full walkthrough:
 *   1. Create a Google Sheet (this becomes your leads list).
 *   2. Extensions → Apps Script. Delete the sample and paste this file.
 *   3. (Optional) set NOTIFY_EMAIL below to get an email per lead.
 *   4. Deploy → New deployment → type "Web app":
 *        • Execute as: Me
 *        • Who has access: Anyone
 *      Deploy, authorise, and COPY the Web app URL.
 *   5. In Vercel → your project → Settings → Environment Variables, add:
 *        LEAD_WEBHOOK_URL = <the Web app URL>
 *      then redeploy. Done — the free checklist form now feeds this sheet.
 */

var SHEET_NAME = 'Leads';
var NOTIFY_EMAIL = ''; // e.g. 'hello@lumelive.co.in' — leave '' to disable emails

function doPost(e) {
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp', 'Email', 'Name', 'Source', 'Referrer', 'User Agent']);
      sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    }

    sheet.appendRow([
      data.ts || new Date().toISOString(),
      data.email || '',
      data.name || '',
      data.source || '',
      data.ref || '',
      data.ua || ''
    ]);

    if (NOTIFY_EMAIL && data.email) {
      MailApp.sendEmail(
        NOTIFY_EMAIL,
        'New Lume Live lead: ' + data.email,
        'Email: ' + data.email +
        '\nName: ' + (data.name || '—') +
        '\nSource: ' + (data.source || '—') +
        '\nReferrer: ' + (data.ref || '—') +
        '\nTime: ' + (data.ts || '')
      );
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Lets you confirm the deployment is live by visiting the URL in a browser.
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: 'lume-lead-webhook' }))
    .setMimeType(ContentService.MimeType.JSON);
}
