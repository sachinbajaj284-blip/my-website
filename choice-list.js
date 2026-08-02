/* Lume Live — JoSAA choice filling helper.
 *
 * The whole tool rests on one rule of JoSAA seat allotment: the system walks DOWN your
 * choice list and stops at the first choice your rank qualifies for.
 *
 * Two consequences, and they pull in opposite directions:
 *
 *   - Listing an ambitious choice high costs nothing. If you do not qualify it is skipped.
 *     Students routinely down-rank their real first preference out of a fear that has no
 *     basis in the algorithm.
 *   - A SAFE choice high in the list is a wall. Because allotment stops there, every
 *     choice below it becomes unreachable — including ones the student would much rather
 *     have had. This is the expensive mistake, and it is what this tool exists to catch.
 *
 * So the analysis is not "is this list optimal" — that depends on preferences only the
 * student has. It is "does the ORDER of this list contradict the preferences it implies".
 */
(function () {
  'use strict';

  var J = window.JosaaData;
  var WA = '917015671280';
  var HANDOFF_KEY = 'lume.josaa.input';
  var SAVE_KEY = 'lume.josaa.choices';
  var THIN_LIST = 10;

  var state = { input: null, options: [], byKey: {}, chosen: [], latestYear: null };

  var $ = function (id) { return document.getElementById(id); };

  /* ------------------------------------------------------------- persistence -- */

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        input: state.input,
        keys: state.chosen.map(function (c) { return c.key; })
      }));
    } catch (e) { /* private mode — the tool still works, it just will not persist */ }
  }

  function loadSaved() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; }
  }

  function loadHandoff() {
    try { return JSON.parse(localStorage.getItem(HANDOFF_KEY) || 'null'); } catch (e) { return null; }
  }

  /* ---------------------------------------------------------------- analysis -- */

  var BAND_LABEL = { safe: 'Safe', target: 'Target', reach: 'Reach', out: 'Out of range' };

  function analyse(chosen) {
    var issues = [];
    var flags = {};

    var firstSafe = -1;
    for (var i = 0; i < chosen.length; i++) {
      if (chosen[i].band === 'safe') { firstSafe = i; break; }
    }

    /* The costly mistake: something you would rather have, sitting below a safe choice
       that will be allotted before the list ever gets there. */
    if (firstSafe >= 0) {
      var buried = [];
      for (var k = firstSafe + 1; k < chosen.length; k++) {
        if (chosen[k].band === 'target' || chosen[k].band === 'reach') {
          buried.push(k);
          flags[k] = 'Unreachable where it is. Choice ' + (firstSafe + 1) + ' is safe, so allotment stops there ' +
            'and never reaches this one. If you would genuinely rather have this, move it above choice ' +
            (firstSafe + 1) + ' — doing so cannot cost you that safe seat.';
        }
      }
      if (buried.length) {
        issues.push({
          severity: 'high',
          title: 'You have buried ' + buried.length + ' ' + (buried.length === 1 ? 'choice' : 'choices') + ' you may want more',
          body: 'Choice ' + (firstSafe + 1) + ' (' + chosen[firstSafe].inst.n + ') is comfortably within your rank, so ' +
            'allotment will almost certainly stop there. Everything listed below it — including ' +
            buried.length + ' ' + (buried.length === 1 ? 'option' : 'options') + ' you are not yet assured of — ' +
            'cannot reach you. Move the ones you actually prefer above choice ' + (firstSafe + 1) + '. ' +
            'There is no penalty for aiming high.'
        });
      }
    }

    /* The opposite failure: an all-ambition list that can end in no seat at all. */
    if (chosen.length && firstSafe < 0) {
      issues.push({
        severity: 'high',
        title: 'Your list has no floor',
        body: 'Not one choice here is comfortably within your rank. If none of them come through you may end the ' +
          'round with no allotment. Add at least two or three options where your rank sits well inside last ' +
          'year’s closing rank, and put them at the bottom — they cost you nothing up there.'
      });
    }

    if (chosen.length && chosen.length < THIN_LIST) {
      issues.push({
        severity: 'medium',
        title: 'This list is short',
        body: 'You have ' + chosen.length + ' ' + (chosen.length === 1 ? 'choice' : 'choices') + '. JoSAA sets no ' +
          'limit and a longer list carries no risk — every extra option below the ones you want is a free safety ' +
          'net. Most students who end up unallotted simply did not fill enough.'
      });
    }

    /* Anything after the first safe choice that is also safe is inert — worth knowing,
       but not a mistake. */
    if (firstSafe >= 0 && firstSafe < chosen.length - 1) {
      var tail = chosen.length - 1 - firstSafe;
      var buriedCount = Object.keys(flags).length;
      if (tail > buriedCount) {
        issues.push({
          severity: 'low',
          title: (tail - buriedCount) + ' ' + (tail - buriedCount === 1 ? 'choice is' : 'choices are') + ' unlikely to be used',
          body: 'They sit below choice ' + (firstSafe + 1) + ', which is already safe. Keeping them is harmless — ' +
            'they are your backup if cutoffs move against you this year.'
        });
      }
    }

    if (chosen.length && !issues.some(function (i) { return i.severity === 'high'; })) {
      issues.push({
        severity: 'good',
        title: 'The order looks sound',
        body: firstSafe >= 0
          ? 'Your ambitious choices sit above your safe ones, which is exactly the right shape. Nothing you want ' +
            'is trapped below a seat you are already assured of.'
          : 'Nothing is buried below a safe choice.'
      });
    }

    return { issues: issues, flags: flags, firstSafe: firstSafe };
  }

  /* -------------------------------------------------------------------- view -- */

  function optionMeta(o) {
    return '<span class="tag t-' + o.inst.t + '">' + o.inst.t + '</span>' +
      '<span class="tag">' + J.esc(J.quotaLabel(o.quota)) + '</span>' +
      (o.band && o.band !== 'out' ? '<span class="tag band-' + o.band + '">' + BAND_LABEL[o.band] + '</span>' : '');
  }

  function renderSearch() {
    var q = $('q').value.trim().toLowerCase();
    var band = $('fBand').value;
    var host = $('results');

    if (!q && !band) { host.innerHTML = ''; return; }

    var chosenKeys = {};
    state.chosen.forEach(function (c) { chosenKeys[c.key] = true; });

    var terms = q.split(/\s+/).filter(Boolean);
    var matches = state.options.filter(function (o) {
      if (!o.band || o.band === 'out') return false;
      if (band && o.band !== band) return false;
      if (!terms.length) return true;
      var hay = (o.inst.n + ' ' + o.branch.n + ' ' + o.inst.t).toLowerCase();
      return terms.every(function (t) { return hay.indexOf(t) !== -1; });
    }).slice(0, 40);

    if (!matches.length) {
      host.innerHTML = '<li><span class="ob">No options match that within your rank range.</span></li>';
      return;
    }

    host.innerHTML = matches.map(function (o) {
      var added = chosenKeys[o.key];
      return '<li><div><div class="oi">' + J.esc(o.inst.n) + '</div>' +
        '<div class="ob">' + J.esc(o.branch.n) + '</div>' +
        '<div class="om">' + optionMeta(o) +
        '<span class="tag">' + state.latestYear + ' close ' + J.fmt(o.close) + '</span></div></div>' +
        '<button class="addbtn" data-add="' + J.esc(o.key) + '"' + (added ? ' disabled' : '') + '>' +
        (added ? 'Added' : 'Add') + '</button></li>';
    }).join('');
  }

  function renderChoices() {
    var host = $('choices');
    $('count').textContent = state.chosen.length;
    $('emptyHint').hidden = state.chosen.length > 0;

    /* Step 3 lights up once there is a list to order. */
    var steps = document.querySelectorAll('.step');
    if (steps.length === 3) steps[2].classList.toggle('on', state.chosen.length > 0);

    if (!state.chosen.length) {
      host.innerHTML = '';
      $('verdict').hidden = true;
      save();
      return;
    }

    var result = analyse(state.chosen);

    host.innerHTML = state.chosen.map(function (o, i) {
      var cls = [];
      if (result.flags[i]) cls.push('flagged');
      if (i === result.firstSafe) cls.push('likely');
      var trend = o.trend.length > 1
        ? o.trend.map(function (t) { return t.year + ' ' + J.fmt(t.close); }).join(' · ')
        : state.latestYear + ' ' + J.fmt(o.close);
      return '<li class="' + cls.join(' ') + '">' +
        '<span class="num"></span>' +
        '<div class="cmain">' +
        '<div class="cinst">' + J.esc(o.inst.n) + '</div>' +
        '<div class="cbranch">' + J.esc(o.branch.n) + '</div>' +
        '<div class="cmeta">' + optionMeta(o) + '<span class="tag">' + o.scale + '</span></div>' +
        '<div class="cclose">Closing rank: ' + trend + '</div>' +
        (result.flags[i] ? '<div class="cflag">' + J.esc(result.flags[i]) + '</div>' : '') +
        '</div>' +
        '<div class="cctl">' +
        '<button data-move="' + i + '" data-dir="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move choice ' + (i + 1) + ' up">▲</button>' +
        '<button data-move="' + i + '" data-dir="1"' + (i === state.chosen.length - 1 ? ' disabled' : '') + ' aria-label="Move choice ' + (i + 1) + ' down">▼</button>' +
        '<button class="rm" data-remove="' + i + '" aria-label="Remove choice ' + (i + 1) + '">✕</button>' +
        '</div></li>';
    }).join('');

    renderVerdict(result);
    save();
  }

  function renderVerdict(result) {
    var v = $('verdict');
    v.hidden = false;

    if (result.firstSafe >= 0) {
      var likely = state.chosen[result.firstSafe];
      $('verdictTitle').textContent = 'Most likely outcome: choice ' + (result.firstSafe + 1);
      $('verdictBody').innerHTML = 'On last year’s numbers your rank clears <span class="big">' +
        J.esc(likely.inst.n) + ' — ' + J.esc(likely.branch.n) + '</span> comfortably. ' +
        'You would be allotted that, or something above it on your list if a cutoff moves your way.';
    } else {
      $('verdictTitle').textContent = 'No assured outcome on this list';
      $('verdictBody').textContent =
        'Every choice here needs a cutoff to move in your favour. That can work out, but it can also end in no seat.';
    }

    $('issues').innerHTML = result.issues.map(function (is) {
      return '<li class="' + is.severity + '"><b>' + (
        is.severity === 'high' ? 'Fix this' :
        is.severity === 'medium' ? 'Worth doing' :
        is.severity === 'good' ? 'Looks right' : 'For information'
      ) + '</b>' + J.esc(is.title) + '. ' + J.esc(is.body) + '</li>';
    }).join('');

    $('waCta').href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(listAsText());
  }

  function listAsText() {
    var head = 'My JoSAA choice list (built with Lume Live)\n' +
      'Rank: ' + (state.input.mainRank != null ? 'JEE Main ' + J.fmt(state.input.mainRank) : '') +
      (state.input.advancedRank != null ? (state.input.mainRank != null ? ', ' : '') + 'JEE Advanced ' + J.fmt(state.input.advancedRank) : '') +
      ' · ' + state.input.seatType + '\n\n';
    var body = state.chosen.map(function (o, i) {
      return (i + 1) + '. ' + o.inst.n + ' — ' + o.branch.n +
        ' (' + J.quotaLabel(o.quota) + ', ' + BAND_LABEL[o.band] + ')';
    }).join('\n');
    return head + body;
  }

  function setStatus(msg, kind) {
    var el = $('status');
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
    el.hidden = !msg;
  }

  /* -------------------------------------------------------------------- wire -- */

  function readInput() {
    var main = J.parseRankInput($('mainRank').value);
    var adv = J.parseRankInput($('advRank').value);
    if (main.error) return { error: 'That JEE Main rank does not look right. Enter it as a number, e.g. 24500.' };
    if (adv.error) return { error: 'That JEE Advanced rank does not look right. Enter it as a number, e.g. 4200.' };
    if (main.value == null && adv.value == null) {
      return { error: 'Enter at least one rank — JEE Main, JEE Advanced, or both.' };
    }
    return {
      seatType: $('seatType').value,
      gender: $('gender').value,
      mainRank: main.value,
      advancedRank: adv.value,
      homeState: $('homeState').value || null
    };
  }

  function load(input, restoreKeys) {
    setStatus('Loading published cutoffs…');
    return J.loadManifest()
      .then(function () { return J.loadShard(input.seatType, input.gender); })
      .then(function () {
        var built = J.buildOptions(input, {});
        state.input = input;
        state.options = built.options;
        state.latestYear = built.latestYear;
        state.byKey = {};
        built.options.forEach(function (o) { state.byKey[o.key] = o; });

        /* Keys can disappear after a dataset refresh — drop them rather than break. */
        state.chosen = (restoreKeys || [])
          .map(function (k) { return state.byKey[k]; })
          .filter(Boolean);

        setStatus('');
        $('builder').hidden = false;
        document.querySelectorAll('.step').forEach(function (s, i) { s.classList.toggle('on', i < 2); });
        renderSearch();
        renderChoices();
      })
      .catch(function (e) {
        setStatus(
          'Cutoff data is not available yet. The JoSAA dataset has not been published to this site — ' +
          'run tools/josaa-ingest.mjs. (' + e.message + ')', 'err');
        $('builder').hidden = true;
      });
  }

  function move(i, dir) {
    var j = i + dir;
    if (j < 0 || j >= state.chosen.length) return;
    var tmp = state.chosen[i];
    state.chosen[i] = state.chosen[j];
    state.chosen[j] = tmp;
    renderChoices();
  }

  function populateStates() {
    return J.loadManifest().then(function () {
      var sm = J.stateMap();
      if (!sm) return;
      var sel = $('homeState');
      Object.keys(sm.states)
        .map(function (c) { return { code: c, name: sm.states[c] }; })
        .sort(function (a, b) { return a.name.localeCompare(b.name); })
        .forEach(function (e) {
          var o = document.createElement('option');
          o.value = e.code; o.textContent = e.name;
          sel.appendChild(o);
        });
    }).catch(function () { /* dataset absent; form still usable */ });
  }

  function applyInputToForm(input) {
    if (input.mainRank != null) $('mainRank').value = input.mainRank;
    if (input.advancedRank != null) $('advRank').value = input.advancedRank;
    if (input.seatType) $('seatType').value = input.seatType;
    if (input.gender) $('gender').value = input.gender;
    if (input.homeState) $('homeState').value = input.homeState;
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('setupForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = readInput();
      if (input.error) { setStatus(input.error, 'err'); return; }
      load(input, state.chosen.map(function (c) { return c.key; }));
    });

    $('q').addEventListener('input', renderSearch);
    $('fBand').addEventListener('change', renderSearch);

    $('results').addEventListener('click', function (e) {
      var key = e.target.getAttribute && e.target.getAttribute('data-add');
      if (!key) return;
      var o = state.byKey[key];
      if (!o || state.chosen.some(function (c) { return c.key === key; })) return;
      state.chosen.push(o);
      renderSearch();
      renderChoices();
      if (window.gtag) gtag('event', 'choice_added', { count: state.chosen.length });
    });

    $('choices').addEventListener('click', function (e) {
      var t = e.target;
      if (!t.getAttribute) return;
      var mv = t.getAttribute('data-move');
      if (mv !== null) { move(parseInt(mv, 10), parseInt(t.getAttribute('data-dir'), 10)); return; }
      var rm = t.getAttribute('data-remove');
      if (rm !== null) {
        state.chosen.splice(parseInt(rm, 10), 1);
        renderSearch();
        renderChoices();
      }
    });

    $('copyBtn').addEventListener('click', function () {
      var text = listAsText();
      var done = function () { $('copyBtn').textContent = 'Copied'; setTimeout(function () { $('copyBtn').textContent = 'Copy as text'; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, done);
      } else { done(); }
    });
    $('printBtn').addEventListener('click', function () { window.print(); });
    $('clearBtn').addEventListener('click', function () {
      if (!window.confirm('Clear your whole choice list?')) return;
      state.chosen = [];
      renderSearch();
      renderChoices();
    });

    /* Prefill from a saved list first, otherwise from the predictor handoff. */
    populateStates().then(function () {
      var saved = loadSaved();
      if (saved && saved.input) {
        applyInputToForm(saved.input);
        return load(saved.input, saved.keys);
      }
      var handoff = loadHandoff();
      if (handoff) {
        applyInputToForm(handoff);
        return load(handoff, []);
      }
    });
  });
})();
