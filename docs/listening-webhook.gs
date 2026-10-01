/**
 * Lume Live — listening tool webhook (Google Apps Script)
 * -------------------------------------------------------
 * Receives the daily list from tools/listen/listen.mjs, appends each new
 * post as a row in a "Listening" tab, and sends one Telegram summary.
 *
 * The Sheet is also the tool's memory: a post already in the Sheet is
 * never added twice, so nothing has to be stored in the website repo.
 *
 * Use a NEW Google Sheet for this — keep it apart from the enquiries
 * Sheet, so a mistake here can never touch client bookings.
 * Setup: docs/listening-tool.md.
 */

var SHEET_NAME = 'Listening';

// Same value as the LISTEN_WEBHOOK_TOKEN GitHub secret. Leave '' to accept all.
var SHARED_TOKEN = '';

// From @BotFather and @userinfobot. Leave both '' to skip Telegram.
var TELEGRAM_BOT_TOKEN = '';
var TELEGRAM_CHAT_ID = '';

var HEADERS = ['Found', 'Status', 'Category', 'Score', 'Subreddit', 'Title',
               'Link', 'Comments', 'Snippet', 'Reply starter (edit before posting!)',
               'Why it matched', 'Post ID'];
var ID_COLUMN = 12;

function doPost(e) {
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (SHARED_TOKEN && data.token !== SHARED_TOKEN) {
      return json_({ ok: false, error: 'bad token' });
    }
    var items = Array.isArray(data.items) ? data.items : [];
    var sheet = sheet_();

    var seen = {};
    var last = sheet.getLastRow();
    if (last > 1) {
      sheet.getRange(2, ID_COLUMN, last - 1, 1).getValues().forEach(function (r) {
        if (r[0]) seen[String(r[0])] = true;
      });
    }

    var fresh = items.filter(function (it) {
      if (!it || !it.id || seen[it.id]) return false;
      seen[it.id] = true;
      return true;
    });

    if (fresh.length) {
      var now = new Date();
      var rows = fresh.map(function (it) {
        return [
          now,
          'New',
          (it.sensitive ? '⚠ ' : '') + (it.categoryLabel || it.category || ''),
          it.score || '',
          'r/' + (it.subreddit || ''),
          it.title || '',
          it.link || '',
          it.comments || 0,
          it.snippet || '',
          it.starter || '',
          it.reasons || '',
          it.id
        ];
      });
      var start = sheet.getLastRow() + 1;
      sheet.getRange(start, 1, rows.length, HEADERS.length).setValues(rows);
      sheet.getRange(start, 2, rows.length, 1).setDataValidation(statusRule_());
      // Wrap the long text so a row can be read without resizing columns.
      sheet.getRange(start, 9, rows.length, 2).setWrap(true);
      fresh.forEach(function (it, i) {
        if (it.sensitive) sheet.getRange(start + i, 1, 1, HEADERS.length).setBackground('#FDECEA');
      });
    }

    alert_(fresh);
    return json_({ ok: true, received: items.length, added: fresh.length });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setColumnWidth(6, 320);
    sheet.setColumnWidth(9, 360);
    sheet.setColumnWidth(10, 420);
  }
  return sheet;
}

function statusRule_() {
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(['New', 'Replied', 'Skipped'], true)
    .build();
}

// Never throws: a failed Telegram message must not lose the rows.
function alert_(fresh) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    var lines = [];
    var crisis = fresh.filter(function (it) { return it.category === 'crisis'; });
    if (crisis.length) {
      lines.push('🚨 ' + crisis.length + ' post(s) where someone may be in crisis — please look first:');
      // Telegram caps a message at 4096 characters; the Sheet holds the rest.
      crisis.slice(0, 5).forEach(function (it) { lines.push('• ' + it.title + '\n' + it.link); });
      lines.push('');
    }
    if (!fresh.length) {
      lines.push('Listening: no new posts today.');
    } else {
      lines.push('Listening: ' + fresh.length + ' new post(s) to answer today. Top 5:');
      fresh.filter(function (it) { return it.category !== 'crisis'; }).slice(0, 5).forEach(function (it) {
        lines.push('• [' + (it.categoryLabel || it.category) + '] ' + it.title + '\n' + it.link);
      });
      lines.push('');
      lines.push('Full list + reply starters: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl());
    }
    UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: lines.join('\n'), disable_web_page_preview: true }),
      muteHttpExceptions: true
    });
  } catch (err) {
    console.error('Telegram alert failed: ' + err);
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
