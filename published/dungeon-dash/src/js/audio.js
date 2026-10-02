/* Dungeon Dash — audio: a tiny WebAudio synth (oscillators, noise, envelopes). No audio files.
 *
 * The AudioContext is created / resumed on the first user gesture (browsers block audio before
 * that). Every sound is synthesised on demand, routed through a gentle master gain and a
 * compressor, and rate-limited so ×3 battle speed never turns into noise. Sounds fire from bus
 * events automatically; DD.audio.play(name) is also public. Respects DD.state.s.settings.sound.
 */
(function (DD) {
  'use strict';

  const A = (DD.audio = DD.audio || {});
  const MASTER = 0.25;
  const WINDOW = 0.1; // seconds
  const MAX_IN_WINDOW = 12; // sounds per WINDOW across all names
  const MIN_GAP = {
    hit: 0.05, crit: 0.06, hurt: 0.08, kill: 0.06, coin: 0.07, chest: 0.09, equip: 0.1, sell: 0.1,
    rare: 0.2, legendary: 0.6, levelup: 0.5, skill: 0.07, boss: 0.8, death: 0.6, click: 0.04,
    win: 0.8, fail: 0.8, flap: 0.3, upgrade: 0.12,
  };
  const NAMES = Object.keys(MIN_GAP);

  let ac = null;
  let master = null;
  let noiseBuf = null;
  let inited = false;
  let subscribed = false;
  let gestureBound = false;
  let lastEnabled = true;
  const lastAt = {};
  const recent = [];

  function num(v, d) {
    return typeof v === 'number' && Number.isFinite(v) ? v : d;
  }
  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }
  function now() {
    return typeof performance !== 'undefined' && performance.now ? performance.now() / 1000 : Date.now() / 1000;
  }
  function enabled() {
    try {
      const s = DD.state && DD.state.s;
      return !(s && s.settings && s.settings.sound === false);
    } catch {
      return true;
    }
  }

  // ------------------------------------------------------------------ context
  function ensure() {
    if (ac) return ac;
    if (typeof window === 'undefined') return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      ac = new Ctx({ latencyHint: 'interactive' });
    } catch {
      try {
        ac = new Ctx();
      } catch {
        ac = null;
        return null;
      }
    }
    try {
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.18;
      master = ac.createGain();
      master.gain.value = enabled() ? MASTER : 0;
      lastEnabled = enabled();
      master.connect(comp);
      comp.connect(ac.destination);
      const len = Math.floor(ac.sampleRate * 1);
      noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      console.error('[DD.audio] could not build the audio graph', e);
      ac = null;
      master = null;
    }
    return ac;
  }
  function unlock() {
    const c = ensure();
    if (!c) return;
    try {
      if (c.state === 'suspended' && typeof c.resume === 'function') c.resume().catch(() => {});
      // iOS needs a sound started inside the gesture itself
      const b = c.createBuffer(1, 1, 22050);
      const s = c.createBufferSource();
      s.buffer = b;
      s.connect(c.destination);
      s.start(0);
    } catch {
      /* ignore: we'll try again on the next gesture */
    }
    if (c.state === 'running') unbindGesture();
  }
  function onGesture() {
    unlock();
  }
  function bindGesture() {
    if (gestureBound || typeof window === 'undefined') return;
    gestureBound = true;
    window.addEventListener('pointerdown', onGesture, true);
    window.addEventListener('keydown', onGesture, true);
    window.addEventListener('touchend', onGesture, true);
  }
  function unbindGesture() {
    if (!gestureBound) return;
    gestureBound = false;
    window.removeEventListener('pointerdown', onGesture, true);
    window.removeEventListener('keydown', onGesture, true);
    window.removeEventListener('touchend', onGesture, true);
  }
  function syncEnabled() {
    const on = enabled();
    if (on === lastEnabled || !ac || !master) {
      lastEnabled = on;
      return;
    }
    lastEnabled = on;
    try {
      const t = ac.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(on ? MASTER : 0, t + 0.08);
    } catch {
      master.gain.value = on ? MASTER : 0;
    }
  }

  // ------------------------------------------------------------------ synth primitives
  function cleanup(nodes) {
    return function () {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* already gone */
        }
      }
    };
  }
  function envGain(t0, attack, peak, dur) {
    const g = ac.createGain();
    const p = Math.max(0.0002, peak);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(p, t0 + Math.max(0.002, attack));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(attack + 0.01, dur));
    return g;
  }
  /** Oscillator voice: type, start→end frequency, volume, optional filter / vibrato. */
  function tone(type, f0, f1, t0, dur, vol, o) {
    const opt = o || {};
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), t0);
    if (f1 && f1 !== f0) {
      if (opt.linear) osc.frequency.linearRampToValueAtTime(Math.max(20, f1), t0 + dur);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    }
    if (opt.detune) osc.detune.setValueAtTime(opt.detune, t0);
    const g = envGain(t0, opt.attack || 0.005, vol, dur);
    const nodes = [osc, g];
    let head = osc;
    if (opt.filter) {
      const f = ac.createBiquadFilter();
      f.type = opt.filter;
      f.frequency.setValueAtTime(opt.ff || 1200, t0);
      if (opt.ff1) f.frequency.exponentialRampToValueAtTime(opt.ff1, t0 + dur);
      f.Q.value = opt.q || 0.8;
      head.connect(f);
      head = f;
      nodes.push(f);
    }
    if (opt.vib) {
      const lfo = ac.createOscillator();
      const lg = ac.createGain();
      lfo.frequency.value = opt.vib;
      lg.gain.value = opt.vibDepth || 6;
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.05);
      nodes.push(lfo, lg);
    }
    head.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    osc.onended = cleanup(nodes);
  }
  /** Filtered white-noise burst. */
  function noise(t0, dur, vol, type, f0, f1, q, attack) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = rnd(0.9, 1.1);
    const f = ac.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.setValueAtTime(Math.max(30, f0 || 1000), t0);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    f.Q.value = q || 0.7;
    const g = envGain(t0, attack || 0.003, vol, dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.loop = true;
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
    src.onended = cleanup([src, f, g]);
  }
  const NOTE = {
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, Gs5: 830.61, A5: 880.0, B5: 987.77,
    C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, B3: 246.94, A3: 220.0,
  };

  // ------------------------------------------------------------------ sound bank
  function boom(t, vol) {
    tone('sine', 130, 38, t, 0.42, 0.55 * vol);
    noise(t, 0.4, 0.4 * vol, 'lowpass', 1100, 160, 0.6);
  }
  const BANK = {
    hit(t, r) {
      noise(t, 0.05, 0.2, 'bandpass', 2400 * r, 900 * r, 1.1);
      tone('triangle', 190 * r, 70 * r, t, 0.07, 0.22);
    },
    crit(t, r) {
      tone('sine', 150 * r, 45, t, 0.12, 0.4);
      noise(t, 0.07, 0.22, 'highpass', 2800, 2000, 0.8);
      tone('square', 700 * r, 1400 * r, t, 0.08, 0.07, { filter: 'lowpass', ff: 3500 });
      tone('triangle', 1400 * r, 2100 * r, t + 0.03, 0.11, 0.08);
    },
    hurt(t, r) {
      tone('triangle', 240 * r, 110 * r, t, 0.11, 0.2);
      noise(t, 0.07, 0.16, 'lowpass', 1600, 500, 0.7);
    },
    kill(t, r) {
      tone('square', 520 * r, 95, t, 0.17, 0.08, { filter: 'lowpass', ff: 2200, ff1: 500 });
      noise(t, 0.2, 0.18, 'lowpass', 1400, 250, 0.7);
    },
    coin(t, r, v) {
      tone('square', NOTE.B5 * r, 0, t, 0.06, 0.06, { filter: 'lowpass', ff: 5000 });
      tone('square', NOTE.E6 * r, 0, t + 0.055, 0.16, 0.06, { filter: 'lowpass', ff: 5000 });
      if (v === 'big') tone('triangle', NOTE.G6 * r, 0, t + 0.12, 0.2, 0.06);
    },
    chest(t, r) {
      noise(t, 0.09, 0.26, 'lowpass', 700, 200, 0.9);
      tone('triangle', 140, 90, t, 0.1, 0.22);
      const ns = [NOTE.C5, NOTE.E5, NOTE.G5];
      ns.forEach((f, i) => tone('triangle', f * r, 0, t + 0.06 + i * 0.055, 0.14, 0.09));
    },
    equip(t, r) {
      tone('sine', 1250 * r, 1180 * r, t, 0.22, 0.11);
      tone('sine', 2650 * r, 2600 * r, t, 0.14, 0.05);
      tone('triangle', 230, 110, t, 0.08, 0.2);
      noise(t, 0.04, 0.1, 'highpass', 4000, 4000, 0.7);
    },
    sell(t, r) {
      tone('square', NOTE.E6 * r, 0, t, 0.05, 0.05, { filter: 'lowpass', ff: 5000 });
      tone('square', NOTE.G6 * r, 0, t + 0.05, 0.05, 0.05, { filter: 'lowpass', ff: 5000 });
      tone('triangle', NOTE.C6 * r * 2, 0, t + 0.1, 0.16, 0.05);
      noise(t, 0.12, 0.06, 'highpass', 6000, 6000, 0.7);
    },
    rare(t, r) {
      [NOTE.E5, NOTE.Gs5, NOTE.B5, NOTE.E6].forEach((f, i) => tone('triangle', f * r, 0, t + i * 0.065, 0.26, 0.09));
      noise(t + 0.1, 0.35, 0.05, 'highpass', 6000, 9000, 0.6, 0.05);
    },
    legendary(t, r) {
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6].forEach((f, i) =>
        tone('sawtooth', f * r, 0, t + i * 0.07, 0.2, 0.05, { filter: 'lowpass', ff: 3000 }),
      );
      const hold = t + 0.36;
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f) => tone('triangle', f * r, 0, hold, 0.85, 0.07, { vib: 6, vibDepth: 5, attack: 0.03 }));
      noise(hold, 0.8, 0.05, 'highpass', 7000, 10000, 0.6, 0.08);
      tone('sine', 98, 49, t, 0.3, 0.3);
    },
    levelup(t, r) {
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) =>
        tone('square', f * r, 0, t + i * 0.07, 0.12, 0.05, { filter: 'lowpass', ff: 4000 }),
      );
      tone('triangle', NOTE.C6 * r, 0, t + 0.28, 0.45, 0.09, { vib: 7, vibDepth: 6 });
      tone('triangle', NOTE.G5 * r, 0, t + 0.28, 0.45, 0.06);
    },
    skill(t, r, v) {
      switch (v) {
        case 'bomb':
          noise(t, 0.16, 0.08, 'bandpass', 800, 2400, 1.2);
          boom(t + 0.16, 1);
          break;
        case 'lightning':
          tone('sawtooth', 1900 * r, 180, t, 0.2, 0.06, { filter: 'highpass', ff: 600 });
          noise(t, 0.24, 0.22, 'highpass', 2600, 1800, 0.8);
          tone('square', 60, 40, t, 0.18, 0.06, { filter: 'lowpass', ff: 400 });
          break;
        case 'frost':
          [NOTE.C6 * 2, NOTE.E6 * 2, NOTE.G6 * 1.5].forEach((f, i) => tone('triangle', f * r, 0, t + i * 0.04, 0.3, 0.04));
          noise(t, 0.5, 0.12, 'highpass', 4500, 8000, 0.7, 0.02);
          tone('sine', 520, 260, t, 0.35, 0.08);
          break;
        case 'meteor':
          noise(t, 0.42, 0.16, 'bandpass', 300, 1400, 1.4, 0.2);
          boom(t + 0.42, 1.2);
          break;
        case 'heal':
          [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => tone('sine', f * r, 0, t + i * 0.06, 0.4, 0.07, { attack: 0.02 }));
          noise(t + 0.05, 0.4, 0.04, 'highpass', 7000, 9000, 0.6, 0.05);
          break;
        case 'shield':
          tone('sine', 220 * r, 440 * r, t, 0.32, 0.12, { attack: 0.03 });
          tone('triangle', 660 * r, 880 * r, t, 0.3, 0.05, { vib: 9, vibDepth: 8 });
          break;
        case 'warcry':
          tone('sawtooth', 170 * r, 105 * r, t, 0.38, 0.12, { filter: 'lowpass', ff: 1000, ff1: 500, vib: 18, vibDepth: 12 });
          noise(t, 0.3, 0.12, 'bandpass', 700, 400, 1.2);
          tone('sine', 90, 50, t, 0.25, 0.3);
          break;
        case 'blades':
          for (let i = 0; i < 3; i++) noise(t + i * 0.07, 0.09, 0.14, 'bandpass', 2600 + i * 400, 1400, 2.4);
          tone('triangle', 1800 * r, 2400 * r, t, 0.12, 0.03);
          break;
        default:
          noise(t, 0.25, 0.18, 'bandpass', 400, 3000, 1.2);
          tone('sine', 300 * r, 900 * r, t, 0.22, 0.08);
      }
    },
    boss(t) {
      tone('sawtooth', 55, 52, t, 1.0, 0.16, { filter: 'lowpass', ff: 420 });
      tone('sawtooth', 82.4, 78, t, 1.0, 0.12, { filter: 'lowpass', ff: 420 });
      tone('sine', 95, 38, t, 0.45, 0.5);
      tone('sine', 95, 38, t + 0.32, 0.45, 0.45);
      noise(t, 0.3, 0.12, 'lowpass', 500, 120, 0.7);
    },
    death(t) {
      [[NOTE.G4, 0.16], [NOTE.E4, 0.16], [NOTE.C4, 0.5]].reduce((at, n) => {
        tone('triangle', n[0], n[0] * 0.94, at, n[1] + 0.05, 0.13, { vib: n[1] > 0.3 ? 5 : 0, vibDepth: 6 });
        return at + n[1];
      }, t);
      noise(t, 0.3, 0.08, 'lowpass', 600, 150, 0.7);
    },
    click(t, r) {
      tone('square', 1500 * r, 1300 * r, t, 0.03, 0.035, { filter: 'lowpass', ff: 4000 });
      tone('triangle', 2400 * r, 0, t, 0.02, 0.02);
    },
    win(t) {
      [NOTE.G4, NOTE.C5, NOTE.E5, NOTE.G5].forEach((f, i) =>
        tone('square', f, 0, t + i * 0.085, 0.13, 0.05, { filter: 'lowpass', ff: 3500 }),
      );
      tone('triangle', NOTE.C6, 0, t + 0.34, 0.6, 0.09, { vib: 6, vibDepth: 5 });
      tone('triangle', NOTE.E5, 0, t + 0.34, 0.6, 0.05);
      tone('triangle', NOTE.G5, 0, t + 0.34, 0.6, 0.05);
    },
    fail(t) {
      tone('sawtooth', NOTE.E4, NOTE.E4 * 0.95, t, 0.24, 0.07, { filter: 'lowpass', ff: 1500, ff1: 600 });
      tone('sawtooth', NOTE.C4, NOTE.B3, t + 0.24, 0.5, 0.07, { filter: 'lowpass', ff: 1400, ff1: 400, vib: 5, vibDepth: 6 });
    },
    flap(t) {
      noise(t, 0.06, 0.2, 'lowpass', 900, 400, 0.8);
      noise(t + 0.1, 0.06, 0.18, 'lowpass', 900, 400, 0.8);
      tone('sine', 1800, 2500, t + 0.02, 0.06, 0.03);
      tone('sine', 2000, 2700, t + 0.2, 0.06, 0.03);
    },
    upgrade(t, r) {
      tone('triangle', 660 * r, 990 * r, t, 0.09, 0.09);
      tone('triangle', 990 * r, 1320 * r, t + 0.08, 0.14, 0.09);
      noise(t + 0.06, 0.15, 0.04, 'highpass', 6000, 8000, 0.6);
    },
  };

  // ------------------------------------------------------------------ play + rate limiting
  function allowed(name, t) {
    const gap = MIN_GAP[name] || 0.04;
    const last = lastAt[name];
    if (last !== undefined && t - last < gap) return false;
    while (recent.length && t - recent[0] > WINDOW) recent.shift();
    if (recent.length >= MAX_IN_WINDOW) return false;
    lastAt[name] = t;
    recent.push(t);
    return true;
  }

  /** play(name, { delay?, variant? }) → true if the sound was scheduled. */
  function play(name, opts) {
    if (typeof name !== 'string' || !BANK[name]) return false;
    if (!enabled()) return false;
    if (!ac || !master || !noiseBuf) return false;
    if (ac.state !== 'running') return false;
    if (!allowed(name, now())) return false;
    const o = opts && typeof opts === 'object' ? opts : {};
    try {
      const t = ac.currentTime + 0.005 + Math.max(0, Math.min(2, num(o.delay, 0)));
      const r = 1 + rnd(-0.035, 0.035);
      BANK[name](t, r, o.variant);
      return true;
    } catch (err) {
      console.error('[DD.audio] play failed', name, err);
      return false;
    }
  }

  // ------------------------------------------------------------------ bus wiring
  function subscribe() {
    if (subscribed || !DD.bus || typeof DD.bus.on !== 'function') return;
    subscribed = true;
    const on = (evt, fn) => DD.bus.on(evt, (p) => fn(p && typeof p === 'object' ? p : {}));
    on('hit', (p) => {
      if (p.miss) return;
      if (p.target === 'hero') {
        if (num(p.amount, 0) - num(p.absorbed, 0) > 0) play('hurt');
        return;
      }
      play(p.crit ? 'crit' : 'hit');
    });
    on('enemy:killed', (p) => {
      play('kill');
      if (num(p.gold, 0) > 0 || p.isBoss) play('coin', { delay: 0.12, variant: p.isBoss ? 'big' : '' });
    });
    on('chest:opened', (p) => {
      const item = p.item && typeof p.item === 'object' ? p.item : null;
      const rarity = item ? Math.floor(num(item.rarity, 0)) : 0;
      if (p.decision === 'pending' || !p.decision) play('chest');
      if (rarity >= 4) play('legendary', { delay: 0.18 });
      else if (rarity >= 2 && p.decision === 'pending') play('rare', { delay: 0.14 });
    });
    on('item:equipped', () => play('equip'));
    on('item:sold', () => play('sell'));
    on('levelup', () => play('levelup'));
    on('skill:cast', (p) => play('skill', { variant: typeof p.id === 'string' ? p.id : '' }));
    on('wave:start', (p) => {
      if (p.isBoss) play('boss');
    });
    on('hero:died', () => play('death'));
    on('floor:cleared', () => play('win'));
    on('dungeon:won', () => play('win'));
    on('boss:failed', (p) => play('fail', { delay: p.reason === 'death' ? 0.55 : 0 }));
    on('dungeon:failed', (p) => play('fail', { delay: p.reason === 'death' ? 0.55 : 0 }));
    on('flyingChest:spawn', () => play('flap'));
    on('flyingChest:collected', () => play('coin', { variant: 'big' }));
    on('ui:click', () => play('click'));
    on('purchase', () => play('upgrade'));
    on('quest:claimed', () => play('upgrade'));
    on('state:changed', syncEnabled);
  }

  function init() {
    if (inited) return;
    inited = true;
    bindGesture();
    subscribe();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!ac) return;
        try {
          if (document.visibilityState === 'hidden') {
            if (ac.state === 'running' && typeof ac.suspend === 'function') ac.suspend().catch(() => {});
          } else if (ac.state === 'suspended' && typeof ac.resume === 'function') {
            ac.resume().catch(() => {});
          }
        } catch {
          /* ignore */
        }
      });
    }
  }

  A.init = init;
  A.play = play;
  // extras
  A.names = function () {
    return NAMES.slice();
  };
  A.isReady = function () {
    return !!(ac && ac.state === 'running');
  };
  A.unlock = unlock;
})(globalThis.DD);
