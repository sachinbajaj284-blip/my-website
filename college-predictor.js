/* Lume Live — JoSAA college predictor.
 *
 * Data: data/josaa/manifest.json + one sharded cutoff file per (seat type × gender),
 * so a student downloads only the slice that applies to them.
 *
 * Two things this deliberately gets right, because getting them wrong produces
 * confident nonsense:
 *   1. IIT seats are allotted on JEE ADVANCED ranks; NIT/IIIT/GFTI seats on JEE MAIN
 *      ranks. They are different scales and must never be compared to each other.
 *   2. For reserved seat types JoSAA publishes CATEGORY ranks, not CRL. An OBC-NCL
 *      student must be compared on their OBC-NCL rank.
 */
(function () {
  'use strict';

  var DATA = 'data/josaa/';
  var WA = '917015671280';

  /* Classification bands, as a fraction of the closing rank. A rank comfortably better
     than last year's closing rank is safe; one just past it is still worth listing,
     because cutoffs move year to year. */
  var SAFE = 0.80;
  var REACH = 1.20;

  var state = {
    manifest: null,
    stateMap: null,
    shard: null,
    shardKey: null,
    results: null,
  };

  var $ = function (id) { return document.getElementById(id); };

  /* ----------------------------------------------------------------- loading -- */

  function getJSON(url) {
    return fetch(url, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' -> HTTP ' + r.status);
      return r.json();
    });
  }

  function loadManifest() {
    if (state.manifest) return Promise.resolve(state.manifest);
    return Promise.all([
      getJSON(DATA + 'manifest.json'),
      getJSON(DATA + 'institute-states.json').catch(function () { return null; })
    ]).then(function (both) {
      state.manifest = both[0];
      state.stateMap = both[1];
      return state.manifest;
    });
  }

  function loadShard(seatType, gender) {
    var key = seatType + '__' + gender;
    if (state.shardKey === key) return Promise.resolve(state.shard);
    var file = state.manifest.shards && state.manifest.shards[key];
    if (!file) return Promise.reject(new Error('No cutoff data published for ' + seatType + ' / ' + gender));
    return getJSON(DATA + file).then(function (shard) {
      state.shard = shard;
      state.shardKey = key;
      return shard;
    });
  }

  /* ------------------------------------------------------------- home state -- */

  var stateCache = null;
  function instituteState(name) {
    if (!state.stateMap) return null;
    if (!stateCache) stateCache = {};
    if (name in stateCache) return stateCache[name];
    var lower = name.toLowerCase();
    var found = null;
    var list = state.stateMap.institutes;
    for (var i = 0; i < list.length; i++) {
      if (lower.indexOf(list[i].match) !== -1) { found = list[i].state; break; }
    }
    stateCache[name] = found;
    return found;
  }

  /* Quota eligibility. AI is open to everyone; HS/OS depend on where the student lives.
     GO/JK/LA are special supernumerary quotas we do not model — excluded rather than
     guessed at. */
  function quotaAllowed(quota, instName, homeState) {
    if (quota === 'AI') return true;
    if (!homeState) return quota === 'HS' || quota === 'OS';
    var st = instituteState(instName);
    if (!st) return quota === 'HS' || quota === 'OS';
    if (quota === 'HS') return st === homeState;
    if (quota === 'OS') return st !== homeState;
    return false;
  }

  /* ----------------------------------------------------------------- predict -- */

  function predict(input) {
    var m = state.manifest, shard = state.shard;
    var cols = {};
    shard.cols.forEach(function (c, i) { cols[c] = i; });

    var latestYear = Math.max.apply(null, m.years);

    /* Collapse to one entry per (institute, branch, quota), keeping the latest year for
       the verdict and the older years for the trend line. */
    var groups = Object.create(null);
    shard.rows.forEach(function (row) {
      var inst = m.institutes[row[cols.inst]];
      if (!inst) return;
      var quota = m.quotas[row[cols.quota]];
      if (!quotaAllowed(quota, inst.n, input.homeState)) return;
      if (input.instTypes.length && input.instTypes.indexOf(inst.t) === -1) return;

      var key = row[cols.inst] + ':' + row[cols.branch] + ':' + row[cols.quota];
      var g = groups[key] || (groups[key] = { inst: inst, branchId: row[cols.branch], quota: quota, byYear: {} });
      g.byYear[row[cols.year]] = { open: row[cols.open], close: row[cols.close] };
    });

    var out = [];
    Object.keys(groups).forEach(function (key) {
      var g = groups[key];
      var latest = g.byYear[latestYear];
      if (!latest) return;

      /* The scale switch: IIT rows are Advanced ranks, everything else is Main. */
      var isIIT = g.inst.t === 'IIT';
      var rank = isIIT ? input.advancedRank : input.mainRank;
      if (rank == null) return;

      var band;
      if (rank <= latest.close * SAFE) band = 'safe';
      else if (rank <= latest.close) band = 'target';
      else if (rank <= latest.close * REACH) band = 'reach';
      else return;

      var branch = m.branches[g.branchId] || { n: 'Unknown' };
      var trend = m.years.map(function (y) {
        return g.byYear[y] ? { year: y, close: g.byYear[y].close } : null;
      }).filter(Boolean);

      out.push({
        institute: g.inst.n,
        type: g.inst.t,
        branch: branch.n,
        degree: branch.deg,
        quota: g.quota,
        scale: isIIT ? 'JEE Advanced' : 'JEE Main',
        close: latest.close,
        open: latest.open,
        band: band,
        trend: trend,
        margin: latest.close - rank
      });
    });

    /* Best cutoff first — that is the order students actually think in. */
    out.sort(function (a, b) { return a.close - b.close; });
    return { latestYear: latestYear, items: out };
  }

  /* -------------------------------------------------------------------- view -- */

  var BANDS = {
    safe: { label: 'Safe', hi: 'Comfortably within last year’s closing rank' },
    target: { label: 'Target', hi: 'Around last year’s closing rank' },
    reach: { label: 'Reach', hi: 'Just beyond last year’s closing rank' }
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmt(n) { return n.toLocaleString('en-IN'); }

  function renderTrend(trend) {
    if (trend.length < 2) return '';
    var parts = trend.map(function (t) {
      return '<span class="ty">' + t.year + '</span> ' + fmt(t.close);
    });
    return '<div class="trend">Closing rank: ' + parts.join(' · ') + '</div>';
  }

  function render(result, input) {
    var host = $('results');
    if (!result.items.length) {
      host.innerHTML = '<div class="card empty"><h3>No matches in this range</h3>' +
        '<p>Nothing in the published JoSAA data falls within reach of that rank for the filters you chose. ' +
        'Try widening the institute types, or check the rank and category you entered.</p></div>';
      $('resultsWrap').hidden = false;
      return;
    }

    var groupsHtml = ['safe', 'target', 'reach'].map(function (band) {
      var items = result.items.filter(function (i) { return i.band === band; });
      if (!items.length) return '';
      var rows = items.slice(0, 60).map(function (i) {
        return '<li class="row">' +
          '<div class="rmain"><div class="rinst">' + esc(i.institute) + '</div>' +
          '<div class="rbranch">' + esc(i.branch) + '</div>' +
          '<div class="rmeta"><span class="tag t-' + i.type + '">' + i.type + '</span>' +
          '<span class="tag">' + esc(i.quota) + ' quota</span>' +
          '<span class="tag">' + i.scale + ' rank</span></div>' +
          renderTrend(i.trend) + '</div>' +
          '<div class="rrank"><b>' + fmt(i.close) + '</b><small>' + result.latestYear + ' closing</small></div>' +
          '</li>';
      }).join('');
      var more = items.length > 60 ? '<p class="more">+ ' + (items.length - 60) + ' more in this band</p>' : '';
      return '<section class="band b-' + band + '"><h3><span class="bdot"></span>' + BANDS[band].label +
        ' <em>' + items.length + '</em></h3><p class="bhint">' + BANDS[band].hi + '</p>' +
        '<ul class="rows">' + rows + '</ul>' + more + '</section>';
    }).join('');

    host.innerHTML = groupsHtml;

    var counts = ['safe', 'target', 'reach'].map(function (b) {
      return result.items.filter(function (i) { return i.band === b; }).length;
    });
    $('summary').innerHTML = 'Based on <b>' + result.latestYear + '</b> JoSAA closing ranks: ' +
      '<b>' + counts[0] + '</b> safe, <b>' + counts[1] + '</b> target, <b>' + counts[2] + '</b> reach.';

    var waText = 'Hi, I used the Lume Live college predictor. My JEE Main rank is ' +
      (input.mainRank != null ? fmt(input.mainRank) : 'n/a') +
      (input.advancedRank != null ? ', JEE Advanced rank ' + fmt(input.advancedRank) : '') +
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
    var seatType = $('seatType').value;
    var gender = $('gender').value;
    var mainRaw = $('mainRank').value.replace(/[,\s]/g, '');
    var advRaw = $('advRank').value.replace(/[,\s]/g, '');
    var mainRank = mainRaw ? parseInt(mainRaw, 10) : null;
    var advancedRank = advRaw ? parseInt(advRaw, 10) : null;

    if (mainRank == null && advancedRank == null) {
      return { error: 'Enter at least one rank — JEE Main, JEE Advanced, or both.' };
    }
    if (mainRank != null && (!isFinite(mainRank) || mainRank < 1)) {
      return { error: 'That JEE Main rank does not look right. Enter it as a number, e.g. 24500.' };
    }
    if (advancedRank != null && (!isFinite(advancedRank) || advancedRank < 1)) {
      return { error: 'That JEE Advanced rank does not look right. Enter it as a number, e.g. 4200.' };
    }

    var instTypes = [];
    ['IIT', 'NIT', 'IIIT', 'GFTI'].forEach(function (t) {
      var box = $('t' + t);
      if (box && box.checked) instTypes.push(t);
    });

    return {
      seatType: seatType, gender: gender,
      mainRank: mainRank, advancedRank: advancedRank,
      homeState: $('homeState').value || null,
      instTypes: instTypes
    };
  }

  function run() {
    var input = readInput();
    if (input.error) { setStatus(input.error, 'err'); return; }

    setStatus('Loading published cutoffs…');
    loadManifest()
      .then(function () { return loadShard(input.seatType, input.gender); })
      .then(function () {
        setStatus('');
        state.results = predict(input);
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
    return loadManifest().then(function () {
      if (!state.stateMap) return;
      var sel = $('homeState');
      var entries = Object.keys(state.stateMap.states).map(function (code) {
        return { code: code, name: state.stateMap.states[code] };
      }).sort(function (a, b) { return a.name.localeCompare(b.name); });
      entries.forEach(function (e) {
        var opt = document.createElement('option');
        opt.value = e.code;
        opt.textContent = e.name;
        sel.appendChild(opt);
      });
    }).catch(function () { /* dataset absent — the form still works, HS quota just isn't filtered */ });
  }

  function populateSeatTypes() {
    if (!state.manifest || !state.manifest.seatTypes) return;
    var sel = $('seatType');
    var have = {};
    Array.prototype.forEach.call(sel.options, function (o) { have[o.value] = true; });
    state.manifest.seatTypes.forEach(function (st) {
      if (have[st]) return;
      var opt = document.createElement('option');
      opt.value = st; opt.textContent = st;
      sel.appendChild(opt);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('predictForm').addEventListener('submit', function (e) { e.preventDefault(); run(); });
    populateStates().then(populateSeatTypes);

    /* Advanced rank only matters if IITs are in play. */
    var iit = $('tIIT');
    var advRow = $('advRow');
    function syncAdv() { advRow.classList.toggle('dim', !iit.checked); }
    iit.addEventListener('change', syncAdv);
    syncAdv();
  });
})();
