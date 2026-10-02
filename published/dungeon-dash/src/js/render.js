/* Dungeon Dash — render: the battle canvas.
 *
 * Pass 1 draws the pixel-art world (parallax biome, entities, particles, skill VFX) into an
 * offscreen buffer at WORLD × k (k = integer scale) with smoothing off, then blits it onto the
 * visible canvas. Pass 2 draws text straight onto the visible canvas at full resolution so it stays
 * crisp: damage numbers, banners, the boss bar labels, the TAP hint and the revive countdown.
 *
 * Render only reads DD.battle / DD.state view fields. Its single write is DD.battle.tapAt() when the
 * player taps the canvas. All VFX state (particles, numbers, banners, shake) lives in here and is
 * driven by bus events; everything is pooled and capped so ×3 speed stays smooth on phones.
 */
(function (DD) {
  'use strict';

  // ================================================================== constants
  const WORLD = DD.WORLD || { W: 360, H: 200, GROUND: 170, HERO_X: 84 };
  const W = WORLD.W;
  const H = WORLD.H;
  const GROUND = WORLD.GROUND;
  const HERO_X = WORLD.HERO_X;
  const FLOOR_Y = 156; // world y where the floor strip (lip, top face, front face) starts
  const FLOOR_H = 52;
  const MARGIN = 8; // extra world px painted around the view so shake never reveals an edge
  const FONT = '"Pixelify Sans", ui-monospace, monospace';
  const INK = '#120a18';
  const SHAKE_PX = 4.5;
  const PART_CAP = 300;
  const PART_CAP_REDUCED = 110;
  const TEXT_CAP = 40;
  const FX_CAP = 90;
  const COIN_CAP = 50;
  const LATER_CAP = 80;
  const DEAD_LINGER = 0.4;
  const COIN_TX = 9;
  const COIN_TY = 8;
  const TAP_ASSIST = 34; // generous chest hit-test radius (world px) for fingers
  const BIOME_IDS = ['crypt', 'fungal', 'forge', 'clockwork', 'neon', 'void'];
  const REWARD_COLORS = { gems: '#5ef3ff', gold: '#ffd34d', chests: '#ffb04a', key: '#ffe08a', keys: '#ffe08a', scrolls: '#d9b3ff' };
  const PROJ_COLORS = {
    arrow: ['#d8d2c4', '#8a7f6a'],
    fireball: ['#ffb347', '#ff5a1f'],
    spit: ['#a6ff5e', '#4fbf2a'],
    bolt: ['#fff27a', '#ffb627'],
    laser: ['#ff6b8a', '#ff2d55'],
    orb: ['#d9b3ff', '#8a4dff'],
    rock: ['#b39a7a', '#6e5a44'],
  };
  const KILL_TINT = {
    crypt: '#cfc9b6', fungal: '#c77dff', forge: '#ff9a3c', clockwork: '#e0b04a', neon: '#21e6ff', void: '#b98bff',
  };

  // ================================================================== small helpers
  function num(v, d) {
    return typeof v === 'number' && Number.isFinite(v) ? v : d;
  }
  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }
  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function easeOut(t) {
    t = clamp(t, 0, 1);
    return 1 - (1 - t) * (1 - t) * (1 - t);
  }
  function easeOutBack(t) {
    t = clamp(t, 0, 1);
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  function hash(a, b, c) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    h ^= h >>> 16;
    h = Math.imul(h, 2654435761);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  function strHash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function fmt(n) {
    try {
      return DD.fmt(n);
    } catch {
      return String(Math.floor(num(n, 0)));
    }
  }

  // ---- colors
  const rgbCache = {};
  function hexRgb(hex) {
    let c = rgbCache[hex];
    if (c) return c;
    let h = String(hex || '#000').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h.slice(0, 6), 16);
    c = Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0];
    rgbCache[hex] = c;
    return c;
  }
  function toHex(r, g, b) {
    const v = (1 << 24) | (clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255);
    return '#' + v.toString(16).slice(1);
  }
  function mix(a, b, t) {
    const x = hexRgb(a);
    const y = hexRgb(b);
    return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
  }
  function shade(hex, f) {
    return f < 0 ? mix(hex, '#000000', -f) : mix(hex, '#ffffff', f);
  }
  function rgba(hex, a) {
    const c = hexRgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + Math.round(clamp(num(a, 1), 0, 1) * 1000) / 1000 + ')';
  }
  function gradAt(stops, t) {
    if (t <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const a = stops[i - 1];
        const b = stops[i];
        return mix(a[1], b[1], (t - a[0]) / Math.max(1e-6, b[0] - a[0]));
      }
    }
    return stops[stops.length - 1][1];
  }

  // ---- canvases & pixel primitives (all on 1× logical-pixel canvases)
  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  function g2(c) {
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return g;
  }
  function layerCanvas(w, h, fn) {
    const c = mk(w, h);
    fn(g2(c), w, h);
    return c;
  }
  function rect(g, x, y, w, h, c) {
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  function ellipse(g, cx, cy, rx, ry, c) {
    g.fillStyle = c;
    const r = Math.max(0.5, ry);
    for (let dy = -Math.floor(r); dy <= Math.floor(r); dy++) {
      const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (r * r))));
      g.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2 + 1, 1);
    }
  }
  function halfEllipse(g, cx, cy, rx, ry, c) {
    // upper half (dome) of an ellipse, flat side at cy
    g.fillStyle = c;
    const r = Math.max(0.5, ry);
    for (let dy = -Math.floor(r); dy <= 0; dy++) {
      const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (r * r))));
      g.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2 + 1, 1);
    }
  }
  function line(g, x0, y0, x1, y1, c) {
    if (c) g.fillStyle = c;
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let i = 0; i < 2000; i++) {
      g.fillRect(x0, y0, 1, 1);
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
  function spike(g, x, y, w, h, c, down) {
    // pixel triangle: base w at y, tip h away (down = tip below)
    g.fillStyle = c;
    for (let i = 0; i < h; i++) {
      const ww = Math.max(1, Math.round(w * (1 - i / h)));
      const yy = down ? y + i : y - i;
      g.fillRect(Math.round(x - ww / 2), Math.round(yy), ww, 1);
    }
  }
  function wrap3(P, fn) {
    fn(0);
    fn(-P);
    fn(P);
  }
  function vfade(g, x, y, w, h, color, a0, a1) {
    for (let i = 0; i < h; i++) {
      const a = a0 + (a1 - a0) * (h > 1 ? i / (h - 1) : 0);
      if (a <= 0.01) continue;
      g.fillStyle = rgba(color, Math.round(a * 24) / 24);
      g.fillRect(x, y + i, w, 1);
    }
  }
  function skyCanvas(stops, extra) {
    const w = W + MARGIN * 2;
    const hh = H + MARGIN * 2;
    const c = mk(w, hh);
    const g = g2(c);
    const LV = 22;
    for (let y = 0; y < hh; y++) {
      const f = (y / (hh - 1)) * (LV - 1);
      const lv = Math.floor(f);
      const fr = f - lv;
      rect(g, 0, y, w, 1, gradAt(stops, lv / (LV - 1)));
      if (fr > 0.34) {
        g.fillStyle = gradAt(stops, Math.min(LV - 1, lv + 1) / (LV - 1));
        const step = fr > 0.67 ? 2 : 4;
        for (let x = (y & 1) * (step >> 1); x < w; x += step) g.fillRect(x, y, 1, 1);
      }
    }
    if (extra) extra(g, w, hh);
    return c;
  }
  function bricks(g, P, y0, h, o) {
    rect(g, 0, y0, P, h, o.mortar);
    const cols = Math.max(1, Math.round(P / o.bw));
    const rows = Math.ceil(h / o.bh);
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? Math.floor(o.bw / 2) : 0;
      const y = y0 + r * o.bh;
      for (let ci = -1; ci <= cols; ci++) {
        const x = ci * o.bw + off;
        const wc = ((ci % cols) + cols) % cols;
        const v = hash(wc, r, o.seed);
        rect(g, x + 1, y + 1, o.bw - 1, o.bh - 1, o.colors[Math.floor(v * o.colors.length) % o.colors.length]);
        if (o.hi) rect(g, x + 1, y + 1, o.bw - 1, 1, o.hi);
        if (o.lo) rect(g, x + 1, y + o.bh - 1, o.bw - 1, 1, o.lo);
        if (o.chip && hash(wc, r, o.seed + 7) < o.chip) {
          const cx = x + 2 + Math.floor(hash(wc, r, o.seed + 9) * (o.bw - 5));
          rect(g, cx, y + o.bh - 3, 2, 1, o.chipC || o.mortar);
          rect(g, cx + 1, y + o.bh - 2, 1, 1, o.chipC || o.mortar);
        }
      }
    }
  }
  function blobs(g, P, y0, h, count, colors, rmin, rmax, seed) {
    const r = seeded(seed);
    g.save();
    g.beginPath();
    g.rect(0, y0, P, h);
    g.clip();
    for (let i = 0; i < count; i++) {
      const x = r() * P;
      const y = y0 + r() * h;
      const rx = rmin + r() * (rmax - rmin);
      const ry = rx * (0.45 + r() * 0.4);
      const c = colors[Math.floor(r() * colors.length)];
      wrap3(P, (o) => ellipse(g, x + o, y, rx, ry, c));
    }
    g.restore();
  }

  // ---- glows (soft radial sprites drawn with smoothing on, additive)
  const glowCache = {};
  function glowImg(color) {
    let c = glowCache[color];
    if (c) return c;
    c = mk(64, 64);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(color, 1));
    gr.addColorStop(0.22, rgba(color, 0.6));
    gr.addColorStop(0.55, rgba(color, 0.18));
    gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    glowCache[color] = c;
    return c;
  }
  let baseAlpha = 1; // crossfade multiplier for the background pass
  function glow(g, color, x, y, r, a) {
    if (!(a > 0.004) || !(r > 0.5)) return;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = Math.min(1, a) * baseAlpha;
    g.imageSmoothingEnabled = true;
    g.drawImage(glowImg(color), x - r, y - r, r * 2, r * 2);
    g.imageSmoothingEnabled = false;
    g.globalAlpha = baseAlpha;
    g.globalCompositeOperation = 'source-over';
  }

  // ================================================================== theme art helpers
  function pillar(g, x, w, top, bottom, c) {
    rect(g, x, top, w, bottom - top, c.base);
    rect(g, x, top, 2, bottom - top, c.hi);
    rect(g, x + w - 3, top, 3, bottom - top, c.lo);
    for (let y = top + 34; y < bottom - 14; y += 15) {
      rect(g, x, y, w, 1, c.dark);
      rect(g, x + 2, y + 1, w - 5, 1, shade(c.base, 0.07));
    }
    rect(g, x - 3, top + 16, w + 6, 7, c.cap);
    rect(g, x - 3, top + 16, w + 6, 1, c.hi);
    rect(g, x - 3, top + 22, w + 6, 1, c.dark);
    rect(g, x - 1, top + 23, w + 2, 2, c.lo);
    rect(g, x - 2, bottom - 13, w + 4, 3, c.cap);
    rect(g, x - 4, bottom - 10, w + 8, 10, c.cap);
    rect(g, x - 4, bottom - 10, w + 8, 1, c.hi);
    rect(g, x + w + 1, bottom - 10, 3, 10, c.lo);
  }
  function chain(g, x, y, len, c1, c2) {
    for (let i = 0; i < len; i += 4) {
      if ((i / 4) % 2 === 0) {
        rect(g, x - 1, y + i, 3, 1, c1);
        rect(g, x - 1, y + i + 3, 3, 1, c1);
        rect(g, x - 1, y + i + 1, 1, 2, c1);
        rect(g, x + 1, y + i + 1, 1, 2, c1);
      } else {
        rect(g, x, y + i - 1, 1, 6, c2);
      }
    }
  }
  function cobweb(g, cx, cy, dx, dy, s, color) {
    g.fillStyle = color;
    const rays = [[1, 0], [0.92, 0.4], [0.7, 0.72], [0.4, 0.92], [0, 1]];
    for (const r of rays) line(g, cx, cy, cx + dx * r[0] * s, cy + dy * r[1] * s);
    for (const f of [0.33, 0.62, 0.92]) {
      for (let i = 0; i < rays.length - 1; i++) {
        const a = rays[i];
        const b = rays[i + 1];
        line(g, cx + dx * a[0] * s * f, cy + dy * a[1] * s * f, cx + dx * b[0] * s * f * 0.94, cy + dy * b[1] * s * f * 0.94);
      }
    }
  }
  function hangBanner(g, x, y, w, h, body, trim, dark) {
    rect(g, x - 3, y - 2, w + 6, 2, '#5a4a32');
    rect(g, x - 5, y - 3, 2, 4, '#8a7448');
    rect(g, x + w + 3, y - 3, 2, 4, '#8a7448');
    rect(g, x, y, w, h, body);
    rect(g, x, y, 1, h, trim);
    rect(g, x + w - 1, y, 1, h, trim);
    rect(g, x, y + 3, w, 1, trim);
    rect(g, x + w - 4, y + 4, 2, h - 4, dark);
    const cx = x + (w >> 1);
    const cy = y + Math.round(h * 0.42);
    for (let i = 0; i < 4; i++) rect(g, cx - i, cy - 3 + i, 1 + i * 2, 1, trim);
    for (let i = 0; i < 3; i++) rect(g, cx - 2 + i, cy + 1 + i, 5 - 2 * i, 1, trim);
    for (let i = 0; i < w; i++) {
      const m = i % 6;
      const tri = m < 3 ? m : 5 - m;
      const d = Math.floor(hash(i, x | 0, 3) * 3) + tri * 2;
      rect(g, x + i, y + h, 1, d, body);
    }
    rect(g, x + 3, y + h - 8, 1, 2, dark);
    rect(g, x + w - 6, y + 12, 1, 1, dark);
  }
  function skull(g, x, y, bone, dark) {
    rect(g, x - 3, y - 6, 7, 5, bone);
    rect(g, x - 2, y - 7, 5, 1, bone);
    rect(g, x - 2, y - 1, 5, 2, bone);
    rect(g, x - 2, y - 4, 2, 2, dark);
    rect(g, x + 1, y - 4, 2, 2, dark);
    rect(g, x, y - 2, 1, 1, dark);
    rect(g, x - 1, y, 1, 1, dark);
    rect(g, x + 1, y, 1, 1, dark);
  }
  function bone(g, x, y, c) {
    rect(g, x, y, 7, 1, c);
    rect(g, x - 1, y - 1, 2, 1, c);
    rect(g, x - 1, y + 1, 2, 1, c);
    rect(g, x + 6, y - 1, 2, 1, c);
    rect(g, x + 6, y + 1, 2, 1, c);
  }
  function smallMushroom(g, x, y, h, cap, stem, spot) {
    rect(g, x, y - h, 2, h, stem);
    halfEllipse(g, x + 1, y - h, 4, 3, cap);
    rect(g, x - 2, y - h - 1, 1, 1, spot);
    rect(g, x + 2, y - h - 2, 1, 1, spot);
  }
  function giantMushroom(g, x, h, capW, capH, cap, capHi, capDark, spot, stem, stemDark) {
    const base = 160;
    const top = base - h;
    for (let y = top; y < base; y++) {
      const t = (y - top) / h;
      const sw = Math.round(5 + t * t * 6);
      rect(g, x - sw, y, sw * 2, 1, stem);
      rect(g, x + sw - 3, y, 3, 1, stemDark);
    }
    rect(g, x - 7, top + 10, 14, 3, shade(stem, -0.1));
    rect(g, x - 8, top + 13, 16, 1, stemDark);
    halfEllipse(g, x, top + 2, capW / 2, capH, cap);
    rect(g, x - capW / 2 + 1, top + 1, capW - 2, 3, capDark);
    halfEllipse(g, x - 3, top - capH * 0.35, capW * 0.3, capH * 0.45, capHi);
    const r = seeded(strHash('m' + x + h));
    for (let i = 0; i < 6; i++) {
      const sx = x + (r() - 0.5) * capW * 0.75;
      const sy = top - 2 - r() * capH * 0.75;
      ellipse(g, sx, sy, 1.6, 1.2, spot);
    }
  }
  function tombstone(g, x, y, w, h, c, hi, lo, kind) {
    if (kind === 'cross') {
      rect(g, x + w / 2 - 2, y - h, 4, h, c);
      rect(g, x, y - h + 5, w, 4, c);
      rect(g, x + w / 2 - 2, y - h, 1, h, hi);
      rect(g, x, y - h + 5, w, 1, hi);
      rect(g, x + w / 2 + 1, y - h, 1, h, lo);
      return;
    }
    rect(g, x, y - h + 4, w, h - 4, c);
    halfEllipse(g, x + w / 2 - 0.5, y - h + 4, w / 2, 4, c);
    rect(g, x, y - h + 4, 1, h - 4, hi);
    rect(g, x + w - 2, y - h + 4, 2, h - 4, lo);
    rect(g, x + 3, y - h + 8, w - 6, 1, lo);
    rect(g, x + 3, y - h + 11, w - 7, 1, lo);
    rect(g, x - 1, y - 1, w + 2, 2, shade(c, -0.25));
  }
  function deadTree(g, x, base, h, c) {
    const r = seeded(strHash('tree' + x));
    for (let y = 0; y < h; y++) {
      const w = Math.max(2, Math.round(5 - (y / h) * 3));
      rect(g, x - (w >> 1) + Math.round(Math.sin(y * 0.08) * 1.5), base - y, w, 1, c);
    }
    const branch = (bx, by, len, dir, depth) => {
      let px = bx;
      let py = by;
      for (let i = 0; i < len; i++) {
        px += dir * (0.8 + r() * 0.4);
        py -= 0.5 + r() * 0.7;
        rect(g, px, py, depth > 0 ? 2 : 1, 1, c);
      }
      if (depth > 0) {
        branch(px, py, len * 0.6, dir, depth - 1);
        branch(px, py, len * 0.5, -dir * 0.6, depth - 1);
      }
    };
    branch(x, base - h * 0.55, h * 0.35, -1, 2);
    branch(x, base - h * 0.75, h * 0.3, 1, 2);
    branch(x, base - h + 2, h * 0.2, 0.4, 1);
  }
  function fence(g, x0, x1, y, h, c, hi) {
    rect(g, x0, y - h + 4, x1 - x0, 1, c);
    rect(g, x0, y - 6, x1 - x0, 1, c);
    for (let x = x0; x < x1; x += 4) {
      rect(g, x, y - h, 1, h, c);
      rect(g, x - 1, y - h + 1, 3, 1, c);
      rect(g, x, y - h - 1, 1, 1, hi);
    }
  }
  function signGlyphs(g, x, y, w, h, color, seed) {
    const r = seeded(seed);
    for (let gx = x; gx < x + w - 3; gx += 5) {
      for (let k2 = 0; k2 < 4; k2++) {
        if (r() < 0.55) rect(g, gx + Math.floor(r() * 3), y + Math.floor(r() * Math.max(1, h - 1)), 1 + Math.floor(r() * 2), 1, color);
      }
    }
  }
  function neonSign(g, x, y, w, h, color, seed) {
    rect(g, x - 1, y - 1, w + 2, h + 2, '#05050f');
    rect(g, x, y, w, h, '#0b0b22');
    g.fillStyle = color;
    g.fillRect(x, y, w, 1);
    g.fillRect(x, y + h - 1, w, 1);
    g.fillRect(x, y, 1, h);
    g.fillRect(x + w - 1, y, 1, h);
    signGlyphs(g, x + 3, y + 3, w - 4, h - 5, shade(color, 0.35), seed);
  }
  function rockChunk(w, h, seed, base, hi, lo, crystal) {
    return layerCanvas(w, h + 6, (g) => {
      const r = seeded(seed);
      ellipse(g, w / 2, h * 0.45 + 3, w / 2 - 1, h * 0.35, base);
      for (let i = 0; i < 5; i++) ellipse(g, w * (0.2 + r() * 0.6), 3 + h * (0.3 + r() * 0.4), 2 + r() * w * 0.2, 1.5 + r() * 2, base);
      spike(g, w / 2 + (r() - 0.5) * 4, h * 0.62 + 3, w * 0.55, h * 0.5, lo, true);
      rect(g, w * 0.2, 3 + h * 0.15, w * 0.6, 1, hi);
      if (crystal) {
        spike(g, w * 0.35, 4 + h * 0.2, 3, 5, crystal, false);
        spike(g, w * 0.55, 4 + h * 0.18, 2, 4, shade(crystal, 0.3), false);
      }
    });
  }

  // gears: pre-rendered rotation frames covering one tooth pitch
  function gearFrames(R, teeth, body, rim, hub, frames) {
    const out = [];
    const size = R * 2 + 3;
    const ri = R - 3;
    const hole = Math.max(2, Math.round(R * 0.22));
    const cb = hexRgb(body);
    const cr = hexRgb(rim);
    const ch = hexRgb(hub);
    for (let f = 0; f < frames; f++) {
      const c = mk(size, size);
      const g = c.getContext('2d');
      const img = g.createImageData(size, size);
      const rot = (f / frames) * ((Math.PI * 2) / teeth);
      const cx = size / 2;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - cx;
          const r = Math.sqrt(dx * dx + dy * dy);
          let a = Math.atan2(dy, dx) - rot;
          a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          const toothPhase = ((a / (Math.PI * 2)) * teeth) % 1;
          const tooth = toothPhase > 0.15 && toothPhase < 0.6;
          const inside = r <= ri || (r <= R && tooth);
          if (!inside || r < hole) continue;
          const spokeA = ((a % ((Math.PI * 2) / 5)) + Math.PI * 2) % ((Math.PI * 2) / 5);
          const window = r > hole + 3 && r < ri - 4 && spokeA > 0.32 && spokeA < (Math.PI * 2) / 5 - 0.32;
          if (window) continue;
          let col = cb;
          if (r > ri - 1.6 || r < hole + 2) col = cr;
          if (r < hole + 1.2) col = ch;
          const i4 = (y * size + x) * 4;
          img.data[i4] = col[0];
          img.data[i4 + 1] = col[1];
          img.data[i4 + 2] = col[2];
          img.data[i4 + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      out.push(c);
    }
    return out;
  }
  function drawGear(g, frames, x, y, t, speed, teeth) {
    if (!frames || !frames.length) return;
    const pitch = (Math.PI * 2) / teeth;
    const ang = t * speed;
    const p = ((ang % pitch) + pitch) % pitch;
    const fr = frames[Math.floor((p / pitch) * frames.length) % frames.length];
    g.drawImage(fr, Math.round(x - fr.width / 2), Math.round(y - fr.height / 2));
  }

  // ---- pixel flames for torches / braziers
  function flame(g, x, y, t, ph, outer, mid, core, scale) {
    const f = Math.sin(t * 17 + ph) * 0.5 + Math.sin(t * 29 + ph * 1.7) * 0.5;
    const h = Math.max(3, Math.round((6 + f * 1.6) * scale));
    for (let i = 0; i < h; i++) {
      const p = i / h;
      const sway = Math.round(Math.sin(t * 13 + i * 0.9 + ph) * p * 1.3);
      const wo = Math.max(1, Math.round((1 - p * p) * 2.6 * scale));
      rect(g, x - wo + sway, y - i, wo * 2, 1, outer);
      if (p < 0.75) {
        const wm = Math.max(1, wo - 1);
        rect(g, x - wm + sway, y - i, wm * 2, 1, mid);
      }
      if (p < 0.45 && wo > 1) rect(g, x - 1 + sway, y - i, 2, 1, core);
    }
  }

  // ================================================================== themes
  // Each theme: static cached layers (sky, far 0.2×, mid 0.5×, floor 1×) + light sources + dynamic
  // extras (gears, stars, rocks, lava) + ambient particles. Built lazily on first use.
  const themes = {};
  function baseTheme(id) {
    return {
      id: id,
      sky: null,
      far: null,
      farP: 256,
      mid: null,
      midP: 384,
      floor: null,
      floorP: 128,
      floorGlow: null,
      floorGlowColor: null,
      lights: [],
      lightP: 192,
      farLights: [],
      midLights: [],
      fog: null,
      ambient: null,
      extraFar: null,
      extraMid: null,
      extraSky: null,
      overlay: null,
      vents: null,
      accent: '#5ef3ff',
      bottom: '#08060c',
      kill: '#cfc9b6',
    };
  }
  function fogTile(color, a, seed) {
    return layerCanvas(256, 48, (g, P) => {
      const r = seeded(seed);
      g.globalAlpha = a;
      for (let i = 0; i < 26; i++) {
        const x = r() * P;
        const y = 14 + r() * 26;
        const rx = 14 + r() * 26;
        wrap3(P, (o) => ellipse(g, x + o, y, rx, 3 + r() * 5, color));
      }
      g.globalAlpha = 1;
    });
  }

  function buildCrypt(T) {
    T.farOpaque = true;
    T.accent = '#5dffc0';
    T.bottom = '#0b0a10';
    T.sky = skyCanvas([[0, '#08070d'], [0.6, '#15131d'], [1, '#1c1a26']]);
    T.far = layerCanvas(T.farP, 170, (g, P) => {
      bricks(g, P, 0, 170, {
        bw: 16, bh: 8, colors: ['#22212b', '#25242f', '#282733', '#23222d', '#2b2a36'],
        mortar: '#141319', hi: '#2f2e3a', seed: 11, chip: 0.2, chipC: '#18171f',
      });
      for (const ax of [36, 164]) {
        wrap3(P, (o) => {
          const x = ax + o;
          const y = 64;
          ellipse(g, x + 13, y + 12, 16, 14, '#3a3946');
          rect(g, x - 3, y + 12, 32, 40, '#3a3946');
          ellipse(g, x + 13, y + 12, 13, 11, '#0c0b11');
          rect(g, x, y + 12, 26, 38, '#0c0b11');
          rect(g, x - 4, y + 50, 34, 3, '#4a495a');
          rect(g, x - 4, y + 53, 34, 1, '#1b1a22');
          if (ax === 36) {
            skull(g, x + 8, y + 49, '#cfc9b6', '#0c0b11');
            skull(g, x + 18, y + 49, '#bdb7a4', '#0c0b11');
            skull(g, x + 13, y + 43, '#d8d2c0', '#0c0b11');
          } else {
            rect(g, x + 7, y + 41, 3, 9, '#d8d0b8');
            rect(g, x + 16, y + 38, 3, 12, '#cfc7ad');
            rect(g, x + 8, y + 39, 1, 2, '#ffd36b');
            rect(g, x + 17, y + 36, 1, 2, '#ffd36b');
          }
          cobweb(g, x - 2, y + 2, 1, 1, 11, 'rgba(190,190,210,0.28)');
        });
      }
      const r = seeded(77);
      for (let i = 0; i < 6; i++) {
        let x = r() * P;
        let y = 10 + r() * 120;
        g.fillStyle = '#121118';
        for (let s = 0; s < 9; s++) {
          x += (r() - 0.5) * 3;
          y += 1 + r() * 2;
          g.fillRect(Math.round(x), Math.round(y), 1, 2);
        }
      }
      blobs(g, P, 128, 30, 18, ['#1f2a26', '#22302a'], 2, 6, 5);
      vfade(g, 0, 0, P, 44, '#050409', 0.92, 0);
      vfade(g, 0, 118, P, 52, '#0b0a10', 0, 0.75);
    });
    T.mid = layerCanvas(T.midP, 162, (g, P) => {
      const pc = { base: '#383745', hi: '#4b4a5a', lo: '#2a2935', dark: '#232230', cap: '#41404f' };
      wrap3(P, (o) => {
        pillar(g, 60 + o, 22, 0, 162, pc);
        pillar(g, 252 + o, 22, 0, 162, pc);
        hangBanner(g, 140 + o, 26, 22, 56, '#1d4441', '#5dffc0', '#12302d');
        hangBanner(g, 322 + o, 32, 18, 44, '#3d1f2e', '#c9a35a', '#2a1420');
        chain(g, 112 + o, 0, 44, '#3a3a44', '#55555f');
        chain(g, 206 + o, 0, 30, '#3a3a44', '#55555f');
        cobweb(g, 85 + o, 25, 1, 1, 16, 'rgba(200,200,220,0.3)');
        cobweb(g, 56 + o, 25, -1, 1, 12, 'rgba(200,200,220,0.25)');
        cobweb(g, 277 + o, 25, 1, 1, 13, 'rgba(200,200,220,0.28)');
      });
      blobs(g, P, 120, 40, 10, ['#2e4a3e', '#35584a'], 1, 3, 9);
    });
    T.floor = layerCanvas(T.floorP, FLOOR_H, (g, P) => {
      rect(g, 0, 0, P, FLOOR_H, '#2a2935');
      for (let i = 0; i < 4; i++) {
        const v = hash(i, 1, 41);
        rect(g, i * 32, 2, 31, 8, ['#3d3c4b', '#403f4e', '#3a3947'][Math.floor(v * 3)]);
        rect(g, i * 32 + 16, 10, 31, 8, ['#373645', '#3b3a49', '#353442'][Math.floor(hash(i, 2, 41) * 3)]);
        rect(g, i * 32, 2, 31, 1, '#4d4c5e');
        rect(g, i * 32 + 16, 10, 31, 1, '#454456');
        rect(g, i * 32 + 31, 2, 1, 8, '#22212b');
        rect(g, ((i * 32 + 47) % P), 10, 1, 8, '#22212b');
      }
      rect(g, 0, 15, 16, 3, '#353442');
      rect(g, 0, 0, P, 2, '#5c5b70');
      rect(g, 0, 18, P, 1, '#121118');
      bricks(g, P, 19, FLOOR_H - 19, {
        bw: 16, bh: 7, colors: ['#25242f', '#282733', '#2a2935', '#23222c'], mortar: '#141319', hi: '#302f3b', seed: 5,
      });
      rect(g, 0, 19, P, 1, '#3a3947');
      bone(g, 48, 13, '#bdb7a4');
      skull(g, 102, 15, '#cfc9b6', '#2a2935');
      rect(g, 20, 6, 2, 1, '#55546a');
      rect(g, 84, 12, 3, 1, '#2c2b38');
      vfade(g, 0, 22, P, FLOOR_H - 22, '#060509', 0, 0.85);
    });
    T.lights = [{ x: 70, kind: 'torch', color: '#5dffc0', mid: '#2fd39a', core: '#eafff7', pole: '#2a2930', r: 50 }];
    T.fog = { tile: fogTile('#3d6660', 0.18, 3), y: 122, speed: 0.7, drift: 3 };
    T.ambient = { rate: 6, kind: 'dust', colors: ['#8a87a3', '#6f6c88', '#a9a6c0'] };
    T.kill = KILL_TINT.crypt;
  }

  function buildFungal(T) {
    T.farOpaque = true;
    T.accent = '#c77dff';
    T.bottom = '#0a0714';
    T.sky = skyCanvas([[0, '#07050f'], [0.55, '#150f26'], [1, '#22183a']]);
    T.far = layerCanvas(T.farP, 170, (g, P) => {
      rect(g, 0, 0, P, 170, '#1b1530');
      blobs(g, P, 0, 170, 80, ['#211a37', '#251d3d', '#1a1430', '#2a2144', '#1e1734'], 6, 18, 21);
      const r = seeded(22);
      for (let i = 0; i < 10; i++) {
        const x = r() * P;
        const w = 4 + r() * 8;
        const h = 10 + r() * 26;
        wrap3(P, (o) => spike(g, x + o, 0, w, h, '#120d22', true));
      }
      for (const m of [[40, 34, 30], [120, 22, 22], [200, 40, 36]]) {
        wrap3(P, (o) => {
          rect(g, m[0] + o - 2, 160 - m[1], 4, m[1], '#2a1f45');
          halfEllipse(g, m[0] + o, 160 - m[1], m[2] / 2, 8, '#2f2350');
        });
      }
      for (let i = 0; i < 40; i++) {
        const x = Math.floor(r() * P);
        const y = Math.floor(10 + r() * 140);
        const c = r() < 0.5 ? '#7fffd4' : '#e08bff';
        rect(g, x, y, 1, 1, c);
        if (r() < 0.3) {
          rect(g, x - 1, y, 1, 1, rgba(c, 0.35));
          rect(g, x + 1, y, 1, 1, rgba(c, 0.35));
        }
      }
      vfade(g, 0, 0, P, 40, '#05030a', 0.85, 0);
      vfade(g, 0, 120, P, 50, '#0e0a1a', 0, 0.7);
    });
    T.mid = layerCanvas(T.midP, 162, (g, P) => {
      const r = seeded(31);
      for (let i = 0; i < 9; i++) {
        const x = r() * P;
        const len = 18 + r() * 50;
        wrap3(P, (o) => {
          let vx = x + o;
          for (let y = 0; y < len; y++) {
            vx += Math.sin(y * 0.3 + i) * 0.35;
            rect(g, vx, y, 1, 1, '#2f6b45');
            if (y % 7 === 3) rect(g, vx + 1, y, 2, 1, '#4f9a5c');
            if (y % 7 === 6) rect(g, vx - 2, y, 2, 1, '#3e8a5a');
          }
        });
      }
      wrap3(P, (o) => {
        giantMushroom(g, 52 + o, 92, 60, 22, '#9b3fc4', '#c56be6', '#5e2280', '#ffd6ff', '#cfc0dc', '#9a88ad');
        giantMushroom(g, 196 + o, 58, 42, 16, '#2a9d8f', '#4fd1c0', '#1b6a61', '#d6fff8', '#c8c0d6', '#968aa8');
        giantMushroom(g, 312 + o, 114, 70, 24, '#c2408f', '#e86ab4', '#7a2258', '#ffe0f2', '#d6c6df', '#a08fb0');
      });
      blobs(g, P, 150, 12, 14, ['#3c6e4a', '#4f8a5c'], 2, 5, 33);
    });
    T.midLights = [
      { x: 52, y: 62, r: 34, color: '#c56be6', kind: 'pulse', ph: 0 },
      { x: 196, y: 98, r: 26, color: '#4fd1c0', kind: 'pulse', ph: 2 },
      { x: 312, y: 40, r: 38, color: '#e86ab4', kind: 'pulse', ph: 4 },
    ];
    T.floor = layerCanvas(T.floorP, FLOOR_H, (g, P) => {
      rect(g, 0, 0, P, FLOOR_H, '#221a33');
      rect(g, 0, 2, P, 16, '#2d2340');
      blobs(g, P, 3, 14, 16, ['#33284a', '#2a2140', '#392c52'], 2, 6, 41);
      for (let x = 0; x < P; x++) {
        const hgt = 1 + Math.floor(hash(x, 7, 42) * 3) + (x % 9 < 2 ? 1 : 0);
        rect(g, x, 3 - hgt, 1, hgt + 1, hash(x, 8, 42) < 0.5 ? '#4f8a5c' : '#3f6e4a');
        if (hash(x, 9, 42) < 0.18) rect(g, x, 3 - hgt - 1, 1, 1, '#6fbf7a');
      }
      rect(g, 0, 4, P, 1, '#3c5a44');
      smallMushroom(g, 22, 12, 3, '#5ff5e0', '#cfc0dc', '#e6fffb');
      smallMushroom(g, 90, 15, 2, '#ff7bf0', '#cfc0dc', '#ffe0fb');
      smallMushroom(g, 96, 14, 3, '#ff7bf0', '#cfc0dc', '#ffe0fb');
      rect(g, 0, 18, P, 1, '#120d1f');
      rect(g, 0, 19, P, FLOOR_H - 19, '#1d1530');
      blobs(g, P, 20, FLOOR_H - 20, 22, ['#241a3a', '#18122a', '#2a1f40'], 2, 5, 43);
      const r = seeded(44);
      for (let i = 0; i < 5; i++) {
        let x = r() * P;
        for (let y = 19; y < 19 + 10 + r() * 14; y++) {
          x += (r() - 0.5) * 1.6;
          rect(g, x, y, 1, 1, '#3a2a20');
        }
      }
      vfade(g, 0, 22, P, FLOOR_H - 22, '#05030a', 0, 0.85);
    });
    T.lights = [{ x: 60, kind: 'shroom', color: '#5ff5e0', alt: '#ff7bf0', r: 38 }];
    T.lightP = 176;
    T.fog = { tile: fogTile('#6a3f8a', 0.2, 13), y: 124, speed: 0.65, drift: 4 };
    T.midTint = ['#140f26', 0.34];
    T.ambient = { rate: 11, kind: 'spore', colors: ['#c77dff', '#7dffcf', '#ffd6ff'] };
    T.kill = KILL_TINT.fungal;
  }

  function buildForge(T) {
    T.farOpaque = true;
    T.accent = '#ff7b2e';
    T.bottom = '#120505';
    T.sky = skyCanvas([[0, '#0b0404'], [0.55, '#220906'], [1, '#4a1409']]);
    T.far = layerCanvas(T.farP, 170, (g, P) => {
      bricks(g, P, 0, 170, {
        bw: 32, bh: 12, colors: ['#2a120d', '#2f150f', '#331811', '#271009', '#2c130c'],
        mortar: '#170806', hi: '#3d1d14', seed: 61, chip: 0.25, chipC: '#1a0907',
      });
      for (const fx of [64, 192]) {
        wrap3(P, (o) => {
          const x = fx + o;
          rect(g, x - 5, 0, 10, 160, '#5a1a0a');
          rect(g, x - 4, 0, 8, 160, '#c2410c');
          rect(g, x - 2, 0, 4, 160, '#ff7b2e');
          rect(g, x - 1, 0, 1, 160, '#ffd27a');
          ellipse(g, x, 160, 16, 4, '#c2410c');
          ellipse(g, x, 160, 11, 2, '#ff9a3c');
        });
      }
      vfade(g, 0, 0, P, 40, '#060202', 0.9, 0);
      vfade(g, 0, 110, P, 60, '#ff5a1f', 0, 0.22);
    });
    T.farLights = [
      { x: 64, y: 150, r: 34, color: '#ff7b2e', kind: 'pulse', ph: 0 },
      { x: 192, y: 150, r: 34, color: '#ff7b2e', kind: 'pulse', ph: 1.7 },
    ];
    T.extraFar = function (g, t, off) {
      for (const fx of [64, 192]) {
        let x = fx - (off % T.farP);
        while (x < -20) x += T.farP;
        for (; x < W + 20; x += T.farP) {
          for (let i = 0; i < 7; i++) {
            const y = (t * 46 + i * 23 + fx) % 160;
            rect(g, x - 1 + (i % 2), y, 1, 3, '#fff0b0');
          }
        }
      }
    };
    T.mid = layerCanvas(T.midP, 162, (g, P) => {
      const pc = { base: '#2b1a16', hi: '#4a2a20', lo: '#1a0f0c', dark: '#140b09', cap: '#3a221b' };
      wrap3(P, (o) => {
        pillar(g, 86 + o, 20, 0, 162, pc);
        pillar(g, 296 + o, 20, 0, 162, pc);
        for (const px of [86, 296]) {
          rect(g, px + o + 8, 60, 4, 10, '#ff7b2e');
          rect(g, px + o + 9, 62, 2, 6, '#ffd27a');
          rect(g, px + o + 8, 100, 4, 10, '#ff7b2e');
          rect(g, px + o + 9, 102, 2, 6, '#ffd27a');
        }
        chain(g, 150 + o, 0, 64, '#3c3a40', '#55535c');
        chain(g, 166 + o, 0, 40, '#3c3a40', '#55535c');
        chain(g, 352 + o, 0, 52, '#3c3a40', '#55535c');
        rect(g, 147 + o, 64, 7, 3, '#55535c');
        rect(g, 150 + o, 67, 2, 3, '#55535c');
        const fx2 = 200 + o;
        rect(g, fx2, 96, 64, 66, '#3a1a12');
        for (let yy = 96; yy < 162; yy += 6) for (let xx = fx2 + ((yy / 6) % 2) * 4; xx < fx2 + 64; xx += 8) rect(g, xx, yy, 7, 5, (xx + yy) % 3 ? '#4a2216' : '#42200f');
        halfEllipse(g, fx2 + 32, 130, 20, 18, '#1a0806');
        rect(g, fx2 + 12, 130, 41, 32, '#1a0806');
        halfEllipse(g, fx2 + 32, 134, 16, 12, '#c2410c');
        rect(g, fx2 + 16, 134, 33, 28, '#c2410c');
        halfEllipse(g, fx2 + 32, 140, 11, 8, '#ff7b2e');
        rect(g, fx2 + 21, 140, 23, 22, '#ff7b2e');
        rect(g, fx2 + 25, 148, 15, 14, '#ffd27a');
        rect(g, fx2 - 2, 92, 68, 5, '#2a120d');
        rect(g, fx2 - 2, 92, 68, 1, '#5a2a1a');
      });
    });
    T.midLights = [
      { x: 232, y: 150, r: 46, color: '#ff7b2e', kind: 'pulse', ph: 0.5 },
      { x: 96, y: 85, r: 14, color: '#ff7b2e', kind: 'pulse', ph: 1 },
      { x: 306, y: 85, r: 14, color: '#ff7b2e', kind: 'pulse', ph: 2 },
    ];
    const cracks = [];
    const cr = seeded(71);
    for (let i = 0; i < 6; i++) {
      const pts = [];
      let x = cr() * T.floorP;
      let y = 3 + cr() * 12;
      for (let s = 0; s < 6; s++) {
        pts.push([x, y]);
        x += 3 + cr() * 6;
        y += (cr() - 0.45) * 7;
        y = clamp(y, 3, FLOOR_H - 6);
      }
      cracks.push(pts);
    }
    const drawCracks = (g, P, c1, c2) => {
      for (const pts of cracks) {
        wrap3(P, (o) => {
          for (let i = 1; i < pts.length; i++) {
            line(g, pts[i - 1][0] + o, pts[i - 1][1], pts[i][0] + o, pts[i][1], c1);
            if (c2) line(g, pts[i - 1][0] + o, pts[i - 1][1] + 1, pts[i][0] + o, pts[i][1] + 1, c2);
          }
        });
      }
    };
    T.floor = layerCanvas(T.floorP, FLOOR_H, (g, P) => {
      rect(g, 0, 0, P, FLOOR_H, '#1f0e0a');
      for (let i = 0; i < 4; i++) {
        rect(g, i * 32, 2, 31, 16, ['#2e1610', '#2a140e', '#321912'][Math.floor(hash(i, 3, 71) * 3)]);
        rect(g, i * 32, 2, 31, 1, '#4a2418');
        rect(g, i * 32 + 31, 2, 1, 16, '#170806');
      }
      rect(g, 0, 0, P, 2, '#5a2a1a');
      rect(g, 0, 18, P, 1, '#120504');
      bricks(g, P, 19, FLOOR_H - 19, { bw: 32, bh: 9, colors: ['#25100b', '#2a130d', '#22100a'], mortar: '#140605', hi: '#341912', seed: 72 });
      drawCracks(g, P, '#7a2a10', '#3a1208');
      vfade(g, 0, 26, P, FLOOR_H - 26, '#060202', 0, 0.8);
    });
    T.floorGlow = layerCanvas(T.floorP, FLOOR_H, (g, P) => drawCracks(g, P, '#ff8a2e', null));
    T.floorGlowColor = '#ff7b2e';
    T.lights = [{ x: 96, kind: 'brazier', color: '#ff8a2e', mid: '#ffb347', core: '#fff0b0', pole: '#2a1a16', r: 54 }];
    T.ambient = { rate: 18, kind: 'ember', colors: ['#ff7b2e', '#ffb347', '#ffd27a'] };
    T.kill = KILL_TINT.forge;
  }

  function buildClockwork(T) {
    T.farOpaque = true;
    T.accent = '#e0b04a';
    T.bottom = '#0b0906';
    T.sky = skyCanvas([[0, '#0a0805'], [0.6, '#18130b'], [1, '#241c11']]);
    const farGear = gearFrames(30, 12, '#2c2416', '#382e1c', '#1d170d', 6);
    const farGear2 = gearFrames(20, 9, '#2a2215', '#362c1b', '#1d170d', 6);
    const midGear = gearFrames(22, 10, '#8a6a2e', '#c49a48', '#4a3818', 6);
    const midGear2 = gearFrames(14, 8, '#7a5c26', '#b08a40', '#4a3818', 6);
    T.far = layerCanvas(T.farP, 170, (g, P) => {
      bricks(g, P, 0, 170, {
        bw: 32, bh: 20, colors: ['#2c2417', '#30281a', '#2a2215', '#2e2618'], mortar: '#17120b', hi: '#3a301f', lo: '#231c11', seed: 81,
      });
      for (let y = 0; y < 170; y += 20) {
        for (let x = 0; x < P; x += 32) {
          const xo = (y / 20) % 2 ? 16 : 0;
          for (const d of [[3, 3], [26, 3], [3, 15], [26, 15]]) {
            const rx = (x + xo + d[0]) % P;
            rect(g, rx, y + d[1], 2, 2, '#4e3f24');
            rect(g, rx, y + d[1], 1, 1, '#7a6236');
          }
        }
      }
      vfade(g, 0, 0, P, 40, '#050403', 0.9, 0);
      vfade(g, 0, 118, P, 52, '#0b0906', 0, 0.7);
    });
    T.extraFar = function (g, t, off) {
      const list = [[60, 56, farGear, 0.25, 12], [190, 116, farGear2, -0.4, 9], [236, 30, farGear2, 0.35, 9]];
      for (const it of list) {
        let x = it[0] - (off % T.farP);
        while (x < -40) x += T.farP;
        for (; x < W + 40; x += T.farP) drawGear(g, it[2], x, it[1], t, it[3], it[4]);
      }
    };
    T.mid = layerCanvas(T.midP, 162, (g, P) => {
      const pipe = (x, y, w, h, vertical) => {
        rect(g, x, y, w, h, '#9a5b2a');
        if (vertical) {
          rect(g, x + 1, y, 2, h, '#d08a4a');
          rect(g, x + w - 2, y, 2, h, '#5e3418');
        } else {
          rect(g, x, y + 1, w, 2, '#d08a4a');
          rect(g, x, y + h - 2, w, 2, '#5e3418');
        }
      };
      pipe(0, 28, P, 9, false);
      for (let x = 20; x < P; x += 64) {
        rect(g, x, 26, 5, 13, '#6e4420');
        rect(g, x, 26, 5, 1, '#e0a060');
      }
      pipe(0, 126, P, 5, false);
      wrap3(P, (o) => {
        pipe(108 + o, 37, 9, 125, true);
        pipe(300 + o, 37, 9, 125, true);
        for (const vx of [108, 300]) {
          for (const fy of [60, 104, 146]) {
            rect(g, vx + o - 2, fy, 13, 4, '#6e4420');
            rect(g, vx + o - 2, fy, 13, 1, '#e0a060');
          }
        }
        // valve wheel
        ellipse(g, 304 + o, 88, 8, 8, '#b8322a');
        ellipse(g, 304 + o, 88, 6, 6, '#9a5b2a');
        rect(g, 304 + o - 6, 87, 13, 2, '#e04a3a');
        rect(g, 303 + o, 81, 2, 15, '#e04a3a');
        ellipse(g, 304 + o, 88, 2, 2, '#5a1410');
        // gauge
        ellipse(g, 150 + o, 82, 9, 9, '#5e3418');
        ellipse(g, 150 + o, 82, 7, 7, '#e8dcb8');
        line(g, 150 + o, 82, 155 + o, 78, '#b8322a');
        rect(g, 149 + o, 81, 2, 2, '#2a1a0a');
        rect(g, 148 + o, 91, 4, 6, '#6e4420');
        // vent nozzle
        rect(g, 117 + o, 112, 7, 5, '#6e4420');
        rect(g, 122 + o, 111, 3, 7, '#4a2c14');
      });
    });
    T.extraMid = function (g, t, off) {
      const list = [[44, 92, midGear, 0.9, 10], [234, 64, midGear, -0.9, 10], [258, 92, midGear2, 1.4, 8]];
      for (const it of list) {
        let x = it[0] - (off % T.midP);
        while (x < -40) x += T.midP;
        for (; x < W + 40; x += T.midP) drawGear(g, it[2], x, it[1], t, it[3], it[4]);
      }
    };
    T.vents = { list: [[125, 114]], period: T.midP, par: 0.5, every: 2.6 };
    T.floor = layerCanvas(T.floorP, FLOOR_H, (g, P) => {
      rect(g, 0, 0, P, FLOOR_H, '#221c13');
      for (let i = 0; i < 4; i++) {
        rect(g, i * 32, 2, 31, 16, ['#3a3022', '#362d20', '#3d3324'][Math.floor(hash(i, 5, 91) * 3)]);
        for (let s = 0; s < 4; s++) rect(g, i * 32 + 3, 5 + s * 3, 25, 1, '#2c2418');
        rect(g, i * 32 + 1, 3, 2, 2, '#6e5a34');
        rect(g, i * 32 + 28, 3, 2, 2, '#6e5a34');
        rect(g, i * 32 + 1, 15, 2, 2, '#6e5a34');
        rect(g, i * 32 + 28, 15, 2, 2, '#6e5a34');
        rect(g, i * 32 + 31, 2, 1, 16, '#17120b');
      }
      rect(g, 0, 0, P, 2, '#e0b04a');
      rect(g, 0, 0, P, 1, '#ffd98a');
      rect(g, 0, 18, P, 2, '#c49a48');
      rect(g, 0, 20, P, 1, '#5e4a26');
      for (let x = 0; x < P; x += 8) {
        rect(g, x, 21, 7, FLOOR_H - 21, x % 16 ? '#2a2318' : '#262016');
        rect(g, x + 3, 24, 1, 1, '#5e4a26');
      }
      vfade(g, 0, 24, P, FLOOR_H - 24, '#050403', 0, 0.85);
    });
    T.lights = [{ x: 64, kind: 'lamp', color: '#ffd36b', core: '#fff6d6', pole: '#3a301f', r: 46 }];
    T.fog = { tile: fogTile('#d8c8a0', 0.08, 17), y: 120, speed: 0.75, drift: 6 };
    T.ambient = { rate: 5, kind: 'dust', colors: ['#c49a48', '#8a6a2e', '#e0c890'] };
    T.kill = KILL_TINT.clockwork;
  }

  function buildNeon(T) {
    T.accent = '#21e6ff';
    T.bottom = '#05051a';
    T.sky = skyCanvas([[0, '#04041a'], [0.45, '#0f0a2e'], [0.72, '#2a0d45'], [1, '#3a0d4a']], (g, w) => {
      const r = seeded(101);
      for (let i = 0; i < 40; i++) rect(g, Math.floor(r() * w), Math.floor(r() * 90), 1, 1, r() < 0.3 ? '#9ad8ff' : '#5a5a9a');
      const cx = 262;
      const cy = 112;
      const R = 38;
      for (let y = -R; y <= 0; y++) {
        const half = Math.round(R * Math.sqrt(1 - (y * y) / (R * R)));
        const t = (y + R) / R;
        const col = mix('#ffe066', '#ff3d8b', t);
        const gap = y > -R * 0.55 && (Math.abs(y) % 6 === 0 || (y > -R * 0.3 && Math.abs(y) % 3 === 0));
        if (!gap) rect(g, cx - half, cy + y, half * 2 + 1, 1, col);
      }
    });
    T.far = layerCanvas(T.farP, 170, (g, P) => {
      const r = seeded(102);
      let x = 0;
      const bs = [];
      while (x < P) {
        const w = 14 + Math.floor(r() * 22);
        const h = 40 + Math.floor(r() * 70);
        bs.push([x, w, h]);
        x += w + Math.floor(r() * 3);
      }
      const last = bs[bs.length - 1];
      last[1] = Math.max(6, P - last[0]);
      for (const b of bs) {
        const col = ['#0b0b24', '#0e0e2c', '#0a0a20', '#10102e'][Math.floor(r() * 4)];
        rect(g, b[0], 160 - b[2], b[1], b[2] + 10, col);
        rect(g, b[0], 160 - b[2], b[1], 1, '#1c1c48');
        if (r() < 0.4) rect(g, b[0] + Math.floor(b[1] / 2), 160 - b[2] - 6, 1, 6, '#1c1c48');
        for (let wy = 160 - b[2] + 4; wy < 156; wy += 4) {
          for (let wx = b[0] + 2; wx < b[0] + b[1] - 2; wx += 3) {
            const v = r();
            if (v < 0.22) rect(g, wx, wy, 1, 2, v < 0.08 ? '#21e6ff' : v < 0.14 ? '#ff3df2' : '#1a6f8a');
          }
        }
      }
      vfade(g, 0, 128, P, 42, '#1a0b33', 0, 0.8);
    });
    T.mid = layerCanvas(T.midP, 162, (g, P) => {
      wrap3(P, (o) => {
        rect(g, 40 + o, 20, 60, 142, '#0d0d26');
        rect(g, 40 + o, 20, 1, 142, '#1c1c48');
        rect(g, 99 + o, 20, 1, 142, '#07071a');
        neonSign(g, 48 + o, 36, 44, 18, '#ff3df2', 5);
        neonSign(g, 52 + o, 70, 36, 12, '#21e6ff', 7);
        rect(g, 186 + o, 0, 12, 162, '#101030');
        rect(g, 191 + o, 0, 2, 162, '#21e6ff');
        rect(g, 186 + o, 0, 1, 162, '#1c1c48');
        rect(g, 212 + o, 26, 16, 54, '#0b0b22');
        neonSign(g, 212 + o, 26, 16, 54, '#21e6ff', 9);
        rect(g, 286 + o, 50, 62, 112, '#0d0d26');
        rect(g, 286 + o, 50, 62, 1, '#1c1c48');
        neonSign(g, 296 + o, 62, 40, 15, '#ffd34d', 11);
        rect(g, 316 + o, 77, 2, 10, '#1c1c48');
      });
    });
    T.midLights = [
      { x: 70, y: 45, r: 30, color: '#ff3df2', kind: 'neon', ph: 1 },
      { x: 70, y: 76, r: 22, color: '#21e6ff', kind: 'neon', ph: 2 },
      { x: 192, y: 80, r: 20, color: '#21e6ff', kind: 'steady', ph: 0 },
      { x: 220, y: 53, r: 26, color: '#21e6ff', kind: 'neon', ph: 3 },
      { x: 316, y: 69, r: 28, color: '#ffd34d', kind: 'neon', ph: 4 },
    ];
    const grid = (g, P, bright, dim) => {
      rect(g, 0, 0, P, 1, bright);
      rect(g, 0, 5, P, 1, dim);
      rect(g, 0, 10, P, 1, dim);
      rect(g, 0, 17, P, 1, bright);
      for (let x = 0; x < P; x += 16) {
        wrap3(P, (o) => line(g, x + o, 1, x + o - 8, 17, dim));
      }
    };
    T.floor = layerCanvas(T.floorP, FLOOR_H, (g, P) => {
      rect(g, 0, 0, P, FLOOR_H, '#08081e');
      rect(g, 0, 1, P, 17, '#0d0d2a');
      grid(g, P, '#21e6ff', '#14607a');
      rect(g, 0, 18, P, 1, '#05050f');
      rect(g, 0, 22, P, 1, '#ff3df2');
      for (let x = 0; x < P; x += 32) {
        rect(g, x + 4, 26, 24, 10, '#0c0c26');
        rect(g, x + 4, 26, 24, 1, '#1c1c48');
      }
      vfade(g, 0, 24, P, FLOOR_H - 24, '#020208', 0, 0.85);
    });
    T.floorGlow = layerCanvas(T.floorP, FLOOR_H, (g, P) => {
      grid(g, P, '#21e6ff', '#0f4a5e');
      rect(g, 0, 22, P, 1, '#ff3df2');
    });
    T.floorGlowColor = '#21e6ff';
    T.lights = [
      { x: 40, kind: 'neon', color: '#21e6ff', r: 36 },
      { x: 136, kind: 'neon', color: '#ff3df2', r: 36 },
    ];
    T.overlay = 'scan';
    T.fog = { tile: fogTile('#ff3df2', 0.08, 19), y: 128, speed: 0.7, drift: 8 };
    T.ambient = { rate: 9, kind: 'bits', colors: ['#21e6ff', '#ff3df2', '#7df9ff'] };
    T.kill = KILL_TINT.neon;
  }

  function buildVoid(T) {
    T.accent = '#b98bff';
    T.bottom = '#030208';
    T.sky = skyCanvas([[0, '#020107'], [0.6, '#0a0618'], [1, '#140a2a']], (g, w, hh) => {
      const r = seeded(111);
      for (let i = 0; i < 14; i++) {
        g.globalAlpha = 0.12;
        ellipse(g, r() * w, 20 + r() * (hh - 60), 20 + r() * 40, 8 + r() * 16, r() < 0.5 ? '#5b2fae' : '#2f4fae');
      }
      g.globalAlpha = 1;
    });
    T.far = layerCanvas(T.farP, 170, (g, P) => {
      const r = seeded(112);
      for (let i = 0; i < 110; i++) {
        const c = ['#ffffff', '#b9c4ff', '#d9b3ff', '#7a7aa8'][Math.floor(r() * 4)];
        rect(g, Math.floor(r() * P), Math.floor(r() * 150), 1, 1, c);
      }
      for (let i = 0; i < 6; i++) {
        const x = Math.floor(r() * P);
        const y = Math.floor(10 + r() * 120);
        rect(g, x - 1, y, 3, 1, '#d9ccff');
        rect(g, x, y - 1, 1, 3, '#d9ccff');
      }
      for (const isl of [[60, 120, 40], [190, 96, 28]]) {
        wrap3(P, (o) => {
          ellipse(g, isl[0] + o, isl[1], isl[2] / 2, 3, '#150c28');
          spike(g, isl[0] + o, isl[1] + 1, isl[2] * 0.8, 14, '#110a22', true);
        });
      }
    });
    T.twinkle = [];
    const tr = seeded(113);
    for (let i = 0; i < 26; i++) T.twinkle.push([tr() * T.farP, tr() * 150, 1 + tr() * 3, tr() * 6, tr() < 0.3 ? '#d9b3ff' : '#ffffff']);
    T.extraFar = function (g, t, off) {
      for (const s of T.twinkle) {
        let x = s[0] - (off % T.farP);
        while (x < 0) x += T.farP;
        for (; x < W + 4; x += T.farP) {
          const a = 0.25 + 0.75 * Math.abs(Math.sin(t * s[2] + s[3]));
          g.globalAlpha = a * baseAlpha;
          rect(g, x, s[1], 1, 1, s[4]);
          if (a > 0.85) {
            rect(g, x - 1, s[1], 3, 1, s[4]);
            rect(g, x, s[1] - 1, 1, 3, s[4]);
          }
        }
      }
      g.globalAlpha = baseAlpha;
    };
    T.mid = layerCanvas(T.midP, 162, (g, P) => {
      const rift = (x, y0, len, seed) => {
        const r = seeded(seed);
        let cx = x;
        for (let y = y0; y < y0 + len; y++) {
          cx += (r() - 0.5) * 2.2;
          const w = Math.max(1, Math.round(Math.sin(((y - y0) / len) * Math.PI) * 5));
          rect(g, cx - w - 1, y, w * 2 + 2, 1, '#3b1a6e');
          rect(g, cx - w, y, w * 2, 1, '#8a4dff');
          if (w > 1) rect(g, cx - (w >> 1), y, Math.max(1, w), 1, '#f0e0ff');
        }
      };
      wrap3(P, (o) => {
        rift(120 + o, 40, 70, 7);
        rift(330 + o, 70, 50, 9);
      });
    });
    T.midLights = [
      { x: 120, y: 75, r: 40, color: '#8a4dff', kind: 'pulse', ph: 0 },
      { x: 330, y: 95, r: 32, color: '#b98bff', kind: 'pulse', ph: 2 },
    ];
    T.rocks = [
      [40, 70, rockChunk(26, 14, 5, '#33245a', '#6a52a8', '#1e1438', '#b98bff'), 0],
      [200, 40, rockChunk(18, 10, 6, '#2e2152', '#5e4a9a', '#1a1132', null), 1.5],
      [262, 112, rockChunk(32, 16, 7, '#33245a', '#6a52a8', '#1e1438', '#d9b3ff'), 3],
      [360, 26, rockChunk(14, 8, 8, '#2a1e4c', '#54448a', '#18102e', null), 4.2],
    ];
    T.extraMid = function (g, t, off) {
      for (const rk of T.rocks) {
        let x = rk[0] - (off % T.midP);
        while (x < -40) x += T.midP;
        for (; x < W + 40; x += T.midP) {
          const c = rk[2];
          const by = Math.round(rk[1] + Math.sin(t * 0.9 + rk[3]) * 3);
          glow(g, '#8a4dff', x, by + c.height * 0.4, c.width * 0.7, 0.12);
          g.drawImage(c, Math.round(x - c.width / 2), by);
        }
      }
    };
    const runes = [[14, 7], [52, 11], [90, 6], [118, 12]];
    T.floor = layerCanvas(T.floorP, FLOOR_H, (g, P) => {
      rect(g, 0, 0, P, FLOOR_H, '#120a26');
      for (let i = 0; i < 4; i++) {
        const c = ['#271a4d', '#2b1d55', '#241848'][Math.floor(hash(i, 4, 121) * 3)];
        rect(g, i * 32, 2, 31, 16, c);
        rect(g, i * 32, 2, 31, 1, '#40307a');
        spike(g, i * 32 + 9, 17, 12, 7, shade(c, 0.07), false);
        spike(g, i * 32 + 23, 17, 9, 5, shade(c, -0.12), false);
        rect(g, i * 32 + 31, 2, 1, 16, '#140b2a');
      }
      for (const r of runes) {
        rect(g, r[0], r[1], 5, 1, '#3c2a70');
        rect(g, r[0] + 2, r[1] - 2, 1, 5, '#3c2a70');
      }
      rect(g, 0, 0, P, 1, '#9a7ae0');
      rect(g, 0, 1, P, 1, '#5a3fa0');
      rect(g, 0, 18, P, 1, '#08040f');
      rect(g, 0, 19, P, 1, '#2a1a4a');
      for (let i = 0; i < 5; i++) {
        const x = 12 + i * 26 + Math.floor(hash(i, 1, 121) * 8);
        spike(g, x, 20, 5, 7 + Math.floor(hash(i, 2, 121) * 6), '#5a35b0', true);
        spike(g, x - 1, 20, 2, 5, '#b98bff', true);
      }
      vfade(g, 0, 22, P, FLOOR_H - 22, '#020106', 0, 0.85);
    });
    T.floorGlow = layerCanvas(T.floorP, FLOOR_H, (g, P) => {
      rect(g, 0, 0, P, 1, '#8a6ad8');
      for (const r of runes) {
        rect(g, r[0], r[1], 5, 1, '#b98bff');
        rect(g, r[0] + 2, r[1] - 2, 1, 5, '#b98bff');
      }
      for (let i = 0; i < 5; i++) {
        const x = 12 + i * 26 + Math.floor(hash(i, 1, 121) * 8);
        spike(g, x - 1, 20, 2, 5, '#8a4dff', true);
      }
    });
    T.floorGlowColor = '#8a4dff';
    T.lights = [{ x: 100, kind: 'crystal', color: '#b98bff', core: '#f5e8ff', r: 42 }];
    T.fog = { tile: fogTile('#6a3fb0', 0.14, 23), y: 124, speed: 0.6, drift: 5 };
    T.ambient = { rate: 10, kind: 'mote', colors: ['#b98bff', '#ffffff', '#7a8cff'] };
    T.kill = KILL_TINT.void;
  }

  function buildDragon(T) {
    T.farOpaque = true;
    T.accent = '#ff5a3c';
    T.bottom = '#0f0504';
    T.sky = skyCanvas([[0, '#0a0303'], [0.6, '#1e0805'], [1, '#33100a']]);
    T.far = layerCanvas(T.farP, 170, (g, P) => {
      rect(g, 0, 0, P, 170, '#1f0d09');
      blobs(g, P, 0, 170, 70, ['#2a120c', '#331710', '#24100a', '#2c140d'], 6, 16, 131);
      const r = seeded(132);
      for (const m of [[50, 52], [170, 70], [236, 36]]) {
        wrap3(P, (o) => {
          halfEllipse(g, m[0] + o, 162, m[1] / 2, 22, '#8a6020');
          halfEllipse(g, m[0] + o, 162, m[1] / 2 - 3, 18, '#b8862b');
          halfEllipse(g, m[0] + o - 4, 158, m[1] / 4, 10, '#e0b04a');
          for (let i = 0; i < 14; i++) {
            const gx = m[0] + o + (r() - 0.5) * m[1] * 0.8;
            const gy = 162 - r() * 18;
            rect(g, gx, gy, 2, 1, r() < 0.5 ? '#ffd34d' : '#fff3b0');
          }
        });
      }
      wrap3(P, (o) => {
        rect(g, 112 + o, 134, 3, 10, '#c9a35a');
        rect(g, 110 + o, 132, 7, 3, '#e0b04a');
        rect(g, 111 + o, 144, 5, 2, '#c9a35a');
      });
      vfade(g, 0, 0, P, 44, '#050101', 0.9, 0);
    });
    T.mid = layerCanvas(T.midP, 162, (g, P) => {
      const r = seeded(133);
      for (let i = 0; i < 9; i++) {
        const x = r() * P;
        const w = 8 + r() * 14;
        const h = 18 + r() * 40;
        wrap3(P, (o) => {
          spike(g, x + o, 0, w, h, '#2b140d', true);
          spike(g, x + o - 1, 0, w * 0.4, h * 0.8, '#43221a', true);
        });
      }
      for (let i = 0; i < 4; i++) {
        const x = r() * P;
        const w = 12 + r() * 14;
        const h = 22 + r() * 30;
        wrap3(P, (o) => {
          spike(g, x + o, 162, w, h, '#2b140d', false);
          spike(g, x + o - 2, 162, w * 0.35, h * 0.8, '#43221a', false);
        });
      }
      wrap3(P, (o) => {
        const sx = 250 + o;
        rect(g, sx, 136, 30, 14, '#cfc6ad');
        rect(g, sx + 26, 140, 14, 8, '#cfc6ad');
        rect(g, sx + 6, 140, 6, 4, '#1a0806');
        rect(g, sx + 30, 148, 10, 2, '#cfc6ad');
        for (let i = 0; i < 4; i++) rect(g, sx + 28 + i * 3, 148, 1, 3, '#e8e0c8');
        spike(g, sx + 4, 136, 6, 12, '#bdb49a', false);
        rect(g, sx, 150, 34, 2, '#8a8270');
      });
    });
    T.floor = layerCanvas(T.floorP, FLOOR_H, (g, P) => {
      rect(g, 0, 0, P, FLOOR_H, '#1f0d09');
      rect(g, 0, 2, P, 16, '#2a140e');
      blobs(g, P, 2, 16, 18, ['#32180f', '#25110b', '#3a1d12'], 2, 6, 141);
      for (let i = 0; i < 16; i++) {
        const x = Math.floor(hash(i, 1, 142) * P);
        const y = 4 + Math.floor(hash(i, 2, 142) * 12);
        rect(g, x, y, 2, 1, '#e0b04a');
        rect(g, x, y, 1, 1, '#fff3b0');
      }
      rect(g, 0, 0, P, 2, '#4a2418');
      rect(g, 0, 18, P, 1, '#120504');
      blobs(g, P, 19, FLOOR_H - 19, 20, ['#26100b', '#1a0a06', '#2e150d'], 3, 7, 143);
      vfade(g, 0, 22, P, FLOOR_H - 22, '#050101', 0, 0.85);
    });
    T.lights = [{ x: 96, kind: 'brazier', color: '#ff7b2e', mid: '#ffb347', core: '#fff0b0', pole: '#2a1a16', r: 56 }];
    T.fog = { tile: fogTile('#8a2a10', 0.16, 29), y: 124, speed: 0.7, drift: 4 };
    T.ambient = { rate: 12, kind: 'ember', colors: ['#ff7b2e', '#ffb347', '#ffd34d'], glint: true };
    T.kill = '#ff9a3c';
  }

  function buildHorde(T) {
    T.accent = '#7dff6a';
    T.bottom = '#050a07';
    T.sky = skyCanvas([[0, '#04080a'], [0.55, '#0c1612'], [1, '#18261c']], (g) => {
      const r = seeded(151);
      for (let i = 0; i < 30; i++) rect(g, Math.floor(r() * W), Math.floor(r() * 80), 1, 1, '#8aa89a');
      const mx = 286;
      const my = 44;
      ellipse(g, mx, my, 21, 21, '#c8dcb0');
      ellipse(g, mx, my, 19, 19, '#e2f0c8');
      ellipse(g, mx - 6, my - 4, 4, 3, '#c8dcb0');
      ellipse(g, mx + 7, my + 5, 5, 4, '#c8dcb0');
      ellipse(g, mx + 3, my - 9, 2, 2, '#c8dcb0');
    });
    T.extraSky = function (g) {
      glow(g, '#b5ff9a', 286 + MARGIN, 44 + MARGIN, 60, 0.18);
    };
    T.far = layerCanvas(T.farP, 170, (g, P) => {
      for (let x = 0; x < P; x++) {
        const hh = 34 + Math.sin((x / P) * Math.PI * 4) * 8 + Math.sin((x / P) * Math.PI * 10) * 3;
        rect(g, x, 160 - hh, 1, hh + 10, '#0e1a12');
      }
      wrap3(P, (o) => {
        rect(g, 150 + o, 92, 30, 40, '#0b140e');
        spike(g, 165 + o, 92, 36, 14, '#0b140e', false);
        rect(g, 162 + o, 112, 6, 20, '#050a07');
        deadTree(g, 60 + o, 132, 44, '#0b140e');
        deadTree(g, 230 + o, 134, 34, '#0b140e');
        fence(g, 0 + o, P + o, 140, 14, '#0a120c', '#152418');
      });
    });
    T.mid = layerCanvas(T.midP, 162, (g, P) => {
      wrap3(P, (o) => {
        deadTree(g, 196 + o, 162, 96, '#1e1912');
        tombstone(g, 40 + o, 160, 14, 22, '#4a5048', '#62685e', '#30352f', 'round');
        tombstone(g, 92 + o, 160, 12, 20, '#444a42', '#5c6258', '#2c302a', 'cross');
        tombstone(g, 268 + o, 160, 16, 26, '#4a5048', '#62685e', '#30352f', 'round');
        tombstone(g, 318 + o, 160, 11, 16, '#3e443c', '#565c52', '#2a2e28', 'round');
        tombstone(g, 350 + o, 160, 12, 22, '#444a42', '#5c6258', '#2c302a', 'cross');
      });
      blobs(g, P, 150, 12, 16, ['#2f4a24', '#3d5a2a'], 2, 5, 152);
    });
    T.floor = layerCanvas(T.floorP, FLOOR_H, (g, P) => {
      rect(g, 0, 0, P, FLOOR_H, '#1e1a12');
      rect(g, 0, 2, P, 16, '#2a2418');
      blobs(g, P, 3, 15, 16, ['#322b1c', '#241f14', '#2e2719'], 2, 6, 161);
      for (let x = 0; x < P; x++) {
        const hgt = 1 + Math.floor(hash(x, 3, 162) * 3) + (x % 11 < 2 ? 2 : 0);
        rect(g, x, 3 - hgt, 1, hgt + 1, hash(x, 4, 162) < 0.5 ? '#3d5a2a' : '#4f7a34');
      }
      bone(g, 70, 12, '#a8a28e');
      rect(g, 0, 18, P, 1, '#0e0b07');
      blobs(g, P, 19, FLOOR_H - 19, 18, ['#1a160f', '#221d13', '#15120c'], 2, 6, 163);
      vfade(g, 0, 22, P, FLOOR_H - 22, '#030302', 0, 0.85);
    });
    T.lights = [{ x: 96, kind: 'lamp', color: '#b5ff6a', core: '#f0ffd8', pole: '#1a1f1c', r: 44 }];
    T.fog = { tile: fogTile('#5a7a4a', 0.24, 31), y: 120, speed: 0.6, drift: 7 };
    T.ambient = { rate: 5, kind: 'firefly', colors: ['#d8ff6a', '#b5ff6a', '#fff59a'] };
    T.kill = '#9ac46a';
  }

  function buildVault(T) {
    T.farOpaque = true;
    T.accent = '#ffcf5a';
    T.bottom = '#0a0806';
    T.sky = skyCanvas([[0, '#090705'], [0.6, '#17130c'], [1, '#221c10']]);
    T.far = layerCanvas(T.farP, 170, (g, P) => {
      bricks(g, P, 0, 170, {
        bw: 32, bh: 16, colors: ['#2e2a22', '#332e25', '#2a261e', '#302b23'], mortar: '#16130e', hi: '#3c362c', lo: '#221e17', seed: 171,
      });
      for (let i = 0; i < 8; i++) {
        const x = Math.floor(hash(i, 1, 172) * (P - 20));
        const y = 10 + Math.floor(hash(i, 2, 172) * 9) * 16;
        rect(g, x + 4, y + 5, 8, 1, '#6a5320');
        rect(g, x + 7, y + 3, 1, 6, '#6a5320');
        rect(g, x + 11, y + 4, 1, 4, '#6a5320');
      }
      wrap3(P, (o) => {
        const cx = 128 + o;
        const cy = 92;
        ellipse(g, cx, cy, 46, 46, '#1a1610');
        ellipse(g, cx, cy, 43, 43, '#5a4a2a');
        ellipse(g, cx, cy, 39, 39, '#3a3322');
        ellipse(g, cx, cy, 30, 30, '#4a3f28');
        ellipse(g, cx, cy, 26, 26, '#2e2819');
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          line(g, cx + Math.cos(a) * 8, cy + Math.sin(a) * 8, cx + Math.cos(a) * 25, cy + Math.sin(a) * 25, '#5a4a2a');
          rect(g, cx + Math.cos(a) * 41 - 1, cy + Math.sin(a) * 41 - 1, 3, 3, '#c49a48');
        }
        ellipse(g, cx, cy, 7, 7, '#c49a48');
        ellipse(g, cx, cy, 4, 4, '#7a5f24');
      });
      vfade(g, 0, 0, P, 44, '#040302', 0.9, 0);
      vfade(g, 0, 120, P, 50, '#0a0806', 0, 0.7);
    });
    T.mid = layerCanvas(T.midP, 162, (g, P) => {
      const pc = { base: '#3a352a', hi: '#4e4838', lo: '#26221a', dark: '#1e1a14', cap: '#443e31' };
      wrap3(P, (o) => {
        for (const px of [70, 270]) {
          pillar(g, px + o, 30, 0, 162, pc);
          rect(g, px + o - 3, 44, 36, 4, '#c49a48');
          rect(g, px + o - 3, 44, 36, 1, '#ffdf8a');
          rect(g, px + o - 3, 130, 36, 3, '#c49a48');
          for (let i = 0; i < 3; i++) {
            const ry = 64 + i * 20;
            rect(g, px + o + 10, ry, 10, 1, '#ffcf5a');
            rect(g, px + o + 14, ry - 3, 1, 7, '#ffcf5a');
            rect(g, px + o + 11, ry + 3, 3, 1, '#ffcf5a');
          }
        }
      });
    });
    T.midLights = [
      { x: 85, y: 84, r: 26, color: '#ffcf5a', kind: 'pulse', ph: 0 },
      { x: 285, y: 84, r: 26, color: '#ffcf5a', kind: 'pulse', ph: 2.5 },
    ];
    T.floor = layerCanvas(T.floorP, FLOOR_H, (g, P) => {
      rect(g, 0, 0, P, FLOOR_H, '#221e17');
      for (let i = 0; i < 4; i++) {
        rect(g, i * 32, 2, 31, 16, i % 2 ? '#3a352a' : '#352f25');
        rect(g, i * 32, 2, 31, 1, '#5a5240');
        rect(g, i * 32 + 31, 2, 1, 16, '#c49a48');
      }
      rect(g, 0, 10, P, 1, '#8a6a2e');
      rect(g, 0, 0, P, 2, '#6a604a');
      rect(g, 0, 18, P, 1, '#c49a48');
      bricks(g, P, 19, FLOOR_H - 19, { bw: 32, bh: 10, colors: ['#2a261e', '#2e2a22', '#26221b'], mortar: '#16130e', hi: '#3c362c', seed: 181 });
      vfade(g, 0, 22, P, FLOOR_H - 22, '#040302', 0, 0.85);
    });
    T.lights = [{ x: 96, kind: 'brazier', color: '#ffcf5a', mid: '#ffe08a', core: '#fffbe8', pole: '#3a352a', r: 50 }];
    T.ambient = { rate: 6, kind: 'dust', colors: ['#ffcf5a', '#c49a48', '#fff0c0'], glint: true };
    T.fog = { tile: fogTile('#c49a48', 0.07, 37), y: 124, speed: 0.7, drift: 3 };
    T.kill = '#cfc6ad';
  }

  function buildMothership(T) {
    T.farOpaque = true;
    T.accent = '#21e6ff';
    T.bottom = '#03060a';
    T.sky = skyCanvas([[0, '#020408'], [0.6, '#06101a'], [1, '#0a1a24']]);
    T.far = layerCanvas(T.farP, 170, (g, P) => {
      bricks(g, P, 0, 170, {
        bw: 32, bh: 24, colors: ['#121c26', '#152230', '#101820', '#13202b'], mortar: '#080e14', hi: '#1f2e3c', lo: '#0c141c', seed: 191,
      });
      rect(g, 0, 28, P, 2, '#1a5a66');
      rect(g, 0, 29, P, 1, '#2ab8c8');
      wrap3(P, (o) => {
        for (const px of [64, 192]) {
          const cx = px + o;
          const cy = 78;
          ellipse(g, cx, cy, 16, 16, '#3a4c5c');
          ellipse(g, cx, cy, 13, 13, '#050a14');
          const r = seeded(px);
          for (let i = 0; i < 10; i++) rect(g, cx - 9 + r() * 18, cy - 9 + r() * 18, 1, 1, '#d8f0ff');
          if (px === 64) {
            ellipse(g, cx + 6, cy + 7, 8, 8, '#2a6fd6');
            ellipse(g, cx + 4, cy + 5, 3, 2, '#5fd068');
          }
          rect(g, cx - 10, cy - 10, 4, 2, rgba('#ffffff', 0.25));
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            rect(g, cx + Math.cos(a) * 15 - 1, cy + Math.sin(a) * 15 - 1, 2, 2, '#5a7084');
          }
        }
      });
      vfade(g, 0, 120, P, 50, '#03060a', 0, 0.7);
    });
    T.mid = layerCanvas(T.midP, 162, (g, P) => {
      const pc = { base: '#1a2632', hi: '#2c3e50', lo: '#0e161e', dark: '#0a1016', cap: '#22303e' };
      wrap3(P, (o) => {
        pillar(g, 100 + o, 20, 0, 162, pc);
        pillar(g, 300 + o, 20, 0, 162, pc);
        rect(g, 109 + o, 30, 2, 110, '#21e6ff');
        rect(g, 309 + o, 30, 2, 110, '#21e6ff');
        rect(g, 0 + o, 12, P, 5, '#2a3a48');
        rect(g, 0 + o, 12, P, 1, '#3e5266');
        rect(g, 180 + o, 40, 56, 34, '#0a1016');
        rect(g, 182 + o, 42, 52, 30, '#06281a');
        signGlyphs(g, 186 + o, 46, 46, 22, '#7dff9b', 199);
        rect(g, 206 + o, 17, 2, 23, '#2a3a48');
      });
    });
    T.midLights = [
      { x: 110, y: 85, r: 24, color: '#21e6ff', kind: 'steady', ph: 0 },
      { x: 310, y: 85, r: 24, color: '#21e6ff', kind: 'steady', ph: 0 },
      { x: 208, y: 57, r: 30, color: '#7dff9b', kind: 'neon', ph: 1 },
    ];
    T.floor = layerCanvas(T.floorP, FLOOR_H, (g, P) => {
      rect(g, 0, 0, P, FLOOR_H, '#0e161e');
      rect(g, 0, 2, P, 16, '#18222c');
      for (let y = 4; y < 18; y += 3) rect(g, 0, y, P, 1, '#0c1218');
      for (let x = 0; x < P; x += 32) rect(g, x, 2, 1, 16, '#0a1016');
      rect(g, 0, 0, P, 2, '#2ab8c8');
      rect(g, 0, 18, P, 1, '#05080c');
      for (let x = 0; x < P; x += 16) {
        rect(g, x + 1, 20, 14, 12, '#121c26');
        rect(g, x + 1, 20, 14, 1, '#1f2e3c');
        rect(g, x + 7, 25, 2, 2, x % 32 ? '#7dff9b' : '#ff5a5a');
      }
      vfade(g, 0, 24, P, FLOOR_H - 24, '#010204', 0, 0.85);
    });
    T.floorGlow = layerCanvas(T.floorP, FLOOR_H, (g, P) => {
      rect(g, 0, 0, P, 1, '#21e6ff');
      for (let x = 0; x < P; x += 16) rect(g, x + 7, 25, 2, 2, x % 32 ? '#7dff9b' : '#ff5a5a');
    });
    T.floorGlowColor = '#21e6ff';
    T.lights = [{ x: 96, kind: 'lamp', color: '#7df9ff', core: '#e8feff', pole: '#2a3a48', r: 42 }];
    T.overlay = 'scan';
    T.ambient = { rate: 7, kind: 'bits', colors: ['#7dff9b', '#21e6ff'] };
    T.kill = '#7dff9b';
  }

  const THEME_BUILDERS = {
    crypt: buildCrypt,
    fungal: buildFungal,
    forge: buildForge,
    clockwork: buildClockwork,
    neon: buildNeon,
    void: buildVoid,
    dg_dragon: buildDragon,
    dg_horde: buildHorde,
    dg_vault: buildVault,
    dg_mothership: buildMothership,
  };

  function getTheme(id) {
    let T = themes[id];
    if (T) return T;
    T = baseTheme(id);
    try {
      (THEME_BUILDERS[id] || buildCrypt)(T);
      if (T.midTint && T.mid) {
        const g = T.mid.getContext('2d');
        g.globalCompositeOperation = 'source-atop';
        g.globalAlpha = T.midTint[1];
        g.fillStyle = T.midTint[0];
        g.fillRect(0, 0, T.mid.width, T.mid.height);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
    } catch (err) {
      console.error('[DD.render] theme build failed', id, err);
      const F = baseTheme(id);
      F.sky = skyCanvas([[0, '#08070d'], [1, '#1c1a26']]);
      T = F;
    }
    themes[id] = T;
    return T;
  }

  function themeIdFor(B) {
    if (B && B.mode === 'dungeon' && B.dungeon && typeof B.dungeon.id === 'string') {
      const id = 'dg_' + B.dungeon.id;
      return THEME_BUILDERS[id] ? id : 'dg_dragon';
    }
    const floor = Math.max(1, Math.floor(num(B && B.floor, 1)));
    try {
      const b = DD.data && typeof DD.data.biomeForFloor === 'function' ? DD.data.biomeForFloor(floor) : null;
      if (b && THEME_BUILDERS[b.id]) return b.id;
    } catch {
      /* fall through to the formula */
    }
    return BIOME_IDS[Math.floor((floor - 1) / 10) % BIOME_IDS.length];
  }

  // ================================================================== module state
  const R = (DD.render = DD.render || {});
  let canvas = null;
  let ctx = null;
  let buf = null;
  let bctx = null;
  let k = 1;
  let S = 1; // backing px per world px on the visible canvas
  let dpr = 1;
  let inited = false;
  let subscribed = false;
  let reduced = false;
  let forcedReduced = null; // set by setReducedMotion(); overrides the media query
  let clock = 0;
  let lastScroll = null;
  let curTheme = null;
  let prevTheme = null;
  let themeFade = 1;
  let trauma = 0;
  let shakeX = 0;
  let shakeY = 0;
  let flashA = 0;
  let flashColor = '#ffffff';
  let deadA = 0;
  let deadMax = 2;
  let heroFlash = 0;
  let shieldPop = 0;
  let bubbleA = 0;
  let warcryA = 0;
  let ambAcc = 0;
  let castCtx = null;
  let lookKey = '';
  let look = null;
  let bossLagId = null;
  let bossLagHp = 0;
  let bossShow = 0;
  let lastBoss = null;
  const lagById = new Map();
  let lagSweep = 0;
  let resizeQueued = false;
  let ro = null;
  let fontReady = false;

  // ================================================================== sprite access
  const SIZE_HINT = {
    hero: [16, 24], wolf: [20, 13], fairy: [10, 10], drone_ally: [14, 10], golem_ally: [18, 20],
    flying_chest: [22, 14], coin: [7, 7], fx_explosion: [28, 28], fx_slash: [22, 22], fx_lightning: [12, 40],
    fx_frost: [26, 26], fx_meteor: [16, 16], fx_blade: [10, 10], fx_heal: [22, 22],
  };
  // Procedural stand-ins used when DD.sprites lacks a name (or is missing entirely).
  const fallbackCache = {};
  function fbFrames(name) {
    const key = String(name);
    let set = fallbackCache[key];
    if (set) return set;
    const frames = [];
    let fps = 12;
    const P = (w, h, fn) => frames.push(layerCanvas(w, h, fn));
    if (key === 'fx_explosion') {
      for (let i = 0; i < 6; i++) {
        P(28, 28, (g) => {
          const r = 4 + i * 2.2;
          const fade = i >= 4;
          ellipse(g, 14, 14, r + 2, r + 2, fade ? '#5a4a4a' : '#ff5a1f');
          ellipse(g, 14, 14, r, r, fade ? '#7a6a64' : '#ffb347');
          if (i < 4) ellipse(g, 14, 14, Math.max(1, r - 3), Math.max(1, r - 3), '#fff0b0');
          if (fade) ellipse(g, 14, 14, r - 3, r - 3, '#00000000');
        });
      }
      fps = 12;
    } else if (key === 'fx_slash') {
      for (let i = 0; i < 4; i++) {
        P(22, 22, (g) => {
          for (let a = -1.2 + i * 0.25; a < 0.6 + i * 0.3; a += 0.06) {
            const x = 11 + Math.cos(a) * 8;
            const y = 11 + Math.sin(a) * 8;
            rect(g, x, y, 2, 2, i < 3 ? '#ffffff' : '#c8d2e4');
          }
        });
      }
      fps = 18;
    } else if (key === 'fx_lightning') {
      for (let i = 0; i < 3; i++) {
        P(12, 40, (g) => {
          const r = seeded(i + 3);
          let x = 6;
          for (let y = 0; y < 40; y++) {
            x = clamp(x + (r() - 0.5) * 3, 2, 10);
            rect(g, x, y, 2, 1, '#bfe9ff');
            rect(g, x, y, 1, 1, '#ffffff');
          }
        });
      }
    } else if (key === 'fx_frost') {
      for (let i = 0; i < 5; i++) {
        P(26, 26, (g) => {
          const r = 3 + i * 2;
          for (let a = 0; a < 6; a++) {
            const ang = (a / 6) * Math.PI * 2;
            line(g, 13, 13, 13 + Math.cos(ang) * r, 13 + Math.sin(ang) * r, i < 4 ? '#bff0ff' : '#7fd0ff');
          }
          rect(g, 12, 12, 3, 3, '#ffffff');
        });
      }
    } else if (key === 'fx_meteor') {
      for (let i = 0; i < 2; i++) {
        P(16, 16, (g) => {
          ellipse(g, 10, 10, 5, 5, '#ff7b2e');
          ellipse(g, 10, 10, 4, 4, '#6a4a3a');
          rect(g, 8, 8, 2, 2, '#9a7a6a');
          for (let t = 0; t < 6; t++) rect(g, 3 - t * 0.4 + i, 3 + t * 0.2, 2, 2, t % 2 ? '#ffb347' : '#ff5a1f');
        });
      }
    } else if (key === 'fx_blade') {
      for (let i = 0; i < 4; i++) {
        P(10, 10, (g) => {
          const a = (i / 4) * (Math.PI / 2);
          for (let b = 0; b < 4; b++) {
            const ang = a + (b * Math.PI) / 2;
            line(g, 5, 5, 5 + Math.cos(ang) * 4, 5 + Math.sin(ang) * 4, '#e8eef8');
          }
          rect(g, 4, 4, 2, 2, '#7c88a6');
        });
      }
    } else if (key === 'fx_heal') {
      for (let i = 0; i < 5; i++) {
        P(22, 22, (g) => {
          const y = 14 - i * 2;
          rect(g, 9, y - 3, 4, 10, '#6dff8e');
          rect(g, 6, y, 10, 4, '#6dff8e');
          rect(g, 10, y - 2, 2, 8, '#d8ffe0');
        });
      }
    } else if (key === 'coin') {
      for (let i = 0; i < 4; i++) {
        P(7, 7, (g) => {
          const w = [3, 2, 1, 2][i];
          ellipse(g, 3, 3, w, 3, '#b8862b');
          ellipse(g, 3, 3, Math.max(0, w - 1), 2, '#ffd34d');
          if (w > 1) rect(g, 2, 1, 1, 2, '#fff3b0');
        });
      }
      fps = 10;
    } else if (key === 'flying_chest') {
      for (let i = 0; i < 2; i++) {
        P(22, 16, (g) => {
          const wy = i ? 4 : 1;
          spike(g, 3, wy + 4, 6, 4, '#f0f4ff', true);
          spike(g, 18, wy + 4, 6, 4, '#f0f4ff', true);
          rect(g, 6, 7, 10, 8, '#8a4b22');
          rect(g, 6, 5, 10, 3, '#a85d2a');
          rect(g, 6, 8, 10, 1, '#5a2e14');
          rect(g, 6, 5, 1, 10, '#e0b04a');
          rect(g, 15, 5, 1, 10, '#e0b04a');
          rect(g, 10, 8, 2, 3, '#ffd34d');
        });
      }
      fps = 8;
    } else if (key.indexOf('proj_') === 0) {
      const c = PROJ_COLORS[key.slice(5)] || PROJ_COLORS.arrow;
      for (let i = 0; i < 2; i++) {
        P(9, 7, (g) => {
          if (key === 'proj_arrow') {
            rect(g, 1, 3, 7, 1, '#c8b28a');
            rect(g, 0, 2, 2, 3, '#e8e8f0');
            rect(g, 7, 2, 2, 3, '#a8a8b0');
          } else if (key === 'proj_laser') {
            rect(g, 0, 3, 9, 1, '#ffffff');
            rect(g, 0, 2, 9, 1, c[1]);
            rect(g, 0, 4, 9, 1, c[1]);
          } else {
            ellipse(g, 4, 3, 3, 3, c[1]);
            ellipse(g, 4 - i * 0.5, 3, 2, 2, c[0]);
            rect(g, 3, 2, 1, 1, '#ffffff');
          }
        });
      }
      fps = 10;
    } else {
      let w = 16;
      let h = 16;
      const E = DD.data && DD.data.ENEMIES && DD.data.ENEMIES[key];
      if (E) {
        w = clamp(Math.round(num(E.w, 16)), 4, 96);
        h = clamp(Math.round(num(E.h, 16)), 4, 96);
      } else if (SIZE_HINT[key]) {
        w = SIZE_HINT[key][0];
        h = SIZE_HINT[key][1];
      }
      const hue = strHash(key) % 360;
      for (let i = 0; i < 2; i++) {
        P(w, h + 1, (g) => {
          const y0 = i;
          g.fillStyle = 'hsl(' + hue + ',45%,40%)';
          g.fillRect(1, 1 + y0, w - 2, h - 1 - y0);
          g.fillStyle = 'hsl(' + hue + ',55%,60%)';
          g.fillRect(2, 2 + y0, Math.max(1, w - 4), Math.max(1, Math.floor(h / 5)));
          g.fillStyle = INK;
          g.fillRect(0, h, w, 1);
          if (w > 6 && h > 6) {
            const right = key === 'hero' || !!(DD.data && DD.data.ALLIES && DD.data.ALLIES[key]);
            g.fillStyle = '#ffffff';
            g.fillRect(right ? w - 5 : 2, Math.floor(h / 3) + y0, 2, 2);
            g.fillStyle = INK;
            g.fillRect(right ? w - 4 : 2, Math.floor(h / 3) + y0, 1, 2);
          }
        });
      }
      fps = 4;
    }
    set = { frames: frames, fps: fps };
    fallbackCache[key] = set;
    return set;
  }
  function fallbackSprite(name, t) {
    const set = fbFrames(name);
    const n = set.frames.length;
    const f = Math.floor(num(t, 0) * set.fps);
    const once = String(name).indexOf('fx_') === 0 && name !== 'fx_blade';
    const i = once ? clamp(f, 0, n - 1) : ((f % n) + n) % n;
    return set.frames[i];
  }
  let spriteWarned = false;
  function sprite(name, anim, t, lk) {
    const SP = DD.sprites;
    if (SP && typeof SP.anim === 'function') {
      try {
        const c = SP.anim(name, anim, num(t, 0), lk);
        if (c && c.width > 0 && c.height > 0 && !(typeof SP.isPlaceholder === 'function' && SP.isPlaceholder(c))) return c;
      } catch (err) {
        if (!spriteWarned) {
          spriteWarned = true;
          console.warn('[DD.render] sprite "' + name + '/' + anim + '" failed; using a fallback', err);
        }
      }
    }
    return fallbackSprite(name, t);
  }
  function tintCopy(c, color, a) {
    const t = mk(c.width, c.height);
    const g = t.getContext('2d');
    g.drawImage(c, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = a;
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    return t;
  }
  const flashCache = new WeakMap();
  function flashedOf(c) {
    const SP = DD.sprites;
    if (SP && typeof SP.flashed === 'function') {
      try {
        const f = SP.flashed(c);
        if (f && f.width > 0) return f;
      } catch {
        /* use the local copy */
      }
    }
    let f = flashCache.get(c);
    if (!f) {
      f = tintCopy(c, '#ffffff', 1);
      flashCache.set(c, f);
    }
    return f;
  }
  const iceCache = new WeakMap();
  function icedOf(c) {
    let f = iceCache.get(c);
    if (!f) {
      f = tintCopy(c, '#9fe6ff', 0.62);
      iceCache.set(c, f);
    }
    return f;
  }
  const redCache = new WeakMap();
  function reddedOf(c) {
    let f = redCache.get(c);
    if (!f) {
      f = tintCopy(c, '#ff3b3b', 0.75);
      redCache.set(c, f);
    }
    return f;
  }

  /** Length (seconds) of one cycle of a sprite animation, measured by sampling frame identity. */
  const spanCache = {};
  function animSpan(name, anim, fallback) {
    const key = name + ':' + anim;
    const hit = spanCache[key];
    if (hit !== undefined) return hit;
    let span = fallback;
    const SP = DD.sprites;
    if (SP && typeof SP.duration === 'function') {
      try {
        span = num(SP.duration(name, anim), fallback);
      } catch {
        span = fallback;
      }
    } else if (SP && typeof SP.anim === 'function') {
      try {
        const f0 = SP.anim(name, anim, 0);
        let last = f0;
        let first = 0;
        let lastChange = 0;
        let back = 0;
        for (let i = 1; i <= 180; i++) {
          const t = i / 60;
          const f = SP.anim(name, anim, t);
          if (f !== last) {
            if (!first) first = t;
            lastChange = t;
            if (f === f0) {
              back = t;
              break;
            }
            last = f;
          }
        }
        if (back) span = back;
        else if (first) span = lastChange + first;
      } catch {
        span = fallback;
      }
    }
    span = clamp(num(span, fallback), 0.05, 4);
    spanCache[key] = span;
    return span;
  }

  const anchorCache = {};
  function anchorMode(name) {
    let m = anchorCache[name];
    if (m) return m;
    m = 'center';
    const SP = DD.sprites;
    if (SP && typeof SP.anchor === 'function' && (typeof SP.has !== 'function' || SP.has(name))) {
      try {
        const a = SP.anchor(name);
        if (a && a.mode === 'bottom') m = 'bottom';
      } catch {
        m = 'center';
      }
    }
    anchorCache[name] = m;
    return m;
  }

  function heroLook() {
    const s = DD.state && DD.state.s;
    const eq = (s && s.equipped) || {};
    const w = eq.weapon && typeof eq.weapon === 'object' ? eq.weapon : null;
    const a = eq.armor && typeof eq.armor === 'object' ? eq.armor : null;
    const we = w ? clamp(Math.floor(num(w.era, 0)), 0, 5) : 0;
    const wr = w ? clamp(Math.floor(num(w.rarity, 0)), 0, 6) : 0;
    const ar = a ? clamp(Math.floor(num(a.rarity, 0)), 0, 6) : 0;
    const key = (w ? 1 : 0) + ':' + we + ':' + wr + ':' + (a ? 1 : 0) + ':' + ar;
    if (key !== lookKey || !look) {
      lookKey = key;
      look = { weaponEra: we, weaponRarity: wr, armorRarity: ar, hasWeapon: !!w, hasArmor: !!a };
    }
    return look;
  }

  function enemyName(type, fallbackName) {
    const E = DD.data && DD.data.ENEMIES;
    const d = E && E[type];
    if (d && typeof d.name === 'string' && d.name) return d.name;
    if (typeof fallbackName === 'string' && fallbackName) return fallbackName;
    return 'Boss';
  }
  function dungeonInfo(id) {
    const D = DD.data && DD.data.DUNGEONS;
    let d = null;
    if (Array.isArray(D)) d = D.find((x) => x && x.id === id) || null;
    else if (D && typeof D === 'object') d = D[id] || null;
    return {
      name: d && typeof d.name === 'string' ? d.name : 'Boss Dungeon',
      color: d && typeof d.color === 'string' ? d.color : '#ffcf5a',
      enemy: d && typeof d.enemy === 'string' ? d.enemy : d && typeof d.boss === 'string' ? d.boss : null,
    };
  }
  function biomeInfo(floor) {
    try {
      const b = DD.data && DD.data.biomeForFloor ? DD.data.biomeForFloor(floor) : null;
      if (b) return { name: b.name || '', boss: b.boss || null, accent: (b.colors && b.colors.accent) || '#5ef3ff' };
    } catch {
      /* fallback below */
    }
    return { name: '', boss: null, accent: '#5ef3ff' };
  }

  // ================================================================== particles (pooled)
  const parts = [];
  for (let i = 0; i < PART_CAP; i++) {
    parts.push({
      x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 0, max: 1, s: 1, s1: 1, c: '#fff', a: 1,
      add: false, kind: 0, front: true, par: 0, wob: 0, ph: 0, fin: false,
    });
  }
  let partN = 0;
  let partSteal = 0;
  function part(x, y, vx, vy, life, color, kind, size) {
    const cap = reduced ? PART_CAP_REDUCED : PART_CAP;
    let p;
    if (partN < cap) p = parts[partN++];
    else p = parts[partSteal++ % cap];
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = 0;
    p.max = Math.max(0.05, life);
    p.c = color;
    p.kind = kind || 0;
    p.s = size || 1;
    p.s1 = p.s;
    p.g = 0;
    p.drag = 0;
    p.a = 1;
    p.add = false;
    p.front = true;
    p.par = 0;
    p.wob = 0;
    p.ph = 0;
    p.fin = false;
    return p;
  }
  function burst(x, y, n, colors, speed, life, opt) {
    const count = reduced ? Math.max(1, Math.ceil(n * 0.4)) : n;
    for (let i = 0; i < count; i++) {
      const a = opt && opt.up ? rnd(-Math.PI * 0.95, -Math.PI * 0.05) : rnd(0, Math.PI * 2);
      const sp = speed * rnd(0.35, 1);
      const p = part(x, y, Math.cos(a) * sp, Math.sin(a) * sp, life * rnd(0.6, 1.15), pick(colors), opt && opt.kind ? opt.kind : 0, opt && opt.size ? opt.size * rnd(0.7, 1.2) : rnd(1, 2));
      p.g = opt && opt.g !== undefined ? opt.g : 140;
      p.drag = opt && opt.drag !== undefined ? opt.drag : 2.5;
      p.add = !!(opt && opt.add);
      if (opt && opt.s1 !== undefined) p.s1 = opt.s1;
      if (opt && opt.a !== undefined) p.a = opt.a;
    }
  }
  function updateParts(dt, dScroll) {
    for (let i = 0; i < partN; ) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) {
        partN--;
        parts[i] = parts[partN];
        parts[partN] = p;
        continue;
      }
      p.vy += p.g * dt;
      if (p.drag) {
        const d = Math.max(0, 1 - p.drag * dt);
        p.vx *= d;
        p.vy *= d;
      }
      p.x += p.vx * dt - dScroll * p.par;
      p.y += p.vy * dt;
      i++;
    }
  }
  function drawParts(g, front) {
    let add = false;
    for (let i = 0; i < partN; i++) {
      const p = parts[i];
      if (p.front !== front) continue;
      const u = p.life / p.max;
      let a = p.a * (p.fin ? Math.min(1, u / 0.15) * Math.min(1, (1 - u) / 0.35) : Math.min(1, (1 - u) / 0.45));
      if (p.kind === 6) a *= 0.35 + 0.65 * Math.abs(Math.sin(p.life * 5 + p.ph));
      if (a <= 0.01) continue;
      if (p.add !== add) {
        add = p.add;
        g.globalCompositeOperation = add ? 'lighter' : 'source-over';
      }
      g.globalAlpha = a;
      const s = p.s + (p.s1 - p.s) * u;
      const x = p.x + (p.wob ? Math.sin(p.life * 2.3 + p.ph) * p.wob : 0);
      const y = p.y;
      switch (p.kind) {
        case 1: {
          // glowing dot: soft halo + crisp core
          const hr = s * 3;
          g.imageSmoothingEnabled = true;
          g.globalAlpha = a * 0.55;
          g.drawImage(glowImg(p.c), x - hr, y - hr, hr * 2, hr * 2);
          g.imageSmoothingEnabled = false;
          g.globalAlpha = a;
          g.fillStyle = p.c;
          g.fillRect(Math.round(x * k) / k - 0.5, Math.round(y * k) / k - 0.5, 1, 1);
          break;
        }
        case 2: {
          // sparkle (plus)
          const r = Math.max(1, Math.round(s));
          const px = Math.round(x);
          const py = Math.round(y);
          g.fillStyle = p.c;
          g.fillRect(px - r, py, r * 2 + 1, 1);
          g.fillRect(px, py - r, 1, r * 2 + 1);
          break;
        }
        case 3: {
          // streak along velocity
          const len = Math.min(8, Math.hypot(p.vx, p.vy) * 0.04 + 1);
          const ang = Math.atan2(p.vy, p.vx);
          g.strokeStyle = p.c;
          g.lineWidth = Math.max(0.6, s * 0.8);
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len);
          g.stroke();
          break;
        }
        case 4: {
          // smoke / steam puff
          g.fillStyle = p.c;
          g.beginPath();
          g.arc(x, y, Math.max(0.5, s), 0, Math.PI * 2);
          g.fill();
          break;
        }
        default: {
          const q = Math.max(1, s);
          g.fillStyle = p.c;
          g.fillRect(Math.round((x - q / 2) * k) / k, Math.round((y - q / 2) * k) / k, q, q);
        }
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // ================================================================== floating texts (pooled)
  const TSTYLE = {
    normal: { size: 9, color: '#ffffff', life: 0.75, vy: -30, pop: 0.25 },
    skill: { size: 10, color: '#ffe7c2', life: 0.85, vy: -30, pop: 0.35 },
    ally: { size: 8, color: '#c4f1ff', life: 0.7, vy: -26, pop: 0.2 },
    crit: { size: 13, color: '#ffd23f', color2: '#ff7a1a', life: 1.0, vy: -32, pop: 0.6 },
    hurt: { size: 9, color: '#ff5b5b', life: 0.8, vy: -24, pop: 0.3 },
    absorb: { size: 9, color: '#8fd3ff', life: 0.8, vy: -22, pop: 0.3 },
    heal: { size: 9, color: '#6dff8e', life: 0.95, vy: -20, pop: 0.3 },
    miss: { size: 8, color: '#b9b9c8', life: 0.7, vy: -18, pop: 0.2 },
    level: { size: 13, color: '#ffe066', color2: '#ffae1a', life: 1.7, vy: -12, pop: 0.8 },
    reward: { size: 9, color: '#ffffff', life: 2.0, vy: -10, pop: 0.6, pill: true },
    small: { size: 7, color: '#ffe9a8', life: 0.9, vy: -18, pop: 0.2 },
  };
  const texts = [];
  for (let i = 0; i < TEXT_CAP; i++) texts.push({ on: false, str: '', x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 1, st: TSTYLE.normal, delay: 0, pill: null });
  let textN = 0;
  let frameTexts = 0; // damage numbers spawned since the last draw (staggered so bursts stay legible)
  const stackById = new Map();
  function addText(str, x, y, styleName, delay, pillColor) {
    const st = TSTYLE[styleName] || TSTYLE.normal;
    let o;
    if (textN < TEXT_CAP) o = texts[textN++];
    else {
      // recycle the oldest
      let best = 0;
      let bestU = -1;
      for (let i = 0; i < textN; i++) {
        const u = texts[i].t / texts[i].life;
        if (u > bestU) {
          bestU = u;
          best = i;
        }
      }
      o = texts[best];
    }
    o.on = true;
    o.str = String(str);
    o.x = x;
    o.y = y;
    o.vx = rnd(-6, 6);
    o.vy = st.vy;
    o.t = 0;
    o.life = st.life;
    o.st = st;
    o.delay = Math.max(0, num(delay, 0));
    o.pill = pillColor || null;
    return o;
  }
  function stackOffset(id) {
    if (!id) return 0;
    const now = clock;
    const s = stackById.get(id);
    if (s && now - s.t < 0.28) {
      s.n = (s.n + 1) % 4;
      s.t = now;
      return s.n;
    }
    stackById.set(id, { t: now, n: 0 });
    if (stackById.size > 64) stackById.clear();
    return 0;
  }
  function updateTexts(dt) {
    for (let i = 0; i < textN; ) {
      const o = texts[i];
      if (o.delay > 0) {
        o.delay -= dt;
        i++;
        continue;
      }
      o.t += dt;
      if (o.t >= o.life) {
        textN--;
        texts[i] = texts[textN];
        texts[textN] = o;
        o.on = false;
        continue;
      }
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.vy *= Math.max(0, 1 - dt * 2.4);
      i++;
    }
  }

  // ================================================================== effects, coins, timers
  const fx = [];
  function addFx(o) {
    if (fx.length >= FX_CAP) fx.shift();
    o.t = 0;
    fx.push(o);
    return o;
  }
  const coins = [];
  function addCoin(x, y, kind, delay) {
    if (coins.length >= COIN_CAP) coins.shift();
    coins.push({
      x: x, y: y, vx: rnd(-50, 40), vy: rnd(-120, -70), t: 0, home: rnd(0.32, 0.5), kind: kind || 'coin',
      ph: Math.random(), delay: num(delay, 0), bounced: false,
    });
  }
  const later = [];
  function after(delay, fn) {
    if (later.length >= LATER_CAP) later.shift();
    later.push({ at: clock + Math.max(0, delay), fn: fn });
  }
  function shake(amount) {
    if (reduced) return;
    trauma = Math.min(1, trauma + amount);
  }
  function flash(color, a) {
    if (reduced) a *= 0.4;
    flashColor = color;
    flashA = Math.max(flashA, a);
  }

  let miniChest = null;
  function miniChestImg() {
    if (miniChest) return miniChest;
    miniChest = layerCanvas(10, 9, (g) => {
      rect(g, 0, 3, 10, 6, '#8a4b22');
      rect(g, 0, 0, 10, 4, '#a85d2a');
      rect(g, 1, 0, 8, 1, '#c97a3c');
      rect(g, 0, 3, 10, 1, '#5a2e14');
      rect(g, 0, 0, 1, 9, '#e0b04a');
      rect(g, 9, 0, 1, 9, '#e0b04a');
      rect(g, 4, 3, 2, 3, '#ffd34d');
      rect(g, 0, 8, 10, 1, '#4a2410');
    });
    return miniChest;
  }
  const shadowCache = {};
  function shadowImg(w) {
    const key = Math.max(4, Math.round(w));
    let c = shadowCache[key];
    if (c) return c;
    const h = Math.max(3, Math.round(key / 4.5));
    c = layerCanvas(key + 2, h + 2, (g) => {
      ellipse(g, (key + 2) / 2, (h + 2) / 2, key / 2, h / 2, '#000000');
    });
    shadowCache[key] = c;
    return c;
  }
  function drawShadow(g, x, y, w, a) {
    const c = shadowImg(w);
    g.globalAlpha = clamp(a, 0, 1);
    g.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height / 2));
    g.globalAlpha = baseAlpha;
  }

  // ================================================================== banners
  let banner = null;
  const bannerQ = [];
  function showBanner(b, priority) {
    b.t = 0;
    b.dur = b.dur || 1.8;
    if (!banner || priority) {
      banner = b;
      if (priority) bannerQ.length = 0;
      return;
    }
    bannerQ.push(b);
    if (bannerQ.length > 3) bannerQ.shift();
    if (banner.t > 0.7) banner.t = Math.max(banner.t, banner.dur - 0.3);
  }
  function updateBanner(dt) {
    if (!banner) return;
    banner.t += dt;
    if (banner.t >= banner.dur) banner = bannerQ.length ? bannerQ.shift() : null;
  }
  function rewardText(r) {
    if (!r || typeof r !== 'object') return '';
    const parts2 = [];
    const add = (key, label) => {
      const v = num(r[key], 0);
      if (v > 0) parts2.push('+' + fmt(v) + ' ' + label);
    };
    add('chests', 'Chests');
    add('premiumChests', 'Premium');
    add('gold', 'Gold');
    add('gems', 'Gems');
    add('scrolls', 'Scrolls');
    add('keys', 'Keys');
    return parts2.slice(0, 3).join('  ·  ');
  }

  // ================================================================== bus events → VFX
  function battle() {
    return DD.battle || null;
  }
  function enemyById(id) {
    const B = battle();
    if (!B || !Array.isArray(B.enemies) || !id) return null;
    for (const e of B.enemies) if (e && e.id === id) return e;
    return null;
  }
  function heroPos() {
    const B = battle();
    const h = B && B.hero;
    return { x: num(h && h.x, HERO_X), y: num(h && h.y, GROUND) };
  }

  function onHit(p) {
    const x = num(p.x, W / 2);
    const y = num(p.y, GROUND - 30);
    const amount = Math.max(0, num(p.amount, 0));
    if (p.target === 'hero') {
      if (p.miss) {
        addText('MISS', x + rnd(-4, 4), y, 'miss');
        return;
      }
      const absorbed = Math.max(0, num(p.absorbed, 0));
      const taken = Math.max(0, amount - absorbed);
      if (taken <= 0 && absorbed > 0) {
        addText(fmt(absorbed), x + rnd(-5, 5), y, 'absorb');
        burst(x, y + 12, 4, ['#8fd3ff', '#d6f1ff'], 50, 0.35, { g: 0, add: true });
      } else if (taken > 0) {
        addText('-' + fmt(taken), x + rnd(-5, 5), y, 'hurt');
        heroFlash = 0.12;
        burst(x + 4, y + 12, 4, ['#ff5b5b', '#ffd0d0'], 70, 0.3, {});
      }
      return;
    }
    const e = enemyById(p.id);
    const isBoss = !!(e && e.isBoss);
    if (p.miss) {
      addText('MISS', x, y, 'miss');
      return;
    }
    let delay = 0;
    if (castCtx && p.kind === 'skill' && castCtx.delay > 0) delay = castCtx.delay;
    const style = p.crit ? 'crit' : p.kind === 'skill' ? 'skill' : p.kind === 'ally' ? 'ally' : 'normal';
    const n = stackOffset(p.id);
    const burstIdx = frameTexts++;
    delay += Math.min(0.32, burstIdx * 0.035);
    addText(fmt(amount) + (p.crit ? '!' : ''), x + rnd(-4, 4), y - 2 - n * 8 - (burstIdx % 2) * 11 - (burstIdx % 4 >= 2 ? 4 : 0), style, delay);
    const ew = e ? num(e.w, 16) : 16;
    const eh = e ? num(e.h, 16) : 16;
    const sx = x - ew * 0.3;
    const sy = y + eh * 0.45;
    const sparkCol = p.crit ? ['#ffd23f', '#fff6c8', '#ff9a3c'] : ['#ffffff', '#ffe9a8', '#ffd0a0'];
    const doSparks = () => burst(sx, sy, p.crit ? 7 : 3, sparkCol, p.crit ? 110 : 75, 0.28, { kind: 3, g: 60, add: true });
    if (delay > 0) after(delay, doSparks);
    else doSparks();
    if (isBoss) shake(p.crit ? 0.2 : 0.07);
  }
  function onHeal(p) {
    const x = num(p.x, heroPos().x);
    const y = num(p.y, GROUND - 30);
    const amount = Math.max(0, num(p.amount, 0));
    if (amount <= 0) return;
    addText('+' + fmt(amount), x + rnd(-4, 4), y - 4, 'heal');
    for (let i = 0; i < (reduced ? 2 : 5); i++) {
      const q = part(x + rnd(-8, 8), y + rnd(8, 26), rnd(-4, 4), rnd(-26, -14), rnd(0.6, 1), pick(['#6dff8e', '#d8ffe0']), 2, 1);
      q.add = true;
      q.g = 0;
    }
  }
  function onKilled(p) {
    const x = num(p.x, W / 2);
    const y = num(p.y, GROUND - 10);
    const T = curTheme ? getTheme(curTheme) : null;
    const tint = (T && T.kill) || '#cfc9b6';
    const e = enemyById(p.id);
    const big = !!p.isBoss;
    const n = big ? 26 : 10;
    burst(x, y, n, ['#e8e4f0', '#c9c6d8', '#a9a6c0', tint], big ? 75 : 42, big ? 0.95 : 0.6, { kind: 4, size: big ? 3 : 1.8, s1: big ? 8 : 4.5, g: -16, drag: 4, a: 0.7 });
    burst(x, y, big ? 14 : 5, [tint, '#ffffff'], big ? 160 : 90, 0.45, { kind: 3, g: 120, add: true });
    if (big) {
      addFx({ type: 'spr', name: 'fx_explosion', anim: 'play', x: x, y: y, dur: 0.6, sc: 1.8 });
      after(0.12, () => addFx({ type: 'spr', name: 'fx_explosion', anim: 'play', x: x - 14, y: y + 10, dur: 0.5, sc: 1.1 }));
      after(0.22, () => addFx({ type: 'spr', name: 'fx_explosion', anim: 'play', x: x + 16, y: y - 8, dur: 0.5, sc: 1.1 }));
      addFx({ type: 'ring', x: x, y: y, r0: 6, r1: 80, w: 4, color: '#fff2c0', dur: 0.55 });
      shake(0.75);
      flash('#fff6d8', 0.35);
    }
    const gold = num(p.gold, 0);
    const nCoins = big ? (reduced ? 6 : 14) : gold > 0 ? (reduced ? 1 : 2 + (Math.random() < 0.4 ? 1 : 0)) : 0;
    for (let i = 0; i < nCoins; i++) addCoin(x + rnd(-6, 6), y + rnd(-4, 6), 'coin', i * 0.02);
    if (p.chest) addCoin(x, y, 'chest', 0.05);
    if (e && !big && e.flying) burst(x, y + 6, 3, ['#ffffff'], 40, 0.3, {});
  }
  function onSkill(p) {
    const id = String(p.id || '');
    const hx = num(p.x, heroPos().x);
    const hy = num(p.y, GROUND - 14);
    const targets = Array.isArray(p.targets)
      ? p.targets.filter((t) => t && Number.isFinite(t.x) && Number.isFinite(t.y)).slice(0, 12)
      : [];
    castCtx = null;
    switch (id) {
      case 'bomb': {
        castCtx = { id: id, delay: 0.16 };
        targets.forEach((t, i) => {
          addFx({ type: 'lob', x0: hx + 6, y0: hy - 6, x1: t.x, y1: t.y, dur: 0.16, delay: 0 });
          after(0.16 + i * 0.03, () => {
            addFx({ type: 'spr', name: 'fx_explosion', anim: 'play', x: t.x, y: t.y, dur: 0.45, sc: 1 });
            burst(t.x, t.y, 8, ['#ffb347', '#ff5a1f', '#ffe08a'], 120, 0.45, { kind: 3, add: true, g: 160 });
            burst(t.x, t.y, 5, ['#4a3a34', '#6a5a50'], 40, 0.7, { kind: 4, size: 3, s1: 1, g: -25 });
          });
        });
        after(0.16, () => shake(0.28));
        break;
      }
      case 'lightning': {
        const pts = [{ x: hx + 6, y: hy - 8 }];
        const rest = targets.slice();
        let cur = pts[0];
        while (rest.length) {
          let bi = 0;
          let bd = Infinity;
          for (let i = 0; i < rest.length; i++) {
            const d = Math.hypot(rest[i].x - cur.x, rest[i].y - cur.y);
            if (d < bd) {
              bd = d;
              bi = i;
            }
          }
          cur = rest.splice(bi, 1)[0];
          pts.push(cur);
        }
        addFx({ type: 'bolt', pts: pts, dur: 0.38, seed: Math.random() * 1000, jit: [] });
        for (const t of targets) {
          addFx({ type: 'spr', name: 'fx_lightning', anim: 'play', x: t.x, y: t.y + 8, dur: 0.35, sc: 1, add: true });
          burst(t.x, t.y, 6, ['#bfe9ff', '#ffffff', '#7fc8ff'], 110, 0.3, { kind: 3, add: true, g: 0 });
        }
        flash('#bfe9ff', 0.16);
        shake(0.12);
        break;
      }
      case 'frost': {
        addFx({ type: 'ring', x: hx, y: hy + 6, r0: 4, r1: 250, w: 4, color: '#bff0ff', dur: 0.55, ice: true });
        addFx({ type: 'ring', x: hx, y: hy + 6, r0: 2, r1: 180, w: 2, color: '#ffffff', dur: 0.45 });
        for (const t of targets) {
          after(0.08, () => {
            addFx({ type: 'spr', name: 'fx_frost', anim: 'play', x: t.x, y: Math.min(GROUND + 1, t.y + 14), dur: 0.55, sc: 1 });
            burst(t.x, t.y, 7, ['#bff0ff', '#ffffff', '#7fd0ff'], 80, 0.6, { kind: 2, size: 1, g: 60 });
          });
        }
        flash('#bff0ff', 0.2);
        break;
      }
      case 'meteor': {
        const fall = 0.42;
        castCtx = { id: id, delay: fall };
        let list = targets.length ? targets : [{ x: hx + 90, y: GROUND - 12 }];
        if (list.length > 3) list = [list[0], list[Math.floor(list.length / 2)], list[list.length - 1]];
        list.forEach((t, i) => {
          const d = i * 0.06;
          after(d, () => addFx({ type: 'meteor', x0: t.x + 70 + rnd(-10, 10), y0: -24, x1: t.x, y1: t.y, dur: fall - d * 0.5 }));
        });
        flash('#ffb347', 0.12);
        break;
      }
      case 'heal': {
        addFx({ type: 'spr', name: 'fx_heal', anim: 'play', x: hx, y: hy + 15, dur: 0.7, sc: 1, add: true });
        addFx({ type: 'column', x: hx, dur: 0.7, color: '#6dff8e', w: 18 });
        for (let i = 0; i < (reduced ? 5 : 14); i++) {
          const q = part(hx + rnd(-12, 12), hy + rnd(0, 16), rnd(-6, 6), rnd(-46, -20), rnd(0.6, 1.1), pick(['#6dff8e', '#d8ffe0', '#ffffff']), 2, rnd(1, 2));
          q.add = true;
        }
        break;
      }
      case 'shield': {
        shieldPop = 0.35;
        addFx({ type: 'ring', x: hx, y: hy - 2, r0: 26, r1: 8, w: 3, color: '#b9d9ff', dur: 0.3 });
        burst(hx, hy - 2, 10, ['#b9d9ff', '#d6c2ff', '#ffffff'], 90, 0.5, { kind: 2, g: 0, add: true });
        break;
      }
      case 'warcry': {
        addFx({ type: 'ring', x: hx, y: hy, r0: 6, r1: 110, w: 5, color: '#ff5a3c', dur: 0.5 });
        addFx({ type: 'ring', x: hx, y: hy, r0: 4, r1: 70, w: 3, color: '#ffd0a0', dur: 0.4 });
        burst(hx, hy, 10, ['#ff5a3c', '#ffb347'], 120, 0.5, { kind: 3, add: true, g: 0 });
        shake(0.22);
        break;
      }
      case 'blades': {
        burst(hx, hy, 12, ['#e8eef8', '#b9c6d8', '#ffffff'], 130, 0.4, { kind: 3, add: true, g: 0 });
        addFx({ type: 'ring', x: hx, y: hy, r0: 8, r1: 60, w: 2, color: '#e8eef8', dur: 0.35 });
        break;
      }
      default: {
        for (const t of targets) addFx({ type: 'spr', name: 'fx_explosion', anim: 'play', x: t.x, y: t.y, dur: 0.45, sc: 1 });
      }
    }
  }
  function onAlly(p) {
    const x = num(p.x, HERO_X - 24);
    const y = num(p.y, GROUND - 8);
    const tx = num(p.tx, x + 60);
    const ty = num(p.ty, y);
    switch (p.id) {
      case 'wolf':
        addFx({ type: 'spr', name: 'fx_slash', anim: 'play', x: tx, y: ty, dur: 0.22, sc: 0.7 });
        break;
      case 'fairy': {
        const n = reduced ? 3 : 7;
        for (let i = 0; i < n; i++) {
          const u = i / n;
          const q = part(x + (tx - x) * u, y + (ty - y) * u + Math.sin(u * Math.PI) * -10, rnd(-6, 6), rnd(-10, 0), 0.5 + u * 0.3, pick(['#ff9bf0', '#d8ffe0', '#ffffff']), 2, 1);
          q.add = true;
        }
        break;
      }
      case 'drone_ally':
        addFx({ type: 'beam', x0: x + 5, y0: y, x1: tx, y1: ty, color: '#21e6ff', dur: 0.1 });
        burst(tx, ty, 3, ['#7df9ff', '#ffffff'], 60, 0.2, { kind: 3, add: true, g: 0 });
        break;
      case 'golem_ally':
        addFx({ type: 'slam', x: x + 8, y: GROUND, r1: 90, dur: 0.45, color: '#ff8a2e' });
        burst(x + 8, GROUND - 2, 8, ['#6a5040', '#8a6a50', '#ff8a2e'], 80, 0.5, { up: true, g: 220 });
        shake(0.06);
        break;
      default:
        break;
    }
  }
  function onProjHit(p) {
    const c = PROJ_COLORS[p.kind] || PROJ_COLORS.arrow;
    burst(num(p.x, HERO_X), num(p.y, GROUND - 14), 6, [c[0], c[1], '#ffffff'], 80, 0.3, { kind: 3, add: true, g: 40 });
  }
  function onEnemyAttack(p) {
    if (!p.ranged) return;
    const B = battle();
    const e = enemyById(p.id);
    const kind = (e && e.projectile) || 'arrow';
    const c = PROJ_COLORS[kind] || PROJ_COLORS.arrow;
    burst(num(p.x, W - 40), num(p.y, GROUND - 14), 3, [c[0], '#ffffff'], 40, 0.18, { add: true, g: 0 });
    if (B && B.isBossWave && e && e.isBoss) shake(0.04);
  }
  function onHeroAttack(p) {
    const x = num(p.x, HERO_X + 14);
    const y = num(p.y, GROUND - 14);
    if (p.crit) {
      addFx({ type: 'spr', name: 'fx_slash', anim: 'play', x: x + 8, y: y, dur: 0.2, sc: 1.1 });
      burst(x + 12, y, 4, ['#ffd23f', '#ffffff'], 90, 0.25, { kind: 3, add: true, g: 0 });
    } else if (!reduced) {
      addFx({ type: 'spr', name: 'fx_slash', anim: 'play', x: x + 6, y: y, dur: 0.16, sc: 0.8, alpha: 0.7 });
    }
  }
  function onWave(p) {
    const B = battle();
    const floor = Math.max(1, Math.floor(num(p.floor, num(B && B.floor, 1))));
    if (p.mode === 'dungeon') {
      const d = dungeonInfo(p.dungeon || (B && B.dungeon && B.dungeon.id));
      if (p.isBoss) {
        const bossName = d.enemy ? enemyName(d.enemy) : 'Boss';
        showBanner({ title: 'BOSS!', sub: bossName, style: 'boss', dur: 1.8 }, true);
        shake(0.3);
      } else {
        showBanner({ title: 'Survive!', sub: d.name, style: 'dungeon', color: d.color, dur: 1.6 }, true);
      }
      return;
    }
    const wave = Math.floor(num(p.wave, 1));
    if (p.isBoss) {
      const bi = biomeInfo(floor);
      showBanner({ title: 'BOSS!', sub: bi.boss ? enemyName(bi.boss) : 'Floor ' + floor, style: 'boss', dur: 1.9 }, true);
      shake(0.3);
    } else if (wave <= 1) {
      const bi = biomeInfo(floor);
      showBanner({ title: 'Floor ' + floor, sub: bi.name, style: 'floor', color: bi.accent, dur: 1.7 });
    } else {
      showBanner({ title: 'Wave ' + wave + '/' + wavesPerFloor(), sub: '', style: 'wave', dur: 1.0 });
    }
  }
  function wavesPerFloor() {
    return Math.max(2, Math.floor(num(DD.data && DD.data.WAVES_PER_FLOOR, 5)));
  }
  function onFloorCleared(p) {
    showBanner({ title: 'FLOOR CLEARED', sub: rewardText(p.rewards), style: 'clear', dur: 2.0 }, true);
    const h = heroPos();
    for (let i = 0; i < (reduced ? 8 : 24); i++) {
      const q = part(rnd(40, W - 40), rnd(-6, 10), rnd(-20, 20), rnd(30, 70), rnd(1.2, 2.2), pick(['#ffd23f', '#ff5ef3', '#5ef3ff', '#7dff6a', '#ffffff']), 0, 2);
      q.g = 30;
      q.wob = 6;
      q.ph = Math.random() * 6;
    }
    burst(h.x, h.y - 16, 8, ['#ffd23f', '#fff6c8'], 90, 0.6, { kind: 2, g: 20, add: true });
  }
  function onBossFailed(p) {
    const B = battle();
    const floor = Math.max(1, Math.floor(num(B && B.floor, 1)));
    showBanner({
      title: 'Boss escaped…',
      sub: p && p.reason === 'death' ? 'Farming floor ' + floor + ' to grow stronger' : 'Time is up — farming floor ' + floor,
      style: 'fail',
      dur: 2.2,
    }, true);
  }
  function onHeroDied() {
    const h = heroPos();
    burst(h.x, h.y - 12, 14, ['#e8e4f0', '#a9a6c0', '#ff5b5b'], 50, 0.8, { kind: 4, size: 2, s1: 5, g: -16, drag: 4, a: 0.7 });
    shake(0.35);
    deadMax = Math.max(0.5, num(battle() && battle().deadTimer, 2));
  }
  function onRevived() {
    const h = heroPos();
    addFx({ type: 'column', x: h.x, dur: 0.6, color: '#ffffff', w: 16 });
    burst(h.x, h.y - 12, 12, ['#ffffff', '#fff6c8', '#bfe9ff'], 70, 0.6, { kind: 2, g: -10, add: true });
  }
  function onDungeonStart(p) {
    const d = dungeonInfo(p.id);
    showBanner({ title: d.name, sub: 'Level ' + Math.max(1, Math.floor(num(p.level, 1))) + ' · Boss Dungeon', style: 'dungeon', color: d.color, dur: 2.0 }, true);
    flash(d.color, 0.25);
  }
  function onDungeonWon(p) {
    showBanner({ title: 'VICTORY!', sub: rewardText(p.rewards), style: 'win', dur: 2.2 }, true);
    for (let i = 0; i < (reduced ? 10 : 30); i++) {
      const q = part(rnd(30, W - 30), rnd(-6, 12), rnd(-24, 24), rnd(30, 80), rnd(1.3, 2.4), pick(['#ffd23f', '#ff5ef3', '#5ef3ff', '#7dff6a', '#ffffff']), 0, 2);
      q.g = 30;
      q.wob = 6;
      q.ph = Math.random() * 6;
    }
  }
  function onDungeonFailed(p) {
    const reason = p && p.reason;
    const title = reason === 'timeout' ? "TIME'S UP" : reason === 'forfeit' ? 'Dungeon left' : 'DEFEATED';
    const d = dungeonInfo(p && p.id);
    showBanner({ title: title, sub: d.name + ' — try again with a stronger hero', style: 'fail', dur: 2.0 }, true);
  }
  function onLevelUp(p) {
    const h = heroPos();
    addFx({ type: 'column', x: h.x, dur: 1.1, color: '#ffd23f', w: 26 });
    addText('LEVEL UP!', h.x, h.y - 40, 'level');
    const lv = Math.floor(num(p && p.level, 0));
    if (lv > 0) addText('Lv ' + lv, h.x, h.y - 28, 'small', 0.15);
    for (let i = 0; i < (reduced ? 6 : 18); i++) {
      const q = part(h.x + rnd(-12, 12), h.y - rnd(0, 30), rnd(-8, 8), rnd(-60, -24), rnd(0.6, 1.2), pick(['#ffd23f', '#fff6c8', '#ffffff']), 2, rnd(1, 2));
      q.add = true;
    }
    flash('#ffe9a0', 0.15);
  }
  function onChestCollected(p) {
    const x = num(p.x, W / 2);
    const y = num(p.y, 40);
    const r = p.reward || {};
    const col = REWARD_COLORS[r.type] || '#ffd34d';
    burst(x, y, 18, ['#ffd23f', '#ffffff', col, col], 140, 0.7, { kind: 2, g: 60, add: true });
    burst(x, y, 10, ['#ffe9a8', col], 90, 0.5, { kind: 3, g: 0, add: true });
    addFx({ type: 'ring', x: x, y: y, r0: 4, r1: 34, w: 3, color: col, dur: 0.4 });
    let label = typeof r.label === 'string' && r.label ? r.label : '';
    if (!label) {
      const amt = num(r.amount, 0);
      const names = { gems: 'Gems', gold: 'Gold', chests: 'Chests', key: 'Key', keys: 'Keys', scrolls: 'Scrolls' };
      label = '+' + fmt(amt) + ' ' + (names[r.type] || 'Treasure');
    }
    addText(label, clamp(x, 40, W - 40), clamp(y + 4, 18, H - 30), 'reward', 0, col);
    flash('#fff6c8', 0.18);
  }

  function subscribe() {
    if (subscribed || !DD.bus || typeof DD.bus.on !== 'function') return;
    subscribed = true;
    const on = (evt, fn) =>
      DD.bus.on(evt, (p) => {
        if (!inited) return;
        fn(p && typeof p === 'object' ? p : {});
      });
    on('hit', onHit);
    on('heal', onHeal);
    on('enemy:killed', onKilled);
    on('enemy:attack', onEnemyAttack);
    on('hero:attack', onHeroAttack);
    on('hero:died', onHeroDied);
    on('hero:revived', onRevived);
    on('wave:start', onWave);
    on('floor:cleared', onFloorCleared);
    on('boss:failed', onBossFailed);
    on('skill:cast', onSkill);
    on('ally:attack', onAlly);
    on('projectile:hit', onProjHit);
    on('flyingChest:collected', onChestCollected);
    on('dungeon:start', onDungeonStart);
    on('dungeon:won', onDungeonWon);
    on('dungeon:failed', onDungeonFailed);
    on('levelup', onLevelUp);
  }

  // ================================================================== background drawing
  function tileLayer(g, img, P, off, y) {
    if (!img) return;
    let x = -(((off % P) + P) % P);
    x = Math.round(x * k) / k;
    while (x > -MARGIN) x -= P;
    for (; x < W + MARGIN; x += P) g.drawImage(img, x, y);
  }
  function flicker(t, ph) {
    return 0.86 + Math.sin(t * 9.1 + ph) * 0.06 + Math.sin(t * 23.7 + ph * 2.1) * 0.05 + Math.sin(t * 3.3 + ph) * 0.03;
  }
  function layerLights(g, list, P, off, t) {
    for (const L of list) {
      let x = L.x - (((off % P) + P) % P);
      while (x < -L.r) x += P;
      for (; x < W + L.r; x += P) {
        let a;
        if (L.kind === 'neon') {
          const cut = hash(Math.floor(t * 9) + Math.floor(L.ph * 13), Math.floor(L.ph * 7), 5) < 0.06;
          a = cut ? 0.12 : 0.5 + Math.sin(t * 2 + L.ph) * 0.06;
        } else if (L.kind === 'steady') {
          a = 0.42 + Math.sin(t * 1.3 + L.ph) * 0.04;
        } else {
          a = 0.34 + Math.sin(t * 1.6 + L.ph) * 0.14;
        }
        glow(g, L.color, x, L.y, L.r, a);
      }
    }
  }
  function drawLight(g, L, x, t, idx) {
    const ph = idx * 1.7 + L.x * 0.13;
    const fl = flicker(t, ph);
    switch (L.kind) {
      case 'torch': {
        rect(g, x - 1, 130, 2, 31, L.pole);
        rect(g, x - 3, 159, 7, 2, L.pole);
        rect(g, x - 2, 157, 5, 2, shade(L.pole, 0.1));
        rect(g, x - 4, 127, 9, 3, shade(L.pole, 0.15));
        rect(g, x - 3, 130, 7, 1, shade(L.pole, -0.2));
        flame(g, x, 126, t, ph, L.mid, L.color, L.core, 1.1);
        glow(g, L.color, x, 122, L.r * fl, 0.5 * fl);
        glow(g, L.core, x, 123, 7 * fl, 0.55);
        if (Math.random() < 0.05 * (reduced ? 0.3 : 1)) {
          const q = part(x + rnd(-1, 1), 120, rnd(-6, 6), rnd(-26, -12), rnd(0.6, 1.1), L.color, 0, 1);
          q.add = true;
          q.front = false;
          q.par = 1;
        }
        break;
      }
      case 'brazier': {
        rect(g, x - 5, 152, 2, 9, L.pole);
        rect(g, x + 4, 152, 2, 9, L.pole);
        rect(g, x - 1, 150, 3, 11, L.pole);
        rect(g, x - 8, 146, 17, 4, shade(L.pole, 0.15));
        rect(g, x - 7, 150, 15, 2, shade(L.pole, -0.1));
        rect(g, x - 8, 146, 17, 1, shade(L.pole, 0.35));
        flame(g, x - 3, 145, t, ph, L.mid, L.color, L.core, 1.0);
        flame(g, x + 3, 145, t + 0.37, ph + 2, L.mid, L.color, L.core, 0.9);
        flame(g, x, 145, t + 0.11, ph + 4, L.mid, L.color, L.core, 1.35);
        glow(g, L.color, x, 138, L.r * fl, 0.55 * fl);
        glow(g, L.core, x, 141, 9 * fl, 0.5);
        if (Math.random() < 0.09 * (reduced ? 0.3 : 1)) {
          const q = part(x + rnd(-4, 4), 136, rnd(-8, 8), rnd(-36, -16), rnd(0.6, 1.2), pick([L.color, L.mid, L.core]), 0, 1);
          q.add = true;
          q.front = false;
          q.par = 1;
        }
        break;
      }
      case 'shroom': {
        const pulse = 0.75 + Math.sin(t * 1.8 + ph) * 0.25;
        const c1 = L.color;
        const c2 = L.alt || L.color;
        smallMushroom(g, x - 5, 162, 6, c1, '#d8cce4', '#ffffff');
        smallMushroom(g, x + 2, 162, 9, c2, '#d8cce4', '#ffffff');
        smallMushroom(g, x + 7, 162, 4, c1, '#d8cce4', '#ffffff');
        glow(g, c2, x + 3, 152, L.r * pulse, 0.42 * pulse);
        glow(g, c1, x - 4, 156, L.r * 0.6 * pulse, 0.35 * pulse);
        break;
      }
      case 'lamp': {
        rect(g, x - 1, 122, 3, 39, L.pole);
        rect(g, x - 3, 158, 7, 3, L.pole);
        rect(g, x - 4, 110, 9, 2, shade(L.pole, 0.2));
        rect(g, x - 3, 112, 7, 9, rgba(L.color, 0.9));
        rect(g, x - 1, 113, 3, 7, L.core);
        rect(g, x - 4, 112, 1, 9, shade(L.pole, 0.1));
        rect(g, x + 4, 112, 1, 9, shade(L.pole, 0.1));
        rect(g, x - 4, 121, 9, 2, shade(L.pole, 0.2));
        rect(g, x - 1, 108, 3, 2, shade(L.pole, 0.1));
        glow(g, L.color, x, 116, L.r * (0.95 + (fl - 0.86) * 0.5), 0.5);
        glow(g, L.core, x, 116, 6, 0.6);
        break;
      }
      case 'neon': {
        const cut = hash(Math.floor(t * 8) + idx * 31, idx, 9) < 0.04;
        const a = cut ? 0.15 : 1;
        rect(g, x - 1, 120, 2, 41, '#16163a');
        rect(g, x - 3, 158, 6, 3, '#16163a');
        rect(g, x - 2, 120, 4, 26, '#0b0b22');
        g.globalAlpha = a * baseAlpha;
        rect(g, x - 1, 122, 2, 22, L.color);
        rect(g, x, 123, 1, 20, '#ffffff');
        g.globalAlpha = baseAlpha;
        glow(g, L.color, x, 133, L.r, 0.5 * a);
        break;
      }
      case 'crystal': {
        const bob = Math.sin(t * 1.6 + ph) * 3;
        const cy = 128 + bob;
        spike(g, x, cy, 7, 8, L.color, false);
        spike(g, x, cy + 1, 7, 7, shade(L.color, -0.35), true);
        rect(g, x - 1, cy - 5, 1, 4, L.core);
        glow(g, L.color, x, cy, L.r * (0.9 + Math.sin(t * 2.4 + ph) * 0.1), 0.5);
        drawShadow(g, x, 162, 10, 0.25 * baseAlpha);
        g.globalAlpha = baseAlpha;
        if (Math.random() < 0.05 * (reduced ? 0.3 : 1)) {
          const q = part(x + rnd(-3, 3), cy, rnd(-5, 5), rnd(-14, -4), rnd(0.8, 1.4), L.color, 2, 1);
          q.add = true;
          q.front = false;
          q.par = 1;
        }
        break;
      }
      default:
        break;
    }
  }
  function drawBackground(g, T, scroll, t, alpha) {
    baseAlpha = alpha;
    g.globalAlpha = alpha;
    if (T.farOpaque) {
      g.fillStyle = T.bottom;
      g.fillRect(-MARGIN, -MARGIN, W + MARGIN * 2, MARGIN);
    } else if (T.sky) {
      g.drawImage(T.sky, -MARGIN, -MARGIN);
    }
    if (T.extraSky) T.extraSky(g, t);
    const offFar = scroll * 0.2;
    const offMid = scroll * 0.5;
    tileLayer(g, T.far, T.farP, offFar, 0);
    if (T.extraFar) T.extraFar(g, t, offFar);
    if (T.farLights.length) layerLights(g, T.farLights, T.farP, offFar, t);
    tileLayer(g, T.mid, T.midP, offMid, 0);
    if (T.extraMid) T.extraMid(g, t, offMid);
    if (T.midLights.length) layerLights(g, T.midLights, T.midP, offMid, t);
    if (T.fog && T.fog.tile) {
      g.globalAlpha = alpha * 0.9;
      tileLayer(g, T.fog.tile, 256, scroll * T.fog.speed + t * T.fog.drift, T.fog.y);
      g.globalAlpha = alpha;
    }
    tileLayer(g, T.floor, T.floorP, scroll, FLOOR_Y);
    if (T.floorGlow) {
      const a = 0.5 + Math.sin(t * 2.1) * 0.25;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = alpha * a;
      tileLayer(g, T.floorGlow, T.floorP, scroll, FLOOR_Y);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = alpha;
    }
    // lights at 1× scroll
    const P = T.lightP;
    const off = ((scroll % P) + P) % P;
    T.lights.forEach((L, idx) => {
      let x = L.x - off;
      while (x < -60) x += P;
      for (; x < W + 60; x += P) drawLight(g, L, Math.round(x), t, idx + Math.floor((x + scroll) / P) * 3);
    });
    if (T.overlay === 'scan') {
      g.globalAlpha = alpha * 0.16;
      g.fillStyle = '#000000';
      for (let y = 0; y < H; y += 2) g.fillRect(-MARGIN, y, W + MARGIN * 2, 1);
      const band = ((t * 26) % (H + 40)) - 20;
      g.globalAlpha = alpha * 0.05;
      g.fillStyle = '#9af6ff';
      g.fillRect(-MARGIN, band, W + MARGIN * 2, 10);
      g.globalAlpha = alpha;
    }
    baseAlpha = 1;
    g.globalAlpha = 1;
  }
  function spawnAmbient(T, dt, scroll) {
    const A = T.ambient;
    if (!A) return;
    ambAcc += A.rate * dt * (reduced ? 0.35 : 1);
    let guard = 0;
    while (ambAcc >= 1 && guard++ < 6) {
      ambAcc -= 1;
      const c = pick(A.colors);
      let p;
      switch (A.kind) {
        case 'spore':
          p = part(rnd(-10, W + 10), rnd(130, 196), rnd(-3, 3), rnd(-14, -5), rnd(5, 8), c, 1, 1);
          p.wob = rnd(2, 5);
          p.add = true;
          break;
        case 'ember':
          p = part(rnd(-10, W + 10), rnd(150, 202), rnd(-8, 8), rnd(-42, -16), rnd(2, 4), c, 0, 1);
          p.wob = rnd(1, 4);
          p.add = true;
          break;
        case 'bits':
          p = part(rnd(-10, W + 10), rnd(60, 196), 0, rnd(-12, -4), rnd(3, 6), c, 0, 1);
          p.add = true;
          p.a = 0.7;
          break;
        case 'mote':
          p = part(rnd(-10, W + 20), rnd(10, 190), rnd(-9, -2), rnd(-5, 3), rnd(4, 8), c, 1, 1);
          p.add = true;
          p.wob = rnd(0, 3);
          break;
        case 'firefly':
          p = part(rnd(0, W), rnd(90, 165), rnd(-6, 6), rnd(-4, 4), rnd(4, 7), c, 6, 1);
          p.wob = rnd(4, 9);
          p.add = true;
          break;
        default:
          p = part(rnd(-10, W + 10), rnd(20, 168), rnd(-4, 4), rnd(-3, 3), rnd(3, 6), c, 0, 1);
          p.a = 0.55;
      }
      p.g = 0;
      p.fin = true;
      p.ph = Math.random() * 6;
      p.par = A.kind === 'ember' || A.kind === 'spore' ? 0.8 : 0.4;
      p.front = Math.random() < 0.3;
      if (p.kind === 6) p.front = false;
    }
    if (A.glint && Math.random() < dt * 3 * (reduced ? 0.3 : 1)) {
      const p = part(rnd(0, W), rnd(130, 172), 0, 0, rnd(0.4, 0.7), '#fff3b0', 2, 1);
      p.add = true;
      p.front = false;
      p.par = 1;
      p.fin = true;
    }
    if (T.vents) {
      const V = T.vents;
      for (const v of V.list) {
        const off = scroll * V.par;
        let x = v[0] - (((off % V.period) + V.period) % V.period);
        while (x < -20) x += V.period;
        for (; x < W + 20; x += V.period) {
          const cycle = (clock + v[0] * 0.01) % V.every;
          if (cycle < 0.7 && Math.random() < dt * (reduced ? 6 : 16)) {
            const p = part(x, v[1], rnd(14, 30), rnd(-14, -4), rnd(0.9, 1.6), pick(['#e8e2d0', '#cfc8b4', '#ffffff']), 4, 2);
            p.s1 = rnd(6, 10);
            p.a = 0.28;
            p.drag = 1.2;
            p.g = -6;
            p.front = false;
            p.par = V.par;
          }
        }
      }
    }
  }

  // vignette: four edge bands with linear gradients (far cheaper than a full-screen radial pass)
  const vigGrads = {};
  function vignetteBands(g, color, a) {
    if (!(a > 0.01)) return;
    let v = vigGrads[color];
    if (!v) {
      const lin = (x0, y0, x1, y1) => {
        const gr = g.createLinearGradient(x0, y0, x1, y1);
        gr.addColorStop(0, rgba(color, 1));
        gr.addColorStop(0.45, rgba(color, 0.35));
        gr.addColorStop(1, rgba(color, 0));
        return gr;
      };
      v = vigGrads[color] = {
        top: lin(0, -MARGIN, 0, 42),
        bottom: lin(0, H + MARGIN, 0, H - 30),
        left: lin(-MARGIN, 0, 58, 0),
        right: lin(W + MARGIN, 0, W - 58, 0),
      };
    }
    g.globalAlpha = a;
    g.fillStyle = v.top;
    g.fillRect(-MARGIN, -MARGIN, W + MARGIN * 2, 42 + MARGIN);
    g.fillStyle = v.bottom;
    g.fillRect(-MARGIN, H - 30, W + MARGIN * 2, 30 + MARGIN);
    g.fillStyle = v.left;
    g.fillRect(-MARGIN, -MARGIN, 58 + MARGIN, H + MARGIN * 2);
    g.fillStyle = v.right;
    g.fillRect(W - 58, -MARGIN, 58 + MARGIN, H + MARGIN * 2);
    g.globalAlpha = 1;
  }

  // ================================================================== entity drawing
  const order = [];
  function drawSprite(g, c, x, y, flip, alpha) {
    if (alpha <= 0.01) return;
    if (alpha < 1) g.globalAlpha = alpha;
    const dx = Math.round((x - c.width / 2) * k) / k;
    const dy = Math.round((y - c.height) * k) / k;
    if (flip) {
      g.save();
      g.translate(dx + c.width, dy);
      g.scale(-1, 1);
      g.drawImage(c, 0, 0);
      g.restore();
    } else {
      g.drawImage(c, dx, dy);
    }
    if (alpha < 1) g.globalAlpha = 1;
  }
  function drawHpBar(g, x, top, w, hp, maxHp, id) {
    const ratio = clamp(hp / Math.max(1e-9, maxHp), 0, 1);
    let lag = lagById.get(id);
    if (lag === undefined || lag < ratio) lag = ratio;
    lagById.set(id, lag);
    const bw = Math.round(clamp(w, 14, 36));
    const bx = Math.round(x - bw / 2);
    const by = Math.round(top);
    rect(g, bx - 1, by - 1, bw + 2, 4, INK);
    rect(g, bx, by, bw, 2, '#3a1820');
    if (lag > ratio) rect(g, bx, by, Math.max(1, Math.round(bw * lag)), 2, '#ffe9a8');
    const fw = Math.max(ratio > 0 ? 1 : 0, Math.round(bw * ratio));
    if (fw > 0) {
      rect(g, bx, by, fw, 2, ratio > 0.5 ? '#ff4d4d' : ratio > 0.25 ? '#ff7a2e' : '#ffcf3a');
      rect(g, bx, by, fw, 1, ratio > 0.5 ? '#ff8a8a' : ratio > 0.25 ? '#ffb07a' : '#ffe9a0');
    }
  }
  function updateLags(dt) {
    lagById.forEach((v, key) => {
      const e = enemyById(key);
      if (!e || e.dead) {
        lagById.delete(key);
        return;
      }
      const ratio = clamp(num(e.hp, 0) / Math.max(1e-9, num(e.maxHp, 1)), 0, 1);
      lagById.set(key, Math.max(ratio, v - Math.max(0.6 * dt, (v - ratio) * dt * 3)));
    });
  }
  function drawStunStars(g, x, y, w, t) {
    const rx = Math.max(6, w * 0.35);
    for (let i = 0; i < 3; i++) {
      const a = t * 6 + (i * Math.PI * 2) / 3;
      const sx = Math.round(x + Math.cos(a) * rx);
      const sy = Math.round(y + Math.sin(a) * 2.5);
      const c = Math.sin(a) > 0 ? '#ffe066' : '#c9a83a';
      rect(g, sx - 1, sy, 3, 1, c);
      rect(g, sx, sy - 1, 1, 3, c);
    }
  }
  function drawIce(g, x, y, w, seedId) {
    const n = Math.max(2, Math.round(w / 7));
    const base = strHash(String(seedId || 'ice'));
    for (let i = 0; i < n; i++) {
      const sx = x - w / 2 + 2 + ((i + 0.5) / n) * (w - 4);
      const hh = 4 + ((base >> (i * 3)) & 3);
      spike(g, sx, y, 4, hh, '#bff0ff', false);
      spike(g, sx, y - 1, 2, hh - 1, '#ffffff', false);
    }
  }

  function drawEnemies(g, B, t) {
    const list = Array.isArray(B.enemies) ? B.enemies : [];
    order.length = 0;
    for (const e of list) if (e && Number.isFinite(e.x) && Number.isFinite(e.y)) order.push(e);
    order.sort((a, b) => {
      if (!!a.dead !== !!b.dead) return a.dead ? -1 : 1;
      if (!!a.isBoss !== !!b.isBoss) return a.isBoss ? -1 : 1;
      if (!!a.flying !== !!b.flying) return a.flying ? 1 : -1;
      return b.x - a.x;
    });
    // shadows first
    for (const e of order) {
      const fade = e.dead ? clamp(1 - num(e.deadTime, 0) / DEAD_LINGER, 0, 1) : 1;
      const w = num(e.w, 16);
      drawShadow(g, e.x, GROUND + 1, e.flying ? w * 0.6 : w * 0.95, (e.flying ? 0.18 : 0.38) * fade);
    }
    // boss auras
    for (const e of order) {
      if (!e.isBoss || e.dead) continue;
      const pulse = 0.22 + Math.sin(t * 3) * 0.08;
      glow(g, '#ff2d55', e.x, e.y - num(e.h, 40) * 0.45, num(e.h, 40) * 0.9, pulse);
    }
    for (const e of order) {
      const anim = typeof e.anim === 'string' ? e.anim : 'walk';
      const fr = sprite(e.type, anim, num(e.animTime, 0));
      let y = e.y;
      let alpha = 1;
      const dt0 = num(e.deadTime, 0);
      if (e.dead) {
        alpha = clamp(1 - dt0 / DEAD_LINGER, 0, 1);
        if (!e.fled) y += dt0 * 22;
      }
      const flip = e.facing === 1;
      drawSprite(g, fr, e.x, y, flip, alpha);
      if (!e.dead) {
        if (num(e.frozen, 0) > 0) {
          drawSprite(g, icedOf(fr), e.x, y, flip, 0.85);
          drawIce(g, e.x, e.y, Math.min(num(e.w, 16), fr.width), e.id);
        }
        if (num(e.flash, 0) > 0) drawSprite(g, flashedOf(fr), e.x, y, flip, clamp(num(e.flash, 0) / 0.12, 0, 1) * 0.9);
        const top = y - Math.max(fr.height, num(e.h, 16));
        if (num(e.stun, 0) > 0) drawStunStars(g, e.x, top - 3, num(e.w, 16), t);
        if (!e.isBoss && num(e.hp, 0) < num(e.maxHp, 0)) drawHpBar(g, e.x, top - (num(e.stun, 0) > 0 ? 9 : 5), num(e.w, 16) + 4, num(e.hp, 0), num(e.maxHp, 1), e.id);
      }
    }
  }
  function drawAllies(g, B, t) {
    const list = Array.isArray(B.allies) ? B.allies : [];
    for (const a of list) {
      if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.y)) continue;
      const hover = a.y < GROUND - 8;
      drawShadow(g, a.x, GROUND + 1, hover ? 8 : 16, hover ? 0.18 : 0.35);
      const fr = sprite(a.id, a.anim === 'attack' ? 'attack' : 'idle', num(a.animTime, 0));
      drawSprite(g, fr, a.x, a.y, false, 1);
      if (a.id === 'fairy') {
        glow(g, '#ff9bf0', a.x, a.y - fr.height / 2, 12, 0.3);
        if (Math.random() < 0.25 * (reduced ? 0.3 : 1)) {
          const q = part(a.x + rnd(-3, 3), a.y - fr.height / 2 + rnd(-2, 2), rnd(-8, -2), rnd(4, 14), rnd(0.4, 0.8), pick(['#ff9bf0', '#ffffff', '#ffe0fb']), 0, 1);
          q.add = true;
          q.g = 0;
        }
      } else if (a.id === 'drone_ally') {
        glow(g, '#21e6ff', a.x, a.y + 1, 7, 0.35 + Math.sin(t * 20) * 0.1);
      } else if (a.id === 'golem_ally') {
        glow(g, '#ff7b2e', a.x, a.y - fr.height * 0.5, 14, 0.18);
      }
    }
  }
  function drawHero(g, B, t) {
    const h = B.hero;
    if (!h) return;
    const x = num(h.x, HERO_X);
    const y = num(h.y, GROUND);
    const anim = typeof h.anim === 'string' ? h.anim : 'idle';
    let at = num(h.animTime, 0);
    if (anim === 'attack') at = clamp(num(h.attackAnim, 0), 0, 0.999) * animSpan('hero', 'attack', 0.3);
    const lk = heroLook();
    const fr = sprite('hero', anim, at, lk);
    const cy = y - fr.height * 0.5;
    const buffs = h.buffs || {};
    // warcry aura (behind)
    if (warcryA > 0.01) {
      glow(g, '#ff3b2e', x, cy, 26 + Math.sin(t * 8) * 3, 0.42 * warcryA);
      glow(g, '#ffb347', x, y - 2, 18, 0.2 * warcryA);
    }
    drawShadow(g, x, GROUND + 1, 18, 0.4);
    // spinning blades: back half
    const blades = num(buffs.blades, 0) > 0 && anim !== 'dead';
    if (blades) drawBlades(g, x, cy + 2, t, false);
    drawSprite(g, fr, x, y, false, 1);
    if (heroFlash > 0) drawSprite(g, reddedOf(fr), x, y, false, clamp(heroFlash / 0.12, 0, 1) * 0.7);
    if (blades) drawBlades(g, x, cy + 2, t, true);
    // shield bubble
    if (bubbleA > 0.01) {
      const pop = shieldPop > 0 ? 1 + Math.sin((1 - shieldPop / 0.35) * Math.PI) * 0.18 : 1;
      const r = (Math.max(fr.height, 22) * 0.62 + Math.sin(t * 3) * 0.6) * pop;
      g.globalAlpha = bubbleA;
      g.fillStyle = 'rgba(120,180,255,0.16)';
      g.beginPath();
      g.arc(x, cy, r, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(185,220,255,0.85)';
      g.stroke();
      g.strokeStyle = 'rgba(214,194,255,0.55)';
      g.beginPath();
      g.arc(x, cy, r - 2, t * 1.5, t * 1.5 + 1.4);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillRect(Math.round(x - r * 0.5), Math.round(cy - r * 0.62), 3, 1);
      g.fillRect(Math.round(x - r * 0.62), Math.round(cy - r * 0.45), 1, 2);
      g.globalAlpha = 1;
      glow(g, '#7fb8ff', x, cy, r * 1.2, 0.12 * bubbleA);
    }
  }
  function drawBlades(g, x, y, t, front) {
    for (let i = 0; i < 3; i++) {
      const a = t * 7.5 + (i * Math.PI * 2) / 3;
      const s = Math.sin(a);
      if (s > 0 !== front) continue;
      const bx = x + Math.cos(a) * 24;
      const by = y + s * 7;
      const fr = sprite('fx_blade', 'spin', t + i * 0.07);
      glow(g, '#e8eef8', bx, by, 7, 0.25);
      drawSprite(g, fr, bx, by + fr.height / 2, false, front ? 1 : 0.75);
    }
  }
  function drawProjectiles(g, B, t) {
    const list = Array.isArray(B.projectiles) ? B.projectiles : [];
    for (const p of list) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const c = PROJ_COLORS[p.kind] || PROJ_COLORS.arrow;
      glow(g, c[1], p.x, p.y, 9, 0.35);
      const fr = sprite('proj_' + (p.kind || 'arrow'), 'fly', t);
      drawSprite(g, fr, p.x, p.y + fr.height / 2, num(p.vx, -1) > 0, 1);
      if (p.kind !== 'arrow' && Math.random() < (reduced ? 0.25 : 0.7)) {
        const q = part(p.x + rnd(-1, 1) + 3, p.y + rnd(-1, 1), rnd(-6, 6) - num(p.vx, 0) * 0.08, rnd(-6, 6), rnd(0.15, 0.3), pick(c), 0, 1);
        q.add = true;
        q.g = 0;
      }
    }
  }
  function drawFlyingChest(g, B, t) {
    const fc = B.flyingChest;
    if (!fc || !Number.isFinite(fc.x) || !Number.isFinite(fc.y)) return;
    const life = num(fc.life, 8);
    const ft = num(fc.t, 0);
    const pulse = 0.5 + Math.sin(t * 6) * 0.15;
    glow(g, '#ffd23f', fc.x, fc.y, 22, 0.35 * pulse + 0.15);
    const fr = sprite('flying_chest', 'fly', ft);
    const blink = life - ft < 2 ? Math.sin(t * 22) > -0.2 : true;
    if (blink) drawSprite(g, fr, fc.x, fc.y + fr.height / 2, false, 1);
    if (Math.random() < (reduced ? 0.25 : 0.65)) {
      const q = part(fc.x - fr.width * 0.4 + rnd(-2, 2), fc.y + rnd(-4, 5), rnd(-30, -10), rnd(-6, 10), rnd(0.4, 0.8), pick(['#ffd23f', '#fff6c8', '#ffffff', '#5ef3ff']), 2, rnd(1, 1.6));
      q.add = true;
      q.g = 12;
    }
  }

  // ================================================================== fx drawing
  function boltPath(pts, seed, amp) {
    const r = seeded(seed);
    const out = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const segs = Math.max(3, Math.round(d / 9));
      const nx = -(b.y - a.y) / Math.max(1, d);
      const ny = (b.x - a.x) / Math.max(1, d);
      for (let s = i === 1 ? 0 : 1; s <= segs; s++) {
        const u = s / segs;
        const off = s === 0 || s === segs ? 0 : (r() - 0.5) * amp * 2;
        out.push(a.x + (b.x - a.x) * u + nx * off, a.y + (b.y - a.y) * u + ny * off);
      }
    }
    return out;
  }
  function strokePath(g, arr, color, width) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(arr[0], arr[1]);
    for (let i = 2; i < arr.length; i += 2) g.lineTo(arr[i], arr[i + 1]);
    g.stroke();
  }
  function updateFx(dt) {
    for (let i = 0; i < fx.length; ) {
      const o = fx[i];
      o.t += dt;
      if (o.type === 'meteor' && o.t >= o.dur && !o.done) {
        o.done = true;
        const x = o.x1;
        const y = o.y1;
        addFx({ type: 'spr', name: 'fx_explosion', anim: 'play', x: x, y: y, dur: 0.55, sc: 1.4 });
        addFx({ type: 'ring', x: x, y: Math.min(GROUND, y + 10), r0: 6, r1: 60, w: 3, color: '#ffb347', dur: 0.5 });
        burst(x, y, 14, ['#ffb347', '#ff5a1f', '#ffe08a', '#ffffff'], 170, 0.6, { kind: 3, add: true, g: 200 });
        burst(x, GROUND - 2, 8, ['#4a3a34', '#6a5a50', '#2a201c'], 90, 0.8, { up: true, g: 260, size: 2 });
        shake(0.55);
        flash('#ffd8a0', 0.22);
      }
      if (o.t >= o.dur) {
        fx.splice(i, 1);
        continue;
      }
      if (o.type === 'meteor' && !reduced) {
        const u = o.t / o.dur;
        const mx = o.x0 + (o.x1 - o.x0) * u * u;
        const my = o.y0 + (o.y1 - o.y0) * u * u;
        const q = part(mx + rnd(-2, 2), my + rnd(-2, 2), rnd(-10, 10), rnd(-20, 0), rnd(0.25, 0.45), pick(['#ffb347', '#ff5a1f', '#ffe08a']), 0, rnd(1, 2.5));
        q.add = true;
      }
      i++;
    }
  }
  function drawFx(g) {
    for (const o of fx) {
      const u = clamp(o.t / Math.max(0.001, o.dur), 0, 1);
      switch (o.type) {
        case 'spr': {
          const span = animSpan(o.name, o.anim, 0.5);
          const fr = sprite(o.name, o.anim, Math.min(span * 0.999, u * span));
          const sc = num(o.sc, 1);
          const a = num(o.alpha, 1) * (u > 0.75 ? (1 - u) / 0.25 : 1);
          if (o.add) g.globalCompositeOperation = 'lighter';
          g.globalAlpha = clamp(a, 0, 1);
          const w = fr.width * sc;
          const h = fr.height * sc;
          const top = anchorMode(o.name) === 'bottom' ? o.y - h : o.y - h / 2;
          g.drawImage(fr, Math.round((o.x - w / 2) * k) / k, Math.round(top * k) / k, w, h);
          g.globalAlpha = 1;
          g.globalCompositeOperation = 'source-over';
          break;
        }
        case 'ring': {
          const r = o.r0 + (o.r1 - o.r0) * easeOut(u);
          g.globalAlpha = (1 - u) * 0.9;
          g.strokeStyle = o.color;
          g.lineWidth = Math.max(0.6, o.w * (1 - u * 0.8));
          g.beginPath();
          g.ellipse(o.x, o.y, Math.max(0.5, r), Math.max(0.5, r * (o.ice ? 0.42 : 0.55)), 0, 0, Math.PI * 2);
          g.stroke();
          if (o.ice) {
            g.globalAlpha = (1 - u) * 0.25;
            g.fillStyle = o.color;
            g.fill();
          }
          g.globalAlpha = 1;
          break;
        }
        case 'slam': {
          const r = 6 + (o.r1 - 6) * easeOut(u);
          g.globalAlpha = (1 - u) * 0.8;
          g.strokeStyle = o.color;
          g.lineWidth = 2 * (1 - u) + 0.5;
          g.beginPath();
          g.ellipse(o.x, o.y, r, r * 0.22, 0, 0, Math.PI * 2);
          g.stroke();
          g.globalAlpha = 1;
          break;
        }
        case 'bolt': {
          const seed = o.seed + Math.floor(o.t / 0.05);
          const arr = boltPath(o.pts, seed, 6);
          const a = u < 0.7 ? 1 : (1 - u) / 0.3;
          g.globalCompositeOperation = 'lighter';
          g.lineJoin = 'round';
          g.globalAlpha = a * 0.45;
          strokePath(g, arr, '#4aa3ff', 4);
          g.globalAlpha = a;
          strokePath(g, arr, '#bfe9ff', 1.6);
          strokePath(g, arr, '#ffffff', 0.7);
          if (!reduced && o.t < 0.2) {
            const arr2 = boltPath(o.pts, seed + 77, 9);
            g.globalAlpha = a * 0.5;
            strokePath(g, arr2, '#7fc8ff', 0.8);
          }
          g.globalAlpha = 1;
          g.globalCompositeOperation = 'source-over';
          for (const p of o.pts) glow(g, '#7fc8ff', p.x, p.y, 16, 0.5 * a);
          break;
        }
        case 'beam': {
          const a = 1 - u;
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = a * 0.5;
          g.strokeStyle = o.color;
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(o.x0, o.y0);
          g.lineTo(o.x1, o.y1);
          g.stroke();
          g.globalAlpha = a;
          g.strokeStyle = '#ffffff';
          g.lineWidth = 1;
          g.stroke();
          g.globalAlpha = 1;
          g.globalCompositeOperation = 'source-over';
          break;
        }
        case 'lob': {
          const x = o.x0 + (o.x1 - o.x0) * u;
          const y = o.y0 + (o.y1 - o.y0) * u - Math.sin(u * Math.PI) * 30;
          rect(g, x - 2, y - 2, 4, 4, '#2a2230');
          rect(g, x - 1, y - 3, 2, 1, '#5a4a5a');
          rect(g, x + 1, y - 4, 1, 1, '#ffd23f');
          glow(g, '#ffb347', x + 1, y - 4, 4, 0.6);
          break;
        }
        case 'meteor': {
          const e = u * u;
          const x = o.x0 + (o.x1 - o.x0) * e;
          const y = o.y0 + (o.y1 - o.y0) * e;
          glow(g, '#ff7b2e', x, y, 20, 0.6);
          const fr = sprite('fx_meteor', 'fall', o.t);
          const px = fr.width >= 24 ? Math.round(fr.width * 0.28) : fr.width / 2;
          const py = fr.height >= 24 ? Math.round(fr.height * 0.72) : fr.height / 2;
          g.drawImage(fr, Math.round((x - px) * k) / k, Math.round((y - py) * k) / k);
          break;
        }
        case 'column': {
          const a = Math.sin(u * Math.PI);
          const w = o.w * (1 - u * 0.5);
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = a * 0.4;
          g.fillStyle = o.color;
          g.fillRect(o.x - w / 2, 0, w, GROUND + 2);
          g.globalAlpha = a * 0.45;
          g.fillStyle = '#ffffff';
          g.fillRect(o.x - w / 6, 0, w / 3, GROUND + 2);
          g.globalAlpha = 1;
          g.globalCompositeOperation = 'source-over';
          glow(g, o.color, o.x, GROUND - 6, w * 1.4, a * 0.6);
          break;
        }
        case 'tap': {
          g.globalAlpha = (1 - u) * 0.7;
          g.strokeStyle = '#ffffff';
          g.lineWidth = 1;
          g.beginPath();
          g.arc(o.x, o.y, 2 + u * 9, 0, Math.PI * 2);
          g.stroke();
          g.globalAlpha = 1;
          break;
        }
        default:
          break;
      }
    }
  }
  function updateCoins(dt) {
    for (let i = 0; i < coins.length; ) {
      const c = coins[i];
      if (c.delay > 0) {
        c.delay -= dt;
        i++;
        continue;
      }
      c.t += dt;
      if (c.kind === 'chest' && c.t < 0.9) {
        // pop, fall to the floor, bounce once, rest, then fly
        c.vy += 520 * dt;
        c.x += c.vx * 0.35 * dt;
        c.y += c.vy * dt;
        if (c.y > GROUND - 4) {
          c.y = GROUND - 4;
          c.vy = c.bounced ? 0 : -c.vy * 0.35;
          c.bounced = true;
        }
      } else if (c.t < c.home) {
        c.vy += 420 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        if (c.y > GROUND - 2) {
          c.y = GROUND - 2;
          c.vy = -Math.abs(c.vy) * 0.4;
        }
      } else {
        const dx = COIN_TX - c.x;
        const dy = COIN_TY - c.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const sp = 260 + (c.t - c.home) * 900;
        const ax = (dx / d) * sp;
        const ay = (dy / d) * sp;
        const f = Math.min(1, dt * 9);
        c.vx += (ax - c.vx) * f;
        c.vy += (ay - c.vy) * f;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        if (d < 7 || c.t > 3) {
          coins.splice(i, 1);
          const q = part(COIN_TX, COIN_TY, rnd(-20, 20), rnd(-10, 20), 0.3, c.kind === 'chest' ? '#ffb04a' : '#ffd34d', 2, 1);
          q.add = true;
          continue;
        }
      }
      i++;
    }
  }
  function drawCoins(g, t) {
    for (const c of coins) {
      if (c.delay > 0) continue;
      if (c.kind === 'chest') {
        const img = miniChestImg();
        g.drawImage(img, Math.round((c.x - img.width / 2) * k) / k, Math.round((c.y - img.height) * k) / k);
        glow(g, '#ffb04a', c.x, c.y - 4, 8, 0.25);
      } else {
        const fr = sprite('coin', 'spin', t + c.ph);
        g.drawImage(fr, Math.round((c.x - fr.width / 2) * k) / k, Math.round((c.y - fr.height / 2) * k) / k);
      }
    }
  }

  // ================================================================== overlay text pass
  function setFont(px, weight) {
    ctx.font = (weight || 700) + ' ' + Math.max(6, px).toFixed(1) + 'px ' + FONT;
  }
  function sx(x) {
    return (x + shakeX) * S;
  }
  function sy(y) {
    return (y + shakeY) * S;
  }
  function outlined(str, x, y, px, fill, lw) {
    ctx.lineWidth = lw || Math.max(2, px * 0.24);
    ctx.strokeStyle = INK;
    ctx.strokeText(str, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(str, x, y);
  }
  function drawTexts() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (let i = 0; i < textN; i++) {
      const o = texts[i];
      if (o.delay > 0) continue;
      const st = o.st;
      const u = o.t / o.life;
      const popT = clamp(o.t / 0.14, 0, 1);
      const scale = 1 + (st.pop || 0) * (1 - easeOut(popT));
      const a = u > 0.65 ? (1 - u) / 0.35 : 1;
      const px = st.size * S * scale;
      const x = sx(o.x);
      const y = sy(o.y);
      ctx.globalAlpha = clamp(a, 0, 1);
      setFont(px, 700);
      if (o.pill) {
        const w = ctx.measureText(o.str).width + px * 1.1;
        const h = px * 1.55;
        ctx.fillStyle = 'rgba(14,8,22,0.82)';
        roundRect(x - w / 2, y - h / 2, w, h, h / 2);
        ctx.fill();
        ctx.lineWidth = Math.max(1, S * 0.8);
        ctx.strokeStyle = o.pill;
        ctx.stroke();
        ctx.fillStyle = mix(o.pill, '#ffffff', 0.6);
        ctx.fillText(o.str, x, y + px * 0.04);
      } else if (st.color2) {
        const gr = ctx.createLinearGradient(0, y - px * 0.45, 0, y + px * 0.45);
        gr.addColorStop(0, '#fffbe0');
        gr.addColorStop(0.35, st.color);
        gr.addColorStop(1, st.color2);
        outlined(o.str, x, y, px, gr);
      } else {
        outlined(o.str, x, y, px, st.color);
      }
    }
    ctx.globalAlpha = 1;
  }
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function pxRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  function drawTopBar(B, dt) {
    // boss (or horde) bar across the top, with name and timer
    let boss = null;
    if (Array.isArray(B.enemies)) {
      for (const e of B.enemies) {
        if (e && e.isBoss && !e.dead) {
          boss = e;
          break;
        }
      }
    }
    const d = B.mode === 'dungeon' && B.dungeon ? B.dungeon : null;
    const horde = d && num(d.target, 1) > 1;
    const timeLimit = num(B.bossTimeLimit, 0);
    const timer = num(B.bossTimer, 0);
    const active = !!boss || (horde && !d.ended);
    bossShow = clamp(bossShow + (active ? dt * 5 : -dt * 3), 0, 1);
    if (boss) lastBoss = { name: enemyName(boss.type, boss.name), hp: num(boss.hp, 0), maxHp: Math.max(1e-9, num(boss.maxHp, 1)), id: boss.id };
    if (bossShow <= 0.001) {
      bossLagId = null;
      return;
    }
    let label;
    let ratio;
    let fillA;
    let fillB;
    if (horde) {
      const target = Math.max(1, num(d.target, 1));
      label = dungeonInfo(d.id).name + '  ' + Math.min(target, Math.floor(num(d.killed, 0))) + '/' + target;
      ratio = clamp(num(d.killed, 0) / target, 0, 1);
      fillA = '#7dff6a';
      fillB = '#3fbf3a';
    } else {
      const lb = lastBoss || { name: 'Boss', hp: 0, maxHp: 1, id: null };
      label = lb.name;
      ratio = clamp((boss ? num(boss.hp, 0) : 0) / lb.maxHp, 0, 1);
      if (bossLagId !== lb.id) {
        bossLagId = lb.id;
        bossLagHp = ratio;
      }
      bossLagHp = Math.max(ratio, bossLagHp - Math.max(0.15 * dt, (bossLagHp - ratio) * dt * 2.5));
      fillA = '#ff4d5e';
      fillB = '#c41f3a';
    }
    const a = easeOut(bossShow);
    const yOff = (1 - a) * -14;
    const bx = 60;
    const bw = W - 120;
    const by = 13 + yOff;
    const bh = 6;
    ctx.globalAlpha = a;
    // frame
    pxRect(sx(bx - 2), sy(by - 2), (bw + 4) * S, (bh + 4) * S, INK);
    pxRect(sx(bx - 1), sy(by - 1), (bw + 2) * S, (bh + 2) * S, '#4a2a3a');
    pxRect(sx(bx), sy(by), bw * S, bh * S, '#22101a');
    if (!horde && bossLagHp > ratio) pxRect(sx(bx), sy(by), bw * bossLagHp * S, bh * S, '#ffe9a8');
    if (ratio > 0) {
      const gr = ctx.createLinearGradient(0, sy(by), 0, sy(by + bh));
      gr.addColorStop(0, shade(fillA, 0.35));
      gr.addColorStop(0.45, fillA);
      gr.addColorStop(1, fillB);
      ctx.fillStyle = gr;
      ctx.fillRect(Math.round(sx(bx)), Math.round(sy(by)), Math.round(bw * ratio * S), Math.round(bh * S));
    }
    // segment ticks
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 1; i < 10; i++) ctx.fillRect(Math.round(sx(bx + (bw * i) / 10)), Math.round(sy(by)), Math.max(1, Math.round(S * 0.5)), Math.round(bh * S));
    // skull emblem
    const kx = bx - 9;
    const ky = by + bh / 2;
    pxRect(sx(kx - 5), sy(ky - 5), 10 * S, 10 * S, INK);
    pxRect(sx(kx - 4), sy(ky - 4), 8 * S, 6 * S, horde ? '#b5ff9a' : '#f0e6d8');
    pxRect(sx(kx - 3), sy(ky + 2), 6 * S, 2 * S, horde ? '#b5ff9a' : '#f0e6d8');
    pxRect(sx(kx - 3), sy(ky - 2), 2 * S, 2 * S, INK);
    pxRect(sx(kx + 1), sy(ky - 2), 2 * S, 2 * S, INK);
    // name + timer
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const px = 8 * S;
    setFont(px, 700);
    ctx.textAlign = 'left';
    outlined(label, sx(bx), sy(by - 6), px, '#ffffff');
    if (timeLimit > 0) {
      const low = timer <= 10;
      const blink = low ? 0.65 + Math.sin(clock * 10) * 0.35 : 1;
      ctx.textAlign = 'right';
      ctx.globalAlpha = a * blink;
      let tstr = '0:00';
      try {
        tstr = DD.fmtTimer(timer);
      } catch {
        tstr = String(Math.ceil(timer));
      }
      outlined(tstr, sx(bx + bw + 2), sy(by - 6), px, low ? '#ff6b6b' : '#ffe9a8');
      // tiny timer pip under the bar
      const tr = clamp(timer / Math.max(1e-6, timeLimit), 0, 1);
      ctx.globalAlpha = a;
      pxRect(sx(bx), sy(by + bh + 2), bw * S, Math.max(1, S), 'rgba(0,0,0,0.5)');
      pxRect(sx(bx), sy(by + bh + 2), bw * tr * S, Math.max(1, S), low ? '#ff6b6b' : '#ffd34d');
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
  }
  function drawChestHint(B) {
    const fc = B.flyingChest;
    if (!fc || !Number.isFinite(fc.x) || !Number.isFinite(fc.y)) return;
    if (fc.x < -6 || fc.x > W + 6) return;
    const bounce = Math.abs(Math.sin(clock * 6)) * 4;
    const x = sx(clamp(fc.x, 16, W - 16));
    const y = sy(fc.y - 17 - bounce);
    const px = 9 * S;
    setFont(px, 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const urgent = num(fc.life, 8) - num(fc.t, 0) < 2;
    outlined('TAP!', x, y, px, urgent ? '#ff9a3c' : '#ffe14d');
    // little arrow
    const ay = y + px * 0.62;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(x - px * 0.32, ay - px * 0.05);
    ctx.lineTo(x + px * 0.32, ay - px * 0.05);
    ctx.lineTo(x, ay + px * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = urgent ? '#ff9a3c' : '#ffe14d';
    ctx.beginPath();
    ctx.moveTo(x - px * 0.2, ay + px * 0.02);
    ctx.lineTo(x + px * 0.2, ay + px * 0.02);
    ctx.lineTo(x, ay + px * 0.22);
    ctx.closePath();
    ctx.fill();
  }
  function drawDead(B) {
    if (deadA <= 0.01) return;
    const cw = canvas.width;
    const ch = canvas.height;
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(10,3,14,' + (0.58 * deadA).toFixed(3) + ')';
    ctx.fillRect(0, 0, cw, ch);
    const timer = num(B.deadTimer, 0);
    if (timer <= 0 && B.phase !== 'dead') return;
    ctx.globalAlpha = clamp(deadA * 1.2, 0, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const px = 11 * S;
    setFont(px, 700);
    outlined('Reviving…', sx(W / 2), sy(146), px, '#ffd9e0');
    const n = Math.max(1, Math.ceil(timer));
    const cx = sx(W / 2);
    const cy = sy(118);
    const rr = 15 * S;
    const prog = clamp(1 - timer / Math.max(0.5, deadMax), 0, 1);
    ctx.lineWidth = 3 * S;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ff6b8a';
    ctx.lineWidth = 2 * S;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
    ctx.stroke();
    const p2 = 20 * S;
    setFont(p2, 700);
    outlined(String(n), cx, cy + S, p2, '#ffffff');
    ctx.globalAlpha = 1;
  }
  const BANNER_STYLE = {
    floor: { size: 22, top: '#ffffff', bottom: '#bdf6ff', accent: '#5ef3ff', y: 66 },
    boss: { size: 30, top: '#ffe0e0', bottom: '#ff2d3a', accent: '#ff3b3b', y: 66, jitter: true },
    clear: { size: 22, top: '#fffbe0', bottom: '#ffb020', accent: '#ffd23f', y: 66 },
    fail: { size: 18, top: '#ffe8e8', bottom: '#ff8a8a', accent: '#ff5252', y: 66 },
    dungeon: { size: 21, top: '#ffffff', bottom: '#ffcf5a', accent: '#ffcf5a', y: 66 },
    win: { size: 26, top: '#fffbe0', bottom: '#ffb020', accent: '#ffd23f', y: 66 },
    wave: { size: 12, top: '#ffffff', bottom: '#d8d4ea', accent: null, y: 44, small: true },
  };
  function drawBanner() {
    const b = banner;
    if (!b) return;
    const st = BANNER_STYLE[b.style] || BANNER_STYLE.floor;
    const accent = b.color || st.accent;
    const tin = clamp(b.t / 0.22, 0, 1);
    const tout = clamp((b.dur - b.t) / 0.35, 0, 1);
    const a = Math.min(tin, tout);
    if (a <= 0.01) return;
    const scale = st.small ? 1 : 1 + (1 - easeOutBack(tin)) * 0.5;
    const cyW = st.y - (1 - tout) * 6;
    let jx = 0;
    if (st.jitter && b.t < 0.45 && !reduced) jx = Math.sin(b.t * 70) * 2.2 * (1 - b.t / 0.45);
    const cx = sx(W / 2 + jx);
    const cy = sy(cyW);
    const cw = canvas.width;
    ctx.globalAlpha = a;
    if (!st.small) {
      const rh = (b.sub ? 40 : 32) * S;
      const gr = ctx.createLinearGradient(0, 0, cw, 0);
      gr.addColorStop(0, 'rgba(8,4,14,0)');
      gr.addColorStop(0.2, 'rgba(8,4,14,0.74)');
      gr.addColorStop(0.8, 'rgba(8,4,14,0.74)');
      gr.addColorStop(1, 'rgba(8,4,14,0)');
      ctx.fillStyle = gr;
      const top = cy - rh * 0.5 + (b.sub ? 4 * S : 0);
      ctx.fillRect(0, top, cw, rh);
      if (accent) {
        const ga = ctx.createLinearGradient(0, 0, cw, 0);
        ga.addColorStop(0, rgba(accent, 0));
        ga.addColorStop(0.5, rgba(accent, 0.95));
        ga.addColorStop(1, rgba(accent, 0));
        ctx.fillStyle = ga;
        const lw = Math.max(1, Math.round(S));
        const ext = easeOut(tin);
        ctx.save();
        ctx.beginPath();
        ctx.rect(cw / 2 - (cw / 2) * ext, 0, cw * ext, canvas.height);
        ctx.clip();
        ctx.fillRect(0, Math.round(top), cw, lw);
        ctx.fillRect(0, Math.round(top + rh - lw), cw, lw);
        ctx.restore();
      }
    }
    const px = st.size * S * scale;
    setFont(px, 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const gr2 = ctx.createLinearGradient(0, cy - px * 0.45, 0, cy + px * 0.4);
    gr2.addColorStop(0, st.top);
    gr2.addColorStop(1, b.style === 'dungeon' && b.color ? b.color : st.bottom);
    ctx.lineWidth = Math.max(3, px * 0.2);
    ctx.strokeStyle = INK;
    ctx.strokeText(b.title, cx, cy + px * 0.06);
    ctx.fillStyle = gr2;
    ctx.fillText(b.title, cx, cy);
    if (b.sub) {
      const p2 = 8.5 * S;
      setFont(p2, 600);
      outlined(b.sub, cx, cy + px * 0.5 + p2 * 0.9, p2, '#f2ecff');
    }
    ctx.globalAlpha = 1;
  }

  // ================================================================== frame
  function updateState(B, dt) {
    clock += dt;
    // world scroll delta (for particles that live in the world)
    const scroll = num(B.scroll, 0);
    let dScroll = 0;
    if (lastScroll !== null) {
      dScroll = scroll - lastScroll;
      if (!(dScroll >= 0 && dScroll < 60)) dScroll = 0;
    }
    lastScroll = scroll;
    // timers
    for (let i = 0; i < later.length; ) {
      if (later[i].at <= clock) {
        const it = later.splice(i, 1)[0];
        try {
          it.fn();
        } catch (err) {
          console.error('[DD.render] delayed effect failed', err);
        }
        continue;
      }
      i++;
    }
    updateParts(dt, dScroll);
    updateTexts(dt);
    updateFx(dt);
    updateCoins(dt);
    updateBanner(dt);
    lagSweep -= dt;
    if (lagSweep <= 0) {
      lagSweep = 0.1;
      updateLags(0.1);
    }
    heroFlash = Math.max(0, heroFlash - dt);
    shieldPop = Math.max(0, shieldPop - dt);
    flashA = Math.max(0, flashA - dt * 2.6);
    const h = B.hero || {};
    const buffs = h.buffs || {};
    const shieldOn = num(buffs.shield, 0) > 0 && num(h.shield, 0) > 0 && h.anim !== 'dead';
    bubbleA = clamp(bubbleA + (shieldOn ? dt * 6 : -dt * 4), 0, 1);
    const warOn = num(buffs.warcry, 0) > 0 && h.anim !== 'dead';
    warcryA = clamp(warcryA + (warOn ? dt * 5 : -dt * 3), 0, 1);
    if (warOn && Math.random() < dt * (reduced ? 4 : 14)) {
      const hp = heroPos();
      const q = part(hp.x + rnd(-9, 9), hp.y - rnd(0, 8), rnd(-4, 4), rnd(-34, -18), rnd(0.4, 0.7), pick(['#ff5a3c', '#ffb347']), 0, 1);
      q.add = true;
      q.par = 1;
    }
    const isDead = B.phase === 'dead' || num(B.deadTimer, 0) > 0 || h.anim === 'dead';
    deadA = clamp(deadA + (isDead ? dt * 3 : -dt * 4), 0, 1);
    // shake
    trauma = Math.max(0, trauma - dt * 1.7);
    if (trauma > 0 && !reduced) {
      const m = SHAKE_PX * trauma * trauma;
      shakeX = Math.round(rnd(-m, m) * k) / k;
      shakeY = Math.round(rnd(-m, m) * 0.7 * k) / k;
    } else {
      shakeX = 0;
      shakeY = 0;
    }
  }

  function drawWorld(B, dt) {
    const g = bctx;
    g.setTransform(k, 0, 0, k, Math.round(shakeX * k), Math.round(shakeY * k));
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const t = clock;
    const scroll = num(B.scroll, 0);
    const tid = themeIdFor(B);
    if (tid !== curTheme) {
      prevTheme = curTheme;
      curTheme = tid;
      themeFade = prevTheme ? 0 : 1;
    }
    themeFade = Math.min(1, themeFade + dt / 0.9);
    const T = getTheme(curTheme);
    if (prevTheme && themeFade < 1) {
      drawBackground(g, getTheme(prevTheme), scroll, t, 1);
      drawBackground(g, T, scroll, t, themeFade);
    } else {
      prevTheme = null;
      drawBackground(g, T, scroll, t, 1);
    }
    spawnAmbient(T, dt, scroll);
    drawParts(g, false);
    // soft dark vignette to seat the actors; a pulsing red one while a boss is up
    vignetteBands(g, '#05030a', 0.42);
    const bossWave = B.isBossWave && Array.isArray(B.enemies) && B.enemies.some((e) => e && e.isBoss && !e.dead);
    if (bossWave) vignetteBands(g, '#ff1030', 0.3 + Math.sin(t * 2.6) * 0.1);

    drawAllies(g, B, t);
    drawEnemies(g, B, t);
    drawHero(g, B, t);
    drawProjectiles(g, B, t);
    drawFx(g);
    drawParts(g, true);
    drawCoins(g, t);
    drawFlyingChest(g, B, t);
    if (flashA > 0.01) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = flashA * 0.6;
      g.fillStyle = flashColor;
      g.fillRect(-MARGIN, -MARGIN, W + MARGIN * 2, H + MARGIN * 2);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
  }

  function draw(dtReal) {
    if (!inited || !canvas || !ctx) return;
    const dt = clamp(num(dtReal, 0), 0, 0.1);
    if (resizeQueued || (typeof window !== 'undefined' && (window.devicePixelRatio || 1) !== dpr)) resize();
    if (!buf || !bctx || canvas.width < 2 || canvas.height < 2) return;
    const B = battle() || {};
    try {
      updateState(B, dt);
      drawWorld(B, dt);
      // blit (smoothing off) then the crisp text pass
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(buf, 0, 0, buf.width, buf.height, 0, 0, canvas.width, canvas.height);
      drawTopBar(B, dt);
      drawTexts();
      drawChestHint(B);
      drawDead(B);
      drawBanner();
    } catch (err) {
      console.error('[DD.render] draw failed', err);
    } finally {
      castCtx = null;
      frameTexts = 0;
    }
  }

  // ================================================================== sizing & input
  function resize() {
    resizeQueued = false;
    if (!canvas) return;
    const rect2 = canvas.getBoundingClientRect();
    const cssW = rect2.width || canvas.clientWidth || 0;
    if (cssW < 1) return;
    dpr = clamp((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 1, 4);
    const bw = Math.max(2, Math.round(cssW * dpr));
    const bh = Math.max(2, Math.round((bw * H) / W));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    k = clamp(Math.floor(bw / W), 1, 8);
    S = bw / W;
    if (!buf) buf = mk(W * k, H * k);
    if (buf.width !== W * k) buf.width = W * k;
    if (buf.height !== H * k) buf.height = H * k;
    bctx = buf.getContext('2d');
    bctx.imageSmoothingEnabled = false;
    for (const key of Object.keys(vigGrads)) delete vigGrads[key];
    ctx.imageSmoothingEnabled = false;
  }
  function clientToWorld(clientX, clientY) {
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) return null;
    return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H };
  }
  function onPointerDown(ev) {
    const p = clientToWorld(num(ev.clientX, NaN), num(ev.clientY, NaN));
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const B = battle();
    if (!B || typeof B.tapAt !== 'function') return;
    let got = false;
    try {
      got = B.tapAt(p.x, p.y) === true;
      const fc = B.flyingChest;
      if (!got && fc && Number.isFinite(fc.x) && Number.isFinite(fc.y)) {
        // forgiving finger hit-test: a near miss on the moving chest still counts
        if (Math.hypot(p.x - fc.x, p.y - fc.y) <= TAP_ASSIST) got = B.tapAt(fc.x, fc.y) === true;
      }
    } catch (err) {
      console.error('[DD.render] tap failed', err);
    }
    if (!got) addFx({ type: 'tap', x: p.x, y: p.y, dur: 0.3 });
  }
  function onPointerMove(ev) {
    const B = battle();
    const fc = B && B.flyingChest;
    if (!fc) {
      if (canvas.style.cursor) canvas.style.cursor = '';
      return;
    }
    const p = clientToWorld(num(ev.clientX, NaN), num(ev.clientY, NaN));
    const near = p && Math.hypot(p.x - fc.x, p.y - fc.y) <= TAP_ASSIST;
    const want = near ? 'pointer' : '';
    if (canvas.style.cursor !== want) canvas.style.cursor = want;
  }

  function init(cv) {
    if (!cv || typeof cv.getContext !== 'function') {
      console.error('[DD.render] init needs a <canvas>');
      return;
    }
    if (canvas && canvas !== cv) {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      if (ro) ro.disconnect();
    }
    canvas = cv;
    ctx = canvas.getContext('2d');
    if (!ctx) return;
    inited = true;
    try {
      const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
      reduced = forcedReduced !== null ? forcedReduced : !!(mq && mq.matches);
      if (mq && typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', (e) => {
          if (forcedReduced === null) reduced = !!e.matches;
        });
      }
    } catch {
      reduced = false;
    }
    resize();
    canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(() => {
        resizeQueued = true;
      });
      ro.observe(canvas);
    }
    window.addEventListener('resize', () => {
      resizeQueued = true;
    });
    if (!fontReady && document.fonts && typeof document.fonts.load === 'function') {
      fontReady = true;
      document.fonts.load('700 16px "Pixelify Sans"').catch(() => {});
    }
    subscribe();
  }

  R.init = init;
  R.draw = draw;
  // extras (read-only helpers for the UI / tests)
  R.resize = resize;
  R.clientToWorld = clientToWorld;
  R.setReducedMotion = function (on) {
    forcedReduced = on === null || on === undefined ? null : !!on;
    if (forcedReduced !== null) reduced = forcedReduced;
  };
  R.stats = function () {
    return { particles: partN, texts: textN, fx: fx.length, coins: coins.length, k: k, theme: curTheme, reduced: reduced };
  };
  R.themeIds = function () {
    return Object.keys(THEME_BUILDERS);
  };
})(globalThis.DD);
