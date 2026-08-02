/* Lume Live — JoSAA college predictor.
 *
 * Shared dataset access, quota eligibility and banding live in josaa-data.js, so this file
 * and choice-list.js cannot drift on the rules.
 */
(function () {
  'use strict';

  var J = window.JosaaData;
  var WA = '917015671280';
  var HANDOFF_KEY = 'lume.josaa.input';

  var state = { results: null, input: null };

  var $ = function (id) { return document.getElementById(id); };

  /* -------------------------------------------------------------------- view -- */

  var BANDS = {
    safe: { label: 'Safe', hi: 'Comfortably within last year’s closing rank' },
    target: { label: 'Target', hi: 'Around last year’s closing rank' },
    reach: { label: 'Reach', hi: 'Just beyond last year’s closing rank' }
  };

  function renderTrend(trend) {
    if (trend.length < 2) return '';
    return '<div class="trend">Closing rank: ' + trend.map(function (t) {
      return '<span class="ty">' + t.year + '</span> ' + J.fmt(t.close);
    }).join(' · ') + '</div>';
  }

  function render(result, input) {
    var host = $('results');
    var shown = result.options.filter(function (o) { return o.band && o.band !== 'out'; });

    if (!shown.length) {
      host.innerHTML = '<div class="card empty"><h3>No matches in this range</h3>' +
        '<p>Nothing in the published JoSAA data falls within reach of that rank for the filters you chose. ' +
        'Try widening the institute types, or check the rank and category you entered.</p></div>';
      $('resultsWrap').hidden = false;
      return;
    }

    host.innerHTML = ['safe', 'target', 'reach'].map(function (band) {
      var items = shown.filter(function (i) { return i.band === band; });
      if (!items.length) return '';
      var rows = items.slice(0, 60).map(function (i) {
        return '<li class="row">' +
          '<div class="rmain"><div class="rinst">' + J.esc(i.inst.n) + '</div>' +
          '<div class="rbranch">' + J.esc(i.branch.n) + '</div>' +
          '<div class="rmeta"><span class="tag t-' + i.inst.t + '">' + i.inst.t + '</span>' +
          '<span class="tag">' + J.esc(J.quotaLabel(i.quota)) + ' quota</span>' +
          '<span class="tag">' + i.scale + ' rank</span></div>' +
          renderTrend(i.trend) + '</div>' +
          '<div class="rrank"><b>' + J.fmt(i.close) + '</b><small>' + result.latestYear + ' closing</small></div>' +
          '</li>';
      }).join('');
      var more = items.length > 60 ? '<p class="more">+ ' + (items.length - 60) + ' more in this band</p>' : '';
      return '<section class="band b-' + band + '"><h3><span class="bdot"></span>' + BANDS[band].label +
        ' <em>' + items.length + '</em></h3><p class="bhint">' + BANDS[band].hi + '</p>' +
        '<ul class="rows">' + rows + '</ul>' + more + '</section>';
    }).join('');

    var counts = ['safe', 'target', 'reach'].map(function (b) {
      return shown.filter(function (i) { return i.band === b; }).length;
    });
    $('summary').innerHTML = 'Based on <b>' + result.latestYear + '</b> JoSAA closing ranks: ' +
      '<b>' + counts[0] + '</b> safe, <b>' + counts[1] + '</b> target, <b>' + counts[2] + '</b> reach.';

    var waText = 'Hi, I used the Lume Live college predictor. My JEE Main rank is ' +
      (input.mainRank != null ? J.fmt(input.mainRank) : 'n/a') +
      (input.advancedRank != null ? ', JEE Advanced rank ' + J.fmt(input.advancedRank) : '') +
      ' (' + input.seatType + '). I would like help choosing between my options.';
    $('waCta').href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(waText);

    $('resultsWrap').hidden = false;
    if (window.gtag) {
      gtag('event', 'predictor_result', { safe: counts[0], target: counts[1], reach: counts[2] });
    }
    $('resultsWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setStatus(msg, kind) {
    var el = $('status');
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
    el.hidden = !msg;
  }

  /* -------------------------------------------------------------------- init -- */

  function readInput() {
    var main = J.parseRankInput($('mainRank').value);
    var adv = J.parseRankInput($('advRank').value);

    if (main.error) return { error: 'That JEE Main rank does not look right. Enter it as a number, e.g. 24500.' };
    if (adv.error) return { error: 'That JEE Advanced rank does not look right. Enter it as a number, e.g. 4200.' };
    if (main.value == null && adv.value == null) {
      return { error: 'Enter at least one rank — JEE Main, JEE Advanced, or both.' };
    }

    var instTypes = [];
    ['IIT', 'NIT', 'IIIT', 'GFTI'].forEach(function (t) {
      var box = $('t' + t);
      if (box && box.checked) instTypes.push(t);
    });

    return {
      seatType: $('seatType').value,
      gender: $('gender').value,
      mainRank: main.value,
      advancedRank: adv.value,
      homeState: $('homeState').value || null,
      instTypes: instTypes
    };
  }

  function run() {
    var input = readInput();
    if (input.error) { setStatus(input.error, 'err'); return; }

    setStatus('Loading published cutoffs…');
    J.loadManifest()
      .then(function () { return J.loadShard(input.seatType, input.gender); })
      .then(function () {
        setStatus('');
        state.input = input;
        state.results = J.buildOptions(input, { instTypes: input.instTypes });
        /* Hand the inputs to the choice-list builder so a student does not retype them. */
        try { localStorage.setItem(HANDOFF_KEY, JSON.stringify(input)); } catch (e) { /* private mode */ }
        render(state.results, input);
      })
      .catch(function (e) {
        setStatus(
          'Cutoff data is not available yet. ' +
          'The JoSAA dataset has not been published to this site — run tools/josaa-ingest.mjs. (' + e.message + ')',
          'err'
        );
        $('resultsWrap').hidden = true;
      });
  }

  function populateStates() {
    return J.loadManifest().then(function () {
      var sm = J.stateMap();
      if (!sm) return;
      var sel = $('homeState');
      Object.keys(sm.states)
        .map(function (code) { return { code: code, name: sm.states[code] }; })
        .sort(function (a, b) { return a.name.localeCompare(b.name); })
        .forEach(function (e) {
          var opt = document.createElement('option');
          opt.value = e.code;
          opt.textContent = e.name;
          sel.appendChild(opt);
        });
    }).catch(function () { /* dataset absent — the form still works, HS quota just isn't filtered */ });
  }

  function populateSeatTypes() {
    var m = J.manifest();
    if (!m || !m.seatTypes) return;
    var sel = $('seatType');
    var have = {};
    Array.prototype.forEach.call(sel.options, function (o) { have[o.value] = true; });
    m.seatTypes.forEach(function (st) {
      if (have[st]) return;
      var opt = document.createElement('option');
      opt.value = st; opt.textContent = st;
      sel.appendChild(opt);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('predictForm').addEventListener('submit', function (e) { e.preventDefault(); run(); });
    populateStates().then(populateSeatTypes);

    var iit = $('tIIT');
    var advRow = $('advRow');
    function syncAdv() { advRow.classList.toggle('dim', !iit.checked); }
    iit.addEventListener('change', syncAdv);
    syncAdv();
  });
})();
