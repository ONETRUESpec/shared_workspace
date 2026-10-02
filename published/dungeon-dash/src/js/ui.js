/* Dungeon Dash — UI: HUD, stage strip, skill bar, panels, sheets, modals and toasts.
 *
 * DD.ui.init(rootEl) builds the whole DOM once (including <canvas id="battle-canvas"> for the
 * renderer). Afterwards nothing is rebuilt wholesale: per-frame and per-change updates patch text,
 * attributes and classes in place, so a button is never swapped out from under a finger.
 *   - 'state:changed' only sets a dirty flag; frame(dt) re-renders the HUD + the visible panel at
 *     most ~8×/s.
 *   - HP bar, boss timer, cooldown sweeps and the key countdown are updated every frame from the
 *     DD.battle view fields (cheap, cached setters).
 * Icons come from DD.sprites (cached per key); missing sprite functions degrade to CSS shapes. */
(function (DD) {
  'use strict';
  if (!DD) return;

  // ================================================================ small helpers
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const num = (v, d) => (isNum(v) ? v : d);
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const HAS_DOM = typeof document !== 'undefined' && typeof window !== 'undefined';

  function S() {
    try {
      return DD.state && DD.state.s ? DD.state.s : null;
    } catch {
      return null;
    }
  }
  const D = () => DD.data || null;
  const BT = () => DD.battle || null;

  function call(obj, name, args) {
    if (!obj || typeof obj[name] !== 'function') return undefined;
    try {
      return obj[name].apply(obj, args || []);
    } catch (err) {
      console.error('[DD.ui] ' + name + ' failed', err);
      return undefined;
    }
  }
  const st = (name, ...args) => call(DD.state, name, args);
  const bt = (name, ...args) => call(DD.battle, name, args);
  const dt_ = (name, ...args) => call(DD.data, name, args);

  const fmt = (n) => (typeof DD.fmt === 'function' ? DD.fmt(num(n, 0)) : String(Math.floor(num(n, 0))));
  const fmtPct = (v, d) =>
    typeof DD.fmtPct === 'function' ? DD.fmtPct(num(v, 0), d === undefined ? 1 : d) : (num(v, 0) * 100).toFixed(d === undefined ? 1 : d) + '%';
  const fmtTime = (s) => (typeof DD.fmtTime === 'function' ? DD.fmtTime(num(s, 0)) : Math.floor(num(s, 0)) + 's');
  const fmtTimer = (s) => (typeof DD.fmtTimer === 'function' ? DD.fmtTimer(num(s, 0)) : String(Math.ceil(num(s, 0))));
  const emit = (evt, payload) => {
    try {
      DD.bus.emit(evt, payload || {});
    } catch {
      /* bus missing */
    }
  };
  const reducedMotion = () => {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch {
      return false;
    }
  };

  // ================================================================ vocabulary fallbacks
  const RARITY_FALLBACK = [
    { id: 'common', name: 'Common', color: '#9aa3ad' },
    { id: 'uncommon', name: 'Uncommon', color: '#5fd068' },
    { id: 'rare', name: 'Rare', color: '#4aa3ff' },
    { id: 'epic', name: 'Epic', color: '#b46cff' },
    { id: 'legendary', name: 'Legendary', color: '#ffa726' },
    { id: 'mythic', name: 'Mythic', color: '#ff5252' },
    { id: 'celestial', name: 'Celestial', color: '#5ef3ff' },
  ];
  const SLOTS_FALLBACK = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'belt', 'ring', 'amulet'];
  const STAT_FALLBACK = {
    atk: ['Attack', 'ATK'],
    hp: ['Health', 'HP'],
    atkSpeed: ['Attack Speed', 'SPD'],
    critChance: ['Crit Chance', 'CRIT'],
    critDmg: ['Crit Damage', 'CDMG'],
    combo: ['Combo', 'CMB'],
    counter: ['Counter', 'CTR'],
    dodge: ['Dodge', 'DDG'],
    stun: ['Stun', 'STN'],
    lifesteal: ['Lifesteal', 'LS'],
    regen: ['Regen', 'RGN'],
    skillDmg: ['Skill Damage', 'SKL'],
    bossDmg: ['Boss Damage', 'BOSS'],
    goldBonus: ['Gold Bonus', 'GOLD'],
    chestChance: ['Chest Drop', 'CHEST'],
  };

  function rarities() {
    const d = D();
    return d && Array.isArray(d.RARITIES) && d.RARITIES.length ? d.RARITIES : RARITY_FALLBACK;
  }
  function rarity(i) {
    const arr = rarities();
    const k = clamp(Math.floor(num(i, 0)), 0, arr.length - 1);
    return arr[k] || RARITY_FALLBACK[0];
  }
  const rIdx = (i) => clamp(Math.floor(num(i, 0)), 0, 6);
  function slots() {
    const d = D();
    return d && Array.isArray(d.SLOTS) && d.SLOTS.length ? d.SLOTS : SLOTS_FALLBACK;
  }
  function slotName(slot) {
    const d = D();
    const info = d && d.SLOT_INFO && d.SLOT_INFO[slot];
    if (info && info.name) return info.name;
    return String(slot || '').charAt(0).toUpperCase() + String(slot || '').slice(1);
  }
  function statLabel(k) {
    const d = D();
    const info = d && d.STAT_INFO && d.STAT_INFO[k];
    return info && info.label ? info.label : STAT_FALLBACK[k] ? STAT_FALLBACK[k][0] : String(k);
  }
  function statShort(k) {
    const d = D();
    const info = d && d.STAT_INFO && d.STAT_INFO[k];
    return info && info.short ? info.short : STAT_FALLBACK[k] ? STAT_FALLBACK[k][1] : String(k).toUpperCase();
  }
  function fmtStatVal(k, v) {
    const d = D();
    if (d && typeof d.fmtStat === 'function') {
      try {
        const out = d.fmtStat(k, num(v, 0));
        if (typeof out === 'string') return out;
      } catch {
        /* fall through */
      }
    }
    if (k === 'atk' || k === 'hp') return fmt(v);
    return (num(v, 0) >= 0 ? '+' : '') + fmtPct(v, 1);
  }
  function eraOf(item) {
    if (item && isNum(item.era)) return clamp(Math.floor(item.era), 0, 5);
    const il = item && isNum(item.ilvl) ? item.ilvl : 1;
    return clamp(Math.floor((il - 1) / 10), 0, 5);
  }
  function eraName(item) {
    const d = D();
    const e = d && Array.isArray(d.ERAS) ? d.ERAS[eraOf(item)] : null;
    return e && e.name ? e.name : '';
  }
  function list(name, fallback) {
    const d = D();
    const v = d && d[name];
    return Array.isArray(v) && v.length ? v : fallback;
  }
  const skillIds = () => list('SKILL_IDS', d0Keys('SKILLS', ['bomb', 'blades', 'warcry', 'heal', 'lightning', 'shield', 'frost', 'meteor']));
  const allyIds = () => list('ALLY_IDS', d0Keys('ALLIES', ['wolf', 'fairy', 'drone_ally', 'golem_ally']));
  const masteryIds = () => list('MASTERY_IDS', d0Keys('MASTERY', ['might', 'vitality', 'greed', 'fortune', 'precision', 'patience']));
  const dungeonIds = () => list('DUNGEON_IDS', d0Keys('DUNGEONS', ['dragon', 'horde', 'vault', 'mothership']));
  function d0Keys(name, fallback) {
    const d = D();
    return d && d[name] && typeof d[name] === 'object' ? Object.keys(d[name]) : fallback;
  }
  const skillDef = (id) => (D() && D().SKILLS && D().SKILLS[id]) || { name: id, rarity: 0, unlock: 0, cd: 0 };
  const allyDef = (id) => (D() && D().ALLIES && D().ALLIES[id]) || { name: id, rarity: 0, unlock: 0 };
  const masteryDef = (id) => (D() && D().MASTERY && D().MASTERY[id]) || { name: id, max: 0 };
  const dungeonDef = (id) => (D() && D().DUNGEONS && D().DUNGEONS[id]) || { name: id, unlockFloor: 1 };
  const skillSlotFloors = () => list('SKILL_SLOT_FLOORS', [1, 5, 12, 25]);
  const allySlotFloors = () => list('ALLY_SLOT_FLOORS', [4, 20]);
  const maxSkillLevel = () => num(D() && D().MAX_SKILL_LEVEL, 30);
  const maxAllyLevel = () => num(D() && D().MAX_ALLY_LEVEL, 50);
  const maxKeys = () => num(D() && D().MAX_KEYS, 5);
  const maxChestLevel = () => num(D() && D().MAX_CHEST_LEVEL, 20);
  const wavesPerFloor = () => clamp(Math.floor(num(D() && D().WAVES_PER_FLOOR, 5)), 2, 9);

  // ================================================================ DOM helpers
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = String(v);
        else if (k === 'hidden') el.hidden = true;
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (let i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) {
      for (const x of c) add(el, x);
      return;
    }
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  function btn(cls, act, arg, kids, extra) {
    const a = Object.assign({ type: 'button', class: 'btn ' + (cls || ''), 'data-act': act }, extra || {});
    if (arg !== undefined && arg !== null) a['data-arg'] = String(arg);
    return h('button', a, kids);
  }
  function setText(el, v) {
    if (!el) return;
    const t = v === null || v === undefined ? '' : String(v);
    if (el._t !== t) {
      el._t = t;
      el.textContent = t;
    }
  }
  function setAttr(el, k, v) {
    if (!el) return;
    const cache = el._a || (el._a = {});
    const val = v === null || v === undefined || v === false ? null : v === true ? '' : String(v);
    if (cache[k] === val) return;
    cache[k] = val;
    if (val === null) el.removeAttribute(k);
    else el.setAttribute(k, val);
  }
  function setCls(el, cls, on) {
    if (el && el.classList.contains(cls) !== !!on) el.classList.toggle(cls, !!on);
  }
  function setHidden(el, hide) {
    if (el && el.hidden !== !!hide) el.hidden = !!hide;
  }
  function setVar(el, name, v) {
    if (!el) return;
    const c = el._v || (el._v = {});
    if (c[name] !== v) {
      c[name] = v;
      el.style.setProperty(name, v);
    }
  }
  function setRar(el, r) {
    if (!el) return;
    const v = isNum(r) && r >= 0 ? 'r' + rIdx(r) : 'rnone';
    if (el._r === v) return;
    if (el._r) el.classList.remove(el._r);
    el.classList.add(v);
    el._r = v;
  }
  // Soft-disable: the button stays focusable/clickable so a tap can explain why it is unavailable.
  function setAvail(b, ok, reason) {
    setAttr(b, 'aria-disabled', ok ? null : 'true');
    setAttr(b, 'data-reason', ok ? null : reason || null);
  }
  function restartAnim(el, cls, ms) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth; // restart the CSS animation
    el.classList.add(cls);
    clearTimeout(el['_anim_' + cls]);
    el['_anim_' + cls] = setTimeout(() => el.classList.remove(cls), ms || 600);
  }

  // ================================================================ icons
  const iconCache = new Map();
  function spr(fn, arg, key) {
    const k = fn + '|' + key;
    const hit = iconCache.get(k);
    if (hit) return hit;
    const sp = DD.sprites;
    if (!sp || typeof sp[fn] !== 'function') return '';
    let url = '';
    try {
      url = sp[fn](arg);
    } catch {
      url = '';
    }
    if (typeof url !== 'string') url = '';
    if (url) iconCache.set(k, url);
    return url;
  }
  function lookKey(l) {
    return l ? [l.weaponEra, l.weaponRarity, l.armorRarity].join(',') : 'none';
  }
  const icons = {
    item: (it) => (it && typeof it === 'object' ? spr('itemIcon', it, String(it.slot) + '|' + eraOf(it) + '|' + rIdx(it.rarity)) : ''),
    slot: (slot) => spr('slotIcon', slot, slot),
    skill: (id) => spr('skillIcon', id, id),
    ally: (id) => spr('allyIcon', id, id),
    dungeon: (id) => spr('dungeonIcon', id, id),
    cur: (k) => spr('currencyIcon', k, k),
    chest: (lv) => spr('chestIcon', clamp(Math.floor(num(lv, 1)), 1, 20), clamp(Math.floor(num(lv, 1)), 1, 20)),
    portrait: (look) => spr('heroPortrait', look, lookKey(look)),
  };
  function heroLook(s) {
    const sp = DD.sprites;
    const eq = (s && s.equipped) || {};
    if (sp && typeof sp.lookFromEquipped === 'function') {
      try {
        const l = sp.lookFromEquipped(eq);
        if (l) return l;
      } catch {
        /* fall back */
      }
    }
    const w = eq.weapon;
    const a = eq.armor;
    return {
      weaponEra: w ? eraOf(w) : 0,
      weaponRarity: w ? rIdx(w.rarity) : -1,
      armorRarity: a ? rIdx(a.rarity) : -1,
    };
  }

  // Tiny UI-only pixel glyphs (locks, gear, skull, mastery badges) drawn once to data URLs.
  const PIX = {
    lock: {
      pal: { o: '#120e1a', S: '#c7bbd9', Y: '#ffd45c', y: '#d98a1f' },
      rows: ['....oooo....', '...oSSSSo...', '..oSo..oSo..', '..oSo..oSo..', '..oSo..oSo..', '.oooooooooo.', '.oYYYYYYYYo.', '.oYyyooyyyo.', '.oYyyooyyyo.', '.oYyyyoyyyo.', '.oYyyyyyyyo.', '.oooooooooo.'],
    },
    gear: {
      pal: { o: '#120e1a', G: '#c7bbd9', g: '#8f80a8' },
      rows: ['.....oo.....', '..o.oGGo.o..', '.oGoGGGGoGo.', '..oGGGGGGo..', '.oGGGooGGgo.', 'oGGGo..oGGgo', 'oGGGo..oGggo', '.oGGgooGggo.', '..oGgggggo..', '.oGogggggGo.', '..o.oggo.o..', '.....oo.....'],
    },
    skull: {
      pal: { o: '#0e0c15', w: '#f1e7d0', k: '#2a1020', s: '#b9ab92' },
      rows: ['..ooooo..', '.owwwwwo.', 'owwwwwwwo', 'owkkwkkwo', 'owkkwkkso', 'owwwkwwso', '.owwwwso.', '..owksw..', '..ooooo..'],
    },
    heart: {
      pal: { o: '#2a0d14', r: '#e5484d', R: '#ff8a8d', w: '#ffe0e0', d: '#a3202a' },
      rows: [
        '................',
        '..oooo....oooo..',
        '.orrrro..orrrro.',
        'orRwrrroorrrrrdo',
        'orwRrrrrrrrrrrdo',
        'orRrrrrrrrrrrrdo',
        'orrrrrrrrrrrrrdo',
        '.orrrrrrrrrrrdo.',
        '..orrrrrrrrrdo..',
        '...orrrrrrrdo...',
        '....orrrrrdo....',
        '.....orrrdo.....',
        '......ordo......',
        '.......oo.......',
        '................',
        '................',
      ],
    },
    hourglass: {
      size: 16,
      pal: { o: '#2a1d10', F: '#d9984a', g: '#9fd8f0', s: '#ffd45c' },
      rows: ['oooooooooooo', 'oFFFFFFFFFFo', 'oooooooooooo', '.ogssssssgo.', '..ogssssgo..', '...ogssgo...', '....osso....', '....ogso....', '...oggsgo...', '..oggssggo..', '.ogssssssgo.', 'oooooooooooo', 'oFFFFFFFFFFo', 'oooooooooooo'],
    },
    target: {
      size: 16,
      draw(x, y) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        if (d < 2.1) return '#ffd45c';
        if (d < 3.9) return '#e5484d';
        if (d < 5.5) return '#f1e7d0';
        if (d < 7.0) return '#e5484d';
        if (d < 7.9) return '#2a0d14';
        return null;
      },
    },
  };
  const pixCache = new Map();
  function pix(name) {
    if (pixCache.has(name)) return pixCache.get(name);
    let url = '';
    try {
      const def = PIX[name];
      if (def && HAS_DOM) {
        // Maps smaller than `size` are centred on the canvas so every glyph shares one pixel grid.
        const rw = def.rows ? def.rows[0].length : def.size;
        const rh = def.rows ? def.rows.length : def.size;
        const w = Math.max(rw, def.size || 0);
        const hgt = Math.max(rh, def.size || 0);
        const ox = Math.floor((w - rw) / 2);
        const oy = Math.floor((hgt - rh) / 2);
        const c = document.createElement('canvas');
        c.width = w;
        c.height = hgt;
        const g = c.getContext('2d');
        if (g) {
          for (let y = 0; y < rh; y++) {
            for (let x = 0; x < rw; x++) {
              const col = def.draw ? def.draw(x, y) : def.pal[(def.rows[y] || '')[x]];
              if (!col) continue;
              g.fillStyle = col;
              g.fillRect(x + ox, y + oy, 1, 1);
            }
          }
          url = c.toDataURL('image/png');
        }
      }
    } catch {
      url = '';
    }
    pixCache.set(name, url);
    return url;
  }
  const MASTERY_ICON = {
    might: () => icons.cur('cp'),
    vitality: () => pix('heart'),
    greed: () => icons.cur('gold'),
    fortune: () => icons.cur('chest'),
    precision: () => pix('target'),
    patience: () => pix('hourglass'),
  };

  // <span class="ico"><img></span>; falls back to a CSS shape keyed by data-fb when url is ''.
  function ico(fb, cls, url) {
    const img = h('img', { alt: '', draggable: 'false', decoding: 'async' });
    const el = h('span', { class: 'ico ' + (cls || ''), 'data-fb': fb || '', 'aria-hidden': 'true' }, img);
    el._img = img;
    setIco(el, url || '');
    return el;
  }
  function setIco(el, url, fb) {
    if (!el || !el._img) return;
    if (fb !== undefined) setAttr(el, 'data-fb', fb);
    if (url) {
      if (el._src !== url) {
        el._src = url;
        el._img.src = url;
      }
      setCls(el, 'fb', false);
    } else {
      if (el._src) {
        el._src = '';
        el._img.removeAttribute('src');
      }
      setCls(el, 'fb', true);
    }
  }

  // ================================================================ module state
  const ui = (DD.ui = DD.ui || {});
  const R = {}; // element refs
  let host = null;
  let root = null;
  let built = false;
  let curTab = 'loot';
  let dirty = true;
  let sinceRender = 1;
  let unsubs = [];
  let chooser = null; // { kind: 'skill'|'ally', id }
  let firstFrame = true;
  let powerSnap = 0;
  let lastPower = -1;
  let lastLevel = -1;
  let lastBossFailFloor = 0;
  let hpTrail = 1;
  let hpTrailHold = 0;
  let resetArmed = 0;
  const tabScroll = {};
  const lootLog = [];
  let logDirty = true;
  const soldGold = new Map();
  const equipDelta = new Map();
  const earlyToasts = [];
  const earlyOverlays = [];
  const RENDER_INTERVAL = 0.125;
  let ov = null; // open overlay: { kind, key, el, update, tick, onClose, blocking, dismissable, prevFocus, timers }
  const ovQueue = [];

  const TABS = [
    { id: 'loot', label: 'Loot', icon: () => icons.cur('chest'), fb: 'chest' },
    { id: 'hero', label: 'Hero', icon: () => icons.portrait(heroLook(S())), fb: 'hero' },
    { id: 'skills', label: 'Skills', icon: () => icons.cur('scrolls'), fb: 'scrolls' },
    { id: 'allies', label: 'Allies', icon: () => icons.ally('wolf'), fb: 'ally' },
    { id: 'dungeons', label: 'Dungeons', icon: () => icons.cur('keys'), fb: 'keys' },
    { id: 'mastery', label: 'Mastery', icon: () => icons.cur('gems'), fb: 'gems' },
  ];

  // ================================================================ build: shell
  function build() {
    host.innerHTML = '';
    host.classList.add('dd-host');
    root = h('div', { class: 'dd', id: 'dd-root' });
    add(root, [buildHUD(), buildStage(), buildBattle(), buildHP(), buildSkillbar(), buildPanels(), buildTabs(), buildOverlay(), buildToasts()]);
    host.appendChild(root);
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    built = true;
  }

  // ---------------------------------------------------------------- HUD
  function buildHUD() {
    R.portrait = ico('hero', 'ico-portrait');
    R.lvBadge = h('span', { class: 'hud-lv' }, '1');
    const heroBtn = h('button', { type: 'button', class: 'hud-hero', 'data-act': 'tab', 'data-arg': 'hero', 'aria-label': 'Hero' }, R.portrait, R.lvBadge);
    R.cpVal = h('b', { class: 'hud-cp-val' }, '0');
    R.xpFill = h('span', { class: 'bar-fill' });
    R.xpText = h('span', { class: 'bar-text' });
    R.xpBar = h('div', { class: 'bar bar-xp', role: 'progressbar', 'aria-label': 'Experience', 'aria-valuemin': '0', 'aria-valuemax': '100' }, R.xpFill, R.xpText);
    const mid = h(
      'div',
      { class: 'hud-mid' },
      h('div', { class: 'hud-cp', title: 'Combat Power' }, ico('cp', 'ico-16', icons.cur('cp')), R.cpVal, h('small', null, 'CP')),
      R.xpBar,
    );
    R.pill = {};
    const pill = (k, fb, title) => {
      const val = h('b', null, '0');
      const el = h('div', { class: 'pill pill-' + k, title }, ico(fb, 'ico-16', icons.cur(fb)), val);
      R.pill[k] = { el, val };
      return el;
    };
    const keysPill = pill('keys', 'keys', 'Dungeon keys');
    R.pill.keys.timer = h('small', { class: 'pill-timer' });
    keysPill.appendChild(R.pill.keys.timer);
    const pills = h('div', { class: 'hud-pills' }, pill('gold', 'gold', 'Gold'), pill('gems', 'gems', 'Gems'), keysPill, pill('scrolls', 'scrolls', 'Skill Scrolls'));
    return h('header', { class: 'hud' }, heroBtn, mid, pills);
  }

  // ---------------------------------------------------------------- stage strip
  function buildStage() {
    R.stageIco = ico('dungeon', 'ico-26 st-ico');
    R.stageFloor = h('b', { class: 'st-floor' }, 'Floor 1');
    R.stageSub = h('span', { class: 'st-sub' }, '');
    R.pips = [];
    R.pipWrap = h('div', { class: 'pips', role: 'img', 'aria-label': 'Wave 1 of 5' });
    const n = wavesPerFloor();
    for (let i = 1; i <= n; i++) {
      const p = i === n ? h('span', { class: 'pip pip-boss' }, ico('skull', 'ico-pip', pix('skull'))) : h('span', { class: 'pip' });
      R.pips.push(p);
      R.pipWrap.appendChild(p);
    }
    R.timerText = h('b', { class: 'st-timer-text' }, '0:30');
    R.timerWrap = h('div', { class: 'st-timer', hidden: true, title: 'Time left' }, ico('hourglass', 'ico-16', pix('hourglass')), R.timerText);
    R.btnBoss = btn('btn-sm btn-primary btn-boss', 'challengeBoss', null, [ico('skull', 'ico-18', pix('skull')), h('span', null, 'Challenge Boss')], { hidden: true });
    R.btnLeave = btn('btn-sm btn-ghost', 'leaveDungeon', null, 'Leave', { hidden: true });
    R.timerFill = h('span', { class: 'st-bar-fill' });
    R.timerBar = h('div', { class: 'st-bar', hidden: true, 'aria-hidden': 'true' }, R.timerFill);
    R.stage = h(
      'div',
      { class: 'stage' },
      R.stageIco,
      h('div', { class: 'st-title' }, R.stageFloor, R.stageSub),
      h('div', { class: 'st-mid' }, R.pipWrap, R.timerWrap),
      h('div', { class: 'st-actions' }, R.btnBoss, R.btnLeave),
      R.timerBar,
    );
    return R.stage;
  }

  // ---------------------------------------------------------------- battle canvas
  function buildBattle() {
    R.canvas = h('canvas', { id: 'battle-canvas', width: '360', height: '200', role: 'img', 'aria-label': 'Battle view. Tap the flying chest when it appears.' });
    R.ticker = h('div', { class: 'ticker', 'aria-hidden': 'true' });
    R.battle = h('div', { class: 'battle' }, R.canvas, R.ticker);
    return h('div', { class: 'battle-wrap' }, R.battle);
  }

  function buildHP() {
    R.hpTrail = h('span', { class: 'hp-trail' });
    R.hpFill = h('span', { class: 'hp-fill' });
    R.hpShield = h('span', { class: 'hp-shield' });
    R.hpText = h('span', { class: 'hp-text' });
    R.hp = h('div', { class: 'hpbar', role: 'progressbar', 'aria-label': 'Hero health', 'aria-valuemin': '0', 'aria-valuemax': '100' }, R.hpTrail, R.hpFill, R.hpShield, R.hpText);
    return R.hp;
  }

  // ---------------------------------------------------------------- skill bar
  function buildSkillbar() {
    R.sk = [];
    const wrap = h('div', { class: 'skills' });
    for (let i = 0; i < 4; i++) {
      const icon = ico('skill', 'ico-skill');
      const cd = h('span', { class: 'sk-cd' });
      const lockTxt = h('small', null, '');
      const lock = h('span', { class: 'sk-lock' }, ico('lock', 'ico-12', pix('lock')), lockTxt);
      const plus = h('span', { class: 'sk-plus', 'aria-hidden': 'true' });
      const key = h('span', { class: 'sk-key', 'aria-hidden': 'true' }, String(i + 1));
      const b = h('button', { type: 'button', class: 'skill is-empty', 'data-act': 'cast', 'data-arg': String(i), 'aria-label': 'Skill slot ' + (i + 1) }, icon, cd, lock, plus, key);
      R.sk.push({ b, icon, cd, lockTxt });
      wrap.appendChild(b);
    }
    R.autoBtn = h('button', { type: 'button', class: 'tgl tgl-auto', 'data-act': 'toggleAutoSkill', 'aria-pressed': 'true', title: 'Auto-cast skills' }, h('span', { class: 'led' }), h('b', null, 'AUTO'));
    R.speedTxt = h('b', null, '×1');
    R.speedBtn = h('button', { type: 'button', class: 'tgl tgl-speed', 'data-act': 'cycleSpeed', 'aria-label': 'Game speed ×1', title: 'Game speed' }, h('small', null, 'SPEED'), R.speedTxt);
    return h('div', { class: 'skillbar' }, wrap, h('div', { class: 'sb-toggles' }, R.autoBtn, R.speedBtn));
  }

  // ---------------------------------------------------------------- panels + tabs
  const PANEL_BUILDERS = {};
  const PANEL_UPDATERS = {};
  function buildPanels() {
    R.panels = h('main', { class: 'panels', id: 'dd-panels' });
    R.panel = {};
    for (const t of TABS) {
      const p = h('section', { class: 'panel panel-' + t.id, id: 'panel-' + t.id, role: 'tabpanel', 'aria-labelledby': 'tab-' + t.id, hidden: t.id !== curTab });
      R.panel[t.id] = p;
      try {
        PANEL_BUILDERS[t.id](p);
      } catch (err) {
        console.error('[DD.ui] building panel ' + t.id + ' failed', err);
      }
      R.panels.appendChild(p);
    }
    return R.panels;
  }

  function buildTabs() {
    R.tabs = {};
    const nav = h('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Panels' });
    for (const t of TABS) {
      const icon = ico(t.fb, 'ico-tab', t.icon());
      const dot = h('span', { class: 'dot', hidden: true });
      const b = h(
        'button',
        { type: 'button', class: 'tab', id: 'tab-' + t.id, role: 'tab', 'aria-selected': t.id === curTab ? 'true' : 'false', 'aria-controls': 'panel-' + t.id, 'data-act': 'tab', 'data-arg': t.id },
        icon,
        h('span', { class: 'tab-label' }, t.label),
        dot,
      );
      R.tabs[t.id] = { b, icon, dot };
      nav.appendChild(b);
    }
    return nav;
  }

  function buildOverlay() {
    R.dlgHost = h('div', { class: 'dlg-host' });
    R.overlay = h('div', { class: 'overlay', hidden: true }, h('div', { class: 'scrim', 'data-act': 'scrim' }), R.dlgHost);
    return R.overlay;
  }
  function buildToasts() {
    R.toasts = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    return R.toasts;
  }

  // ================================================================ panel: Loot
  PANEL_BUILDERS.loot = function (p) {
    const q = (R.q = {});
    q.ico = ico('scrolls', 'ico-32', icons.cur('scrolls'));
    q.text = h('div', { class: 'q-text' });
    q.reward = h('span', { class: 'q-reward' });
    q.fill = h('span', { class: 'bar-fill' });
    q.prog = h('span', { class: 'bar-text' });
    q.btn = btn('btn-primary btn-claim', 'claimQuest', null, 'Claim');
    q.card = h(
      'div',
      { class: 'quest card' },
      h('div', { class: 'q-art' }, q.ico),
      h('div', { class: 'q-body' }, h('div', { class: 'q-top' }, h('span', { class: 'eyebrow' }, 'Quest'), q.reward), q.text, h('div', { class: 'bar bar-q' }, q.fill, q.prog)),
      q.btn,
    );

    const c = (R.chest = {});
    c.img = ico('chest', 'ico-chest');
    c.count = h('b', { class: 'chest-count' }, '×0');
    c.label = h('span', { class: 'chest-label' }, 'Tap to open');
    c.btn = h(
      'button',
      { type: 'button', class: 'chest-btn', 'data-act': 'openChest', 'aria-label': 'Open a chest' },
      h('span', { class: 'chest-rays', 'aria-hidden': 'true' }),
      h('span', { class: 'chest-glow', 'aria-hidden': 'true' }),
      h('span', { class: 'chest-art' }, c.img, h('span', { class: 'chest-shine', 'aria-hidden': 'true' })),
      h('span', { class: 'chest-info' }, c.count, c.label),
    );
    c.lvNum = h('b', null, '1');
    c.lvDot = h('span', { class: 'dot', hidden: true });
    c.lv = h('button', { type: 'button', class: 'chest-lv', 'data-act': 'chestSheet', 'aria-label': 'Chest level and drop odds' }, h('small', null, 'CHEST LV'), c.lvNum, c.lvDot);
    c.premCount = h('b', null, '0');
    c.prem = h(
      'button',
      { type: 'button', class: 'chest-prem', 'data-act': 'openPremium', hidden: true, 'aria-label': 'Open a premium chest' },
      ico('premium', 'ico-32', icons.cur('premium')),
      h('span', { class: 'prem-txt' }, h('small', null, 'PREMIUM'), c.premCount),
    );
    const stage = h('div', { class: 'chest-stage' }, c.btn, c.lv, c.prem);

    c.autoOpen = h(
      'button',
      { type: 'button', class: 'switch-btn', 'data-act': 'toggleAutoOpen', role: 'switch', 'aria-checked': 'false' },
      h('span', { class: 'switch', 'aria-hidden': 'true' }),
      h('span', { class: 'switch-label' }, 'Auto-open'),
    );
    c.autoLoot = btn('btn-sm', 'autoLootSheet', null, [ico('gear', 'ico-12', pix('gear')), h('span', null, 'Auto-loot')]);
    c.upCost = h('b', null, '0');
    c.upLbl = h('span', { class: 'btn-top' }, 'Upgrade');
    c.up = btn('btn-sm btn-stack btn-up', 'chestSheet', null, [c.upLbl, h('span', { class: 'btn-sub' }, ico('gold', 'ico-16', icons.cur('gold')), c.upCost)], { 'aria-label': 'Upgrade chest level' });
    const controls = h('div', { class: 'loot-controls' }, c.autoOpen, c.autoLoot, c.up);

    R.log = h('ul', { class: 'loot-log' });
    R.logEmpty = h('p', { class: 'muted small log-empty' }, 'Open chests to find gear. Better gear raises your Combat Power.');
    add(p, [q.card, stage, controls, h('div', { class: 'sec-title' }, h('span', null, 'Recent loot')), R.logEmpty, R.log]);
  };

  PANEL_UPDATERS.loot = function () {
    const s = S();
    if (!s) return;
    const q = R.q;
    const quest = st('currentQuest');
    setHidden(q.card, !quest);
    if (quest) {
      const target = Math.max(1, num(quest.target, 1));
      const prog = clamp(num(quest.progress, 0), 0, target);
      setText(q.text, quest.text || '');
      setText(q.reward, quest.rewardText || '');
      setVar(q.fill, '--p', (prog / target).toFixed(4));
      setText(q.prog, fmt(prog) + ' / ' + fmt(target));
      setCls(q.card, 'is-done', !!quest.done);
      setHidden(q.btn, !quest.done);
    }

    const c = R.chest;
    const pending = !!s.pendingItem;
    const chests = Math.max(0, Math.floor(num(s.chests, 0)));
    setIco(c.img, icons.chest(s.chestLevel));
    setText(c.count, '×' + fmt(chests));
    let label = 'Tap to open';
    if (pending) label = 'New loot waiting';
    else if (s.autoOpen) label = 'Auto-opening…';
    else if (chests < 1) label = 'Defeat enemies for chests';
    setText(c.label, label);
    setCls(c.btn, 'is-empty', chests < 1 && !pending);
    setCls(c.btn, 'is-pending', pending);
    setCls(c.btn, 'is-auto', !!s.autoOpen && !pending);
    setAttr(c.btn, 'aria-label', pending ? 'Review the new item' : 'Open a chest (' + chests + ' left)');

    const lv = Math.floor(num(s.chestLevel, 1));
    const cost = st('chestUpgradeCost');
    const maxed = lv >= maxChestLevel() || !isNum(cost);
    const afford = !maxed && num(s.gold, 0) >= cost;
    setText(c.lvNum, String(lv));
    setHidden(c.lvDot, !afford);
    setText(c.upCost, maxed ? 'MAX' : fmt(cost));
    setText(c.upLbl, maxed ? 'Chest' : 'Lv ' + (lv + 1));
    setCls(c.up, 'is-afford', afford);
    setCls(c.up, 'is-max', maxed);

    const prem = Math.floor(num(s.premiumChests, 0));
    setHidden(c.prem, prem < 1);
    setText(c.premCount, '×' + fmt(prem));

    setAttr(c.autoOpen, 'aria-checked', s.autoOpen ? 'true' : 'false');

    if (logDirty) renderLog();
  };

  function renderLog() {
    logDirty = false;
    R.log.innerHTML = '';
    setHidden(R.logEmpty, lootLog.length > 0);
    for (const e of lootLog) {
      const r = rIdx(e.item.rarity);
      const right =
        e.kind === 'sold'
          ? h('span', { class: 'll-val gold' }, '+' + fmt(e.gold), ico('gold', 'ico-16', icons.cur('gold')))
          : h('span', { class: 'll-val ' + (e.cp > 0 ? 'up' : e.cp < 0 ? 'down' : '') }, e.cp > 0 ? '▲ +' + fmt(e.cp) + ' CP' : e.cp < 0 ? '▼ -' + fmt(-e.cp) + ' CP' : 'Equipped');
      const li = h(
        'li',
        { class: 'll r' + r + (e.fresh ? ' is-new' : '') },
        h('span', { class: 'll-ico' }, ico('item', 'ico-24', icons.item(e.item))),
        h('span', { class: 'll-txt' }, h('small', null, e.kind === 'sold' ? 'Sold' : 'Equipped'), h('span', { class: 'll-name' }, rarity(r).name + ' ' + e.item.name)),
        right,
      );
      R.log.appendChild(li);
      e.fresh = false; // only a newly added row animates in; the rest just re-render in place
    }
  }

  // ================================================================ panel: Hero
  const HERO_STATS = [
    ['atk', 'ATK', (v) => fmt(v), 'Damage per hit'],
    ['hp', 'HP', (v) => fmt(v), 'Maximum health'],
    ['atkSpeed', 'ATK SPD', (v) => num(v, 1).toFixed(2) + '/s', 'Attacks per second'],
    ['critChance', 'Crit', (v) => fmtPct(v, 1), 'Chance to land a critical hit'],
    ['critDmg', 'Crit DMG', (v) => fmtPct(v, 0), 'Damage dealt by critical hits'],
    ['combo', 'Combo', (v) => fmtPct(v, 1), 'Chance to strike again immediately'],
    ['counter', 'Counter', (v) => fmtPct(v, 1), 'Chance to strike back when hit'],
    ['dodge', 'Dodge', (v) => fmtPct(v, 1), 'Chance to avoid an attack'],
    ['stun', 'Stun', (v) => fmtPct(v, 1), 'Chance per hit to stun the target'],
    ['lifesteal', 'Lifesteal', (v) => fmtPct(v, 1), 'Share of damage dealt healed back'],
    ['regen', 'Regen', (v) => fmtPct(v, 2) + '/s', 'Max HP regenerated per second'],
    ['skillDmg', 'Skill DMG', (v) => '+' + fmtPct(v, 1), 'Bonus skill damage'],
    ['bossDmg', 'Boss DMG', (v) => '+' + fmtPct(v, 1), 'Bonus damage against bosses'],
    ['goldBonus', 'Gold Bonus', (v) => '+' + fmtPct(v, 1), 'Bonus gold from every source'],
    ['chestChance', 'Chest Chance', (v) => fmtPct(v, 1), 'Chance an enemy drops a chest'],
  ];

  PANEL_BUILDERS.hero = function (p) {
    const H = (R.hero = { slots: {}, stats: {} });
    const left = h('div', { class: 'doll-col' });
    const right = h('div', { class: 'doll-col' });
    slots().forEach((slot, i) => {
      const icon = ico('slot', 'ico-slot', icons.slot(slot));
      const lvl = h('span', { class: 'slot-ilvl' });
      const b = h(
        'button',
        { type: 'button', class: 'slot rnone', 'data-act': 'slot', 'data-arg': slot, 'aria-label': slotName(slot) },
        h('span', { class: 'slot-box' }, icon, lvl),
        h('span', { class: 'slot-name' }, slotName(slot)),
      );
      b._r = 'rnone';
      H.slots[slot] = { b, icon, lvl };
      (i < 4 ? left : right).appendChild(b);
    });
    H.portrait = ico('hero', 'ico-hero-big');
    H.level = h('b', { class: 'doll-lv' }, 'Lv 1');
    H.cp = h('b', { class: 'doll-cp-val' }, '0');
    H.best = h('span', { class: 'doll-best' });
    const center = h(
      'div',
      { class: 'doll-center' },
      h('div', { class: 'doll-plinth' }, H.portrait),
      H.level,
      h('div', { class: 'doll-cp' }, ico('cp', 'ico-16', icons.cur('cp')), H.cp, h('small', null, 'CP')),
      H.best,
    );
    const doll = h('div', { class: 'doll card' }, left, center, right);
    const grid = h('dl', { class: 'statgrid' });
    for (const [k, label, , tip] of HERO_STATS) {
      const dd = h('dd', null, '0');
      grid.appendChild(h('div', { class: 'stat', title: tip }, h('dt', null, label), dd));
      H.stats[k] = dd;
    }
    add(p, [doll, h('div', { class: 'sec-title' }, h('span', null, 'Hero stats')), h('div', { class: 'card card-flat' }, grid), h('p', { class: 'muted small hint' }, 'Tap a slot to inspect your gear. Open chests on the Loot tab to find upgrades.')]);
  };

  PANEL_UPDATERS.hero = function () {
    const s = S();
    if (!s) return;
    const H = R.hero;
    const eq = s.equipped || {};
    for (const slot of slots()) {
      const ref = H.slots[slot];
      if (!ref) continue;
      const it = eq[slot];
      if (it) {
        setIco(ref.icon, icons.item(it), 'item');
        setText(ref.lvl, 'iLv' + Math.floor(num(it.ilvl, 1)));
        setRar(ref.b, it.rarity);
        setAttr(ref.b, 'aria-label', slotName(slot) + ': ' + rarity(it.rarity).name + ' ' + it.name);
      } else {
        setIco(ref.icon, icons.slot(slot), 'slot');
        setText(ref.lvl, '');
        setRar(ref.b, -1);
        setAttr(ref.b, 'aria-label', slotName(slot) + ': empty');
      }
      setCls(ref.b, 'is-empty', !it);
    }
    setIco(H.portrait, icons.portrait(heroLook(s)));
    setText(H.level, 'Lv ' + Math.floor(num(s.hero && s.hero.level, 1)));
    setText(H.cp, fmt(st('getPower')));
    setText(H.best, 'Best floor ' + Math.floor(num(s.campaign && s.campaign.highestFloor, 1)));
    const stats = st('getHeroStats') || {};
    for (const [k, , f] of HERO_STATS) setText(H.stats[k], f(num(stats[k], 0)));
  };

  // ================================================================ panel: Skills
  PANEL_BUILDERS.skills = function (p) {
    const K = (R.skills = { cards: {}, load: [] });
    K.scrolls = h('b', null, '0');
    K.slotsTxt = h('span', { class: 'muted small' });
    const load = h('div', { class: 'loadout', 'aria-label': 'Equipped skills' });
    for (let i = 0; i < 4; i++) {
      const icon = ico('skill', 'ico-24');
      const cap = h('small', null, String(i + 1));
      const el = h('div', { class: 'ld-slot' }, icon, cap);
      K.load.push({ el, icon, cap });
      load.appendChild(el);
    }
    const head = h(
      'div',
      { class: 'panel-head' },
      h('div', { class: 'ph-left' }, h('div', { class: 'ph-title' }, 'Skills'), K.slotsTxt),
      h('div', { class: 'pill pill-big', title: 'Skill Scrolls' }, ico('scrolls', 'ico-16', icons.cur('scrolls')), K.scrolls),
    );
    add(p, [head, load]);
    for (const id of skillIds()) {
      const card = buildUpgradeCard('skill', id);
      K.cards[id] = card;
      p.appendChild(card.el);
    }
  };

  // Shared card for skills and allies.
  function buildUpgradeCard(kind, id) {
    const def = kind === 'skill' ? skillDef(id) : allyDef(id);
    const c = { kind, id };
    c.icon = ico(kind, kind === 'skill' ? 'ico-48' : 'ico-64', kind === 'skill' ? icons.skill(id) : icons.ally(id));
    c.lockMark = h('span', { class: 'lock-mark' }, ico('lock', 'ico-12', pix('lock')));
    c.name = h('b', { class: 'uc-name' }, def.name || id);
    c.rar = h('span', { class: 'rtag r' + rIdx(def.rarity) }, rarity(def.rarity).name);
    c.level = h('span', { class: 'uc-level' });
    c.desc = h('p', { class: 'uc-desc' });
    c.meta = h('span', { class: 'uc-meta' });
    c.eqTag = h('span', { class: 'tag tag-eq', hidden: true });
    c.reason = h('p', { class: 'uc-reason', hidden: true });
    c.mainLbl = h('span', null, 'Unlock');
    c.mainIco = ico(kind === 'skill' ? 'scrolls' : 'gems', 'ico-16');
    c.mainCost = h('b', null, '0');
    c.main = btn('btn-sm btn-primary uc-main', kind + 'Main', id, [c.mainLbl, c.mainIco, c.mainCost]);
    c.equip = btn('btn-sm uc-equip', kind + 'Equip', id, 'Equip');
    c.unequip = btn('btn-sm btn-ghost uc-unequip', kind + 'Unequip', id, 'Unequip', { hidden: true });
    c.chooser = h('div', { class: 'chooser', hidden: true }, h('span', { class: 'chooser-lbl' }, 'Equip to slot'));
    c.choose = [];
    const nSlots = kind === 'skill' ? 4 : 2;
    for (let i = 0; i < nSlots; i++) {
      const icon = ico(kind, kind === 'skill' ? 'ico-48' : 'ico-32');
      const b = h('button', { type: 'button', class: 'ch-slot', 'data-act': kind + 'EquipTo', 'data-arg': id, 'data-arg2': String(i), 'aria-label': 'Slot ' + (i + 1) }, h('small', null, String(i + 1)), icon);
      c.choose.push({ b, icon });
      c.chooser.appendChild(b);
    }
    c.chooser.appendChild(btn('btn-sm btn-ghost ch-cancel', 'chooserClose', null, 'Cancel'));
    c.el = h(
      'article',
      { class: 'card uc uc-' + kind, 'data-id': id },
      h('div', { class: 'uc-art' }, c.icon, c.lockMark),
      h('div', { class: 'uc-body' }, h('div', { class: 'uc-title' }, c.name, c.rar, c.level), c.desc, h('div', { class: 'uc-metarow' }, c.meta, c.eqTag), c.reason),
      h('div', { class: 'uc-actions' }, c.unequip, c.equip, c.main),
      c.chooser,
    );
    return c;
  }

  function updateUpgradeCard(c, o) {
    // o: { owned, level, max, desc, meta, mainLabel, cost, costIco, afford, reason, slotIdx, slotsN, slotFloors, equippedIds, iconFn }
    setCls(c.el, 'is-locked', !o.owned);
    setCls(c.el, 'is-equipped', o.slotIdx >= 0);
    setHidden(c.lockMark, o.owned);
    setText(c.level, o.owned ? 'Lv ' + o.level + '/' + o.max : 'Locked');
    setText(c.desc, o.desc);
    setText(c.meta, o.meta);
    setHidden(c.eqTag, o.slotIdx < 0);
    setText(c.eqTag, 'Slot ' + (o.slotIdx + 1));
    // main button (unlock / upgrade / max)
    setText(c.mainLbl, o.mainLabel);
    setHidden(c.mainIco, !isNum(o.cost));
    setIco(c.mainIco, icons.cur(o.costIco), o.costIco);
    setText(c.mainCost, isNum(o.cost) ? fmt(o.cost) : '');
    setAvail(c.main, o.afford, o.reason);
    setCls(c.main, 'btn-primary', o.afford);
    setCls(c.main, 'is-max', !isNum(o.cost) && o.owned);
    // reason line under the description
    const showReason = !o.afford && !!o.reason;
    setHidden(c.reason, !showReason);
    setText(c.reason, showReason ? o.reason : '');
    // equip / unequip
    const canEquip = o.owned && o.slotIdx < 0;
    setHidden(c.equip, !canEquip);
    setHidden(c.unequip, !(o.owned && o.slotIdx >= 0));
    if (canEquip) setAvail(c.equip, o.slotsN > 0, o.slotsN > 0 ? null : 'Slot unlocks at floor ' + o.slotFloors[0]);
    // chooser
    const open = !!(chooser && chooser.kind === c.kind && chooser.id === c.id && canEquip && o.slotsN > 1);
    setHidden(c.chooser, !open);
    if (open) {
      c.choose.forEach((ch, i) => {
        const occ = o.equippedIds[i];
        const locked = i >= o.slotsN;
        setIco(ch.icon, occ ? o.iconFn(occ) : locked ? pix('lock') : '', occ ? c.kind : locked ? 'lock' : 'empty');
        setCls(ch.b, 'is-empty', !occ && !locked);
        setAvail(ch.b, !locked, locked ? 'Slot ' + (i + 1) + ' unlocks at floor ' + o.slotFloors[i] : null);
        setAttr(ch.b, 'aria-label', 'Slot ' + (i + 1) + (locked ? ' (locked)' : occ ? ' (replace ' + (c.kind === 'skill' ? skillDef(occ) : allyDef(occ)).name + ')' : ' (empty)'));
      });
    }
  }

  PANEL_UPDATERS.skills = function () {
    const s = S();
    if (!s || !s.skills) return;
    const K = R.skills;
    const owned = s.skills.owned || {};
    const eq = Array.isArray(s.skills.equipped) ? s.skills.equipped : [];
    const slotsN = clamp(Math.floor(num(st('skillSlotsUnlocked'), 1)), 0, 4);
    const floors = skillSlotFloors();
    const scrolls = Math.floor(num(s.scrolls, 0));
    setText(K.scrolls, fmt(scrolls));
    const nextFloor = floors[slotsN];
    setText(K.slotsTxt, 'Slots ' + slotsN + '/4' + (isNum(nextFloor) ? ' · next at floor ' + nextFloor : ''));
    K.load.forEach((l, i) => {
      const id = eq[i];
      const locked = i >= slotsN;
      setIco(l.icon, id ? icons.skill(id) : locked ? pix('lock') : '', id ? 'skill' : locked ? 'lock' : 'empty');
      setCls(l.el, 'is-locked', locked);
      setCls(l.el, 'is-empty', !id && !locked);
      setText(l.cap, locked ? 'F' + floors[i] : id ? String(i + 1) : 'Empty');
    });
    const max = maxSkillLevel();
    for (const id of skillIds()) {
      const c = K.cards[id];
      if (!c) continue;
      const def = skillDef(id);
      const L = Math.floor(num(owned[id], 0));
      const cost = st('skillCost', id) || {};
      let mainLabel;
      let price;
      let afford;
      let reason = null;
      if (!L) {
        mainLabel = 'Unlock';
        price = num(cost.unlock, num(def.unlock, 0));
        afford = scrolls >= price;
        if (!afford) reason = 'Need ' + fmt(price - scrolls) + ' more Skill Scrolls';
      } else if (L >= max || !isNum(cost.upgrade)) {
        mainLabel = 'Max level';
        price = null;
        afford = false;
        reason = 'Fully upgraded';
      } else {
        mainLabel = 'Upgrade';
        price = cost.upgrade;
        afford = scrolls >= price;
        if (!afford) reason = 'Need ' + fmt(price - scrolls) + ' more Skill Scrolls';
      }
      const cd = num(def.cd, num(def.cooldown, 0));
      updateUpgradeCard(c, {
        owned: L > 0,
        level: L,
        max,
        desc: dt_('skillDesc', id, Math.max(1, L)) || def.flavor || '',
        meta: (cd ? 'Cooldown ' + cd + 's' : '') + (L ? '' : ' · Unlock with ' + fmt(num(def.unlock, 0)) + ' scrolls'),
        mainLabel,
        cost: price,
        costIco: 'scrolls',
        afford,
        reason: L >= max ? null : reason,
        slotIdx: eq.indexOf(id),
        slotsN,
        slotFloors: floors,
        equippedIds: eq,
        iconFn: icons.skill,
      });
    }
  };

  // ================================================================ panel: Allies
  PANEL_BUILDERS.allies = function (p) {
    const A = (R.allies = { cards: {}, load: [] });
    A.gems = h('b', null, '0');
    A.gold = h('b', null, '0');
    A.slotsTxt = h('span', { class: 'muted small' });
    const load = h('div', { class: 'loadout loadout-2', 'aria-label': 'Allies in your party' });
    for (let i = 0; i < 2; i++) {
      const icon = ico('ally', 'ico-32');
      const cap = h('small', null, String(i + 1));
      const el = h('div', { class: 'ld-slot' }, icon, cap);
      A.load.push({ el, icon, cap });
      load.appendChild(el);
    }
    const head = h(
      'div',
      { class: 'panel-head' },
      h('div', { class: 'ph-left' }, h('div', { class: 'ph-title' }, 'Allies'), A.slotsTxt),
      h(
        'div',
        { class: 'ph-pills' },
        h('div', { class: 'pill pill-big', title: 'Gems' }, ico('gems', 'ico-16', icons.cur('gems')), A.gems),
        h('div', { class: 'pill pill-big', title: 'Gold' }, ico('gold', 'ico-16', icons.cur('gold')), A.gold),
      ),
    );
    add(p, [head, load, h('p', { class: 'muted small hint' }, 'Allies fight beside you and never take damage. Recruit with gems, train with gold.')]);
    for (const id of allyIds()) {
      const card = buildUpgradeCard('ally', id);
      A.cards[id] = card;
      p.appendChild(card.el);
    }
  };

  PANEL_UPDATERS.allies = function () {
    const s = S();
    if (!s || !s.allies) return;
    const A = R.allies;
    const owned = s.allies.owned || {};
    const eq = Array.isArray(s.allies.equipped) ? s.allies.equipped : [];
    const slotsN = clamp(Math.floor(num(st('allySlotsUnlocked'), 0)), 0, 2);
    const floors = allySlotFloors();
    const gems = Math.floor(num(s.gems, 0));
    const gold = num(s.gold, 0);
    setText(A.gems, fmt(gems));
    setText(A.gold, fmt(gold));
    const nextFloor = floors[slotsN];
    setText(A.slotsTxt, 'Party ' + slotsN + '/2' + (isNum(nextFloor) ? ' · next slot at floor ' + nextFloor : ''));
    A.load.forEach((l, i) => {
      const id = eq[i];
      const locked = i >= slotsN;
      setIco(l.icon, id ? icons.ally(id) : locked ? pix('lock') : '', id ? 'ally' : locked ? 'lock' : 'empty');
      setCls(l.el, 'is-locked', locked);
      setCls(l.el, 'is-empty', !id && !locked);
      setText(l.cap, locked ? 'Floor ' + floors[i] : id ? allyDef(id).name : 'Empty slot');
    });
    const max = maxAllyLevel();
    for (const id of allyIds()) {
      const c = A.cards[id];
      if (!c) continue;
      const def = allyDef(id);
      const L = Math.floor(num(owned[id], 0));
      let mainLabel;
      let price;
      let afford;
      let reason = null;
      let costIco;
      if (!L) {
        mainLabel = 'Recruit';
        price = num(def.unlock, 0);
        costIco = 'gems';
        afford = gems >= price;
        if (!afford) reason = 'Need ' + fmt(price - gems) + ' more gems';
      } else if (L >= max) {
        mainLabel = 'Max level';
        price = null;
        costIco = 'gold';
        afford = false;
      } else {
        mainLabel = 'Train';
        price = num(st('allyUpgradeCost', id), Infinity);
        costIco = 'gold';
        if (!isNum(price)) {
          price = null;
          afford = false;
          mainLabel = 'Max level';
        } else {
          afford = gold >= price;
          if (!afford) reason = 'Need ' + fmt(price - gold) + ' more gold';
        }
      }
      const slotIdx = eq.indexOf(id);
      let meta = L ? (slotIdx >= 0 ? 'Fighting at your side' : 'Resting in camp') : 'Recruit for ' + fmt(num(def.unlock, 0)) + ' gems';
      if (L && slotsN === 0) meta = 'Party slot unlocks at floor ' + floors[0];
      updateUpgradeCard(c, {
        owned: L > 0,
        level: L,
        max,
        desc: dt_('allyDesc', id, Math.max(1, L)) || def.flavor || '',
        meta,
        mainLabel,
        cost: price,
        costIco,
        afford,
        reason,
        slotIdx,
        slotsN,
        slotFloors: floors,
        equippedIds: eq,
        iconFn: icons.ally,
      });
    }
  };

  // ================================================================ panel: Dungeons
  PANEL_BUILDERS.dungeons = function (p) {
    const G = (R.dg = { cards: {}, keys: [] });
    const keyRow = h('div', { class: 'keyrow', 'aria-hidden': 'true' });
    for (let i = 0; i < maxKeys(); i++) {
      const k = ico('keys', 'ico-16', icons.cur('keys'));
      G.keys.push(k);
      keyRow.appendChild(k);
    }
    G.keyCount = h('b', { class: 'key-count' }, '0/5');
    G.keyTimer = h('span', { class: 'key-timer muted small' });
    const head = h(
      'div',
      { class: 'panel-head' },
      h('div', { class: 'ph-left' }, h('div', { class: 'ph-title' }, 'Boss Dungeons'), G.keyTimer),
      h('div', { class: 'keybox' }, keyRow, G.keyCount),
    );
    add(p, [head]);
    for (const id of dungeonIds()) {
      const def = dungeonDef(id);
      const c = { id };
      c.icon = ico('dungeon', 'ico-64', icons.dungeon(id));
      c.lockMark = h('span', { class: 'lock-mark lock-big' }, ico('lock', 'ico-24', pix('lock')), h('small', null, 'F' + num(def.unlockFloor, 1)));
      c.level = h('span', { class: 'dg-lv' }, 'Lv 1');
      c.desc = h('p', { class: 'uc-desc' }, dt_('dungeonDesc', id) || '');
      c.reward = h('span', { class: 'dg-reward' });
      c.power = h('span', { class: 'dg-power muted small' });
      c.reason = h('p', { class: 'uc-reason', hidden: true });
      c.enterLbl = h('span', null, 'Enter');
      c.enterCost = h('span', { class: 'btn-sub' }, ico('keys', 'ico-16', icons.cur('keys')), h('b', null, '1'));
      c.enterLock = ico('lock', 'ico-12', pix('lock'));
      c.enter = btn('btn-primary dg-enter', 'enterDungeon', id, [c.enterLock, c.enterLbl, c.enterCost]);
      c.leave = btn('btn-ghost dg-leave', 'leaveDungeon', null, 'Leave', { hidden: true });
      c.el = h(
        'article',
        { class: 'card dg', 'data-id': id, style: '--dg:' + (def.color || '#ffb547') },
        h('div', { class: 'dg-art' }, c.icon, c.lockMark),
        h(
          'div',
          { class: 'dg-body' },
          h('div', { class: 'uc-title' }, h('b', { class: 'uc-name' }, def.name || id), c.level),
          c.desc,
          h('div', { class: 'dg-rewards' }, h('small', null, 'Next win'), c.reward),
          c.power,
          c.reason,
        ),
        h('div', { class: 'dg-actions' }, c.leave, c.enter),
      );
      G.cards[id] = c;
      p.appendChild(c.el);
    }
    p.appendChild(h('p', { class: 'muted small hint' }, 'Each run costs 1 key. Keys regenerate every 30 minutes, even while you are away. Winning raises the dungeon level and its rewards.'));
  };

  PANEL_UPDATERS.dungeons = function () {
    const s = S();
    if (!s) return;
    const G = R.dg;
    const keys = Math.floor(num(s.keys, 0));
    const mk = maxKeys();
    G.keys.forEach((k, i) => setCls(k, 'is-off', i >= keys));
    setText(G.keyCount, keys + '/' + mk);
    const b = BT();
    const inDungeon = !!(b && b.mode === 'dungeon' && b.dungeon);
    const activeId = inDungeon ? b.dungeon.id : null;
    const hf = Math.floor(num(s.campaign && s.campaign.highestFloor, 1));
    for (const id of dungeonIds()) {
      const c = G.cards[id];
      if (!c) continue;
      const def = dungeonDef(id);
      const dl = s.dungeons && s.dungeons[id];
      const level = Math.max(1, Math.floor(num(dl && dl.level, 1)));
      const unlockFloor = Math.floor(num(def.unlockFloor, 1));
      const unlocked = hf >= unlockFloor;
      setCls(c.el, 'is-locked', !unlocked);
      setCls(c.el, 'is-active', activeId === id);
      setHidden(c.lockMark, unlocked);
      setText(c.level, 'Lv ' + level);
      const rw = dt_('dungeonRewards', id, level);
      setText(c.reward, (rw && dt_('rewardText', rw)) || def.rewardName || '');
      const ef = dt_('dungeonFloor', level);
      setText(c.power, unlocked ? 'Enemy strength ≈ floor ' + fmt(num(ef, 2 + level * 3)) : 'Unlocks at floor ' + unlockFloor);
      let ok = true;
      let reason = null;
      if (!unlocked) {
        ok = false;
        reason = 'Reach floor ' + unlockFloor + ' to unlock';
      } else if (inDungeon) {
        ok = false;
        reason = activeId === id ? 'Run in progress' : 'Finish the current dungeon first';
      } else if (keys < 1) {
        ok = false;
        reason = 'No keys left. Next key in ' + fmtTime(num(st('keyRegenRemaining'), keyRegenFallback(s)));
      }
      setAvail(c.enter, ok, reason);
      setCls(c.enter, 'btn-primary', ok);
      setText(c.enterLbl, unlocked ? 'Enter' : 'Floor ' + unlockFloor);
      setHidden(c.enterCost, !unlocked);
      setHidden(c.enterLock, unlocked);
      setHidden(c.enter, activeId === id);
      setHidden(c.leave, activeId !== id);
      const showReason = !ok && !!reason && activeId !== id && unlocked;
      setHidden(c.reason, !showReason);
      setText(c.reason, showReason ? reason : '');
    }
  };

  function keyRegenFallback(s) {
    const at = num(s && s.keyRegenAt, 0);
    return at > 0 ? Math.max(0, (at - Date.now()) / 1000) : 0;
  }

  // ================================================================ panel: Mastery
  PANEL_BUILDERS.mastery = function (p) {
    const M = (R.ms = { rows: {} });
    M.gems = h('b', null, '0');
    const head = h(
      'div',
      { class: 'panel-head' },
      h('div', { class: 'ph-left' }, h('div', { class: 'ph-title' }, 'Mastery'), h('span', { class: 'muted small' }, 'Permanent bonuses bought with gems')),
      h('div', { class: 'ph-pills' }, h('div', { class: 'pill pill-big', title: 'Gems' }, ico('gems', 'ico-16', icons.cur('gems')), M.gems), btn('btn-sm btn-icon', 'settings', null, [ico('gear', 'ico-24', pix('gear')), h('span', { class: 'sr-only' }, 'Settings')], { 'aria-label': 'Settings', title: 'Settings' })),
    );
    add(p, [head]);
    for (const id of masteryIds()) {
      const def = masteryDef(id);
      const r = { id };
      r.icon = ico('mastery', 'ico-32', MASTERY_ICON[id] ? MASTERY_ICON[id]() : '');
      r.level = h('span', { class: 'uc-level' });
      r.now = h('span', { class: 'ms-now' });
      r.next = h('span', { class: 'ms-next' });
      r.fill = h('span', { class: 'bar-fill' });
      r.cost = h('b', null, '0');
      r.btn = btn('btn-sm btn-primary btn-stack ms-btn', 'masteryUp', id, [h('span', { class: 'btn-top' }, 'Upgrade'), h('span', { class: 'btn-sub' }, ico('gems', 'ico-16', icons.cur('gems')), r.cost)]);
      r.el = h(
        'article',
        { class: 'card ms', 'data-id': id },
        h('div', { class: 'ms-art' }, r.icon),
        h(
          'div',
          { class: 'ms-body' },
          h('div', { class: 'uc-title' }, h('b', { class: 'uc-name' }, def.name || id), r.level),
          h('div', { class: 'ms-effect' }, r.now, r.next),
          h('div', { class: 'bar bar-ms' }, r.fill),
          h('p', { class: 'ms-flavor muted small' }, def.flavor || ''),
        ),
        r.btn,
      );
      M.rows[id] = r;
      p.appendChild(r.el);
    }
    p.appendChild(
      h(
        'button',
        { type: 'button', class: 'card settings-row', 'data-act': 'settings' },
        ico('gear', 'ico-24', pix('gear')),
        h('span', { class: 'sr-body' }, h('b', null, 'Settings & save'), h('small', { class: 'muted' }, 'Sound, export / import, reset')),
        h('span', { class: 'chev', 'aria-hidden': 'true' }),
      ),
    );
    p.appendChild(h('p', { class: 'credits' }, 'Fan-made tribute to Dungeon Rush by Lava Labs. Not affiliated.'));
  };

  PANEL_UPDATERS.mastery = function () {
    const s = S();
    if (!s) return;
    const M = R.ms;
    const gems = Math.floor(num(s.gems, 0));
    setText(M.gems, fmt(gems));
    for (const id of masteryIds()) {
      const r = M.rows[id];
      if (!r) continue;
      const def = masteryDef(id);
      const L = Math.floor(num(s.mastery && s.mastery[id], 0));
      const max = Math.max(1, Math.floor(num(def.max, 1)));
      const maxed = L >= max;
      const cost = num(st('masteryCost', id), Infinity);
      setText(r.level, 'Lv ' + L + '/' + max);
      setText(r.now, dt_('masteryDesc', id, L) || '');
      setText(r.next, maxed ? 'Mastered' : '→ ' + (dt_('masteryDesc', id, L + 1) || ''));
      setVar(r.fill, '--p', (L / max).toFixed(4));
      const ok = !maxed && isNum(cost) && gems >= cost;
      setText(r.cost, maxed || !isNum(cost) ? 'MAX' : fmt(cost));
      setAvail(r.btn, ok, maxed ? 'Fully mastered' : 'Need ' + fmt(num(cost, 0) - gems) + ' more gems');
      setCls(r.btn, 'btn-primary', ok);
      setCls(r.el, 'is-max', maxed);
    }
  };

  // ================================================================ HUD + badges
  function updateHUD() {
    const s = S();
    if (!s) return;
    const lvl = Math.floor(num(s.hero && s.hero.level, 1));
    setText(R.lvBadge, String(lvl));
    setIco(R.portrait, icons.portrait(heroLook(s)));
    const need = Math.max(1, num(st('xpToNext'), 1));
    const xp = clamp(num(s.hero && s.hero.xp, 0) / need, 0, 1);
    setVar(R.xpFill, '--p', xp.toFixed(4));
    setText(R.xpText, 'Lv ' + lvl + ' · ' + Math.floor(xp * 100) + '%');
    setAttr(R.xpBar, 'aria-valuenow', Math.floor(xp * 100));
    const power = num(st('getPower'), 0);
    setText(R.cpVal, fmt(power));
    if (lastPower >= 0 && power > lastPower) restartAnim(R.cpVal, 'bump', 500);
    lastPower = power;
    if (lastLevel >= 0 && lvl > lastLevel) restartAnim(R.lvBadge, 'bump', 700);
    lastLevel = lvl;
    setText(R.pill.gold.val, fmt(s.gold));
    setText(R.pill.gems.val, fmt(s.gems));
    setText(R.pill.keys.val, Math.floor(num(s.keys, 0)) + '/' + maxKeys());
    setText(R.pill.scrolls.val, fmt(s.scrolls));
    // hero tab icon follows gear
    const t = R.tabs.hero;
    if (t) setIco(t.icon, icons.portrait(heroLook(s)));
  }

  function computeBadges() {
    const s = S();
    const out = { loot: false, hero: false, skills: false, allies: false, dungeons: false, mastery: false };
    if (!s) return out;
    const q = st('currentQuest');
    const chestCost = st('chestUpgradeCost');
    out.loot = !!(q && q.done) || !!s.pendingItem || (isNum(chestCost) && num(s.gold, 0) >= chestCost);
    // skills
    const sk = s.skills || {};
    const owned = sk.owned || {};
    const scrolls = num(s.scrolls, 0);
    const skN = num(st('skillSlotsUnlocked'), 1);
    const skEq = Array.isArray(sk.equipped) ? sk.equipped : [];
    for (const id of skillIds()) {
      const c = st('skillCost', id) || {};
      if ((isNum(c.unlock) && scrolls >= c.unlock) || (isNum(c.upgrade) && scrolls >= c.upgrade)) out.skills = true;
    }
    if (!out.skills && skEq.some((x, i) => i < skN && !x) && Object.keys(owned).some((id) => skEq.indexOf(id) < 0)) out.skills = true;
    // allies
    const al = s.allies || {};
    const aOwned = al.owned || {};
    const gems = num(s.gems, 0);
    const gold = num(s.gold, 0);
    const aN = num(st('allySlotsUnlocked'), 0);
    const aEq = Array.isArray(al.equipped) ? al.equipped : [];
    for (const id of allyIds()) {
      const L = num(aOwned[id], 0);
      if (!L) {
        if (gems >= num(allyDef(id).unlock, Infinity)) out.allies = true;
      } else if (L < maxAllyLevel() && gold >= num(st('allyUpgradeCost', id), Infinity)) out.allies = true;
    }
    if (!out.allies && aEq.some((x, i) => i < aN && !x) && Object.keys(aOwned).some((id) => aEq.indexOf(id) < 0)) out.allies = true;
    // dungeons
    const b = BT();
    const inDungeon = !!(b && b.mode === 'dungeon');
    const hf = num(s.campaign && s.campaign.highestFloor, 1);
    out.dungeons = !inDungeon && num(s.keys, 0) >= 1 && dungeonIds().some((id) => hf >= num(dungeonDef(id).unlockFloor, 1));
    // mastery
    for (const id of masteryIds()) {
      const L = num(s.mastery && s.mastery[id], 0);
      const c = num(st('masteryCost', id), Infinity);
      if (L < num(masteryDef(id).max, 0) && gems >= c) out.mastery = true;
    }
    return out;
  }
  function updateBadges() {
    const b = computeBadges();
    for (const t of TABS) {
      const ref = R.tabs[t.id];
      if (ref) setHidden(ref.dot, !b[t.id] || t.id === curTab);
    }
  }

  // ================================================================ per-frame: stage, HP, skills
  function updateStage() {
    const b = BT();
    const s = S();
    const inDungeon = !!(b && b.mode === 'dungeon' && b.dungeon);
    setCls(root, 'in-dungeon', inDungeon);
    let timer = 0;
    let limit = 0;
    if (inDungeon) {
      const d = b.dungeon;
      const def = dungeonDef(d.id);
      setHidden(R.stageIco, false);
      setIco(R.stageIco, icons.dungeon(d.id));
      setText(R.stageFloor, def.name || 'Dungeon');
      const target = Math.floor(num(d.target, 1));
      const horde = target > 1;
      setText(R.stageSub, 'Lv ' + Math.floor(num(d.level, 1)) + (horde ? ' · ' + Math.floor(num(d.killed, 0)) + '/' + target + ' slain' : ' · Boss fight'));
      setHidden(R.pipWrap, true);
      setHidden(R.btnBoss, true);
      setCls(R.stage, 'is-farming', false);
      setHidden(R.btnLeave, false);
      timer = num(d.timer, num(b.bossTimer, 0));
      limit = num(d.timeLimit, num(b.bossTimeLimit, 0));
    } else {
      const floor = Math.max(1, Math.floor(num(b && b.floor, num(s && s.campaign && s.campaign.floor, 1))));
      const wave = Math.floor(num(b && b.wave, num(s && s.campaign && s.campaign.wave, 1)));
      const farming = !!(b ? b.farming : s && s.campaign && s.campaign.farming);
      const isBoss = !!(b && b.isBossWave);
      setHidden(R.stageIco, true);
      setText(R.stageFloor, 'Floor ' + floor);
      const biome = dt_('biomeForFloor', floor);
      const bname = biome && biome.name ? biome.name : '';
      setText(R.stageSub, farming && !isBoss ? 'Farming' + (bname ? ' · ' + bname : '') : bname);
      setCls(R.stage, 'is-farming', farming && !isBoss);
      setHidden(R.pipWrap, false);
      const n = R.pips.length;
      for (let i = 0; i < n; i++) {
        const w = i + 1;
        const state = w < wave ? 'done' : w === wave ? 'cur' : 'todo';
        if (R.pips[i]._st !== state) {
          R.pips[i]._st = state;
          R.pips[i].setAttribute('data-st', state);
        }
      }
      setAttr(R.pipWrap, 'aria-label', (isBoss ? 'Boss wave' : 'Wave ' + wave + ' of ' + n) + (farming ? ', farming' : ''));
      setCls(R.pipWrap, 'is-farming', farming);
      setHidden(R.btnBoss, !(farming && !isBoss));
      setHidden(R.btnLeave, true);
      if (isBoss) {
        timer = num(b.bossTimer, 0);
        limit = num(b.bossTimeLimit, 0);
      }
    }
    const showTimer = limit > 0;
    setHidden(R.timerWrap, !showTimer);
    setHidden(R.timerBar, !showTimer);
    setCls(R.stage, 'is-timed', showTimer);
    if (showTimer) {
      const ratio = clamp(timer / limit, 0, 1);
      setVar(R.timerFill, '--p', ratio.toFixed(4));
      setText(R.timerText, fmtTimer(timer));
      setCls(R.stage, 'is-low', timer <= 10);
    } else setCls(R.stage, 'is-low', false);
  }

  function updateHP(dt) {
    const b = BT();
    const hero = b && b.hero;
    if (!hero) return;
    const max = Math.max(1, num(hero.maxHp, 1));
    const hp = clamp(num(hero.hp, 0), 0, max);
    const shield = Math.max(0, num(hero.shield, 0));
    const ratio = hp / max;
    if (ratio >= hpTrail) {
      hpTrail = ratio;
      hpTrailHold = 0;
    } else {
      hpTrailHold += dt;
      if (hpTrailHold > 0.35) hpTrail = Math.max(ratio, hpTrail - dt * 0.9);
    }
    setVar(R.hpFill, '--p', ratio.toFixed(4));
    setVar(R.hpTrail, '--p', hpTrail.toFixed(4));
    const sr = clamp(shield / max, 0, 1);
    setVar(R.hpShield, '--p', sr.toFixed(4));
    setHidden(R.hpShield, sr <= 0);
    const dead = num(b.deadTimer, 0) > 0;
    setCls(R.hp, 'is-dead', dead);
    setCls(R.hp, 'is-low', !dead && ratio < 0.3);
    let txt;
    if (dead) txt = 'Reviving… ' + Math.max(0, num(b.deadTimer, 0)).toFixed(1) + 's';
    else txt = fmt(hp) + ' / ' + fmt(max) + (shield > 0 ? '  +' + fmt(shield) + ' shield' : '');
    setText(R.hpText, txt);
    setAttr(R.hp, 'aria-valuenow', Math.round(ratio * 100));
  }

  function updateSkillbar() {
    const b = BT();
    const s = S();
    const slotsArr = b && Array.isArray(b.skillSlots) ? b.skillSlots : [];
    const eq = s && s.skills && Array.isArray(s.skills.equipped) ? s.skills.equipped : [];
    const unlocked = clamp(Math.floor(num(st('skillSlotsUnlocked'), 1)), 0, 4);
    const floors = skillSlotFloors();
    for (let i = 0; i < 4; i++) {
      const ref = R.sk[i];
      const sl = slotsArr[i] || {};
      const locked = i >= unlocked;
      const id = locked ? null : sl.id || eq[i] || null;
      const cd = Math.max(0, num(sl.cd, 0));
      const total = Math.max(0, num(sl.cdTotal, 0));
      const onCd = !!id && cd > 0.02;
      setCls(ref.b, 'is-locked', locked);
      setCls(ref.b, 'is-empty', !locked && !id);
      setCls(ref.b, 'is-cd', onCd);
      setCls(ref.b, 'is-ready', !!id && !onCd);
      setIco(ref.icon, id ? icons.skill(id) : '');
      setVar(ref.b, '--p', onCd && total > 0 ? clamp(cd / total, 0, 1).toFixed(3) : '0');
      setText(ref.cd, onCd ? (cd >= 1 ? String(Math.ceil(cd)) : cd.toFixed(1)) : '');
      setText(ref.lockTxt, locked ? 'F' + num(floors[i], 0) : '');
      const name = id ? skillDef(id).name : '';
      setAttr(ref.b, 'aria-label', locked ? 'Skill slot ' + (i + 1) + ' unlocks at floor ' + floors[i] : id ? name + (onCd ? ', ready in ' + Math.ceil(cd) + 's' : ', ready') : 'Empty skill slot ' + (i + 1) + ': choose a skill');
    }
    if (s && s.settings) {
      setAttr(R.autoBtn, 'aria-pressed', s.settings.autoSkill ? 'true' : 'false');
      const sp = clamp(Math.floor(num(s.settings.speed, 1)), 1, 3);
      setText(R.speedTxt, '×' + sp);
      setAttr(R.speedBtn, 'aria-label', 'Game speed ×' + sp);
      setAttr(R.speedBtn, 'data-speed', sp);
    }
  }

  function updateKeyTimer() {
    const s = S();
    if (!s) return;
    const keys = Math.floor(num(s.keys, 0));
    const full = keys >= maxKeys();
    const rem = full ? 0 : num(st('keyRegenRemaining'), keyRegenFallback(s));
    const t = full ? '' : fmtTimer(rem);
    setText(R.pill.keys.timer, t);
    setHidden(R.pill.keys.timer, full);
    if (R.dg && curTab === 'dungeons') setText(R.dg.keyTimer, full ? 'Keys full' : 'Next key in ' + fmtTime(rem));
    if (ov && ov.kind === 'sheet' && typeof ov.tick === 'function') ov.tick();
  }

  // ================================================================ tabs
  function switchTab(id, opts) {
    if (!R.panel || !R.panel[id]) return;
    if (id === curTab && !(opts && opts.force)) {
      R.panels.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
      return;
    }
    tabScroll[curTab] = R.panels.scrollTop;
    const prev = curTab;
    curTab = id;
    chooser = null;
    for (const t of TABS) {
      const on = t.id === id;
      setHidden(R.panel[t.id], !on);
      setAttr(R.tabs[t.id].b, 'aria-selected', on ? 'true' : 'false');
      setAttr(R.tabs[t.id].b, 'tabindex', on ? '0' : '-1');
    }
    R.panels.scrollTop = num(tabScroll[id], 0);
    renderPanel(id);
    updateBadges();
    if (prev !== id) emit('ui:open', { panel: id });
  }
  function renderPanel(id) {
    const f = PANEL_UPDATERS[id];
    if (!f) return;
    try {
      f();
    } catch (err) {
      console.error('[DD.ui] panel ' + id + ' update failed', err);
    }
  }
  function renderAll() {
    try {
      updateHUD();
    } catch (err) {
      console.error('[DD.ui] HUD update failed', err);
    }
    renderPanel(curTab);
    try {
      updateBadges();
    } catch (err) {
      console.error('[DD.ui] badge update failed', err);
    }
    if (ov && typeof ov.update === 'function') {
      try {
        ov.update();
      } catch (err) {
        console.error('[DD.ui] overlay update failed', err);
      }
    }
  }
  function soon() {
    dirty = true;
    sinceRender = RENDER_INTERVAL;
  }

  // ================================================================ overlay system
  function showOverlay(spec) {
    if (!built) {
      earlyOverlays.push(spec);
      return;
    }
    if (ov) {
      if (spec.key && ov.key === spec.key) return;
      if (ov.blocking) {
        if (!(spec.key && ovQueue.some((q) => q.key === spec.key))) {
          if (spec.blocking) ovQueue.push(spec);
        }
        return;
      }
      closeOverlay(true);
    }
    openNow(spec);
  }
  function openNow(spec) {
    if (spec.valid && !spec.valid()) return false;
    let el = null;
    const holder = { timers: [] };
    try {
      el = spec.build(holder);
    } catch (err) {
      console.error('[DD.ui] overlay build failed', err);
      el = null;
    }
    if (!el) return false;
    const prevFocus = document.activeElement;
    ov = Object.assign({}, spec, holder, { el, prevFocus });
    R.dlgHost.innerHTML = '';
    R.dlgHost.appendChild(el);
    R.overlay.setAttribute('data-kind', spec.kind || 'sheet');
    R.overlay.hidden = false;
    root.classList.add('has-overlay');
    if (typeof ov.update === 'function') {
      try {
        ov.update();
      } catch (err) {
        console.error('[DD.ui] overlay update failed', err);
      }
    }
    const focusEl = el.querySelector('[data-autofocus]') || el.querySelector('button:not([aria-disabled="true"]):not([hidden]), textarea, select');
    if (focusEl && typeof focusEl.focus === 'function') {
      try {
        focusEl.focus({ preventScroll: true });
      } catch {
        focusEl.focus();
      }
    }
    emit('ui:open', { panel: spec.key || spec.kind || 'sheet' });
    return true;
  }
  function closeOverlay(replacing) {
    if (!ov) return;
    const cur = ov;
    ov = null;
    for (const t of cur.timers || []) clearTimeout(t);
    if (typeof cur.onClose === 'function') {
      try {
        cur.onClose();
      } catch (err) {
        console.error('[DD.ui] overlay close failed', err);
      }
    }
    R.dlgHost.innerHTML = '';
    R.overlay.hidden = true;
    root.classList.remove('has-overlay');
    resetArmed = 0;
    if (replacing) return;
    nextOverlay();
    if (!ov && cur.prevFocus && document.contains(cur.prevFocus) && typeof cur.prevFocus.focus === 'function') {
      try {
        cur.prevFocus.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    }
    soon();
  }
  function nextOverlay() {
    while (!ov && ovQueue.length) openNow(ovQueue.shift());
  }

  function sheet(opts) {
    // opts: { key, title, cls, body: Element[] }
    const titleId = 'sh-' + opts.key;
    const close = h('button', { type: 'button', class: 'x-btn', 'data-act': 'closeOverlay', 'aria-label': 'Close' }, h('span', { 'aria-hidden': 'true' }));
    return h(
      'div',
      { class: 'sheet ' + (opts.cls || ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      h('div', { class: 'sheet-grip', 'aria-hidden': 'true' }),
      h('div', { class: 'sheet-head' }, h('h2', { id: titleId }, opts.title), close),
      h('div', { class: 'sheet-body' }, opts.body),
    );
  }

  // ---------------------------------------------------------------- chest compare modal
  function requestCompare() {
    const s = S();
    if (!s || !s.pendingItem) return;
    const key = 'compare:' + (s.pendingItem.id || 'x');
    showOverlay({ kind: 'compare', key, blocking: true, valid: () => !!(S() && S().pendingItem), build: buildCompare });
  }

  function itemCard(item, o) {
    if (!item) {
      return h(
        'article',
        { class: 'icard is-blank' },
        h('span', { class: 'icard-tag' }, o.label),
        h('div', { class: 'icard-art' }, ico('slot', 'ico-48', icons.slot(o.slot))),
        h('div', { class: 'icard-name' }, 'No ' + slotName(o.slot).toLowerCase()),
        h('div', { class: 'icard-meta' }, 'Slot is empty'),
      );
    }
    const r = rIdx(item.rarity);
    const subs = Array.isArray(item.subs) ? item.subs.filter((x) => x && x.stat) : [];
    const main = item.main || {};
    return h(
      'article',
      { class: 'icard r' + r + (o.isNew ? ' is-new' : '') },
      h('span', { class: 'icard-tag' }, o.label),
      h('div', { class: 'icard-art' }, ico('item', o.isNew ? 'ico-72' : 'ico-48', icons.item(item))),
      h('div', { class: 'icard-name' }, item.name || slotName(item.slot)),
      h('div', { class: 'icard-meta' }, h('span', { class: 'rname' }, rarity(r).name), ' · iLv ' + Math.floor(num(item.ilvl, 1))),
      h('div', { class: 'icard-main' }, h('span', null, statShort(main.stat)), h('b', null, fmt(main.value))),
      subs.length ? h('ul', { class: 'icard-subs' }, subs.map((x) => h('li', null, h('span', null, statLabel(x.stat)), h('b', null, fmtStatVal(x.stat, x.value))))) : h('p', { class: 'icard-nosubs' }, 'No bonus stats'),
    );
  }

  function lineVal(line, v) {
    if (line.fmt === 'pct') return v ? fmtPct(v, Math.abs(v) < 0.01 ? 2 : 1) : '—';
    return fmt(v);
  }
  function lineDiff(line) {
    const d = num(line.diff, 0);
    const a = Math.abs(d);
    const txt = line.fmt === 'pct' ? fmtPct(a, a < 0.01 ? 2 : 1) : fmt(a);
    return (d > 0 ? '▲ +' : d < 0 ? '▼ -' : '') + (d === 0 ? '=' : txt);
  }

  function buildCompare(holder) {
    const s = S();
    const item = s && s.pendingItem;
    if (!item) return null;
    const cmp = st('comparePending') || { current: null, delta: 0, lines: [] };
    const cur = cmp.current || null;
    const r = rIdx(item.rarity);
    const delta = num(cmp.delta, 0);
    const sell = Math.max(0, num(st('itemSellValue', item), 0));
    const big = r >= 4;
    const dlg = h('div', { class: 'dlg dlg-compare r' + r + (big ? ' is-reveal' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cmp-title' });
    if (big) add(dlg, [h('div', { class: 'rays', 'aria-hidden': 'true' }), h('div', { class: 'burst', 'aria-hidden': 'true' })]);
    const head = h(
      'div',
      { class: 'dlg-head' },
      h('span', { class: 'eyebrow' }, big ? rarity(r).name + ' drop!' : 'New loot'),
      h('h2', { id: 'cmp-title', class: 'cmp-title' }, slotName(item.slot)),
      h('span', { class: 'era' }, eraName(item)),
    );
    const cards = h('div', { class: 'cmp-cards' }, itemCard(item, { label: 'New', isNew: true }), h('span', { class: 'vs', 'aria-hidden': 'true' }, 'VS'), itemCard(cur, { label: 'Equipped', slot: item.slot }));
    const lines = Array.isArray(cmp.lines) ? cmp.lines : [];
    const diff = h('div', { class: 'cmp-diff', role: 'list', 'aria-label': 'Stat changes' });
    for (const ln of lines) {
      const d = num(ln.diff, 0);
      diff.appendChild(
        h(
          'div',
          { class: 'dl ' + (d > 0 ? 'up' : d < 0 ? 'down' : 'eq') + (ln.fmt === 'num' ? ' dl-main' : ''), role: 'listitem' },
          h('span', { class: 'dl-label' }, ln.label || statLabel(ln.stat)),
          h('span', { class: 'dl-vals' }, lineVal(ln, num(ln.before, 0)) + ' → ' + lineVal(ln, num(ln.after, 0))),
          h('b', { class: 'dl-diff' }, lineDiff(ln)),
        ),
      );
    }
    const cpCls = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
    const cp = h(
      'div',
      { class: 'cmp-cp ' + cpCls },
      h('small', null, 'Combat Power'),
      h('b', null, (delta > 0 ? '▲ +' : delta < 0 ? '▼ -' : '') + (delta === 0 ? 'No change' : fmt(Math.abs(delta)))),
      h('span', { class: 'cmp-cp-sub' }, fmt(cmp.powerBefore) + ' → ' + fmt(cmp.powerAfter)),
    );
    const sellBtn = btn('btn-lg cmp-sell' + (delta < 0 ? ' btn-good' : ''), 'sellPending', null, [h('span', null, 'Sell'), h('span', { class: 'btn-sub' }, ico('gold', 'ico-16', icons.cur('gold')), '+' + fmt(sell))]);
    const equipBtn = btn('btn-lg cmp-equip' + (delta >= 0 ? ' btn-primary' : ''), 'equipPending', null, [h('span', null, 'Equip'), delta > 0 ? h('span', { class: 'btn-sub' }, 'Upgrade') : null]);
    if (delta >= 0) equipBtn.setAttribute('data-autofocus', '');
    else sellBtn.setAttribute('data-autofocus', '');
    const actions = h('div', { class: 'dlg-actions' }, sellBtn, equipBtn);
    // CP change + Sell/Equip form one footer that stays pinned when a long compare has to scroll
    add(dlg, [head, cards, lines.length ? diff : null, h('div', { class: 'cmp-foot' }, cp, actions)]);
    if (big) {
      setAvail(sellBtn, false, 'Revealing…');
      setAvail(equipBtn, false, 'Revealing…');
      dlg.classList.add('is-locked');
      const t = setTimeout(
        () => {
          dlg.classList.remove('is-locked');
          setAvail(sellBtn, true);
          setAvail(equipBtn, true);
          const f = delta >= 0 ? equipBtn : sellBtn;
          try {
            f.focus({ preventScroll: true });
          } catch {
            /* ignore */
          }
        },
        reducedMotion() ? 350 : 1150,
      );
      holder.timers.push(t);
    }
    holder.item = item;
    holder.delta = delta;
    holder.sell = sell;
    return dlg;
  }

  // ---------------------------------------------------------------- chest upgrade sheet
  function openChestSheet() {
    const refs = {};
    showOverlay({
      kind: 'sheet',
      key: 'chest',
      build() {
        refs.from = ico('chest', 'ico-64');
        refs.to = ico('chest', 'ico-64');
        refs.fromLv = h('b', null, '');
        refs.toLv = h('b', null, '');
        refs.cost = h('b', null, '0');
        refs.up = btn('btn-lg btn-primary', 'upgradeChest', null, [h('span', null, 'Upgrade'), h('span', { class: 'btn-sub' }, ico('gold', 'ico-16', icons.cur('gold')), refs.cost)]);
        refs.reason = h('p', { class: 'uc-reason center', hidden: true });
        refs.thFrom = h('th', null, '');
        refs.thTo = h('th', null, '');
        refs.rows = [];
        const tbody = h('tbody');
        rarities().forEach((rr, i) => {
          const a = h('td', null, '');
          const b = h('td', null, '');
          const tr = h('tr', { class: 'r' + i }, h('th', { scope: 'row' }, h('span', { class: 'rdot' }), rr.name), a, b);
          refs.rows.push({ tr, a, b });
          tbody.appendChild(tr);
        });
        const table = h('table', { class: 'odds' }, h('thead', null, h('tr', null, h('th', null, 'Rarity'), refs.thFrom, refs.thTo)), tbody);
        refs.hero = h('div', { class: 'chest-compare' }, h('div', { class: 'cc-col' }, refs.from, refs.fromLv), h('span', { class: 'cc-arrow', 'aria-hidden': 'true' }), h('div', { class: 'cc-col cc-next' }, refs.to, refs.toLv));
        return sheet({
          key: 'chest',
          title: 'Chest level',
          cls: 'sheet-chest',
          body: [
            refs.hero,
            h('p', { class: 'muted small center' }, 'Higher chest levels drop rarer gear. Legendary from Lv 6, Mythic from Lv 11, Celestial from Lv 16.'),
            refs.up,
            refs.reason,
            h('div', { class: 'sec-title' }, h('span', null, 'Drop odds')),
            table,
          ],
        });
      },
      update() {
        const s = S();
        if (!s) return;
        const lv = Math.floor(num(s.chestLevel, 1));
        const maxLv = maxChestLevel();
        const maxed = lv >= maxLv;
        const next = Math.min(maxLv, lv + 1);
        setIco(refs.from, icons.chest(lv));
        setIco(refs.to, icons.chest(next));
        setText(refs.fromLv, 'Lv ' + lv);
        setText(refs.toLv, maxed ? 'MAX' : 'Lv ' + next);
        setCls(refs.hero, 'is-max', maxed);
        const cost = st('chestUpgradeCost');
        const ok = !maxed && isNum(cost) && num(s.gold, 0) >= cost;
        setText(refs.cost, maxed || !isNum(cost) ? 'MAX' : fmt(cost));
        const reason = maxed ? 'The chest is at max level' : 'Need ' + fmt(num(cost, 0) - num(s.gold, 0)) + ' more gold';
        setAvail(refs.up, ok, reason);
        setCls(refs.up, 'btn-primary', ok);
        setHidden(refs.reason, ok);
        setText(refs.reason, ok ? '' : reason);
        setText(refs.thFrom, 'Lv ' + lv);
        setText(refs.thTo, maxed ? '—' : 'Lv ' + next);
        const a = st('rarityOdds', lv) || [];
        const b = maxed ? null : st('rarityOdds', next) || [];
        refs.rows.forEach((row, i) => {
          const pa = num(a[i], 0);
          const pb = b ? num(b[i], 0) : null;
          setText(row.a, oddsTxt(pa));
          setText(row.b, pb === null ? '—' : oddsTxt(pb));
          setCls(row.b, 'up', pb !== null && pb > pa + 1e-9);
          setCls(row.b, 'down', pb !== null && pb < pa - 1e-9);
          setCls(row.tr, 'is-zero', pa <= 0 && (pb === null || pb <= 0));
        });
      },
    });
  }
  function oddsTxt(p) {
    if (!(p > 0)) return '—';
    if (p < 0.001) return '<0.1%';
    return fmtPct(p, p < 0.1 ? 1 : 0);
  }

  // ---------------------------------------------------------------- auto-loot sheet
  function openAutoLootSheet() {
    const refs = {};
    showOverlay({
      kind: 'sheet',
      key: 'autoloot',
      build() {
        refs.auto = h(
          'button',
          { type: 'button', class: 'switch-btn switch-row', 'data-act': 'toggleAutoOpen', role: 'switch', 'aria-checked': 'false' },
          h('span', { class: 'sr-body' }, h('b', null, 'Auto-open chests'), h('small', { class: 'muted' }, 'Opens one chest every 0.3s using these rules')),
          h('span', { class: 'switch', 'aria-hidden': 'true' }),
        );
        refs.equip = h(
          'button',
          { type: 'button', class: 'switch-btn switch-row', 'data-act': 'toggleAutoEquip', role: 'switch', 'aria-checked': 'false' },
          h('span', { class: 'sr-body' }, h('b', null, 'Auto-equip upgrades'), h('small', { class: 'muted' }, 'Equips anything that raises Combat Power')),
          h('span', { class: 'switch', 'aria-hidden': 'true' }),
        );
        refs.sell = [];
        const grid = h('div', { class: 'sellgrid', role: 'group', 'aria-label': 'Auto-sell rarities' });
        rarities().forEach((rr, i) => {
          const b = h('button', { type: 'button', class: 'chk r' + i, role: 'checkbox', 'aria-checked': 'false', 'data-act': 'toggleSell', 'data-arg': String(i) }, h('span', { class: 'chk-box', 'aria-hidden': 'true' }), h('span', null, rr.name));
          refs.sell.push(b);
          grid.appendChild(b);
        });
        refs.stop = h('select', { class: 'select', id: 'stop-rarity', 'data-change': 'stopRarity' });
        rarities().forEach((rr, i) => refs.stop.appendChild(h('option', { value: String(i) }, rr.name + (i < rarities().length - 1 ? ' or better' : ''))));
        refs.stop.appendChild(h('option', { value: String(rarities().length) }, 'Never stop'));
        return sheet({
          key: 'autoloot',
          title: 'Auto-loot',
          cls: 'sheet-autoloot',
          body: [
            refs.auto,
            refs.equip,
            h('div', { class: 'sec-title' }, h('span', null, 'Auto-sell items that are not upgrades')),
            grid,
            h('div', { class: 'sec-title' }, h('span', null, 'Stop auto-open when I find')),
            h('label', { class: 'select-wrap', for: 'stop-rarity' }, h('span', { class: 'sr-only' }, 'Stop at rarity'), refs.stop),
            h(
              'ol',
              { class: 'rules muted small' },
              h('li', null, 'Upgrades are equipped first (when auto-equip is on).'),
              h('li', null, 'Other items of a checked rarity are sold for gold.'),
              h('li', null, 'Anything else pauses auto-open so you can decide.'),
            ),
          ],
        });
      },
      update() {
        const s = S();
        if (!s || !s.settings) return;
        const al = s.settings.autoLoot || {};
        setAttr(refs.auto, 'aria-checked', s.autoOpen ? 'true' : 'false');
        setAttr(refs.equip, 'aria-checked', al.autoEquip ? 'true' : 'false');
        const sell = Array.isArray(al.sell) ? al.sell : [];
        refs.sell.forEach((b, i) => setAttr(b, 'aria-checked', sell[i] ? 'true' : 'false'));
        const v = String(clamp(Math.floor(num(al.stopRarity, 4)), 0, rarities().length));
        if (refs.stop.value !== v && document.activeElement !== refs.stop) refs.stop.value = v;
      },
    });
  }

  // ---------------------------------------------------------------- item detail sheet
  function openItemSheet(slot) {
    const s = S();
    if (!s) return;
    const item = s.equipped && s.equipped[slot];
    showOverlay({
      kind: 'sheet',
      key: 'item:' + slot,
      build() {
        const body = [];
        if (item) {
          const card = itemCard(item, { label: 'Equipped', isNew: true });
          card.classList.add('icard-wide');
          body.push(card);
          const facts = h(
            'dl',
            { class: 'facts' },
            h('div', null, h('dt', null, 'Slot'), h('dd', null, slotName(slot))),
            h('div', null, h('dt', null, 'Era'), h('dd', null, eraName(item) || '—')),
            h('div', null, h('dt', null, 'Item level'), h('dd', null, String(Math.floor(num(item.ilvl, 1))))),
            h('div', null, h('dt', null, 'Worth'), h('dd', null, fmt(st('itemSellValue', item)) + ' gold')),
          );
          body.push(facts, h('p', { class: 'muted small center' }, 'When you equip something better, this item is sold automatically.'));
        } else {
          body.push(
            h('div', { class: 'empty-slot' }, ico('slot', 'ico-64', icons.slot(slot)), h('b', null, 'Empty ' + slotName(slot).toLowerCase() + ' slot'), h('p', { class: 'muted small' }, 'Open chests on the Loot tab to find gear for this slot.')),
            btn('btn-lg btn-primary', 'gotoLoot', null, 'Go to chests'),
          );
        }
        return sheet({ key: 'item', title: slotName(slot), cls: 'sheet-item', body });
      },
    });
  }

  // ---------------------------------------------------------------- settings sheet
  function openSettings() {
    const refs = {};
    showOverlay({
      kind: 'sheet',
      key: 'settings',
      build() {
        const sw = (act, title, sub, key) => {
          const b = h(
            'button',
            { type: 'button', class: 'switch-btn switch-row', 'data-act': act, role: 'switch', 'aria-checked': 'false' },
            h('span', { class: 'sr-body' }, h('b', null, title), h('small', { class: 'muted' }, sub)),
            h('span', { class: 'switch', 'aria-hidden': 'true' }),
          );
          refs[key] = b;
          return b;
        };
        refs.exportTa = h('textarea', { class: 'code', readonly: true, rows: '3', 'aria-label': 'Your save code', spellcheck: 'false' });
        refs.copyLbl = h('span', null, 'Copy code');
        refs.copy = btn('btn-sm', 'copyCode', null, refs.copyLbl);
        refs.importTa = h('textarea', { class: 'code', rows: '3', placeholder: 'Paste a save code here', 'aria-label': 'Save code to import', spellcheck: 'false' });
        refs.resetLbl = h('span', null, 'Reset progress');
        refs.reset = btn('btn-sm btn-danger', 'resetAsk', null, refs.resetLbl);
        refs.resetCancel = btn('btn-sm btn-ghost', 'resetCancel', null, 'Cancel', { hidden: true });
        refs.resetNote = h('p', { class: 'uc-reason', hidden: true }, 'This erases your hero, gear and all progress. Tap again to confirm.');
        refs.records = h('dl', { class: 'facts facts-3' });
        return sheet({
          key: 'settings',
          title: 'Settings',
          cls: 'sheet-settings',
          body: [
            sw('toggleSound', 'Sound effects', 'Clicks, hits, loot and fanfares', 'sound'),
            sw('toggleAutoBoss', 'Auto-challenge boss', 'Retry the boss after each farming loop', 'autoBoss'),
            sw('toggleAutoSkill', 'Auto-cast skills', 'Skills fire as soon as they are ready', 'autoSkill'),
            h('div', { class: 'sec-title' }, h('span', null, 'Records')),
            refs.records,
            h('div', { class: 'sec-title' }, h('span', null, 'Export save')),
            h('p', { class: 'muted small' }, 'Keep this code somewhere safe to move your progress to another browser.'),
            refs.exportTa,
            h('div', { class: 'row-end' }, refs.copy),
            h('div', { class: 'sec-title' }, h('span', null, 'Import save')),
            refs.importTa,
            h('div', { class: 'row-end' }, btn('btn-sm btn-primary', 'importCode', null, 'Import')),
            h('div', { class: 'sec-title' }, h('span', null, 'Danger zone')),
            refs.resetNote,
            h('div', { class: 'row-end' }, refs.resetCancel, refs.reset),
            h('p', { class: 'credits' }, 'Fan-made tribute to Dungeon Rush by Lava Labs. Not affiliated.'),
          ],
        });
      },
      update() {
        const s = S();
        if (!s || !s.settings) return;
        setAttr(refs.sound, 'aria-checked', s.settings.sound ? 'true' : 'false');
        setAttr(refs.autoBoss, 'aria-checked', s.settings.autoBoss ? 'true' : 'false');
        setAttr(refs.autoSkill, 'aria-checked', s.settings.autoSkill ? 'true' : 'false');
        if (!refs.exportTa.value) refs.exportTa.value = st('exportCode') || '';
        const armed = resetArmed > Date.now();
        setCls(refs.reset, 'is-armed', armed);
        setText(refs.resetLbl, armed ? 'Yes, erase everything' : 'Reset progress');
        setHidden(refs.resetCancel, !armed);
        setHidden(refs.resetNote, !armed);
        const ss = s.stats || {};
        const rec = [
          ['Play time', fmtTime(num(ss.playTime, 0))],
          ['Best floor', fmt(num(s.campaign && s.campaign.highestFloor, 1))],
          ['Enemies', fmt(num(ss.kills, 0))],
          ['Bosses', fmt(num(ss.bossKills, 0))],
          ['Chests', fmt(num(ss.chestsOpened, 0))],
          ['Dungeons', fmt(num(ss.dungeonsWon, 0))],
        ];
        const key = rec.map((x) => x[1]).join('|');
        if (refs.records._k !== key) {
          refs.records._k = key;
          refs.records.innerHTML = '';
          for (const [k, v] of rec) refs.records.appendChild(h('div', null, h('dt', null, k), h('dd', null, v)));
        }
      },
      tick() {
        if (resetArmed && resetArmed <= Date.now()) {
          resetArmed = 0;
          soon();
        }
      },
      refs,
    });
  }

  // ---------------------------------------------------------------- offline modal
  function buildOffline(sum) {
    const secs = Math.max(0, num(sum.seconds, 0));
    const capped = num(sum.cappedSeconds, secs);
    const rows = [];
    const row = (iconUrl, fb, label, val, cls) => rows.push(h('li', { class: 'rw ' + (cls || '') }, ico(fb, 'ico-32', iconUrl), h('span', { class: 'rw-label' }, label), h('b', null, val)));
    row(icons.cur('gold'), 'gold', 'Gold', '+' + fmt(num(sum.gold, 0)), 'gold');
    if (num(sum.chests, 0) > 0) row(icons.cur('chest'), 'chest', 'Chests', '+' + fmt(sum.chests));
    if (num(sum.xp, 0) > 0) row(icons.cur('xp'), 'xp', 'Experience', '+' + fmt(sum.xp), 'xp');
    if (num(sum.keys, 0) > 0) row(icons.cur('keys'), 'keys', 'Keys', '+' + fmt(sum.keys));
    const s = S();
    const floor = Math.floor(num(s && s.campaign && s.campaign.floor, 1));
    const capNote = capped + 1 < secs ? h('p', { class: 'muted small center' }, 'Rewards are capped at ' + fmtTime(capped) + '. The Patience mastery raises the cap.') : null;
    return h(
      'div',
      { class: 'dlg dlg-offline', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'off-title' },
      h('div', { class: 'off-art', 'aria-hidden': 'true' }, ico('chest', 'ico-96', icons.chest(s ? s.chestLevel : 1))),
      h('h2', { id: 'off-title', class: 'off-title' }, 'While you were away', h('span', null, '(' + fmtTime(secs) + ')')),
      h('p', { class: 'muted small center' }, 'Your hero kept fighting on floor ' + floor + '.'),
      h('ul', { class: 'rewards' }, rows),
      capNote,
      h('div', { class: 'dlg-actions one' }, btn('btn-lg btn-primary', 'collectOffline', null, 'Collect', { 'data-autofocus': '' })),
    );
  }

  // ================================================================ toasts + loot ticker
  const toasts = [];
  let lastDenyAt = 0;
  function toast(text, kind) {
    const t = String(text === null || text === undefined ? '' : text).trim();
    if (!t) return;
    const k = ['info', 'good', 'bad', 'rare'].indexOf(kind) >= 0 ? kind : 'info';
    if (!built) {
      earlyToasts.push([t, k]);
      return;
    }
    const same = toasts.find((x) => x.text === t && x.kind === k);
    if (same) {
      same.count++;
      setText(same.countEl, '×' + same.count);
      setHidden(same.countEl, false);
      restartAnim(same.el, 'bump', 400);
      clearTimeout(same.timer);
      same.timer = setTimeout(() => dismissToast(same), toastLife(k, t));
      return;
    }
    const countEl = h('b', { class: 'toast-count', hidden: true });
    const el = h('div', { class: 'toast t-' + k }, h('span', { class: 'toast-mark', 'aria-hidden': 'true' }), h('span', { class: 'toast-text' }, t), countEl);
    const entry = { el, text: t, kind: k, count: 1, countEl, timer: 0 };
    toasts.push(entry);
    R.toasts.appendChild(el);
    while (toasts.length > 3) dismissToast(toasts[0], true);
    entry.timer = setTimeout(() => dismissToast(entry), toastLife(k, t));
  }
  function toastLife(kind, text) {
    return (kind === 'rare' ? 3600 : kind === 'bad' ? 2600 : 2400) + Math.min(1600, text.length * 18);
  }
  function dismissToast(entry, instant) {
    const i = toasts.indexOf(entry);
    if (i < 0) return;
    toasts.splice(i, 1);
    clearTimeout(entry.timer);
    if (instant || reducedMotion()) {
      entry.el.remove();
      return;
    }
    entry.el.classList.add('is-out');
    setTimeout(() => entry.el.remove(), 220);
  }
  function deny(el) {
    restartAnim(el, 'shake', 400);
    const reason = el.getAttribute('data-reason');
    const now = Date.now();
    if (reason && now - lastDenyAt > 500) {
      lastDenyAt = now;
      toast(reason, 'bad');
    }
  }

  function pushLoot(entry) {
    if (!entry || !entry.item) return;
    entry.fresh = true;
    lootLog.unshift(entry);
    if (lootLog.length > 6) lootLog.length = 6;
    logDirty = true;
    soon();
    // ticker line over the floor band of the battle canvas
    const r = rIdx(entry.item.rarity);
    const name = rarity(r).name + ' ' + (entry.item.name || '');
    const val =
      entry.kind === 'sold'
        ? h('b', { class: 'tk-val gold' }, '+' + fmt(entry.gold), ico('gold', 'ico-16', icons.cur('gold')))
        : h('b', { class: 'tk-val ' + (entry.cp > 0 ? 'up' : entry.cp < 0 ? 'down' : '') }, entry.cp > 0 ? '▲ +' + fmt(entry.cp) + ' CP' : entry.cp < 0 ? '▼ -' + fmt(-entry.cp) + ' CP' : '');
    const line = h('div', { class: 'tk r' + r }, ico('item', 'ico-16 ico-soft', icons.item(entry.item)), h('span', { class: 'tk-txt' }, (entry.kind === 'sold' ? 'Sold ' : 'Equipped ') + name), val);
    R.ticker.appendChild(line);
    while (R.ticker.children.length > 2) R.ticker.firstChild.remove();
    setTimeout(() => {
      line.classList.add('is-out');
      setTimeout(() => line.remove(), 300);
    }, 2600);
  }

  // ================================================================ actions
  function chestPop(rar) {
    const b = R.chest && R.chest.btn;
    if (!b) return;
    setVar(b, '--flash', rarity(rar).color || '#ffb547');
    restartAnim(b, 'pop', 520);
  }

  const ACTIONS = {
    tab(arg) {
      switchTab(arg);
    },
    gotoLoot() {
      closeOverlay();
      switchTab('loot');
    },
    scrim() {
      if (!ov) return;
      if (!ov.blocking || ov.dismissable) closeOverlay();
      else restartAnim(ov.el, 'nudge-dlg', 420); // a decision is required: nudge the dialog
    },
    closeOverlay() {
      if (ov && (!ov.blocking || ov.dismissable)) closeOverlay();
    },
    openChest() {
      const s = S();
      if (!s) return;
      if (s.pendingItem) {
        requestCompare();
        return;
      }
      if (num(s.chests, 0) < 1) {
        toast('No chests left. Defeat enemies to find more!', 'bad');
        restartAnim(R.chest.btn, 'shake', 400);
        return;
      }
      st('openChest', {});
    },
    openPremium() {
      const s = S();
      if (!s) return;
      if (s.pendingItem) {
        requestCompare();
        return;
      }
      st('openChest', { premium: true });
    },
    chestSheet() {
      openChestSheet();
    },
    upgradeChest() {
      if (st('upgradeChestLevel')) {
        const s = S();
        restartAnim(R.chest && R.chest.btn, 'pop', 520);
        if (ov && ov.key === 'chest' && s) restartAnim(ov.el.querySelector('.cc-next'), 'bump', 600);
      }
    },
    toggleAutoOpen() {
      const s = S();
      if (!s) return;
      st('setAutoOpen', !s.autoOpen);
    },
    autoLootSheet() {
      openAutoLootSheet();
    },
    toggleAutoEquip() {
      const s = S();
      if (!s || !s.settings || !s.settings.autoLoot) return;
      st('setSetting', 'autoLoot.autoEquip', !s.settings.autoLoot.autoEquip);
    },
    toggleSell(arg) {
      const s = S();
      if (!s || !s.settings || !s.settings.autoLoot) return;
      const i = Math.floor(Number(arg));
      const cur = Array.isArray(s.settings.autoLoot.sell) ? s.settings.autoLoot.sell.slice() : [];
      if (!(i >= 0 && i < cur.length)) return;
      cur[i] = !cur[i];
      st('setSetting', 'autoLoot.sell', cur);
    },
    claimQuest() {
      if (st('claimQuest')) restartAnim(R.q && R.q.card, 'pop', 520);
    },
    equipPending() {
      const s = S();
      const item = s && s.pendingItem;
      if (!item) {
        closeOverlay();
        return;
      }
      const delta = ov && ov.item === item ? num(ov.delta, 0) : num((st('comparePending') || {}).delta, 0);
      if (st('equipPending')) {
        closeOverlay();
        pushLoot({ kind: 'equipped', item, cp: delta });
      }
    },
    sellPending() {
      const s = S();
      const item = s && s.pendingItem;
      if (!item) {
        closeOverlay();
        return;
      }
      const gold = num(st('itemSellValue', item), 0);
      if (st('sellPending')) {
        closeOverlay();
        pushLoot({ kind: 'sold', item, gold: soldGold.get(item.id) || gold });
      }
    },
    collectOffline() {
      closeOverlay();
    },
    slot(arg) {
      openItemSheet(arg);
    },
    // skills
    skillMain(id) {
      const s = S();
      if (!s) return;
      if (s.skills && s.skills.owned && s.skills.owned[id]) st('upgradeSkill', id);
      else st('unlockSkill', id);
    },
    skillEquip(id) {
      const n = Math.floor(num(st('skillSlotsUnlocked'), 1));
      if (n <= 1) {
        st('equipSkill', id, 0);
        chooser = null;
      } else chooser = chooser && chooser.kind === 'skill' && chooser.id === id ? null : { kind: 'skill', id };
    },
    skillEquipTo(id, el) {
      const slot = Math.floor(Number(el.getAttribute('data-arg2')));
      if (st('equipSkill', id, slot)) chooser = null;
    },
    skillUnequip(id) {
      const s = S();
      const i = s && s.skills && Array.isArray(s.skills.equipped) ? s.skills.equipped.indexOf(id) : -1;
      if (i >= 0) st('unequipSkill', i);
    },
    // allies
    allyMain(id) {
      const s = S();
      if (!s) return;
      if (s.allies && s.allies.owned && s.allies.owned[id]) st('upgradeAlly', id);
      else st('unlockAlly', id);
    },
    allyEquip(id) {
      const n = Math.floor(num(st('allySlotsUnlocked'), 0));
      if (n <= 1) {
        st('equipAlly', id, 0);
        chooser = null;
      } else chooser = chooser && chooser.kind === 'ally' && chooser.id === id ? null : { kind: 'ally', id };
    },
    allyEquipTo(id, el) {
      const slot = Math.floor(Number(el.getAttribute('data-arg2')));
      if (st('equipAlly', id, slot)) chooser = null;
    },
    allyUnequip(id) {
      const s = S();
      const i = s && s.allies && Array.isArray(s.allies.equipped) ? s.allies.equipped.indexOf(id) : -1;
      if (i >= 0) st('unequipAlly', i);
    },
    chooserClose() {
      chooser = null;
    },
    // dungeons / battle
    enterDungeon(id) {
      const b = BT();
      if (b && b.mode === 'dungeon') {
        toast('Finish the current dungeon first', 'bad');
        return;
      }
      const ok = bt('startDungeon', id) === true;
      if (ok) {
        switchTab('loot');
        R.panels.scrollTop = 0;
        restartAnim(R.stage, 'flash', 900);
      }
    },
    leaveDungeon() {
      bt('leaveDungeon');
    },
    challengeBoss() {
      if (bt('challengeBoss') !== false) restartAnim(R.stage, 'flash', 900);
    },
    cast(arg, el) {
      const i = Math.floor(Number(arg));
      if (el.classList.contains('is-locked')) {
        toast('Skill slot ' + (i + 1) + ' unlocks at floor ' + skillSlotFloors()[i], 'info');
        return;
      }
      if (el.classList.contains('is-empty')) {
        switchTab('skills');
        return;
      }
      const ok = bt('castSkill', i) === true;
      if (!ok) restartAnim(el, 'nope', 300);
      else restartAnim(el, 'fired', 400);
    },
    toggleAutoSkill() {
      const s = S();
      if (s && s.settings) st('setSetting', 'autoSkill', !s.settings.autoSkill);
    },
    cycleSpeed() {
      const s = S();
      if (!s || !s.settings) return;
      const cur = clamp(Math.floor(num(s.settings.speed, 1)), 1, 3);
      st('setSetting', 'speed', cur >= 3 ? 1 : cur + 1);
    },
    // mastery + settings
    masteryUp(id) {
      if (st('upgradeMastery', id)) {
        const r = R.ms && R.ms.rows[id];
        if (r) restartAnim(r.el, 'pop', 520);
      }
    },
    settings() {
      openSettings();
    },
    toggleSound() {
      const s = S();
      if (s && s.settings) st('setSetting', 'sound', !s.settings.sound);
    },
    toggleAutoBoss() {
      const s = S();
      if (s && s.settings) st('setSetting', 'autoBoss', !s.settings.autoBoss);
    },
    copyCode(arg, el) {
      const refs = ov && ov.refs;
      if (!refs || !refs.exportTa) return;
      const ta = refs.exportTa;
      ta.value = st('exportCode') || ta.value;
      const fallback = () => {
        try {
          ta.focus();
          ta.select();
          ta.setSelectionRange(0, ta.value.length);
        } catch {
          /* ignore */
        }
        setText(refs.copyLbl, 'Selected');
        toast('Code selected. Press Ctrl+C (or long-press and Copy).', 'info');
      };
      const ok = () => {
        setText(refs.copyLbl, 'Copied!');
        restartAnim(el, 'pop', 500);
        setTimeout(() => setText(refs.copyLbl, 'Copy code'), 1800);
      };
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(ta.value).then(ok, fallback);
        } else fallback();
      } catch {
        fallback();
      }
    },
    importCode() {
      const refs = ov && ov.refs;
      if (!refs || !refs.importTa) return;
      const code = refs.importTa.value;
      if (st('importCode', code) === true) {
        refs.importTa.value = '';
        closeOverlay();
      } else restartAnim(refs.importTa, 'shake', 400);
    },
    resetAsk() {
      if (resetArmed > Date.now()) {
        resetArmed = 0;
        closeOverlay();
        st('reset');
        toast('Progress reset. A fresh adventure begins!', 'info');
        return;
      }
      resetArmed = Date.now() + 6000;
      soon();
    },
    resetCancel() {
      resetArmed = 0;
      soon();
    },
  };

  function onClick(e) {
    const t = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!t || !root.contains(t)) return;
    const act = t.getAttribute('data-act');
    if (act === 'scrim') {
      ACTIONS.scrim();
      return;
    }
    if (t.getAttribute('aria-disabled') === 'true') {
      deny(t);
      return;
    }
    emit('ui:click', {});
    const fn = ACTIONS[act];
    if (!fn) return;
    try {
      fn(t.getAttribute('data-arg'), t, e);
    } catch (err) {
      console.error('[DD.ui] action ' + act + ' failed', err);
    }
    soon();
  }

  function onChange(e) {
    const t = e.target;
    if (!t || t.getAttribute('data-change') !== 'stopRarity') return;
    st('setSetting', 'autoLoot.stopRarity', Math.floor(Number(t.value)));
    emit('ui:click', {});
    soon();
  }

  function onKey(e) {
    if (!built) return;
    const tag = e.target && e.target.tagName;
    const typing = tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT';
    if (e.key === 'Escape') {
      if (ov && (!ov.blocking || ov.dismissable)) {
        e.preventDefault();
        closeOverlay();
      } else if (ov) {
        restartAnim(ov.el, 'nudge-dlg', 420);
      } else if (chooser) {
        chooser = null;
        soon();
      }
      return;
    }
    if (e.key === 'Tab' && ov && ov.el) {
      const f = Array.from(ov.el.querySelectorAll('button, textarea, select, [tabindex="0"]')).filter((x) => !x.hidden && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!ov.el.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    if (typing || ov || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key >= '1' && e.key <= '4') {
      const i = Number(e.key) - 1;
      const ref = R.sk[i];
      if (ref) ref.b.click();
    } else if (e.key === 'c' || e.key === 'C') {
      if (R.chest && R.chest.btn) R.chest.btn.click();
    }
  }
  // Arrow-key navigation between tabs (WAI-ARIA tabs pattern).
  function onTabKey(e) {
    const t = e.target && e.target.closest ? e.target.closest('.tab') : null;
    if (!t) return;
    const ids = TABS.map((x) => x.id);
    let i = ids.indexOf(curTab);
    if (e.key === 'ArrowRight') i = (i + 1) % ids.length;
    else if (e.key === 'ArrowLeft') i = (i + ids.length - 1) % ids.length;
    else return;
    e.preventDefault();
    switchTab(ids[i]);
    R.tabs[ids[i]].b.focus();
  }

  // ================================================================ bus wiring
  function subscribe() {
    // Drop listeners from a previous init (also from an earlier evaluation of this file on hot reload).
    for (const u of unsubs.concat(Array.isArray(ui._unsubs) ? ui._unsubs : [])) {
      try {
        u();
      } catch {
        /* ignore */
      }
    }
    unsubs = [];
    ui._unsubs = unsubs;
    if (!DD.bus || typeof DD.bus.on !== 'function') return;
    const on = (evt, fn) => {
      unsubs.push(
        DD.bus.on(evt, (p) => {
          try {
            fn(p && typeof p === 'object' ? p : {});
          } catch (err) {
            console.error('[DD.ui] ' + evt + ' handler failed', err);
          }
        }),
      );
    };
    on('state:changed', () => {
      dirty = true;
      const p = num(st('getPower'), powerSnap);
      powerSnap = p;
    });
    on('stats:changed', () => {
      dirty = true;
    });
    on('state:reset', () => {
      ovQueue.length = 0;
      if (ov) closeOverlay(true);
      lootLog.length = 0;
      logDirty = true;
      chooser = null;
      lastPower = -1;
      lastLevel = -1;
      powerSnap = num(st('getPower'), 0);
      soon();
      if (S() && S().pendingItem) requestCompare();
    });
    on('item:sold', (p) => {
      if (p.item && p.item.id) {
        soldGold.set(p.item.id, num(p.gold, 0));
        if (soldGold.size > 40) soldGold.delete(soldGold.keys().next().value);
      }
    });
    on('item:equipped', (p) => {
      const item = p.item;
      if (!item || !item.id) return;
      let delta;
      if (p.old) {
        const c = st('compareItem', p.old);
        delta = c && isNum(c.delta) ? -c.delta : 0;
      } else delta = num(st('getPower'), powerSnap) - powerSnap;
      equipDelta.set(item.id, delta);
      if (equipDelta.size > 40) equipDelta.delete(equipDelta.keys().next().value);
    });
    on('chest:opened', (p) => {
      const item = p.item;
      if (!item) return;
      chestPop(item.rarity);
      if (p.decision === 'pending') requestCompare();
      else if (p.decision === 'sold') pushLoot({ kind: 'sold', item, gold: num(soldGold.get(item.id), num(st('itemSellValue', item), 0)) });
      else if (p.decision === 'equipped') pushLoot({ kind: 'equipped', item, cp: num(equipDelta.get(item.id), 0) });
      soon();
    });
    on('toast', (p) => toast(p.text, p.kind));
    // Battle moments (level-up, floor cleared, dungeon result, boss escaped, flying-chest loot) are
    // already celebrated by a banner on the canvas. They become toasts only while a sheet or modal
    // covers the canvas, so the HUD is not buried under duplicate notifications.
    const canvasHidden = () => !!ov;
    on('levelup', (p) => {
      if (canvasHidden()) toast('Level up! Hero is now Lv ' + Math.floor(num(p.level, 1)), 'good');
    });
    on('floor:cleared', (p) => {
      lastBossFailFloor = 0;
      if (!canvasHidden()) return;
      const r = p.rewards || {};
      const parts = [];
      if (num(r.chests, 0) > 0) parts.push('+' + fmt(r.chests) + ' chests');
      if (num(r.gems, 0) > 0) parts.push('+' + fmt(r.gems) + ' gems');
      toast('Floor ' + Math.floor(num(p.floor, 1)) + ' cleared!' + (parts.length ? ' ' + parts.join(', ') : ''), 'good');
    });
    on('boss:failed', (p) => {
      const s = S();
      const floor = Math.floor(num(BT() && BT().floor, num(s && s.campaign && s.campaign.floor, 1)));
      if (lastBossFailFloor === floor) return;
      lastBossFailFloor = floor;
      if (!canvasHidden()) return;
      toast((p.reason === 'timeout' ? 'Out of time!' : 'The boss was too strong!') + ' Farming floor ' + floor + '. Gear up and challenge again.', 'bad');
    });
    on('dungeon:won', (p) => {
      if (!canvasHidden()) return;
      const def = dungeonDef(p.id);
      const txt = dt_('rewardText', p.rewards || {}) || '';
      toast('Victory! ' + (def.name || 'Dungeon') + ' cleared' + (txt ? ': ' + txt : ''), 'rare');
    });
    on('dungeon:failed', (p) => {
      if (!canvasHidden()) return;
      const def = dungeonDef(p.id);
      const why = p.reason === 'timeout' ? 'Time ran out' : p.reason === 'forfeit' ? 'You left' : 'You were defeated';
      toast(why + ' in ' + (def.name || 'the dungeon') + '. The key was spent.', p.reason === 'forfeit' ? 'info' : 'bad');
    });
    on('dungeon:start', () => restartAnim(R.stage, 'flash', 900));
    on('wave:start', (p) => {
      if (p.isBoss) restartAnim(R.stage, 'flash', 900);
    });
    on('flyingChest:collected', (p) => {
      if (!canvasHidden()) return;
      const r = p.reward || {};
      toast('Flying chest! ' + (r.label || 'Treasure found'), 'good');
    });
    on('quest:ready', (p) => {
      const t = R.tabs && R.tabs.loot;
      if (t) restartAnim(t.b, 'bump', 600);
      const q = p.quest || {};
      if (q.text) toast('Quest complete: ' + q.text + (q.rewardText ? '. Claim ' + q.rewardText + '!' : '!'), 'good');
    });
  }

  // ================================================================ public API
  ui.init = function (rootEl) {
    if (!HAS_DOM) return;
    host = rootEl || document.getElementById('app');
    if (!host) {
      host = document.createElement('div');
      host.id = 'app';
      document.body.appendChild(host);
    }
    try {
      build();
    } catch (err) {
      console.error('[DD.ui] build failed', err);
      return;
    }
    subscribe();
    if (typeof ui._onKey === 'function') document.removeEventListener('keydown', ui._onKey);
    ui._onKey = onKey;
    document.addEventListener('keydown', onKey);
    root.addEventListener('keydown', onTabKey);
    for (const t of TABS) setAttr(R.tabs[t.id].b, 'tabindex', t.id === curTab ? '0' : '-1');
    if (ui._ro) {
      // an observer left over from an earlier version of this file (hot reload)
      ui._ro.disconnect();
      ui._ro = null;
    }
    powerSnap = num(st('getPower'), 0);
    firstFrame = true;
    dirty = true;
    sinceRender = RENDER_INTERVAL;
    renderAll();
    perFrame(0);
    while (earlyToasts.length) {
      const [t, k] = earlyToasts.shift();
      toast(t, k);
    }
    while (earlyOverlays.length) showOverlay(earlyOverlays.shift());
  };

  function perFrame(dt) {
    try {
      updateStage();
      updateHP(dt);
      updateSkillbar();
      updateKeyTimer();
    } catch (err) {
      if (!perFrame._warned) {
        perFrame._warned = true;
        console.error('[DD.ui] frame update failed', err);
      }
    }
  }

  ui.frame = function (dt) {
    if (!built) return;
    const d = clamp(num(dt, 0.016), 0, 1);
    sinceRender += d;
    perFrame(d);
    if (firstFrame) {
      // Deferred so the AFK modal (shown right after init) comes before a pending-item compare.
      firstFrame = false;
      const s = S();
      if (s && s.pendingItem) requestCompare();
    }
    if (dirty && sinceRender >= RENDER_INTERVAL) {
      dirty = false;
      sinceRender = 0;
      renderAll();
    }
  };

  ui.showOffline = function (sum) {
    if (!sum || typeof sum !== 'object') return;
    showOverlay({ kind: 'offline', key: 'offline', blocking: true, dismissable: true, build: () => buildOffline(sum) });
  };

  ui.toast = function (text, kind) {
    toast(text, kind);
  };

  // extras (read-only helpers for tests / other modules)
  ui.switchTab = function (id) {
    if (built) switchTab(id);
  };
  ui.currentTab = () => curTab;
  ui.openSheet = function (name, arg) {
    if (!built) return;
    if (name === 'chest') openChestSheet();
    else if (name === 'autoloot') openAutoLootSheet();
    else if (name === 'settings') openSettings();
    else if (name === 'item') openItemSheet(arg || 'weapon');
    else if (name === 'compare') requestCompare();
  };
  ui.closeOverlay = function () {
    if (ov) closeOverlay();
  };
  ui.overlayKind = () => (ov ? ov.key || ov.kind : null);
  ui.refresh = function () {
    soon();
    if (built) renderAll();
  };
})(globalThis.DD);
