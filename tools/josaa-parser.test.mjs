#!/usr/bin/env node
/**
 * Parser tests for josaa-ingest. Run: node tools/josaa-parser.test.mjs
 *
 * The fixture below mimics the shape of the JoSAA archive result page — the table
 * layout, the ASP.NET hidden fields, the "1234P" preparatory ranks, the
 * "(4 Years, Bachelor of Technology)" branch suffix. The RANKS ARE INVENTED and exist
 * only to exercise the parser; they never reach the site.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = await fs.readFile(path.join(ROOT, 'tools', 'josaa-ingest.mjs'), 'utf8');
const fsSrc = src;

/* josaa-ingest.mjs runs on import, so lift the pure helpers out rather than importing it. */
const lift = name => {
  const re = new RegExp(`(?:^|\\n)(?:const|let|function|class)\\s+${name}\\b[\\s\\S]*?(?=\\n(?:const|function|async function|class|/\\*|let)\\s)`, 'm');
  const m = src.match(re);
  if (!m) throw new Error(`Could not lift ${name} from josaa-ingest.mjs`);
  return m[0];
};

const mod = await import(`data:text/javascript,${encodeURIComponent(`
${lift('decodeEntities')}
${lift('stripTags')}
${lift('extractHiddenFields')}
${lift('extractSelects')}
${lift('findSelect')}
${lift('CONTROL_NAME_HINTS')}
${lift('findSelectByName')}
${lift('discoverFields')}
${lift('parseResultTable')}
${lift('parseRank')}
${lift('splitBranch')}
${lift('instituteType')}
${lift('extractSelectedValues')}
${lift('findSubmitButton')}
${lift('discoverAjax')}
${lift('parseAsyncDelta')}
${lift('looksLikeDelta')}
${lift('FormSession')}
${lift('chooseOption')}
${lift('chooseAll')}
${lift('realOptions')}
${lift('envInt')}
${lift('REQUEST_GAP_MS')}
${lift('REQUEST_JITTER_MS')}
${lift('BLOCK_BACKOFF_MS')}
${lift('MAX_RETRIES')}
${lift('nextGap')}
${lift('isConnectTimeout')}
${lift('backoffFor')}
${lift('BLOCK_BUDGET_MS')}
${lift('RESPONSE_TIMEOUT_MS')}
${lift('REQUEST_TIMEOUT_MS')}
${lift('blockedWaitMs')}
${lift('blockBudgetLeft')}
export { decodeEntities, stripTags, extractHiddenFields, extractSelects, discoverFields, parseResultTable, parseRank, splitBranch, instituteType, extractSelectedValues, findSubmitButton, discoverAjax, parseAsyncDelta, looksLikeDelta, FormSession, chooseOption, chooseAll, realOptions, envInt, nextGap, isConnectTimeout, backoffFor, REQUEST_GAP_MS, REQUEST_JITTER_MS, BLOCK_BACKOFF_MS, MAX_RETRIES, BLOCK_BUDGET_MS, blockBudgetLeft, RESPONSE_TIMEOUT_MS, REQUEST_TIMEOUT_MS };
`)}`);

const FIXTURE = `
<html><body><form method="post" action="./openingclosingrankarchieve.aspx">
<input type="hidden" name="__VIEWSTATE" value="/wEPDwUKLTE5OTU4Nzc4NQ%3D%3D" />
<input type="hidden" name="__VIEWSTATEGENERATOR" value="CA0B0334" />
<input type="hidden" name="__EVENTVALIDATION" value="/wEdAAaB1jK9" />
<select name="ctl00$ContentPlaceHolder1$ddlYear">
  <option value="">Select Year</option><option value="2024">2024</option>
  <option value="2025">2025</option><option value="2026">2026</option>
</select>
<select name="ctl00$ContentPlaceHolder1$ddlRoundNo">
  <option value="">Select Round</option><option value="1">1</option>
  <option value="5">5</option><option value="6">6</option>
</select>
<select name="ctl00$ContentPlaceHolder1$ddlInstype">
  <option value="">Select Institute Type</option><option value="IIT">IIT</option>
  <option value="NIT">NIT</option><option value="IIIT">IIIT</option>
  <option value="GFTI">Other-GFTI</option>
</select>
<select name="ctl00$ContentPlaceHolder1$ddlSeatType">
  <option value="">Select</option><option value="OPEN">OPEN</option>
  <option value="EWS">EWS</option><option value="OBC-NCL">OBC-NCL</option>
  <option value="SC">SC</option><option value="ST">ST</option>
</select>
<select name="ctl00$ContentPlaceHolder1$ddlGender">
  <option value="">Select</option><option value="GN">Gender-Neutral</option>
  <option value="FO">Female-only (including Supernumerary)</option>
</select>
<table class="table table-bordered">
  <tr><th>Institute</th><th>Academic Program Name</th><th>Quota</th>
      <th>Seat Type</th><th>Gender</th><th>Opening Rank</th><th>Closing Rank</th></tr>
  <tr><td>Indian Institute of Technology Bombay</td>
      <td>Computer Science and Engineering (4 Years, Bachelor of Technology)</td>
      <td>AI</td><td>OPEN</td><td>Gender-Neutral</td><td>1</td><td>68</td></tr>
  <tr><td>National Institute of Technology, Tiruchirappalli</td>
      <td>Computer Science and Engineering (4 Years, Bachelor of Technology)</td>
      <td>HS</td><td>OBC-NCL</td><td>Gender-Neutral</td><td>1,204</td><td>3,911</td></tr>
  <tr><td>Indian Institute of Information Technology Allahabad</td>
      <td>Information Technology (4 Years, Bachelor of Technology)</td>
      <td>AI</td><td>SC</td><td>Female-only (including Supernumerary)</td><td>2,301</td><td>4,088</td></tr>
  <tr><td>Indian Institute of Technology Madras</td>
      <td>Preparatory Course (1 Years, Preparatory)</td>
      <td>AI</td><td>ST</td><td>Gender-Neutral</td><td>112P</td><td>904P</td></tr>
  <tr><td>Birla Institute of Technology, Mesra</td>
      <td>Chemical Engineering (4 Years, Bachelor of Technology)</td>
      <td>OS</td><td>OPEN</td><td>Gender-Neutral</td><td>-</td><td>41,882</td></tr>
</table>
</form></body></html>`;

let passed = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); passed++; }
  catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
};

console.log('josaa parser tests\n');

test('extracts ASP.NET hidden fields', () => {
  const h = mod.extractHiddenFields(FIXTURE);
  assert.equal(h.__VIEWSTATEGENERATOR, 'CA0B0334');
  assert.ok(h.__VIEWSTATE.length > 0);
  assert.ok('__EVENTVALIDATION' in h);
});

test('discovers controls by option vocabulary, not by id', () => {
  const f = mod.discoverFields(FIXTURE);
  assert.equal(f.year.name, 'ctl00$ContentPlaceHolder1$ddlYear');
  assert.equal(f.instType.name, 'ctl00$ContentPlaceHolder1$ddlInstype');
  assert.equal(f.seatType.name, 'ctl00$ContentPlaceHolder1$ddlSeatType');
  assert.equal(f.gender.name, 'ctl00$ContentPlaceHolder1$ddlGender');
  assert.equal(f.round.name, 'ctl00$ContentPlaceHolder1$ddlRoundNo');
});

test('skips placeholder "Select ..." options', () => {
  const f = mod.discoverFields(FIXTURE);
  assert.deepEqual(f.year.options.map(o => o.text), ['2024', '2025', '2026']);
});

test('prefers option vocabulary over the name fallback when both would match', () => {
  const f = mod.discoverFields(FIXTURE);
  assert.equal(f.year.via, 'options');
  assert.equal(f.instType.via, 'options');
});

/* The state that broke the 2026-08-05 workflow run: the six controls are present, but
   JoSAA now serves them without options and fills them by postback. Vocabulary matching
   has nothing to bite on, so every lookup returned null and the probe declared the whole
   form missing. Note there is no gender control here — JoSAA dropped it. */
const EMPTY_SELECTS_FIXTURE = `
<html><body><form method="post" action="./openingclosingrankarchieve.aspx">
<input type="hidden" name="__VIEWSTATE" value="/wEPDwUKLTE5OTU4Nzc4NQ%3D%3D" />
<select name="ctl00$ContentPlaceHolder1$ddlYear"></select>
<select name="ctl00$ContentPlaceHolder1$ddlroundno"></select>
<select name="ctl00$ContentPlaceHolder1$ddlInstype"></select>
<select name="ctl00$ContentPlaceHolder1$ddlInstitute"></select>
<select name="ctl00$ContentPlaceHolder1$ddlBranch"></select>
<select name="ctl00$ContentPlaceHolder1$ddlSeatType"></select>
</form></body></html>`;

test('falls back to control names when the dropdowns arrive empty', () => {
  const f = mod.discoverFields(EMPTY_SELECTS_FIXTURE);
  assert.equal(f.year.name, 'ctl00$ContentPlaceHolder1$ddlYear');
  assert.equal(f.round.name, 'ctl00$ContentPlaceHolder1$ddlroundno');
  assert.equal(f.instType.name, 'ctl00$ContentPlaceHolder1$ddlInstype');
  assert.equal(f.seatType.name, 'ctl00$ContentPlaceHolder1$ddlSeatType');
  assert.equal(f.year.via, 'name');
});

test('reports the empty controls as having no options rather than inventing some', () => {
  const f = mod.discoverFields(EMPTY_SELECTS_FIXTURE);
  assert.deepEqual(f.year.options, []);
  assert.deepEqual(f.instType.options, []);
});

test('a missing gender control is absent, not fatal', () => {
  const f = mod.discoverFields(EMPTY_SELECTS_FIXTURE);
  assert.equal(f.gender, null);
  /* The three the ingest actually posts must still be found. */
  assert.ok(f.year && f.round && f.instType);
});

test('the name fallback ignores the ASP.NET container prefix', () => {
  const renamed = EMPTY_SELECTS_FIXTURE.replace(/ctl00\$ContentPlaceHolder1\$/g, 'ctl00$MainContent$');
  const f = mod.discoverFields(renamed);
  assert.equal(f.year.name, 'ctl00$MainContent$ddlYear');
  assert.equal(f.instType.name, 'ctl00$MainContent$ddlInstype');
});

test('does not mistake the institute or branch control for a required one', () => {
  const f = mod.discoverFields(EMPTY_SELECTS_FIXTURE);
  for (const key of ['year', 'round', 'instType', 'seatType']) {
    assert.notEqual(f[key].name, 'ctl00$ContentPlaceHolder1$ddlInstitute', `${key} matched ddlInstitute`);
    assert.notEqual(f[key].name, 'ctl00$ContentPlaceHolder1$ddlBranch', `${key} matched ddlBranch`);
  }
});

test('still finds nothing when the controls are genuinely gone', () => {
  const f = mod.discoverFields('<html><body><form><select name="ctl00$foo$ddlSomethingElse"></select></form></body></html>');
  assert.equal(f.year, null);
  assert.equal(f.instType, null);
});

test('parses the results grid', () => {
  const rows = mod.parseResultTable(FIXTURE);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].institute, 'Indian Institute of Technology Bombay');
  assert.equal(rows[0].quota, 'AI');
  assert.equal(rows[1].seatType, 'OBC-NCL');
  assert.equal(rows[2].gender, 'Female-only (including Supernumerary)');
});

test('parses ranks with thousands separators', () => {
  assert.equal(mod.parseRank('3,911'), 3911);
  assert.equal(mod.parseRank('41,882'), 41882);
  assert.equal(mod.parseRank('1'), 1);
});

test('rejects preparatory-course ranks rather than mangling them', () => {
  assert.equal(mod.parseRank('112P'), null);
  assert.equal(mod.parseRank('904P'), null);
});

test('treats blank and dash ranks as missing', () => {
  assert.equal(mod.parseRank('-'), null);
  assert.equal(mod.parseRank(''), null);
  assert.equal(mod.parseRank(null), null);
});

test('splits the branch suffix into name/years/degree', () => {
  const b = mod.splitBranch('Computer Science and Engineering (4 Years, Bachelor of Technology)');
  assert.equal(b.name, 'Computer Science and Engineering');
  assert.equal(b.years, 4);
  assert.equal(b.degree, 'Bachelor of Technology');
});

test('handles a branch with no suffix', () => {
  const b = mod.splitBranch('Chemical Engineering');
  assert.equal(b.name, 'Chemical Engineering');
  assert.equal(b.years, null);
});

test('classifies institute type from the name', () => {
  assert.equal(mod.instituteType('Indian Institute of Technology Bombay'), 'IIT');
  assert.equal(mod.instituteType('National Institute of Technology, Tiruchirappalli'), 'NIT');
  assert.equal(mod.instituteType('Indian Institute of Information Technology Allahabad'), 'IIIT');
  assert.equal(mod.instituteType('Birla Institute of Technology, Mesra'), 'GFTI');
});

test('decodes entities in cell text', () => {
  assert.equal(mod.stripTags('<td>Metallurgical &amp; Materials&nbsp;Engg.</td>'), 'Metallurgical & Materials Engg.');
});

/* ═══════════════════════════════════════════════════════════════════════════
   The postback conversation.

   The 13 August dump is the source for this fixture's shape: ddlYear arrives with
   options, the other five arrive empty, and there is a btnSubmit the old ingest never
   posted. That combination is why every filter returned the same "Not Available" page.
   ═══════════════════════════════════════════════════════════════════════════ */

const LIVE_SHAPE = `
<html><body><form method="post">
<input type="hidden" name="__VIEWSTATE" value="STATE-1" />
<input type="hidden" name="__VIEWSTATEGENERATOR" value="AD19A6D0" />
<input type="hidden" name="__EVENTVALIDATION" value="EV-1" />
<input type="hidden" name="ctl00$hdnSecKey" value="" />
<select name="ctl00$ContentPlaceHolder1$ddlYear">
  <option value="0">--Select--</option>
  <option value="2025">2025</option>
  <option value="2024" selected="selected">2024</option>
</select>
<select name="ctl00$ContentPlaceHolder1$ddlroundno"></select>
<select name="ctl00$ContentPlaceHolder1$ddlInstype"></select>
<select name="ctl00$ContentPlaceHolder1$ddlInstitute"></select>
<select name="ctl00$ContentPlaceHolder1$ddlBranch"></select>
<select name="ctl00$ContentPlaceHolder1$ddlSeatType"></select>
<input type="submit" name="ctl00$BtnCscLogin" value="CSC Login" />
<input type="submit" name="ctl00$ContentPlaceHolder1$btnSubmit" value="Submit" />
</form></body></html>`;

test('reads the value a control is actually sitting on', () => {
  const values = mod.extractSelectedValues(LIVE_SHAPE);
  assert.equal(values['ctl00$ContentPlaceHolder1$ddlYear'], '2024');
  /* An empty control still has to be echoed back, as empty. */
  assert.equal(values['ctl00$ContentPlaceHolder1$ddlroundno'], '');
});

test('falls back to the first option when nothing is marked selected', () => {
  const html = `<select name="x"><option value="0">--Select--</option><option value="9">Nine</option></select>`;
  assert.equal(mod.extractSelectedValues(html).x, '0');
});

test('finds the query button and ignores the login button beside it', () => {
  const button = mod.findSubmitButton(LIVE_SHAPE);
  assert.equal(button.name, 'ctl00$ContentPlaceHolder1$btnSubmit');
  assert.equal(button.value, 'Submit');
});

test('a page with no button at all reports none rather than guessing', () => {
  assert.equal(mod.findSubmitButton('<html><form></form></html>'), null);
});

test('a postback carries the current hidden state, not the first page it ever saw', () => {
  const session = new mod.FormSession(LIVE_SHAPE);
  session.load(LIVE_SHAPE.replace('STATE-1', 'STATE-2').replace('EV-1', 'EV-2'));
  const payload = session.buildPayload({ changed: 'ctl00$ContentPlaceHolder1$ddlYear', value: '2024' });
  assert.equal(payload.get('__VIEWSTATE'), 'STATE-2');
  assert.equal(payload.get('__EVENTVALIDATION'), 'EV-2');
});

test('a postback echoes every control on the form, not just the one that changed', () => {
  const session = new mod.FormSession(LIVE_SHAPE);
  const payload = session.buildPayload({ changed: 'ctl00$ContentPlaceHolder1$ddlYear', value: '2025' });
  for (const name of ['ddlYear', 'ddlroundno', 'ddlInstype', 'ddlInstitute', 'ddlBranch', 'ddlSeatType']) {
    assert.ok(payload.has('ctl00$ContentPlaceHolder1$' + name), name + ' was not echoed back');
  }
  assert.equal(payload.get('ctl00$ContentPlaceHolder1$ddlYear'), '2025');
  assert.equal(payload.get('ctl00$hdnSecKey'), '');
});

test('changing a control names it as __EVENTTARGET so the server runs that cascade step', () => {
  const session = new mod.FormSession(LIVE_SHAPE);
  const payload = session.buildPayload({ changed: 'ctl00$ContentPlaceHolder1$ddlInstype', value: 'IIT' });
  assert.equal(payload.get('__EVENTTARGET'), 'ctl00$ContentPlaceHolder1$ddlInstype');
  assert.ok(!payload.has('ctl00$ContentPlaceHolder1$btnSubmit'), 'a cascade step must not press Submit');
});

test('the query presses the button — the step the old ingest never took', () => {
  const session = new mod.FormSession(LIVE_SHAPE);
  const payload = session.buildPayload({ submit: true });
  assert.equal(payload.get('ctl00$ContentPlaceHolder1$btnSubmit'), 'Submit');
  /* A real button press leaves __EVENTTARGET empty; ASP.NET runs the handler because
     the button's name is present, and that is what builds the grid. */
  assert.equal(payload.get('__EVENTTARGET'), '');
});

test('a submit never carries the login button', () => {
  const session = new mod.FormSession(LIVE_SHAPE);
  const payload = session.buildPayload({ submit: true });
  assert.ok(!payload.has('ctl00$BtnCscLogin'));
});

test('an option that cannot be found stops the pull instead of picking something else', () => {
  const options = [{ value: '2025', text: '2025' }, { value: '2024', text: '2024' }];
  assert.equal(mod.chooseOption(options, o => o.text === '2024', 'year 2024').value, '2024');
  /* The old code fell back to the last option here, which meant asking for 2019 and
     silently recording 2024's ranks under it. */
  assert.throws(() => mod.chooseOption(options, o => o.text === '2019', 'year 2019'), /2019/);
});

test('"All" is preferred where the form offers it', () => {
  assert.equal(mod.chooseAll([{ value: '1', text: 'IIT Bombay' }, { value: 'ALL', text: 'All' }]).value, 'ALL');
  assert.equal(mod.chooseAll([{ value: '1', text: 'IIT Bombay' }]).value, '1');
  assert.equal(mod.chooseAll([]), null);
});

test('discovery still recognises the live form shape', () => {
  const fields = mod.discoverFields(LIVE_SHAPE);
  assert.equal(fields.year.name, 'ctl00$ContentPlaceHolder1$ddlYear');
  assert.equal(fields.instType.name, 'ctl00$ContentPlaceHolder1$ddlInstype');
  assert.equal(fields.round.name, 'ctl00$ContentPlaceHolder1$ddlroundno');
});

/* ═══════════════════════════════════════════════════════════════════════════
   The partial postback.

   Run #10's contract inspection found Sys.WebForms, PageRequestManager and
   UpdatePanel on the served page, and nothing writing ctl00$hdnSecKey. The
   dropdowns are in an UpdatePanel, so the browser sends an async postback and
   receives a delta — which is why a well-formed full postback was refused.
   ═══════════════════════════════════════════════════════════════════════════ */

const AJAX_PAGE = LIVE_SHAPE.replace('</form>', `
<script>
Sys.WebForms.PageRequestManager._initialize('ctl00$ScriptManager1', 'aspnetForm', ['tctl00$ContentPlaceHolder1$UpdatePanel1',''], [], [], 90, 'ctl00');
</script></form>`);

test('the ScriptManager and UpdatePanel ids are read off the page, not hardcoded', () => {
  const ajax = mod.discoverAjax(AJAX_PAGE);
  assert.equal(ajax.scriptManager, 'ctl00$ScriptManager1');
  assert.equal(ajax.formId, 'aspnetForm');
  // The 't'/'f' prefix marks always-update; it is not part of the id.
  assert.deepEqual(ajax.panels, ['ctl00$ContentPlaceHolder1$UpdatePanel1']);
});

test('a page with no ScriptManager reports none rather than inventing one', () => {
  assert.equal(mod.discoverAjax('<html><form></form></html>'), null);
});

test('an async postback names the panel and the trigger', () => {
  const session = new mod.FormSession(AJAX_PAGE);
  const payload = session.buildPayload({ changed: 'ctl00$ContentPlaceHolder1$ddlYear', value: '2024' });
  assert.equal(payload.get('ctl00$ScriptManager1'),
               'ctl00$ContentPlaceHolder1$UpdatePanel1|ctl00$ContentPlaceHolder1$ddlYear');
  assert.equal(payload.get('__ASYNCPOST'), 'true');
});

test('the submit is a partial postback too, triggered by the button', () => {
  const session = new mod.FormSession(AJAX_PAGE);
  const payload = session.buildPayload({ submit: true });
  assert.equal(payload.get('ctl00$ScriptManager1'),
               'ctl00$ContentPlaceHolder1$UpdatePanel1|ctl00$ContentPlaceHolder1$btnSubmit');
  assert.equal(payload.get('ctl00$ContentPlaceHolder1$btnSubmit'), 'Submit');
});

test('a form with no UpdatePanel posts normally', () => {
  const session = new mod.FormSession(LIVE_SHAPE);
  const payload = session.buildPayload({ submit: true });
  assert.ok(!payload.has('__ASYNCPOST'));
});

test('a delta is recognised and a page is not', () => {
  assert.equal(mod.looksLikeDelta('120|updatePanel|x|<div></div>|'), true);
  assert.equal(mod.looksLikeDelta('<html><body>Not Available</body></html>'), false);
  assert.equal(mod.looksLikeDelta(''), false);
});

test('a delta yields its panels and its refreshed hidden fields', () => {
  const panel = '<select name="ctl00$ContentPlaceHolder1$ddlroundno"><option value="1">1</option><option value="6">6</option></select>';
  const delta =
    panel.length + '|updatePanel|ctl00$ContentPlaceHolder1$UpdatePanel1|' + panel + '|' +
    '7|hiddenField|__VIEWSTATE|STATE-2|' +
    '4|hiddenField|__EVENTVALIDATION|EV-2|';

  const parsed = mod.parseAsyncDelta(delta);
  assert.equal(parsed.panels['ctl00$ContentPlaceHolder1$UpdatePanel1'], panel);
  assert.equal(parsed.hidden.__VIEWSTATE, 'STATE-2');
  assert.equal(parsed.hidden.__EVENTVALIDATION, 'EV-2');
  assert.equal(parsed.error, null);
});

test('content is sliced by its declared length, so a pipe inside HTML does not tear the parse', () => {
  const panel = '<div title="a|b">x</div>';
  const delta = panel.length + '|updatePanel|P1|' + panel + '|5|hiddenField|__VIEWSTATE|AFTER|';
  const parsed = mod.parseAsyncDelta(delta);
  assert.equal(parsed.panels.P1, panel);
  assert.equal(parsed.hidden.__VIEWSTATE, 'AFTER');
});

test('a server error inside a delta is surfaced, not read as an empty page', () => {
  const parsed = mod.parseAsyncDelta('27|error|500|Object reference not set|');
  assert.match(parsed.error, /Object reference/);
});

test('applying a delta refreshes both the controls and the state', () => {
  const session = new mod.FormSession(AJAX_PAGE);
  assert.equal(session.optionsFor('ctl00$ContentPlaceHolder1$ddlroundno').length, 0);

  const panel = '<select name="ctl00$ContentPlaceHolder1$ddlroundno"><option value="1">1</option><option value="6">6</option></select>';
  session.applyDelta({
    panels: { P1: panel },
    hidden: { __VIEWSTATE: 'STATE-2', __EVENTVALIDATION: 'EV-2' },
    error: null,
  });

  const options = session.optionsFor('ctl00$ContentPlaceHolder1$ddlroundno');
  assert.deepEqual(options.map(o => o.text), ['1', '6']);
  assert.equal(session.hidden.__VIEWSTATE, 'STATE-2');

  // And the next request carries the refreshed state, not the page's original.
  const payload = session.buildPayload({ changed: 'ctl00$ContentPlaceHolder1$ddlroundno', value: '6' });
  assert.equal(payload.get('__VIEWSTATE'), 'STATE-2');
  assert.equal(payload.get('ctl00$ContentPlaceHolder1$ddlroundno'), '6');
});

test('a delta keeps the ScriptManager wiring the full page established', () => {
  const session = new mod.FormSession(AJAX_PAGE);
  session.applyDelta({ panels: { P1: '<select name="x"></select>' }, hidden: {}, error: null });
  assert.equal(session.ajax.scriptManager, 'ctl00$ScriptManager1');
});


/* ------------------------------------------------------------- pacing -- */

/*
  Runs #11 to #14 all died the same way: the opening request succeeded and
  every one after it timed out at connect. A connect timeout happens before
  the request is written, so nothing about the postback can explain it — the
  variable is the address, not the payload. These pin the pacing that follows
  from that reading.
*/

test('a connect timeout is recognised however it is reported', () => {
  assert.equal(mod.isConnectTimeout(Object.assign(new Error('Connect timeout after 30000ms'), { code: 'CONNECT_TIMEOUT' })), true);
  assert.equal(mod.isConnectTimeout(Object.assign(new Error('x'), { code: 'UND_ERR_CONNECT_TIMEOUT' })), true);
  assert.equal(mod.isConnectTimeout(Object.assign(new Error('x'), { code: 'ETIMEDOUT' })), true);
  // undici buries the real code on the cause.
  assert.equal(mod.isConnectTimeout(Object.assign(new Error('fetch failed'), { cause: { code: 'ETIMEDOUT' } })), true);
});

test('an ordinary server error is not mistaken for a block', () => {
  assert.equal(mod.isConnectTimeout(new Error('HTTP 500')), false);
  assert.equal(mod.isConnectTimeout(new Error('HTTP 429')), false);
  assert.equal(mod.isConnectTimeout(new Error('socket hang up')), false);
  assert.equal(mod.isConnectTimeout(null), false);
  /* The distinction run #16 forced. A connected socket that goes quiet is a
     slow server; treating it as an unreachable address is what hid the real
     failure for four runs. */
  assert.equal(
    mod.isConnectTimeout(Object.assign(new Error('Connected and sent, then silence for 120000ms'),
                                       { code: 'RESPONSE_TIMEOUT' })),
    false,
    'a silent connected socket must not be read as a block');
});

test('a connect timeout backs off in minutes, an HTTP error in seconds', () => {
  const blocked = mod.backoffFor(Object.assign(new Error('Connect timeout'), { code: 'CONNECT_TIMEOUT' }), 0);
  const server  = mod.backoffFor(new Error('HTTP 500'), 0);
  assert.ok(blocked >= 60_000, `expected a minutes-long wait, got ${blocked}ms`);
  assert.ok(server <= 5_000, `expected a seconds-long wait, got ${server}ms`);
  assert.ok(blocked > server * 10);
});

test('the block backoff grows linearly, not exponentially', () => {
  const e = Object.assign(new Error('Connect timeout'), { code: 'CONNECT_TIMEOUT' });
  const waits = [0, 1, 2, 3].map(a => mod.backoffFor(e, a));
  assert.deepEqual(waits, waits.map((_, i) => mod.BLOCK_BACKOFF_MS * (i + 1)));
  // Doubling a 90s wait four times overruns the job without testing anything new.
  assert.ok(waits[3] < 8 * mod.BLOCK_BACKOFF_MS);
});

test('the retry schedule outlasts a block measured in minutes', () => {
  /*
    The point of the change. The old schedule was 2+4+8+16s — thirty seconds
    of patience against something that held for four minutes solid in run #14,
    which is why every run spent its retries inside the block and reported an
    outage.
  */
  const e = Object.assign(new Error('Connect timeout'), { code: 'CONNECT_TIMEOUT' });
  let total = 0;
  for (let attempt = 0; attempt < mod.MAX_RETRIES; attempt++) total += mod.backoffFor(e, attempt);
  assert.ok(total >= 5 * 60_000, `retries only cover ${Math.round(total / 1000)}s; run #14 blocked for 240s`);
});

test('the gap is jittered within its declared bounds', () => {
  for (let i = 0; i < 200; i++) {
    const gap = mod.nextGap();
    assert.ok(gap >= mod.REQUEST_GAP_MS, `${gap} below floor`);
    assert.ok(gap <= mod.REQUEST_GAP_MS + mod.REQUEST_JITTER_MS, `${gap} above ceiling`);
  }
});

test('the gap actually varies — a metronome is a signature', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(mod.nextGap());
  assert.ok(seen.size > 20, `only ${seen.size} distinct gaps in 200 draws`);
});

test('the pace is courteous but not glacial', () => {
  /*
    Run #16 showed there is no rate block, so the six-to-ten second gap
    written for that theory is no longer buying anything — at seventy-two
    requests it was ten minutes of pure waiting. It stays slower than the
    original burst because a government server running rank queries should
    not be hammered, and bounded because waiting is not free.
  */
  assert.ok(mod.REQUEST_GAP_MS > 1500, 'should still be slower than the original burst');
  assert.ok(mod.REQUEST_GAP_MS + mod.REQUEST_JITTER_MS <= 6000, 'but not a ten-minute crawl');
});

test('a slow server gets seconds, an unreachable one gets minutes', () => {
  const slow = mod.backoffFor(Object.assign(new Error('silence'), { code: 'RESPONSE_TIMEOUT' }), 0);
  const gone = mod.backoffFor(Object.assign(new Error('connect'), { code: 'CONNECT_TIMEOUT' }), 0);
  assert.ok(slow <= 5000, `a slow server should be retried soon, got ${slow}ms`);
  assert.ok(gone >= 60_000, `an unreachable address should wait, got ${gone}ms`);
});

test('the response budget outlasts a slow query, and the overall budget outlasts it', () => {
  /*
    The bug this replaces: the 30s handshake budget was being applied to the
    wait for a response, so every POST was abandoned at 30 seconds. The
    overall timer has to sit outside the response wait or it fires first and
    the log says the wrong thing again.
  */
  assert.ok(mod.RESPONSE_TIMEOUT_MS >= 90_000, 'a rank query needs longer than a form fetch');
  assert.ok(mod.REQUEST_TIMEOUT_MS > mod.RESPONSE_TIMEOUT_MS,
    'the overall budget must not pre-empt the response wait');
});

test('envInt falls back on anything that is not a non-negative integer', () => {
  const KEY = 'JOSAA_TEST_ONLY_KEY';
  const restore = process.env[KEY];
  try {
    for (const bad of [undefined, '', 'abc', '-1', 'NaN']) {
      if (bad === undefined) delete process.env[KEY]; else process.env[KEY] = bad;
      assert.equal(mod.envInt(KEY, 4242), 4242, `${JSON.stringify(bad)} should fall back`);
    }
    process.env[KEY] = '800';
    assert.equal(mod.envInt(KEY, 4242), 800);
    process.env[KEY] = '0';
    assert.equal(mod.envInt(KEY, 4242), 0, 'zero is a legitimate override');
  } finally {
    if (restore === undefined) delete process.env[KEY]; else process.env[KEY] = restore;
  }
});


test('the block budget is smaller than the job it runs inside', () => {
  /*
    Per-request patience and per-run patience are different budgets, and the
    first must not be allowed to eat the second. A full pull is ~72 requests at
    ~8s of pacing each (~10 min), and the workflow allows 45 minutes, so the
    waiting has to leave room for the pull itself and for the run to report
    what happened rather than dying on a timeout.
  */
  const JOB_MS = 45 * 60_000;
  const PACING_MS = 72 * (mod.REQUEST_GAP_MS + mod.REQUEST_JITTER_MS / 2);
  assert.ok(mod.BLOCK_BUDGET_MS + PACING_MS < JOB_MS,
    `budget ${mod.BLOCK_BUDGET_MS / 60000}min + pacing ${(PACING_MS / 60000).toFixed(1)}min must fit in 45min`);
});

test('one blocked request cannot spend the whole run waiting', () => {
  const e = Object.assign(new Error('Connect timeout'), { code: 'CONNECT_TIMEOUT' });
  let single = 0;
  for (let a = 0; a < mod.MAX_RETRIES; a++) single += mod.backoffFor(e, a);
  assert.ok(single > mod.BLOCK_BUDGET_MS,
    'the unclamped schedule should exceed the budget — otherwise the clamp is untested');
  assert.equal(mod.blockBudgetLeft(), mod.BLOCK_BUDGET_MS, 'a fresh run starts with the full budget');
});


/* ------------------------------------------------- institute walking -- */

/*
  Run #17: with All institutes x All branches x All seat types, JoSAA
  accepted the POST, held it ~127s and reset the connection, four times to
  the second. That is their server abandoning a query it cannot finish, so
  the query is cut per institute. These pin the part of that which can be
  tested without the live site: picking out the entries that name a real
  institute.
*/

test('placeholders and "All" are not institutes', () => {
  const opts = [
    { value: '',    text: '--Select Institute--' },
    { value: 'ALL', text: 'All' },
    { value: '101', text: 'Indian Institute of Technology Bombay' },
    { value: '102', text: 'Indian Institute of Technology Delhi' }
  ];
  const real = mod.realOptions(opts);
  assert.deepEqual(real.map(o => o.value), ['101', '102']);
});

test('an option with no value is a placeholder however it is worded', () => {
  const opts = [
    { value: '',    text: 'Select' },
    { value: '   ', text: 'Choose one' },
    { value: '55',  text: 'National Institute of Technology Kurukshetra' }
  ];
  assert.deepEqual(mod.realOptions(opts).map(o => o.text),
    ['National Institute of Technology Kurukshetra']);
});

test('an institute whose name starts with "All" is kept', () => {
  /*
    "All" is excluded on an exact match, not a prefix. The first version of
    this test used a name ending in "Allahabad", which an unanchored regex
    would also have kept — so it passed with the anchor removed and proved
    nothing. All India Institute of Medical Sciences is the case that
    actually distinguishes them.
  */
  const opts = [
    { value: 'ALL', text: 'All' },
    { value: '90',  text: 'All India Institute of Medical Sciences' },
    { value: '77',  text: 'Motilal Nehru National Institute of Technology Allahabad' }
  ];
  const real = mod.realOptions(opts);
  assert.deepEqual(real.map(o => o.value), ['90', '77'],
    'only the bare "All" entry is a filter; the rest are institutions');
});

test('an empty or missing list yields nothing rather than throwing', () => {
  assert.deepEqual(mod.realOptions([]), []);
  assert.deepEqual(mod.realOptions(undefined), []);
  assert.deepEqual(mod.realOptions([{ value:'', text:'' }]), []);
});

test('a session knows whether it still holds the institute control', () => {
  /*
    This is the check that decides whether the next institute costs two
    requests or five. Getting it wrong in the optimistic direction posts a
    form that is not there; the pessimistic direction just re-fetches.
  */
  const withForm = new mod.FormSession(AJAX_PAGE);
  assert.equal(typeof withForm.hasControl, 'function');

  const gone = new mod.FormSession('<html><body><p>Not Available</p></body></html>');
  assert.equal(gone.hasControl(/ddl_?institute$/i), false,
    'a results page with no form must report the control as gone');
});


/* --------------------------------------------------------- the probes -- */

test('the probes measure rather than retry', () => {
  /*
    Both probes exist because five theories died from being argued rather
    than measured. What makes them measurements is that they use requestOnce
    — one attempt — instead of request(), which retries. A retry would wait
    out the very thing being measured and turn a reading into a shrug, so
    this pins the distinction at the source level.
  */
  const src = fsSrc;
  const postProbe = src.slice(src.indexOf('async function postProbe'),
                              src.indexOf('/* ---', src.indexOf('async function postProbe') + 10));
  const pacing = src.slice(src.indexOf('async function pacingProbe'),
                           src.indexOf('/* ---', src.indexOf('async function pacingProbe') + 10));

  for (const [name, body] of [['postProbe', postProbe], ['pacingProbe', pacing]]) {
    assert.ok(body.includes('requestOnce('), `${name} should make bare attempts`);
    assert.ok(!/[^e]\brequest\(ARCHIVE/.test(body),
      `${name} must not call the retrying request()`);
  }
});

test('the POST probe varies one thing at a time', () => {
  const src = fsSrc;
  const body = src.slice(src.indexOf('async function postProbe'), src.indexOf('async function postProbe') + 4000);

  // The pair that isolates the async marker: same payload, header differs.
  assert.ok(body.includes("method: 'POST', body }"), 'needs a real-payload POST without the async header');
  assert.ok(body.includes("method: 'POST', body, async: true }"), 'needs the same payload with it');

  // The pair that isolates the method itself: nothing in the body at all.
  assert.ok(body.includes("method: 'POST', body: '' }"), 'needs an empty POST');

  // A GET before and after, or "did the POSTs cost us the address" is unanswerable.
  assert.ok((body.match(/requestOnce\(ARCHIVE\)/g) || []).length >= 2,
    'needs a control GET and a GET afterwards');
});


test('every cascade POST carries the partial-postback header', () => {
  /*
    Run #19, same payload one request apart on the same address:

      no X-MicrosoftAjax header   FAIL  126663ms  ECONNRESET
      with it                     ok       976ms  130 bytes

    The 126-second hang was a full postback sent to a form that only answers
    partial ones, and it was gated on discoverAjax finding a ScriptManager id
    that the live page does not literally contain. Regating it on anything
    discoverable is how this comes back, so the source is pinned: step() must
    not make the header conditional.
  */
  const step = fsSrc.slice(fsSrc.indexOf('async function step('),
                           fsSrc.indexOf('async function step(') + 2500);
  assert.ok(/async:\s*true/.test(step), 'step() must always request the partial postback');
  assert.ok(!/async:\s*Boolean\(/.test(step), 'the header must not be gated on discoverAjax');
  assert.ok(!/async:\s*session\.ajax/.test(step), 'nor on the session carrying an ajax record');
});

console.log(`\n${passed} passed`);
