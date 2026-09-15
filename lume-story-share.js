/* ==================================================================
   Lume Live — Story Share
   ------------------------------------------------------------------
   One shared module that turns a quiz result (Stream Selector, Career
   Snapshot, Career Explorer) into a 1080x1920 story card the student
   can post to Instagram, Snapchat or WhatsApp Status.

   Why a canvas and not an <img> from the server: the card has to carry
   the student's own numbers, and a story is posted in the ten seconds
   right after the result appears — a round trip to generate it loses
   most of them.

   Public API:
     LumeStory.open({
       quiz:     "stream" | "snapshot" | "explorer",   // analytics label
       eyebrow:  "STREAM SELECTOR",                     // small pill
       title:    "PCM",                                 // the headline
       subtitle: "Physics · Chemistry · Maths",
       matchPct: 92,                                    // ring number
       matchLabel: "match",
       bars:     [{label:"Analytical", pct:88}, ...],   // up to 3
       chips:    ["Software Engineer", "Data Scientist"],
       fomo:     "Only 1 in 9 students gets this combination.",
       url:      "https://lumelive.co.in/stream-selector.html",
       name:     "Aarav",                               // optional
       lang:     "en" | "hi",
       captions: ["...", "..."]                         // optional extras
     })
   ================================================================== */
(function(){
"use strict";

var W = 1080, H = 1920;
var BRAND = "lumelive.co.in";
var HANDLE = "@lumelive";

/* ------------------------------------------------------------------ */
/* Themes — three looks so a feed of these does not read as one ad     */
/* ------------------------------------------------------------------ */
var THEMES = [
  { id:"midnight", name:"Midnight",
    bg:["#0b1020","#15173a","#2a1258"],
    blobs:[["#6d5cff",0.55],["#00d4ff",0.38],["#ff4ecd",0.30]],
    ink:"#ffffff", dim:"rgba(255,255,255,.72)", accent:"#7ee8fa", ring:"#8b7dff",
    card:"rgba(255,255,255,.08)", line:"rgba(255,255,255,.18)" },
  { id:"sunset", name:"Sunset",
    bg:["#2b0b3f","#7a1f5c","#ff7a45"],
    blobs:[["#ffd166",0.50],["#ff5f6d",0.42],["#b14aed",0.32]],
    ink:"#ffffff", dim:"rgba(255,255,255,.78)", accent:"#ffd166", ring:"#ffb03a",
    card:"rgba(255,255,255,.10)", line:"rgba(255,255,255,.22)" },
  { id:"mint", name:"Mint",
    bg:["#05231f","#0a4a3c","#0f8a63"],
    blobs:[["#3ef2a1",0.48],["#7ee8fa",0.34],["#f7ff8a",0.26]],
    ink:"#ffffff", dim:"rgba(255,255,255,.76)", accent:"#9dffcf", ring:"#3ef2a1",
    card:"rgba(255,255,255,.09)", line:"rgba(255,255,255,.20)" }
];

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */
function el(tag, cls, html){
  var n = document.createElement(tag);
  if(cls) n.className = cls;
  if(html != null) n.innerHTML = html;
  return n;
}
function track(name, params){
  try{ if(window.gtag) window.gtag("event", name, params || {}); }catch(e){}
}
function isHi(d){ return d && d.lang === "hi"; }

function roundRect(c, x, y, w, h, r){
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y,     x + w, y + h, r);
  c.arcTo(x + w, y + h, x,     y + h, r);
  c.arcTo(x,     y + h, x,     y,     r);
  c.arcTo(x,     y,     x + w, y,     r);
  c.closePath();
}

/* Greedy wrap that also shrinks the font until the block fits the box.
   Result titles range from "PCM" to "Commerce without Maths" — a fixed
   size either wastes the poster or overflows it. */
function fitLines(c, text, maxW, maxLines, startPx, minPx, weight){
  var px = startPx, lines;
  for(;;){
    c.font = weight + " " + px + "px " + FONT;
    lines = wrap(c, text, maxW);
    /* Both conditions matter: too many lines, and a single long word that
       wrap() cannot break ("Commerce" against a column narrowed by the
       ring). Checking only the line count lets that word run off-column. */
    var widest = 0;
    for(var i = 0; i < lines.length; i++) widest = Math.max(widest, c.measureText(lines[i]).width);
    if((lines.length <= maxLines && widest <= maxW) || px <= minPx) break;
    px -= 4;
  }
  return { lines: lines.slice(0, maxLines), px: px };
}
function wrap(c, text, maxW){
  var words = String(text || "").split(/\s+/), out = [], line = "";
  for(var i = 0; i < words.length; i++){
    var test = line ? line + " " + words[i] : words[i];
    if(c.measureText(test).width > maxW && line){ out.push(line); line = words[i]; }
    else line = test;
  }
  if(line) out.push(line);
  return out;
}
var FONT = '"Inter","Segoe UI",system-ui,-apple-system,"Noto Sans",Arial,sans-serif';
/* Truncate rather than wrap: a shortlist row is one line by design, and a
   career title that overruns should end in an ellipsis, not a second row
   that pushes the rest of the card down. */
function clip(c, text, maxW){
  var s = String(text || "");
  if(c.measureText(s).width <= maxW) return s;
  while(s.length > 1 && c.measureText(s + "\u2026").width > maxW) s = s.slice(0, -1);
  return s.replace(/[\s,·-]+$/, "") + "\u2026";
}

/* ------------------------------------------------------------------ */
/* The card itself                                                     */
/* ------------------------------------------------------------------ */
function draw(canvas, d, theme){
  var c = canvas.getContext("2d");
  canvas.width = W; canvas.height = H;
  var t = theme;

  /* Background: diagonal gradient plus three soft blobs. Flat colour
     reads as a screenshot; the blobs make it read as a poster. */
  var g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, t.bg[0]); g.addColorStop(0.55, t.bg[1]); g.addColorStop(1, t.bg[2]);
  c.fillStyle = g; c.fillRect(0, 0, W, H);

  var spots = [[180, 300, 520], [900, 760, 560], [300, 1600, 620]];
  t.blobs.forEach(function(b, i){
    var s = spots[i], rg = c.createRadialGradient(s[0], s[1], 0, s[0], s[1], s[2]);
    rg.addColorStop(0, hexA(b[0], b[1]));
    rg.addColorStop(1, hexA(b[0], 0));
    c.fillStyle = rg; c.fillRect(0, 0, W, H);
  });

  /* A little noise stops the gradient from banding on phone screens. */
  c.save(); c.globalAlpha = 0.05;
  for(var n = 0; n < 2600; n++){
    c.fillStyle = n % 2 ? "#ffffff" : "#000000";
    c.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  c.restore();

  var PAD = 84, y = 0;

  /* ---- brand row ---- */
  c.textAlign = "left"; c.textBaseline = "alphabetic";
  c.font = "800 34px " + FONT;
  c.fillStyle = t.ink;
  c.fillText("LUME LIVE", PAD, 150);
  c.font = "600 30px " + FONT;
  c.fillStyle = t.dim;
  c.textAlign = "right";
  c.fillText(BRAND, W - PAD, 150);

  /* ---- eyebrow pill ---- */
  c.textAlign = "left";
  var eyebrow = (d.eyebrow || "CAREER QUIZ").toUpperCase();
  c.font = "800 30px " + FONT;
  var ew = c.measureText(eyebrow).width;
  c.fillStyle = hexA(t.accent, 0.18);
  roundRect(c, PAD, 220, ew + 60, 74, 37); c.fill();
  c.strokeStyle = hexA(t.accent, 0.55); c.lineWidth = 2; c.stroke();
  c.fillStyle = t.accent;
  c.fillText(eyebrow, PAD + 30, 268);

  /* The ring sits top-right, so everything in its vertical band gets a
     narrower column. Without this a long combination name ("Commerce
     without Maths") runs straight under the percentage. */
  var hasRing = typeof d.matchPct === "number";
  var textW = W - PAD * 2 - (hasRing ? 280 : 0);

  /* ---- the line that makes a friend stop scrolling ---- */
  c.fillStyle = t.dim;
  c.font = "600 38px " + FONT;
  var kicker = d.kicker || (d.name
    ? (isHi(d) ? d.name + " का result" : d.name + "'s result")
    : (isHi(d) ? "मेरा result आ गया" : "I just found my match"));
  c.fillText(kicker, PAD, 380);

  /* ---- headline ---- */
  var fit = fitLines(c, d.title || "", textW, 3, 128, 64, "900");
  y = 380 + 130;
  c.fillStyle = t.ink;
  c.font = "900 " + fit.px + "px " + FONT;
  fit.lines.forEach(function(ln, i){
    c.fillText(ln, PAD, y + i * (fit.px * 1.06));
  });
  y += (fit.lines.length - 1) * (fit.px * 1.06) + 66;

  if(d.subtitle){
    c.font = "600 40px " + FONT;
    c.fillStyle = t.dim;
    wrap(c, d.subtitle, W - PAD * 2).slice(0, 2).forEach(function(ln, i){
      c.fillText(ln, PAD, y + i * 54);
    });
    y += 54 * Math.min(2, wrap(c, d.subtitle, W - PAD * 2).length);
  }

  /* ---- match ring: the number people screenshot ---- */
  if(typeof d.matchPct === "number"){
    var cx = W - PAD - 132, cy = 402, R = 116;
    c.lineWidth = 26;
    c.strokeStyle = hexA("#ffffff", 0.16);
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = t.ring;
    c.lineCap = "round";
    c.beginPath();
    c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (d.matchPct / 100));
    c.stroke();
    c.lineCap = "butt";
    c.textAlign = "center";
    c.fillStyle = t.ink; c.font = "900 76px " + FONT;
    c.fillText(d.matchPct + "%", cx, cy + 14);
    c.fillStyle = t.dim; c.font = "700 26px " + FONT;
    c.fillText((d.matchLabel || (isHi(d) ? "मैच" : "match")).toUpperCase(), cx, cy + 56);
    c.textAlign = "left";
  }

  /* Results differ in how much they have to say — three bars and five
     chips, or two of each. Centring the block in whatever room is left
     keeps a short result from leaving a hole above the FOMO strip. */
  var fomoTop = H - 480;
  var barCount = Math.min(3, (d.bars || []).length);
  var lineCount = Math.min(5, (d.lines || []).length);
  var bodyH = barCount * 96 + lineCount * 116 + ((d.chips || []).length ? 110 : 0);
  var slack = (fomoTop - 40) - (y + 46 + bodyH);
  y += 46 + Math.max(0, Math.min(slack * 0.5, 180));

  /* ---- strength bars ---- */
  (d.bars || []).slice(0, 3).forEach(function(b){
    c.font = "700 34px " + FONT;
    c.fillStyle = t.ink;
    c.fillText(b.label, PAD, y);
    c.textAlign = "right";
    c.fillStyle = t.accent;
    c.fillText(b.pct + "%", W - PAD, y);
    c.textAlign = "left";
    var bw = W - PAD * 2;
    c.fillStyle = hexA("#ffffff", 0.16);
    roundRect(c, PAD, y + 18, bw, 20, 10); c.fill();
    var bg2 = c.createLinearGradient(PAD, 0, PAD + bw, 0);
    bg2.addColorStop(0, t.ring); bg2.addColorStop(1, t.accent);
    c.fillStyle = bg2;
    roundRect(c, PAD, y + 18, Math.max(24, bw * (b.pct / 100)), 20, 10); c.fill();
    y += 96;
  });

  /* ---- numbered rows: a shortlist is a set, not a score, so it gets
         ranked rows instead of bars ---- */
  (d.lines || []).slice(0, 5).forEach(function(row, i){
    var rowH = 100;
    c.fillStyle = t.card;
    roundRect(c, PAD, y - 34, W - PAD * 2, rowH, 26); c.fill();
    c.strokeStyle = t.line; c.lineWidth = 2; c.stroke();

    c.fillStyle = hexA(t.ring, 0.9);
    c.beginPath(); c.arc(PAD + 44, y + 15, 26, 0, Math.PI * 2); c.fill();
    c.textAlign = "center";
    c.fillStyle = "#ffffff"; c.font = "900 28px " + FONT;
    c.fillText(String(i + 1), PAD + 44, y + 25);
    c.textAlign = "left";

    var tx = PAD + 92, tw = W - PAD - 30 - tx;
    c.fillStyle = t.ink; c.font = "800 36px " + FONT;
    c.fillText(clip(c, row.main, tw), tx, y + 8);
    if(row.sub){
      c.fillStyle = t.dim; c.font = "600 26px " + FONT;
      c.fillText(clip(c, row.sub, tw), tx, y + 44);
    }
    y += 116;
  });

  y += 10;

  /* ---- career chips ---- */
  if((d.chips || []).length){
    c.font = "700 32px " + FONT;
    var x = PAD, rowH = 70;
    d.chips.slice(0, 5).forEach(function(txt){
      var w = c.measureText(txt).width + 54;
      if(x + w > W - PAD){ x = PAD; y += rowH + 14; }
      c.fillStyle = t.card;
      roundRect(c, x, y, w, rowH, 35); c.fill();
      c.strokeStyle = t.line; c.lineWidth = 2; c.stroke();
      c.fillStyle = t.ink;
      c.fillText(txt, x + 27, y + 46);
      x += w + 14;
    });
    y += rowH + 40;
  }

  /* ---- FOMO strip: the reason a friend taps through ---- */
  var fomo = d.fomo || (isHi(d)
    ? "क्या तुम्हारा result इससे बेहतर है? 60 सेकंड में पता करो।"
    : "Think your result beats mine? 60 seconds to find out.");
  var fy = fomoTop + 10;
  c.fillStyle = hexA("#ffffff", 0.10);
  roundRect(c, PAD - 14, fy - 10, W - (PAD - 14) * 2, 190, 34); c.fill();
  c.strokeStyle = t.line; c.lineWidth = 2; c.stroke();
  c.font = "800 38px " + FONT;
  c.fillStyle = t.ink;
  var fl = wrap(c, fomo, W - PAD * 2 - 20).slice(0, 3);
  fl.forEach(function(ln, i){ c.fillText(ln, PAD + 8, fy + 58 + i * 50); });

  /* ---- CTA footer ---- */
  var by = H - 232;
  var cta = d.cta || (isHi(d) ? "अपना result निकालो 👇" : "Take the quiz 👇");
  c.font = "800 38px " + FONT;
  c.fillStyle = t.dim;
  c.fillText(cta, PAD, by);

  var link = shortUrl(d.url), linkPx = 52;
  do{
    c.font = "900 " + linkPx + "px " + FONT;
    if(c.measureText(link).width <= W - PAD * 2) break;
    linkPx -= 2;
  }while(linkPx > 30);
  c.fillStyle = t.ink;
  c.fillText(link, PAD, by + 72);

  c.font = "700 30px " + FONT;
  c.fillStyle = t.accent;
  c.fillText(HANDLE + " · " + (isHi(d) ? "फ्री · लॉगिन नहीं" : "Free · no sign-up"), PAD, by + 126);
}

function shortUrl(u){
  try{
    var a = document.createElement("a"); a.href = u || BRAND;
    return (a.hostname + a.pathname)
      .replace(/^www\./, "").replace(/\.html?$/, "").replace(/\/$/, "");
  }catch(e){ return BRAND; }
}
function hexA(hex, a){
  var h = String(hex).replace("#", "");
  if(h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  var n = parseInt(h, 16);
  return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
}

/* ------------------------------------------------------------------ */
/* Captions                                                            */
/* ------------------------------------------------------------------ */
function captionsFor(d){
  var title = d.title || "";
  var url = d.url || ("https://" + BRAND);
  var base = isHi(d) ? [
    "मेरा result: " + title + " 🎯\nतुम्हारा क्या आएगा? 60 सेकंड लगेंगे 👇\n" + url,
    "60 सेकंड की quiz ने वो बता दिया जो मैं 2 साल से सोच रहा/रही था 😭\n" + title + "\nअपना try करो 👇 " + url,
    "Stream को लेकर confusion खत्म ✅\n" + title + "\nScreenshot भेजो अपना result का 👇\n" + url
  ] : [
    "My result: " + title + " 🎯\nBet you can't guess yours. 60 seconds 👇\n" + url,
    "This 60-second quiz figured out in one minute what I've been confused about for two years 😭\n" + title + "\nTry it 👇 " + url,
    "Okay this is scarily accurate.\n" + title + " ✅\nScreenshot yours and send it to me 👇\n" + url
  ];
  /* A caller that knows its own result writes a better first caption than
     anything generic, so those lead and the defaults stay as alternates. */
  return (d.captions || []).concat(base);
}
function hashtagsFor(d){
  var tags = ["#LumeLive", "#CareerClarity", "#Class10", "#Class12", "#StreamSelector", "#CareerQuiz", "#StudentLife"];
  if(d.quiz === "snapshot") tags.splice(4, 1, "#CareerSnapshot");
  if(d.quiz === "shortlist") tags.splice(4, 1, "#CareerShortlist");
  return tags.join(" ");
}

/* ------------------------------------------------------------------ */
/* Styles (injected once so a page only has to add one <script>)       */
/* ------------------------------------------------------------------ */
var CSS = [
".lsOv{position:fixed;inset:0;z-index:99999;background:rgba(6,8,18,.78);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:18px;opacity:0;transition:opacity .22s ease}",
".lsOv.on{opacity:1}",
".lsBox{width:min(520px,100%);background:#0e1222;color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:24px;padding:18px;box-shadow:0 30px 90px rgba(0,0,0,.55);transform:translateY(14px) scale(.98);transition:transform .24s cubic-bezier(.2,.9,.3,1.2);margin:auto}",
".lsOv.on .lsBox{transform:none}",
".lsTop{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}",
".lsTop h3{margin:0;font-size:1.05rem;font-weight:800;letter-spacing:-.01em}",
".lsX{background:rgba(255,255,255,.10);color:#fff;border:0;width:36px;height:36px;border-radius:50%;font-size:1.1rem;line-height:1;cursor:pointer}",
".lsX:hover{background:rgba(255,255,255,.2)}",
".lsStage{display:flex;justify-content:center}",
".lsCanvas{width:min(268px,64vw);aspect-ratio:9/16;height:auto;border-radius:18px;display:block;box-shadow:0 18px 50px rgba(0,0,0,.5)}",
".lsThemes{display:flex;gap:8px;justify-content:center;margin:14px 0 4px}",
".lsTheme{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#fff;font:700 .78rem/1 inherit;padding:8px 14px;border-radius:999px;cursor:pointer}",
".lsTheme[aria-pressed=true]{background:#fff;color:#0e1222;border-color:#fff}",
".lsGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}",
".lsBtn{display:flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:14px;padding:13px 10px;font:800 .9rem/1.15 inherit;cursor:pointer;color:#fff;text-align:center}",
".lsBtn.ig{background:linear-gradient(135deg,#f9ce34,#ee2a7b 55%,#6228d7)}",
".lsBtn.sc{background:#fffc00;color:#111}",
".lsBtn.wa{background:#25d366;color:#04311a}",
".lsBtn.dl{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2)}",
".lsWide{grid-column:1/-1}",
".lsCapWrap{margin-top:16px}",
".lsLbl{font-size:.74rem;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.6);font-weight:800;margin-bottom:6px}",
".lsCap{width:100%;min-height:104px;resize:vertical;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;padding:11px 12px;font:500 .88rem/1.45 inherit}",
".lsCapRow{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}",
".lsPill{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);color:#fff;border-radius:999px;padding:8px 13px;font:700 .78rem/1 inherit;cursor:pointer}",
".lsPill:hover{background:rgba(255,255,255,.18)}",
".lsTips{margin:14px 0 0;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);font-size:.82rem;line-height:1.5;color:rgba(255,255,255,.82)}",
".lsTips b{color:#fff}",
".lsTips ul{margin:6px 0 0;padding-left:18px}",
".lsTips li{margin:3px 0}",
".lsToast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:#fff;color:#0e1222;font:800 .85rem/1 inherit;padding:12px 18px;border-radius:999px;z-index:100000;box-shadow:0 12px 34px rgba(0,0,0,.35);opacity:0;transition:opacity .2s ease}",
".lsToast.on{opacity:1}",
"@media (max-width:420px){.lsBox{padding:14px;border-radius:20px}.lsCanvas{width:56vw}}",
"@media (prefers-reduced-motion:reduce){.lsOv,.lsBox{transition:none}}"
].join("\n");

function injectCSS(){
  if(document.getElementById("lsCSS")) return;
  var s = el("style"); s.id = "lsCSS"; s.textContent = CSS;
  document.head.appendChild(s);
}

/* ------------------------------------------------------------------ */
/* Sharing plumbing                                                    */
/* ------------------------------------------------------------------ */
function toast(msg){
  var n = document.querySelector(".lsToast");
  if(!n){ n = el("div", "lsToast"); document.body.appendChild(n); }
  n.textContent = msg;
  requestAnimationFrame(function(){ n.classList.add("on"); });
  clearTimeout(n._t);
  n._t = setTimeout(function(){ n.classList.remove("on"); }, 2400);
}
function canvasBlob(canvas){
  return new Promise(function(res){
    if(canvas.toBlob) canvas.toBlob(function(b){ res(b); }, "image/png", 0.95);
    else res(null);
  });
}
function download(canvas, name){
  return canvasBlob(canvas).then(function(b){
    var url = b ? URL.createObjectURL(b) : canvas.toDataURL("image/png");
    var a = el("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    if(b) setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
  });
}
function copyText(txt){
  if(navigator.clipboard && navigator.clipboard.writeText){
    return navigator.clipboard.writeText(txt).then(function(){ return true; },
      function(){ window.prompt("Copy this:", txt); return false; });
  }
  window.prompt("Copy this:", txt);
  return Promise.resolve(false);
}
function canShareFile(file){
  try{ return !!(navigator.canShare && navigator.canShare({ files:[file] }) && navigator.share); }
  catch(e){ return false; }
}
/* Instagram and Snapchat give the web no way to post a story directly.
   The honest flow is: save the image, copy the caption, open the app —
   and say so, rather than opening a dead deep link and looking broken. */
function shareToApp(state, app){
  var d = state.data;
  var fname = "lume-" + (d.quiz || "result") + "-story.png";
  track("story_share_click", { event_category:"viral_loop", event_label:(d.quiz||"") + ":" + app, method:app });

  return canvasBlob(state.canvas).then(function(blob){
    var file = blob ? new File([blob], fname, { type:"image/png" }) : null;
    var caption = state.captionEl.value;

    if(file && canShareFile(file)){
      return navigator.share({ files:[file], title:"My Lume Live result", text:caption })
        .then(function(){ track("story_shared", { event_category:"viral_loop", event_label:app }); })
        .catch(function(){ /* dismissed — nothing to report */ });
    }
    /* Desktop or an older browser: save + copy + open the app. */
    return copyText(caption).then(function(){
      return download(state.canvas, fname);
    }).then(function(){
      toast(app === "wa" ? "Image saved + caption copied" : "Saved to your photos + caption copied");
      if(app === "ig") setTimeout(function(){ window.open("https://www.instagram.com/", "_blank", "noopener"); }, 700);
      if(app === "sc") setTimeout(function(){ window.open("https://www.snapchat.com/", "_blank", "noopener"); }, 700);
      if(app === "wa") setTimeout(function(){
        window.open("https://api.whatsapp.com/send?text=" + encodeURIComponent(caption), "_blank", "noopener");
      }, 400);
    });
  });
}

/* ------------------------------------------------------------------ */
/* The sheet                                                           */
/* ------------------------------------------------------------------ */
function open(data){
  injectCSS();
  var d = data || {};
  d.url = d.url || (location.origin + location.pathname);

  var state = { data:d, theme:0 };

  var ov = el("div", "lsOv");
  var box = el("div", "lsBox");
  ov.appendChild(box);

  var top = el("div", "lsTop");
  top.appendChild(el("h3", null, isHi(d) ? "अपना result story बनाओ 📲" : "Post this as a story 📲"));
  var x = el("button", "lsX", "✕");
  x.type = "button";
  x.setAttribute("aria-label", "Close");
  top.appendChild(x);
  box.appendChild(top);

  var stage = el("div", "lsStage");
  var canvas = el("canvas", "lsCanvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", (d.title || "Your result") + " — story card preview");
  stage.appendChild(canvas);
  box.appendChild(stage);
  state.canvas = canvas;

  /* theme switcher */
  var themes = el("div", "lsThemes");
  THEMES.forEach(function(t, i){
    var b = el("button", "lsTheme", t.name);
    b.type = "button";
    b.setAttribute("aria-pressed", i === 0 ? "true" : "false");
    b.addEventListener("click", function(){
      state.theme = i;
      Array.prototype.forEach.call(themes.children, function(n, j){
        n.setAttribute("aria-pressed", j === i ? "true" : "false");
      });
      draw(canvas, d, THEMES[i]);
      track("story_theme_switch", { event_category:"viral_loop", event_label:t.id });
    });
    themes.appendChild(b);
  });
  box.appendChild(themes);

  /* buttons */
  var grid = el("div", "lsGrid");
  function btn(cls, label, fn){
    var b = el("button", "lsBtn " + cls, label);
    b.type = "button";
    b.addEventListener("click", fn);
    grid.appendChild(b);
    return b;
  }
  btn("ig", "📸 Instagram", function(){ shareToApp(state, "ig"); });
  btn("sc", "👻 Snapchat", function(){ shareToApp(state, "sc"); });
  btn("wa", "💬 WhatsApp", function(){ shareToApp(state, "wa"); });
  btn("dl", "⬇️ Save image", function(){
    track("story_download", { event_category:"viral_loop", event_label:d.quiz || "" });
    download(canvas, "lume-" + (d.quiz || "result") + "-story.png").then(function(){
      toast(isHi(d) ? "Image save हो गया" : "Saved — now post it as a story");
    });
  });
  box.appendChild(grid);

  /* caption + suggestions */
  var caps = captionsFor(d);
  var capWrap = el("div", "lsCapWrap");
  capWrap.appendChild(el("div", "lsLbl", isHi(d) ? "Caption (बदल सकते हो)" : "Caption — edit it, make it yours"));
  var cap = el("textarea", "lsCap");
  cap.value = caps[0] + "\n\n" + hashtagsFor(d);
  capWrap.appendChild(cap);
  state.captionEl = cap;

  var capRow = el("div", "lsCapRow");
  var ci = 0;
  var shuffle = el("button", "lsPill", isHi(d) ? "🔁 दूसरा caption" : "🔁 Another caption");
  shuffle.type = "button";
  shuffle.addEventListener("click", function(){
    ci = (ci + 1) % caps.length;
    cap.value = caps[ci] + "\n\n" + hashtagsFor(d);
    track("story_caption_shuffle", { event_category:"viral_loop" });
  });
  capRow.appendChild(shuffle);

  var copyCap = el("button", "lsPill", isHi(d) ? "📋 Caption copy" : "📋 Copy caption");
  copyCap.type = "button";
  copyCap.addEventListener("click", function(){
    copyText(cap.value).then(function(){ toast(isHi(d) ? "Caption copy हो गया" : "Caption copied"); });
    track("story_caption_copy", { event_category:"viral_loop" });
  });
  capRow.appendChild(copyCap);

  var copyLink = el("button", "lsPill", isHi(d) ? "🔗 लिंक copy" : "🔗 Copy link");
  copyLink.type = "button";
  copyLink.addEventListener("click", function(){
    copyText(d.url).then(function(){ toast(isHi(d) ? "लिंक copy हो गया" : "Link copied"); });
  });
  capRow.appendChild(copyLink);
  capWrap.appendChild(capRow);
  box.appendChild(capWrap);

  /* posting tips — the part that decides whether it actually gets posted */
  box.appendChild(el("div", "lsTips", isHi(d)
    ? "<b>ज़्यादा लोग कैसे try करेंगे</b><ul>" +
      "<li>Story में <b>“तुम्हारा क्या आया?”</b> वाला poll या question sticker लगाओ।</li>" +
      "<li>Link sticker में <b>" + shortUrl(d.url) + "</b> डालो — तभी दोस्त एक tap में quiz खोल पाएंगे।</li>" +
      "<li>3 दोस्तों को tag करो और उनका result screenshot माँगो।</li>" +
      "<li>Snapchat पर story + best friends दोनों जगह भेजो।</li></ul>"
    : "<b>How to make friends actually take it</b><ul>" +
      "<li>Add a <b>“what did you get?”</b> poll or question sticker on top of the image.</li>" +
      "<li>Put <b>" + shortUrl(d.url) + "</b> in a link sticker — that is the one-tap path for your friends.</li>" +
      "<li>Tag 3 friends and ask them to reply with a screenshot of theirs.</li>" +
      "<li>On Snapchat, send it to your story <i>and</i> to best friends — replies are where it spreads.</li></ul>"));

  document.body.appendChild(ov);
  /* The sheet is taller than a phone screen, so it scrolls itself. Without
     locking the page the result behind it scrolls instead. */
  var prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  draw(canvas, d, THEMES[0]);
  requestAnimationFrame(function(){ ov.classList.add("on"); });

  track("story_sheet_opened", { event_category:"viral_loop", event_label:d.quiz || "" });

  function close(){
    document.body.style.overflow = prevOverflow;
    ov.classList.remove("on");
    document.removeEventListener("keydown", onKey);
    setTimeout(function(){ if(ov.parentNode) ov.parentNode.removeChild(ov); }, 220);
  }
  function onKey(e){ if(e.key === "Escape") close(); }
  x.addEventListener("click", close);
  ov.addEventListener("click", function(e){ if(e.target === ov) close(); });
  document.addEventListener("keydown", onKey);

  return { close: close, redraw: function(){ draw(canvas, d, THEMES[state.theme]); } };
}

window.LumeStory = { open: open, themes: THEMES };

})();
