/* ==================================================================
   Lume Live — Story Share
   ------------------------------------------------------------------
   One shared module that turns a quiz result (Stream Selector, Career
   Snapshot, Career Shortlist) into a 1080x1920 story card the student
   can post to Instagram, Snapchat or WhatsApp Status.

   Why a canvas and not an <img> from the server: the card has to carry
   the student's own numbers, and a story is posted in the ten seconds
   right after the result appears — a round trip to generate it loses
   most of them.

   A story is a conversation opener, not a poster, so the sheet is an
   editor: four card styles, three palettes, a name, a mood emoji, and a
   guide showing where the poll sticker goes. Every control redraws the
   preview immediately — the student is making something, not accepting
   a render. The two styles that ask the viewer something ("Guess" and
   "Versus") are the ones that earn replies, so they lead.

   Public API:
     LumeStory.open({
       quiz:     "stream" | "snapshot" | "shortlist",  // analytics label
       eyebrow:  "Stream Selector",                     // small pill
       title:    "PCM",                                 // the headline
       subtitle: "Physics · Chemistry · Maths",
       matchPct: 92,                                    // ring number
       matchLabel: "match",
       bars:     [{label:"Analytical", pct:88}, ...],   // up to 3
       lines:    [{main:"Data Scientist", sub:"..."}],  // numbered rows
       chips:    ["Software Engineer", "Data Scientist"],
       options:  ["PCM","PCB","Commerce",...],          // enables "Guess"
       versus:   [{label:"PCM",pct:92},{label:"PCB",pct:74}], // "Versus"
       emoji:    "🎯",
       fomo:     "Only 1 in 9 students gets this combination.",
       cta:      "Take the quiz 👇",
       kicker:   "I just found my match",
       url:      "https://lumelive.co.in/stream-selector.html",
       name:     "Aarav",                               // optional
       lang:     "en" | "hi",
       captions: ["...", "..."]                         // lead the shuffle
     })
   ================================================================== */
(function(){
"use strict";

var W = 1080, H = 1920, PAD = 84;
var BRAND = "lumelive.co.in";
var HANDLE = "@lumelive";
var FONT = '"Inter","Segoe UI",system-ui,-apple-system,"Noto Sans",Arial,sans-serif';

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

var MOODS = ["🎯","🔥","👀","😭","🧠","🚀","✨","🫡"];

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
/* Truncate rather than wrap: a shortlist row is one line by design, and a
   career title that overruns should end in an ellipsis, not a second row
   that pushes the rest of the card down. */
function clip(c, text, maxW){
  var s = String(text || "");
  if(c.measureText(s).width <= maxW) return s;
  while(s.length > 1 && c.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s.replace(/[\s,·-]+$/, "") + "…";
}
function fitOneLine(c, text, maxW, startPx, minPx, weight){
  var px = startPx;
  do{
    c.font = weight + " " + px + "px " + FONT;
    if(c.measureText(text).width <= maxW) break;
    px -= 2;
  }while(px > minPx);
  return px;
}
function hexA(hex, a){
  var h = String(hex).replace("#", "");
  if(h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  var n = parseInt(h, 16);
  return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
}
function shortUrl(u){
  try{
    var a = document.createElement("a"); a.href = u || BRAND;
    return (a.hostname + a.pathname)
      .replace(/^www\./, "").replace(/\.html?$/, "").replace(/\/$/, "");
  }catch(e){ return BRAND; }
}

/* ------------------------------------------------------------------ */
/* Shared card furniture                                               */
/* ------------------------------------------------------------------ */
function paintBackground(c, t, seed){
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

  /* A little noise stops the gradient from banding on phone screens.
     Seeded so a redraw does not shimmer while the student edits. */
  var rnd = mulberry(seed || 7);
  c.save(); c.globalAlpha = 0.05;
  for(var n = 0; n < 2600; n++){
    c.fillStyle = n % 2 ? "#ffffff" : "#000000";
    c.fillRect(rnd() * W, rnd() * H, 2, 2);
  }
  c.restore();
}
function mulberry(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function brandRow(c, t){
  c.textAlign = "left"; c.textBaseline = "alphabetic";
  c.font = "800 34px " + FONT;
  c.fillStyle = t.ink;
  c.fillText("LUME LIVE", PAD, 150);
  c.font = "600 30px " + FONT;
  c.fillStyle = t.dim;
  c.textAlign = "right";
  c.fillText(BRAND, W - PAD, 150);
  c.textAlign = "left";
}

function pill(c, t, text, y){
  var label = String(text || "").toUpperCase();
  c.font = "800 30px " + FONT;
  var w = c.measureText(label).width;
  c.fillStyle = hexA(t.accent, 0.18);
  roundRect(c, PAD, y, w + 60, 74, 37); c.fill();
  c.strokeStyle = hexA(t.accent, 0.55); c.lineWidth = 2; c.stroke();
  c.fillStyle = t.accent;
  c.fillText(label, PAD + 30, y + 48);
  return y + 74;
}

function footer(c, t, d){
  var by = H - 232;
  c.font = "800 38px " + FONT;
  c.fillStyle = t.dim;
  c.fillText(d.cta || (isHi(d) ? "अपना result निकालो 👇" : "Take the quiz 👇"), PAD, by);

  var link = shortUrl(d.url);
  c.font = "900 " + fitOneLine(c, link, W - PAD * 2, 52, 30, "900") + "px " + FONT;
  c.fillStyle = t.ink;
  c.fillText(link, PAD, by + 72);

  c.font = "700 30px " + FONT;
  c.fillStyle = t.accent;
  c.fillText(HANDLE + " · " + (isHi(d) ? "फ्री · लॉगिन नहीं" : "Free · no sign-up"), PAD, by + 126);
}

function fomoStrip(c, t, text, top){
  c.fillStyle = hexA("#ffffff", 0.10);
  roundRect(c, PAD - 14, top - 10, W - (PAD - 14) * 2, 190, 34); c.fill();
  c.strokeStyle = t.line; c.lineWidth = 2; c.stroke();
  c.font = "800 38px " + FONT;
  c.fillStyle = t.ink;
  wrap(c, text, W - PAD * 2 - 20).slice(0, 3).forEach(function(ln, i){
    c.fillText(ln, PAD + 8, top + 58 + i * 50);
  });
}

/* The mood emoji, set big enough to read as a sticker rather than as
   punctuation in a sentence. */
function moodSticker(c, t, emoji, cx, cy, r){
  if(!emoji) return;
  c.save();
  c.fillStyle = hexA("#ffffff", 0.12);
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = hexA("#ffffff", 0.22); c.lineWidth = 3; c.stroke();
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillStyle = "#ffffff";
  c.font = (r * 1.15) + "px " + FONT;
  c.fillText(emoji, cx, cy + r * 0.06);
  c.restore();
  c.textAlign = "left"; c.textBaseline = "alphabetic";
}

/* Where the student should drop the real poll or question sticker. Drawn
   in the preview only — it is guidance, not part of the image they post,
   so the export redraws without it. */
function stickerGuide(c, t, zone, d){
  if(!zone) return;
  c.save();
  c.setLineDash([16, 14]);
  c.strokeStyle = hexA(t.accent, 0.85); c.lineWidth = 4;
  roundRect(c, zone.x, zone.y, zone.w, zone.h, 28); c.stroke();
  c.setLineDash([]);
  c.fillStyle = hexA(t.accent, 0.12);
  roundRect(c, zone.x, zone.y, zone.w, zone.h, 28); c.fill();
  c.textAlign = "center";
  c.fillStyle = t.accent;
  c.font = "800 30px " + FONT;
  var msg = isHi(d) ? "यहाँ poll / question sticker लगाओ" : "drop your poll or question sticker here";
  wrap(c, msg, zone.w - 60).slice(0, 2).forEach(function(ln, i){
    c.fillText(ln, zone.x + zone.w / 2, zone.y + zone.h / 2 + 10 + i * 36);
  });
  c.restore();
  c.textAlign = "left";
}

/* ------------------------------------------------------------------ */
/* Card styles                                                         */
/* ------------------------------------------------------------------ */
var STYLES = [
  { id:"guess",  name:"👀 Guess",  needs:function(d){ return (d.options || []).length >= 3; } },
  { id:"versus", name:"⚔️ Versus", needs:function(d){ return (d.versus || []).length === 2; } },
  { id:"flex",   name:"📊 Flex",   needs:function(){ return true; } },
  { id:"bold",   name:"🖤 Bold",   needs:function(){ return true; } }
];

/* --- Flex: the full result. The one a parent will actually read. --- */
function drawFlex(c, t, d, o){
  var y = pill(c, t, d.eyebrow || "Career quiz", 220) + 40;

  var hasRing = typeof d.matchPct === "number";
  var textW = W - PAD * 2 - (hasRing ? 280 : 0);

  c.fillStyle = t.dim;
  c.font = "600 38px " + FONT;
  c.fillText(kickerFor(d, o), PAD, y + 46);
  y += 130;

  var fit = fitLines(c, headline(d), textW, 3, 128, 64, "900");
  c.fillStyle = t.ink;
  c.font = "900 " + fit.px + "px " + FONT;
  fit.lines.forEach(function(ln, i){ c.fillText(ln, PAD, y + i * (fit.px * 1.06)); });
  y += (fit.lines.length - 1) * (fit.px * 1.06) + 66;

  if(d.subtitle){
    c.font = "600 40px " + FONT;
    c.fillStyle = t.dim;
    var sl = wrap(c, d.subtitle, W - PAD * 2).slice(0, 2);
    sl.forEach(function(ln, i){ c.fillText(ln, PAD, y + i * 54); });
    y += 54 * sl.length;
  }

  /* The ring sits top-right, so everything in its vertical band gets a
     narrower column (see textW above). */
  if(hasRing){
    var cx = W - PAD - 132, cy = 402, R = 116;
    c.lineWidth = 26;
    c.strokeStyle = hexA("#ffffff", 0.16);
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = t.ring; c.lineCap = "round";
    c.beginPath();
    c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (d.matchPct / 100));
    c.stroke();
    c.lineCap = "butt";
    c.textAlign = "center";
    c.fillStyle = t.ink; c.font = "900 76px " + FONT;
    c.fillText(d.matchPct + "%", cx, cy + 14);
    c.fillStyle = t.dim; c.font = "700 26px " + FONT;
    c.fillText(String(d.matchLabel || (isHi(d) ? "मैच" : "match")).toUpperCase(), cx, cy + 56);
    c.textAlign = "left";
  }

  /* Results differ in how much they have to say — three bars and five
     chips, or two of each. Centring the block in whatever room is left
     keeps a short result from leaving a hole above the FOMO strip. */
  var fomoTop = H - 480;
  var bodyH = Math.min(3, (d.bars || []).length) * 96 +
              Math.min(5, (d.lines || []).length) * 116 +
              ((d.chips || []).length ? 110 : 0);
  var slack = (fomoTop - 40) - (y + 46 + bodyH);
  y += 46 + Math.max(0, Math.min(slack * 0.5, 180));

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
    var bg = c.createLinearGradient(PAD, 0, PAD + bw, 0);
    bg.addColorStop(0, t.ring); bg.addColorStop(1, t.accent);
    c.fillStyle = bg;
    roundRect(c, PAD, y + 18, Math.max(24, bw * (b.pct / 100)), 20, 10); c.fill();
    y += 96;
  });

  /* A shortlist is a set, not a score, so it gets ranked rows. */
  (d.lines || []).slice(0, 5).forEach(function(row, i){
    c.fillStyle = t.card;
    roundRect(c, PAD, y - 34, W - PAD * 2, 100, 26); c.fill();
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

  if(!hasRing) moodSticker(c, t, o.emoji, W - PAD - 92, 402, 92);
  fomoStrip(c, t, fomoFor(d), fomoTop + 10);
  return null; /* no room left for a sticker guide on this one */
}

/* --- Guess: the result stays hidden, so the only way to find out is to
       reply. This is the style that turns one story into a thread. --- */
function drawGuess(c, t, d, o){
  var y = pill(c, t, isHi(d) ? "पहचानो तो जानें" : "Guess my result", 220) + 46;

  /* The generic kicker says "I just found my match", which answers the
     question this card is asking. Guess gets its own. */
  var who = (o.name || d.name || "").trim();
  c.fillStyle = t.dim; c.font = "600 38px " + FONT;
  c.fillText(who
    ? (isHi(d) ? who + " का result आ गया" : who + " just got their result")
    : (isHi(d) ? "मेरा result आ गया है" : "I just got my result"), PAD, y + 20);

  var head = isHi(d) ? "क्या तुम बता सकते हो?" : "Can you guess it?";
  var fit = fitLines(c, head, W - PAD * 2 - 200, 2, 100, 66, "900");
  c.fillStyle = t.ink; c.font = "900 " + fit.px + "px " + FONT;
  fit.lines.forEach(function(ln, i){ c.fillText(ln, PAD, y + 130 + i * (fit.px * 1.06)); });
  y += 130 + fit.lines.length * (fit.px * 1.06) + 30;

  moodSticker(c, t, o.emoji || "👀", W - PAD - 86, 440, 86);

  /* The redacted answer: one block per letter, first letter shown. A
     blur would not survive the export, and blocks read as "hidden" at
     story size in a way a smudge does not. */
  var answer = String(d.title || "").trim();
  var letters = answer.replace(/\s+/g, " ").split("");
  var boxW = W - PAD * 2;
  c.fillStyle = hexA("#000000", 0.28);
  roundRect(c, PAD, y, boxW, 196, 34); c.fill();
  c.strokeStyle = hexA(t.accent, 0.5); c.lineWidth = 3; c.stroke();

  var maxTiles = 12, shown = letters.slice(0, maxTiles);
  var gap = 12, slots = shown.length + (letters.length > maxTiles ? 1 : 0);
  var tw = Math.min(64, (boxW - 80 - gap * (slots - 1)) / slots);
  var th = tw * 1.25, tx0 = PAD + (boxW - (tw * slots + gap * (slots - 1))) / 2;
  shown.forEach(function(ch, i){
    var x = tx0 + i * (tw + gap), ty = y + 44;
    if(ch === " ") return;
    c.fillStyle = i === 0 ? hexA(t.accent, 0.92) : hexA("#ffffff", 0.22);
    roundRect(c, x, ty, tw, th, 10); c.fill();
    if(i === 0){
      c.textAlign = "center";
      c.fillStyle = "#0b1020"; c.font = "900 " + (tw * 0.72) + "px " + FONT;
      c.fillText(ch.toUpperCase(), x + tw / 2, ty + th * 0.72);
      c.textAlign = "left";
    }
  });
  /* A long answer shows the first twelve tiles and an ellipsis, so the
     row of blocks and the character count in the hint agree. */
  if(letters.length > maxTiles){
    c.fillStyle = hexA("#ffffff", 0.5);
    c.font = "900 " + (tw * 0.9) + "px " + FONT;
    c.fillText("\u2026", tx0 + shown.length * (tw + gap), y + 44 + th * 0.8);
  }
  c.fillStyle = t.dim; c.font = "700 28px " + FONT;
  c.textAlign = "center";
  var hint = isHi(d)
    ? "संकेत: " + letters.length + " अक्षर · शुरू होता है " + (letters[0] || "?").toUpperCase() + " से"
    : "Hint: " + letters.length + " characters · starts with " + (letters[0] || "?").toUpperCase();
  c.fillText(hint, W / 2, y + 168);
  c.textAlign = "left";
  y += 232;

  /* The options double as the reply vocabulary — a viewer who can tap a
     name is far likelier to answer than one composing from scratch. */
  /* The chips are the reply vocabulary, so all of them earn their space —
     they get a smaller size rather than a shorter list, which also leaves
     the sticker room the guide needs below. */
  c.font = "700 30px " + FONT;
  var x = PAD, rowH = 66;
  (d.options || []).slice(0, 8).forEach(function(txt){
    var w = c.measureText(txt).width + 46;
    if(x + w > W - PAD){ x = PAD; y += rowH + 14; }
    c.fillStyle = t.card;
    roundRect(c, x, y, w, rowH, 33); c.fill();
    c.strokeStyle = t.line; c.lineWidth = 2; c.stroke();
    c.fillStyle = t.ink;
    c.fillText(txt, x + 23, y + 43);
    x += w + 12;
  });
  y += rowH + 26;

  var zone = { x:PAD, y:y, w:W - PAD * 2, h:150 };
  fomoStrip(c, t, isHi(d)
    ? "सही जवाब DM करो — मैं अगली story में answer डालूँगा/डालूँगी 👀"
    : "Reply with your guess — I'm posting the answer in my next story 👀", H - 480 + 10);
  return zone;
}

/* --- Versus: two results, one question. Built for a poll sticker. --- */
function drawVersus(c, t, d, o){
  var v = d.versus || [];
  var y = pill(c, t, d.eyebrow || "Career quiz", 220) + 44;

  c.fillStyle = t.dim; c.font = "600 38px " + FONT;
  c.fillText(kickerFor(d, o), PAD, y + 20);

  var head = v[0].label + (isHi(d) ? " या " : " or ") + v[1].label + "?";
  var fit = fitLines(c, head, W - PAD * 2 - 190, 3, 104, 56, "900");
  c.fillStyle = t.ink; c.font = "900 " + fit.px + "px " + FONT;
  fit.lines.forEach(function(ln, i){ c.fillText(ln, PAD, y + 128 + i * (fit.px * 1.04)); });
  y += 128 + fit.lines.length * (fit.px * 1.04) + 40;

  v.slice(0, 2).forEach(function(side, i){
    var mine = i === 0, h = 190, bw = W - PAD * 2;
    c.fillStyle = mine ? hexA(t.ring, 0.28) : t.card;
    roundRect(c, PAD, y, bw, h, 30); c.fill();
    c.strokeStyle = mine ? hexA(t.accent, 0.8) : t.line;
    c.lineWidth = mine ? 4 : 2; c.stroke();

    c.fillStyle = t.ink;
    c.font = "900 " + fitOneLine(c, side.label, bw - 260, 54, 30, "900") + "px " + FONT;
    c.fillText(side.label, PAD + 36, y + 80);

    c.fillStyle = mine ? t.accent : t.dim;
    c.font = "700 28px " + FONT;
    c.fillText(mine ? (isHi(d) ? "मेरा जवाब" : "what I got")
                    : (isHi(d) ? "मेरा दूसरा option" : "my runner-up"), PAD + 36, y + 126);

    if(typeof side.pct === "number"){
      c.textAlign = "right";
      c.fillStyle = mine ? t.ink : t.dim;
      c.font = "900 64px " + FONT;
      c.fillText(side.pct + "%", W - PAD - 36, y + 104);
      c.textAlign = "left";
      var bx = PAD + 36, bwi = bw - 72;
      c.fillStyle = hexA("#ffffff", 0.16);
      roundRect(c, bx, y + 146, bwi, 16, 8); c.fill();
      c.fillStyle = mine ? t.accent : hexA("#ffffff", 0.45);
      roundRect(c, bx, y + 146, Math.max(20, bwi * (side.pct / 100)), 16, 8); c.fill();
    }
    y += h + 24;
  });

  moodSticker(c, t, o.emoji || "⚔️", W - PAD - 80, 400, 80);

  var zone = { x:PAD, y:y + 24, w:W - PAD * 2, h:Math.max(140, H - 500 - y - 40) };
  fomoStrip(c, t, isHi(d)
    ? "तुम कौन-से हो? Poll में वोट करो 👇"
    : "Which one are you? Vote in the poll 👇", H - 480 + 10);
  return zone;
}

/* --- Bold: giant type, one number, nothing else. The one that looks
       least like an ad in a feed. --- */
function drawBold(c, t, d, o){
  moodSticker(c, t, o.emoji || "🎯", PAD + 80, 300, 80);

  c.fillStyle = t.dim; c.font = "700 36px " + FONT;
  c.fillText(String(d.eyebrow || "").toUpperCase(), PAD + 194, 316);
  c.font = "600 32px " + FONT;
  c.fillText(kickerFor(d, o), PAD + 194, 358);

  /* Everything below flows from the title rather than sitting at fixed
     offsets — a one-word result and a four-line one both have to look
     deliberate. */
  var y = 560;
  var fit = fitLines(c, headline(d), W - PAD * 2, 4, 160, 72, "900");
  c.fillStyle = t.ink; c.font = "900 " + fit.px + "px " + FONT;
  fit.lines.forEach(function(ln, i){ c.fillText(ln, PAD, y + i * (fit.px * 0.98)); });
  y += (fit.lines.length - 1) * (fit.px * 0.98) + 76;

  if(d.subtitle){
    c.font = "600 42px " + FONT;
    c.fillStyle = t.dim;
    var sl = wrap(c, d.subtitle, W - PAD * 2).slice(0, 2);
    sl.forEach(function(ln, i){ c.fillText(ln, PAD, y + i * 56); });
    y += sl.length * 56 + 20;
  }

  if(typeof d.matchPct === "number"){
    c.fillStyle = t.accent;
    c.font = "900 170px " + FONT;
    c.fillText(d.matchPct + "%", PAD - 8, y + 150);
    c.fillStyle = t.dim; c.font = "700 34px " + FONT;
    c.fillText(String(d.matchLabel || "match").toUpperCase(), PAD, y + 196);
    y += 240;
  }

  var zone = { x:PAD, y:y + 30, w:W - PAD * 2, h:200 };
  fomoStrip(c, t, fomoFor(d), H - 480 + 10);
  return zone;
}

function kickerFor(d, o){
  var name = (o.name || d.name || "").trim();
  if(d.kicker && !name) return d.kicker;
  if(name) return isHi(d) ? name + " का result" : name + "'s result";
  return d.kicker || (isHi(d) ? "मेरा result आ गया" : "I just found my match");
}
/* Most results have one name, so the headline and the thing a friend
   would guess are the same string. A shortlist is the exception: its
   headline counts the list ("My top 4 careers") while the guessable
   answer is the career at the top of it. */
function headline(d){ return d.listTitle || d.title || ""; }
function fomoFor(d){
  return d.fomo || (isHi(d)
    ? "क्या तुम्हारा result इससे बेहतर है? 60 सेकंड में पता करो।"
    : "Think your result beats mine? 60 seconds to find out.");
}

/* ------------------------------------------------------------------ */
/* Draw dispatcher                                                     */
/* ------------------------------------------------------------------ */
function draw(canvas, d, t, styleId, o){
  var c = canvas.getContext("2d");
  canvas.width = W; canvas.height = H;
  o = o || {};
  paintBackground(c, t, 7);
  /* Bold drops the brand row for a cleaner top; the footer still
     carries the domain and the handle. */
  if(styleId !== "bold") brandRow(c, t);

  var zone;
  if(styleId === "guess")       zone = drawGuess(c, t, d, o);
  else if(styleId === "versus") zone = drawVersus(c, t, d, o);
  else if(styleId === "bold")   zone = drawBold(c, t, d, o);
  else                          zone = drawFlex(c, t, d, o);

  footer(c, t, d);
  /* Styles return the free space they left, but how much that is depends
     on the result — clamp it off the FOMO strip and drop it when what is
     left is too small to hold a sticker. */
  if(zone){
    zone.h = Math.min(zone.h, (H - 500) - zone.y);
    if(zone.h < 110) zone = null;
  }
  if(o.guide) stickerGuide(c, t, zone, d);
}

/* ------------------------------------------------------------------ */
/* Captions                                                            */
/* ------------------------------------------------------------------ */
function captionsFor(d, styleId){
  var title = headline(d), url = d.url || ("https://" + BRAND);
  /* Each style asks the viewer for something different, so the caption
     that ships with it has to match — a "guess mine" card under a "my
     result is X" caption gives the answer away. */
  var byStyle = { en:{}, hi:{} };
  byStyle.en.guess = ["Guess what I got 👀 First one right gets bragging rights.\nTake it yourself 👇\n" + url];
  byStyle.hi.guess = ["बताओ मेरा क्या आया 👀 सही बताने वाले को respect.\nखुद try करो 👇\n" + url];
  byStyle.en.versus = ["Vote: which one are you? 👇 I'll show the results later.\n" + url];
  byStyle.hi.versus = ["Vote करो: तुम कौन-से हो? 👇 बाद में results दिखाऊँगा/दिखाऊँगी.\n" + url];

  var base = isHi(d) ? [
    "मेरा result: " + title + " 🎯\nतुम्हारा क्या आएगा? 60 सेकंड लगेंगे 👇\n" + url,
    "60 सेकंड की quiz ने वो बता दिया जो मैं 2 साल से सोच रहा/रही था 😭\n" + title + "\nअपना try करो 👇 " + url,
    "Stream को लेकर confusion खत्म ✅\n" + title + "\nScreenshot भेजो अपना result का 👇\n" + url
  ] : [
    "My result: " + title + " 🎯\nBet you can't guess yours. 60 seconds 👇\n" + url,
    "This 60-second quiz figured out in one minute what I've been confused about for two years 😭\n" + title + "\nTry it 👇 " + url,
    "Okay this is scarily accurate.\n" + title + " ✅\nScreenshot yours and send it to me 👇\n" + url
  ];

  var lead = (byStyle[isHi(d) ? "hi" : "en"] || {})[styleId] || [];
  /* A caller that knows its own result writes a better caption than
     anything generic, so those come next and the defaults are last. */
  return lead.concat(d.captions || [], base);
}
function hashtagsFor(d){
  var tags = ["#LumeLive", "#CareerClarity", "#Class10", "#Class12", "#StreamSelector", "#CareerQuiz", "#StudentLife"];
  if(d.quiz === "snapshot")  tags.splice(4, 1, "#CareerSnapshot");
  if(d.quiz === "shortlist") tags.splice(4, 1, "#CareerShortlist");
  return tags.join(" ");
}

/* ------------------------------------------------------------------ */
/* Styles (injected once so a page only has to add one <script>)       */
/* ------------------------------------------------------------------ */
var CSS = [
".lsOv{position:fixed;inset:0;z-index:99999;background:rgba(6,8,18,.80);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:18px;opacity:0;transition:opacity .22s ease}",
".lsOv.on{opacity:1}",
".lsBox{width:min(520px,100%);background:#0e1222;color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:24px;padding:18px;box-shadow:0 30px 90px rgba(0,0,0,.55);transform:translateY(14px) scale(.98);transition:transform .24s cubic-bezier(.2,.9,.3,1.2);margin:auto}",
".lsOv.on .lsBox{transform:none}",
".lsTop{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}",
".lsTop h3{margin:0;font-size:1.05rem;font-weight:800;letter-spacing:-.01em}",
".lsX{background:rgba(255,255,255,.10);color:#fff;border:0;width:36px;height:36px;border-radius:50%;font-size:1.1rem;line-height:1;cursor:pointer}",
".lsX:hover{background:rgba(255,255,255,.2)}",
".lsStage{display:flex;flex-direction:column;align-items:center;gap:8px}",
".lsCanvas{width:min(268px,64vw);aspect-ratio:9/16;height:auto;border-radius:18px;display:block;box-shadow:0 18px 50px rgba(0,0,0,.5);cursor:pointer;transition:opacity .16s ease}",
".lsCanvas.flip{opacity:.25}",
".lsTapHint{font-size:.68rem;font-weight:700;color:rgba(255,255,255,.55);pointer-events:none}",
".lsRow{display:flex;gap:7px;justify-content:center;flex-wrap:wrap;margin:13px 0 0}",
".lsChip{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#fff;font:700 .78rem/1 inherit;padding:9px 14px;border-radius:999px;cursor:pointer;transition:background .15s,color .15s}",
".lsChip[aria-pressed=true]{background:#fff;color:#0e1222;border-color:#fff}",
".lsChip:disabled{opacity:.3;cursor:not-allowed}",
".lsTune{display:flex;gap:8px;align-items:center;margin-top:13px;flex-wrap:wrap}",
".lsName{flex:1;min-width:140px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;padding:10px 12px;font:600 .84rem/1.2 inherit}",
".lsName::placeholder{color:rgba(255,255,255,.45)}",
".lsMoods{display:flex;gap:4px;flex-wrap:wrap}",
".lsMood{width:34px;height:34px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);font-size:1rem;line-height:1;cursor:pointer;padding:0}",
".lsMood[aria-pressed=true]{background:#fff;border-color:#fff}",
".lsToggle{display:flex;align-items:center;gap:8px;margin-top:11px;font-size:.8rem;font-weight:700;color:rgba(255,255,255,.8);cursor:pointer}",
".lsToggle input{width:16px;height:16px;accent-color:#7ee8fa}",
".lsGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}",
".lsBtn{display:flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:14px;padding:13px 10px;font:800 .9rem/1.15 inherit;cursor:pointer;color:#fff;text-align:center}",
".lsBtn.ig{background:linear-gradient(135deg,#f9ce34,#ee2a7b 55%,#6228d7)}",
".lsBtn.sc{background:#fffc00;color:#111}",
".lsBtn.wa{background:#25d366;color:#04311a}",
".lsBtn.dl{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2)}",
".lsCapWrap{margin-top:16px}",
".lsLbl{font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.55);font-weight:800;margin:0 0 6px}",
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
"@media (prefers-reduced-motion:reduce){.lsOv,.lsBox,.lsCanvas{transition:none}}"
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
/* The sticker guide is advice for the poster, not part of the post, so
   every export redraws without it and puts it back afterwards. */
function exportBlob(state){
  if(!state.guide) return canvasBlob(state.canvas);
  state.render({ guide:false });
  return canvasBlob(state.canvas).then(function(b){ state.render(); return b; });
}
function download(canvas, name, blob){
  return Promise.resolve(blob || canvasBlob(canvas)).then(function(b){
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
  var fname = "lume-" + (d.quiz || "result") + "-" + state.style + ".png";
  track("story_share_click", { event_category:"viral_loop",
    event_label:(d.quiz || "") + ":" + app + ":" + state.style, method:app });

  return exportBlob(state).then(function(blob){
    var file = blob ? new File([blob], fname, { type:"image/png" }) : null;
    var caption = state.captionEl.value;

    if(file && canShareFile(file)){
      return navigator.share({ files:[file], title:"My Lume Live result", text:caption })
        .then(function(){ track("story_shared", { event_category:"viral_loop", event_label:app }); })
        .catch(function(){ /* dismissed — nothing to report */ });
    }
    /* Desktop or an older browser: save + copy + open the app. */
    return copyText(caption).then(function(){
      return download(state.canvas, fname, blob);
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

  var avail = STYLES.filter(function(s){ return s.needs(d); });
  var state = {
    data:d, canvas:null, captionEl:null,
    theme:0, style:avail[0].id, guide:true,
    name:(d.name || ""), emoji:d.emoji || MOODS[0], capIdx:0
  };

  var ov = el("div", "lsOv");
  var box = el("div", "lsBox");
  ov.appendChild(box);

  var top = el("div", "lsTop");
  top.appendChild(el("h3", null, isHi(d) ? "अपनी story बनाओ 📲" : "Make your story 📲"));
  var x = el("button", "lsX", "✕");
  x.type = "button"; x.setAttribute("aria-label", "Close");
  top.appendChild(x);
  box.appendChild(top);

  var stage = el("div", "lsStage");
  var canvas = el("canvas", "lsCanvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", (d.title || "Your result") + " — story card preview");
  canvas.title = "Tap to change the colours";
  stage.appendChild(canvas);
  stage.appendChild(el("div", "lsTapHint", isHi(d) ? "tap करके रंग बदलो" : "tap the card to change colours"));
  box.appendChild(stage);
  state.canvas = canvas;

  /* One render path for every control, so nothing can drift out of sync. */
  state.render = function(opts){
    opts = opts || {};
    draw(canvas, d, THEMES[state.theme], state.style, {
      name: state.name,
      emoji: state.emoji,
      guide: opts.guide === undefined ? state.guide : opts.guide
    });
  };

  /* ---- style picker ---- */
  var styleRow = el("div", "lsRow");
  var styleBtns = [];
  STYLES.forEach(function(s){
    var ok = s.needs(d);
    var b = el("button", "lsChip", s.name);
    b.type = "button";
    b.disabled = !ok;
    b.setAttribute("aria-pressed", s.id === state.style ? "true" : "false");
    if(!ok) b.title = "Not available for this result";
    b.addEventListener("click", function(){
      state.style = s.id;
      styleBtns.forEach(function(n, j){
        n.setAttribute("aria-pressed", STYLES[j].id === s.id ? "true" : "false");
      });
      /* Each style asks a different question, so the caption follows it. */
      state.capIdx = 0;
      setCaption();
      flip();
      track("story_style_switch", { event_category:"viral_loop", event_label:s.id });
    });
    styleBtns.push(b);
    styleRow.appendChild(b);
  });
  box.appendChild(styleRow);

  /* ---- palette picker ---- */
  var themeRow = el("div", "lsRow");
  THEMES.forEach(function(t, i){
    var b = el("button", "lsChip", t.name);
    b.type = "button";
    b.setAttribute("aria-pressed", i === 0 ? "true" : "false");
    b.addEventListener("click", function(){ setTheme(i); });
    themeRow.appendChild(b);
  });
  box.appendChild(themeRow);

  function setTheme(i){
    state.theme = i;
    Array.prototype.forEach.call(themeRow.children, function(n, j){
      n.setAttribute("aria-pressed", j === i ? "true" : "false");
    });
    flip();
    track("story_theme_switch", { event_category:"viral_loop", event_label:THEMES[i].id });
  }
  /* Tapping the card itself cycles the palette — on a phone that is the
     thing a thumb reaches for first. */
  canvas.addEventListener("click", function(){ setTheme((state.theme + 1) % THEMES.length); });

  function flip(){
    canvas.classList.add("flip");
    state.render();
    setTimeout(function(){ canvas.classList.remove("flip"); }, 90);
  }

  /* ---- name + mood ---- */
  var tune = el("div", "lsTune");
  var nameIn = el("input", "lsName");
  nameIn.type = "text";
  nameIn.maxLength = 18;
  nameIn.placeholder = isHi(d) ? "अपना नाम (optional)" : "Your name (optional)";
  nameIn.value = state.name;
  nameIn.addEventListener("input", function(){
    state.name = nameIn.value.trim();
    state.render();
  });
  tune.appendChild(nameIn);

  var moods = el("div", "lsMoods");
  MOODS.forEach(function(m){
    var b = el("button", "lsMood", m);
    b.type = "button";
    b.setAttribute("aria-label", "Mood " + m);
    b.setAttribute("aria-pressed", m === state.emoji ? "true" : "false");
    b.addEventListener("click", function(){
      state.emoji = m;
      Array.prototype.forEach.call(moods.children, function(n){
        n.setAttribute("aria-pressed", n.textContent === m ? "true" : "false");
      });
      state.render();
    });
    moods.appendChild(b);
  });
  tune.appendChild(moods);
  box.appendChild(tune);

  /* ---- sticker guide toggle ---- */
  var toggle = el("label", "lsToggle");
  var cb = el("input");
  cb.type = "checkbox"; cb.checked = state.guide;
  cb.addEventListener("change", function(){ state.guide = cb.checked; state.render(); });
  toggle.appendChild(cb);
  toggle.appendChild(el("span", null, isHi(d)
    ? "sticker कहाँ लगाना है, दिखाओ (post में नहीं जाएगा)"
    : "Show me where to put the poll sticker (not saved into the image)"));
  box.appendChild(toggle);

  /* ---- share buttons ---- */
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
    track("story_download", { event_category:"viral_loop", event_label:(d.quiz || "") + ":" + state.style });
    exportBlob(state).then(function(b){
      return download(canvas, "lume-" + (d.quiz || "result") + "-" + state.style + ".png", b);
    }).then(function(){
      toast(isHi(d) ? "Image save हो गया" : "Saved — now post it as a story");
    });
  });
  box.appendChild(grid);

  /* ---- caption ---- */
  var capWrap = el("div", "lsCapWrap");
  capWrap.appendChild(el("p", "lsLbl", isHi(d) ? "Caption (बदल सकते हो)" : "Caption — edit it, make it yours"));
  var cap = el("textarea", "lsCap");
  capWrap.appendChild(cap);
  state.captionEl = cap;

  var capList = [];
  function setCaption(){
    capList = captionsFor(d, state.style);
    cap.value = capList[state.capIdx % capList.length] + "\n\n" + hashtagsFor(d);
  }
  setCaption();

  var capRow = el("div", "lsCapRow");
  var shuffle = el("button", "lsPill", isHi(d) ? "🔁 दूसरा caption" : "🔁 Another caption");
  shuffle.type = "button";
  shuffle.addEventListener("click", function(){
    state.capIdx = (state.capIdx + 1) % capList.length;
    setCaption();
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

  /* ---- posting tips ---- */
  box.appendChild(el("div", "lsTips", isHi(d)
    ? "<b>ज़्यादा लोग कैसे try करेंगे</b><ul>" +
      "<li><b>👀 Guess</b> style सबसे ज़्यादा reply लाता है — result छुपा रहता है।</li>" +
      "<li>Story में <b>poll या question sticker</b> उसी जगह लगाओ जहाँ dotted box दिख रहा है।</li>" +
      "<li>Link sticker में <b>" + shortUrl(d.url) + "</b> डालो — तभी दोस्त एक tap में quiz खोल पाएंगे।</li>" +
      "<li>3 दोस्तों को tag करो और उनका result screenshot माँगो।</li></ul>"
    : "<b>How to make friends actually take it</b><ul>" +
      "<li><b>👀 Guess</b> pulls the most replies — the result stays hidden until you post it.</li>" +
      "<li>Put your <b>poll or question sticker</b> exactly where the dotted box is.</li>" +
      "<li>Put <b>" + shortUrl(d.url) + "</b> in a link sticker — that is the one-tap path for your friends.</li>" +
      "<li>Tag 3 friends and ask them to reply with a screenshot of theirs.</li></ul>"));

  document.body.appendChild(ov);
  /* The sheet is taller than a phone screen, so it scrolls itself. Without
     locking the page the result behind it scrolls instead. */
  var prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  state.render();
  requestAnimationFrame(function(){ ov.classList.add("on"); });

  track("story_sheet_opened", { event_category:"viral_loop", event_label:(d.quiz || "") + ":" + state.style });

  function close(){
    document.body.style.overflow = prevOverflow;
    ov.classList.remove("on");
    document.removeEventListener("keydown", onKey);
    setTimeout(function(){ if(ov.parentNode) ov.parentNode.removeChild(ov); }, 220);
  }
  function onKey(e){
    if(e.key === "Escape") return close();
    if(e.target === nameIn || e.target === cap) return;
    if(e.key === "ArrowRight") setTheme((state.theme + 1) % THEMES.length);
    if(e.key === "ArrowLeft")  setTheme((state.theme + THEMES.length - 1) % THEMES.length);
  }
  x.addEventListener("click", close);
  ov.addEventListener("click", function(e){ if(e.target === ov) close(); });
  document.addEventListener("keydown", onKey);

  return { close:close, redraw:function(){ state.render(); } };
}

window.LumeStory = { open:open, themes:THEMES, styles:STYLES };

})();
