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

/* josaa-ingest.mjs runs on import, so lift the pure helpers out rather than importing it. */
const lift = name => {
  const re = new RegExp(`(?:^|\\n)(?:const|function|class)\\s+${name}\\b[\\s\\S]*?(?=\\n(?:const|function|async function|class|/\\*|let)\\s)`, 'm');
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
${lift('FormSession')}
${lift('chooseOption')}
${lift('chooseAll')}
export { decodeEntities, stripTags, extractHiddenFields, extractSelects, discoverFields, parseResultTable, parseRank, splitBranch, instituteType, extractSelectedValues, findSubmitButton, FormSession, chooseOption, chooseAll };
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

console.log(`\n${passed} passed`);
