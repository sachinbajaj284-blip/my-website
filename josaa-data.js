/* Lume Live — shared JoSAA dataset access.
 *
 * Used by college-predictor.js and choice-list.js. The eligibility and banding rules live
 * here rather than in each page, because two copies of "which quota can this student
 * claim" would eventually disagree, and both pages give admission advice.
 *
 * Exposes window.JosaaData.
 */
(function (global) {
  'use strict';

  var DATA = 'data/josaa/';

  /* Bands, as a fraction of the closing rank. A rank comfortably better than last year's
     closing rank is safe; one just past it is still worth listing, because cutoffs move. */
  var SAFE = 0.80;
  var REACH = 1.20;

  var cache = { manifest: null, stateMap: null, shard: null, shardKey: null, instState: {} };

  function getJSON(url) {
    return fetch(url, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' -> HTTP ' + r.status);
      return r.json();
    });
  }

  function loadManifest() {
    if (cache.manifest) return Promise.resolve(cache.manifest);
    return Promise.all([
      getJSON(DATA + 'manifest.json'),
      getJSON(DATA + 'institute-states.json').catch(function () { return null; })
    ]).then(function (both) {
      cache.manifest = both[0];
      cache.stateMap = both[1];
      return cache.manifest;
    });
  }

  function loadShard(seatType, gender) {
    var key = seatType + '__' + gender;
    if (cache.shardKey === key) return Promise.resolve(cache.shard);
    var file = cache.manifest && cache.manifest.shards && cache.manifest.shards[key];
    if (!file) return Promise.reject(new Error('No cutoff data published for ' + seatType + ' / ' + gender));
    return getJSON(DATA + file).then(function (shard) {
      cache.shard = shard;
      cache.shardKey = key;
      return shard;
    });
  }

  function manifest() { return cache.manifest; }
  function stateMap() { return cache.stateMap; }

  function instituteState(name) {
    if (!cache.stateMap) return null;
    if (name in cache.instState) return cache.instState[name];
    var lower = name.toLowerCase(), found = null;
    var list = cache.stateMap.institutes;
    for (var i = 0; i < list.length; i++) {
      if (lower.indexOf(list[i].match) !== -1) { found = list[i].state; break; }
    }
    cache.instState[name] = found;
    return found;
  }

  /* AI is open to everyone. HS/OS depend on where the student lives. GO/JK/LA are special
     supernumerary quotas we do not model — excluded rather than guessed at. */
  function quotaAllowed(quota, instName, homeState) {
    if (quota === 'AI') return true;
    if (!homeState) return quota === 'HS' || quota === 'OS';
    var st = instituteState(instName);
    if (!st) return quota === 'HS' || quota === 'OS';
    if (quota === 'HS') return st === homeState;
    if (quota === 'OS') return st !== homeState;
    return false;
  }

  /* The scale switch: IIT seats are allotted on JEE Advanced ranks, everything else on
     JEE Main. Returns null when the student did not supply the rank that applies. */
  function rankFor(instType, input) {
    return instType === 'IIT' ? input.advancedRank : input.mainRank;
  }

  function bandFor(rank, closingRank) {
    if (rank == null || closingRank == null) return null;
    if (rank <= closingRank * SAFE) return 'safe';
    if (rank <= closingRank) return 'target';
    if (rank <= closingRank * REACH) return 'reach';
    return 'out';
  }

  /* Collapse shard rows into one entry per (institute, branch, quota), keeping every year.
     `filter` may narrow by institute type. */
  function buildOptions(input, opts) {
    opts = opts || {};
    var m = cache.manifest, shard = cache.shard;
    var cols = {};
    shard.cols.forEach(function (c, i) { cols[c] = i; });

    var groups = Object.create(null);
    shard.rows.forEach(function (row) {
      var inst = m.institutes[row[cols.inst]];
      if (!inst) return;
      var quota = m.quotas[row[cols.quota]];
      if (!quotaAllowed(quota, inst.n, input.homeState)) return;
      if (opts.instTypes && opts.instTypes.length && opts.instTypes.indexOf(inst.t) === -1) return;

      var key = row[cols.inst] + ':' + row[cols.branch] + ':' + row[cols.quota];
      var g = groups[key] || (groups[key] = {
        key: key,
        instId: row[cols.inst],
        branchId: row[cols.branch],
        quotaId: row[cols.quota],
        inst: inst,
        branch: m.branches[row[cols.branch]] || { n: 'Unknown branch' },
        quota: quota,
        byYear: {}
      });
      g.byYear[row[cols.year]] = { open: row[cols.open], close: row[cols.close] };
    });

    var latestYear = Math.max.apply(null, m.years);
    var out = [];
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      var latest = g.byYear[latestYear];
      if (!latest) return;
      var rank = rankFor(g.inst.t, input);
      g.close = latest.close;
      g.open = latest.open;
      g.scale = g.inst.t === 'IIT' ? 'JEE Advanced' : 'JEE Main';
      g.rank = rank;
      g.band = bandFor(rank, latest.close);
      g.trend = m.years.map(function (y) {
        return g.byYear[y] ? { year: y, close: g.byYear[y].close } : null;
      }).filter(Boolean);
      out.push(g);
    });
    out.sort(function (a, b) { return a.close - b.close; });
    return { latestYear: latestYear, options: out };
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmt(n) { return Number(n).toLocaleString('en-IN'); }

  var QUOTA_LABEL = { AI: 'All India', HS: 'Home State', OS: 'Other State' };
  function quotaLabel(q) { return QUOTA_LABEL[q] || q; }

  /* Rank inputs are shared between the two tools, so parsing and validation live here too. */
  function parseRankInput(raw) {
    var s = String(raw == null ? '' : raw).replace(/[,\s]/g, '');
    if (!s) return { value: null };
    var n = parseInt(s, 10);
    if (!/^\d+$/.test(s) || !isFinite(n) || n < 1) return { error: true };
    return { value: n };
  }

  global.JosaaData = {
    SAFE: SAFE,
    REACH: REACH,
    loadManifest: loadManifest,
    loadShard: loadShard,
    manifest: manifest,
    stateMap: stateMap,
    instituteState: instituteState,
    quotaAllowed: quotaAllowed,
    rankFor: rankFor,
    bandFor: bandFor,
    buildOptions: buildOptions,
    parseRankInput: parseRankInput,
    esc: esc,
    fmt: fmt,
    quotaLabel: quotaLabel
  };
})(window);
