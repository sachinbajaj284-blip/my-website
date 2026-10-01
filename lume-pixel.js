/*
  Lume Live — Meta Pixel, only with consent.

  Nothing reaches Meta until a visitor taps "Allow" on the small bar this
  script shows. Two promises shape everything below:

  1. Children. The privacy policy says we do not track or advertise to
     under-18s (DPDP Act s.9(3)), and many visitors are Class 10–12
     students. So the Pixel never loads by default; the bar asks adults
     and parents to opt in.

  2. Health data. The self-check screeners record results such as
     "Severe anxiety range". None of it may reach Meta. So:
       - this script is never included on mental-health or self-test
         pages (tools/pixel-pages.mjs owns that list and CI checks it);
       - Meta's automatic event setup, which scrapes button text, is
         switched off before init;
       - only the allow-listed events below are copied from gtag, and
         their parameters are dropped (except a payment amount).

  GA4 is untouched: every gtag call still goes through as before.
*/
(function(){
  var PIXEL_ID = '2567834410403965';
  var KEY = 'lume_mkt_consent';

  if(window.__lumePixel) return;
  window.__lumePixel = true;
  if(document.body && document.body.hasAttribute('data-no-pixel')) return;

  // Site event -> Meta event. Anything not listed here is never sent.
  // selfcheck_* and whatsapp_click (the screener's own button) are left out
  // on purpose: they carry wellbeing results.
  var MAP = {
    free_test_completed:     ['trackCustom', 'AssessmentComplete'],
    stream_quiz_completed:   ['trackCustom', 'AssessmentComplete'],
    free_test_lead_captured: ['track', 'Lead'],
    stream_quiz_lead:        ['track', 'Lead'],
    handbook_lead:           ['track', 'Lead'],
    booking_whatsapp_click:  ['track', 'Contact'],
    calendar_book_click:     ['track', 'Contact'],
    booking_google_click:    ['track', 'Contact'],
    payment_initiated:       ['track', 'InitiateCheckout', true],
    payment_success:         ['track', 'Purchase', true]
  };

  function read(){
    try{ return window.localStorage.getItem(KEY); }catch(e){ return null; }
  }
  function write(v){
    try{ window.localStorage.setItem(KEY, v); }catch(e){}
  }

  var loaded = false;
  function loadPixel(){
    if(loaded) return;
    loaded = true;
    // Meta's standard base code.
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    // Must come before init: stops Meta reading button labels and page metadata.
    window.fbq('set', 'autoConfig', false, PIXEL_ID);
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  function mirror(name, params){
    var m = MAP[name];
    if(!m || !loaded || !window.fbq) return;
    if(m[2]){
      var value = Number(params && params.value);
      window.fbq(m[0], m[1], value > 0 ? { value: value, currency: 'INR' } : {});
    }else{
      window.fbq(m[0], m[1]);
    }
  }

  // Wrap gtag so allow-listed events also reach Meta. The original always
  // runs first and its result is returned, so GA4 behaves exactly as before.
  var original = window.gtag;
  if(typeof original === 'function'){
    window.gtag = function(){
      var result = original.apply(this, arguments);
      try{
        if(arguments[0] === 'event') mirror(arguments[1], arguments[2]);
      }catch(e){}
      return result;
    };
  }

  var bar = null;
  function hideBar(){
    if(bar && bar.parentNode) bar.parentNode.removeChild(bar);
    bar = null;
  }

  function showBar(){
    if(bar) return;
    bar = document.createElement('div');
    bar.className = 'lume-consent';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Cookie choices');
    bar.innerHTML =
      '<style>' +
      '.lume-consent{position:fixed;z-index:1000;left:88px;right:16px;bottom:16px;max-width:520px;' +
      'background:#fff;color:#1f2430;border:1px solid #dcd9d2;border-radius:12px;padding:14px 16px;' +
      'box-shadow:0 8px 30px rgba(0,0,0,.15);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}' +
      '.lume-consent p{margin:0 0 6px}' +
      '.lume-consent a{color:#2c3a7b}' +
      '.lume-consent .lc-row{display:flex;gap:8px;flex-wrap:wrap}' +
      '.lume-consent button{font:inherit;font-weight:600;border-radius:8px;padding:8px 14px;cursor:pointer;border:1px solid #2c3a7b}' +
      '.lume-consent .lc-yes{background:#2c3a7b;color:#fff}' +
      '.lume-consent .lc-no{background:transparent;color:#2c3a7b}' +
      '@media(max-width:520px){.lume-consent{left:16px;bottom:88px;font-size:13px;padding:12px 14px}}' +
      '</style>' +
      // One short paragraph per sentence, not one long block. Google times the page
      // (LCP) by its largest visible text, and the hero fades in, so a long banner
      // paragraph became that text: the page was judged by a banner that only
      // appears after scripts run. Each of these stays smaller than the hero subtitle.
      '<p>With your permission, we\'d like to use Meta cookies to help parents and adults discover our sessions.</p>' +
      '<p>It\'s entirely your choice, and the site works the same either way.</p>' +
      '<p>If you\'re under 18, we kindly ask you to choose <b>No thanks</b>. ' +
      '<a href="privacy-policy.html#cookies">Learn more about cookies</a></p>' +
      '<div class="lc-row"><button type="button" class="lc-yes" data-lc="yes">Allow</button>' +
      '<button type="button" class="lc-no" data-lc="no">No thanks</button></div>';
    bar.addEventListener('click', function(e){
      var t = e.target && e.target.closest ? e.target.closest('[data-lc]') : null;
      if(!t) return;
      var yes = t.getAttribute('data-lc') === 'yes';
      write(yes ? 'granted' : 'denied');
      hideBar();
      if(yes) loadPixel();
      else if(loaded) window.fbq('consent', 'revoke');
    });
    document.body.appendChild(bar);
  }

  // "Cookie choices" links anywhere on the page reopen the bar.
  document.addEventListener('click', function(e){
    var t = e.target && e.target.closest ? e.target.closest('[data-lume-consent]') : null;
    if(!t) return;
    e.preventDefault();
    showBar();
  });

  var choice = read();
  if(choice === 'granted') loadPixel();
  else if(choice !== 'denied') showBar();
})();
