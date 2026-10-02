/* Dungeon Dash — core: namespace, event bus, number formatting and math helpers.
 * Loaded first. Works in browsers and in Node (attaches to globalThis.DD). */
(function (root) {
  'use strict';
  const DD = (root.DD = root.DD || {});

  DD.VERSION = 1;
  // Battle world in logical pixels. The renderer scales this to the canvas.
  DD.WORLD = { W: 360, H: 200, GROUND: 170, HERO_X: 84 };

  // ---------------------------------------------------------------- event bus
  const handlers = new Map();
  DD.bus = {
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, new Set());
      handlers.get(evt).add(fn);
      return () => DD.bus.off(evt, fn);
    },
    off(evt, fn) {
      const set = handlers.get(evt);
      if (set) set.delete(fn);
    },
    emit(evt, payload) {
      const set = handlers.get(evt);
      if (!set || set.size === 0) return;
      for (const fn of Array.from(set)) {
        try {
          fn(payload === undefined ? {} : payload);
        } catch (err) {
          console.error('[DD.bus] handler for "' + evt + '" failed', err);
        }
      }
    },
  };

  // ---------------------------------------------------------------- formatting
  const SUFFIXES = ['', 'K', 'M', 'B', 'T'];
  function letterSuffix(i) {
    // 0 → aa, 1 → ab, … 25 → az, 26 → ba …
    const a = 'abcdefghijklmnopqrstuvwxyz';
    return a[Math.floor(i / 26) % 26] + a[i % 26];
  }

  DD.fmt = function (n) {
    if (typeof n !== 'number' || Number.isNaN(n)) return '0';
    if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
    const sign = n < 0 ? '-' : '';
    n = Math.abs(n);
    if (n < 1000) return sign + Math.floor(n).toString();
    let tier = Math.floor(Math.log10(n) / 3);
    let scaled = n / Math.pow(1000, tier);
    let digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
    const rounded = Number(scaled.toFixed(digits));
    if (rounded >= 1000) {
      tier += 1;
      scaled /= 1000;
      digits = 2;
    } else if (rounded >= 100) {
      digits = 0;
    } else if (rounded >= 10) {
      digits = Math.min(digits, 1);
    }
    const suffix = tier < SUFFIXES.length ? SUFFIXES[tier] : letterSuffix(tier - SUFFIXES.length);
    return sign + scaled.toFixed(digits) + suffix;
  };

  DD.fmtPct = function (fraction, digits) {
    if (typeof fraction !== 'number' || !Number.isFinite(fraction)) return '0%';
    const d = digits === undefined ? 1 : digits;
    const v = fraction * 100;
    // Drop a trailing ".0" so whole numbers read cleanly.
    const s = v.toFixed(d);
    return (d > 0 && /\.0+$/.test(s) ? s.replace(/\.0+$/, '') : s) + '%';
  };

  DD.fmtTime = function (seconds) {
    seconds = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    if (m > 0) return m + 'm ' + String(s).padStart(2, '0') + 's';
    return s + 's';
  };

  DD.fmtTimer = function (seconds) {
    seconds = Math.max(0, Math.ceil(seconds || 0));
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  };

  // ---------------------------------------------------------------- math helpers
  DD.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  DD.lerp = (a, b, t) => a + (b - a) * t;
  DD.rand = (min, max) => min + Math.random() * (max - min);
  DD.randInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
  DD.chance = (p) => Math.random() < p;
  DD.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  DD.weightedIndex = function (weights) {
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) return 0;
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r < 0) return i;
    }
    return weights.length - 1;
  };
  let uidCounter = 0;
  DD.uid = (prefix) => (prefix || 'id') + '_' + Date.now().toString(36) + (uidCounter++).toString(36);
  DD.easeOutCubic = (t) => 1 - Math.pow(1 - DD.clamp(t, 0, 1), 3);
})(typeof globalThis !== 'undefined' ? globalThis : window);
