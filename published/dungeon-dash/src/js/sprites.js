/* Dungeon Dash — sprites: procedural 16-bit style pixel art for every sprite and icon.
 * Everything is generated in code at init() into offscreen canvases (1 logical px = 1 canvas px);
 * icons are produced as cached PNG data URLs. No image files, no external assets.
 *
 * Conventions
 *  - All frames of one sprite share one canvas size (size(name)). Anchor = bottom-centre: the feet
 *    (or the lowest point of a flyer / projectile centre line) sit on the bottom rows and the body is
 *    horizontally centred, so draw at (x - w/2, y - h). anchor(name) returns that point.
 *  - Characters are authored facing right; enemies are mirrored to face left (toward the hero).
 *  - anim(name, anim, t, look) picks frame floor(t * fps) % frames (one-shot anims clamp instead).
 */
(function (DD) {
  'use strict';
  if (!DD) return;

  const SP = {};
  DD.sprites = SP;

  const HAS_DOM = typeof document !== 'undefined' && typeof document.createElement === 'function';
  const OUT = '#110c18'; // universal 1 px outline colour (very dark plum)
  const BLANK_URL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  // ===================================================================== colours
  const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  function pack(r, g, b, a) {
    return (((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
  }
  const colCache = new Map();
  // '#rgb' | '#rrggbb' | '#rrggbbaa' | packed uint → packed ABGR uint32 (0 = transparent)
  function C(c) {
    if (typeof c === 'number') return Number.isFinite(c) ? c >>> 0 : 0;
    if (typeof c !== 'string' || c.charAt(0) !== '#') return 0;
    let v = colCache.get(c);
    if (v !== undefined) return v;
    let h = c.slice(1);
    if (h.length === 3 || h.length === 4) h = h.split('').map((ch) => ch + ch).join('');
    const r = parseInt(h.slice(0, 2), 16) || 0;
    const g = parseInt(h.slice(2, 4), 16) || 0;
    const b = parseInt(h.slice(4, 6), 16) || 0;
    let a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
    if (!Number.isFinite(a)) a = 255;
    v = pack(r, g, b, a);
    colCache.set(c, v);
    return v;
  }
  const cr = (v) => v & 255;
  const cg = (v) => (v >>> 8) & 255;
  const cb = (v) => (v >>> 16) & 255;
  const ca = (v) => v >>> 24;
  function mix(c1, c2, t) {
    const a = C(c1);
    const b = C(c2);
    const k = !(t > 0) ? 0 : t > 1 ? 1 : t;
    return pack(
      Math.round(cr(a) + (cr(b) - cr(a)) * k),
      Math.round(cg(a) + (cg(b) - cg(a)) * k),
      Math.round(cb(a) + (cb(b) - cb(a)) * k),
      ca(a),
    );
  }
  function alpha(c, a) {
    const v = C(c);
    const k = Math.max(0, Math.min(255, Math.round(a * 255)));
    return ((v & 0xffffff) | (k << 24)) >>> 0;
  }
  function hex(v) {
    v = C(v);
    const h = (n) => n.toString(16).padStart(2, '0');
    return '#' + h(cr(v)) + h(cg(v)) + h(cb(v));
  }
  function rgba(v, a) {
    v = C(v);
    return 'rgba(' + cr(v) + ',' + cg(v) + ',' + cb(v) + ',' + (a === undefined ? ca(v) / 255 : a) + ')';
  }
  // Hue-shifted 3-tone ramp [shadow, base, highlight] from one colour (shadows lean plum, lights warm).
  function ramp(base, k) {
    const b = C(base);
    const s = k === undefined ? 1 : k;
    return [
      mix(mix(b, '#000000', 0.34 * s), '#2a1458', 0.2 * s),
      b,
      mix(mix(b, '#ffffff', 0.36 * s), '#fff2c4', 0.14 * s),
    ];
  }
  const R3 = (a, b, c) => [C(a), C(b), C(c)];

  const RARITY_COLORS = ['#9aa3ad', '#5fd068', '#4aa3ff', '#b46cff', '#ffa726', '#ff5252', '#5ef3ff'];
  function rarityColor(i) {
    try {
      const R = DD.data && DD.data.RARITIES;
      const k = Math.max(0, Math.min(6, Math.floor(Number(i) || 0)));
      if (R && R[k] && typeof R[k].color === 'string') return R[k].color;
      return RARITY_COLORS[k];
    } catch {
      return RARITY_COLORS[0];
    }
  }

  // ===================================================================== pixel grid
  function Grid(w, h) {
    this.w = Math.max(1, Math.floor(w) || 1);
    this.h = Math.max(1, Math.floor(h) || 1);
    this.d = new Uint32Array(this.w * this.h);
  }
  function over(dst, src) {
    const sa = ca(src) / 255;
    if (sa <= 0) return dst;
    const da = ca(dst) / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return 0;
    const f = (s, d) => Math.round((s * sa + d * da * (1 - sa)) / oa);
    return pack(f(cr(src), cr(dst)), f(cg(src), cg(dst)), f(cb(src), cb(dst)), Math.round(oa * 255));
  }
  Grid.prototype.get = function (x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[y * this.w + x];
  };
  Grid.prototype.set = function (x, y, c) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const v = C(c);
    const a = v >>> 24;
    if (a === 0) return;
    const i = y * this.w + x;
    this.d[i] = a === 255 ? v : over(this.d[i], v);
  };
  Grid.prototype.clear = function (x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = 0;
  };
  Grid.prototype.clone = function () {
    const g = new Grid(this.w, this.h);
    g.d.set(this.d);
    return g;
  };
  Grid.prototype.solid = function (x, y) {
    return ca(this.get(x, y)) >= 140;
  };

  // ===================================================================== primitives
  function rect(g, x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g.set(x + i, y + j, c);
  }
  function hline(g, x0, x1, y, c) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    for (let x = x0; x <= x1; x++) g.set(x, y, c);
  }
  function vline(g, x, y0, y1, c) {
    if (y1 < y0) [y0, y1] = [y1, y0];
    for (let y = y0; y <= y1; y++) g.set(x, y, c);
  }
  function line(g, x0, y0, x1, y1, c, w) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const ww = w || 1;
    for (let guard = 0; guard < 4096; guard++) {
      if (ww === 1) g.set(x0, y0, c);
      else rect(g, x0 - Math.floor((ww - 1) / 2), y0 - Math.floor((ww - 1) / 2), ww, ww, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
  // filled ellipse inscribed in the box [x, x+w) × [y, y+h)
  function oval(g, x, y, w, h, c) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    for (let yy = Math.floor(y); yy < y + h; yy++) {
      for (let xx = Math.floor(x); xx < x + w; xx++) {
        const nx = (xx + 0.5 - cx) / rx;
        const ny = (yy + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1.04) g.set(xx, yy, c);
      }
    }
  }
  function ring(g, cx, cy, r0, r1, c) {
    const R = Math.ceil(r1) + 1;
    for (let y = -R; y <= R; y++) {
      for (let x = -R; x <= R; x++) {
        const d = Math.hypot(x, y);
        if (d >= r0 && d <= r1) g.set(cx + x, cy + y, c);
      }
    }
  }
  function disc(g, cx, cy, r, c) {
    const R = Math.ceil(r) + 1;
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (x * x + y * y <= r * r + 0.3) g.set(cx + x, cy + y, c);
  }
  // scanline polygon fill; vertices in pixel-edge coordinates
  function poly(g, pts, c) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return;
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const sy = y + 0.5;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) {
          xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) g.set(x, y, c);
      }
    }
  }
  // string grid stamp: rows of chars, pal maps char → colour ('.' and ' ' are transparent)
  function stamp(g, x, y, rows, pal, flip) {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const ch = row.charAt(i);
        if (ch === '.' || ch === ' ') continue;
        const c = pal[ch];
        if (c === undefined || c === null) continue;
        g.set(flip ? x + row.length - 1 - i : x + i, y + j, c);
      }
    }
  }
  function gridFrom(rows, pal) {
    let w = 0;
    for (const r of rows) w = Math.max(w, r.length);
    const g = new Grid(w, rows.length);
    stamp(g, 0, 0, rows, pal);
    return g;
  }

  // distance (1..max) to the first non-mask pixel in direction (dx,dy); max+1 when none
  function edgeDist(m, x, y, dx, dy, max) {
    for (let k = 1; k <= max; k++) if (!m.get(x + dx * k, y + dy * k)) return k;
    return max + 1;
  }
  // Paint the mask's pixels with 3/4-tone shading lit from the top (and optionally the left).
  // o: { top (hi thickness, 1), bot (shadow thickness, 1), left (hi, 0), right (shadow, 0), deep }
  function shadeMask(g, m, rp, o) {
    o = o || {};
    const top = o.top === undefined ? 1 : o.top;
    const bot = o.bot === undefined ? 1 : o.bot;
    const left = o.left || 0;
    const right = o.right || 0;
    const four = rp.length >= 4;
    const deep = four ? C(rp[0]) : 0;
    const sh = C(rp[four ? 1 : 0]);
    const base = C(rp[four ? 2 : 1]);
    const hi = C(rp[four ? 3 : 2]);
    const mx = Math.max(top, bot, left, right, 1);
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (!m.d[y * m.w + x]) continue;
        const eb = bot ? edgeDist(m, x, y, 0, 1, mx) : 99;
        const er = right ? edgeDist(m, x, y, 1, 0, mx) : 99;
        const et = top ? edgeDist(m, x, y, 0, -1, mx) : 99;
        const el = left ? edgeDist(m, x, y, -1, 0, mx) : 99;
        let c = base;
        if (eb <= bot || er <= right) c = four && (eb === 1 || er === 1) && bot > 1 ? deep : sh;
        else if (et <= top || el <= left) c = hi;
        g.set(x, y, c);
      }
    }
  }
  const MASK = C('#ffffff');
  function S(g, rp, draw, o) {
    const m = new Grid(g.w, g.h);
    draw(m, MASK);
    shadeMask(g, m, rp, o);
    return m;
  }
  // spherical shading for ellipses (light from top-left-front)
  function sOval(g, x, y, w, h, rp, o) {
    o = o || {};
    const lx = o.lx === undefined ? -0.5 : o.lx;
    const ly = o.ly === undefined ? -0.72 : o.ly;
    const lz = 0.55;
    const ln = Math.hypot(lx, ly, lz);
    const four = rp.length >= 4;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    const hiT = o.hi === undefined ? 0.84 : o.hi;
    const shT = o.sh === undefined ? 0.4 : o.sh;
    for (let yy = Math.floor(y); yy < y + h; yy++) {
      for (let xx = Math.floor(x); xx < x + w; xx++) {
        const nx = (xx + 0.5 - cx) / rx;
        const ny = (yy + 0.5 - cy) / ry;
        const d = nx * nx + ny * ny;
        if (d > 1.04) continue;
        const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, d)));
        const dot = (nx * lx + ny * ly + nz * lz) / ln;
        let c;
        if (four) c = dot > hiT ? rp[3] : dot > shT ? rp[2] : dot > shT - 0.38 ? rp[1] : rp[0];
        else c = dot > hiT ? rp[2] : dot > shT ? rp[1] : rp[0];
        g.set(xx, yy, c);
      }
    }
  }
  function sRect(g, x, y, w, h, rp, o) {
    S(g, rp, (m, c) => rect(m, x, y, w, h, c), o);
  }
  function sPoly(g, pts, rp, o) {
    S(g, rp, (m, c) => poly(m, pts, c), o);
  }

  // 1 px outline around solid pixels (4-neighbourhood); faint glow pixels are not outlined
  function outline(g, c) {
    const v = C(c || OUT);
    const w = g.w;
    const h = g.h;
    const src = g.d.slice();
    const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[y * w + x] >>> 24 >= 140;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (src[y * w + x] >>> 24 >= 140) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) g.d[y * w + x] = v;
      }
    }
  }
  function flipX(g) {
    const o = new Grid(g.w, g.h);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) o.d[y * g.w + (g.w - 1 - x)] = g.d[y * g.w + x];
    return o;
  }
  function flipY(g) {
    const o = new Grid(g.w, g.h);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) o.d[(g.h - 1 - y) * g.w + x] = g.d[y * g.w + x];
    return o;
  }
  function rotCW(g) {
    const o = new Grid(g.h, g.w);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) o.d[x * o.w + (g.h - 1 - y)] = g.d[y * g.w + x];
    return o;
  }
  function rotCCW(g) {
    const o = new Grid(g.h, g.w);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) o.d[(g.w - 1 - x) * o.w + y] = g.d[y * g.w + x];
    return o;
  }
  function blit(dst, src, dx, dy, o) {
    dx = Math.round(dx);
    dy = Math.round(dy);
    const fade = o && o.alpha !== undefined ? o.alpha : 1;
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const v = src.d[y * src.w + x];
        if (!(v >>> 24)) continue;
        dst.set(dx + x, dy + y, fade >= 1 ? v : alpha(v, (ca(v) / 255) * fade));
      }
    }
  }
  function bounds(g) {
    let x0 = g.w;
    let y0 = g.h;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        if (g.d[y * g.w + x] >>> 24) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  function tint(g, c, t, onlySolid) {
    const v = C(c);
    for (let i = 0; i < g.d.length; i++) {
      const p = g.d[i];
      if (!(p >>> 24)) continue;
      if (onlySolid && p >>> 24 < 140) continue;
      g.d[i] = mix(p, v, t);
    }
  }


  // EPX / Scale2x — used to pre-smooth before rotation (RotSprite-style)
  function scale2x(g) {
    const o = new Grid(g.w * 2, g.h * 2);
    const W = g.w;
    const H = g.h;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? g.d[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))] : g.d[y * W + x]);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const P = g.d[y * W + x];
        const A = at(x, y - 1);
        const B = at(x + 1, y);
        const Cc = at(x - 1, y);
        const D = at(x, y + 1);
        let e0 = P;
        let e1 = P;
        let e2 = P;
        let e3 = P;
        if (Cc === A && Cc !== D && A !== B) e0 = A;
        if (A === B && A !== Cc && B !== D) e1 = B;
        if (D === Cc && D !== B && Cc !== A) e2 = Cc;
        if (B === D && B !== A && D !== Cc) e3 = D;
        const ox = x * 2;
        const oy = y * 2;
        o.d[oy * o.w + ox] = e0;
        o.d[oy * o.w + ox + 1] = e1;
        o.d[(oy + 1) * o.w + ox] = e2;
        o.d[(oy + 1) * o.w + ox + 1] = e3;
      }
    }
    return o;
  }
  // Rotate clockwise by deg around pixel (ox, oy). Returns { g, ox, oy } — the pivot in the output.
  const rotCache = typeof WeakMap !== 'undefined' ? new WeakMap() : new Map();
  function rotSprite(src, deg, ox, oy) {
    let a = ((Math.round(deg) % 360) + 360) % 360;
    if (a === 0) return { g: src, ox, oy };
    let s4 = rotCache.get(src);
    if (!s4) {
      s4 = scale2x(scale2x(src));
      rotCache.set(src, s4);
    }
    const rad = (a * Math.PI) / 180;
    const cs = Math.cos(rad);
    const sn = Math.sin(rad);
    const R = Math.ceil(Math.hypot(Math.max(ox + 1, src.w - ox), Math.max(oy + 1, src.h - oy))) + 1;
    const out = new Grid(R * 2 + 1, R * 2 + 1);
    for (let y = 0; y < out.h; y++) {
      for (let x = 0; x < out.w; x++) {
        const dx = x - R;
        const dy = y - R;
        const sx = dx * cs + dy * sn;
        const sy = -dx * sn + dy * cs;
        const u = Math.floor((ox + 0.5 + sx) * 4);
        const v = Math.floor((oy + 0.5 + sy) * 4);
        if (u < 0 || v < 0 || u >= s4.w || v >= s4.h) continue;
        out.d[y * out.w + x] = s4.d[v * s4.w + u];
      }
    }
    return { g: out, ox: R, oy: R };
  }
  // draw a (rotated) sub-sprite so that its pivot lands on (x, y)
  function place(g, src, deg, ox, oy, x, y, flip) {
    let s = src;
    let pox = ox;
    if (flip) {
      s = flipX(src);
      pox = src.w - 1 - ox;
    }
    const r = rotSprite(s, deg, pox, oy);
    blit(g, r.g, x - r.ox, y - r.oy);
  }
  function rotPoint(dx, dy, deg) {
    const r = (deg * Math.PI) / 180;
    return [dx * Math.cos(r) - dy * Math.sin(r), dx * Math.sin(r) + dy * Math.cos(r)];
  }
  // tiny 4-point sparkle (post-outline decoration)
  function sparkle(g, x, y, c, big) {
    const core = C('#ffffff');
    g.set(x, y, core);
    g.set(x - 1, y, c);
    g.set(x + 1, y, c);
    g.set(x, y - 1, c);
    g.set(x, y + 1, c);
    if (big) {
      g.set(x - 2, y, alpha(c, 0.6));
      g.set(x + 2, y, alpha(c, 0.6));
      g.set(x, y - 2, alpha(c, 0.6));
      g.set(x, y + 2, alpha(c, 0.6));
    }
  }
  function glowDot(g, x, y, c, r, a) {
    const R = Math.ceil(r);
    for (let j = -R; j <= R; j++) {
      for (let i = -R; i <= R; i++) {
        const d = Math.hypot(i, j) / (r + 0.01);
        if (d <= 1) g.set(x + i, y + j, alpha(c, (a === undefined ? 0.5 : a) * (1 - d * d)));
      }
    }
  }
  // seeded RNG so procedural details are stable between builds
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      return s / 4294967296;
    };
  }

  // ===================================================================== canvas output
  function mkCanvas(w, h) {
    if (!HAS_DOM) return { width: w, height: h, getContext: () => null, toDataURL: () => BLANK_URL };
    const c = document.createElement('canvas');
    c.width = Math.max(1, w | 0);
    c.height = Math.max(1, h | 0);
    return c;
  }
  function toCanvas(g) {
    const c = mkCanvas(g.w, g.h);
    const ctx = c.getContext && c.getContext('2d');
    if (!ctx) return c;
    const img = ctx.createImageData(g.w, g.h);
    if (LITTLE_ENDIAN) {
      new Uint32Array(img.data.buffer).set(g.d);
    } else {
      for (let i = 0; i < g.d.length; i++) {
        const v = g.d[i];
        img.data[i * 4] = cr(v);
        img.data[i * 4 + 1] = cg(v);
        img.data[i * 4 + 2] = cb(v);
        img.data[i * 4 + 3] = ca(v);
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  function toURL(c) {
    try {
      return c && c.toDataURL ? c.toDataURL('image/png') : BLANK_URL;
    } catch {
      return BLANK_URL;
    }
  }

  // ===================================================================== sprite registry
  const DEFS = Object.create(null);
  const CACHE = Object.create(null);
  const DEFAULT_FPS = { idle: 3, walk: 8, run: 12, attack: 5, hurt: 6, dead: 4, fly: 10, play: 18, spin: 12, fall: 12 };
  const ONCE = { dead: true, hurt: true };
  const ALIASES = {
    run: ['walk', 'fly', 'idle'],
    walk: ['run', 'fly', 'idle'],
    move: ['walk', 'run', 'fly', 'idle'],
    fly: ['walk', 'idle', 'spin', 'play'],
    idle: ['walk', 'fly', 'spin', 'play'],
    attack: ['idle', 'fly'],
    hurt: ['idle', 'fly'],
    spin: ['fly', 'play'],
    play: ['fly', 'spin'],
  };
  function def(name, d) {
    d.name = name;
    for (const k of Object.keys(d.anims)) {
      const a = d.anims[k];
      if (a.fps === undefined) a.fps = DEFAULT_FPS[k] || 8;
      if (a.once === undefined) a.once = !!ONCE[k];
    }
    DEFS[name] = d;
  }
  function frameParams(anim, i, n, look) {
    const p = { anim, i, n, t: n > 1 ? i / n : 0, look: look || null, ph: 0, bob: 0, atk: -1, hurt: anim === 'hurt', dead: anim === 'dead' };
    if (anim === 'walk' || anim === 'run') {
      p.ph = n >= 4 ? i % 4 : (i * 2) % 4;
      p.bob = n >= 4 ? (i % 2 === 1 ? -1 : 0) : i % 2 ? -1 : 0;
    } else if (anim === 'idle') {
      p.bob = i % 2 ? 1 : 0;
    } else if (anim === 'attack') {
      p.atk = i;
    }
    return p;
  }
  // generic "toppled over" dead pose: the idle frame rotated onto its back, darkened, resting on the floor
  function fallen(d, look, mode) {
    const src = new Grid(d.w, d.h);
    d.draw(src, frameParams('idle', 0, 1, look));
    const r = mode === 'flip' ? flipY(src) : mode === 'tilt' ? rotSprite(src, d.tilt || -35, Math.floor(d.w / 2), Math.floor(d.h / 2)).g : rotCCW(src);
    const b = bounds(r);
    const g = new Grid(d.w, d.h);
    if (!b) return g;
    tint(r, '#1a1020', 0.25);
    const dx = Math.round(d.w / 2 - b.w / 2) - b.x0 + (d.fallDx || 0);
    const dy = d.h - 2 - b.y1 - (d.fallLift || 0);
    blit(g, r, dx, dy);
    return g;
  }
  // Ground walkers are shifted so their idle feet (outline included) sit on the bottom row.
  function groundShift(d) {
    if (d._shift !== undefined) return d._shift;
    d._shift = 0;
    if (d.anchor === 'c' || d.ground === false || !(d.anims.idle || d.anims.walk)) return 0;
    const an = d.anims.idle ? 'idle' : 'walk';
    const g = new Grid(d.w, d.h);
    d.draw(g, frameParams(an, 0, d.anims[an].n, null));
    if (d.ol !== false) outline(g, d.ol || OUT);
    const b = bounds(g);
    if (b) d._shift = Math.max(0, d.h - 1 - b.y1);
    return d._shift;
  }
  function shiftDown(g, s) {
    if (!s) return g;
    const o = new Grid(g.w, g.h);
    o.d.set(g.d.subarray(0, g.w * (g.h - s)), g.w * s);
    return o;
  }
  function buildFrame(name, anim, i, look) {
    const d = DEFS[name];
    const a = d.anims[anim];
    const p = frameParams(anim, i, a.n, look);
    let g = new Grid(d.w, d.h);
    const collapsed = p.dead && d.fall;
    if (collapsed) g = fallen(d, look, d.fall);
    else d.draw(g, p);
    if (p.hurt && d.hurtTint !== false) tint(g, '#ff5050', 0.3, true);
    if (d.ol !== false) outline(g, d.ol || OUT);
    if (d.post) d.post(g, p);
    if (d.face === 'L') g = flipX(g);
    if (!collapsed) g = shiftDown(g, groundShift(d));
    return toCanvas(g);
  }
  function resolveAnim(d, anim) {
    if (d.anims[anim]) return anim;
    const al = ALIASES[anim];
    if (al) for (const k of al) if (d.anims[k]) return k;
    return null;
  }
  function framesFor(name, an, look) {
    const d = DEFS[name];
    const key = d.lookKey ? d.lookKey(look) : '';
    const byAnim = CACHE[name] || (CACHE[name] = Object.create(null));
    const byLook = byAnim[an] || (byAnim[an] = Object.create(null));
    if (byLook[key]) return byLook[key];
    const lk = d.lookNorm ? d.lookNorm(look) : look || null;
    const n = d.anims[an].n;
    const arr = [];
    for (let i = 0; i < n; i++) {
      try {
        arr.push(buildFrame(name, an, i, lk));
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('[DD.sprites] failed to build', name, an, i, e);
        arr.push(placeholder());
      }
    }
    byLook[key] = arr;
    return arr;
  }

  // magenta "missing sprite" canvas
  let PH = null;
  const PH_SET = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
  function placeholder() {
    if (PH) return PH;
    const g = new Grid(16, 16);
    rect(g, 0, 0, 16, 16, '#ff00ff');
    for (let i = 0; i < 16; i++) {
      g.set(i, i, '#200020');
      g.set(15 - i, i, '#200020');
    }
    PH = toCanvas(g);
    try {
      if (PH_SET && typeof PH === 'object') PH_SET.add(PH);
    } catch {
      /* stub canvas outside the browser */
    }
    return PH;
  }

  // ===================================================================== HERO
  const HP = {
    skin: R3('#c0705a', '#f4b48e', '#ffe0c2'),
    hair: R3('#4a2416', '#7e4424', '#b8743a'),
    steel: R3('#434c66', '#7c88a6', '#c8d2e4'),
    pants: R3('#24263e', '#3a3c5e', '#585a86'),
    boot: R3('#38200f', '#6c4026', '#a0683c'),
    cape: R3('#5a1222', '#a82638', '#e4545c'),
    leather: R3('#3e2418', '#6a4028', '#9a6a42'),
    eye: C('#1c1028'),
  };
  const DEFAULT_TRIM = '#c8903c';
  function trimRamp(ar) {
    return ar >= 0 ? ramp(rarityColor(ar)) : ramp(DEFAULT_TRIM);
  }

  // In-hand weapons, drawn pointing up; (gx, gy) = grip pixel, (tx, ty) = tip pixel.
  const WEAPONS = [
    {
      // 0 medieval — steel sword
      rows: ['..3..', '.332.', '.321.', '.321.', '.321.', '.321.', '.321.', '.321.', 'qgGgq', '..h..', '..h..', '..p..'],
      pal: { 3: '#eef2f8', 2: '#a8b2c2', 1: '#5e687c', g: '#b88a3c', G: '#f0c868', q: '#7a5426', h: '#5a3420', p: '#d09a40' },
      gx: 2, gy: 10, tx: 2, ty: 0,
    },
    {
      // 1 arcane — runed blade
      rows: ['..3..', '.332.', '.3R1.', '.321.', '.3r1.', '.321.', '.3R1.', '.321.', '.3r1.', 'GgcgG', '.qhq.', '..h..', '..p..'],
      pal: { 3: '#c8d0ff', 2: '#6a74dc', 1: '#363a8c', R: '#b4ffff', r: '#3cd8f0', G: '#f4f6ff', g: '#b0b8d0', q: '#6a7090', c: '#40f0ff', h: '#2c2458', p: '#c8d0e8' },
      gx: 2, gy: 11, tx: 2, ty: 0,
    },
    {
      // 2 infernal — flaming axe
      rows: ['...y.y.', '..yFyFy', '..hfFfF', '..hoOOE', '..hoooE', '..hoooE', '..hooE.', '..h....', '..h....', '..h....', '..h....', '..p....'],
      pal: { y: '#fff27a', F: '#ffa21a', f: '#e8461a', o: '#2e2834', O: '#5c5068', E: '#ff8a2a', h: '#4a2a1c', p: '#8a2a1a' },
      gx: 2, gy: 9, tx: 5, ty: 0,
    },
    {
      // 3 steampunk — steam saber
      rows: ['....3', '...32', '...31', '..321', '..321', '.321.', '.321.', '.321.', 'kgGgk', 'c.h..', 'cch..', '..h..', '..p..'],
      pal: { 3: '#f0f4f8', 2: '#a8b4bc', 1: '#5a6670', g: '#c8962e', G: '#f2d27a', k: '#3a3c44', c: '#d0763a', h: '#5a3420', p: '#c8962e' },
      gx: 2, gy: 11, tx: 4, ty: 0,
    },
    {
      // 4 cyber — plasma katana
      rows: ['...c.', '..cW.', '..cWC', '.cWC.', '.cWC.', '.cWC.', '.cWC.', '.cWC.', '.cWC.', '.kKk.', '..m..', '..M..', '..m..', '..k..'],
      pal: { c: '#21e6ff', W: '#eaffff', C: '#0a90c0', k: '#262a3a', K: '#5a6280', m: '#c01e90', M: '#ff4ad0' },
      gx: 2, gy: 11, tx: 3, ty: 0,
    },
    {
      // 5 cosmic — star blade
      rows: ['..3..', '.3*2.', '.3s1.', '.321.', '.3*1.', '.321.', '.3s1.', '.321.', '.3*1.', 'GgxgG', '.g.g.', '..h..', '..h..', '.XxX.'],
      pal: { 3: '#b8a8ff', 2: '#5a46c0', 1: '#2a1e70', '*': '#ffffff', s: '#ffe08a', G: '#fff0a0', g: '#e0b030', x: '#ff7af0', h: '#2a1e50', X: '#ffe060' },
      gx: 2, gy: 11, tx: 2, ty: 0,
    },
  ];
  const weaponGridCache = new Map();
  function weaponGrid(era, rar) {
    const e = Math.max(0, Math.min(5, era | 0));
    const r = rar | 0;
    const key = e + '|' + (r >= 2 ? r : 0);
    let g = weaponGridCache.get(key);
    if (g) return g;
    const W = WEAPONS[e];
    const pal = Object.assign({}, W.pal);
    if (r >= 2 && pal[3]) pal[3] = hex(mix(pal[3], rarityColor(r), 0.45));
    g = gridFrom(W.rows, pal);
    weaponGridCache.set(key, g);
    return g;
  }

  const HEAD_ROWS = [
    '..abbbb..',
    '.abbbbccb',
    'abbbbbbcc',
    'uutttttTT',
    'abbbslllS',
    'abbksseSs',
    'abbksseks',
    '.abkkssss',
    '..akkkkk.',
  ];
  const HEAD_HURT = HEAD_ROWS.slice();
  HEAD_HURT[5] = 'abbksskSs';
  HEAD_HURT[6] = 'abbksseks';
  function headPal(trim) {
    return {
      a: HP.hair[0], b: HP.hair[1], c: HP.hair[2],
      s: HP.skin[1], k: HP.skin[0], l: HP.skin[2], S: HP.skin[2],
      e: HP.eye, u: trim[0], t: trim[1], T: trim[2],
    };
  }

  const HERO_RUN = [
    // [backFootDx, frontFootDx, backLift, frontLift, bob, backArmDx]
    [-3, 3, 0, 0, 0, 2],
    [-1, 1, 2, 0, -1, 1],
    [3, -3, 0, 0, 0, -2],
    [1, -1, 0, 2, -1, -1],
  ];
  function heroPose(p) {
    const cx = 20;
    const P = { cx, b: 0, lean: 0, legs: [-1, 1, 0, 0], barm: 0, hand: [cx + 4, 23], ang: 40, behind: false, cape: 0, eyes: 'open', weapon: true, tails: 0 };
    if (p.anim === 'idle') {
      P.b = p.i % 2 ? 1 : 0;
      P.hand = [cx + 4, 23 + P.b];
      P.ang = 40;
      P.cape = p.i % 2 ? 1 : 0;
    } else if (p.anim === 'run') {
      const r = HERO_RUN[p.i % 4];
      P.legs = [r[0], r[1], r[2], r[3]];
      P.b = r[4];
      P.barm = r[5];
      P.hand = [cx + 5 - (r[5] > 0 ? 1 : 0), 22 + P.b];
      P.ang = r[5] > 0 ? 58 : 48;
      P.cape = 2 + (p.i % 2);
      P.tails = 1 + (p.i % 2);
    } else if (p.anim === 'attack') {
      if (p.i === 0) {
        P.lean = -1;
        P.legs = [-2, 2, 0, 0];
        P.hand = [cx - 7, 18];
        P.ang = -62;
        P.behind = true;
        P.barm = 2;
        P.cape = 1;
      } else if (p.i === 1) {
        P.lean = 1;
        P.legs = [-3, 3, 0, 0];
        P.hand = [cx + 7, 21];
        P.ang = 95;
        P.barm = -2;
        P.cape = 2;
        P.tails = 1;
      } else {
        P.lean = 1;
        P.legs = [-3, 3, 0, 0];
        P.hand = [cx + 7, 24];
        P.ang = 128;
        P.barm = -2;
        P.cape = 3;
        P.tails = 2;
      }
    } else if (p.anim === 'hurt') {
      P.lean = -2;
      P.legs = [-2, 1, 0, 0];
      P.hand = [cx + 3, 25];
      P.ang = 70;
      P.eyes = 'shut';
      P.cape = 1;
    }
    return P;
  }

  function heroLeg(g, hx, dx, lift, back) {
    const top = 25;
    const bottom = 30 - lift;
    for (let y = top; y <= bottom; y++) {
      const t = (y - top) / Math.max(1, bottom - top);
      const x = Math.round(hx + dx * t);
      const boot = y >= bottom - 2;
      const rp = boot ? HP.boot : HP.pants;
      g.set(x, y, back ? rp[0] : rp[boot && y === bottom - 2 ? 2 : 1]);
      g.set(x + 1, y, back ? rp[0] : rp[0]);
      if (y === bottom) {
        g.set(x + 2, y, back ? rp[0] : rp[1]);
        if (lift) g.set(x - 1, y, back ? rp[0] : rp[1]);
      }
    }
  }

  function drawHero(g, p, noWeapon) {
    const L = p.look || HERO_DEFAULT_LOOK;
    const trim = trimRamp(L.armorRarity);
    const P = heroPose(p);
    const cx = P.cx;
    const ux = cx + P.lean; // upper-body x
    const ty = 20 + P.b; // torso top
    const hy = 11 + P.b; // head top

    // cape (behind everything)
    const capePts = [
      [[ux - 3, ty], [ux + 1, ty], [ux - 1, ty + 7], [ux - 6, ty + 9], [ux - 6, ty + 3]],
      [[ux - 3, ty], [ux + 1, ty], [ux - 1, ty + 7], [ux - 7, ty + 8], [ux - 6, ty + 3]],
      [[ux - 3, ty], [ux + 1, ty], [ux - 3, ty + 5], [ux - 11, ty + 6], [ux - 9, ty + 1]],
      [[ux - 3, ty], [ux + 1, ty], [ux - 3, ty + 6], [ux - 11, ty + 4], [ux - 9, ty]],
    ][P.cape];
    S(g, HP.cape, (m, c) => poly(m, capePts, c), { top: 1, bot: 1 });
    // cape fold
    g.set(ux - 4, ty + 3, HP.cape[0]);
    g.set(ux - 5, ty + 4, HP.cape[0]);

    // headband tails fluttering behind the head
    if (P.tails) {
      g.set(ux - 5, hy + 3, trim[1]);
      g.set(ux - 6, hy + 3 + (P.tails === 1 ? 1 : 0), trim[0]);
      g.set(ux - 7, hy + 3 + (P.tails === 1 ? 1 : -1), trim[0]);
    }

    // back leg + back arm
    heroLeg(g, cx - 3, P.legs[0], P.legs[2], true);
    const bax = ux - 4 + P.barm;
    line(g, ux - 3, ty + 1, bax, ty + 4, HP.steel[0]);
    line(g, ux - 2, ty + 1, bax + 1, ty + 4, HP.steel[0]);
    g.set(bax, ty + 5, HP.skin[0]);
    g.set(bax + 1, ty + 5, HP.skin[0]);

    // front leg
    heroLeg(g, cx, P.legs[1], P.legs[3], false);

    // weapon behind the head during the wind-up
    const W = WEAPONS[L.weaponEra] || WEAPONS[0];
    const wg = weaponGrid(L.weaponEra, L.weaponRarity);
    const frontArm = () => {
      const [hx, hyy] = P.hand;
      line(g, ux + 1, ty + 1, hx - 1, hyy, HP.steel[1], 1);
      line(g, ux + 2, ty + 1, hx, hyy - 1, HP.steel[1], 1);
      rect(g, hx - 1, hyy - 1, 2, 2, HP.skin[1]);
      g.set(hx - 1, hyy - 1, HP.skin[2]);
    };
    if (!noWeapon && P.behind) place(g, wg, P.ang, W.gx, W.gy, P.hand[0], P.hand[1]);
    if (P.behind) frontArm();

    // torso: breastplate, belt, tassets
    S(g, HP.steel, (m, c) => {
      rect(m, ux - 4, ty, 8, 3, c);
      rect(m, ux - 3, ty + 3, 7, 1, c);
    }, { top: 1, bot: 1, right: 1 });
    g.set(ux + 1, ty + 1, HP.steel[2]);
    g.set(ux + 2, ty + 1, HP.steel[2]);
    hline(g, ux - 4, ux + 3, ty + 3, HP.leather[1]);
    g.set(ux - 4, ty + 3, HP.leather[0]);
    g.set(ux + 1, ty + 3, trim[2]);
    g.set(ux + 2, ty + 3, trim[1]);
    for (let i = 0; i < 7; i++) g.set(ux - 4 + i, ty + 4, i % 2 ? trim[0] : trim[1]);
    // collar + pauldron (armour trim)
    hline(g, ux - 2, ux + 1, ty, trim[1]);
    S(g, trim, (m, c) => oval(m, ux - 1, ty - 1, 5, 3, c), { top: 1, bot: 1 });

    // head
    stamp(g, ux - 4, hy, P.eyes === 'shut' ? HEAD_HURT : HEAD_ROWS, headPal(trim));

    // weapon in front + front arm
    if (!noWeapon && !P.behind) place(g, wg, P.ang, W.gx, W.gy, P.hand[0], P.hand[1]);
    if (!P.behind) frontArm();
  }

  function postHero(g, p) {
    const L = p.look || HERO_DEFAULT_LOOK;
    if (p.anim === 'dead') return;
    const P = heroPose(p);
    const rar = L.weaponRarity;
    const rc = C(rar >= 0 ? rarityColor(rar) : '#ffffff');
    // swing smear: a crisp crescent that is thickest mid-swing
    if (p.anim === 'attack' && p.i > 0) {
      const sx = P.cx + 2;
      const sy = 22;
      const a0 = p.i === 1 ? -60 : 70;
      const a1 = p.i === 1 ? 96 : 135;
      const outer = 14;
      const edgeC = rar >= 1 ? mix('#ffffff', rc, 0.75) : C('#9fd8ff');
      for (let a = a0; a <= a1; a += 1.5) {
        const k = (a - a0) / (a1 - a0);
        const thick = p.i === 1 ? 1 + Math.round(3.4 * Math.sin(Math.PI * Math.min(1, k * 1.15))) : Math.max(0, Math.round(2.5 * (1 - k)));
        for (let r = outer - thick; r <= outer; r++) {
          const [dx, dy] = rotPoint(0, -r, a);
          const x = Math.round(sx + dx);
          const y = Math.round(sy + dy);
          if (g.solid(x, y) && !(ca(g.get(x, y)) === 255 && g.get(x, y) === C(OUT))) continue;
          const isEdge = r === outer;
          const fade = p.i === 1 ? (k < 0.15 ? 0.55 : 1) : 0.75;
          g.set(x, y, alpha(isEdge ? edgeC : C('#ffffff'), fade * (isEdge ? 0.95 : 0.9)));
        }
      }
    }
    // rarity glint on the weapon tip
    if (rar >= 1) {
      const W = WEAPONS[L.weaponEra] || WEAPONS[0];
      const [dx, dy] = rotPoint(W.tx - W.gx, W.ty - W.gy, P.ang);
      const x = Math.round(P.hand[0] + dx);
      const y = Math.round(P.hand[1] + dy);
      const tw = p.anim === 'idle' || p.anim === 'run' ? p.i % 2 === 0 : true;
      if (rar === 1) {
        g.set(x, y, rc);
      } else if (tw) {
        sparkle(g, x, y, rc, rar >= 4);
      } else {
        g.set(x, y, '#ffffff');
      }
    }
  }

  function heroDead(g, look) {
    const tmp = new Grid(40, 32);
    drawHero(tmp, frameParams('idle', 0, 1, look), true);
    const r = rotCCW(tmp);
    const b = bounds(r);
    if (b) {
      tint(r, '#1a1020', 0.2);
      blit(g, r, 20 - Math.round(b.w / 2) - b.x0 - 2, 30 - b.y1);
    }
    const L = look || HERO_DEFAULT_LOOK;
    const W = WEAPONS[L.weaponEra] || WEAPONS[0];
    const wg = weaponGrid(L.weaponEra, L.weaponRarity);
    place(g, wg, 100, W.gx, W.gy, 22, 28);
  }

  const HERO_DEFAULT_LOOK = { weaponEra: 0, weaponRarity: -1, armorRarity: -1 };
  function heroLookNorm(look) {
    const l = look && typeof look === 'object' ? look : {};
    const n = (v, lo, hi, dflt) => {
      const x = Math.floor(Number(v));
      return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : dflt;
    };
    // hasWeapon / hasArmor === false (nothing equipped) → no glint / default bronze trim
    return {
      weaponEra: n(l.weaponEra, 0, 5, 0),
      weaponRarity: l.hasWeapon === false || l.weaponRarity === null || l.weaponRarity === undefined ? -1 : n(l.weaponRarity, -1, 6, -1),
      armorRarity: l.hasArmor === false || l.armorRarity === null || l.armorRarity === undefined ? -1 : n(l.armorRarity, -1, 6, -1),
    };
  }
  function heroLookKey(look) {
    const l = heroLookNorm(look);
    return l.weaponEra + '|' + l.weaponRarity + '|' + l.armorRarity;
  }

  def('hero', {
    w: 40, h: 32, face: 'R', hurtTint: false,
    anims: { idle: { n: 2, fps: 2.5 }, run: { n: 4, fps: 11 }, attack: { n: 3, fps: 12, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    lookKey: heroLookKey,
    lookNorm: heroLookNorm,
    draw(g, p) {
      if (p.dead) heroDead(g, p.look);
      else drawHero(g, p);
      if (p.hurt) tint(g, '#ff6060', 0.22, true);
    },
    post: postHero,
  });

  // ===================================================================== shared character helpers
  const STRIDE = [
    [-2, 2, 0, 0],
    [0, 0, 1, 0],
    [2, -2, 0, 0],
    [0, 0, 0, 1],
  ];
  // [backFootDx, frontFootDx, backLift, frontLift]
  function gait(p, amp) {
    const a = amp || 1;
    if (p.anim === 'walk') {
      const s = STRIDE[p.ph % 4];
      return [s[0] * a, s[1] * a, s[2], s[3]];
    }
    if (p.anim === 'attack') return p.atk ? [-a - 1, a + 1, 0, 0] : [-a, a, 0, 0];
    return [-1, 1, 0, 0];
  }
  // upper-body forward shift: wind-up leans back, strike lunges forward
  function lean(p, back, fwd) {
    if (p.anim === 'attack') return p.atk === 0 ? -back : fwd;
    if (p.hurt) return -1;
    return 0;
  }
  const FIRE = R3('#c8300c', '#ff8a1a', '#ffd84a').concat([C('#fff8c8')]);
  const GFIRE = R3('#1f8a3a', '#4ad84a', '#b4ff7a').concat([C('#f0ffe0')]);
  const VFIRE = R3('#5a2aa8', '#a86aff', '#e0c8ff').concat([C('#ffffff')]);
  // upward flame whose bottom-left corner is (x, y)
  function flame(g, x, y, w, h, seed, pal) {
    const r = rng(seed * 7919 + 17);
    const P = pal || FIRE;
    for (let i = 0; i < w; i++) {
      const u = w <= 1 ? 0 : Math.abs(i - (w - 1) / 2) / ((w - 1) / 2);
      const colH = Math.max(1, Math.round(h * Math.pow(1 - u * 0.8, 0.85) * (0.68 + 0.32 * r())));
      for (let j = 0; j < colH; j++) {
        const f = j / colH;
        let c;
        if (u < 0.5 && f < 0.42) c = P[3];
        else if (f > 0.72) c = P[0];
        else if (f > 0.4 || u > 0.7) c = P[1];
        else c = P[2];
        g.set(x + i, y - j, c);
      }
    }
  }
  function fireball(g, cx, cy, r, seed, pal) {
    const P = pal || FIRE;
    disc(g, cx, cy, r, P[0]);
    disc(g, cx, cy, Math.max(0.5, r - 1), P[1]);
    disc(g, cx - (r > 2 ? 1 : 0), cy - (r > 2 ? 1 : 0), Math.max(0.4, r - 2), P[2]);
    if (r >= 3) disc(g, cx - 1, cy - 1, r - 3.2, P[3]);
    flame(g, cx - r + 1, cy - r + 1, r * 2 - 1, Math.round(r * 1.2), seed, P);
  }
  function crack(g, pts, c1, c2) {
    for (let i = 0; i + 1 < pts.length; i++) line(g, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c1);
    if (c2) for (let i = 1; i + 1 < pts.length; i++) g.set(pts[i][0], pts[i][1], c2);
  }
  function eye2(g, x, y, white, pupil, front) {
    g.set(x, y, white);
    g.set(x + 1, y, white);
    g.set(x, y + 1, white);
    g.set(x + 1, y + 1, white);
    g.set(front ? x + 1 : x, y + 1, pupil);
    g.set(front ? x + 1 : x, y, pupil);
  }
  // stick leg from hip to foot with a knee bend; c = colour, w = width
  function limb(g, x0, y0, x1, y1, kneeDx, c, w) {
    const kx = Math.round((x0 + x1) / 2 + (kneeDx || 0));
    const ky = Math.round((y0 + y1) / 2);
    line(g, x0, y0, kx, ky, c, w || 1);
    line(g, kx, ky, x1, y1, c, w || 1);
  }
  // shaded fat leg column (w wide) from hip to foot with a foot block toward the front
  function fatLeg(g, hx, hy, fy, dx, lift, w, rp, footRp, toe) {
    const bottom = fy - lift;
    const m = new Grid(g.w, g.h);
    for (let y = hy; y <= bottom; y++) {
      const t = (y - hy) / Math.max(1, bottom - hy);
      const x = Math.round(hx + dx * t);
      rect(m, x, y, w, 1, MASK);
    }
    shadeMask(g, m, rp, { top: 0, bot: 0, left: 1, right: 1 });
    if (footRp) {
      const fx = Math.round(hx + dx);
      sRect(g, fx - 1, bottom - 1, w + (toe || 1) + 1, 2, footRp, { top: 1, bot: 1 });
    }
  }
  // ===================================================================== CRYPT — bone / teal / moss
  const BONE = R3('#8a7f6a', '#d6cdb2', '#f7f1dd');
  const TEAL = R3('#173c44', '#2e7376', '#58b3a4');
  const MOSS = R3('#2a4520', '#4c7631', '#84ad49');
  const CRYPT_EYE = C('#9dff6a');
  const SOCKET = C('#241a2c');
  const SKEL_SWORD = gridFrom(['.3.', '321', '321', '321', '321', '321', 'gGg', '.h.', '.p.'], {
    3: '#cfc4ae', 2: '#8c7a66', 1: '#5a4636', g: '#6a4a2a', G: '#a06e3a', h: '#3a2418', p: '#7a5430',
  });

  function skull(g, x, y, open) {
    sOval(g, x, y, 8, 7, BONE);
    rect(g, x + 4, y + 2, 2, 2, SOCKET);
    g.set(x + 5, y + 3, CRYPT_EYE);
    g.set(x + 7, y + 4, SOCKET);
    // jaw + teeth
    rect(g, x + 2, y + 6, 6, 2 + (open ? 1 : 0), BONE[0]);
    for (let i = 0; i < 3; i++) g.set(x + 3 + i * 2, y + 6, BONE[2]);
    if (open) hline(g, x + 3, x + 7, y + 7, SOCKET);
  }

  def('skeleton', {
    w: 26, h: 26, face: 'L',
    anims: { walk: { n: 4, fps: 7 }, idle: { n: 2, fps: 2.5 }, attack: { n: 2, fps: 5, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const cx = 12;
      if (p.dead) {
        // collapsed bone pile with the skull on top
        const by = 24;
        sRect(g, cx - 8, by - 1, 7, 1, BONE);
        g.set(cx - 9, by - 1, BONE[1]);
        g.set(cx - 1, by - 1, BONE[1]);
        line(g, cx - 4, by, cx + 4, by - 2, BONE[0]);
        sRect(g, cx + 2, by - 1, 6, 1, BONE);
        for (let i = 0; i < 3; i++) hline(g, cx - 3, cx + 2, by - 3 - i * 2, i % 2 ? BONE[1] : BONE[2]);
        vline(g, cx - 1, by - 7, by - 2, BONE[0]);
        rect(g, cx - 6, by - 4, 4, 2, TEAL[1]);
        g.set(cx - 7, by - 3, TEAL[0]);
        place(g, SKEL_SWORD, 90, 1, 7, cx + 4, by - 1);
        skull(g, cx - 1, by - 13, false);
        rect(g, cx + 3, by - 11, 2, 2, SOCKET);
        return;
      }
      const L = lean(p, 1, 2);
      const b = p.bob;
      const ux = cx + L;
      const [bd, fd, bl, fl] = gait(p, 1.5);
      // legs (bones)
      const hy = 17;
      limb(g, cx - 2, hy, cx - 2 + bd, 24 - bl, 1, BONE[0]);
      hline(g, cx - 2 + Math.round(bd), cx - 1 + Math.round(bd), 24 - bl, BONE[0]);
      // back arm
      line(g, ux - 2, 10 + b, ux - 3 + (p.anim === 'walk' ? -Math.round(fd / 2) : 0), 15 + b, BONE[0]);
      // scarf tail
      const flap = p.anim === 'walk' ? p.ph % 2 : 0;
      rect(g, ux - 6, 9 + b + flap, 3, 1, TEAL[0]);
      g.set(ux - 7, 10 + b + flap, TEAL[0]);
      // pelvis + spine + ribs
      sRect(g, cx - 2, 16, 5, 2, BONE);
      vline(g, ux, 10 + b, 15, BONE[0]);
      hline(g, ux - 3, ux + 2, 10 + b, BONE[2]);
      hline(g, ux - 3, ux + 2, 12 + b, BONE[1]);
      hline(g, ux - 2, ux + 2, 14 + b, BONE[1]);
      g.set(ux - 3, 11 + b, BONE[0]);
      g.set(ux + 2, 11 + b, BONE[0]);
      g.set(ux - 3, 13 + b, BONE[0]);
      g.set(ux + 2, 13 + b, BONE[0]);
      // front leg
      limb(g, cx + 1, hy, cx + 1 + fd, 24 - fl, 1, BONE[1]);
      hline(g, cx + 1 + Math.round(fd), cx + 3 + Math.round(fd), 24 - fl, BONE[1]);
      // scarf
      sRect(g, ux - 3, 8 + b, 6, 2, TEAL, { top: 1, bot: 1 });
      // skull
      skull(g, ux - 3, 1 + b, p.anim === 'attack' && p.atk === 1);
      if (p.hurt) {
        rect(g, ux + 1, 3 + b, 2, 2, SOCKET);
      }
      // front arm + rusty sword
      let hand = [ux + 4, 15 + b];
      let ang = 32 + (p.anim === 'walk' ? (p.ph % 2) * 6 : 0);
      if (p.anim === 'attack') {
        if (p.atk === 0) {
          hand = [ux, 7];
          ang = -35;
        } else {
          hand = [ux + 6, 13];
          ang = 100;
        }
      } else if (p.hurt) {
        hand = [ux + 3, 16];
        ang = 70;
      }
      place(g, SKEL_SWORD, ang, 1, 7, hand[0], hand[1]);
      line(g, ux + 1, 10 + b, hand[0], hand[1], BONE[1]);
      g.set(hand[0], hand[1], BONE[2]);
    },
  });

  def('bat', {
    ground: false, w: 28, h: 20, face: 'L',
    anims: { walk: { n: 4, fps: 12 }, idle: { n: 4, fps: 10 }, attack: { n: 2, fps: 5, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const FUR = R3('#1c2430', '#34485a', '#5c7c8c');
      const MEM = R3('#1a2c34', '#2c5458', '#4a8682');
      const cx = 14;
      if (p.dead) {
        const by = 17;
        sPoly(g, [[cx - 9, by + 1], [cx - 2, by - 3], [cx - 2, by + 1]], MEM);
        sPoly(g, [[cx + 9, by + 1], [cx + 2, by - 3], [cx + 2, by + 1]], MEM);
        sOval(g, cx - 3, by - 5, 7, 6, FUR);
        g.set(cx - 1, by - 3, '#ff5050');
        g.set(cx + 1, by - 3, '#ff5050');
        return;
      }
      let ph = p.i % 4;
      let dx = 0;
      let dy = 0;
      if (p.anim === 'attack') {
        ph = p.atk === 0 ? 0 : 2;
        dx = p.atk === 0 ? -2 : 3;
        dy = p.atk === 0 ? -1 : 2;
      } else if (p.hurt) {
        ph = 1;
        dx = -2;
      }
      const tipY = [1, 7, 15, 8][ph];
      const by = 10 + [-1, 0, 1, 0][ph] + dy;
      const bx = cx + dx;
      const wing = (s) => {
        const tx = bx + s * 13;
        const pts = [
          [bx + s * 1, by - 2],
          [bx + s * 6, by - 2 - (tipY < by ? (by - tipY) * 0.6 : -2)],
          [tx, tipY],
          [bx + s * 10, by + 3],
          [bx + s * 8, by + 2],
          [bx + s * 6, by + 4],
          [bx + s * 4, by + 2],
          [bx + s * 2, by + 3],
        ];
        if (s < 0) pts.forEach((q) => (q[0] += 1));
        S(g, MEM, (m, c) => poly(m, pts, c), { top: 1, bot: 0 });
        line(g, bx + s * 2, by - 1, tx, tipY, FUR[0]);
        line(g, bx + s * 4, by - 1, bx + s * 8, by + 2, MEM[0]);
      };
      wing(-1);
      wing(1);
      sOval(g, bx - 3, by - 3, 7, 7, FUR);
      // ears
      g.set(bx - 2, by - 4, FUR[1]);
      g.set(bx - 2, by - 5, FUR[2]);
      g.set(bx + 2, by - 4, FUR[1]);
      g.set(bx + 2, by - 5, FUR[2]);
      // face
      const eyeC = C('#ff4a4a');
      if (p.hurt) {
        hline(g, bx - 1, bx, by - 1, '#ffb0b0');
        hline(g, bx + 2, bx + 3, by - 1, '#ffb0b0');
      } else {
        g.set(bx, by - 1, eyeC);
        g.set(bx + 2, by - 1, eyeC);
      }
      const open = p.anim === 'attack';
      if (open) {
        rect(g, bx, by + 1, 3, 2, '#3a0a14');
        g.set(bx, by + 1, '#ffffff');
        g.set(bx + 2, by + 1, '#ffffff');
      } else {
        g.set(bx, by + 2, '#ffffff');
        g.set(bx + 2, by + 2, '#ffffff');
      }
    },
  });

  const SLIME = [C('#183418'), C('#2c6a2c'), C('#4fa040'), C('#9ee070')];
  function slimeBody(g, cx, ground, w, h, skew, mood) {
    const top = ground - h + 1;
    const m = new Grid(g.w, g.h);
    for (let y = top; y <= ground; y++) {
      const t = (y - top) / Math.max(1, h - 1); // 0 top → 1 bottom
      const half = (w / 2) * Math.sqrt(Math.max(0, 1 - Math.pow(1 - Math.min(1, t * 1.15), 2)));
      const off = Math.round(skew * (1 - t));
      for (let x = Math.round(cx - half + off); x < Math.round(cx + half + off); x++) m.set(x, y, MASK);
    }
    shadeMask(g, m, SLIME, { top: 1, bot: 2, right: 1 });
    // translucent swallowed bone
    const bx = cx - 3 + Math.round(skew / 2);
    const by = ground - Math.round(h * 0.4);
    hline(g, bx, bx + 4, by, mix(BONE[1], SLIME[2], 0.5));
    g.set(bx - 1, by - 1, mix(BONE[1], SLIME[2], 0.5));
    g.set(bx + 5, by + 1, mix(BONE[1], SLIME[2], 0.5));
    // shine
    g.set(cx - Math.round(w / 4) + skew, top + 2, '#e8ffd8');
    g.set(cx - Math.round(w / 4) + 1 + skew, top + 1, '#e8ffd8');
    // eyes near the front
    const ex = cx + Math.round(w / 6) + skew;
    const ey = top + Math.max(2, Math.round(h * 0.3));
    if (mood === 'dead') {
      g.set(ex, ey, SOCKET);
      g.set(ex + 3, ey, SOCKET);
    } else if (mood === 'hurt') {
      hline(g, ex, ex + 1, ey + 1, SOCKET);
      hline(g, ex + 3, ex + 4, ey + 1, SOCKET);
    } else {
      eye2(g, ex, ey, '#f4fff0', SOCKET, true);
      eye2(g, ex + 3, ey, '#f4fff0', SOCKET, true);
      if (mood === 'angry') {
        g.set(ex, ey - 1, SOCKET);
        g.set(ex + 4, ey - 1, SOCKET);
        rect(g, ex + 1, ey + 3, 3, 2, '#14280f');
      }
    }
  }
  def('slime', {
    w: 26, h: 20, face: 'L',
    anims: { walk: { n: 4, fps: 6 }, idle: { n: 2, fps: 2.5 }, attack: { n: 2, fps: 5, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const cx = 13;
      const gr = 18;
      if (p.dead) return slimeBody(g, cx, gr, 22, 5, 0, 'dead');
      if (p.anim === 'walk') {
        const s = [[18, 12], [16, 14], [14, 16], [16, 14]][p.ph];
        return slimeBody(g, cx, gr, s[0], s[1], p.ph === 2 ? 1 : 0, 'calm');
      }
      if (p.anim === 'attack') {
        if (p.atk === 0) return slimeBody(g, cx - 1, gr, 20, 10, -1, 'angry');
        return slimeBody(g, cx + 2, gr, 16, 15, 4, 'angry');
      }
      if (p.hurt) return slimeBody(g, cx - 1, gr, 19, 11, -1, 'hurt');
      const s = p.i ? [17, 13] : [18, 12];
      return slimeBody(g, cx, gr, s[0], s[1], 0, 'calm');
    },
  });

  // ---- Lich Lord (boss)
  const ROBE = [C('#0b1c22'), C('#163840'), C('#2a5e64'), C('#4f9a94')];
  const GOLD = R3('#7a5a1e', '#d4a838', '#ffe68a');
  const LICH_STAFF = gridFrom(
    ['.gGg.', 'gyYyg', 'g.s.g', '.ksk.', '..w..', '..w..', '..W..', '..w..', '..w..', '..w..', '..W..', '..w..', '..w..', '..w..', '..w..', '..W..', '..w..', '..w..', '..w..', '..w..', '..w..', '..w..', '..w..', '..w..', '..w..', '..w..', '..k..'],
    { g: '#7a5a1e', G: '#ffe68a', y: '#4ad84a', Y: '#d8ff9a', s: '#d6cdb2', k: '#3a2a1a', w: '#5a4028', W: '#8a6a3a' },
  );
  def('lich', {
    ground: false, w: 56, h: 58, face: 'L', boss: true,
    anims: { walk: { n: 4, fps: 5 }, idle: { n: 2, fps: 2 }, attack: { n: 2, fps: 3.4, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const cx = 27;
      if (p.dead) {
        const gy = 55;
        S(g, ROBE, (m, c) => {
          oval(m, cx - 16, gy - 9, 32, 12, c);
        }, { top: 1, bot: 2 });
        for (let i = 0; i < 8; i++) g.set(cx - 15 + i * 4, gy - 2 - (i % 2), ROBE[0]);
        place(g, LICH_STAFF, 90, 2, 20, cx - 2, gy - 1);
        skull(g, cx - 4, gy - 15, false);
        rect(g, cx, gy - 13, 2, 2, SOCKET);
        sRect(g, cx + 8, gy - 4, 7, 3, GOLD);
        g.set(cx + 9, gy - 5, GOLD[1]);
        g.set(cx + 12, gy - 5, GOLD[1]);
        return;
      }
      const hover = p.anim === 'walk' ? [0, -1, -2, -1][p.ph] : p.anim === 'idle' ? (p.i ? -1 : 0) : 0;
      const L = lean(p, 2, 3);
      const ux = cx + L;
      const top = 6 + hover;
      const hem = 51 + hover;
      // tattered robe, flaring toward the hem
      const sway = p.anim === 'walk' ? [0, 1, 0, -1][p.ph] : 0;
      const pts = [[ux - 8, top + 15], [ux + 8, top + 15], [ux + 15 + sway, hem - 1]];
      for (let i = 0; i <= 10; i++) {
        const x = ux + 15 + sway - i * 3.2;
        pts.push([x, hem - 1 + (i % 2 ? 4 : 0) - (i === 5 ? 1 : 0)]);
      }
      pts.push([ux - 18 + sway, hem - 3], [ux - 11, top + 24]);
      S(g, ROBE, (m, c2) => poly(m, pts, c2), { top: 1, bot: 2, right: 1 });
      // robe folds + moss trim down the front
      for (let y = top + 22; y < hem - 2; y += 1) {
        const k = (y - top - 22) / (hem - top - 24);
        g.set(Math.round(ux + 2 + k * 4 + sway * k), y, MOSS[1]);
        g.set(Math.round(ux + 3 + k * 4 + sway * k), y, MOSS[2]);
        if (y % 3 === 0) {
          g.set(Math.round(ux - 5 - k * 6), y, ROBE[1]);
          g.set(Math.round(ux + 9 + k * 3), y, ROBE[1]);
        }
      }
      // belt of bones
      hline(g, ux - 8, ux + 8, top + 24, BONE[0]);
      for (let i = 0; i < 6; i++) g.set(ux - 7 + i * 3, top + 24, BONE[2]);
      // hood with a trailing peak
      S(g, ROBE, (m, c2) => {
        oval(m, ux - 8, top + 2, 16, 15, c2);
        rect(m, ux - 9, top + 11, 18, 5, c2);
        poly(m, [[ux - 7, top + 8], [ux - 3, top + 2], [ux - 13, top - 1]], c2);
      }, { top: 1, bot: 1 });
      // back arm: sleeve + bony hand (holds a green orb when casting)
      const castUp = p.anim === 'attack';
      const bh = castUp ? [ux - 12, top + 8] : [ux - 11, top + 26];
      S(g, ROBE, (m, c) => line(m, ux - 6, top + 17, bh[0] + 1, bh[1] - 1, c, 4), { top: 1, bot: 1 });
      rect(g, bh[0] - 1, bh[1] - 1, 3, 3, BONE[1]);
      g.set(bh[0] - 1, bh[1] - 1, BONE[2]);
      // skull face inside the hood
      sOval(g, ux - 4, top + 5, 10, 9, BONE);
      rect(g, ux, top + 8, 2, 2, SOCKET);
      rect(g, ux + 3, top + 8, 2, 2, SOCKET);
      g.set(ux + 1, top + 9, CRYPT_EYE);
      g.set(ux + 4, top + 9, CRYPT_EYE);
      g.set(ux + 5, top + 11, SOCKET);
      rect(g, ux - 1, top + 13, 6, 2, BONE[0]);
      for (let i = 0; i < 3; i++) g.set(ux + i * 2, top + 13, BONE[2]);
      if (p.atk === 1) hline(g, ux, ux + 4, top + 14, SOCKET);
      // moss collar + skull pauldrons
      S(g, MOSS, (m, c) => {
        rect(m, ux - 8, top + 15, 17, 3, c);
      }, { top: 1, bot: 1 });
      for (const sx of [ux - 13, ux + 6]) {
        sOval(g, sx, top + 13, 8, 6, BONE);
        g.set(sx + 4, top + 15, SOCKET);
        g.set(sx + 6, top + 15, SOCKET);
        g.set(sx + 5, top + 17, BONE[0]);
      }
      // crown
      sRect(g, ux - 4, top + 2, 10, 3, GOLD, { top: 1, bot: 1 });
      for (let i = 0; i < 4; i++) {
        const x = ux - 4 + i * 3;
        g.set(x, top + 1, GOLD[1]);
        g.set(x, top, GOLD[2]);
      }
      g.set(ux + 1, top + 3, '#4ad84a');
      g.set(ux + 4, top + 3, '#4ad84a');
      // front arm + staff
      let sh = [ux + 13, top + 26];
      let ang = 0;
      if (p.anim === 'attack') {
        if (p.atk === 0) {
          sh = [ux + 12, top + 20];
          ang = -12;
        } else {
          sh = [ux + 16, top + 22];
          ang = 38;
        }
      } else if (p.hurt) {
        ang = -10;
      }
      place(g, LICH_STAFF, ang, 2, 20, sh[0], sh[1]);
      S(g, ROBE, (m, c) => line(m, ux + 5, top + 17, sh[0] - 1, sh[1], c, 4), { top: 1, bot: 1 });
      rect(g, sh[0] - 1, sh[1] - 1, 3, 3, BONE[1]);
      g.set(sh[0], sh[1] - 1, BONE[2]);
    },
    post(g, p) {
      if (p.dead) return;
      const hover = p.anim === 'walk' ? [0, -1, -2, -1][p.ph] : p.anim === 'idle' ? (p.i ? -1 : 0) : 0;
      const top = 6 + hover;
      const ux = 27 + lean(p, 2, 3);
      // ghostly green wisps under the hem
      for (let i = 0; i < 5; i++) {
        const x = ux - 11 + i * 5 + ((p.i + i) % 2);
        glowDot(g, x, 55 + hover - (i % 2), '#4ad84a', 1.6, 0.45);
      }
      // staff flame
      let sh = [ux + 13, top + 26];
      let ang = 0;
      if (p.anim === 'attack') {
        sh = p.atk === 0 ? [ux + 12, top + 20] : [ux + 16, top + 22];
        ang = p.atk === 0 ? -12 : 38;
      } else if (p.hurt) ang = -10;
      const [dx, dy] = rotPoint(0, -19, ang);
      const fx = Math.round(sh[0] + dx);
      const fy = Math.round(sh[1] + dy);
      glowDot(g, fx, fy, '#7dff5a', p.anim === 'attack' ? 6 : 4, 0.4);
      flame(g, fx - 1, fy, 3, p.anim === 'attack' ? 6 : 4, p.i + 3, GFIRE);
      if (p.anim === 'attack') {
        const bh = [ux - 12, top + 8];
        glowDot(g, bh[0], bh[1] - 3, '#7dff5a', p.atk === 0 ? 5 : 3, 0.55);
        fireball(g, bh[0], bh[1] - 3, p.atk === 0 ? 3 : 2, p.atk + 11, GFIRE);
      }
    },
  });

  // ===================================================================== FUNGAL — violet / pink / glow-green
  const VIOLET = [C('#2a1240'), C('#4a2464'), C('#7b3fa0'), C('#b06ad6')];
  const PINK = R3('#a83a74', '#e86aa8', '#ffb0d8');
  const GLOW = R3('#2fae5a', '#6cf28a', '#d0ffb8');
  const STEM = R3('#9a8a74', '#dccfb8', '#f8f0e0');
  function capSpots(g, spots) {
    for (const s of spots) {
      rect(g, s[0], s[1], s[2], s[3], s[4] || PINK[1]);
      g.set(s[0], s[1], s[5] || PINK[2]);
    }
  }
  def('mushroom', {
    w: 24, h: 24, face: 'L', fall: 'tilt', tilt: -65,
    anims: { walk: { n: 4, fps: 8 }, idle: { n: 2, fps: 2.5 }, attack: { n: 2, fps: 5, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const cx = 12;
      const b = p.bob;
      const L = lean(p, 2, 3);
      const [bd, fd, bl, fl] = gait(p, 1);
      // feet
      sRect(g, cx - 4 + bd, 20 - bl, 3, 2, STEM);
      // stem body
      S(g, STEM, (m, c) => oval(m, cx - 4 + Math.round(L / 2), 11 + b, 9, 11, c), { top: 0, bot: 1, left: 1, right: 1 });
      sRect(g, cx + 1 + fd, 20 - fl, 3, 2, STEM);
      // arms
      const ax = cx + 4 + Math.round(L / 2);
      g.set(ax, 15 + b, STEM[1]);
      g.set(ax + 1, 16 + b + (p.anim === 'walk' ? p.ph % 2 : 0), STEM[1]);
      // face
      const fx = cx + 1 + Math.round(L / 2);
      if (p.hurt) {
        hline(g, fx, fx + 1, 15 + b, SOCKET);
        hline(g, fx + 3, fx + 4, 15 + b, SOCKET);
      } else {
        rect(g, fx, 14 + b, 1, 2, SOCKET);
        rect(g, fx + 3, 14 + b, 1, 2, SOCKET);
        g.set(fx - 1, 13 + b, SOCKET);
        g.set(fx + 4, 13 + b, SOCKET);
      }
      if (p.anim === 'attack' && p.atk === 1) rect(g, fx + 1, 17 + b, 2, 2, '#4a1a2a');
      else hline(g, fx + 1, fx + 2, 18 + b, STEM[0]);
      // cap
      const kx = cx + L;
      const ky = 1 + b + (p.anim === 'walk' && p.ph % 2 ? 1 : 0);
      S(g, VIOLET, (m, c) => {
        oval(m, kx - 10, ky, 20, 14, c);
        for (let y = ky + 10; y < ky + 14; y++) for (let x = kx - 10; x < kx + 10; x++) m.clear(x, y);
      }, { top: 1, bot: 2 });
      hline(g, kx - 8, kx + 7, ky + 10, '#5a2a54');
      hline(g, kx - 6, kx + 5, ky + 11, '#3a1a3a');
      capSpots(g, [[kx - 6, ky + 4, 2, 2], [kx - 1, ky + 2, 3, 2], [kx + 5, ky + 5, 2, 2], [kx - 3, ky + 7, 2, 1], [kx + 2, ky + 6, 1, 1]]);
      g.set(kx - 4, ky + 1, VIOLET[3]);
      g.set(kx - 3, ky + 1, VIOLET[3]);
    },
  });

  def('spider', {
    w: 32, h: 22, face: 'L', fall: 'flip',
    anims: { walk: { n: 4, fps: 10 }, idle: { n: 2, fps: 3 }, attack: { n: 2, fps: 5, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const SP_BODY = [C('#1e1030'), C('#3a2058'), C('#5e3a88'), C('#9468c0')];
      const cx = 15;
      const L = lean(p, 1, 3);
      const rear = p.anim === 'attack' && p.atk === 0;
      const b = p.anim === 'walk' ? (p.ph % 2 ? -1 : 0) : p.bob;
      const by = 9 + b;
      const legC = [SP_BODY[1], SP_BODY[2]];
      // legs: 4 per side; far side first (darker)
      const legs = (far) => {
        for (let k = 0; k < 4; k++) {
          const sx = cx - 3 + k * 3 + L;
          const phase = (k + (far ? 1 : 0) + (p.anim === 'walk' ? p.ph : 0)) % 2;
          const reach = [-7, -3, 2, 6][k] + (far ? 1 : 0);
          let fx = sx + reach + (phase ? 1 : -1) * (p.anim === 'walk' ? 1 : 0);
          let fy = 20 - (p.anim === 'walk' && phase && k % 2 === 0 ? 1 : 0);
          let kx = sx + Math.round(reach * 0.55);
          let ky = by - 4 + (far ? 1 : 0);
          if (rear && k === 3) {
            fx = sx + 8;
            fy = by - 9;
            kx = sx + 4;
            ky = by - 8;
          }
          if (p.anim === 'attack' && p.atk === 1 && k === 3) {
            fx = sx + 9;
            fy = by + 2;
            kx = sx + 6;
            ky = by - 5;
          }
          line(g, sx, by + 2, kx, ky, legC[far ? 0 : 1]);
          line(g, kx, ky, fx, fy, legC[far ? 0 : 1]);
        }
      };
      legs(true);
      // abdomen
      const ax = cx - 13 + L - (rear ? 1 : 0);
      sOval(g, ax, by - 5 + (rear ? 1 : 0), 14, 11, SP_BODY);
      // markings
      const mx = ax + 5;
      const my = by - 3 + (rear ? 1 : 0);
      rect(g, mx, my, 3, 1, PINK[1]);
      rect(g, mx + 1, my + 1, 1, 2, PINK[1]);
      rect(g, mx, my + 3, 3, 1, PINK[1]);
      g.set(mx + 1, my, PINK[2]);
      g.set(ax + 2, by - 1, GLOW[1]);
      g.set(ax + 10, by - 3, GLOW[1]);
      g.set(ax + 3, by + 2, GLOW[0]);
      // head
      const hx = cx + L + (rear ? 0 : 0);
      const hy = by - 1 - (rear ? 2 : 0);
      sOval(g, hx, hy, 9, 7, SP_BODY);
      // eyes: glowing cluster
      const eyes = p.hurt ? [] : [[hx + 6, hy + 2], [hx + 7, hy + 2], [hx + 5, hy + 1], [hx + 7, hy + 3]];
      for (const e of eyes) g.set(e[0], e[1], GLOW[2]);
      if (p.hurt) hline(g, hx + 5, hx + 7, hy + 2, GLOW[0]);
      // fangs
      const open = p.anim === 'attack' && p.atk === 1;
      g.set(hx + 7, hy + 6, PINK[2]);
      g.set(hx + 8, hy + 5 + (open ? 2 : 1), PINK[2]);
      if (open) g.set(hx + 8, hy + 6, PINK[1]);
      legs(false);
    },
  });

  def('sporeling', {
    w: 24, h: 22, face: 'L', hurtTint: true,
    anims: { walk: { n: 4, fps: 7 }, idle: { n: 2, fps: 2.5 }, attack: { n: 2, fps: 5, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const BODY = [C('#4a163e'), C('#8a2e6a'), C('#d05a9a'), C('#ffa8d4')];
      const cx = 11;
      if (p.dead) {
        S(g, BODY, (m, c) => oval(m, cx - 8, 15, 17, 6, c), { top: 1, bot: 1 });
        g.set(cx + 3, 17, SOCKET);
        g.set(cx + 5, 17, SOCKET);
        g.set(cx + 4, 16, SOCKET);
        g.set(cx + 4, 18, SOCKET);
        g.set(cx - 4, 16, GLOW[0]);
        return;
      }
      let w = 14;
      let h = 13;
      let hop = 0;
      if (p.anim === 'walk') {
        hop = [0, -2, -3, -1][p.ph];
        if (p.ph === 0) {
          w = 15;
          h = 12;
        }
      } else if (p.anim === 'attack') {
        if (p.atk === 0) {
          w = 17;
          h = 15;
        } else {
          w = 13;
          h = 12;
        }
      } else if (p.anim === 'idle' && p.i) {
        w = 15;
        h = 12;
      }
      const top = 19 - h + hop;
      // feet
      sRect(g, cx - 4, 18 + Math.min(0, hop + 1), 3, 2, BODY.slice(0, 3));
      sRect(g, cx + 1, 18 + Math.min(0, hop + 1), 3, 2, BODY.slice(0, 3));
      sOval(g, cx - Math.floor(w / 2), top, w, h, BODY);
      // glowing spots
      g.set(cx - 4, top + 2, GLOW[1]);
      g.set(cx - 3, top + 2, GLOW[2]);
      g.set(cx - 1, top + 1, GLOW[1]);
      g.set(cx - 5, top + 6, GLOW[1]);
      g.set(cx - 2, top + 5, GLOW[0]);
      // spore cannon snout
      const sx = cx + Math.floor(w / 2) - 2;
      const sy = top + Math.floor(h / 2);
      const ext = p.anim === 'attack' && p.atk === 1 ? 2 : 0;
      sRect(g, sx, sy - 1, 4 + ext, 4, BODY.slice(1, 4));
      rect(g, sx + 3 + ext, sy, 1, 2, '#1a0618');
      g.set(sx + 3 + ext, sy - 1, BODY[3]);
      // eye
      if (p.hurt) hline(g, cx, cx + 2, top + 4, SOCKET);
      else eye2(g, cx + 1, top + 3, '#fff4fa', SOCKET, true);
      if (p.anim === 'attack' && p.atk === 0) {
        g.set(cx + 4, top + 7, PINK[2]);
        g.set(cx - 5, top + 9, PINK[2]);
      }
    },
    post(g, p) {
      if (p.dead) return;
      const pts = [[5, 4], [17, 2], [3, 10]];
      for (let k = 0; k < pts.length; k++) {
        const y = pts[k][1] + ((p.i + k) % 2);
        glowDot(g, pts[k][0], y, '#8aff9a', 1.4, 0.55);
        g.set(pts[k][0], y, '#d8ffc8');
      }
      if (p.anim === 'attack' && p.atk === 1) {
        glowDot(g, 22, 11, '#8aff5a', 2, 0.7);
        disc(g, 22, 11, 1, '#9cff4a');
      }
    },
  });

  const SCEPTER = gridFrom(['.pPp.', 'pPGPp', 'pgGgp', '.pgp.', '..w..', '..w..', '..W..', '..w..', '..w..', '..w..', '..W..', '..w..', '..w..', '..w..', '..w..', '..w..', '..k..'], {
    p: '#7b3fa0', P: '#b06ad6', g: '#6cf28a', G: '#d0ffb8', w: '#6a4a2a', W: '#9a7040', k: '#3a2418',
  });
  def('myconid_king', {
    w: 60, h: 60, face: 'L', boss: true,
    anims: { walk: { n: 4, fps: 5 }, idle: { n: 2, fps: 2 }, attack: { n: 2, fps: 3.4, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const cx = 29;
      const gy = 57;
      if (p.dead) {
        S(g, VIOLET, (m, c) => {
          oval(m, cx - 26, gy - 16, 52, 30, c);
          for (let y = gy - 1; y < gy + 20; y++) for (let x = 0; x < 60; x++) m.clear(x, y);
        }, { top: 1, bot: 2 });
        capSpots(g, [[cx - 18, gy - 9, 4, 3, GLOW[1], GLOW[2]], [cx - 6, gy - 13, 5, 3, GLOW[1], GLOW[2]], [cx + 9, gy - 10, 4, 3, GLOW[1], GLOW[2]]]);
        sRect(g, cx + 16, gy - 5, 10, 4, GOLD);
        g.set(cx + 17, gy - 6, GOLD[2]);
        g.set(cx + 21, gy - 6, GOLD[2]);
        g.set(cx + 25, gy - 6, GOLD[2]);
        return;
      }
      const L = lean(p, 2, 3);
      const b = p.anim === 'idle' ? p.bob : p.anim === 'walk' ? (p.ph % 2 ? -1 : 0) : 0;
      const sway = p.anim === 'walk' ? [0, 1, 0, -1][p.ph] : 0;
      const [bd, fd, bl, fl] = gait(p, 2);
      // root feet
      const foot = (x, lift, rp) => {
        sRect(g, x, gy - 4 - lift, 9, 5, rp);
        g.set(x - 1, gy - lift, rp[0]);
        g.set(x + 9, gy - lift, rp[0]);
      };
      foot(cx - 11 + bd, bl * 2, [STEM[0], STEM[0], STEM[1]]);
      // back arm
      S(g, STEM, (m, c) => line(m, cx - 8 + L, 32 + b, cx - 13 + L + sway, 44 + b, c, 3), { top: 1, bot: 1 });
      // stem body
      S(g, STEM, (m, c) => {
        oval(m, cx - 10 + L, 22 + b, 20, 32 - b, c);
      }, { top: 0, bot: 2, left: 1, right: 2 });
      foot(cx + 2 + fd, fl * 2, STEM);
      // face
      const fx = cx + 2 + L;
      const fy = 31 + b;
      if (p.hurt) {
        hline(g, fx, fx + 2, fy + 1, SOCKET);
        hline(g, fx + 5, fx + 7, fy + 1, SOCKET);
      } else {
        rect(g, fx, fy, 3, 2, SOCKET);
        rect(g, fx + 5, fy, 3, 2, SOCKET);
        g.set(fx + 1, fy + 1, GLOW[2]);
        g.set(fx + 6, fy + 1, GLOW[2]);
        line(g, fx - 1, fy - 2, fx + 2, fy - 1, STEM[0]);
        line(g, fx + 8, fy - 2, fx + 5, fy - 1, STEM[0]);
      }
      // mossy beard
      S(g, MOSS, (m, c) => poly(m, [[fx - 3, fy + 3], [fx + 10, fy + 3], [fx + 6, fy + 13], [fx + 3, fy + 11], [fx + 1, fy + 14], [fx - 1, fy + 9]], c), { top: 1, bot: 1 });
      if (p.anim === 'attack' && p.atk === 1) rect(g, fx + 2, fy + 4, 4, 2, '#1e1018');
      // cap
      const ky = 4 + b + (p.anim === 'walk' ? Math.abs(sway) : 0);
      const kx = cx + L + sway;
      S(g, VIOLET, (m, c) => {
        oval(m, kx - 27, ky, 54, 30, c);
        for (let y = ky + 22; y < ky + 31; y++) for (let x = 0; x < 60; x++) m.clear(x, y);
      }, { top: 1, bot: 2 });
      hline(g, kx - 23, kx + 22, ky + 21, '#6a2a5a');
      hline(g, kx - 20, kx + 19, ky + 22, '#3a1438');
      capSpots(g, [
        [kx - 20, ky + 12, 4, 3, GLOW[1], GLOW[2]],
        [kx - 12, ky + 5, 5, 4, GLOW[1], GLOW[2]],
        [kx - 2, ky + 3, 4, 3, GLOW[1], GLOW[2]],
        [kx + 8, ky + 7, 5, 4, GLOW[1], GLOW[2]],
        [kx + 17, ky + 13, 4, 3, GLOW[1], GLOW[2]],
        [kx - 6, ky + 14, 3, 2, GLOW[1], GLOW[2]],
        [kx + 4, ky + 16, 3, 2, GLOW[1], GLOW[2]],
      ]);
      // crown
      sRect(g, kx - 7, ky - 1, 14, 4, GOLD, { top: 1, bot: 1 });
      for (let i = 0; i < 5; i++) {
        const x = kx - 7 + Math.round(i * 3.25);
        rect(g, x, ky - 3, 1, 2, GOLD[1]);
        g.set(x, ky - 4, GOLD[2]);
      }
      g.set(kx - 3, ky + 1, PINK[1]);
      g.set(kx + 3, ky + 1, PINK[1]);
      g.set(kx, ky, GLOW[1]);
      // front arm + scepter
      let hand = [cx + 15 + L, 38 + b];
      let ang = 8;
      if (p.anim === 'attack') {
        hand = p.atk === 0 ? [cx + 14, 30] : [cx + 19, 36];
        ang = p.atk === 0 ? -15 : 55;
      }
      place(g, SCEPTER, ang, 2, 12, hand[0], hand[1]);
      S(g, STEM, (m, c) => line(m, cx + 7 + L, 33 + b, hand[0], hand[1], c, 3), { top: 1, bot: 1 });
      sRect(g, hand[0] - 1, hand[1] - 1, 3, 3, STEM);
    },
    post(g, p) {
      if (p.dead) return;
      const r = rng(17 + p.i * 13 + (p.anim === 'attack' ? 99 : 0));
      const n = p.anim === 'attack' ? 10 : 4;
      for (let k = 0; k < n; k++) {
        const x = Math.round(6 + r() * 48);
        const y = Math.round(2 + r() * (p.anim === 'attack' ? 40 : 18));
        glowDot(g, x, y, '#8aff9a', 1.3, 0.5);
        g.set(x, y, '#d8ffc8');
      }
    },
  });

  // ===================================================================== FORGE — ember / obsidian
  const OBS = [C('#120e16'), C('#262030'), C('#40384c'), C('#6a607a')];
  const LAVA = R3('#c8300c', '#ff7a1a', '#ffd04a');
  const IMP = R3('#6a1218', '#c4302c', '#f06a4a');
  const IMPWING = R3('#3a0a14', '#6a1622', '#a02c34');
  const HORN = R3('#2a2026', '#5a4a52', '#d8c8b0');
  def('imp', {
    w: 26, h: 24, face: 'L', fall: true,
    anims: { walk: { n: 4, fps: 9 }, idle: { n: 2, fps: 3 }, attack: { n: 2, fps: 5, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const cx = 13;
      const b = p.bob;
      const L = lean(p, 1, 2);
      const ux = cx + L;
      const [bd, fd, bl, fl] = gait(p, 1);
      const flap = p.anim === 'walk' ? p.ph % 2 : p.anim === 'idle' ? p.i : 1;
      // wings
      const wy = 9 + b;
      S(g, IMPWING, (m, c) => poly(m, flap ? [[ux - 2, wy + 2], [ux - 9, wy - 5], [ux - 8, wy + 1], [ux - 10, wy + 4], [ux - 3, wy + 6]] : [[ux - 2, wy + 2], [ux - 10, wy + 1], [ux - 8, wy + 5], [ux - 9, wy + 8], [ux - 3, wy + 6]], c), { top: 1, bot: 1 });
      // tail
      line(g, ux - 3, 17 + b, ux - 6, 18, IMP[0]);
      line(g, ux - 6, 18, ux - 8, 15, IMP[0]);
      g.set(ux - 9, 14, IMP[1]);
      g.set(ux - 8, 14, IMP[1]);
      g.set(ux - 9, 15, IMP[1]);
      // legs
      fatLeg(g, cx - 2, 18, 22, bd, bl, 2, [IMP[0], IMP[0], IMP[1]], null);
      g.set(cx - 2 + bd, 22 - bl, HORN[0]);
      g.set(cx - 1 + bd, 22 - bl, HORN[0]);
      // body
      sOval(g, ux - 3, 12 + b, 7, 8, IMP);
      fatLeg(g, cx + 1, 18, 22, fd, fl, 2, IMP, null);
      g.set(cx + 1 + fd, 22 - fl, HORN[1]);
      g.set(cx + 2 + fd, 22 - fl, HORN[1]);
      // head
      sOval(g, ux - 4, 4 + b, 9, 8, IMP);
      // horns
      g.set(ux - 3, 4 + b, HORN[1]);
      g.set(ux - 4, 3 + b, HORN[2]);
      g.set(ux + 2, 4 + b, HORN[1]);
      g.set(ux + 3, 3 + b, HORN[1]);
      g.set(ux + 3, 2 + b, HORN[2]);
      // ear
      g.set(ux - 5, 7 + b, IMP[1]);
      // eyes + grin
      if (p.hurt) {
        hline(g, ux + 1, ux + 3, 7 + b, '#3a0a0a');
      } else {
        g.set(ux + 1, 7 + b, '#ffe04a');
        g.set(ux + 3, 7 + b, '#ffe04a');
        g.set(ux + 1, 6 + b, '#3a0a0a');
        g.set(ux + 3, 6 + b, '#3a0a0a');
      }
      hline(g, ux + 1, ux + 3, 9 + b, '#fff4e0');
      g.set(ux + 4, 8 + b, '#fff4e0');
      // arm
      const hand = p.anim === 'attack' ? (p.atk === 0 ? [ux, 3] : [ux + 7, 12]) : [ux + 4, 14 + b];
      line(g, ux + 1, 13 + b, hand[0], hand[1], IMP[1]);
      g.set(hand[0], hand[1], IMP[2]);
    },
    post(g, p) {
      if (p.dead) return;
      const ux = 13 + lean(p, 1, 2);
      const b = p.bob;
      if (p.anim === 'attack') {
        if (p.atk === 0) {
          glowDot(g, ux, 0 + 1, '#ff9a2a', 4, 0.45);
          fireball(g, ux, 1, 2, 5);
        } else {
          g.set(ux + 9, 11, '#ffd84a');
          g.set(ux + 10, 13, '#ff8a1a');
        }
      } else {
        const hx = ux + 5;
        const hy = 12 + b;
        glowDot(g, hx, hy, '#ff9a2a', 3, 0.4);
        fireball(g, hx, hy, 1.5, p.i + 2);
      }
    },
  });

  def('magma_golem', {
    w: 32, h: 28, face: 'L',
    anims: { walk: { n: 4, fps: 5 }, idle: { n: 2, fps: 2 }, attack: { n: 2, fps: 5, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const cx = 15;
      if (p.dead) {
        const rocks = [[cx - 10, 20, 8, 6], [cx - 3, 18, 9, 8], [cx + 5, 21, 7, 5], [cx - 6, 15, 6, 5], [cx + 2, 14, 5, 5]];
        for (const r of rocks) sOval(g, r[0], r[1], r[2], r[3], OBS);
        crack(g, [[cx - 1, 20], [cx + 1, 22], [cx + 3, 21]], '#a8300c');
        g.set(cx + 3, 16, '#ff7a1a');
        return;
      }
      const L = lean(p, 1, 2);
      const b = p.anim === 'walk' ? (p.ph % 2 ? 1 : 0) : p.bob;
      const [bd, fd, bl, fl] = gait(p, 1);
      // back arm
      const swing = p.anim === 'walk' ? (p.ph < 2 ? 1 : -1) : 0;
      sOval(g, cx - 12 + L - swing, 12 + b, 6, 9, [OBS[0], OBS[0], OBS[1], OBS[2]]);
      // legs
      sRect(g, cx - 6 + bd, 20 - bl, 6, 6, [OBS[0], OBS[1], OBS[2]]);
      sRect(g, cx + 1 + fd, 20 - fl, 6, 6, OBS.slice(1));
      // body boulder
      sOval(g, cx - 10 + L, 4 + b, 21, 18, OBS);
      // lava cracks
      crack(g, [[cx - 6 + L, 8 + b], [cx - 3 + L, 11 + b], [cx - 4 + L, 15 + b], [cx - 1 + L, 18 + b]], LAVA[1], LAVA[2]);
      crack(g, [[cx + 3 + L, 7 + b], [cx + 2 + L, 10 + b], [cx + 5 + L, 13 + b]], LAVA[0], LAVA[1]);
      crack(g, [[cx - 8 + L, 14 + b], [cx - 6 + L, 16 + b]], LAVA[0]);
      // head lump with eyes
      sOval(g, cx + 2 + L, 1 + b, 9, 7, OBS);
      if (p.hurt) {
        hline(g, cx + 6 + L, cx + 9 + L, 4 + b, LAVA[0]);
      } else {
        g.set(cx + 6 + L, 4 + b, LAVA[2]);
        g.set(cx + 7 + L, 4 + b, LAVA[1]);
        g.set(cx + 9 + L, 4 + b, LAVA[2]);
      }
      // front arm + fist
      let fist = [cx + 9 + L + swing, 17 + b];
      if (p.anim === 'attack') fist = p.atk === 0 ? [cx + 4, 0] : [cx + 11, 20];
      S(g, OBS.slice(1), (m, c) => line(m, cx + 6 + L, 9 + b, fist[0] + 2, fist[1] + 2, c, 4), { top: 1, bot: 1, right: 1 });
      sOval(g, fist[0], fist[1], 7, 7, OBS);
      g.set(fist[0] + 3, fist[1] + 2, LAVA[0]);
      g.set(fist[0] + 4, fist[1] + 3, LAVA[1]);
    },
    post(g, p) {
      if (p.dead) {
        glowDot(g, 16, 20, '#ff7a1a', 3, 0.3);
        return;
      }
      const L = lean(p, 1, 2);
      const b = p.anim === 'walk' ? (p.ph % 2 ? 1 : 0) : p.bob;
      glowDot(g, 15 + L, 12 + b, '#ff8a2a', 5, 0.18);
      if (p.anim === 'attack' && p.atk === 1) {
        for (const s of [[28, 20], [30, 23], [26, 18], [29, 26]]) g.set(s[0], s[1], s[0] % 2 ? '#ffd04a' : '#ff7a1a');
      }
    },
  });

  def('fire_hound', {
    w: 34, h: 22, face: 'L', fall: 'flip',
    anims: { walk: { n: 4, fps: 12 }, idle: { n: 2, fps: 3 }, attack: { n: 2, fps: 5, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const FUR = [C('#100a0e'), C('#221a20'), C('#3a2e34'), C('#5e4c52')];
      const cx = 16;
      const run = p.anim === 'walk';
      const crouch = p.anim === 'attack' && p.atk === 0 ? 2 : 0;
      const L = p.anim === 'attack' && p.atk === 1 ? 3 : p.hurt ? -1 : 0;
      const b = (run ? [0, -1, -1, 0][p.ph] : p.anim === 'idle' ? p.bob : 0) + crouch;
      const by = 8 + b;
      // gallop leg sets [hindFar, hindNear, foreFar, foreNear] as foot dx
      const G4 = [
        [-3, -1, 2, 4],
        [0, 1, -1, 0],
        [3, 2, -3, -2],
        [1, -1, 0, 2],
      ];
      const lg = run ? G4[p.ph] : p.anim === 'attack' && p.atk === 1 ? [-3, -2, 3, 4] : [-1, 0, 0, 1];
      const leg = (x, dx, near) => {
        const c = near ? FUR[2] : FUR[1];
        line(g, x, by + 6, x + dx, 19, c, 1);
        line(g, x + 1, by + 6, x + 1 + dx, 19, near ? FUR[1] : FUR[0], 1);
        g.set(x + dx + 2, 19, c);
      };
      leg(cx - 7 + L, lg[0], false);
      leg(cx + 4 + L, lg[2], false);
      // tail flame
      flame(g, cx - 14 + L, by + 2, 5, 7 + (p.i % 2), 3 + p.i, FIRE);
      // body
      sOval(g, cx - 10 + L, by, 18, 8, FUR);
      leg(cx - 6 + L, lg[1], true);
      leg(cx + 5 + L, lg[3], true);
      // head
      const hx = cx + 5 + L;
      const hy = by - 4 + (crouch ? 1 : 0);
      sOval(g, hx, hy, 9, 7, FUR);
      const open = p.anim === 'attack' && p.atk === 1;
      sRect(g, hx + 7, hy + 3, 5, 2, FUR.slice(1));
      if (open) {
        sRect(g, hx + 7, hy + 6, 4, 1, FUR.slice(1));
        rect(g, hx + 8, hy + 5, 3, 1, '#ff7a1a');
      } else {
        rect(g, hx + 7, hy + 5, 4, 1, FUR[1]);
      }
      g.set(hx + 11, hy + 3, '#ff9a8a');
      // ear
      g.set(hx + 2, hy - 1, FUR[2]);
      g.set(hx + 1, hy - 2, FUR[3]);
      // eye
      if (p.hurt) hline(g, hx + 5, hx + 6, hy + 2, '#a8300c');
      else {
        g.set(hx + 5, hy + 2, '#ffe04a');
        g.set(hx + 6, hy + 2, '#fff8c0');
      }
      // flame mane along neck + back
      const seed = p.i + (run ? 0 : 10) + (p.anim === 'attack' ? 20 : 0);
      flame(g, hx - 1, hy + 2, 5, 6, seed, FIRE);
      flame(g, cx - 4 + L, by + 1, 6, 4, seed + 1, FIRE);
      flame(g, cx - 9 + L, by + 2, 5, 3, seed + 2, FIRE);
    },
    post(g, p) {
      if (p.dead) return;
      if (p.anim === 'attack' && p.atk === 1) {
        const by = 8;
        for (let k = 0; k < 5; k++) {
          const x = 31 + (k % 2);
          const y = by + 3 + k - 2;
          g.set(x, y, k % 2 ? '#ffd84a' : '#ff7a1a');
        }
        glowDot(g, 31, by + 4, '#ff9a2a', 3, 0.5);
      }
    },
  });

  def('infernal', {
    w: 64, h: 62, face: 'L', boss: true, fall: true, fallDx: -2,
    anims: { walk: { n: 4, fps: 5 }, idle: { n: 2, fps: 2 }, attack: { n: 2, fps: 3.4, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const cx = 31;
      const gy = 60;
      const L = lean(p, 2, 4);
      const b = p.anim === 'walk' ? (p.ph % 2 ? 1 : 0) : p.bob;
      const [bd, fd, bl, fl] = gait(p, 2);
      const ux = cx + L;
      // back arm
      const bsw = p.anim === 'walk' ? (p.ph < 2 ? 2 : -2) : 0;
      S(g, [OBS[0], OBS[1], OBS[2]], (m, c) => {
        line(m, ux - 10, 24 + b, ux - 15 - bsw, 38 + b, c, 6);
        oval(m, ux - 19 - bsw, 36 + b, 8, 8, c);
      }, { top: 1, bot: 1 });
      // legs (digitigrade) + hooves
      const legF = (x, dx, lift, rp) => {
        S(g, rp, (m, c) => {
          poly(m, [[x - 1, 40], [x + 7, 40], [x + 6 + dx, 50 - lift], [x + 3 + dx, gy - 2 - lift], [x + dx, gy - 2 - lift], [x + 1 + dx, 50 - lift]], c);
        }, { top: 0, left: 1, right: 1 });
        sRect(g, x - 1 + dx, gy - 3 - lift, 7, 3, HORN);
      };
      legF(cx - 9 + bd, bd, bl * 2, [OBS[0], OBS[1], OBS[2]]);
      // torso
      S(g, OBS, (m, c) => {
        poly(m, [[ux - 13, 20 + b], [ux + 12, 20 + b], [ux + 9, 36 + b], [ux + 5, 43 + b], [ux - 6, 43 + b], [ux - 10, 34 + b]], c);
      }, { top: 1, bot: 2, left: 1, right: 2 });
      legF(cx + 2 + fd, fd, fl * 2, OBS.slice(1));
      // lava veins + glowing core
      crack(g, [[ux - 8, 23 + b], [ux - 5, 27 + b], [ux - 1, 28 + b], [ux + 3, 25 + b], [ux + 7, 24 + b]], LAVA[1], LAVA[2]);
      crack(g, [[ux - 1, 29 + b], [ux - 2, 34 + b], [ux + 1, 39 + b]], LAVA[1], LAVA[2]);
      crack(g, [[ux - 8, 31 + b], [ux - 5, 36 + b]], LAVA[0], LAVA[1]);
      crack(g, [[ux + 6, 30 + b], [ux + 3, 34 + b]], LAVA[0]);
      disc(g, ux, 30 + b, 2, LAVA[1]);
      disc(g, ux, 30 + b, 1, LAVA[2]);
      g.set(ux, 30 + b, '#fff8c8');
      // head
      const hx = ux + 1;
      const hy = 8 + b;
      sOval(g, hx - 7, hy, 15, 14, OBS);
      // horns (curl up and back)
      const horn = (x, s) => {
        S(g, HORN, (m, c) => {
          poly(m, [[x, hy + 4], [x + 3 * s, hy + 3], [x + 2 * s, hy - 3], [x - 1 * s, hy - 8], [x - 3 * s, hy - 9], [x - 1 * s, hy - 4]], c);
        }, { top: 1, bot: 1 });
        g.set(x - 3 * s, hy - 9, LAVA[1]);
        g.set(x - 2 * s, hy - 8, LAVA[0]);
      };
      horn(hx - 5, 1);
      horn(hx + 4, 1);
      // jaw + eyes
      sRect(g, hx - 3, hy + 10, 12, 5, OBS.slice(1), { top: 1, bot: 1 });
      const open = p.anim === 'attack';
      if (open) {
        rect(g, hx + 1, hy + 12, 7, 2, LAVA[0]);
        hline(g, hx + 2, hx + 7, hy + 12, LAVA[2]);
      }
      for (let i = 0; i < 4; i++) g.set(hx + 1 + i * 2, hy + 11, '#f4e8d0');
      if (p.hurt) {
        hline(g, hx + 1, hx + 3, hy + 7, LAVA[0]);
        hline(g, hx + 5, hx + 7, hy + 7, LAVA[0]);
      } else {
        rect(g, hx + 1, hy + 6, 3, 2, LAVA[2]);
        rect(g, hx + 5, hy + 6, 3, 2, LAVA[2]);
        g.set(hx + 3, hy + 7, '#ffffff');
        g.set(hx + 7, hy + 7, '#ffffff');
        line(g, hx, hy + 4, hx + 3, hy + 5, OBS[0]);
        line(g, hx + 8, hy + 4, hx + 5, hy + 5, OBS[0]);
      }
      // front arm
      let fist = [ux + 15, 36 + b];
      if (p.anim === 'attack') fist = p.atk === 0 ? [ux + 10, 4] : [ux + 22, 30];
      else if (p.anim === 'walk') fist[0] += bsw;
      S(g, OBS.slice(1), (m, c) => line(m, ux + 9, 24 + b, fist[0] + 1, fist[1] + 2, c, 6), { top: 1, bot: 1, right: 1 });
      sOval(g, fist[0] - 4, fist[1] - 2, 10, 10, OBS);
      for (let i = 0; i < 3; i++) g.set(fist[0] + 4, fist[1] + i * 2, HORN[2]);
      crack(g, [[ux + 11, 27 + b], [fist[0] - 1, fist[1]]], LAVA[0]);
    },
    post(g, p) {
      if (p.dead) return;
      const L = lean(p, 2, 4);
      const b = p.anim === 'walk' ? (p.ph % 2 ? 1 : 0) : p.bob;
      const ux = 31 + L;
      // flame crest + shoulder fires
      flame(g, ux - 4, 10 + b, 9, 9, p.i + 1 + (p.anim === 'attack' ? 7 : 0), FIRE);
      flame(g, ux - 13, 22 + b, 6, 6, p.i + 4, FIRE);
      flame(g, ux + 8, 22 + b, 6, 6, p.i + 5, FIRE);
      glowDot(g, ux, 30 + b, '#ff8a2a', 7, 0.22);
      if (p.anim === 'attack') {
        const fist = p.atk === 0 ? [ux + 10, 4] : [ux + 22, 30];
        glowDot(g, fist[0] + 1, fist[1] + 2, '#ff8a2a', 8, 0.35);
        fireball(g, fist[0] + 1, fist[1] - 1, p.atk === 0 ? 4 : 3, 9 + p.atk);
      }
    },
  });

  // ===================================================================== CLOCKWORK — brass / copper / steam grey
  const BRASS = [C('#4a3410'), C('#7a5a1c'), C('#c8962e'), C('#f2d27a')];
  const COPPER = [C('#4a200e'), C('#7a3a1a'), C('#c06a32'), C('#f0a46a')];
  const IRON = [C('#16171d'), C('#2c2f38'), C('#4a4e5a'), C('#7a808e')];
  const STEAM = R3('#8a929c', '#ced6de', '#ffffff');
  const AMBER = C('#ffb02e');
  function gearShape(g, cx, cy, r, rp, teeth) {
    S(g, rp, (m, c) => {
      disc(m, cx, cy, r - 1, c);
      const n = teeth || 8;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const tx = Math.round(cx + Math.cos(a) * r);
        const ty = Math.round(cy + Math.sin(a) * r);
        m.set(tx, ty, c);
      }
    }, { top: 1, bot: 1, left: 1, right: 1 });
    disc(g, cx, cy, Math.max(0.5, r / 3), IRON[1]);
    g.set(cx, cy, IRON[3]);
  }
  function puff(g, x, y, r, a) {
    disc(g, x, y, r, alpha(STEAM[0], a));
    disc(g, x - 0.5, y - 0.5, Math.max(0.5, r - 1), alpha(STEAM[1], a));
    g.set(x - 1, y - 1, alpha(STEAM[2], a));
  }
  const WRENCH = gridFrom(['w.w', 'w.w', 'wWw', '.W.', '.w.', '.w.', '.w.', '.w.', '.w.', '.b.', '.h.', '.h.', '.b.'], {
    w: '#a8b2bc', W: '#e6eef4', b: '#c8962e', h: '#5a3420',
  });
  def('cog_knight', {
    w: 28, h: 26, face: 'L', fall: true,
    anims: { walk: { n: 4, fps: 7 }, idle: { n: 2, fps: 2.5 }, attack: { n: 2, fps: 5, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const cx = 13;
      const b = p.bob;
      const L = lean(p, 1, 2);
      const ux = cx + L;
      const [bd, fd, bl, fl] = gait(p, 1.5);
      // gear shield on the back arm
      const spin = p.anim === 'walk' ? p.ph : p.i;
      gearShape(g, ux - 6, 13 + b, 5 + (spin % 2 ? 0 : 0), COPPER, 8);
      if (spin % 2) {
        g.set(ux - 6, 8 + b, COPPER[2]);
        g.set(ux - 1, 13 + b, COPPER[1]);
      }
      // legs
      fatLeg(g, cx - 3, 18, 24, bd, bl, 3, [IRON[0], IRON[1], IRON[2]], [BRASS[0], BRASS[1], BRASS[2]], 1);
      fatLeg(g, cx + 1, 18, 24, fd, fl, 3, IRON.slice(1), BRASS.slice(1), 1);
      g.set(cx + 2 + Math.round(fd / 2), 20, BRASS[3]);
      // torso
      S(g, BRASS, (m, c) => {
        rect(m, ux - 4, 11 + b, 9, 6, c);
        rect(m, ux - 3, 17 + b, 7, 2, c);
      }, { top: 1, bot: 2, right: 1 });
      gearShape(g, ux + 1, 14 + b, 2, COPPER, 6);
      hline(g, ux - 3, ux + 3, 18 + b, COPPER[1]);
      // helm
      S(g, BRASS, (m, c) => {
        rect(m, ux - 4, 3 + b, 9, 8, c);
        rect(m, ux - 3, 2 + b, 7, 1, c);
      }, { top: 1, bot: 1, right: 1 });
      hline(g, ux - 1, ux + 4, 6 + b, IRON[0]);
      if (!p.hurt) {
        g.set(ux + 2, 6 + b, AMBER);
        g.set(ux + 3, 6 + b, '#fff0a0');
      }
      for (const r of [[ux - 3, 4], [ux - 3, 9], [ux + 3, 9]]) g.set(r[0], r[1] + b, BRASS[3]);
      // chimney plume
      sRect(g, ux - 2, 0 + b, 2, 2, IRON.slice(1));
      // front arm + wrench
      let hand = [ux + 5, 16 + b];
      let ang = 28;
      if (p.anim === 'attack') {
        hand = p.atk === 0 ? [ux + 1, 7] : [ux + 7, 14];
        ang = p.atk === 0 ? -40 : 95;
      } else if (p.hurt) {
        hand = [ux + 4, 17];
        ang = 60;
      }
      place(g, WRENCH, ang, 1, 10, hand[0], hand[1]);
      S(g, BRASS.slice(1), (m, c) => line(m, ux + 3, 12 + b, hand[0], hand[1], c, 2), { top: 1, bot: 1 });
      sRect(g, ux + 2, 11 + b, 4, 3, COPPER.slice(1));
    },
    post(g, p) {
      if (p.dead) return;
      const ux = 13 + lean(p, 1, 2);
      const b = p.bob;
      const k = p.anim === 'walk' ? p.ph : p.i * 2;
      puff(g, ux - 2 - (k % 2), -1 + b + 1, 1.2, 0.7);
    },
  });

  def('steam_bot', {
    w: 26, h: 24, face: 'L', fall: true,
    anims: { walk: { n: 4, fps: 7 }, idle: { n: 2, fps: 2.5 }, attack: { n: 2, fps: 5, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const cx = 11;
      const b = p.anim === 'walk' ? (p.ph % 2 ? -1 : 0) : p.bob;
      const recoil = p.anim === 'attack' && p.atk === 1 ? -1 : 0;
      const ux = cx + recoil;
      const [bd, fd, bl, fl] = gait(p, 1);
      // piston legs
      const leg = (x, dx, lift, rp) => {
        sRect(g, x + dx, 17, 2, 4 - lift, rp);
        sRect(g, x - 1 + dx, 21 - lift, 4, 2, BRASS.slice(1));
      };
      leg(cx - 4, bd, bl, [IRON[0], IRON[1], IRON[2]]);
      // chimney
      sRect(g, ux - 4, 3 + b, 3, 5, IRON.slice(1));
      sRect(g, ux - 5, 2 + b, 5, 2, BRASS.slice(1));
      // boiler
      sOval(g, ux - 7, 6 + b, 15, 13, COPPER);
      hline(g, ux - 7, ux + 7, 12 + b, BRASS[2]);
      hline(g, ux - 6, ux + 6, 13 + b, BRASS[1]);
      for (let i = 0; i < 4; i++) g.set(ux - 5 + i * 3, 12 + b, BRASS[3]);
      // gauge
      disc(g, ux - 3, 9 + b, 1.6, '#e8e2d0');
      g.set(ux - 3, 9 + b, '#c83a2a');
      g.set(ux - 2, 8 + b, '#c83a2a');
      leg(cx + 1, fd, fl, IRON.slice(1));
      // lens eye
      const charge = p.anim === 'attack';
      disc(g, ux + 3, 9 + b, 2.6, BRASS[2]);
      disc(g, ux + 3, 9 + b, 1.7, charge ? '#ffb02e' : '#3ab0a0');
      g.set(ux + 3, 9 + b, charge ? '#fff4c0' : '#9af0e0');
      g.set(ux + 2, 8 + b, '#ffffff');
      if (p.hurt) {
        line(g, ux + 1, 8 + b, ux + 5, 10 + b, IRON[0]);
      }
      // arm cannon
      sRect(g, ux + 4, 14 + b, 7, 3, BRASS.slice(1));
      rect(g, ux + 10, 14 + b, 1, 3, IRON[0]);
      g.set(ux + 10, 15 + b, charge ? '#ffd04a' : '#1a1a20');
      sRect(g, ux + 3, 13 + b, 3, 5, COPPER.slice(1));
    },
    post(g, p) {
      if (p.dead) return;
      const b = p.anim === 'walk' ? (p.ph % 2 ? -1 : 0) : p.bob;
      const ux = 11 + (p.anim === 'attack' && p.atk === 1 ? -1 : 0);
      const k = p.anim === 'walk' ? p.ph : p.i;
      const big = p.anim === 'attack' && p.atk === 0;
      puff(g, ux - 3 + (k % 2), 1 + b - (k % 2), big ? 2 : 1.3, 0.75);
      if (big) puff(g, ux - 6, 0 + b, 1.2, 0.6);
      if (p.anim === 'attack') {
        glowDot(g, ux + 12, 15 + b, '#ffb02e', p.atk === 1 ? 3.5 : 2, p.atk === 1 ? 0.8 : 0.5);
        if (p.atk === 1) sparkle(g, ux + 12, 15 + b, C('#ffd04a'));
      }
    },
  });

  def('gear_rat', {
    w: 28, h: 20, face: 'L', fall: 'flip',
    anims: { walk: { n: 4, fps: 12 }, idle: { n: 2, fps: 3 }, attack: { n: 2, fps: 5, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const cx = 13;
      const run = p.anim === 'walk';
      const b = run ? [0, -1, 0, -1][p.ph] : p.bob;
      const L = p.anim === 'attack' ? (p.atk === 0 ? -1 : 3) : p.hurt ? -1 : 0;
      const rear = p.anim === 'attack' && p.atk === 0 ? 2 : 0;
      const by = 9 + b;
      // tail (segmented)
      const tw = run ? [0, 1, 0, -1][p.ph] : 0;
      const tail = [[cx - 7 + L, by + 5], [cx - 10 + L, by + 5 + tw], [cx - 12 + L, by + 2 + tw], [cx - 12 + L, by - 1]];
      for (let i = 0; i + 1 < tail.length; i++) line(g, tail[i][0], tail[i][1], tail[i + 1][0], tail[i + 1][1], IRON[2]);
      for (const t of tail) g.set(t[0], t[1], IRON[3]);
      // legs
      const legs = run ? [[-2, 2], [0, 0], [2, -2], [0, 0]][p.ph] : [0, 0];
      const leg = (x, dx, c) => {
        line(g, x, by + 6, x + dx, 17, c);
        g.set(x + dx + 1, 17, c);
      };
      leg(cx - 5 + L, legs[1], IRON[1]);
      leg(cx + 3 + L, legs[0], IRON[1]);
      // body
      sOval(g, cx - 8 + L, by, 15, 8, BRASS);
      for (let i = 0; i < 3; i++) g.set(cx - 5 + L + i * 3, by + 4, BRASS[1]);
      leg(cx - 4 + L, legs[0], IRON[2]);
      leg(cx + 4 + L, legs[1], IRON[2]);
      // wind-up key (turns as it runs)
      const kx = cx - 2 + L;
      vline(g, kx, by - 3, by, IRON[2]);
      const kp = (run ? p.ph : p.i) % 2;
      if (kp) {
        sRect(g, kx - 2, by - 6, 5, 3, BRASS.slice(1));
        g.set(kx, by - 5, IRON[1]);
      } else {
        sRect(g, kx - 1, by - 6, 3, 3, BRASS.slice(1));
      }
      // head
      const hx = cx + 4 + L;
      const hy = by - 2 - rear;
      sOval(g, hx, hy, 8, 7, BRASS);
      S(g, BRASS.slice(1), (m, c) => poly(m, [[hx + 6, hy + 2], [hx + 11, hy + 4], [hx + 6, hy + 6]], c), { top: 1, bot: 1 });
      g.set(hx + 11, hy + 4, COPPER[2]);
      g.set(hx + 10, hy + 4, COPPER[2]);
      // ear
      sOval(g, hx + 1, hy - 3, 4, 4, COPPER);
      g.set(hx + 2, hy - 2, COPPER[0]);
      // eye
      if (p.hurt) hline(g, hx + 4, hx + 5, hy + 2, '#3a0a0a');
      else {
        g.set(hx + 5, hy + 2, '#ff3a3a');
        g.set(hx + 5, hy + 1, '#ffb0a0');
      }
      // whiskers + teeth
      g.set(hx + 9, hy + 2, '#d8e0e8');
      g.set(hx + 10, hy + 1, '#d8e0e8');
      g.set(hx + 9, hy + 6, '#d8e0e8');
      if (p.anim === 'attack' && p.atk === 1) {
        rect(g, hx + 8, hy + 5, 3, 1, '#2a0a0a');
        g.set(hx + 9, hy + 6, '#ffffff');
      }
    },
  });

  def('brass_colossus', {
    w: 64, h: 62, face: 'L', boss: true, fall: true, fallDx: -2,
    anims: { walk: { n: 4, fps: 4.5 }, idle: { n: 2, fps: 2 }, attack: { n: 2, fps: 3.4, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const cx = 31;
      const gy = 60;
      const L = lean(p, 2, 4);
      const b = p.anim === 'walk' ? (p.ph % 2 ? 1 : 0) : p.bob;
      const [bd, fd, bl, fl] = gait(p, 2);
      const ux = cx + L;
      // back arm
      const bsw = p.anim === 'walk' ? (p.ph < 2 ? 2 : -2) : 0;
      S(g, [IRON[0], IRON[1], IRON[2]], (m, c) => line(m, ux - 15, 24 + b, ux - 19 - bsw, 40 + b, c, 5), { top: 1, bot: 1 });
      sOval(g, ux - 24 - bsw, 37 + b, 10, 10, [BRASS[0], BRASS[0], BRASS[1], BRASS[2]]);
      // legs
      const leg = (x, dx, lift, rp, frp) => {
        sRect(g, x + dx, 42 - lift, 9, 14, rp, { top: 0, bot: 0, left: 1, right: 1 });
        sRect(g, x + dx - 1, 45 - lift, 11, 4, frp);
        sRect(g, x + dx - 2, gy - 4 - lift, 13, 5, frp);
      };
      leg(cx - 12, bd, bl * 2, [IRON[0], IRON[1], IRON[2]], [BRASS[0], BRASS[1], BRASS[2]]);
      // barrel chest
      sOval(g, ux - 17, 15 + b, 34, 31, BRASS);
      for (const y of [22, 38]) {
        hline(g, ux - 15, ux + 15, y + b, COPPER[1]);
        hline(g, ux - 15, ux + 15, y + 1 + b, COPPER[2]);
        for (let i = 0; i < 7; i++) g.set(ux - 13 + i * 4, y + b, BRASS[3]);
      }
      // furnace gear
      gearShape(g, ux - 1, 30 + b, 7, COPPER, 10);
      disc(g, ux - 1, 30 + b, 3, '#2a0e06');
      for (let i = -2; i <= 2; i += 2) vline(g, ux - 1 + i, 28 + b, 32 + b, '#ff7a1a');
      // gauge
      disc(g, ux + 10, 27 + b, 3, BRASS[1]);
      disc(g, ux + 10, 27 + b, 2, '#ece6d4');
      line(g, ux + 10, 27 + b, ux + 11, 25 + b, '#c83a2a');
      leg(cx + 3, fd, fl * 2, IRON.slice(1), BRASS.slice(1));
      // head
      sOval(g, ux - 5, 6 + b, 13, 12, BRASS);
      rect(g, ux - 2, 11 + b, 10, 3, IRON[0]);
      if (p.hurt) {
        hline(g, ux, ux + 2, 12 + b, '#a86a1a');
        hline(g, ux + 5, ux + 7, 12 + b, '#a86a1a');
      } else {
        rect(g, ux, 12 + b, 2, 1, AMBER);
        rect(g, ux + 5, 12 + b, 2, 1, AMBER);
        g.set(ux + 1, 12 + b, '#fff4c0');
        g.set(ux + 6, 12 + b, '#fff4c0');
      }
      g.set(ux + 1, 4 + b, IRON[3]);
      vline(g, ux + 1, 3 + b, 6 + b, IRON[2]);
      // shoulder domes + smokestacks
      for (const sx of [ux - 21, ux + 8]) {
        sRect(g, sx + 3, 6 + b, 4, 8, IRON.slice(1));
        sRect(g, sx + 2, 5 + b, 6, 2, IRON.slice(1));
        sOval(g, sx, 12 + b, 13, 10, COPPER);
        for (let i = 0; i < 3; i++) g.set(sx + 3 + i * 3, 14 + b, COPPER[3]);
      }
      // front arm + piston + fist
      let fist = [ux + 20, 34 + b];
      if (p.anim === 'attack') fist = p.atk === 0 ? [ux + 14, 2] : [ux + 26, 24];
      else if (p.anim === 'walk') fist[0] += bsw;
      S(g, IRON.slice(1), (m, c) => line(m, ux + 14, 20 + b, fist[0], fist[1], c, 5), { top: 1, bot: 1 });
      const mx = Math.round((ux + 14 + fist[0]) / 2);
      const my = Math.round((20 + b + fist[1]) / 2);
      sRect(g, mx - 2, my - 2, 5, 5, BRASS.slice(1));
      sOval(g, fist[0] - 5, fist[1] - 4, 12, 12, BRASS);
      for (let i = 0; i < 3; i++) g.set(fist[0] + 3, fist[1] - 2 + i * 3, BRASS[3]);
    },
    post(g, p) {
      if (p.dead) return;
      const L = lean(p, 2, 4);
      const b = p.anim === 'walk' ? (p.ph % 2 ? 1 : 0) : p.bob;
      const ux = 31 + L;
      const k = p.anim === 'walk' ? p.ph : p.i;
      for (const sx of [ux - 21, ux + 8]) {
        puff(g, sx + 5 - (k % 2), 3 + b, 2, 0.7);
        puff(g, sx + 3 + (k % 2), 0 + b, 1.4, 0.5);
      }
      glowDot(g, ux - 1, 30 + b, '#ff8a2a', 6, 0.3);
      if (p.anim === 'attack' && p.atk === 1) {
        puff(g, ux + 33, 26 + b, 2.5, 0.7);
        puff(g, ux + 30, 20 + b, 2, 0.6);
      }
    },
  });

  // ===================================================================== NEON — magenta / cyan on dark chrome
  const CHROME = [C('#10121e'), C('#262a40'), C('#454c6e'), C('#8a96c4')];
  const MAG = R3('#8a1a6c', '#ff2ec4', '#ffa8ea');
  const CYAN = R3('#0a6a8a', '#21e6ff', '#d0fcff');
  def('drone', {
    ground: false, w: 26, h: 22, face: 'L', fall: 'tilt', tilt: 32,
    anims: { walk: { n: 4, fps: 12 }, idle: { n: 4, fps: 10 }, attack: { n: 2, fps: 5, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const cx = 13;
      const b = p.anim === 'walk' || p.anim === 'idle' ? [0, -1, -1, 0][p.i % 4] : 0;
      const L = p.anim === 'attack' && p.atk === 1 ? -1 : p.hurt ? -2 : 0;
      const by = 7 + b;
      // rear fin + antenna
      S(g, CHROME.slice(1), (m, c) => poly(m, [[cx - 8 + L, by + 2], [cx - 11 + L, by - 3], [cx - 6 + L, by + 1]], c));
      line(g, cx - 2 + L, by - 1, cx - 3 + L, by - 5, CHROME[2]);
      // thruster pods
      sRect(g, cx - 9 + L, by + 5, 5, 4, CHROME.slice(1));
      sRect(g, cx + 3 + L, by + 6, 5, 3, CHROME.slice(1));
      // hull
      S(g, CHROME, (m, c) => {
        poly(m, [[cx - 8 + L, by + 1], [cx + 4 + L, by - 1], [cx + 9 + L, by + 3], [cx + 8 + L, by + 7], [cx - 7 + L, by + 8]], c);
      }, { top: 1, bot: 2 });
      hline(g, cx - 6 + L, cx + 6 + L, by + 6, MAG[0]);
      g.set(cx - 5 + L, by + 3, CYAN[1]);
      g.set(cx - 3 + L, by + 3, CYAN[1]);
      // lens eye
      const charge = p.anim === 'attack';
      disc(g, cx + 4 + L, by + 3, 2.6, CHROME[0]);
      disc(g, cx + 4 + L, by + 3, 1.7, charge ? MAG[2] : MAG[1]);
      g.set(cx + 4 + L, by + 3, charge ? '#ffffff' : MAG[0]);
      g.set(cx + 3 + L, by + 2, '#ffffff');
      if (p.hurt) line(g, cx + 2 + L, by + 1, cx + 6 + L, by + 5, CHROME[0]);
    },
    post(g, p) {
      const cx = 13;
      if (p.dead) {
        for (const s of [[8, 14], [17, 13], [12, 11]]) g.set(s[0], s[1], s[0] % 2 ? '#ffd04a' : '#21e6ff');
        return;
      }
      const b = p.anim === 'walk' || p.anim === 'idle' ? [0, -1, -1, 0][p.i % 4] : 0;
      const L = p.anim === 'attack' && p.atk === 1 ? -1 : p.hurt ? -2 : 0;
      const by = 7 + b;
      const fl = p.i % 2;
      for (const tx of [cx - 7 + L, cx + 5 + L]) {
        g.set(tx, by + 9, CYAN[2]);
        g.set(tx + 1, by + 9, CYAN[1]);
        g.set(tx, by + 10 + fl, alpha(CYAN[1], 0.8));
        g.set(tx + 1, by + 11, alpha(CYAN[0], 0.5));
      }
      g.set(cx - 3 + L, by - 6, p.i % 2 ? MAG[1] : CYAN[1]);
      if (p.anim === 'attack') {
        glowDot(g, cx + 5 + L, by + 3, '#ff2ec4', p.atk ? 4 : 3, p.atk ? 0.75 : 0.5);
        if (p.atk) sparkle(g, cx + 8 + L, by + 3, MAG[1], true);
      }
    },
  });

  const NINJA = [C('#0a0b12'), C('#181a26'), C('#2e3348'), C('#535c80')];
  def('cyber_ninja', {
    w: 30, h: 26, face: 'L', fall: true,
    anims: { walk: { n: 4, fps: 12 }, idle: { n: 2, fps: 3 }, attack: { n: 2, fps: 5, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const cx = 14;
      const run = p.anim === 'walk';
      const b = run ? [0, -1, 0, -1][p.ph] : p.bob;
      const L = lean(p, 2, 3) + (run ? 1 : 0);
      const ux = cx + L;
      const [bd, fd, bl, fl] = gait(p, 2);
      // scarf
      const wave = run ? p.ph % 2 : p.i % 2;
      S(g, MAG, (m, c) => poly(m, [[ux - 2, 9 + b], [ux, 9 + b], [ux - 6, 12 + b + wave], [ux - 11, 11 + b - wave], [ux - 7, 10 + b]], c), { top: 1, bot: 1 });
      // legs
      fatLeg(g, cx - 2, 17, 24, bd, bl, 2, [NINJA[0], NINJA[1], NINJA[2]], [NINJA[0], NINJA[0], NINJA[1]]);
      // body
      S(g, NINJA, (m, c) => {
        poly(m, [[ux - 3, 10 + b], [ux + 3, 10 + b], [ux + 2, 17], [ux - 3, 17]], c);
      }, { top: 1, bot: 1, right: 1 });
      hline(g, ux - 3, ux + 2, 15, MAG[1]);
      g.set(ux + 1, 12 + b, CYAN[1]);
      fatLeg(g, cx + 1, 17, 24, fd, fl, 2, NINJA.slice(1), [NINJA[1], NINJA[1], NINJA[2]]);
      // head
      sOval(g, ux - 3, 2 + b, 8, 8, NINJA);
      hline(g, ux + 1, ux + 4, 5 + b, p.hurt ? CYAN[0] : CYAN[1]);
      g.set(ux + 4, 5 + b, CYAN[2]);
      g.set(ux - 2, 3 + b, NINJA[3]);
      g.set(ux - 3, 6 + b, MAG[1]);
      // katana
      let hand = [ux + 4, 14 + b];
      let ang = 120;
      if (p.anim === 'attack') {
        hand = p.atk === 0 ? [ux - 1, 9] : [ux + 6, 12];
        ang = p.atk === 0 ? -120 : 92;
      } else if (p.hurt) {
        ang = 150;
      }
      place(g, weaponGrid(4, 0), ang, 2, 11, hand[0], hand[1]);
      line(g, ux + 1, 11 + b, hand[0], hand[1], NINJA[2]);
      g.set(hand[0], hand[1], NINJA[3]);
    },
    post(g, p) {
      if (p.anim === 'attack' && p.atk === 1) {
        const sx = 14 + 3 + 2;
        for (let a = -50; a <= 100; a += 2) {
          for (let r = 10; r <= 12; r++) {
            const [dx, dy] = rotPoint(0, -r, a);
            const x = Math.round(sx + dx);
            const y = Math.round(13 + dy);
            if (g.solid(x, y)) continue;
            g.set(x, y, alpha(r === 12 ? CYAN[1] : CYAN[2], 0.35 + 0.6 * ((a + 50) / 150)));
          }
        }
      }
    },
  });

  def('mech', {
    w: 32, h: 28, face: 'L',
    anims: { walk: { n: 4, fps: 6 }, idle: { n: 2, fps: 2.5 }, attack: { n: 2, fps: 5, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const cx = 15;
      const gy = 26;
      const dead = p.dead;
      const b = dead ? 9 : p.anim === 'walk' ? (p.ph % 2 ? 1 : 0) : p.bob;
      const recoil = p.anim === 'attack' && p.atk === 1 ? -1 : 0;
      const ux = cx + recoil + (p.hurt ? -1 : 0);
      const [bd, fd, bl, fl] = gait(p, 2);
      const leg = (x, dx, lift, rp) => {
        if (dead) {
          sRect(g, x - 3, gy - 1, 7, 2, rp);
          return;
        }
        const hip = [x, 15 + b];
        const knee = [x - 4, 19 + b];
        const foot = [x - 1 + dx, gy - 1 - lift];
        S(g, rp, (m, c) => {
          line(m, hip[0], hip[1], knee[0], knee[1], c, 3);
          line(m, knee[0], knee[1], foot[0], foot[1], c, 2);
        }, { top: 1, bot: 0, left: 1, right: 1 });
        sRect(g, foot[0] - 2, foot[1], 6, 2, rp);
        g.set(knee[0], knee[1], MAG[1]);
      };
      leg(cx - 1, bd, bl, [CHROME[0], CHROME[1], CHROME[2]]);
      // rocket pod
      sRect(g, ux - 8, 1 + b, 9, 5, CHROME.slice(1));
      for (let i = 0; i < 3; i++) g.set(ux - 6 + i * 3, 2 + b, CYAN[1]);
      // hull
      S(g, CHROME, (m, c) => poly(m, [[ux - 9, 6 + b], [ux + 5, 5 + b], [ux + 9, 9 + b], [ux + 8, 15 + b], [ux - 8, 16 + b]], c), { top: 1, bot: 2, right: 1 });
      // cockpit window
      S(g, MAG, (m, c) => poly(m, [[ux + 2, 7 + b], [ux + 6, 7 + b], [ux + 8, 10 + b], [ux + 2, 10 + b]], c));
      g.set(ux + 3, 8 + b, '#ffffff');
      if (p.hurt || dead) line(g, ux + 3, 7 + b, ux + 6, 10 + b, CHROME[0]);
      hline(g, ux - 7, ux - 1, 12 + b, CYAN[0]);
      g.set(ux - 5, 12 + b, CYAN[2]);
      // arm gun
      sRect(g, ux + 3, 13 + b, 9, 3, CHROME.slice(1));
      rect(g, ux + 11, 13 + b, 1, 3, CHROME[0]);
      leg(cx + 3, fd, fl, CHROME.slice(1));
    },
    post(g, p) {
      const b = p.dead ? 9 : p.anim === 'walk' ? (p.ph % 2 ? 1 : 0) : p.bob;
      if (p.dead) {
        puff(g, 12, 13, 2, 0.6);
        puff(g, 15, 10, 1.5, 0.5);
        g.set(20, 15, '#ffd04a');
        g.set(8, 17, '#21e6ff');
        return;
      }
      const ux = 15 + (p.anim === 'attack' && p.atk === 1 ? -1 : 0) + (p.hurt ? -1 : 0);
      if (p.anim === 'attack') {
        glowDot(g, ux + 13, 14 + b, '#ff2ec4', p.atk ? 4 : 2.5, p.atk ? 0.8 : 0.5);
        if (p.atk) sparkle(g, ux + 13, 14 + b, MAG[1], true);
      }
    },
  });

  def('ai_core', {
    ground: false, w: 58, h: 58, face: 'L', boss: true,
    anims: { walk: { n: 4, fps: 6 }, idle: { n: 4, fps: 5 }, attack: { n: 2, fps: 3.4, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const cx = 28;
      const dead = p.dead;
      const b = dead ? 0 : [0, -1, -2, -1][p.i % 4];
      const cy = dead ? 44 : 24 + b;
      const open = p.anim === 'attack' ? (p.atk === 0 ? 3 : 2) : 0;
      // dangling cables
      if (!dead) {
        for (let k = 0; k < 4; k++) {
          const x0 = cx - 9 + k * 6;
          const sw = ((p.i + k) % 2 ? 1 : -1) * (k % 2 ? 1 : 0);
          line(g, x0, cy + 14, x0 + sw, cy + 22 + (k % 2) * 3, CHROME[1]);
          line(g, x0 + sw, cy + 22 + (k % 2) * 3, x0 - sw, cy + 27 + (k % 2) * 2, CHROME[1]);
          sRect(g, x0 - sw - 1, cy + 27 + (k % 2) * 2, 3, 2, CHROME.slice(1));
        }
      }
      // side panels
      for (const s of [-1, 1]) {
        const px0 = cx + s * (19 + open) - 3;
        S(g, CHROME.slice(1), (m, c) => rect(m, px0, cy - 8, 6, 16, c), { top: 1, bot: 1, right: 1 });
        for (let i = 0; i < 3; i++) g.set(px0 + 2, cy - 5 + i * 5, CYAN[1]);
      }
      S(g, CHROME.slice(1), (m, c) => rect(m, cx - 6, cy - 21 - open, 12, 5, c), { top: 1, bot: 1 });
      g.set(cx, cy - 26 - open, MAG[1]);
      vline(g, cx, cy - 25 - open, cy - 22 - open, CHROME[2]);
      // octagon shell
      const R = 17;
      const oct = [];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
        oct.push([cx + 0.5 + Math.cos(a) * R, cy + 0.5 + Math.sin(a) * R]);
      }
      S(g, CHROME, (m, c) => poly(m, oct, c), { top: 2, bot: 2, left: 1, right: 1 });
      ring(g, cx, cy, 11, 12.6, CHROME[0]);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2 + (p.i % 4) * 0.13;
        g.set(Math.round(cx + Math.cos(a) * 14), Math.round(cy + Math.sin(a) * 14), k % 3 === 0 ? MAG[1] : CYAN[1]);
      }
      // eye
      disc(g, cx, cy, 9.5, '#06070c');
      if (dead) {
        disc(g, cx, cy, 6, '#2a1a30');
        line(g, cx - 6, cy - 5, cx + 5, cy + 6, CHROME[2]);
        line(g, cx + 1, cy - 7, cx - 2, cy + 2, CHROME[2]);
        return;
      }
      const charge = p.anim === 'attack';
      disc(g, cx, cy, 7.5, charge ? CYAN[1] : MAG[0]);
      disc(g, cx, cy, 5.5, charge ? CYAN[2] : MAG[1]);
      disc(g, cx + 1, cy, p.hurt ? 1 : 3, charge ? '#ffffff' : '#12000e');
      g.set(cx - 3, cy - 3, '#ffffff');
      g.set(cx - 2, cy - 3, '#ffffff');
      g.set(cx - 3, cy - 2, '#ffffff');
      if (p.hurt) {
        hline(g, cx - 8, cx + 8, cy - 1, '#06070c');
        hline(g, cx - 8, cx + 8, cy + 1, '#06070c');
      }
    },
    post(g, p) {
      const cx = 28;
      if (p.dead) {
        puff(g, cx - 4, 30, 3, 0.55);
        puff(g, cx + 3, 26, 2, 0.45);
        g.set(cx + 10, 36, '#ffd04a');
        g.set(cx - 12, 34, '#21e6ff');
        return;
      }
      const b = [0, -1, -2, -1][p.i % 4];
      const cy = 24 + b;
      glowDot(g, cx, cy, p.anim === 'attack' ? '#5ef3ff' : '#ff2ec4', p.anim === 'attack' ? 16 : 13, p.anim === 'attack' ? 0.3 : 0.15);
      if (p.anim === 'attack' && p.atk === 1) {
        for (let x = cx + 9; x < 58; x++) {
          g.set(x, cy - 1, alpha(CYAN[1], 0.8));
          g.set(x, cy, '#ffffff');
          g.set(x, cy + 1, alpha(CYAN[1], 0.8));
        }
      }
    },
  });

  // ===================================================================== VOID — deep purple / starlight
  const VOIDC = [C('#0c0618'), C('#1c0f36'), C('#33205e'), C('#5a3e98')];
  const STAR = C('#f4f0ff');
  const GREY = R3('#4c4c70', '#8e8eba', '#d0d0f0');
  function starfield(g, m, seed, density) {
    const r = rng(seed);
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (!m.get(x, y)) continue;
        const v = r();
        if (v < density) g.set(x, y, v < density * 0.35 ? STAR : '#a890ff');
      }
    }
  }
  const VBLADE = gridFrom(['.W.', 'wWv', 'wWv', 'wWv', 'wWv', 'kKk', '.h.', '.h.'], { W: '#ffffff', w: '#c8a8ff', v: '#7a4adc', k: '#2a1a4a', K: '#6a5a9a', h: '#3a2a5a' });
  def('alien', {
    w: 26, h: 26, face: 'L', fall: true,
    anims: { walk: { n: 4, fps: 8 }, idle: { n: 2, fps: 2.5 }, attack: { n: 2, fps: 5, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const cx = 12;
      const b = p.bob;
      const L = lean(p, 1, 3);
      const ux = cx + L;
      const [bd, fd, bl, fl] = gait(p, 1.5);
      // legs (thin)
      fatLeg(g, cx - 2, 17, 24, bd, bl, 2, [VOIDC[1], VOIDC[1], VOIDC[2]], [VOIDC[0], VOIDC[1], VOIDC[2]]);
      // back arm
      line(g, ux - 2, 13 + b, ux - 4 + (p.anim === 'walk' ? -Math.round(fd / 2) : 0), 17 + b, GREY[0]);
      // suit body
      S(g, VOIDC, (m, c) => {
        poly(m, [[ux - 3, 12 + b], [ux + 3, 12 + b], [ux + 2, 18], [ux - 3, 18]], c);
      }, { top: 1, bot: 1, right: 1 });
      g.set(ux, 14 + b, STAR);
      hline(g, ux - 3, ux + 1, 17, VOIDC[3]);
      fatLeg(g, cx + 1, 17, 24, fd, fl, 2, [VOIDC[1], VOIDC[2], VOIDC[3]], VOIDC.slice(1));
      // neck + big head
      g.set(ux, 11 + b, GREY[1]);
      sOval(g, ux - 5, 1 + b, 11, 10, GREY);
      // eyes: big slanted black with starlight glint
      const ex = ux + 1;
      const ey = 4 + b;
      if (p.hurt) {
        hline(g, ex, ex + 3, ey + 2, '#06040c');
      } else {
        poly(g, [[ex, ey], [ex + 3, ey], [ex + 5, ey + 2], [ex + 2, ey + 4], [ex, ey + 3]], '#06040c');
        g.set(ex + 1, ey + 1, STAR);
        g.set(ex + 3, ey + 2, '#a890ff');
      }
      g.set(ux + 4, 8 + b, GREY[0]);
      // arm + void dagger
      let hand = [ux + 4, 16 + b];
      let ang = 45;
      if (p.anim === 'attack') {
        hand = p.atk === 0 ? [ux + 1, 10] : [ux + 7, 14];
        ang = p.atk === 0 ? -20 : 90;
      }
      place(g, VBLADE, ang, 1, 6, hand[0], hand[1]);
      line(g, ux + 1, 13 + b, hand[0], hand[1], GREY[1]);
      g.set(hand[0], hand[1], GREY[2]);
    },
    post(g, p) {
      if (p.dead) return;
      const L = lean(p, 1, 3);
      const b = p.bob;
      let hand = [12 + L + 4, 16 + b];
      let ang = 45;
      if (p.anim === 'attack') {
        hand = p.atk === 0 ? [12 + L + 1, 10] : [12 + L + 7, 14];
        ang = p.atk === 0 ? -20 : 90;
      }
      const [dx, dy] = rotPoint(0, -5, ang);
      glowDot(g, Math.round(hand[0] + dx), Math.round(hand[1] + dy), '#b48aff', 3, 0.4);
    },
  });

  def('void_eye', {
    ground: false, w: 26, h: 28, face: 'L',
    anims: { walk: { n: 4, fps: 8 }, idle: { n: 4, fps: 6 }, attack: { n: 2, fps: 5, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const SCL = R3('#6a5a8a', '#b8a8d8', '#efe8ff');
      const IRIS = R3('#4a0f7a', '#a040e0', '#e8a0ff');
      const cx = 13;
      if (p.dead) {
        sOval(g, cx - 8, 19, 17, 8, SCL);
        S(g, VOIDC, (m, c) => oval(m, cx - 8, 18, 17, 5, c), { top: 1, bot: 1 });
        hline(g, cx - 5, cx + 5, 22, VOIDC[0]);
        for (let k = 0; k < 3; k++) line(g, cx - 6 + k * 6, 26, cx - 9 + k * 6, 26, VOIDC[2]);
        return;
      }
      const b = [0, -1, -1, 0][p.i % 4];
      const by = 2 + b;
      // tentacles
      for (let k = 0; k < 4; k++) {
        const x0 = cx - 5 + k * 3;
        const ph = (p.i + k) % 4;
        const sw = [0, 1, 0, -1][ph];
        const pts = [[x0, by + 13], [x0 + sw, by + 17], [x0 - sw, by + 21], [x0 + sw * 2 - 1, by + 24]];
        for (let i = 0; i + 1 < pts.length; i++) line(g, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], i < 2 ? VOIDC[3] : VOIDC[2], i === 0 ? 2 : 1);
      }
      // eyeball
      sOval(g, cx - 8, by, 17, 16, SCL);
      // veins
      line(g, cx - 6, by + 10, cx - 3, by + 9, '#c05a8a');
      line(g, cx - 5, by + 4, cx - 2, by + 6, '#c05a8a');
      // iris + pupil
      const wide = p.anim === 'attack' && p.atk === 0;
      const ix = cx + 3;
      const iy = by + 8;
      disc(g, ix, iy, wide ? 4.6 : 4, IRIS[0]);
      disc(g, ix, iy, wide ? 3.6 : 3, IRIS[1]);
      g.set(ix - 2, iy - 2, IRIS[2]);
      disc(g, ix + 1, iy, wide ? 1 : p.anim === 'attack' ? 2.4 : 1.6, '#06040c');
      g.set(ix, iy - 1, STAR);
      // lid shell
      const lid = p.hurt ? 8 : wide ? 2 : 4;
      S(g, VOIDC, (m, c) => {
        oval(m, cx - 9, by - 1, 19, 18, c);
        for (let y = by - 1 + lid; y < by + 20; y++) for (let x = 0; x < 26; x++) m.clear(x, y);
        for (let x = cx - 6; x <= cx + 6; x++) if (!m.get(x, by - 1 + lid - 1)) m.set(x, by + lid - 2, c);
      }, { top: 1, bot: 1 });
      starfield(g, (() => {
        const m = new Grid(26, 28);
        oval(m, cx - 9, by - 1, 19, lid + 1, MASK);
        return m;
      })(), 7, 0.08);
    },
    post(g, p) {
      if (p.dead) return;
      const b = [0, -1, -1, 0][p.i % 4];
      if (p.anim === 'attack') glowDot(g, 17, 10 + b, '#e080ff', p.atk ? 6 : 5, p.atk ? 0.45 : 0.3);
    },
  });

  def('tentacle', {
    w: 28, h: 30, face: 'L',
    anims: { walk: { n: 4, fps: 6 }, idle: { n: 2, fps: 2.5 }, attack: { n: 2, fps: 5, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const TENT = [C('#2a0c46'), C('#5a2a8a'), C('#9a5ad0'), C('#d8b0ff')];
      const cx = 13;
      const gy = 28;
      // portal
      S(g, VOIDC, (m, c) => oval(m, cx - 10, gy - 5, 21, 6, c), { top: 1, bot: 1 });
      oval(g, cx - 8, gy - 4, 17, 3, '#05020c');
      g.set(cx - 5, gy - 3, STAR);
      g.set(cx + 4, gy - 3, '#a890ff');
      g.set(cx + 1, gy - 2, STAR);
      // body curve
      let ph = p.anim === 'walk' ? p.ph : p.anim === 'idle' ? p.i * 2 : 0;
      let bend = [0, 2, 0, -2][ph % 4];
      let len = 22;
      let tipC = 3;
      if (p.anim === 'attack') {
        bend = p.atk === 0 ? -6 : 9;
        tipC = p.atk === 0 ? 4 : 1;
        len = p.atk === 0 ? 22 : 20;
      } else if (p.hurt) {
        bend = -4;
      }
      if (p.dead) {
        len = 22;
      }
      const pts = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        let x;
        let y;
        if (p.dead) {
          x = cx - 6 + t * 18;
          y = gy - 4 - Math.sin(t * Math.PI) * 3;
        } else {
          x = cx + Math.sin(t * Math.PI * 0.9) * bend * t + (t > 0.8 ? (t - 0.8) * tipC * 10 : 0);
          y = gy - 4 - t * len;
        }
        pts.push([x, y, 3.6 - t * 2.7]);
      }
      const m = new Grid(g.w, g.h);
      for (const q of pts) disc(m, Math.round(q[0]), Math.round(q[1]), q[2], MASK);
      shadeMask(g, m, TENT, { top: 1, bot: 1, left: 1, right: 1 });
      // suckers on the front edge
      for (let i = 3; i < 18; i += 3) {
        const q = pts[i];
        const sx = Math.round(q[0] + q[2] - 0.5);
        const sy = Math.round(q[1]);
        g.set(sx, sy, '#ff9ad8');
        if (i < 10) g.set(sx, sy + 1, '#c85aa0');
      }
    },
  });

  def('void_titan', {
    w: 68, h: 62, face: 'L', boss: true, fall: true, fallDx: -2,
    anims: { walk: { n: 4, fps: 4.5 }, idle: { n: 2, fps: 2 }, attack: { n: 2, fps: 3.4, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const cx = 33;
      const gy = 60;
      const L = lean(p, 2, 4);
      const b = p.anim === 'walk' ? (p.ph % 2 ? 1 : 0) : p.bob;
      const [bd, fd, bl, fl] = gait(p, 2);
      const ux = cx + L;
      const RIM = C('#c8b8ff');
      const body = new Grid(g.w, g.h);
      const draw = (fn, rp) => {
        const m = new Grid(g.w, g.h);
        fn(m, MASK);
        shadeMask(g, m, rp || VOIDC, { top: 1, bot: 2, left: 1, right: 1 });
        blit(body, m, 0, 0);
        return m;
      };
      // back arm
      const bsw = p.anim === 'walk' ? (p.ph < 2 ? 2 : -2) : 0;
      draw((m, c) => {
        line(m, ux - 14, 22 + b, ux - 20 - bsw, 40 + b, c, 6);
        oval(m, ux - 25 - bsw, 37 + b, 10, 10, c);
      }, [VOIDC[0], VOIDC[0], VOIDC[1], VOIDC[2]]);
      // legs
      draw((m, c) => poly(m, [[cx - 12 + bd, 40], [cx - 3 + bd, 40], [cx - 3 + bd, gy - bl * 2], [cx - 14 + bd, gy - bl * 2]], c), [VOIDC[0], VOIDC[0], VOIDC[1], VOIDC[2]]);
      // torso (hulking)
      draw((m, c) => poly(m, [[ux - 18, 18 + b], [ux + 15, 16 + b], [ux + 12, 32 + b], [ux + 7, 44 + b], [ux - 9, 44 + b], [ux - 14, 32 + b]], c));
      draw((m, c) => poly(m, [[cx + 2 + fd, 40], [cx + 11 + fd, 40], [cx + 13 + fd, gy - fl * 2], [cx + 1 + fd, gy - fl * 2]], c));
      // head (heavy brow ridge)
      draw((m, c) => {
        oval(m, ux - 7, 5 + b, 16, 14, c);
        rect(m, ux - 5, 15 + b, 13, 4, c);
      });
      // front arm
      let fist = [ux + 20, 36 + b];
      if (p.anim === 'attack') fist = p.atk === 0 ? [ux + 12, 4] : [ux + 26, 28];
      else if (p.anim === 'walk') fist[0] += bsw;
      draw((m, c) => {
        line(m, ux + 11, 21 + b, fist[0], fist[1], c, 7);
        oval(m, fist[0] - 5, fist[1] - 4, 11, 11, c);
      });
      starfield(g, body, 31, 0.022);
      // starlight rim on top edges
      for (let y = 1; y < g.h; y++) for (let x = 0; x < g.w; x++) if (body.get(x, y) && !body.get(x, y - 1)) g.set(x, y, RIM);
      // eyes
      hline(g, ux - 1, ux + 8, 10 + b, VOIDC[0]);
      if (p.hurt) {
        hline(g, ux + 1, ux + 3, 12 + b, '#8a7aff');
        hline(g, ux + 5, ux + 7, 12 + b, '#8a7aff');
      } else {
        rect(g, ux + 1, 11 + b, 3, 2, '#ffffff');
        rect(g, ux + 5, 11 + b, 3, 2, '#ffffff');
        g.set(ux + 3, 12 + b, '#b48aff');
        g.set(ux + 7, 12 + b, '#b48aff');
      }
      // glowing maw
      hline(g, ux + 1, ux + 7, 16 + b, '#05020c');
      if (p.anim === 'attack') hline(g, ux + 2, ux + 6, 17 + b, '#b48aff');
      // crystal crown
      const CRY = R3('#3a8ab0', '#8ae8ff', '#f0ffff');
      for (const c of [[ux - 4, 7, 6], [ux, 5, 8], [ux + 4, 7, 6]]) {
        S(g, CRY, (m, cc) => poly(m, [[c[0] - 1, c[1] + b + 1], [c[0] + 0.5, c[1] + b - c[2]], [c[0] + 2, c[1] + b + 1]], cc), { top: 0, left: 1, right: 1 });
      }
      // crystal knuckles
      for (const c of [[fist[0] + 3, fist[1] - 4], [fist[0] + 6, fist[1]], [fist[0] + 3, fist[1] + 4]]) {
        S(g, CRY, (m, cc) => poly(m, [[c[0], c[1]], [c[0] + 4, c[1] + 1], [c[0], c[1] + 3]], cc), { top: 1, bot: 1 });
      }
      // void core in the chest
      disc(g, ux - 1, 28 + b, 3, '#05020c');
      ring(g, ux - 1, 28 + b, 3, 3.9, '#b48aff');
      g.set(ux - 2, 27 + b, STAR);
    },
    post(g, p) {
      if (p.dead) return;
      const L = lean(p, 2, 4);
      const b = p.anim === 'walk' ? (p.ph % 2 ? 1 : 0) : p.bob;
      const ux = 33 + L;
      glowDot(g, ux - 1, 28 + b, '#b48aff', 6, 0.3);
      const r = rng(5 + p.i);
      for (let k = 0; k < 4; k++) {
        const x = Math.round(4 + r() * 60);
        const y = Math.round(4 + r() * 40);
        if (!g.solid(x, y)) sparkle(g, x, y, C('#8a7aff'));
      }
      if (p.anim === 'attack') {
        const fist = p.atk === 0 ? [ux + 12, 4] : [ux + 26, 28];
        glowDot(g, fist[0], fist[1], '#b48aff', 9, 0.45);
        fireball(g, fist[0] + (p.atk ? 4 : 0), fist[1] - (p.atk ? 0 : 3), 3, 21 + p.atk, VFIRE);
      }
    },
  });

  // ===================================================================== BOSS DUNGEONS
  const DRAKE = [C('#3e0810'), C('#7e1620'), C('#c8342c'), C('#f27a4e')];
  const BELLY = R3('#b8762a', '#eebc56', '#fff0a4');
  const WINGM = [C('#2e0610'), C('#5e1020'), C('#962a36'), C('#c85a5a')];
  function dragonPose(p) {
    const ph = p.anim === 'walk' || p.anim === 'idle' ? p.i % 4 : p.anim === 'attack' ? (p.atk ? 2 : 0) : p.dead ? 2 : 1;
    const b = p.dead ? 9 : [0, -1, -2, -1][ph];
    const L = p.dead ? 0 : lean(p, 2, 3);
    let hx = 38 + 19 + L;
    let hy = 9 + b;
    if (p.anim === 'attack') {
      hx += p.atk === 0 ? -4 : 1;
      hy += p.atk === 0 ? -3 : 4;
    } else if (p.hurt) {
      hx -= 2;
      hy -= 1;
    } else if (p.dead) {
      hx = 38 + 22;
      hy = 47;
    }
    return { ph, b, L, hx, hy };
  }
  def('dragon', {
    w: 78, h: 62, face: 'L', boss: true,
    anims: { walk: { n: 4, fps: 6 }, idle: { n: 4, fps: 4 }, attack: { n: 2, fps: 3.4, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const cx = 38;
      const gy = 60;
      const { ph, b, hx, hy } = dragonPose(p);
      const dead = p.dead;
      const [bd, fd, bl, fl] = p.anim === 'walk' ? gait(p, 2) : [-1, 1, 0, 0];
      // bat wing fanned from the shoulder: arm angle per flap phase (0 = straight up, negative = back)
      const armA = dead ? -112 : [-18, -52, -96, -52][ph];
      const wing = (ox, oy, rp, bone) => {
        const sx = cx - 2 + ox;
        const sy = 29 + b + oy;
        const [wx, wy] = rotPoint(0, -17, armA);
        const wrist = [sx + wx, sy + wy];
        const fingers = [[armA - 62, 22], [armA - 96, 20], [armA - 128, 15]];
        const tips = fingers.map((f) => {
          const [dx, dy] = rotPoint(0, -f[1], f[0]);
          return [wrist[0] + dx, wrist[1] + dy];
        });
        const sc = (a, c2, k) => [a[0] + (c2[0] - a[0]) * 0.5 + (wrist[0] - (a[0] + c2[0]) / 2) * k, a[1] + (c2[1] - a[1]) * 0.5 + (wrist[1] - (a[1] + c2[1]) / 2) * k];
        const attach = [sx - 15, sy + 5];
        const pts = [[sx + 2, sy], wrist, tips[0], sc(tips[0], tips[1], 0.32), tips[1], sc(tips[1], tips[2], 0.32), tips[2], sc(tips[2], attach, 0.25), attach];
        S(g, rp, (m, c) => poly(m, pts, c), { top: 1, bot: 1 });
        line(g, sx, sy, wrist[0], wrist[1], bone, 2);
        for (const t of tips) line(g, wrist[0], wrist[1], t[0], t[1], bone);
        g.set(Math.round(wrist[0]), Math.round(wrist[1]) - 1, '#f0e6cc');
        g.set(Math.round(wrist[0]) - 1, Math.round(wrist[1]) - 1, '#f0e6cc');
      };
      wing(5, -2, [WINGM[0], WINGM[0], WINGM[1], WINGM[2]], DRAKE[0]);
      // tail: thick root tapering to a spade
      const tailPts = [];
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        const sw = dead ? 0 : Math.sin(t * 3 + ph * 0.8) * 1.5 * t;
        tailPts.push([cx - 16 - t * 18, 40 + b + t * (dead ? 6 : 12) - Math.sin(t * Math.PI) * 4 + sw, 5.5 - t * 4.2]);
      }
      S(g, DRAKE, (m, c) => {
        for (const q of tailPts) disc(m, Math.round(q[0]), Math.round(q[1]), q[2], c);
        const e = tailPts[tailPts.length - 1];
        poly(m, [[e[0] + 1, e[1] - 3], [e[0] - 6, e[1] - 1], [e[0] + 1, e[1] + 3]], c);
      }, { top: 1, bot: 1 });
      // legs: chunky thigh + short shin + clawed foot
      const leg = (x, dx, lift, rp, big) => {
        if (dead) {
          sOval(g, x - 2, gy - 7, big ? 12 : 9, 7, rp);
          return;
        }
        S(g, rp, (m, c) => {
          oval(m, x - (big ? 3 : 1), 38 + b, big ? 13 : 9, big ? 14 : 11, c);
          line(m, x + 3, 48 + b, x + 3 + dx, gy - 3 - lift, c, big ? 5 : 4);
        }, { top: 1, bot: 1, left: 1, right: 1 });
        sRect(g, x + dx - 1, gy - 3 - lift, 9, 3, rp);
        for (let i = 0; i < 3; i++) g.set(x + dx + 4 + i * 2, gy - 1 - lift, '#f0e6cc');
      };
      leg(cx - 13, bd, bl * 2, [DRAKE[0], DRAKE[0], DRAKE[1], DRAKE[2]], true);
      leg(cx + 9, fd, fl * 2, [DRAKE[0], DRAKE[0], DRAKE[1], DRAKE[2]], false);
      // body with a segmented belly
      const bx0 = cx - 20;
      const by0 = 27 + b;
      const bw = 37;
      const bh = 22;
      sOval(g, bx0, by0, bw, bh, DRAKE);
      for (let y = by0 + 12; y < by0 + bh; y++) {
        for (let x = bx0 + 6; x < bx0 + bw; x++) {
          const nx = (x + 0.5 - (bx0 + bw / 2)) / (bw / 2);
          const ny = (y + 0.5 - (by0 + bh / 2)) / (bh / 2);
          if (nx * nx + ny * ny > 0.8 || nx < -0.55) continue;
          g.set(x, y, (y - by0) % 3 === 0 ? BELLY[0] : y > by0 + bh - 4 ? BELLY[1] : BELLY[2]);
        }
      }
      // dorsal spines
      for (let i = 0; i < 6; i++) {
        const x = cx - 13 + i * 5;
        const yy = by0 + Math.round(Math.abs(i - 2.5) * 0.9) - 1;
        g.set(x, yy, '#f0e6cc');
        g.set(x + 1, yy - 1, '#f0e6cc');
        g.set(x + 1, yy, HORN[1]);
      }
      // near legs
      leg(cx - 11, bd + 1, bl * 2, DRAKE, true);
      leg(cx + 11, fd, fl * 2, DRAKE, false);
      // neck (S-curve of discs) with belly scutes
      const neck = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const x = cx + 12 + (hx - cx - 12) * t;
        const y = by0 + 6 + (hy + 8 - by0 - 6) * t - Math.sin(t * Math.PI) * (dead ? 0 : 3);
        neck.push([x, y, 5.5 - t * 1.8]);
      }
      S(g, DRAKE, (m, c) => {
        for (const q of neck) disc(m, Math.round(q[0]), Math.round(q[1]), q[2], c);
      }, { top: 1, bot: 1, right: 1 });
      for (let i = 1; i < 10; i += 2) {
        const q = neck[i];
        sRect(g, Math.round(q[0] + q[2] - 3), Math.round(q[1] + 1), 3, 2, BELLY);
      }
      // head
      sOval(g, hx - 4, hy, 14, 12, DRAKE);
      const open = p.anim === 'attack' && p.atk === 1;
      S(g, DRAKE, (m, c) => {
        poly(m, [[hx + 6, hy + 2], [hx + 18, hy + 4], [hx + 19, hy + 8], [hx + 7, hy + 9]], c);
        if (open) poly(m, [[hx + 6, hy + 10], [hx + 16, hy + 13], [hx + 15, hy + 15], [hx + 5, hy + 13]], c);
        else poly(m, [[hx + 6, hy + 9], [hx + 17, hy + 9], [hx + 16, hy + 11], [hx + 5, hy + 11]], c);
      }, { top: 1, bot: 1, right: 1 });
      if (open) {
        poly(g, [[hx + 8, hy + 9], [hx + 18, hy + 9], [hx + 16, hy + 12], [hx + 7, hy + 11]], '#ff9a2a');
        for (let i = 0; i < 4; i++) g.set(hx + 9 + i * 2, hy + 9, '#ffffff');
      } else {
        for (let i = 0; i < 4; i++) g.set(hx + 8 + i * 2, hy + 9, '#ffffff');
      }
      g.set(hx + 17, hy + 5, DRAKE[0]);
      // horns + frill
      S(g, HORN, (m, c) => {
        poly(m, [[hx - 2, hy + 3], [hx + 2, hy + 1], [hx - 9, hy - 6], [hx - 7, hy - 2]], c);
        poly(m, [[hx + 2, hy + 1], [hx + 5, hy + 1], [hx - 3, hy - 8]], c);
      }, { top: 1, bot: 1 });
      for (let i = 0; i < 3; i++) g.set(hx - 4 - i, hy + 6 + i * 2, DRAKE[3]);
      // eye
      if (p.hurt || dead) hline(g, hx + 4, hx + 6, hy + 5, '#3a0a0a');
      else {
        rect(g, hx + 4, hy + 4, 3, 2, '#ffe04a');
        g.set(hx + 6, hy + 4, '#1a0a0a');
        g.set(hx + 6, hy + 5, '#1a0a0a');
      }
      line(g, hx + 2, hy + 3, hx + 7, hy + 3, DRAKE[0]);
      // near wing
      wing(0, 0, WINGM, DRAKE[1]);
    },
    post(g, p) {
      if (p.dead) return;
      const { hx, hy } = dragonPose(p);
      if (p.anim === 'attack' && p.atk === 0) {
        glowDot(g, hx + 13, hy + 8, '#ff9a2a', 4, 0.6);
        g.set(hx + 18, hy + 7, '#ffd84a');
      }
      if (p.anim === 'attack' && p.atk === 1) {
        for (let x = hx + 18; x < 78; x++) {
          const k = (x - hx - 18) / 11;
          const h = Math.round(1 + k * 4);
          for (let y = -h; y <= h; y++) {
            const e = Math.abs(y) / (h + 0.01);
            g.set(x, hy + 12 + y, e > 0.7 ? FIRE[0] : e > 0.35 ? FIRE[1] : FIRE[2]);
          }
        }
      }
    },
  });

  const ZSKIN = R3('#3a5a2a', '#6a9a4a', '#a8d07a');
  const ZSHIRT = R3('#3a2a1e', '#6a4a32', '#9a7050');
  const ZPANTS = R3('#1e2a44', '#34486a', '#56709a');
  def('zombie', {
    w: 28, h: 26, face: 'L', fall: true,
    anims: { walk: { n: 4, fps: 5 }, idle: { n: 2, fps: 2 }, attack: { n: 2, fps: 5, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const cx = 13;
      const b = p.anim === 'walk' ? [0, 1, 0, 1][p.ph] : p.bob;
      const L = lean(p, 1, 3) + 1;
      const ux = cx + L;
      const [bd, fd, bl, fl] = gait(p, 1);
      // back arm reaching forward
      const reach = p.anim === 'attack' && p.atk === 0 ? -3 : 0;
      const arm = (y, c, ext) => {
        line(g, ux, y, ux + 7 + ext, y + reach + (p.anim === 'walk' ? p.ph % 2 : 0), c, 2);
        g.set(ux + 8 + ext, y + reach, ZSKIN[1]);
        g.set(ux + 8 + ext, y + reach + 1, ZSKIN[0]);
      };
      arm(12 + b, ZSKIN[0], 0);
      // legs
      fatLeg(g, cx - 3, 17, 24, bd, bl, 2, [ZPANTS[0], ZPANTS[0], ZPANTS[1]], [ZSHIRT[0], ZSHIRT[0], ZSHIRT[1]]);
      fatLeg(g, cx + 1, 17, 24, fd, fl, 2, ZPANTS, ZSHIRT);
      // torso (torn shirt)
      S(g, ZSHIRT, (m, c) => {
        rect(m, ux - 4, 10 + b, 8, 7, c);
      }, { top: 1, bot: 1, right: 1 });
      g.clear(ux - 2, 16 + b);
      g.clear(ux + 2, 16 + b);
      g.set(ux - 1, 13 + b, ZSKIN[1]);
      g.set(ux, 14 + b, ZSKIN[1]);
      g.set(ux + 2, 11 + b, ZSKIN[0]);
      hline(g, ux - 4, ux + 3, 17, ZPANTS[0]);
      // head (tilted forward)
      sOval(g, ux - 3, 2 + b, 9, 9, ZSKIN);
      g.set(ux - 2, 3 + b, '#2a3a1a');
      g.set(ux - 1, 2 + b, '#2a3a1a');
      // eyes: one sunken, one glowing
      if (p.hurt) {
        hline(g, ux + 2, ux + 4, 6 + b, '#1a1a10');
      } else {
        rect(g, ux + 2, 5 + b, 2, 2, '#1a1a10');
        g.set(ux + 3, 6 + b, '#ff4a3a');
        g.set(ux + 5, 6 + b, '#1a1a10');
      }
      const open = p.anim === 'attack';
      rect(g, ux + 2, 8 + b, 3, open ? 2 : 1, '#2a0a0a');
      if (open) g.set(ux + 3, 8 + b, '#e8e0c0');
      // front arm
      arm(13 + b, ZSKIN[1], p.anim === 'attack' && p.atk === 1 ? 3 : 1);
    },
  });

  const STONE = [C('#22242a'), C('#43464e'), C('#6c707a'), C('#a6aab4')];
  const RUNE = C('#5ef3ff');
  function block(g, x, y, w, h, rp) {
    S(g, rp || STONE, (m, c) => rect(m, x, y, w, h, c), { top: 1, bot: 1, left: 1, right: 1 });
  }
  def('stone_golem', {
    w: 64, h: 60, face: 'L', boss: true,
    anims: { walk: { n: 4, fps: 4 }, idle: { n: 2, fps: 2 }, attack: { n: 2, fps: 3.4, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const cx = 31;
      const gy = 58;
      if (p.dead) {
        const rub = [[cx - 22, gy - 9, 12, 10], [cx - 10, gy - 12, 14, 13], [cx + 4, gy - 10, 12, 11], [cx + 15, gy - 7, 9, 8], [cx - 4, gy - 21, 11, 10], [cx - 16, gy - 17, 8, 8]];
        for (const r of rub) block(g, r[0], r[1], r[2], r[3]);
        g.set(cx, gy - 17, '#2a6a74');
        g.set(cx + 2, gy - 17, '#2a6a74');
        rect(g, cx - 8, gy - 13, 5, 2, MOSS[1]);
        return;
      }
      const L = lean(p, 2, 3);
      const b = p.anim === 'walk' ? (p.ph % 2 ? 1 : 0) : p.bob;
      const [bd, fd, bl, fl] = gait(p, 2);
      const ux = cx + L;
      const raise = p.anim === 'attack' && p.atk === 0;
      const slam = p.anim === 'attack' && p.atk === 1;
      // back arm
      const bf = raise ? [ux - 12, 2] : slam ? [ux + 8, 40] : [ux - 22, 38 + b];
      S(g, [STONE[0], STONE[0], STONE[1], STONE[2]], (m, c) => line(m, ux - 14, 20 + b, bf[0] + 4, bf[1] + 2, c, 7), { top: 1, bot: 1 });
      block(g, bf[0], bf[1], 10, 10, [STONE[0], STONE[0], STONE[1], STONE[2]]);
      // legs
      block(g, cx - 13 + bd, 42 - bl * 2, 10, 16, [STONE[0], STONE[0], STONE[1], STONE[2]]);
      // torso blocks
      block(g, ux - 16, 16 + b, 32, 14);
      block(g, ux - 12, 29 + b, 24, 14);
      block(g, ux - 19, 14 + b, 10, 9);
      block(g, ux + 9, 14 + b, 10, 9);
      // moss patches
      rect(g, ux - 15, 16 + b, 7, 2, MOSS[1]);
      hline(g, ux - 14, ux - 11, 15 + b, MOSS[2]);
      rect(g, ux + 4, 29 + b, 6, 2, MOSS[1]);
      g.set(ux + 5, 31 + b, MOSS[0]);
      rect(g, ux + 10, 14 + b, 5, 1, MOSS[2]);
      block(g, cx + 3 + fd, 42 - fl * 2, 10, 16);
      // head
      block(g, ux - 5, 5 + b, 13, 11);
      rect(g, ux - 5, 5 + b, 6, 2, MOSS[1]);
      if (p.hurt) {
        hline(g, ux + 1, ux + 3, 10 + b, '#2a6a74');
        hline(g, ux + 5, ux + 7, 10 + b, '#2a6a74');
      } else {
        rect(g, ux + 1, 9 + b, 2, 2, RUNE);
        rect(g, ux + 5, 9 + b, 2, 2, RUNE);
        g.set(ux + 1, 9 + b, '#e8ffff');
        g.set(ux + 5, 9 + b, '#e8ffff');
      }
      // chest rune
      const rx = ux - 2;
      const ry = 21 + b;
      vline(g, rx + 2, ry, ry + 6, RUNE);
      line(g, rx, ry + 1, rx + 4, ry + 5, RUNE);
      line(g, rx + 4, ry + 1, rx, ry + 5, RUNE);
      g.set(rx + 2, ry + 3, '#e8ffff');
      // front arm
      const ff = raise ? [ux + 6, 0] : slam ? [ux + 20, 46] : [ux + 18, 38 + b];
      S(g, STONE.slice(1), (m, c) => line(m, ux + 13, 20 + b, ff[0] + 4, ff[1] + 3, c, 7), { top: 1, bot: 1, right: 1 });
      block(g, ff[0], ff[1], 11, 11);
      g.set(ff[0] + 5, ff[1] + 5, RUNE);
    },
    post(g, p) {
      if (p.dead) {
        glowDot(g, 32, 41, '#5ef3ff', 3, 0.25);
        return;
      }
      const L = lean(p, 2, 3);
      const b = p.anim === 'walk' ? (p.ph % 2 ? 1 : 0) : p.bob;
      glowDot(g, 31 + L, 24 + b, '#5ef3ff', 6, 0.25);
      if (p.anim === 'attack' && p.atk === 1) {
        for (const d of [[44, 56, 2], [56, 55, 1.6], [50, 52, 1.4], [61, 57, 1.2]]) puff(g, d[0], d[1], d[2], 0.65);
        for (const r of [[58, 48], [62, 51], [46, 49]]) rect(g, r[0], r[1], 2, 2, STONE[2]);
      }
    },
  });

  const BRAIN = R3('#8a3a5a', '#d86a92', '#ffb8d0');
  const OSKIN = R3('#2a5a3a', '#4a9a5a', '#8ad88a');
  const ARMOR = [C('#140e22'), C('#2e2248'), C('#54407a'), C('#8a72b8')];
  def('overlord', {
    ground: false, w: 72, h: 70, face: 'L', boss: true, fall: 'tilt', tilt: -28,
    anims: { walk: { n: 4, fps: 6 }, idle: { n: 4, fps: 5 }, attack: { n: 2, fps: 3.4, once: true }, hurt: { n: 1 }, dead: { n: 1 } },
    draw(g, p) {
      const cx = 35;
      const b = p.anim === 'walk' || p.anim === 'idle' ? [0, -1, -2, -1][p.i % 4] : 0;
      const L = lean(p, 1, 2);
      const ux = cx + L;
      // hover saucer
      const sy = 52 + b;
      sOval(g, cx - 25, sy, 50, 12, CHROME);
      hline(g, cx - 22, cx + 22, sy + 8, CHROME[0]);
      for (let i = 0; i < 7; i++) {
        const x = cx - 18 + i * 6;
        g.set(x, sy + 6, (i + p.i) % 2 ? CYAN[1] : MAG[1]);
        g.set(x + 1, sy + 6, (i + p.i) % 2 ? CYAN[2] : MAG[2]);
      }
      // throne back
      S(g, ARMOR, (m, c) => poly(m, [[cx - 18, sy + 1], [cx - 16, 26 + b], [cx - 10, 22 + b], [cx - 8, sy + 1]], c), { top: 1, bot: 1, right: 1 });
      // body armour
      S(g, ARMOR, (m, c) => {
        poly(m, [[ux - 12, 30 + b], [ux + 10, 30 + b], [ux + 12, 40 + b], [ux + 8, sy + 2], [ux - 10, sy + 2], [ux - 13, 40 + b]], c);
      }, { top: 1, bot: 2, left: 1, right: 1 });
      // glowing core
      disc(g, ux, 41 + b, 3, '#0a1a0e');
      disc(g, ux, 41 + b, 2, OSKIN[2]);
      g.set(ux - 1, 40 + b, '#ffffff');
      // shoulder plates
      sOval(g, ux - 17, 27 + b, 11, 8, ARMOR);
      sOval(g, ux + 7, 27 + b, 11, 8, ARMOR);
      g.set(ux - 12, 29 + b, MAG[1]);
      g.set(ux + 12, 29 + b, MAG[1]);
      // collar
      sRect(g, ux - 9, 26 + b, 18, 4, ARMOR.slice(1));
      // head: face below, brain dome above
      sOval(g, ux - 9, 14 + b, 19, 15, OSKIN);
      sOval(g, ux - 13, 1 + b, 27, 20, BRAIN);
      // brain folds
      const folds = [[[ux - 9, 8], [ux - 5, 5], [ux - 1, 7]], [[ux + 2, 4], [ux + 6, 7], [ux + 9, 6]], [[ux - 6, 13], [ux - 2, 11], [ux + 3, 13], [ux + 7, 11]], [[ux - 10, 15], [ux - 7, 17]], [[ux + 8, 14], [ux + 11, 12]]];
      for (const f of folds) crack(g, f.map((q) => [q[0], q[1] + b]), BRAIN[0]);
      g.set(ux - 7, 5 + b, BRAIN[2]);
      g.set(ux - 6, 4 + b, BRAIN[2]);
      // eyes
      if (p.hurt) {
        hline(g, ux, ux + 3, 21 + b, '#06040c');
        hline(g, ux + 5, ux + 8, 21 + b, '#06040c');
      } else {
        poly(g, [[ux - 1, 19 + b], [ux + 3, 19 + b], [ux + 4, 22 + b], [ux, 23 + b]], '#06040c');
        poly(g, [[ux + 5, 19 + b], [ux + 9, 19 + b], [ux + 8, 23 + b], [ux + 5, 22 + b]], '#06040c');
        g.set(ux + 2, 21 + b, '#ff3a3a');
        g.set(ux + 7, 21 + b, '#ff3a3a');
      }
      hline(g, ux + 3, ux + 5, 26 + b, OSKIN[0]);
      // arms on the armrests / raised
      const raised = p.anim === 'attack';
      const hand = raised ? (p.atk === 0 ? [ux + 14, 12 + b] : [ux + 20, 30 + b]) : [ux + 16, 44 + b];
      S(g, ARMOR.slice(1), (m, c) => line(m, ux + 10, 31 + b, hand[0], hand[1], c, 3), { top: 1, bot: 1 });
      sOval(g, hand[0] - 2, hand[1] - 2, 5, 5, OSKIN);
      S(g, ARMOR, (m, c) => line(m, ux - 13, 31 + b, ux - 17, 44 + b, c, 3), { top: 1, bot: 1 });
      sOval(g, ux - 19, 43 + b, 5, 5, OSKIN);
    },
    post(g, p) {
      if (p.dead) {
        puff(g, 30, 44, 4, 0.55);
        puff(g, 38, 38, 3, 0.45);
        puff(g, 34, 32, 2, 0.35);
        for (const s of [[50, 58], [22, 60], [44, 50]]) g.set(s[0], s[1], s[0] % 2 ? '#ffd04a' : '#21e6ff');
        return;
      }
      const b = p.anim === 'walk' || p.anim === 'idle' ? [0, -1, -2, -1][p.i % 4] : 0;
      const cx = 35;
      const ux = cx + lean(p, 1, 2);
      // thruster glow under the saucer
      for (const tx of [cx - 14, cx, cx + 14]) {
        glowDot(g, tx, 65 + b, '#21e6ff', 3.5, 0.5);
        g.set(tx, 64 + b, CYAN[2]);
        g.set(tx, 65 + b + (p.i % 2), alpha(CYAN[1], 0.8));
      }
      glowDot(g, ux, 9 + b, '#ff8ac0', 12, p.anim === 'attack' ? 0.3 : 0.12);
      if (p.anim === 'attack') {
        const hand = p.atk === 0 ? [ux + 14, 12 + b] : [ux + 20, 30 + b];
        glowDot(g, hand[0] + 2, hand[1] - 1, '#8aff8a', 6, 0.55);
        fireball(g, hand[0] + 2, hand[1] - 2, 2, 41, GFIRE);
        if (p.atk === 1) {
          for (let x = ux + 9; x < 72; x++) {
            g.set(x, 21 + b, alpha('#ff3a3a', 0.85));
            if (x > ux + 12) g.set(x, 20 + b, alpha('#ff9a9a', 0.5));
          }
        }
      }
    },
  });

  // ===================================================================== ALLIES (face right)
  const WOLF = [C('#262c3c'), C('#454f68'), C('#7480a0'), C('#b4bed8')];
  def('wolf', {
    w: 32, h: 22, face: 'R',
    anims: { idle: { n: 2, fps: 3 }, attack: { n: 2, fps: 6.6, once: true } },
    draw(g, p) {
      const cx = 15;
      const pounce = p.anim === 'attack' && p.atk === 1;
      const crouch = p.anim === 'attack' && p.atk === 0;
      const b = p.anim === 'idle' ? p.bob : crouch ? 2 : -2;
      const L = pounce ? 4 : crouch ? -1 : 0;
      const by = 9 + b;
      // tail
      const wag = p.anim === 'idle' ? p.i : 0;
      S(g, WOLF, (m, c) => poly(m, [[cx - 9 + L, by + 2], [cx - 15 + L, by - 2 - wag], [cx - 13 + L, by + 3 - wag], [cx - 9 + L, by + 5]], c), { top: 1, bot: 1 });
      // legs
      const legs = pounce ? [[-4, 3], [-3, 4], [4, -3], [5, -2]] : crouch ? [[-1, 0], [0, 0], [1, 0], [2, 0]] : [[-1, 0], [0, 0], [0, 0], [1, 0]];
      const leg = (x, d, near) => {
        const fy = pounce ? 18 - Math.abs(d[1]) : 20;
        line(g, x, by + 6, x + d[0], fy, near ? WOLF[2] : WOLF[1], 2);
        g.set(x + d[0] + 2, fy, near ? WOLF[2] : WOLF[1]);
      };
      leg(cx - 7 + L, legs[0], false);
      leg(cx + 5 + L, legs[2], false);
      // body
      sOval(g, cx - 10 + L, by, 19, 9, WOLF);
      // mane / scruff
      S(g, [WOLF[0], WOLF[1], WOLF[2]], (m, c) => poly(m, [[cx + 1 + L, by - 1], [cx + 8 + L, by - 2], [cx + 8 + L, by + 7], [cx + 2 + L, by + 6]], c), { top: 1, bot: 1 });
      // belly
      hline(g, cx - 6 + L, cx + 4 + L, by + 8, WOLF[3]);
      leg(cx - 6 + L, legs[1], true);
      leg(cx + 6 + L, legs[3], true);
      // head
      const hx = cx + 6 + L;
      const hy = by - 5 + (crouch ? 2 : 0);
      sOval(g, hx, hy, 9, 8, WOLF);
      S(g, WOLF, (m, c) => rect(m, hx + 7, hy + 3, 5, pounce ? 2 : 3, c), { top: 1, bot: 1 });
      if (pounce) {
        S(g, WOLF.slice(1), (m, c) => rect(m, hx + 7, hy + 6, 4, 2, c));
        rect(g, hx + 8, hy + 5, 4, 1, '#3a0a14');
        g.set(hx + 9, hy + 5, '#ffffff');
        g.set(hx + 11, hy + 5, '#ffffff');
      }
      g.set(hx + 11, hy + 3, '#14101c');
      // ears
      S(g, WOLF, (m, c) => {
        poly(m, [[hx + 1, hy + 1], [hx + 2, hy - 4], [hx + 5, hy + 1]], c);
      }, { top: 1, bot: 0 });
      g.set(hx + 3, hy - 1, '#c88a9a');
      // eye
      g.set(hx + 6, hy + 2, '#ffd84a');
      g.set(hx + 7, hy + 2, '#14101c');
      if (crouch) line(g, hx + 5, hy + 1, hx + 7, hy + 1, WOLF[0]);
    },
  });

  def('fairy', {
    ground: false, w: 20, h: 22, face: 'R', ol: '#3a1430',
    anims: { idle: { n: 4, fps: 10 }, attack: { n: 2, fps: 6.6, once: true } },
    draw(g, p) {
      const cx = 10;
      const b = p.anim === 'idle' ? [0, -1, -1, 0][p.i] : -1;
      const flap = p.anim === 'idle' ? p.i % 2 : p.atk;
      const HAIR = R3('#c8408a', '#ff7ac0', '#ffc0e4');
      const DRESS = R3('#2a9a8a', '#5ae0c0', '#c0fff0');
      const FSKIN = R3('#d08a7a', '#ffd0b4', '#fff0e0');
      // wings (translucent)
      const wc = alpha('#d8f4ff', 0.72);
      const we = alpha('#8ad8ff', 0.85);
      const wing = (dx, dy, w, h) => {
        oval(g, cx - 2 + dx, 7 + b + dy, w, h, wc);
        g.set(cx - 2 + dx, 7 + b + dy + 1, we);
      };
      if (flap) {
        wing(-6, -5, 6, 7);
        wing(-4, 1, 5, 5);
      } else {
        wing(-7, -1, 7, 5);
        wing(-5, 3, 5, 4);
      }
      // legs
      vline(g, cx - 1, 16 + b, 18 + b, FSKIN[0]);
      vline(g, cx + 1, 16 + b, 17 + b, FSKIN[1]);
      // dress
      S(g, DRESS, (m, c) => poly(m, [[cx - 1, 10 + b], [cx + 2, 10 + b], [cx + 4, 16 + b], [cx - 3, 16 + b]], c), { top: 1, bot: 1 });
      // head + hair
      sOval(g, cx - 3, 3 + b, 7, 7, FSKIN);
      S(g, HAIR, (m, c) => {
        oval(m, cx - 4, 1 + b, 8, 5, c);
        rect(m, cx - 4, 3 + b, 3, 5, c);
      }, { top: 1, bot: 1 });
      g.set(cx + 2, 6 + b, '#2a1030');
      g.set(cx + 3, 8 + b, '#ff9ab0');
      // arms
      if (p.anim === 'attack') {
        line(g, cx + 1, 11 + b, cx + 4, 7 + b - p.atk, FSKIN[1]);
      } else {
        line(g, cx + 1, 11 + b, cx + 3, 13 + b, FSKIN[1]);
      }
    },
    post(g, p) {
      const b = p.anim === 'idle' ? [0, -1, -1, 0][p.i] : -1;
      glowDot(g, 10, 10 + b, '#ffb0f0', 8, 0.18);
      if (p.anim === 'attack') {
        glowDot(g, 15, 6 + b - p.atk, '#8aff9a', 4, 0.6);
        sparkle(g, 15, 6 + b - p.atk, C('#8aff9a'), p.atk === 1);
      } else {
        const tr = [[3, 17], [6, 20], [2, 13]];
        const t = tr[p.i % 3];
        g.set(t[0], t[1] + b, '#fff0a0');
        g.set(tr[(p.i + 1) % 3][0], tr[(p.i + 1) % 3][1] + b, alpha('#ffb0f0', 0.7));
      }
    },
  });

  const LIGHT = [C('#3a4658'), C('#6a7a90'), C('#a8b8cc'), C('#eaf4ff')];
  def('drone_ally', {
    ground: false, w: 22, h: 18, face: 'R',
    anims: { idle: { n: 4, fps: 12 }, attack: { n: 2, fps: 6.6, once: true } },
    draw(g, p) {
      const cx = 11;
      const b = p.anim === 'idle' ? [0, -1, -1, 0][p.i] : 0;
      const L = p.anim === 'attack' && p.atk === 1 ? -1 : 0;
      const by = 6 + b;
      // rotor mast + blades
      vline(g, cx + L, by - 3, by, LIGHT[1]);
      const rb = p.anim === 'idle' ? p.i % 2 : p.atk;
      if (rb) hline(g, cx - 6 + L, cx + 6 + L, by - 4, LIGHT[2]);
      else hline(g, cx - 3 + L, cx + 3 + L, by - 4, LIGHT[3]);
      g.set(cx + L, by - 4, LIGHT[0]);
      // body
      S(g, LIGHT, (m, c) => poly(m, [[cx - 7 + L, by], [cx + 5 + L, by], [cx + 8 + L, by + 3], [cx + 6 + L, by + 7], [cx - 6 + L, by + 7]], c), { top: 1, bot: 2 });
      hline(g, cx - 5 + L, cx + 5 + L, by + 5, CYAN[0]);
      // gun
      sRect(g, cx + 3 + L, by + 7, 6, 2, LIGHT.slice(0, 3));
      // eye
      disc(g, cx + 3 + L, by + 3, 1.6, CYAN[1]);
      g.set(cx + 3 + L, by + 3, CYAN[2]);
      // skids
      hline(g, cx - 5 + L, cx + 1 + L, by + 9, LIGHT[1]);
      g.set(cx - 4 + L, by + 8, LIGHT[1]);
      g.set(cx + L, by + 8, LIGHT[1]);
    },
    post(g, p) {
      const b = p.anim === 'idle' ? [0, -1, -1, 0][p.i] : 0;
      if (p.anim === 'attack') {
        glowDot(g, 21, 14 + b, '#21e6ff', p.atk ? 3 : 2, 0.7);
        if (p.atk) sparkle(g, 20, 14 + b, CYAN[1]);
      }
    },
  });

  def('golem_ally', {
    w: 30, h: 30, face: 'R',
    anims: { idle: { n: 2, fps: 2.5 }, attack: { n: 2, fps: 6.6, once: true } },
    draw(g, p) {
      const cx = 14;
      const gy = 28;
      const ROCK = [C('#1e1414'), C('#3e2a26'), C('#66463c'), C('#946a58')];
      const raise = p.anim === 'attack' && p.atk === 0;
      const slam = p.anim === 'attack' && p.atk === 1;
      const b = p.anim === 'idle' ? p.bob : slam ? 1 : 0;
      // legs
      sRect(g, cx - 6, gy - 7, 5, 7, [ROCK[0], ROCK[1], ROCK[2]]);
      sRect(g, cx + 1, gy - 7, 5, 7, ROCK.slice(1));
      // back arm
      const bf = raise ? [cx - 6, 1] : [cx - 13, 15 + b];
      S(g, [ROCK[0], ROCK[0], ROCK[1], ROCK[2]], (m, c) => line(m, cx - 6, 10 + b, bf[0] + 3, bf[1] + 2, c, 4));
      sOval(g, bf[0], bf[1], 7, 7, [ROCK[0], ROCK[0], ROCK[1], ROCK[2]]);
      // body
      sOval(g, cx - 9, 5 + b, 18, 18, ROCK);
      crack(g, [[cx - 5, 9 + b], [cx - 2, 12 + b], [cx - 3, 16 + b]], LAVA[1], LAVA[2]);
      crack(g, [[cx + 3, 8 + b], [cx + 2, 11 + b], [cx + 5, 14 + b]], LAVA[0], LAVA[1]);
      disc(g, cx, 14 + b, 2, LAVA[1]);
      g.set(cx, 14 + b, '#fff8c8');
      // head
      sOval(g, cx - 3, 0 + b, 9, 7, ROCK);
      g.set(cx + 1, 3 + b, LAVA[2]);
      g.set(cx + 4, 3 + b, LAVA[2]);
      g.set(cx + 2, 5 + b, LAVA[0]);
      g.set(cx + 3, 5 + b, LAVA[0]);
      // front arm
      const ff = raise ? [cx + 3, 0] : slam ? [cx + 11, gy - 7] : [cx + 9, 15 + b];
      S(g, ROCK.slice(1), (m, c) => line(m, cx + 6, 10 + b, ff[0] + 3, ff[1] + 2, c, 4), { top: 1, bot: 1 });
      sOval(g, ff[0], ff[1], 8, 8, ROCK);
      g.set(ff[0] + 4, ff[1] + 3, LAVA[1]);
    },
    post(g, p) {
      const b = p.anim === 'idle' ? p.bob : 0;
      glowDot(g, 14, 14 + b, '#ff8a2a', 6, 0.22);
      if (p.anim === 'attack' && p.atk === 1) {
        for (const s of [[22, 27], [28, 26], [26, 23], [20, 24]]) g.set(s[0], s[1], s[1] % 2 ? '#ffd04a' : '#ff7a1a');
        puff(g, 27, 26, 1.6, 0.6);
      }
      if (p.anim === 'attack' && p.atk === 0) flame(g, 16, 3, 4, 4, 3);
    },
  });

  // ===================================================================== CHESTS (shared by the flying chest + icons)
  // style: { wood (4-tone), band, trim, lock (3-tone), gem?, crystal?, straps? }
  // Draws a 3/4-front treasure chest with an arched lid inside the box (x, y, w, h).
  function drawChest(g, x, y, w, h, st) {
    const lidH = Math.max(4, Math.round(h * 0.46));
    const arch = Math.max(1, Math.round(lidH * 0.42));
    const seam = y + lidH;
    const cxm = x + w / 2;
    const wood = st.wood;
    const band = st.band;
    const lidTop = (xx) => {
      const u = (xx + 0.5 - cxm) / (w / 2);
      return y + Math.round(arch * (1 - Math.sqrt(Math.max(0, 1 - u * u))));
    };
    // base (slightly inset under the lid lip)
    S(g, wood, (m, c) => rect(m, x + 1, seam, w - 2, h - lidH, c), { top: 0, bot: 1, left: 1, right: 1 });
    if (!st.crystal) {
      for (let yy = seam + 3; yy < y + h - 1; yy += 3) hline(g, x + 2, x + w - 3, yy, wood[1]);
    } else {
      for (let k = 0; k < 3; k++) line(g, x + 3 + k * Math.round(w / 3), y + h - 2, x + 5 + k * Math.round(w / 3), seam + 2, wood[3]);
    }
    hline(g, x + 1, x + w - 2, seam, wood[0]);
    // arched lid
    const lm = new Grid(g.w, g.h);
    for (let xx = x; xx < x + w; xx++) for (let yy = lidTop(xx); yy < seam; yy++) lm.set(xx, yy, MASK);
    shadeMask(g, lm, wood, { top: 1, bot: 1, left: 1, right: 1 });
    // cylindrical sheen + plank seams on the lid
    for (let xx = x + 2; xx < x + w - 2; xx++) {
      const t = lidTop(xx);
      if (t + 2 < seam - 1) g.set(xx, t + 2, st.crystal ? '#ffffff' : wood[3]);
      if (!st.crystal && h >= 14 && t + 4 < seam - 1) g.set(xx, t + 4, wood[1]);
    }
    // lid lip
    hline(g, x, x + w - 1, seam - 1, st.trim[1]);
    g.set(x, seam - 1, st.trim[0]);
    g.set(x + w - 1, seam - 1, st.trim[0]);
    for (let xx = x + 2; xx < x + w - 2; xx += 3) g.set(xx, seam - 1, st.trim[2]);
    // straps over lid + base, and edge caps
    const bw = Math.max(1, Math.round(w / 10));
    const strapXs = [x, x + w - bw];
    if (st.straps) strapXs.push(x + Math.round(w * 0.24), x + w - Math.round(w * 0.24) - bw);
    for (let si = 0; si < strapXs.length; si++) {
      const sx = strapXs[si];
      const sw = si >= 2 && bw > 2 ? bw - 1 : bw;
      for (let xx = sx; xx < sx + sw; xx++) {
        const top = lidTop(xx);
        for (let yy = top; yy < y + h; yy++) {
          if (yy === seam - 1) continue;
          g.set(xx, yy, xx === sx ? band[2] : xx === sx + sw - 1 && sw > 1 ? band[0] : band[1]);
        }
      }
      if (w >= 16) for (let yy = seam + 2; yy < y + h - 1; yy += 3) g.set(sx + Math.floor(sw / 2), yy, band[2]);
    }
    hline(g, x + 1, x + w - 2, y + h - 1, band[0]);
    // lock plate hanging over the seam
    const lw = Math.max(3, Math.round(w * 0.2) | 1);
    const lh = Math.max(4, Math.round(h * 0.36));
    const lx = Math.round(cxm - lw / 2);
    const ly = seam - Math.max(1, Math.round(lh * 0.35));
    S(g, st.lock, (m, c) => {
      rect(m, lx, ly, lw, lh, c);
      m.clear(lx, ly + lh - 1);
      m.clear(lx + lw - 1, ly + lh - 1);
    }, { top: 1, bot: 1, left: 1, right: 1 });
    const kx = lx + Math.floor(lw / 2);
    if (st.gem) {
      g.set(kx, ly + 1, st.gem[2]);
      g.set(kx, ly + 2, st.gem[1]);
      if (lw >= 5) {
        g.set(kx - 1, ly + 2, st.gem[1]);
        g.set(kx + 1, ly + 2, st.gem[0]);
        g.set(kx, ly + 3, st.gem[0]);
      }
    } else {
      g.set(kx, ly + Math.floor(lh / 2) - 1, '#1a1008');
      g.set(kx, ly + Math.floor(lh / 2), '#1a1008');
    }
    return { lidH, seam };
  }
  const CHEST_WOOD = [C('#3a1e10'), C('#6a3a1c'), C('#9a5a2a'), C('#c8844a')];
  const CHEST_BASIC = { wood: CHEST_WOOD, band: R3('#3e424e', '#6e7482', '#b0b8c4'), trim: R3('#5a3a1c', '#8a5a2e', '#c08a54'), lock: R3('#7a5a1e', '#d4a838', '#ffe68a'), straps: false };

  def('flying_chest', {
    w: 36, h: 26, face: 'R', anchor: 'c',
    anims: { fly: { n: 4, fps: 10 } },
    draw(g, p) {
      const FEATH = R3('#8a9ac0', '#dce6f8', '#ffffff');
      const cx = 18;
      const ph = p.i % 4;
      const b = [1, 0, -1, 0][ph];
      const tip = [-9, -3, 5, -2][ph];
      const by = 12 + b;
      const wing = (s) => {
        const root = [cx + s * 6, by + 1];
        const pts = [root, [cx + s * 10, by + tip * 0.5 - 3], [cx + s * 17, by + tip - 1], [cx + s * 16, by + tip + 3], [cx + s * 14, by + tip * 0.6 + 4], [cx + s * 12, by + tip * 0.4 + 6], [cx + s * 8, by + 6]];
        S(g, FEATH, (m, c) => poly(m, pts, c), { top: 1, bot: 1 });
        // feather separations
        line(g, root[0] + s, root[1] + 2, cx + s * 14, by + tip * 0.6 + 3, FEATH[0]);
        line(g, root[0] + s, root[1] + 3, cx + s * 11, by + tip * 0.4 + 5, FEATH[0]);
      };
      wing(-1);
      wing(1);
      drawChest(g, cx - 7, by - 4, 14, 11, Object.assign({}, CHEST_BASIC, { straps: false }));
    },
    post(g, p) {
      const b = [1, 0, -1, 0][p.i % 4];
      const sp = [[5, 4], [31, 6], [9, 21], [28, 20]];
      const s = sp[p.i % 4];
      sparkle(g, s[0], s[1] + b, C('#ffe68a'), false);
      g.set(sp[(p.i + 2) % 4][0], sp[(p.i + 2) % 4][1], '#fff6c0');
    },
  });

  // ===================================================================== PROJECTILES (authored pointing right, mirrored to fly left)
  def('proj_arrow', {
    w: 16, h: 7, face: 'L', anchor: 'c',
    anims: { fly: { n: 1, fps: 1 } },
    draw(g) {
      hline(g, 3, 11, 3, '#8a5a2e');
      hline(g, 4, 10, 3, '#b07a42');
      // head
      poly(g, [[11, 1], [15, 3.5], [11, 6]], '#c8d0dc');
      g.set(12, 3, '#ffffff');
      // fletching
      g.set(1, 2, '#e8e0d0');
      g.set(2, 2, '#e8e0d0');
      g.set(1, 4, '#c84a3a');
      g.set(2, 4, '#c84a3a');
      g.set(3, 2, '#e8e0d0');
      g.set(3, 4, '#c84a3a');
    },
  });
  def('proj_fireball', {
    w: 18, h: 13, face: 'L', anchor: 'c', ol: '#4a0a04',
    anims: { fly: { n: 3, fps: 14 } },
    draw(g, p) {
      // trail
      for (let k = 0; k < 4; k++) {
        const x = 9 - k * 2;
        const r = 3.4 - k * 0.7;
        disc(g, x, 6 + ((k + p.i) % 2 ? 0 : (k % 2 ? 1 : -1)) * (k > 0 ? 1 : 0), r, k < 2 ? FIRE[1] : FIRE[0]);
      }
      disc(g, 12, 6, 4, FIRE[0]);
      disc(g, 12, 6, 3.2, FIRE[1]);
      disc(g, 12, 6, 2.2, FIRE[2]);
      disc(g, 13, 5, 1, FIRE[3]);
      g.set(14, 5, '#ffffff');
    },
    post(g, p) {
      const r = rng(5 + p.i * 3);
      for (let k = 0; k < 3; k++) g.set(Math.round(1 + r() * 6), Math.round(3 + r() * 6), k % 2 ? '#ffd84a' : '#ff8a1a');
    },
  });
  def('proj_spit', {
    w: 14, h: 10, face: 'L', anchor: 'c', ol: '#0e3a14',
    anims: { fly: { n: 2, fps: 8 } },
    draw(g, p) {
      const SP = [C('#1e7a2e'), C('#4ad84a'), C('#b4ff7a')];
      const wob = p.i;
      oval(g, 6 - wob, 2 + wob, 7 + wob, 6 - wob, SP[1]);
      disc(g, 10, 5, 2.4, SP[1]);
      oval(g, 7, 3, 4, 3, SP[2]);
      g.set(11, 4, '#ffffff');
      g.set(9, 7, SP[0]);
      g.set(3, 4 + wob, SP[1]);
      g.set(1, 5 - wob, SP[0]);
    },
  });
  def('proj_bolt', {
    w: 18, h: 11, face: 'L', anchor: 'c', ol: '#3a1e04',
    anims: { fly: { n: 3, fps: 14 } },
    draw(g, p) {
      // elongated amber energy slug in a brass collar
      oval(g, 6, 3, 10, 5, '#c8701a');
      oval(g, 7, 4, 8, 3, '#ffb02e');
      hline(g, 9, 14, 5, '#fff4c0');
      g.set(15, 5, '#ffffff');
      vline(g, 7, 3, 7, '#c8962e');
      vline(g, 8, 3, 7, '#f2d27a');
    },
    post(g, p) {
      // crackling arcs + steam trail
      const arcs = [[[10, 2], [12, 1], [13, 3]], [[11, 8], [13, 9], [15, 8]], [[9, 1], [11, 0]]];
      const a = arcs[p.i % 3];
      for (let k = 0; k + 1 < a.length; k++) line(g, a[k][0], a[k][1], a[k + 1][0], a[k + 1][1], alpha('#bff4ff', 0.9));
      puff(g, 3 - (p.i % 2), 5, 1.5, 0.42);
      g.set(1, 4 + (p.i === 1 ? 1 : 0), alpha(STEAM[1], 0.3));
      glowDot(g, 11, 5, '#ffb02e', 4, 0.3);
    },
  });
  const ROCK = gridFrom(['..aab..', '.abbBa.', 'abbBBba', 'abcbbba', 'aabbbca', '.aaabb.', '..aaa..'], { a: '#4e463e', b: '#867c70', B: '#c4bcae', c: '#3a332c' });
  def('proj_rock', {
    w: 12, h: 12, face: 'L', anchor: 'c',
    anims: { fly: { n: 4, fps: 12 } },
    draw(g, p) {
      let r = ROCK;
      for (let k = 0; k < p.i; k++) r = rotCW(r);
      blit(g, r, 2, 2);
    },
  });

  def('proj_laser', {
    w: 18, h: 5, face: 'L', anchor: 'c', ol: false,
    anims: { fly: { n: 2, fps: 16 } },
    draw(g, p) {
      for (let x = 0; x < 18; x++) {
        const fade = x < 4 ? (x + 1) / 5 : 1;
        g.set(x, 1, alpha(MAG[1], 0.55 * fade));
        g.set(x, 3, alpha(MAG[1], 0.55 * fade));
        g.set(x, 2, alpha(x > 2 ? '#ffffff' : MAG[2], fade));
      }
      g.set(17, p.i ? 1 : 3, alpha('#ffffff', 0.8));
      g.set(16, 0, alpha(MAG[2], p.i ? 0.7 : 0));
      g.set(16, 4, alpha(MAG[2], p.i ? 0 : 0.7));
    },
  });
  def('proj_orb', {
    w: 14, h: 14, face: 'L', anchor: 'c', ol: '#12062a',
    anims: { fly: { n: 3, fps: 10 } },
    draw(g, p) {
      const r = [4, 4.5, 4.2][p.i];
      disc(g, 7, 7, r, '#3a1a7a');
      disc(g, 7, 7, r - 1, '#7a4adc');
      disc(g, 6, 6, r - 2.4, '#c8a8ff');
      g.set(6, 6, '#ffffff');
      g.set(9, 9, '#12062a');
      g.set(8, 9, '#12062a');
    },
    post(g, p) {
      glowDot(g, 7, 7, '#b48aff', 7, 0.3);
      const k = p.i;
      g.set(2 + k, 3, '#ffffff');
      g.set(12 - k, 11, '#d8c8ff');
    },
  });
  // ===================================================================== EFFECTS
  function noise1(seed) {
    const r = rng(seed);
    const v = [];
    for (let i = 0; i < 16; i++) v.push(r());
    return (a) => {
      const t = (((a / (Math.PI * 2)) % 1) + 1) % 1 * 16;
      const i = Math.floor(t);
      const f = t - i;
      return v[i % 16] * (1 - f) + v[(i + 1) % 16] * f;
    };
  }
  def('fx_explosion', {
    w: 40, h: 40, face: 'R', anchor: 'c', ol: false,
    anims: { play: { n: 7, fps: 20, once: true } },
    draw(g, p) {
      const cx = 20;
      const cy = 20;
      const n = noise1(77 + p.i);
      const SMOKE = [C('#2a2230'), C('#4a4050'), C('#6e6474')];
      const R = [4, 8, 12, 15, 16, 17, 18][p.i];
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 40; x++) {
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - cy;
          const d = Math.hypot(dx, dy);
          const a = Math.atan2(dy, dx);
          const rr = R * (0.82 + 0.3 * n(a));
          if (d > rr) continue;
          const k = d / rr;
          let c = null;
          if (p.i <= 1) c = k < 0.5 ? '#ffffff' : k < 0.8 ? FIRE[3] : FIRE[2];
          else if (p.i === 2) c = k < 0.3 ? FIRE[3] : k < 0.6 ? FIRE[2] : k < 0.85 ? FIRE[1] : FIRE[0];
          else if (p.i === 3) c = k < 0.25 ? FIRE[2] : k < 0.55 ? FIRE[1] : k < 0.78 ? FIRE[0] : SMOKE[1];
          else if (p.i === 4) c = k < 0.4 ? (k < 0.2 ? FIRE[1] : FIRE[0]) : k > 0.6 && k < 0.95 ? SMOKE[k < 0.75 ? 2 : 1] : null;
          else if (p.i === 5) c = k > 0.7 && k < 1 ? alpha(SMOKE[k < 0.85 ? 2 : 1], 0.8) : null;
          else c = k > 0.84 && n(a * 3) > 0.45 ? alpha(SMOKE[1], 0.5) : null;
          if (c !== null) g.set(x, y, c);
        }
      }
      if (p.i >= 3) {
        const r = rng(91 + p.i);
        for (let k = 0; k < 8; k++) {
          const a = r() * Math.PI * 2;
          const d = R * (0.6 + r() * 0.5);
          g.set(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), k % 2 ? FIRE[2] : FIRE[1]);
        }
      }
      if (p.i === 0) glowDot(g, cx, cy, '#ffd84a', 8, 0.6);
    },
  });
  def('fx_slash', {
    w: 32, h: 32, face: 'R', anchor: 'c', ol: false,
    anims: { play: { n: 4, fps: 20, once: true } },
    draw(g, p) {
      const cx = 14;
      const cy = 18;
      const span = [[-150, -90], [-150, 10], [-110, 20], [-40, 25]][p.i];
      const thick = [2, 4, 3, 1][p.i];
      const fade = [0.9, 1, 0.75, 0.45][p.i];
      for (let a = span[0]; a <= span[1]; a += 1.5) {
        const k = (a - span[0]) / Math.max(1, span[1] - span[0]);
        const t = Math.max(1, Math.round(thick * Math.sin(Math.PI * Math.min(1, k * 1.1))));
        for (let r = 13 - t; r <= 13; r++) {
          const [dx, dy] = rotPoint(r, 0, a + 90);
          const x = Math.round(cx + dx);
          const y = Math.round(cy + dy);
          g.set(x, y, alpha(r === 13 ? '#9fd8ff' : '#ffffff', fade));
        }
      }
    },
  });
  def('fx_lightning', {
    w: 24, h: 76, face: 'R', ol: false,
    anims: { play: { n: 4, fps: 16 } },
    draw(g, p) {
      const r = rng(311 + p.i * 7);
      const pts = [];
      let x = 12;
      for (let y = 0; y <= 72; y += 6) {
        pts.push([x, y]);
        x = Math.max(4, Math.min(19, x + Math.round((r() - 0.5) * 10)));
      }
      pts[pts.length - 1] = [12, 72];
      const core = p.i === 3 ? alpha('#ffffff', 0.6) : '#ffffff';
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        line(g, a[0] - 1, a[1], b[0] - 1, b[1], alpha('#5ac8ff', p.i === 3 ? 0.35 : 0.7));
        line(g, a[0] + 1, a[1], b[0] + 1, b[1], alpha('#5ac8ff', p.i === 3 ? 0.35 : 0.7));
        line(g, a[0], a[1], b[0], b[1], core);
      }
      // branch
      if (p.i < 3) {
        const bi = 3 + p.i * 2;
        const a = pts[bi];
        line(g, a[0], a[1], a[0] + (p.i % 2 ? 6 : -6), a[1] + 8, alpha('#bfeaff', 0.85));
      }
      // impact
      if (p.i < 3) {
        glowDot(g, 12, 72, '#7fd8ff', 6, 0.6);
        for (const s of [[7, 73], [17, 72], [9, 69], [15, 69]]) g.set(s[0] + (p.i % 2), s[1], '#e8faff');
      }
    },
  });
  const ICE = R3('#3a8ad0', '#9ae2ff', '#f0ffff');
  def('fx_frost', {
    w: 38, h: 34, face: 'R', ol: false,
    anims: { play: { n: 6, fps: 14, once: true } },
    draw(g, p) {
      const cx = 19;
      const gy = 32;
      const EDGE = C('#1e4a8a');
      const grow = [0.25, 0.6, 1, 1, 1, 0][p.i];
      // frost ring on the ground
      if (p.i < 5) {
        const rx = [6, 12, 16, 17, 17][p.i];
        oval(g, cx - rx, gy - 3, rx * 2, 5, alpha('#bff0ff', 0.45));
        hline(g, cx - rx + 2, cx + rx - 2, gy - 1, alpha('#e8fbff', 0.6));
      }
      const shards = [[-12, 9, -18], [-6, 16, -8], [0, 24, 0], [6, 17, 10], [12, 10, 20], [-3, 11, -4], [4, 12, 6]];
      if (p.i <= 4) {
        for (const s of shards) {
          const h = Math.round(s[1] * grow);
          if (h < 2) continue;
          const w = Math.max(2, Math.round(s[1] / 4));
          const bx = cx + s[0];
          const tip = [bx + Math.round((s[2] / 30) * h), gy - h];
          const m = new Grid(g.w, g.h);
          poly(m, [[bx - w, gy], [tip[0] + 0.5, tip[1]], [bx + w, gy]], MASK);
          shadeMask(g, m, ICE, { top: 1, bot: 0, left: 1, right: 1 });
          line(g, bx, gy - 1, tip[0], tip[1] + 1, ICE[2]);
          // dark rim on the shadow side
          for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (m.get(x, y) && !m.get(x + 1, y)) g.set(x, y, EDGE);
          if (p.i === 4) {
            line(g, bx - 1, gy - Math.round(h * 0.3), bx + 1, gy - Math.round(h * 0.6), '#ffffff');
          }
        }
      }
      if (p.i >= 3) {
        const r = rng(51 + p.i);
        const n = p.i === 5 ? 10 : 5;
        for (let k = 0; k < n; k++) {
          const x = Math.round(cx - 16 + r() * 32);
          const y = Math.round(gy - 4 - r() * (p.i === 5 ? 22 : 26));
          if (p.i === 5) {
            g.set(x, y, ICE[1]);
            g.set(x + 1, y, ICE[2]);
            g.set(x, y + 1, EDGE);
          } else sparkle(g, x, y, C('#bff0ff'));
        }
      }
    },
  });
  def('fx_meteor', {
    w: 32, h: 42, face: 'R', anchor: 'c',
    anims: { fall: { n: 3, fps: 12 } },
    draw(g, p) {
      const rx = 9;
      const ry = 30;
      // fire trail streaming up-right
      for (let k = 9; k >= 0; k--) {
        const t = k / 9;
        const x = rx + 3 + t * 18 + ((k + p.i) % 2 ? 1 : 0);
        const y = ry - 2 - t * 26;
        const r = 5.2 - t * 3.8;
        disc(g, Math.round(x), Math.round(y), r, t > 0.6 ? FIRE[0] : t > 0.3 ? FIRE[1] : FIRE[2]);
      }
      // rock
      sOval(g, rx - 5, ry - 6, 12, 12, [C('#1e1612'), C('#3e2e24'), C('#6a5040'), C('#9a7a60')]);
      crack(g, [[rx - 2, ry - 3], [rx + 1, ry], [rx + 3, ry - 1]], LAVA[1], LAVA[2]);
      crack(g, [[rx - 3, ry + 2], [rx, ry + 3]], LAVA[0]);
    },
    post(g, p) {
      glowDot(g, 12, 27, '#ff9a2a', 9, 0.35);
      const r = rng(3 + p.i);
      for (let k = 0; k < 4; k++) g.set(Math.round(14 + r() * 16), Math.round(2 + r() * 24), k % 2 ? '#ffd84a' : '#ff7a1a');
    },
  });
  const BLADE = (() => {
    const g = new Grid(19, 19);
    const c = 9;
    const STEELR = [C('#3a4256'), C('#6a7488'), C('#c8d2e0'), C('#ffffff')];
    for (let k = 0; k < 4; k++) {
      const m = new Grid(19, 19);
      poly(m, [[c - 1.5, c - 0.5], [c + 1.8, c - 1.5], [c + 4.2, c - 5.5], [c + 2.2, c - 9], [c - 0.6, c - 5.5]], MASK);
      let mm = m;
      for (let q = 0; q < k; q++) mm = rotCW(mm);
      shadeMask(g, mm, STEELR, { top: 1, bot: 1, left: 1, right: 1 });
    }
    disc(g, c, c, 2.2, '#3a4256');
    disc(g, c, c, 1.2, '#c8962e');
    g.set(c, c, '#ffe68a');
    return g;
  })();
  def('fx_blade', {
    w: 22, h: 22, face: 'R', anchor: 'c',
    anims: { spin: { n: 4, fps: 16 } },
    draw(g, p) {
      place(g, BLADE, p.i * 22.5, 9, 9, 11, 11);
    },
    post(g, p) {
      for (let a = 0; a < 360; a += 90) {
        for (let k = 1; k <= 3; k++) {
          const [dx, dy] = rotPoint(0, -9, a + p.i * 22.5 - 12 * k);
          const x = Math.round(11 + dx);
          const y = Math.round(11 + dy);
          if (!g.solid(x, y)) g.set(x, y, alpha('#e8f4ff', 0.6 - k * 0.15));
        }
      }
    },
  });
  def('fx_heal', {
    w: 28, h: 36, face: 'R', ol: false,
    anims: { play: { n: 6, fps: 12, once: true } },
    draw(g, p) {
      const HG = R3('#1e9a4a', '#5aff8a', '#e0ffe8');
      const t = p.i / 5;
      // rising glow column
      for (let y = 6; y < 36; y++) {
        const k = (y - 6) / 30;
        const a = (1 - t) * 0.35 * k;
        if (a <= 0.02) continue;
        for (let x = 6; x < 22; x++) {
          const e = 1 - Math.abs(x - 13.5) / 8;
          if (e > 0) g.set(x, y, alpha(HG[1], a * e));
        }
      }
      const cross = (x, y, s, a) => {
        const c = alpha(HG[1], a);
        const w = alpha(HG[2], a);
        if (s >= 2) {
          rect(g, x - 1, y - 3, 3, 7, c);
          rect(g, x - 3, y - 1, 7, 3, c);
          vline(g, x, y - 2, y + 2, w);
          hline(g, x - 2, x + 2, y, w);
        } else {
          vline(g, x, y - 1, y + 1, c);
          hline(g, x - 1, x + 1, y, c);
          g.set(x, y, w);
        }
      };
      const items = [[13, 30, 2, 0], [6, 28, 1, 0.15], [21, 27, 1, 0.3], [9, 32, 1, 0.45], [18, 33, 2, 0.35]];
      for (const it of items) {
        const life = t - it[3];
        if (life < 0) continue;
        const y = Math.round(it[1] - life * 26);
        const a = Math.max(0, Math.min(1, 1.25 - life * 1.4));
        if (a > 0.05 && y > 2) cross(it[0], y, it[2], a);
      }
      if (p.i < 5) {
        const r = rng(13 + p.i);
        for (let k = 0; k < 4; k++) g.set(Math.round(5 + r() * 18), Math.round(8 + r() * 26), alpha('#ffffff', 0.85));
      }
    },
  });
  def('coin', {
    w: 10, h: 10, face: 'R', anchor: 'c', ol: '#3a2008',
    anims: { spin: { n: 6, fps: 12 } },
    draw(g, p) {
      const GC = [C('#8a5a10'), C('#d89a20'), C('#ffd84a'), C('#fff6c0')];
      const wd = [8, 6, 2, 1, 2, 6][p.i];
      const x = 5 - wd / 2;
      if (wd <= 2) {
        rect(g, 4, 1, Math.max(1, wd), 8, GC[1]);
        vline(g, 4, 2, 7, GC[3]);
        return;
      }
      sOval(g, x, 1, wd, 8, GC);
      if (wd === 8) {
        ring(g, 4.5, 4.5, 2.4, 3.1, GC[1]);
        vline(g, 4, 3, 6, GC[0]);
        g.set(5, 3, GC[0]);
        g.set(3, 6, GC[0]);
        g.set(2, 2, GC[3]);
      } else if (wd >= 6) {
        vline(g, 4, 3, 6, GC[0]);
        g.set(3, 2, GC[3]);
      }
    },
  });

  // ===================================================================== ITEM ICONS (24×24 art → 48×48)
  const ERA_MAT = [
    {
      // medieval: iron, leather, bronze, ruby
      metal: R3('#4e5866', '#8c96a4', '#dce2ea'), dark: R3('#2a2e38', '#454c58', '#6a7380'),
      accent: R3('#4e3018', '#8c5c34', '#c08a54'), trim: R3('#7a5426', '#c08a3a', '#f0cc78'),
      gem: R3('#7a1420', '#d83a3a', '#ff9a8a'), glow: null,
    },
    {
      // arcane: blue-violet steel, silver, cyan runes
      metal: R3('#30307a', '#5a62c0', '#aab4f4'), dark: R3('#1a1a46', '#2c2a6a', '#46489a'),
      accent: R3('#1e2862', '#344694', '#5a78cc'), trim: R3('#767e9c', '#c4ccdc', '#f6f8ff'),
      gem: R3('#127a8a', '#3ae0f0', '#d0fcff'), glow: '#5ef3ff',
    },
    {
      // infernal: obsidian, ember, flame
      metal: R3('#1c1418', '#3c2e34', '#6a5862'), dark: R3('#0e0a0c', '#1e1418', '#30242a'),
      accent: R3('#8a1e0c', '#e8561a', '#ffb848'), trim: R3('#5a1a10', '#a8341c', '#e8703a'),
      gem: R3('#a01010', '#ff4a1a', '#ffe08a'), glow: '#ff7a1a',
    },
    {
      // steampunk: brass, copper, iron, leather, teal glass
      metal: R3('#7a5a1c', '#c8962e', '#f4d67e'), dark: R3('#2a2c34', '#4a4e5a', '#7a808e'),
      accent: R3('#6e3418', '#b8642e', '#ecaa6c'), trim: R3('#4a2a18', '#7a4a2a', '#a8703a'),
      gem: R3('#1e6a66', '#4ab8a8', '#c8f4e4'), glow: '#ffb02e',
    },
    {
      // cyber: dark chrome, neon cyan, magenta
      metal: R3('#1e2232', '#3e4660', '#8a96bc'), dark: R3('#0e1018', '#1a1e2c', '#2c3248'),
      accent: R3('#0a6a8a', '#21e6ff', '#d0fcff'), trim: R3('#8a1a6c', '#ff2ec4', '#ffa8ea'),
      gem: R3('#8a1a6c', '#ff2ec4', '#ffb8ee'), glow: '#21e6ff',
    },
    {
      // cosmic: deep indigo, star gold, violet gems, starlight
      metal: R3('#24186a', '#4a3aa8', '#8e80f4'), dark: R3('#0e0a2a', '#1a1240', '#2c2068'),
      accent: R3('#8a6a1a', '#e8c040', '#fff4b0'), trim: R3('#8a6a1a', '#e8c040', '#fff4b0'),
      gem: R3('#6a1a9a', '#d070ff', '#f8e0ff'), glow: '#d0b0ff', stars: true,
    },
  ];
  // shaded thick segment
  function bar(g, a, b, w, rp, o) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    const nx = (-dy / L) * (w / 2);
    const ny = (dx / L) * (w / 2);
    sPoly(g, [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], rp, o || { top: 1, bot: 1, left: 1, right: 1 });
  }
  // pointed blade polygon from base B to tip T with half-width hw
  function bladePoly(g, B, T, hw, rp, tipLen) {
    const dx = T[0] - B[0];
    const dy = T[1] - B[1];
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L;
    const uy = dy / L;
    const nx = -uy * hw;
    const ny = ux * hw;
    const tl = tipLen === undefined ? hw * 2 : tipLen;
    const s0 = [T[0] - ux * tl, T[1] - uy * tl];
    sPoly(g, [[B[0] + nx, B[1] + ny], [s0[0] + nx, s0[1] + ny], T, [s0[0] - nx, s0[1] - ny], [B[0] - nx, B[1] - ny]], rp, { top: 1, bot: 1, left: 1, right: 1 });
  }
  function starSpecks(g, m, seed, n) {
    const r = rng(seed);
    let placed = 0;
    for (let k = 0; k < 200 && placed < n; k++) {
      const x = Math.floor(r() * g.w);
      const y = Math.floor(r() * g.h);
      if (m.get(x, y) && m.get(x + 1, y) && m.get(x - 1, y) && m.get(x, y - 1) && m.get(x, y + 1)) {
        g.set(x, y, placed % 3 === 0 ? '#ffffff' : '#c8b8ff');
        placed++;
      }
    }
  }
  function gemAt(g, x, y, rp, big) {
    if (big) {
      rect(g, x - 1, y - 1, 3, 3, rp[1]);
      g.set(x - 1, y - 1, rp[2]);
      g.set(x, y - 1, rp[2]);
      g.set(x + 1, y + 1, rp[0]);
      g.set(x, y + 1, rp[0]);
    } else {
      g.set(x, y, rp[1]);
      g.set(x, y - 1, rp[2]);
    }
  }

  const ITEM_ART = {
    weapon(g, e, M) {
      if (e === 2) {
        // Hellfire cleaver: broad cleaver blade on a short haft, ember edge, flames off the spine
        bar(g, [2, 22], [8, 16], 2.6, M.dark);
        for (let k = 0; k < 3; k++) g.set(3 + k * 2, 20 - k * 2, M.trim[1]);
        sRect(g, 1, 21, 3, 2, M.trim);
        const blade = [[7, 14], [17, 4], [22, 9], [12, 19]];
        sPoly(g, blade, M.metal, { top: 1, bot: 1, left: 1, right: 1 });
        line(g, 8, 14, 17, 5, M.metal[2]);
        line(g, 12, 18, 21, 9, M.accent[1]);
        line(g, 13, 18, 22, 9, M.accent[2]);
        crack(g, [[11, 13], [13, 13], [15, 11]], M.accent[0], M.accent[1]);
        disc(g, 17, 9, 1.2, '#0a0608');
        g.set(16, 8, M.accent[0]);
        return () => {
          flame(g, 9, 11, 3, 4, 3, FIRE);
          flame(g, 12, 8, 3, 5, 5, FIRE);
          flame(g, 15, 5, 3, 4, 8, FIRE);
        };
      }
      if (e === 3) {
        // steam saber: curved blade, brass knuckle-bow guard, copper pressure tank
        const m = new Grid(24, 24);
        for (let i = 0; i <= 24; i++) {
          const t = i / 24;
          const x = (1 - t) * (1 - t) * 8 + 2 * (1 - t) * t * 12 + t * t * 21;
          const y = (1 - t) * (1 - t) * 15 + 2 * (1 - t) * t * 5 + t * t * 2;
          disc(m, Math.round(x), Math.round(y), 1.7 - t * 1.3, MASK);
        }
        shadeMask(g, m, R3('#5a6670', '#b4c0c8', '#f4f8fc'), { top: 1, bot: 1, left: 1, right: 1 });
        bar(g, [5, 14], [11, 18], 2.2, M.metal);
        line(g, 5, 15, 2, 20, M.metal[1]);
        line(g, 2, 20, 4, 22, M.metal[1]);
        bar(g, [7, 17], [3, 21], 2.2, M.trim);
        sRect(g, 9, 18, 4, 3, M.accent);
        g.set(10, 19, '#e8e0d0');
        g.set(11, 19, '#c83a2a');
        return () => {
          puff(g, 14, 19, 1.3, 0.75);
          puff(g, 16, 17, 1, 0.55);
        };
      }
      if (e === 4) {
        // plasma katana
        bladePoly(g, [7, 16], [21, 2], 1.3, [M.accent[1], M.accent[1], M.accent[2]], 2);
        line(g, 8, 15, 19, 4, '#ffffff');
        sRect(g, 5, 15, 4, 4, M.metal);
        bar(g, [6, 17], [2, 21], 2.4, M.dark);
        for (let k = 0; k < 3; k++) g.set(5 - k, 18 + k, M.trim[1]);
        g.set(2, 21, M.metal[2]);
        return () => {
          for (let k = 0; k < 14; k++) {
            g.set(8 + k, 13 - k, alpha(M.accent[1], 0.35));
            g.set(10 + k, 16 - k, alpha(M.accent[1], 0.25));
          }
        };
      }
      const wide = e === 1 ? 2.2 : e === 5 ? 2.5 : 1.7;
      bladePoly(g, [7, 16], [21, 2], wide, M.metal, wide * 1.8);
      if (e === 0) line(g, 9, 14, 18, 5, M.metal[0]);
      if (e === 1) {
        for (let k = 0; k < 5; k++) {
          g.set(9 + k * 2, 13 - k * 2, M.gem[1]);
          g.set(10 + k * 2, 13 - k * 2, M.gem[2]);
        }
      }
      if (e === 5) {
        const m = new Grid(24, 24);
        poly(m, [[7, 14], [19, 2], [21, 4], [9, 16]], MASK);
        starSpecks(g, m, 5, 5);
      }
      // guard
      bar(g, [3, 13], [10, 20], e === 1 ? 2.6 : 2.2, M.trim);
      if (e === 1) {
        g.set(2, 11, M.trim[2]);
        g.set(11, 21, M.trim[1]);
        gemAt(g, 6, 17, M.gem);
      }
      if (e === 5) {
        g.set(2, 12, M.trim[2]);
        g.set(1, 11, M.trim[2]);
        g.set(11, 21, M.trim[1]);
        g.set(12, 22, M.trim[1]);
      }
      // grip + pommel
      bar(g, [6, 17], [3, 20], 2.2, e === 0 ? M.accent : M.dark);
      if (e === 5) {
        const sx = 2;
        const sy = 21;
        rect(g, sx - 1, sy, 3, 1, M.trim[1]);
        rect(g, sx, sy - 1, 1, 3, M.trim[1]);
        g.set(sx, sy, M.gem[2]);
      } else {
        disc(g, 2, 21, 1.4, M.trim[1]);
        g.set(2, 21, M.gem[1]);
        g.set(1, 20, M.trim[2]);
      }
      return null;
    },
    helmet(g, e, M) {
      if (e === 3) {
        // aviator cap + brass goggles
        S(g, M.trim, (m, c) => {
          oval(m, 4, 3, 16, 16, c);
          rect(m, 4, 11, 4, 9, c);
          rect(m, 16, 11, 4, 9, c);
        }, { top: 1, bot: 1, left: 1, right: 1 });
        for (let y = 15; y < 22; y++) for (let x = 8; x < 16; x++) g.clear(x, y);
        hline(g, 4, 19, 11, M.accent[0]);
        hline(g, 4, 19, 10, M.accent[1]);
        for (const gx of [8, 15]) {
          disc(g, gx, 10, 3.2, M.metal[1]);
          disc(g, gx, 10, 2.2, M.gem[1]);
          g.set(gx - 1, 9, M.gem[2]);
          g.set(gx, 9, '#ffffff');
        }
        hline(g, 11, 12, 10, M.metal[2]);
        line(g, 6, 5, 9, 4, M.trim[2]);
        return null;
      }
      const dome = e === 4 ? M.metal : e === 2 ? M.metal : M.metal;
      // horns / wings behind
      if (e === 2) {
        for (const s of [-1, 1]) {
          const bx = 12 + s * 6;
          sPoly(g, [[bx, 9], [bx + s * 4, 7], [bx + s * 6, 1], [bx + s * 4, 2], [bx + s * 2, 6]], R3('#5a4a3a', '#d8c8b0', '#fff4e0'));
          g.set(bx + s * 6 - (s > 0 ? 1 : 0), 1, M.accent[1]);
          g.set(bx + s * 5 - (s > 0 ? 1 : 0), 2, M.accent[0]);
        }
      }
      if (e === 1) {
        for (const s of [-1, 1]) {
          const bx = s > 0 ? 19 : 4;
          sPoly(g, [[bx, 11], [bx + s * 4, 3], [bx + s * 4, 7], [bx + s * 3, 9], [bx + s * 2, 12]], M.trim);
          g.set(bx + s * 3, 6, M.trim[0]);
        }
      }
      // dome
      S(g, dome, (m, c) => {
        oval(m, 5, 3, 14, 15, c);
        rect(m, 5, 11, 14, 8, c);
      }, { top: 1, bot: 1, left: 1, right: 1 });
      if (e === 0) {
        // nasal helm: face opening + nasal bar + bronze band
        rect(g, 7, 13, 10, 6, '#1a1620');
        S(g, M.metal, (m, c) => rect(m, 11, 10, 2, 8, c));
        hline(g, 5, 18, 10, M.trim[1]);
        hline(g, 5, 18, 11, M.trim[0]);
        vline(g, 12, 4, 9, M.trim[1]);
        for (const x of [7, 16]) g.set(x, 10, M.trim[2]);
      } else if (e === 1) {
        rect(g, 7, 13, 10, 2, '#0e0c24');
        rect(g, 11, 13, 2, 5, '#0e0c24');
        hline(g, 5, 18, 10, M.trim[1]);
        gemAt(g, 12, 7, M.gem, true);
      } else if (e === 2) {
        rect(g, 7, 12, 10, 2, '#120808');
        line(g, 7, 11, 10, 13, '#120808');
        line(g, 16, 11, 13, 13, '#120808');
        g.set(8, 12, M.accent[2]);
        g.set(15, 12, M.accent[2]);
        g.set(9, 12, M.accent[1]);
        g.set(14, 12, M.accent[1]);
        crack(g, [[9, 5], [11, 8], [10, 10]], M.accent[0], M.accent[1]);
        for (const x of [6, 9, 12, 15]) g.set(x + 1, 18, M.accent[1]);
      } else if (e === 4) {
        S(g, M.accent, (m, c) => rect(m, 5, 10, 14, 4, c), { top: 1, bot: 1 });
        hline(g, 6, 17, 11, '#ffffff');
        sRect(g, 18, 6, 2, 9, M.dark);
        g.set(12, 3, M.trim[1]);
        vline(g, 12, 1, 3, M.metal[2]);
        g.set(12, 0, M.trim[2]);
        hline(g, 7, 16, 17, M.trim[1]);
      } else if (e === 5) {
        const m = new Grid(24, 24);
        oval(m, 5, 3, 14, 15, MASK);
        rect(m, 5, 11, 14, 8, MASK);
        starSpecks(g, m, 9, 6);
        rect(g, 7, 13, 10, 3, '#0a0618');
        hline(g, 5, 18, 11, M.trim[1]);
        for (const x of [7, 10, 13, 16]) {
          g.set(x, 2, M.trim[1]);
          g.set(x, 1, M.trim[2]);
        }
        hline(g, 6, 17, 3, M.trim[1]);
        gemAt(g, 12, 7, M.gem, true);
      }
      return e === 1 || e === 5 ? () => glowDot(g, 12, 7, M.glow, 3, 0.45) : e === 4 ? () => glowDot(g, 12, 11, M.glow, 5, 0.25) : null;
    },
    armor(g, e, M) {
      const body = [[4, 5], [19, 5], [17, 10], [17, 20], [6, 20], [6, 10]];
      const mainR = e === 1 ? M.accent : M.metal;
      S(g, mainR, (m, c) => poly(m, body, c), { top: 1, bot: 1, left: 1, right: 1 });
      // neck opening
      oval(g, 9, 3, 6, 4, '#120e18');
      // pauldrons
      const pr = e === 1 || e === 5 ? M.trim : e === 3 ? M.accent : M.metal;
      sOval(g, 1, 4, 8, 7, pr);
      sOval(g, 15, 4, 8, 7, pr);
      if (e === 0) {
        line(g, 12, 7, 12, 18, M.metal[0]);
        hline(g, 7, 16, 16, M.accent[0]);
        hline(g, 7, 16, 17, M.accent[1]);
        g.set(12, 17, M.trim[2]);
        g.set(11, 17, M.trim[1]);
        hline(g, 6, 17, 19, M.trim[1]);
        g.set(9, 9, M.metal[2]);
        g.set(14, 9, M.metal[2]);
      } else if (e === 1) {
        line(g, 9, 7, 12, 19, M.trim[1]);
        line(g, 15, 7, 12, 19, M.trim[1]);
        ring(g, 12, 12, 2, 3, M.gem[1]);
        g.set(12, 12, M.gem[2]);
        hline(g, 6, 17, 19, M.trim[2]);
      } else if (e === 2) {
        crack(g, [[8, 8], [10, 12], [9, 16]], M.accent[1], M.accent[2]);
        crack(g, [[15, 9], [13, 13], [15, 17]], M.accent[0], M.accent[1]);
        for (const s of [[3, 3], [5, 2], [20, 3], [18, 2]]) {
          g.set(s[0], s[1], '#d8c8b0');
          g.set(s[0], s[1] - 1, '#fff4e0');
        }
        disc(g, 12, 12, 1.5, M.accent[1]);
        g.set(12, 12, M.accent[2]);
      } else if (e === 3) {
        for (const y of [8, 13, 18]) for (let x = 7; x <= 16; x += 3) g.set(x, y, M.metal[2]);
        disc(g, 12, 12, 2.8, M.metal[0]);
        disc(g, 12, 12, 2, '#ece6d4');
        line(g, 12, 12, 13, 10, '#c83a2a');
        vline(g, 5, 11, 19, M.accent[1]);
        vline(g, 18, 11, 19, M.accent[1]);
      } else if (e === 4) {
        line(g, 7, 8, 12, 15, M.accent[1]);
        line(g, 16, 8, 12, 15, M.accent[1]);
        hline(g, 7, 16, 18, M.accent[0]);
        disc(g, 12, 11, 1.5, M.trim[1]);
        g.set(12, 11, '#ffffff');
      } else if (e === 5) {
        const m = new Grid(24, 24);
        poly(m, body, MASK);
        starSpecks(g, m, 13, 7);
        line(g, 7, 6, 12, 10, M.trim[1]);
        line(g, 16, 6, 12, 10, M.trim[1]);
        hline(g, 6, 17, 19, M.trim[1]);
        gemAt(g, 12, 12, M.gem, true);
      }
      return e === 4 ? () => glowDot(g, 12, 11, M.trim[1], 4, 0.35) : e === 1 ? () => glowDot(g, 12, 12, M.glow, 4, 0.35) : null;
    },
    gloves(g, e, M) {
      const hand = e === 1 ? M.accent : e === 3 ? M.metal : M.metal;
      // fingers
      for (let k = 0; k < 4; k++) {
        const x = 7 + k * 3;
        const top = [4, 2, 3, 5][k];
        sRect(g, x, top, 3, 9 - top + 3, hand, { top: 1, bot: 0, left: 1, right: 1 });
        if (e === 2) {
          g.set(x + 1, top - 1, '#e8dcc8');
          g.set(x + 1, top - 2, M.accent[1]);
        }
        if (e === 0) g.set(x + 1, top + 3, hand[2]);
        if (e === 4) vline(g, x + 1, top + 1, 11, M.accent[1]);
      }
      // palm + thumb
      S(g, hand, (m, c) => {
        rect(m, 7, 10, 12, 6, c);
        poly(m, [[7, 11], [3, 8], [2, 10], [6, 15]], c);
      }, { top: 1, bot: 1, left: 1, right: 1 });
      // knuckle plate
      if (e === 0 || e === 2) hline(g, 7, 18, 11, hand[2]);
      if (e === 3) {
        gearShape(g, 10, 12, 2, M.accent, 6);
        gearShape(g, 15, 12, 2, M.accent, 6);
      }
      if (e === 5) {
        const m = new Grid(24, 24);
        rect(m, 7, 4, 12, 12, MASK);
        starSpecks(g, m, 21, 4);
      }
      // cuff
      const cuff = e === 0 ? M.accent : e === 2 ? M.dark : M.trim;
      S(g, cuff, (m, c) => {
        rect(m, 6, 16, 14, 6, c);
      }, { top: 1, bot: 1, left: 1, right: 1 });
      hline(g, 6, 19, 17, cuff[2]);
      if (e === 1) gemAt(g, 13, 19, M.gem, true);
      if (e === 2) crack(g, [[8, 19], [10, 20], [13, 18]], M.accent[1], M.accent[2]);
      if (e === 3) for (const x of [8, 12, 16]) g.set(x, 20, M.metal[2]);
      if (e === 4) hline(g, 7, 18, 20, M.accent[1]);
      if (e === 5) gemAt(g, 13, 19, M.gem, true);
      if (e === 0) g.set(13, 19, M.trim[2]);
      return e === 4 ? () => glowDot(g, 13, 10, M.accent[1], 5, 0.25) : null;
    },
    boots(g, e, M) {
      const leather = e === 0 || e === 3 ? (e === 3 ? M.trim : M.accent) : e === 1 ? M.accent : M.metal;
      // shaft + foot
      S(g, leather, (m, c) => {
        rect(m, 6, 3, 8, 13, c);
        poly(m, [[6, 15], [14, 13], [19, 15], [21, 18], [21, 20], [6, 20]], c);
      }, { top: 1, bot: 1, left: 1, right: 1 });
      // sole
      hline(g, 5, 21, 20, e === 2 ? M.accent[1] : M.dark[0]);
      hline(g, 5, 21, 21, e === 2 ? M.accent[0] : M.dark[1]);
      // cuff
      sRect(g, 5, 2, 10, 3, e === 0 ? M.accent : M.trim);
      if (e === 0) {
        sOval(g, 15, 14, 7, 6, M.metal);
        hline(g, 6, 13, 10, M.trim[0]);
        g.set(10, 10, M.trim[2]);
      } else if (e === 1) {
        sPoly(g, [[5, 8], [1, 4], [1, 7], [2, 9], [5, 11]], M.trim);
        gemAt(g, 9, 9, M.gem);
        hline(g, 6, 21, 19, M.trim[1]);
      } else if (e === 2) {
        for (const s of [[5, 7], [5, 11], [5, 15]]) {
          g.set(s[0] - 1, s[1], '#d8c8b0');
          g.set(s[0] - 2, s[1], '#fff4e0');
        }
        crack(g, [[9, 6], [11, 10], [10, 14], [14, 17]], M.accent[1], M.accent[2]);
      } else if (e === 3) {
        gearShape(g, 10, 12, 2.6, M.metal, 7);
        hline(g, 6, 13, 6, M.metal[1]);
        g.set(9, 6, M.metal[2]);
      } else if (e === 4) {
        line(g, 7, 6, 7, 17, M.accent[1]);
        hline(g, 7, 20, 18, M.accent[1]);
        sRect(g, 2, 13, 4, 4, M.dark);
      } else if (e === 5) {
        const m = new Grid(24, 24);
        rect(m, 6, 5, 8, 12, MASK);
        starSpecks(g, m, 31, 4);
        hline(g, 6, 21, 19, M.trim[1]);
        gemAt(g, 10, 3, M.gem);
      }
      return e === 4 ? () => {
        glowDot(g, 2, 15, M.accent[1], 3, 0.6);
        g.set(1, 15, M.accent[2]);
        g.set(0, 15, alpha(M.accent[1], 0.7));
      } : null;
    },
    belt(g, e, M) {
      const strap = e === 0 || e === 3 ? (e === 3 ? M.trim : M.accent) : e === 1 ? M.accent : e === 4 ? M.metal : e === 5 ? M.metal : M.dark;
      const m = new Grid(24, 24);
      for (let x = 1; x <= 22; x++) {
        const y = 9 + Math.round(Math.pow((x - 11.5) / 10.5, 2) * 3);
        rect(m, x, y, 1, 5, MASK);
      }
      shadeMask(g, m, strap, { top: 1, bot: 1, left: 1, right: 1 });
      if (e === 4) for (let x = 3; x < 21; x += 3) vline(g, x, 10 + Math.round(Math.pow((x - 11.5) / 10.5, 2) * 3), 13 + Math.round(Math.pow((x - 11.5) / 10.5, 2) * 3), M.dark[0]);
      if (e === 0 || e === 3) for (let x = 3; x < 21; x += 4) g.set(x, 11 + Math.round(Math.pow((x - 11.5) / 10.5, 2) * 3), strap[2]);
      // buckle
      if (e === 0) {
        sRect(g, 8, 7, 8, 9, M.trim);
        rect(g, 10, 9, 4, 5, strap[1]);
        vline(g, 12, 9, 13, M.trim[2]);
      } else if (e === 1) {
        disc(g, 12, 11, 4, M.trim[1]);
        disc(g, 12, 11, 3, M.trim[2]);
        gemAt(g, 12, 11, M.gem, true);
      } else if (e === 2) {
        sOval(g, 8, 7, 9, 9, R3('#8a7a66', '#d8cdb2', '#fff4e0'));
        rect(g, 9, 10, 2, 2, '#120808');
        rect(g, 14, 10, 2, 2, '#120808');
        g.set(10, 11, M.accent[2]);
        g.set(14, 11, M.accent[2]);
        hline(g, 10, 14, 14, '#4a3a2a');
        g.set(7, 6, '#d8c8b0');
        g.set(17, 6, '#d8c8b0');
        g.set(6, 5, M.accent[1]);
        g.set(18, 5, M.accent[1]);
      } else if (e === 3) {
        gearShape(g, 12, 11, 4, M.metal, 9);
        sRect(g, 17, 13, 5, 5, M.accent);
        g.set(19, 14, M.metal[2]);
      } else if (e === 4) {
        S(g, M.dark, (m2, c) => poly(m2, [[9, 8], [15, 8], [17, 11.5], [15, 15], [9, 15], [7, 11.5]], c));
        disc(g, 12, 11, 2, M.accent[1]);
        g.set(12, 11, '#ffffff');
      } else if (e === 5) {
        const st = [[12, 6], [14, 10], [18, 11], [14, 13], [15, 17], [12, 14], [9, 17], [10, 13], [6, 11], [10, 10]];
        sPoly(g, st, M.trim, { top: 1, bot: 1, left: 1, right: 1 });
        g.set(12, 11, M.gem[2]);
        const mm = new Grid(24, 24);
        for (let x = 1; x <= 22; x++) rect(mm, x, 9 + Math.round(Math.pow((x - 11.5) / 10.5, 2) * 3), 1, 5, MASK);
        starSpecks(g, mm, 41, 3);
      }
      return e === 1 || e === 4 ? () => glowDot(g, 12, 11, e === 1 ? M.glow : M.accent[1], 4, 0.35) : null;
    },
    ring(g, e, M) {
      const band = e === 0 ? M.trim : e === 1 ? M.trim : e === 2 ? M.metal : e === 3 ? M.metal : e === 4 ? M.metal : M.trim;
      const m = new Grid(24, 24);
      oval(m, 4, 8, 16, 14, MASK);
      const inner = new Grid(24, 24);
      oval(inner, 7, 11, 10, 8, MASK);
      for (let i = 0; i < m.d.length; i++) if (inner.d[i]) m.d[i] = 0;
      shadeMask(g, m, band, { top: 1, bot: 1, left: 1, right: 1 });
      if (e === 3) for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        g.set(Math.round(12 + Math.cos(a) * 8.6), Math.round(15 + Math.sin(a) * 7.6), band[2]);
      }
      if (e === 4) {
        g.set(6, 15, M.accent[1]);
        g.set(18, 15, M.accent[1]);
        hline(g, 10, 14, 21, M.accent[1]);
      }
      // setting + gem
      sRect(g, 9, 6, 6, 4, e === 2 ? M.dark : band);
      const gem = e === 0 ? M.gem : e === 1 ? M.gem : e === 2 ? M.gem : e === 3 ? R3('#8a4a0a', '#ffb02e', '#fff0a0') : e === 4 ? M.trim : M.gem;
      if (e === 4) {
        sRect(g, 9, 2, 6, 5, gem);
        g.set(10, 3, '#ffffff');
      } else if (e === 5) {
        const st = [[12, 0], [13.5, 3], [17, 3.5], [14.5, 5.5], [15.5, 9], [12, 7], [8.5, 9], [9.5, 5.5], [7, 3.5], [10.5, 3]];
        sPoly(g, st, gem, { top: 1, bot: 1, left: 1, right: 1 });
        g.set(12, 4, '#ffffff');
      } else {
        sOval(g, 8, 1, 8, 8, gem);
        g.set(10, 3, '#ffffff');
      }
      return e === 2 ? () => flame(g, 10, 1, 4, 3, 3, FIRE) : e === 1 || e === 4 || e === 5 ? () => glowDot(g, 12, 4, e === 4 ? M.trim[1] : M.glow, 5, 0.35) : null;
    },
    amulet(g, e, M) {
      const chain = e === 2 ? M.dark : e === 4 ? M.metal : e === 1 ? M.trim : M.trim;
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        const xl = Math.round(3 + t * 7);
        const xr = Math.round(20 - t * 7);
        const y = Math.round(2 + t * 7);
        g.set(xl, y, k % 2 ? chain[1] : chain[2]);
        g.set(xr, y, k % 2 ? chain[1] : chain[2]);
      }
      if (e === 0) {
        sOval(g, 6, 9, 12, 12, M.trim);
        ring(g, 12, 15, 3.6, 4.4, M.trim[0]);
        gemAt(g, 12, 15, M.gem, true);
      } else if (e === 1) {
        const m = new Grid(24, 24);
        oval(m, 5, 8, 14, 14, MASK);
        const cut = new Grid(24, 24);
        oval(cut, 9, 6, 13, 13, MASK);
        for (let i = 0; i < m.d.length; i++) if (cut.d[i]) m.d[i] = 0;
        shadeMask(g, m, M.trim, { top: 1, bot: 1, left: 1, right: 1 });
        gemAt(g, 15, 15, M.gem, true);
      } else if (e === 2) {
        sOval(g, 7, 10, 10, 10, R3('#8a7a66', '#d8cdb2', '#fff4e0'));
        rect(g, 8, 14, 3, 2, '#120808');
        rect(g, 13, 14, 3, 2, '#120808');
        g.set(9, 14, M.accent[2]);
        g.set(14, 14, M.accent[2]);
        hline(g, 10, 13, 18, '#4a3a2a');
        sPoly(g, [[8, 12], [5, 7], [9, 10]], R3('#2a2026', '#5a4a52', '#a89888'));
        sPoly(g, [[16, 12], [19, 7], [15, 10]], R3('#2a2026', '#5a4a52', '#a89888'));
      } else if (e === 3) {
        sRect(g, 11, 8, 2, 2, M.metal);
        sOval(g, 5, 9, 14, 14, M.metal);
        disc(g, 12, 16, 4.6, '#ece6d4');
        line(g, 12, 16, 12, 13, '#2a2026');
        line(g, 12, 16, 14, 17, '#2a2026');
        for (const a of [0, 1, 2, 3]) {
          const [dx, dy] = rotPoint(0, -5.2, a * 90);
          g.set(Math.round(12 + dx), Math.round(16 + dy), M.trim[1]);
        }
      } else if (e === 4) {
        const hex = [];
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          hex.push([12.5 + Math.cos(a) * 6.5, 15.5 + Math.sin(a) * 6.5]);
        }
        sPoly(g, hex, M.metal, { top: 1, bot: 1, left: 1, right: 1 });
        disc(g, 12, 15, 2.4, M.accent[0]);
        disc(g, 12, 15, 1.4, M.accent[1]);
        g.set(12, 15, '#ffffff');
        hline(g, 7, 9, 15, M.accent[1]);
        hline(g, 15, 17, 15, M.accent[1]);
      } else {
        const st = [];
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
          const r = k % 2 ? 3 : 7.5;
          st.push([12.5 + Math.cos(a) * r, 15.5 + Math.sin(a) * r]);
        }
        sPoly(g, st, M.trim, { top: 1, bot: 1, left: 1, right: 1 });
        gemAt(g, 12, 15, M.gem, true);
      }
      return e === 1 || e === 4 || e === 5 ? () => glowDot(g, e === 1 ? 15 : 12, 15, e === 4 ? M.accent[1] : M.glow, 5, 0.35) : null;
    },
  };

  function itemArt(slot, era) {
    const g = new Grid(24, 24);
    const e = Math.max(0, Math.min(5, era | 0));
    const fn = ITEM_ART[slot] || ITEM_ART.weapon;
    const post = fn(g, e, ERA_MAT[e]);
    outline(g, OUT);
    if (typeof post === 'function') post();
    return g;
  }
  // soft rarity glow + crisp ×2 art + sparkles → 48×48 data URL
  function composeIcon(art, size, rar, o) {
    const c = mkCanvas(size, size);
    const ctx = c.getContext && c.getContext('2d');
    if (!ctx) return BLANK_URL;
    const r = Math.max(-1, Math.min(6, Number.isFinite(+rar) ? Math.floor(+rar) : -1));
    const col = r >= 0 ? rarityColor(r) : null;
    if (col && r >= 1) {
      const strength = [0, 0.28, 0.4, 0.5, 0.6, 0.66, 0.72][r];
      const gr = ctx.createRadialGradient(size / 2, size / 2, size * 0.06, size / 2, size / 2, size * 0.5);
      gr.addColorStop(0, rgba(col, strength));
      gr.addColorStop(0.55, rgba(col, strength * 0.45));
      gr.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, size, size);
    }
    if (o && o.glow) {
      const ga = o.glowA || 0.45;
      const gr = ctx.createRadialGradient(size / 2, size * 0.56, size * 0.05, size / 2, size * 0.56, size * 0.5);
      gr.addColorStop(0, rgba(o.glow, ga));
      gr.addColorStop(0.6, rgba(o.glow, ga * 0.4));
      gr.addColorStop(1, rgba(o.glow, 0));
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, size, size);
    }
    ctx.imageSmoothingEnabled = false;
    const s = size / art.w;
    ctx.drawImage(toCanvas(art), 0, 0, art.w * s, art.h * s);
    if (col && r >= 2) {
      const spots = [[0.14, 0.18], [0.84, 0.8], [0.86, 0.2], [0.16, 0.84], [0.5, 0.06], [0.08, 0.5]];
      const n = Math.min(spots.length, r - 1 + (r >= 5 ? 1 : 0));
      const u = Math.max(1, Math.round(size / 24));
      for (let k = 0; k < n; k++) {
        const x = Math.round(spots[k][0] * size);
        const y = Math.round(spots[k][1] * size);
        const big = r >= 4 && k < 2;
        ctx.fillStyle = col;
        ctx.fillRect(x - u * (big ? 2 : 1), y, u * (big ? 5 : 3), u);
        ctx.fillRect(x, y - u * (big ? 2 : 1), u, u * (big ? 5 : 3));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, u, u);
      }
    }
    if (o && o.after) o.after(ctx, size);
    return toURL(c);
  }

  // ===================================================================== BADGE ICONS (skills / allies / dungeons)
  // rounded-square badge with a vertical gradient + bevel, drawn into a size×size grid
  function badge(g, base, deep) {
    const n = g.w;
    const top = mix(base, '#ffffff', 0.08);
    const bot = mix(deep || mix(base, '#000000', 0.6), '#0a0612', 0.25);
    const corner = (x, y) => {
      const r = 2;
      const cx = x < r ? r : x > n - 1 - r ? n - 1 - r : x;
      const cy = y < r ? r : y > n - 1 - r ? n - 1 - r : y;
      return Math.hypot(x - cx, y - cy) <= r + 0.2;
    };
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!corner(x, y)) continue;
        const t = y / (n - 1);
        let c = mix(top, bot, t);
        const edge = !corner(x - 1, y) || !corner(x + 1, y) || !corner(x, y - 1) || !corner(x, y + 1);
        if (edge) c = C('#0e0a14');
        else if (!corner(x, y - 2) || !corner(x - 2, y)) c = mix(c, '#ffffff', 0.22);
        else if (!corner(x, y + 2) || !corner(x + 2, y)) c = mix(c, '#000000', 0.3);
        g.set(x, y, c);
      }
    }
    // soft vignette highlight
    for (let y = 2; y < n / 2; y++) for (let x = 2; x < n - 2; x++) if ((x + y) % 2 === 0 && y < n / 4) g.set(x, y, alpha('#ffffff', 0.04));
  }
  // draw `art` (already outlined) centred onto a badge grid
  function onBadge(size, base, deep, art) {
    const g = new Grid(size, size);
    badge(g, base, deep);
    const b = bounds(art);
    if (b) blit(g, art, Math.round(size / 2 - b.w / 2) - b.x0, Math.round(size / 2 - b.h / 2) - b.y0);
    return g;
  }
  function artGrid(size, fn, ol) {
    const a = new Grid(size, size);
    const post = fn(a);
    if (ol !== false) outline(a, ol || OUT);
    if (typeof post === 'function') post(a);
    return a;
  }

  const SKILL_ART = {
    bomb: [C('#c8501a'), C('#3a0e08'), (a) => {
      sOval(a, 4, 7, 13, 13, [C('#0e0c14'), C('#1e1c28'), C('#3c3a4c'), C('#8a88a0')]);
      sRect(a, 13, 6, 4, 3, R3('#5a5a6a', '#9a9aae', '#d8d8e8'));
      line(a, 16, 6, 18, 3, '#c8a878');
      line(a, 18, 3, 20, 3, '#c8a878');
      a.set(7, 10, '#ffffff');
      return (g) => {
        flame(g, 19, 3, 3, 3, 5, FIRE);
        sparkle(g, 21, 2, C('#ffd84a'), true);
      };
    }],
    blades: [C('#5a6a8a'), C('#141a2c'), (a) => {
      place(a, BLADE, 15, 9, 9, 11, 12);
      return (g) => {
        for (let ang = 0; ang < 360; ang += 6) {
          const [dx, dy] = rotPoint(0, -10, ang);
          if ((ang / 6) % 5 < 3) g.set(Math.round(11 + dx), Math.round(12 + dy), alpha('#d8ecff', 0.55));
        }
      };
    }],
    warcry: [C('#c0282e'), C('#2a0608'), (a) => {
      // a shouting warrior in a horned helm
      const STEELH = R3('#4a5468', '#8c96a8', '#dce2ea');
      const IVORY = R3('#8a7a60', '#e8dcc0', '#fffaf0');
      sPoly(a, [[8, 10], [4, 9], [2, 5], [2, 0], [4, 3], [5, 6], [8, 7]], IVORY);
      sPoly(a, [[16, 10], [20, 9], [22, 5], [22, 0], [20, 3], [19, 6], [16, 7]], IVORY);
      sOval(a, 7, 10, 10, 12, HP.skin);
      oval(a, 9, 16, 6, 6, '#3a0a0e');
      rect(a, 10, 19, 4, 2, '#c8303a');
      hline(a, 10, 13, 16, '#ffffff');
      S(a, STEELH, (m, c) => {
        oval(m, 6, 3, 12, 12, c);
        for (let y = 12; y < 16; y++) for (let x = 0; x < 24; x++) m.clear(x, y);
      }, { top: 1, bot: 1, left: 1, right: 1 });
      hline(a, 6, 17, 11, '#c08a3a');
      hline(a, 6, 17, 12, '#7a5426');
      rect(a, 11, 11, 2, 4, STEELH[1]);
      g2(a);
      function g2(q) {
        q.set(8, 14, '#ffffff');
        q.set(9, 14, '#ffffff');
        q.set(14, 14, '#ffffff');
        q.set(15, 14, '#ffffff');
        line(q, 7, 12, 10, 13, '#3a1a10');
        line(q, 16, 12, 13, 13, '#3a1a10');
      }
      return (g) => {
        const Y = alpha('#ffe08a', 0.95);
        for (const s of [1, -1]) {
          const cx = s > 0 ? 19 : 4;
          line(g, cx, 14, cx + s * 3, 12, Y);
          line(g, cx + s, 17, cx + s * 4, 17, Y);
          line(g, cx, 20, cx + s * 3, 22, Y);
        }
      };
    }],
    heal: [C('#1e9a4a'), C('#062a12'), (a) => {
      S(a, R3('#1e9a4a', '#5aff8a', '#e0ffe8'), (m, c) => {
        rect(m, 9, 4, 6, 16, c);
        rect(m, 4, 9, 16, 6, c);
      }, { top: 1, bot: 1, left: 1, right: 1 });
      rect(a, 10, 10, 4, 4, '#e8fff0');
      return (g) => {
        glowDot(g, 12, 12, '#bfffcf', 9, 0.25);
        sparkle(g, 4, 5, C('#bfffcf'));
        sparkle(g, 20, 19, C('#bfffcf'));
      };
    }],
    lightning: [C('#2a6ac8'), C('#06122e'), (a) => {
      sPoly(a, [[14, 1], [6, 13], [11, 13], [8, 23], [18, 9], [13, 9], [17, 1]], R3('#e8a81a', '#ffe04a', '#fffbe0'), { top: 1, bot: 1, left: 1, right: 1 });
      return (g) => glowDot(g, 12, 12, '#bfe8ff', 10, 0.2);
    }],
    shield: [C('#7a3ac8'), C('#1a0630'), (a) => {
      const sh = [[4, 4], [20, 4], [20, 12], [12, 21], [4, 12]];
      sPoly(a, sh, R3('#3a1a7a', '#8a5ae0', '#d8c0ff'), { top: 1, bot: 1, left: 1, right: 1 });
      const inner = [[7, 6], [17, 6], [17, 12], [12, 18], [7, 12]];
      poly(a, inner, '#2a1260');
      ring(a, 12, 11, 2.4, 3.4, '#5ef3ff');
      vline(a, 12, 7, 15, '#5ef3ff');
      a.set(12, 11, '#ffffff');
      return (g) => glowDot(g, 12, 11, '#5ef3ff', 6, 0.35);
    }],
    frost: [C('#2a8ac8'), C('#06223a'), (a) => {
      for (let k = 0; k < 6; k++) {
        const ang = k * 60;
        const [dx, dy] = rotPoint(0, -9, ang);
        line(a, 12, 12, Math.round(12 + dx), Math.round(12 + dy), '#e8fbff', 2);
        const [bx, by] = rotPoint(0, -5, ang);
        for (const s of [-1, 1]) {
          const [ex, ey] = rotPoint(0, -3, ang + s * 50);
          line(a, Math.round(12 + bx), Math.round(12 + by), Math.round(12 + bx + ex), Math.round(12 + by + ey), '#9ae2ff');
        }
      }
      disc(a, 12, 12, 2, '#ffffff');
      return (g) => glowDot(g, 12, 12, '#bff0ff', 8, 0.25);
    }],
    meteor: [C('#c8641a'), C('#2a0a04'), (a) => {
      for (let k = 7; k >= 0; k--) {
        const t = k / 7;
        disc(a, Math.round(10 + t * 10), Math.round(14 - t * 11), 4.6 - t * 3.2, t > 0.6 ? FIRE[0] : t > 0.3 ? FIRE[1] : FIRE[2]);
      }
      sOval(a, 3, 11, 11, 11, [C('#1e1612'), C('#3e2e24'), C('#6a5040'), C('#9a7a60')]);
      crack(a, [[6, 14], [8, 17], [11, 16]], LAVA[1], LAVA[2]);
      return null;
    }],
  };

  const ALLY_BADGE = { wolf: ['#5a6a8a', '#121a2c'], fairy: ['#c04aa0', '#2a0a2a'], drone_ally: ['#1a8aa8', '#04182a'], golem_ally: ['#c0561a', '#2a0a04'] };
  function spriteArt(name, anim, i, size, crop, keepRight) {
    const d = DEFS[name];
    if (!d) return new Grid(size, size);
    let g = new Grid(d.w, d.h);
    const p = frameParams(anim, i, d.anims[anim] ? d.anims[anim].n : 1, null);
    d.draw(g, p);
    if (d.ol !== false) outline(g, d.ol || OUT);
    if (d.post) d.post(g, p);
    if (d.face === 'L' && !keepRight) g = flipX(g);
    const out = new Grid(size, size);
    if (crop) {
      blit(out, g, -crop[0], -crop[1]);
    } else {
      const b = bounds(g);
      if (b) blit(out, g, Math.round(size / 2 - b.w / 2) - b.x0, Math.round(size / 2 - b.h / 2) - b.y0);
    }
    return out;
  }

  const DUNGEON_ART = {
    dragon: ['#a8281e', '#2a0606', () => spriteArt('dragon', 'attack', 0, 32, [44, -4], true)],
    horde: ['#4a7a2a', '#0e1a08', () => {
      const a = new Grid(32, 32);
      const z = spriteArt('zombie', 'walk', 1, 28);
      const zb = z.clone();
      tint(zb, '#0e1a08', 0.45);
      blit(a, zb, -6, 1);
      blit(a, zb, 10, 0);
      blit(a, z, 2, 5);
      return a;
    }],
    vault: ['#4a5a6a', '#0a1218', () => spriteArt('stone_golem', 'idle', 0, 32, [16, 1], true)],
    mothership: ['#4a2a8a', '#0a0420', () => {
      const a = new Grid(32, 32);
      // tractor beam
      for (let y = 17; y < 31; y++) {
        const half = 3 + (y - 17) * 0.5;
        for (let x = Math.round(16 - half); x <= Math.round(16 + half); x++) a.set(x, y, alpha('#8affc8', 0.18 + (y % 3 === 0 ? 0.12 : 0)));
      }
      sOval(a, 10, 4, 12, 10, R3('#3a8a9a', '#8ae8f0', '#e8ffff'));
      sOval(a, 2, 10, 28, 9, CHROME);
      hline(a, 4, 27, 16, CHROME[0]);
      for (let k = 0; k < 6; k++) a.set(6 + k * 4, 14, k % 2 ? MAG[1] : CYAN[1]);
      a.set(14, 6, '#ffffff');
      outline(a, OUT);
      for (const s of [[4, 4], [27, 6], [25, 26], [5, 24]]) a.set(s[0], s[1], '#ffffff');
      return a;
    }],
  };

  // ===================================================================== CURRENCY ICONS (16×16 art → 32×32)
  const GOLDC = [C('#7a4a08'), C('#c88a18'), C('#ffd23a'), C('#fff6c0')];

  const CURRENCY_ART = {
    gold: (a) => {
      // three rimmed coins stacked in a pyramid
      const coin = (x, y) => {
        oval(a, x, y, 8, 8, '#6a3e06');
        sOval(a, x + 1, y + 1, 6, 6, GOLDC);
        vline(a, x + 4, y + 2, y + 5, GOLDC[1]);
        a.set(x + 2, y + 2, GOLDC[3]);
      };
      coin(0, 8);
      coin(8, 8);
      coin(4, 2);
      return (g) => sparkle(g, 13, 2, C('#fff6c0'));
    },
    gems: (a) => {
      const G = [C('#7a1a6a'), C('#d040b0'), C('#ff8ae0'), C('#ffe0f8')];
      poly(a, [[3, 6], [6, 2], [10, 2], [13, 6], [8, 14]], G[1]);
      poly(a, [[3, 6], [13, 6], [8, 14]], G[1]);
      poly(a, [[8, 6], [13, 6], [8.5, 14]], G[0]);
      poly(a, [[6, 2], [10, 2], [11, 6], [5, 6]], G[2]);
      line(a, 4, 6, 12, 6, G[3]);
      a.set(6, 3, G[3]);
      a.set(7, 3, '#ffffff');
      return (g) => sparkle(g, 12, 2, C('#ffd0f4'));
    },
    keys: (a) => {
      ring(a, 4.5, 4.5, 1.6, 3.6, GOLDC[2]);
      a.set(3, 3, GOLDC[3]);
      a.set(6, 7, GOLDC[1]);
      line(a, 6, 6, 13, 13, GOLDC[2], 2);
      line(a, 7, 6, 13, 12, GOLDC[1]);
      rect(a, 10, 13, 2, 2, GOLDC[1]);
      rect(a, 12, 11, 2, 2, GOLDC[1]);
      return null;
    },
    scrolls: (a) => {
      const P = R3('#b89a6a', '#ecdcb0', '#fffaf0');
      sRect(a, 3, 3, 10, 10, P);
      sOval(a, 1, 1, 14, 4, R3('#a0845a', '#d8c494', '#fff4d8'));
      sOval(a, 1, 11, 14, 4, R3('#a0845a', '#d8c494', '#fff4d8'));
      for (let y = 6; y <= 10; y += 2) hline(a, 5, 10, y, '#8a7a5a');
      sOval(a, 9, 9, 5, 5, R3('#7a0e14', '#d0303a', '#ff8a8a'));
      return null;
    },
    chest: (a) => {
      drawChest(a, 1, 3, 14, 11, CHEST_BASIC);
      return null;
    },
    premium: (a) => {
      drawChest(a, 1, 3, 14, 11, {
        wood: [C('#2a0e3a'), C('#4a1e6a'), C('#7a3aa8'), C('#b070e0')],
        band: R3('#7a5a1e', '#e0b040', '#fff0a0'), trim: R3('#7a5a1e', '#e0b040', '#fff0a0'), lock: R3('#7a5a1e', '#ffd23a', '#fff6c0'),
        gem: R3('#127a8a', '#3ae0f0', '#d0fcff'), straps: false,
      });
      return (g) => sparkle(g, 14, 2, C('#ffe68a'));
    },
    cp: (a) => {
      const blade = R3('#6a7488', '#c8d2e0', '#ffffff');
      bladePoly(a, [4, 12], [14, 2], 1.1, blade, 2);
      bladePoly(a, [12, 12], [2, 2], 1.1, blade, 2);
      bar(a, [2, 10], [6, 14], 1.8, R3('#7a5426', '#d09a3c', '#f6d488'));
      bar(a, [10, 14], [14, 10], 1.8, R3('#7a5426', '#d09a3c', '#f6d488'));
      a.set(3, 13, '#c83a3a');
      a.set(13, 13, '#c83a3a');
      return null;
    },
    xp: (a) => {
      const st = [];
      for (let k = 0; k < 10; k++) {
        const ang = (k / 10) * Math.PI * 2 - Math.PI / 2;
        const r = k % 2 ? 2.8 : 7;
        st.push([8 + Math.cos(ang) * r, 8.5 + Math.sin(ang) * r]);
      }
      sPoly(a, st, R3('#1e8a9a', '#4ae0e8', '#d8ffff'), { top: 1, bot: 1, left: 1, right: 1 });
      a.set(7, 7, '#ffffff');
      return (g) => glowDot(g, 8, 8, '#8af4ff', 7, 0.2);
    },
  };

  // ===================================================================== CHEST LEVEL ICONS (32×32 → 64×64)
  function chestStyle(level) {
    const L = Math.max(1, Math.min(20, Math.floor(Number(level)) || 1));
    if (L <= 4) {
      return { st: Object.assign({}, CHEST_BASIC, { straps: L >= 3 }), glow: null, sparkles: 0 };
    }
    if (L <= 9) {
      return {
        st: { wood: [C('#2e180e'), C('#5a3018'), C('#844a24'), C('#b06a3a')], band: R3('#3a3e4a', '#8a92a2', '#e0e6f0'), trim: R3('#3a3e4a', '#8a92a2', '#e0e6f0'), lock: R3('#7a5a1e', '#d4a838', '#ffe68a'), straps: true, gem: L >= 7 ? R3('#7a1420', '#e03a3a', '#ffaa9a') : null },
        glow: L >= 8 ? '#c8d2e0' : null, glowA: 0.25, sparkles: L >= 8 ? 1 : 0,
      };
    }
    if (L <= 14) {
      return {
        st: { wood: [C('#2a0e08'), C('#561c10'), C('#86321a'), C('#b8562a')], band: R3('#8a5a10', '#ffc83a', '#fff4b0'), trim: R3('#8a5a10', '#ffc83a', '#fff4b0'), lock: R3('#8a5a10', '#ffd84a', '#fffbe0'), straps: true, gem: L >= 12 ? R3('#127a8a', '#3ae0f0', '#d0fcff') : R3('#7a1420', '#e03a3a', '#ffaa9a') },
        glow: '#ffc83a', glowA: L >= 12 ? 0.45 : 0.35, sparkles: L >= 12 ? 3 : 2,
      };
    }
    return {
      st: { wood: [C('#1a1060'), C('#3a2aa0'), C('#6a5ae0'), C('#b0a8ff')], band: R3('#5a6a9a', '#c8e8ff', '#ffffff'), trim: R3('#1a8a9a', '#5ef3ff', '#e8ffff'), lock: R3('#1a8a9a', '#5ef3ff', '#ffffff'), straps: true, crystal: true, gem: L >= 18 ? R3('#8a1a6c', '#ff6ae0', '#fff0fc') : R3('#6a1a9a', '#d070ff', '#f8e0ff') },
      glow: L >= 18 ? '#ff9af0' : '#8ae8ff', glowA: L >= 18 ? 0.6 : 0.5, sparkles: L >= 18 ? 5 : 4,
    };
  }

  // ===================================================================== HERO PORTRAIT (24×24 → 48×48)
  function portraitArt(look) {
    const L = heroLookNorm(look);
    const trim = trimRamp(L.armorRarity);
    const a = new Grid(24, 24);
    const W = WEAPONS[L.weaponEra] || WEAPONS[0];
    const HAIR = R3('#4a2210', '#86461e', '#c27a3a');
    // weapon hilt peeking over the back shoulder
    place(a, weaponGrid(L.weaponEra, L.weaponRarity), -38, W.gx, W.gy, 4, 18);
    // cape collar + armour shoulders + pauldron
    S(a, HP.cape, (m, c) => poly(m, [[0, 24], [2, 17], [22, 17], [24, 24]], c), { top: 1, bot: 0 });
    S(a, HP.steel, (m, c) => oval(m, 3, 18, 19, 11, c), { top: 1, bot: 0, right: 1 });
    hline(a, 6, 13, 19, trim[1]);
    S(a, trim, (m, c) => oval(m, 14, 16, 9, 6, c), { top: 1, bot: 1 });
    // neck
    rect(a, 12, 15, 4, 4, HP.skin[0]);
    // back hair mass, then the face
    S(a, HAIR, (m, c) => oval(m, 5, 3, 9, 13, c), { top: 1, bot: 1 });
    sOval(a, 8, 4, 13, 14, HP.skin, { lx: 0.55, ly: -0.55 });
    // hair top + fringe spikes over the forehead
    S(a, HAIR, (m, c) => {
      oval(m, 5, 0, 16, 10, c);
      for (let y = 7; y < 10; y++) for (let x = 0; x < 24; x++) m.clear(x, y);
      poly(m, [[11, 6], [15, 6], [13, 10]], c);
      poly(m, [[14, 6], [18, 6], [17, 9]], c);
      poly(m, [[17, 6], [21, 6], [20.5, 8.5]], c);
      rect(m, 5, 6, 6, 8, c);
    }, { top: 1, bot: 1 });
    // headband + fluttering tails
    hline(a, 6, 20, 6, trim[1]);
    a.set(19, 6, trim[2]);
    a.set(20, 6, trim[2]);
    a.set(5, 7, trim[1]);
    a.set(4, 8, trim[1]);
    a.set(3, 8, trim[0]);
    a.set(2, 9, trim[0]);
    // ear
    rect(a, 10, 10, 2, 3, HP.skin[1]);
    a.set(11, 11, HP.skin[0]);
    // brow, eye (with glint), nose, blush, mouth
    hline(a, 15, 18, 9, HAIR[0]);
    rect(a, 16, 10, 2, 3, HP.eye);
    a.set(16, 10, '#ffffff');
    a.set(21, 12, HP.skin[1]);
    a.set(21, 13, HP.skin[0]);
    a.set(15, 14, mix(HP.skin[1], '#ff7a7a', 0.4));
    hline(a, 18, 19, 15, HP.skin[0]);
    outline(a, OUT);
    return a;
  }

  // ===================================================================== icon API
  const ICONS = new Map();
  function iconCached(key, build) {
    const hit = ICONS.get(key);
    if (hit) return hit;
    let url = BLANK_URL;
    try {
      url = build() || BLANK_URL;
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('[DD.sprites] icon failed', key, e);
      url = placeholderURL();
    }
    if (url !== BLANK_URL || !HAS_DOM) ICONS.set(key, url);
    return url;
  }
  let PH_URL = null;
  function placeholderURL() {
    if (PH_URL) return PH_URL;
    if (!HAS_DOM) return BLANK_URL;
    PH_URL = toURL(placeholder());
    return PH_URL;
  }
  function eraOf(item) {
    if (item && Number.isFinite(+item.era)) return Math.max(0, Math.min(5, Math.floor(+item.era)));
    const il = item && Number.isFinite(+item.ilvl) ? +item.ilvl : 1;
    return Math.max(0, Math.min(5, Math.floor((il - 1) / 10)));
  }
  const SLOT_SET = { weapon: 1, helmet: 1, armor: 1, gloves: 1, boots: 1, belt: 1, ring: 1, amulet: 1 };

  SP.itemIcon = function (item) {
    const it = item && typeof item === 'object' ? item : {};
    const slot = SLOT_SET[it.slot] ? it.slot : 'weapon';
    const era = eraOf(it);
    const rar = Number.isFinite(+it.rarity) ? Math.max(0, Math.min(6, Math.floor(+it.rarity))) : 0;
    return iconCached('item|' + slot + '|' + era + '|' + rar, () => composeIcon(itemArt(slot, era), 48, rar));
  };
  // slot silhouette for empty equipment slots (extra helper)
  SP.slotIcon = function (slot) {
    const s = SLOT_SET[slot] ? slot : 'weapon';
    return iconCached('slot|' + s, () => {
      const art = itemArt(s, 0);
      for (let i = 0; i < art.d.length; i++) if (art.d[i] >>> 24) art.d[i] = art.d[i] === C(OUT) ? 0 : alpha('#8a7aa8', 0.5);
      return composeIcon(art, 48, -1);
    });
  };
  SP.skillIcon = function (id) {
    const def0 = SKILL_ART[id];
    if (!def0) return iconCached('skill|?', placeholderURL);
    return iconCached('skill|' + id, () => {
      const art = artGrid(24, def0[2]);
      return composeIcon(onBadge(24, def0[0], def0[1], art), 48, -1);
    });
  };
  SP.allyIcon = function (id) {
    const bg = ALLY_BADGE[id];
    if (!bg) return iconCached('ally|?', placeholderURL);
    return iconCached('ally|' + id, () => composeIcon(onBadge(32, C(bg[0]), C(bg[1]), spriteArt(id, 'idle', 0, 30)), 64, -1));
  };
  SP.dungeonIcon = function (id) {
    const d = DUNGEON_ART[id];
    if (!d) return iconCached('dungeon|?', placeholderURL);
    return iconCached('dungeon|' + id, () => {
      const g = new Grid(32, 32);
      badge(g, C(d[0]), C(d[1]));
      const art = d[2]();
      // keep the art inside the badge frame
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (x < 1 || y < 1 || x > 30 || y > 30) art.clear(x, y);
      blit(g, art, 0, 0);
      return composeIcon(g, 64, -1);
    });
  };
  const CURRENCY_ALIAS = { gem: 'gems', key: 'keys', scroll: 'scrolls', chests: 'chest', premiumChest: 'premium', premiumChests: 'premium', power: 'cp', coin: 'gold', coins: 'gold', exp: 'xp' };
  SP.currencyIcon = function (kind) {
    const k = CURRENCY_ART[kind] ? kind : CURRENCY_ALIAS[kind];
    kind = k;
    const fn = k ? CURRENCY_ART[k] : null;
    if (!fn) return iconCached('cur|?', placeholderURL);
    return iconCached('cur|' + kind, () => composeIcon(artGrid(16, fn), 32, -1));
  };
  SP.chestIcon = function (level) {
    const L = Math.max(1, Math.min(20, Math.floor(Number(level)) || 1));
    return iconCached('chest|' + L, () => {
      const cs = chestStyle(L);
      const a = artGrid(32, (g) => {
        drawChest(g, 3, 8, 26, 20, cs.st);
        if (L >= 15) {
          // crystal shards on the lid
          for (const s of [[7, 9, 5], [24, 9, 4]]) sPoly(g, [[s[0] - 1, s[1] + 1], [s[0] + 0.5, s[1] - s[2]], [s[0] + 2, s[1] + 1]], R3('#3a8ab0', '#8ae8ff', '#f0ffff'), { top: 0, left: 1, right: 1 });
        }
        if (L >= 10) {
          // corner studs
          for (const p of [[4, 10], [27, 10], [4, 26], [27, 26]]) g.set(p[0], p[1], cs.st.band[2]);
        }
        return null;
      });
      return composeIcon(a, 64, -1, {
        after(ctx, size) {
          const spots = [[0.12, 0.16], [0.88, 0.22], [0.5, 0.06], [0.9, 0.86], [0.08, 0.8]];
          const u = Math.round(size / 32);
          for (let k = 0; k < cs.sparkles; k++) {
            const x = Math.round(spots[k][0] * size);
            const y = Math.round(spots[k][1] * size);
            ctx.fillStyle = cs.glow || '#ffffff';
            ctx.fillRect(x - u * 2, y, u * 5, u);
            ctx.fillRect(x, y - u * 2, u, u * 5);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x, y, u, u);
          }
        },
        glow: cs.glow,
        glowA: cs.glowA,
      });
    });
  };
  SP.heroPortrait = function (look) {
    const key = 'portrait|' + heroLookKey(look);
    return iconCached(key, () => composeIcon(portraitArt(look), 48, -1));
  };

  // ===================================================================== public API
  let inited = false;
  function buildAll(name) {
    const d = DEFS[name];
    if (!d) return;
    for (const an of Object.keys(d.anims)) {
      try {
        framesFor(name, an, null);
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('[DD.sprites] init failed for', name, an, e);
      }
    }
  }
  function idle(fn) {
    try {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 400 });
      else setTimeout(fn, 16);
    } catch {
      setTimeout(fn, 16);
    }
  }
  // Builds every sprite cache. Bosses (the heaviest art) are warmed in idle time right after boot;
  // anything requested before it is warmed is simply built on demand.
  SP.init = function () {
    if (inited) return;
    inited = true;
    if (!HAS_DOM) return;
    const later = [];
    for (const name of Object.keys(DEFS)) {
      if (DEFS[name].boss) later.push(name);
      else buildAll(name);
    }
    const step = () => {
      const n = later.shift();
      if (!n) return;
      buildAll(n);
      idle(step);
    };
    idle(step);
  };
  // true once every sprite (including the idle-warmed bosses) has been generated
  SP.ready = function () {
    if (!inited) return false;
    for (const name of Object.keys(DEFS)) {
      const c = CACHE[name];
      if (!c) return false;
      for (const an of Object.keys(DEFS[name].anims)) if (!c[an]) return false;
    }
    return true;
  };

  function frameIndex(d, an, n, t) {
    const a = d.anims[an];
    const tt = Number(t);
    let f = Math.floor((Number.isFinite(tt) ? tt : 0) * (a.fps || 8));
    if (!Number.isFinite(f)) f = 0;
    if (a.once) return Math.max(0, Math.min(n - 1, f));
    return ((f % n) + n) % n;
  }

  SP.anim = function (name, anim, t, look) {
    try {
      const d = DEFS[name];
      if (!d) return placeholder();
      const an = resolveAnim(d, anim);
      if (!an) return placeholder();
      const set = framesFor(name, an, look);
      if (!set || !set.length) return placeholder();
      return set[frameIndex(d, an, set.length, t)] || placeholder();
    } catch {
      return placeholder();
    }
  };
  // explicit frame access (contact sheets, UI previews)
  SP.frame = function (name, anim, i, look) {
    try {
      const d = DEFS[name];
      const an = d && resolveAnim(d, anim);
      if (!an) return placeholder();
      const set = framesFor(name, an, look);
      const n = set.length;
      return set[(((Math.floor(Number(i)) || 0) % n) + n) % n] || placeholder();
    } catch {
      return placeholder();
    }
  };
  SP.size = function (name) {
    const d = DEFS[name];
    return d ? { w: d.w, h: d.h } : { w: 16, h: 16 };
  };
  // Anchor in canvas pixels: characters / ground fx are bottom-centre (feet), projectiles and
  // free-floating fx are centred. { x, y, mode: 'bottom'|'center' }
  SP.anchor = function (name) {
    const d = DEFS[name];
    if (!d) return { x: 8, y: 15, mode: 'bottom' };
    if (d.anchor === 'c') return { x: Math.floor(d.w / 2), y: Math.floor(d.h / 2), mode: 'center' };
    return { x: Math.floor(d.w / 2), y: d.h - 1, mode: 'bottom' };
  };
  SP.has = function (name, anim) {
    const d = DEFS[name];
    if (!d) return false;
    return anim === undefined ? true : !!d.anims[anim];
  };
  SP.names = function () {
    return Object.keys(DEFS);
  };
  SP.anims = function (name) {
    const d = DEFS[name];
    return d ? Object.keys(d.anims) : [];
  };
  SP.frameCount = function (name, anim) {
    const d = DEFS[name];
    const an = d && resolveAnim(d, anim);
    return an ? d.anims[an].n : 1;
  };
  SP.fps = function (name, anim) {
    const d = DEFS[name];
    const an = d && resolveAnim(d, anim);
    return an ? d.anims[an].fps : 8;
  };
  // seconds for one pass through the animation
  SP.duration = function (name, anim) {
    const d = DEFS[name];
    const an = d && resolveAnim(d, anim);
    return an ? d.anims[an].n / (d.anims[an].fps || 8) : 0.5;
  };
  SP.isPlaceholder = function (c) {
    try {
      return !!c && (c === PH || (PH_SET ? PH_SET.has(c) : false));
    } catch {
      return false;
    }
  };
  SP.rarityColor = rarityColor;
  // Build the hero `look` from DD.state.s.equipped (or any { weapon, armor } item map).
  SP.lookFromEquipped = function (equipped) {
    const eq = equipped && typeof equipped === 'object' ? equipped : {};
    const w = eq.weapon && typeof eq.weapon === 'object' ? eq.weapon : null;
    const a = eq.armor && typeof eq.armor === 'object' ? eq.armor : null;
    const era = w ? (Number.isFinite(+w.era) ? +w.era : Math.floor(((+w.ilvl || 1) - 1) / 10)) : 0;
    return heroLookNorm({
      weaponEra: era,
      weaponRarity: w && Number.isFinite(+w.rarity) ? +w.rarity : -1,
      armorRarity: a && Number.isFinite(+a.rarity) ? +a.rarity : -1,
    });
  };

  const flashCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  SP.flashed = function (canvas) {
    try {
      if (!canvas || !HAS_DOM) return canvas || placeholder();
      if (flashCache && flashCache.has(canvas)) return flashCache.get(canvas);
      const c = mkCanvas(canvas.width, canvas.height);
      const ctx = c.getContext('2d');
      ctx.drawImage(canvas, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      if (flashCache) flashCache.set(canvas, c);
      return c;
    } catch {
      return canvas || placeholder();
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis.DD : undefined);
