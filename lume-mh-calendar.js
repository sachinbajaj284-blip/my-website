/* ──────────────────────────────────────────────────────────────────────────
   Lume Live — Mental Health Awareness Calendar: renderer
   ----------------------------------------------------------------------------
   Reads window.LUME_MH_CALENDAR (from mh-calendar-data.js) and renders:
     • the homepage band        → into #mh-today
     • the full calendar page   → into #mh-calendar-full
   Content lives in mh-calendar-data.js; you should not need to edit this file
   to change what the calendar says.

   Date logic is annual (the year is ignored). Selection cascade for the band:
     1. a single-day event that is TODAY        → "Today" badge
     2. a multi-day range active today          → "Happening now"
        (if two ranges overlap, the shorter one wins — it is more specific)
     3. otherwise the NEXT upcoming event        → "In N days" countdown

   QA hook: append ?mhdate=MM-DD to any URL to pretend today is that date, e.g.
   index.html?mhdate=10-10 to preview World Mental Health Day.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  var DATA = window.LUME_MH_CALENDAR;
  if (!DATA || !DATA.entries || !DATA.entries.length) return;

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
  var MON_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var CAT_SLUG = {
    'Exam stress': 'exam', 'Anxiety': 'anxiety', 'Self-care': 'selfcare',
    'Crisis': 'crisis', 'Awareness': 'awareness'
  };
  var CAT_ICON = {
    'Exam stress': '📚', 'Anxiety': '🌊', 'Self-care': '🌿',
    'Crisis': '🆘', 'Awareness': '💡'
  };
  var SITE = 'https://lumelive.co.in';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // "MM-DD" -> {m, d, key: m*100+d, ord: day-of-year in a non-leap reference year}
  function parse(mmdd) {
    var p = String(mmdd).split('-');
    var m = parseInt(p[0], 10), d = parseInt(p[1], 10);
    var ord = Math.round((new Date(2001, m - 1, d) - new Date(2001, 0, 1)) / 86400000);
    return { m: m, d: d, key: m * 100 + d, ord: ord };
  }

  function fmt(mmdd) { var p = parse(mmdd); return p.d + ' ' + MON_ABBR[p.m - 1]; }

  function fmtRange(s, e) {
    if (s === e) return fmt(s);
    var ps = parse(s), pe = parse(e);
    if (ps.m === pe.m) return ps.d + '–' + pe.d + ' ' + MON_ABBR[ps.m - 1];
    return fmt(s) + ' – ' + fmt(e);
  }

  function span(s, e) {
    var ps = parse(s), pe = parse(e);
    return pe.ord >= ps.ord ? (pe.ord - ps.ord) : (365 - ps.ord + pe.ord);
  }

  function inRange(todayKey, s, e) {
    var ps = parse(s), pe = parse(e);
    if (ps.key <= pe.key) return todayKey >= ps.key && todayKey <= pe.key;
    return todayKey >= ps.key || todayKey <= pe.key; // wrap (e.g. Dec–Jan)
  }

  // Whole days from today until the next annual occurrence of start (0 = today).
  function daysUntil(start, today) {
    var p = parse(start);
    var t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var target = new Date(today.getFullYear(), p.m - 1, p.d);
    var diff = Math.round((target - t0) / 86400000);
    if (diff < 0) {
      target = new Date(today.getFullYear() + 1, p.m - 1, p.d);
      diff = Math.round((target - t0) / 86400000);
    }
    return diff;
  }

  function today() {
    var m = (location.search.match(/[?&]mhdate=(\d{1,2})-(\d{1,2})/));
    if (m) return new Date(new Date().getFullYear(), parseInt(m[1], 10) - 1, parseInt(m[2], 10));
    return new Date();
  }

  // Pick the single entry to feature in the band.
  function pick(now) {
    var key = (now.getMonth() + 1) * 100 + now.getDate();
    var e, i;

    // 1. exact single-day match
    for (i = 0; i < DATA.entries.length; i++) {
      e = DATA.entries[i];
      if (e.start === e.end && parse(e.start).key === key) return { entry: e, status: 'today' };
    }
    // 2. active range — shortest span wins, then earliest start
    var active = [];
    for (i = 0; i < DATA.entries.length; i++) {
      e = DATA.entries[i];
      if (e.start !== e.end && inRange(key, e.start, e.end)) active.push(e);
    }
    if (active.length) {
      active.sort(function (a, b) {
        return span(a.start, a.end) - span(b.start, b.end) || parse(a.start).key - parse(b.start).key;
      });
      return { entry: active[0], status: 'now' };
    }
    // 3. next upcoming by start date
    var best = null, bestD = Infinity;
    for (i = 0; i < DATA.entries.length; i++) {
      e = DATA.entries[i];
      var d = daysUntil(e.start, now);
      if (d > 0 && d < bestD) { bestD = d; best = e; }
    }
    if (best) return { entry: best, status: 'soon', days: bestD };
    return { entry: DATA.entries[0], status: 'soon', days: daysUntil(DATA.entries[0].start, now) };
  }

  function chip(sel) {
    if (sel.status === 'today') return 'Today · ' + fmt(sel.entry.start);
    if (sel.status === 'now') return 'Happening now · ' + fmtRange(sel.entry.start, sel.entry.end);
    if (sel.days === 1) return 'Tomorrow · ' + fmt(sel.entry.start);
    return 'In ' + sel.days + ' days · ' + fmt(sel.entry.start);
  }

  function catTag(entry) {
    var slug = CAT_SLUG[entry.category] || 'awareness';
    var ic = CAT_ICON[entry.category] || '';
    return '<span class="mhc-cat mhc-cat--' + slug + '">' +
      (ic ? '<span class="mhc-cat-ic" aria-hidden="true">' + ic + '</span>' : '') +
      esc(entry.category) + '</span>';
  }

  // ── Homepage band ─────────────────────────────────────────────────────────
  function renderBand(mount) {
    var now = today();
    var sel = pick(now);
    var e = sel.entry;
    var hindi = e.hindi ? '<p class="mh-band-hindi">' + esc(e.hindi) + '</p>' : '';
    mount.innerHTML =
      '<div class="mh-band-inner">' +
        '<div class="mh-band-left">' +
          '<span class="mh-band-chip">' + esc(chip(sel)) + '</span>' +
          catTag(e) +
        '</div>' +
        '<div class="mh-band-body">' +
          '<h2 class="mh-band-title">' + esc(e.title) + '</h2>' +
          '<p class="mh-band-lines">' + esc(e.lines) + '</p>' +
          hindi +
          '<div class="mh-band-actions">' +
            '<a class="mh-band-cta" href="' + esc(e.link) + '">' + esc(e.linkText) + '</a>' +
            '<a class="mh-band-more" href="mental-health-calendar.html">View the full calendar →</a>' +
          '</div>' +
          '<p class="mh-band-crisis">' + esc(DATA.helplineNote) + '</p>' +
        '</div>' +
      '</div>';
    mount.hidden = false;
  }

  // ── Full calendar page ────────────────────────────────────────────────────
  function renderFull(mount) {
    var now = today();
    var key = (now.getMonth() + 1) * 100 + now.getDate();
    var curMonth = now.getMonth() + 1;
    var list = DATA.entries.slice().sort(function (a, b) {
      return parse(a.start).ord - parse(b.start).ord;
    });

    var html = '', lastMonth = 0;
    for (var i = 0; i < list.length; i++) {
      var e = list[i], ps = parse(e.start);
      if (ps.m !== lastMonth) {
        if (lastMonth) html += '</div>';
        var cur = ps.m === curMonth ? ' mhc-month--current' : '';
        html += '<div class="mhc-month' + cur + '"><h3 class="mhc-month-head">' + MONTHS[ps.m - 1] + '</h3>';
        lastMonth = ps.m;
      }
      var isToday = (e.start === e.end && ps.key === key);
      var isActive = (e.start !== e.end && inRange(key, e.start, e.end));
      var badge = isToday ? '<span class="mhc-badge">Today</span>'
                : isActive ? '<span class="mhc-badge mhc-badge--now">Now</span>' : '';
      var hindi = e.hindi ? '<p class="mhc-card-hindi">' + esc(e.hindi) + '</p>' : '';
      var slug = CAT_SLUG[e.category] || 'awareness';
      html +=
        '<article id="' + esc(e.id) + '" class="mhc-card mhc-card--' + slug +
          (isToday || isActive ? ' mhc-card--live' : '') + '">' +
          '<div class="mhc-card-top">' +
            '<span class="mhc-date">' + esc(fmtRange(e.start, e.end)) + '</span>' +
            catTag(e) + badge +
          '</div>' +
          '<h4 class="mhc-card-title">' + esc(e.title) + '</h4>' +
          '<p class="mhc-card-lines">' + esc(e.lines) + '</p>' +
          hindi +
          '<a class="mhc-card-link" href="' + esc(e.link) + '">' + esc(e.linkText) + ' →</a>' +
        '</article>';
    }
    if (lastMonth) html += '</div>';
    mount.innerHTML = html;
  }

  // ── schema.org Event structured data (full calendar page only) ────────────
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }

  function injectEvents() {
    if (document.getElementById('mh-events-ld')) return;
    var now = today();
    var t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var items = DATA.entries.map(function (e, i) {
      var s = parse(e.start), en = parse(e.end);
      var y = now.getFullYear();
      if (new Date(y, s.m - 1, s.d) < t0) y += 1;        // next upcoming occurrence
      var ey = en.key >= s.key ? y : y + 1;               // handle wrap ranges
      return {
        '@type': 'ListItem', position: i + 1,
        item: {
          '@type': 'Event',
          name: e.title,
          description: e.lines,
          startDate: iso(y, s.m, s.d),
          endDate: iso(ey, en.m, en.d),
          eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
          eventStatus: 'https://schema.org/EventScheduled',
          url: SITE + '/mental-health-calendar.html#' + e.id,
          image: [SITE + '/og/mental-health-calendar.png'],
          location: { '@type': 'VirtualLocation', url: SITE + '/mental-health-calendar.html' },
          organizer: { '@type': 'Organization', name: 'Lume Live', url: SITE + '/' }
        }
      };
    });
    var ld = {
      '@context': 'https://schema.org', '@type': 'ItemList',
      name: 'Mental Health Awareness Calendar', itemListElement: items
    };
    var s = document.createElement('script');
    s.type = 'application/ld+json';
    s.id = 'mh-events-ld';
    s.textContent = JSON.stringify(ld);
    document.head.appendChild(s);
  }

  function init() {
    try {
      var band = document.getElementById('mh-today');
      if (band) renderBand(band);
      var full = document.getElementById('mh-calendar-full');
      if (full) { renderFull(full); injectEvents(); }
    } catch (err) { if (window.console) console.error('[mh-calendar]', err); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.LumeMHCalendar = { pick: pick, data: DATA };
})();
