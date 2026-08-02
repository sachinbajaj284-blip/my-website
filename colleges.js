/* Lume Live — JoSAA college browse index.
 *
 * Reads data/josaa/manifest.json and lists every participating institute, filterable by
 * name, type and state.
 *
 * Institutes link to their generated static page under colleges/ ONLY when the manifest
 * records that those pages exist (pagesGeneratedAt). Ingesting the dataset and generating
 * the pages are separate steps, so without that guard a fresh ingest would leave this
 * page full of links to files that were never written.
 */
(function () {
  'use strict';

  var DATA = 'data/josaa/';
  var TYPE_ORDER = ['IIT', 'NIT', 'IIIT', 'GFTI'];
  var TYPE_LABEL = {
    IIT: 'Indian Institutes of Technology',
    NIT: 'National Institutes of Technology',
    IIIT: 'Indian Institutes of Information Technology',
    GFTI: 'Government Funded Technical Institutes'
  };

  var manifest = null, stateMap = null, hasPages = false;

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function getJSON(url) {
    return fetch(url, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' -> HTTP ' + r.status);
      return r.json();
    });
  }

  function setStatus(msg, kind) {
    var el = $('status');
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
    el.hidden = !msg;
  }

  /* Institute -> state code, matched on the same substrings the predictor uses. */
  var stateCache = {};
  function instituteState(name) {
    if (!stateMap) return null;
    if (name in stateCache) return stateCache[name];
    var lower = name.toLowerCase(), found = null;
    for (var i = 0; i < stateMap.institutes.length; i++) {
      if (lower.indexOf(stateMap.institutes[i].match) !== -1) { found = stateMap.institutes[i].state; break; }
    }
    stateCache[name] = found;
    return found;
  }

  function stateName(code) {
    return (stateMap && stateMap.states[code]) || null;
  }

  function render() {
    var q = $('q').value.trim().toLowerCase();
    var type = $('fType').value;
    var st = $('fState').value;

    var matches = manifest.institutes.filter(function (inst) {
      if (type && inst.t !== type) return false;
      if (q && inst.n.toLowerCase().indexOf(q) === -1) return false;
      if (st && instituteState(inst.n) !== st) return false;
      return true;
    });

    if (!matches.length) {
      $('list').innerHTML = '<p class="empty">No institutes match those filters.</p>';
      return;
    }

    var byType = {};
    matches.forEach(function (inst) { (byType[inst.t] = byType[inst.t] || []).push(inst); });

    var html = TYPE_ORDER.filter(function (t) { return byType[t]; }).map(function (t) {
      var items = byType[t].sort(function (a, b) { return a.n.localeCompare(b.n); }).map(function (inst) {
        var code = instituteState(inst.n);
        var nm = hasPages
          ? '<a class="nm" href="colleges/' + esc(inst.slug) + '.html">' + esc(inst.n) + '</a>'
          : '<span class="nm">' + esc(inst.n) + '</span>';
        return '<li>' + nm + '<div class="meta"><span class="tag t-' + inst.t + '">' + inst.t + '</span>' +
          (code ? '<span class="st">' + esc(stateName(code) || code) + '</span>' : '') +
          '</div></li>';
      }).join('');
      return '<h2 class="grouphead">' + TYPE_LABEL[t] + ' <em>' + byType[t].length + '</em></h2>' +
        '<ul class="instlist">' + items + '</ul>';
    }).join('');

    $('list').innerHTML = html;
  }

  function populateStates() {
    if (!stateMap) return;
    var present = {};
    manifest.institutes.forEach(function (inst) {
      var c = instituteState(inst.n);
      if (c) present[c] = true;
    });
    var sel = $('fState');
    Object.keys(present)
      .map(function (c) { return { code: c, name: stateName(c) || c }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); })
      .forEach(function (e) {
        var o = document.createElement('option');
        o.value = e.code; o.textContent = e.name;
        sel.appendChild(o);
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    setStatus('Loading institutes…');

    Promise.all([
      getJSON(DATA + 'manifest.json'),
      getJSON(DATA + 'institute-states.json').catch(function () { return null; })
    ]).then(function (both) {
      manifest = both[0];
      stateMap = both[1];
      hasPages = !!manifest.pagesGeneratedAt;
      setStatus('');
      populateStates();
      render();

      ['q', 'fType', 'fState'].forEach(function (id) {
        $(id).addEventListener('input', render);
        $(id).addEventListener('change', render);
      });
    }).catch(function (e) {
      setStatus(
        'College data is not available yet. The JoSAA dataset has not been published to this site — ' +
        'run tools/josaa-ingest.mjs, then tools/josaa-pages.mjs. (' + e.message + ')',
        'err'
      );
      $('list').innerHTML = '';
    });
  });
})();
