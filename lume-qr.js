/* ==================================================================
   Lume Live — QR
   ------------------------------------------------------------------
   A minimal QR encoder, byte mode, error-correction level M, versions
   1 to 10 (up to 213 bytes) — enough for any URL on this site.

   Why not a library: the story card is drawn on a canvas inside the
   page, and the artifact/CSP rules here mean a CDN script is one more
   thing that can fail silently at the exact moment a student is trying
   to post. This is self-contained and testable.

   Level M (about 15% recovery) rather than L: these get scanned off a
   phone screen showing someone's story, at an angle, in a hurry.

   LumeQR.matrix(text) -> { size, get(x, y) } or null if it does not fit.
   ================================================================== */
(function(){
"use strict";

/* ---- GF(256), the field QR's Reed-Solomon works in ---- */
var EXP = [], LOG = [];
(function(){
  var x = 1;
  for(var i = 0; i < 255; i++){
    EXP[i] = x; LOG[x] = i;
    x <<= 1;
    if(x & 0x100) x ^= 0x11d;
  }
})();
function mul(a, b){ return (a === 0 || b === 0) ? 0 : EXP[(LOG[a] + LOG[b]) % 255]; }

function genPoly(n){
  var p = [1];
  for(var i = 0; i < n; i++){
    var np = [];
    for(var k = 0; k <= p.length; k++) np[k] = 0;
    for(var j = 0; j < p.length; j++){
      np[j]     ^= p[j];                 /* × x            */
      np[j + 1] ^= mul(p[j], EXP[i]);    /* + α^i × p[j]   */
    }
    p = np;
  }
  return p;
}
function ecBytes(data, n){
  var g = genPoly(n), res = data.slice(), i, j;
  for(i = 0; i < n; i++) res.push(0);
  for(i = 0; i < data.length; i++){
    var f = res[i];
    if(!f) continue;
    for(j = 0; j < g.length; j++) res[i + j] ^= mul(g[j], f);
  }
  return res.slice(data.length);
}

/* ---- Block structure for level M, versions 1-10 ----
   [max payload bytes, total data codewords, ec codewords per block,
    group 1: blocks, data codewords, group 2: blocks, data codewords]

   The first two columns are different things and easy to confuse: the
   payload figure is how many characters byte mode can carry (it is short
   by the mode and length header), the second is how many codewords the
   symbol actually holds. */
var SPEC = [
  null,
  [ 14,  16, 10, 1, 16, 0,  0],
  [ 26,  28, 16, 1, 28, 0,  0],
  [ 42,  44, 26, 1, 44, 0,  0],
  [ 62,  64, 18, 2, 32, 0,  0],
  [ 84,  86, 24, 2, 43, 0,  0],
  [106, 108, 16, 4, 27, 0,  0],
  [122, 124, 18, 4, 31, 0,  0],
  [152, 154, 22, 2, 38, 2, 39],
  [180, 182, 22, 3, 36, 2, 37],
  [213, 216, 26, 4, 43, 1, 44]
];
var ALIGN = [
  null, [], [6,18], [6,22], [6,26], [6,30], [6,34],
  [6,22,38], [6,24,42], [6,26,46], [6,28,50]
];

/* Long division in GF(2) leaving a remainder below the generator's
   degree — the standard QR format/version check bits. The top of the
   loop just has to start above any bit either input can set. */
function bch(v, poly, degree){
  var d = v << degree;
  for(var i = 21; i >= degree; i--){
    if(d & (1 << i)) d ^= poly << (i - degree);
  }
  return d;
}
function formatBits(mask){
  /* Level M is 00; the 0x5412 mask stops an all-zero format from
     looking like valid data. */
  var v = (0 << 3) | mask;
  return ((v << 10) | bch(v, 0x537, 10)) ^ 0x5412;
}
function versionBits(ver){ return (ver << 12) | bch(ver, 0x1f25, 12); }

function utf8(text){
  var out = [], s = encodeURIComponent(String(text));
  for(var i = 0; i < s.length; i++){
    if(s[i] === "%"){ out.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
    else out.push(s.charCodeAt(i));
  }
  return out;
}

function matrix(text){
  var bytes = utf8(text), ver = 0, i, j;
  for(i = 1; i <= 10; i++){ if(bytes.length <= SPEC[i][0]){ ver = i; break; } }
  if(!ver) return null;

  var spec = SPEC[ver], capacity = spec[1];

  /* ---- bit stream: mode 0100, length, payload, terminator, pad ---- */
  var bits = [];
  function push(val, len){ for(var k = len - 1; k >= 0; k--) bits.push((val >> k) & 1); }
  push(4, 4);
  push(bytes.length, ver < 10 ? 8 : 16);
  for(i = 0; i < bytes.length; i++) push(bytes[i], 8);
  for(i = 0; i < 4 && bits.length < capacity * 8; i++) bits.push(0);
  while(bits.length % 8) bits.push(0);

  var data = [];
  for(i = 0; i < bits.length; i += 8){
    var b = 0;
    for(j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    data.push(b);
  }
  var pad = [0xEC, 0x11], p = 0;
  while(data.length < capacity) data.push(pad[p++ % 2]);

  /* ---- split into blocks, compute EC, interleave ---- */
  var ecLen = spec[2], blocks = [], at = 0;
  function take(n, count){
    for(var k = 0; k < count; k++){
      var d = data.slice(at, at + n); at += n;
      blocks.push({ d:d, e:ecBytes(d, ecLen) });
    }
  }
  take(spec[4], spec[3]);
  if(spec[5]) take(spec[6], spec[5]);

  var out = [], maxD = Math.max(spec[4], spec[6] || 0);
  for(i = 0; i < maxD; i++)
    for(j = 0; j < blocks.length; j++)
      if(i < blocks[j].d.length) out.push(blocks[j].d[i]);
  for(i = 0; i < ecLen; i++)
    for(j = 0; j < blocks.length; j++) out.push(blocks[j].e[i]);

  /* ---- lay out the symbol ---- */
  var size = ver * 4 + 17;
  var m = [], reserved = [];
  for(i = 0; i < size; i++){
    m[i] = []; reserved[i] = [];
    for(j = 0; j < size; j++){ m[i][j] = 0; reserved[i][j] = 0; }
  }
  function set(x, y, v, res){
    if(x < 0 || y < 0 || x >= size || y >= size) return;
    m[y][x] = v ? 1 : 0;
    if(res) reserved[y][x] = 1;
  }
  function finder(cx, cy){
    for(var dy = -1; dy <= 7; dy++)
      for(var dx = -1; dx <= 7; dx++){
        var x = cx + dx, y = cy + dy;
        if(x < 0 || y < 0 || x >= size || y >= size) continue;
        var on = (dx >= 0 && dx <= 6 && (dy === 0 || dy === 6)) ||
                 (dy >= 0 && dy <= 6 && (dx === 0 || dx === 6)) ||
                 (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
        set(x, y, on, 1);
      }
  }
  finder(0, 0); finder(size - 7, 0); finder(0, size - 7);

  for(i = 8; i < size - 8; i++){
    set(i, 6, i % 2 === 0, 1);
    set(6, i, i % 2 === 0, 1);
  }

  /* Alignment patterns sit at every pairing of the version's coordinates
     except the three that would land on a finder. The ones that overlap
     the timing lines are NOT exceptions — skipping those (easy to do by
     testing "is this cell already reserved") shifts every data module
     from that column leftward and the symbol stops scanning. */
  var ap = ALIGN[ver], last = ap.length - 1;
  for(i = 0; i <= last; i++)
    for(j = 0; j <= last; j++){
      if((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      var ax = ap[i], ay = ap[j];
      for(var by = -2; by <= 2; by++)
        for(var bx = -2; bx <= 2; bx++)
          set(ax + bx, ay + by,
              Math.max(Math.abs(bx), Math.abs(by)) !== 1, 1);
    }

  set(8, size - 8, 1, 1); /* the always-dark module */

  for(i = 0; i < 9; i++){
    if(i !== 6){ set(i, 8, 0, 1); set(8, i, 0, 1); }
  }
  set(8, 7, 0, 1);
  for(i = 0; i < 8; i++){ set(size - 1 - i, 8, 0, 1); set(8, size - 1 - i, 0, 1); }

  if(ver >= 7){
    var vb = versionBits(ver);
    for(i = 0; i < 18; i++){
      var bit = (vb >> i) & 1, r = Math.floor(i / 3), cc = i % 3;
      set(r, size - 11 + cc, bit, 1);
      set(size - 11 + cc, r, bit, 1);
    }
  }

  /* ---- zig-zag the codewords in ---- */
  var bitIdx = 0, up = true;
  for(var col = size - 1; col > 0; col -= 2){
    if(col === 6) col--;                                    /* timing column */
    for(var row = 0; row < size; row++){
      var y = up ? size - 1 - row : row;
      for(var c = 0; c < 2; c++){
        var x = col - c;
        if(reserved[y][x]) continue;
        var bv = 0;
        if(bitIdx < out.length * 8){
          bv = (out[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
        }
        bitIdx++;
        m[y][x] = bv;
      }
    }
    up = !up;
  }

  /* ---- masks: apply each, score it, keep the best ---- */
  function maskAt(k, x, y){
    switch(k){
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
      case 5: return (x * y) % 2 + (x * y) % 3 === 0;
      case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
      default:return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
    }
  }
  var best = null, bestScore = Infinity;
  for(var k = 0; k < 8; k++){
    var cand = [];
    for(i = 0; i < size; i++){
      cand[i] = m[i].slice();
      for(j = 0; j < size; j++)
        if(!reserved[i][j] && maskAt(k, j, i)) cand[i][j] ^= 1;
    }
    /* The 15 format bits go in twice: once wrapped around the top-left
       finder, once split between the other two. Indices here are
       [row][col]. */
    var fb = formatBits(k);
    for(i = 0; i < 15; i++){
      var fbit = (fb >> i) & 1;
      if(i < 6)        cand[i][8] = fbit;
      else if(i === 6) cand[7][8] = fbit;
      else if(i === 7) cand[8][8] = fbit;
      else if(i === 8) cand[8][7] = fbit;
      else             cand[8][14 - i] = fbit;

      if(i < 8)        cand[8][size - 1 - i] = fbit;
      else             cand[size - 15 + i][8] = fbit;
    }
    cand[size - 8][8] = 1;
    var sc = score(cand, size);
    if(sc < bestScore){ bestScore = sc; best = cand; }
  }

  return {
    size: size,
    get: function(x, y){ return best[y][x] === 1; }
  };
}

/* The four penalty rules from the spec. Picking the lowest-scoring mask
   is what keeps a QR readable off a bright phone screen. */
function score(g, size){
  var s = 0, i, j, k, run, dark = 0;
  for(i = 0; i < size; i++){
    for(k = 0; k < 2; k++){
      run = 1;
      for(j = 1; j < size; j++){
        var a = k ? g[j][i] : g[i][j], b = k ? g[j - 1][i] : g[i][j - 1];
        if(a === b) run++;
        else { if(run >= 5) s += 3 + (run - 5); run = 1; }
      }
      if(run >= 5) s += 3 + (run - 5);
    }
  }
  for(i = 0; i < size - 1; i++)
    for(j = 0; j < size - 1; j++){
      var v = g[i][j];
      if(v === g[i][j + 1] && v === g[i + 1][j] && v === g[i + 1][j + 1]) s += 3;
    }
  var pat = [1,0,1,1,1,0,1,0,0,0,0], pat2 = [0,0,0,0,1,0,1,1,1,0,1];
  function hits(line){
    var n = 0;
    for(var a = 0; a + 11 <= size; a++){
      var ok1 = true, ok2 = true;
      for(var b = 0; b < 11; b++){
        if(line[a + b] !== pat[b]) ok1 = false;
        if(line[a + b] !== pat2[b]) ok2 = false;
      }
      if(ok1 || ok2) n++;
    }
    return n;
  }
  for(i = 0; i < size; i++){
    var rowLine = g[i], colLine = [];
    for(j = 0; j < size; j++) colLine.push(g[j][i]);
    s += 40 * (hits(rowLine) + hits(colLine));
  }
  for(i = 0; i < size; i++) for(j = 0; j < size; j++) if(g[i][j]) dark++;
  var pct = dark * 100 / (size * size);
  s += 10 * Math.floor(Math.abs(pct - 50) / 5);
  return s;
}

var api = { matrix: matrix };
if(typeof module !== "undefined" && module.exports) module.exports = api;
if(typeof window !== "undefined") window.LumeQR = api;

})();
