/* Dungeon Dash — state: persistent save, economy actions, offline rewards and quests.
 *
 * DD.state.s is the single persistent save object (see CONTRACT §4). Every mutation emits
 * 'state:changed'; anything that can change hero stats also emits 'stats:changed'.
 * Works in browsers and in Node (persistence is skipped when localStorage is unavailable). */
(function (DD) {
  'use strict';

  const SAVE_KEY = 'dungeon-dash-save-v1';
  const BACKUP_KEY = 'dungeon-dash-save-v1-backup';
  const CURRENCIES = ['gold', 'gems', 'scrolls', 'keys'];
  const CURRENCY_NAMES = { gold: 'gold', gems: 'gems', scrolls: 'Skill Scrolls', keys: 'keys' };
  const MAX_CLAIMED_IDS = 60;
  const MAX_SAVE_LENGTH = 2000000;

  const D = () => DD.data; // lazy: never touch other modules at load time
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const num = (v, d) => (isNum(v) ? v : d);
  const clampNum = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const toInt = (v, d) => (isNum(v) ? Math.floor(v) : d);
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const emit = (evt, payload) => DD.bus.emit(evt, payload);
  const toast = (text, kind) => emit('toast', { text, kind: kind || 'info' });

  // ------------------------------------------------------------------ runtime (not saved)
  let _s = null;
  let statsCache = null;
  let autoOpenTimer = 0;
  let autosaveTimer = 0;
  let questReadyIndex = -1;
  let checkingQuest = false;

  const api = {};

  Object.defineProperty(api, 's', {
    enumerable: true,
    configurable: true,
    get() {
      if (!_s) _s = newGame(Date.now());
      return _s;
    },
    set(v) {
      if (isObj(v)) {
        _s = sanitizeState(v);
        resetRuntime();
        statsCache = null;
      }
    },
  });

  // ------------------------------------------------------------------ new game / defaults
  function defaultState(now) {
    const data = D();
    const B = data.BALANCE;
    const equipped = {};
    for (const slot of data.SLOTS) equipped[slot] = null;
    const mastery = {};
    for (const id of data.MASTERY_IDS) mastery[id] = 0;
    const dungeons = {};
    for (const id of data.DUNGEON_IDS) dungeons[id] = { level: 1 };
    return {
      version: 1,
      createdAt: now,
      lastSeen: now,
      hero: { level: 1, xp: 0 },
      gold: B.start.gold,
      gems: B.start.gems,
      keys: B.start.keys,
      scrolls: B.start.scrolls,
      chests: B.start.chests,
      premiumChests: 0,
      chestLevel: 1,
      equipped,
      pendingItem: null,
      campaign: { floor: 1, wave: 1, highestFloor: 1, farming: false },
      skills: { owned: { bomb: 1 }, equipped: ['bomb', null, null, null] },
      allies: { owned: {}, equipped: [null, null] },
      mastery,
      dungeons,
      keyRegenAt: B.start.keys < data.MAX_KEYS ? now + data.KEY_REGEN_MS : 0,
      quest: { index: 0, claimedIds: [] },
      stats: {
        kills: 0,
        bossKills: 0,
        chestsOpened: 0,
        itemsSold: 0,
        itemsEquipped: 0,
        flyingChests: 0,
        dungeonsWon: 0,
        deaths: 0,
        playTime: 0,
        goldEarned: 0,
        bestItemRarity: -1,
        autoOpenUsed: 0,
      },
      settings: {
        sound: true,
        speed: 1,
        autoSkill: true,
        autoBoss: true,
        autoLoot: { sell: [true, true, false, false, false, false, false], autoEquip: true, stopRarity: 4 },
      },
      autoOpen: false,
    };
  }

  function starterWeapon() {
    return D().createItem({ slot: 'weapon', rarity: 0, ilvl: 1, name: 'Rusty Sword', mainRoll: 1, subs: [] });
  }

  function newGame(now) {
    const s = defaultState(now);
    s.equipped.weapon = starterWeapon();
    return s;
  }

  function resetRuntime() {
    autoOpenTimer = 0;
    autosaveTimer = 0;
    questReadyIndex = -1;
  }

  // ------------------------------------------------------------------ change notification
  function changed() {
    // Recomputing hero stats is cheap; dropping the memo on every mutation also covers code
    // (sims, tests) that pokes DD.state.s directly before calling any API function.
    statsCache = null;
    emit('state:changed', {});
    checkQuestReady();
  }

  function statsDirty() {
    statsCache = null;
    emit('stats:changed', {});
  }

  // For external code that edited DD.state.s directly: drop caches and notify listeners.
  function invalidate() {
    statsDirty();
    changed();
  }

  // ------------------------------------------------------------------ validation
  // Deep-merge `src` onto `def`, keeping only keys present in `def` and only values whose type
  // matches the default. Arrays and nulls are handled by the caller.
  function mergeShape(def, src) {
    if (Array.isArray(def)) return def.slice();
    if (def === null) return null;
    if (isObj(def)) {
      const out = {};
      const so = isObj(src) ? src : {};
      for (const k of Object.keys(def)) out[k] = mergeShape(def[k], so[k]);
      return out;
    }
    if (typeof def === 'number') return isNum(src) ? src : def;
    if (typeof def === 'boolean') return typeof src === 'boolean' ? src : def;
    if (typeof def === 'string') return typeof src === 'string' ? src : def;
    return def;
  }

  function sanitizeItem(raw, slotHint) {
    if (!isObj(raw)) return null;
    const data = D();
    const slot = typeof raw.slot === 'string' && data.SLOT_INFO[raw.slot] ? raw.slot : null;
    if (!slot || (slotHint && slot !== slotHint)) return null;
    const maxIlvl = data.BALANCE.enemy.maxFloor;
    const rarity = isNum(raw.rarity) ? clampNum(Math.floor(raw.rarity), 0, data.RARITIES.length - 1) : 0;
    const ilvl = isNum(raw.ilvl) ? clampNum(Math.floor(raw.ilvl), 1, maxIlvl) : 1;
    const era = isNum(raw.era) ? clampNum(Math.floor(raw.era), 0, data.ERAS.length - 1) : data.eraForIlvl(ilvl);
    const mainStat = data.SLOT_INFO[slot].stat;
    const mainVal =
      isObj(raw.main) && isNum(raw.main.value) && raw.main.value > 0
        ? raw.main.value
        : Math.max(1, Math.round(data.itemMainValue(slot, rarity, ilvl)));
    const subs = [];
    const seen = {};
    if (Array.isArray(raw.subs)) {
      for (const x of raw.subs) {
        if (subs.length >= 5) break;
        if (!isObj(x) || typeof x.stat !== 'string' || data.SUBSTATS.indexOf(x.stat) < 0 || seen[x.stat]) continue;
        if (!isNum(x.value) || x.value < 0) continue;
        seen[x.stat] = true;
        subs.push({ stat: x.stat, value: Math.min(x.value, 10) });
      }
    }
    const name =
      typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 60) : data.itemName(slot, era, rarity);
    const id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 48) : DD.uid('it');
    return { id, slot, rarity, ilvl, era, name, main: { stat: mainStat, value: mainVal }, subs };
  }

  function sanitizeState(raw) {
    const data = D();
    const now = Date.now();
    const out = mergeShape(defaultState(now), raw);
    const maxFloor = data.BALANCE.enemy.maxFloor;

    out.version = 1;
    if (!(out.createdAt > 0) || out.createdAt > now + 864e5) out.createdAt = now;
    if (!(out.lastSeen > 0) || out.lastSeen > now + 864e5) out.lastSeen = now;

    out.hero.level = clampNum(toInt(out.hero.level, 1), 1, 100000);
    out.hero.xp = Math.max(0, num(out.hero.xp, 0));
    for (const c of ['gold', 'gems', 'keys', 'scrolls', 'chests', 'premiumChests']) {
      out[c] = Math.max(0, Math.floor(num(out[c], 0)));
    }
    out.chestLevel = clampNum(toInt(out.chestLevel, 1), 1, data.MAX_CHEST_LEVEL);

    // gear
    const rawEq = raw.equipped;
    for (const slot of data.SLOTS) out.equipped[slot] = isObj(rawEq) ? sanitizeItem(rawEq[slot], slot) : null;
    if (!isObj(rawEq)) out.equipped.weapon = starterWeapon();
    out.pendingItem = sanitizeItem(raw.pendingItem);

    // campaign
    const c = out.campaign;
    c.floor = clampNum(toInt(c.floor, 1), 1, maxFloor);
    c.wave = clampNum(toInt(c.wave, 1), 1, data.WAVES_PER_FLOOR);
    c.highestFloor = clampNum(Math.max(toInt(c.highestFloor, 1), c.floor), 1, maxFloor);
    c.farming = !!c.farming;

    // skills
    const rawSkills = isObj(raw.skills) ? raw.skills : {};
    const sOwned = {};
    const rawSOwned = isObj(rawSkills.owned) ? rawSkills.owned : {};
    for (const id of data.SKILL_IDS) {
      if (isNum(rawSOwned[id]) && rawSOwned[id] >= 1) sOwned[id] = clampNum(Math.floor(rawSOwned[id]), 1, data.MAX_SKILL_LEVEL);
    }
    if (!sOwned.bomb) sOwned.bomb = 1;
    out.skills.owned = sOwned;
    const skillSlots = slotsFor(data.SKILL_SLOT_FLOORS, c.highestFloor, 1);
    out.skills.equipped = cleanSlots(rawSkills.equipped, 4, sOwned, skillSlots);
    if (!Array.isArray(rawSkills.equipped)) out.skills.equipped[0] = 'bomb';

    // allies
    const rawAllies = isObj(raw.allies) ? raw.allies : {};
    const aOwned = {};
    const rawAOwned = isObj(rawAllies.owned) ? rawAllies.owned : {};
    for (const id of data.ALLY_IDS) {
      if (isNum(rawAOwned[id]) && rawAOwned[id] >= 1) aOwned[id] = clampNum(Math.floor(rawAOwned[id]), 1, data.MAX_ALLY_LEVEL);
    }
    out.allies.owned = aOwned;
    out.allies.equipped = cleanSlots(rawAllies.equipped, 2, aOwned, slotsFor(data.ALLY_SLOT_FLOORS, c.highestFloor, 0));

    // mastery & dungeons
    for (const id of data.MASTERY_IDS) {
      out.mastery[id] = clampNum(toInt(out.mastery[id], 0), 0, data.MASTERY[id].max);
    }
    for (const id of data.DUNGEON_IDS) {
      out.dungeons[id].level = clampNum(toInt(out.dungeons[id].level, 1), 1, 100000);
    }

    // keys
    out.keyRegenAt = Math.max(0, num(out.keyRegenAt, 0));
    fixKeyTimerOn(out, now);

    // quests
    out.quest.index = clampNum(toInt(out.quest.index, 0), 0, 1000000);
    const rawQuest = isObj(raw.quest) ? raw.quest : {};
    out.quest.claimedIds = Array.isArray(rawQuest.claimedIds)
      ? rawQuest.claimedIds.filter((x) => typeof x === 'string').slice(-MAX_CLAIMED_IDS)
      : [];

    // stats
    for (const k of Object.keys(out.stats)) {
      if (k === 'bestItemRarity') out.stats[k] = clampNum(toInt(out.stats[k], -1), -1, data.RARITIES.length - 1);
      else out.stats[k] = Math.max(0, num(out.stats[k], 0));
    }

    // settings
    const st = out.settings;
    st.speed = [1, 2, 3].indexOf(st.speed) >= 0 ? st.speed : 1;
    const rawSettings = isObj(raw.settings) ? raw.settings : {};
    const rawAL = isObj(rawSettings.autoLoot) ? rawSettings.autoLoot : {};
    const defSell = st.autoLoot.sell;
    st.autoLoot.sell = defSell.map((d, i) =>
      Array.isArray(rawAL.sell) && typeof rawAL.sell[i] === 'boolean' ? rawAL.sell[i] : d,
    );
    st.autoLoot.stopRarity = clampNum(toInt(st.autoLoot.stopRarity, 4), 0, data.RARITIES.length);
    out.autoOpen = !!out.autoOpen;
    return out;
  }

  function slotsFor(floors, highestFloor, min) {
    let n = 0;
    for (const f of floors) if (highestFloor >= f) n++;
    return Math.max(min, n);
  }

  function cleanSlots(rawArr, len, owned, unlocked) {
    const out = [];
    const used = {};
    for (let i = 0; i < len; i++) {
      const id = Array.isArray(rawArr) ? rawArr[i] : null;
      if (i < unlocked && typeof id === 'string' && owned[id] && !used[id]) {
        out.push(id);
        used[id] = true;
      } else out.push(null);
    }
    return out;
  }

  // ------------------------------------------------------------------ persistence
  function storage() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
    } catch {
      /* storage blocked (sandboxed frame, privacy mode) */
    }
    return null;
  }

  function persist() {
    const st = storage();
    if (!st) return false;
    try {
      st.setItem(SAVE_KEY, serialize());
      return true;
    } catch {
      return false;
    }
  }

  function save() {
    api.s.lastSeen = Date.now();
    autosaveTimer = 0;
    return persist();
  }

  function startNew() {
    _s = newGame(Date.now());
    resetRuntime();
    statsDirty();
    changed();
  }

  function load() {
    const st = storage();
    let raw = null;
    if (st) {
      try {
        raw = st.getItem(SAVE_KEY);
      } catch {
        raw = null;
      }
    }
    if (typeof raw === 'string' && raw) {
      if (deserialize(raw)) return true;
      try {
        st.setItem(BACKUP_KEY, raw);
      } catch {
        /* ignore */
      }
    }
    startNew();
    return false;
  }

  function serialize() {
    try {
      return JSON.stringify(api.s);
    } catch {
      return '{}';
    }
  }

  function deserialize(str) {
    if (typeof str !== 'string' || !str || str.length > MAX_SAVE_LENGTH) return false;
    let raw;
    try {
      raw = JSON.parse(str);
    } catch {
      return false;
    }
    if (!isObj(raw)) return false;
    if (!isObj(raw.hero) && !isNum(raw.version)) return false; // not a Dungeon Dash save
    let next;
    try {
      next = sanitizeState(raw);
    } catch {
      return false;
    }
    _s = next;
    resetRuntime();
    statsDirty();
    changed();
    return true;
  }

  function reset() {
    const st = storage();
    if (st) {
      try {
        st.removeItem(SAVE_KEY);
      } catch {
        /* ignore */
      }
    }
    startNew();
    emit('state:reset', { reason: 'reset' });
  }

  function b64encode(str) {
    if (typeof TextEncoder !== 'undefined' && typeof btoa === 'function') {
      const bytes = new TextEncoder().encode(str);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      }
      return btoa(bin);
    }
    if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
    throw new Error('no base64 encoder');
  }

  function b64decode(code) {
    let clean = String(code).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!clean || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new Error('bad base64');
    while (clean.length % 4) clean += '=';
    if (typeof atob === 'function' && typeof TextDecoder !== 'undefined') {
      const bin = atob(clean);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    if (typeof Buffer !== 'undefined') return Buffer.from(clean, 'base64').toString('utf8');
    throw new Error('no base64 decoder');
  }

  function exportCode() {
    try {
      return b64encode(serialize());
    } catch {
      return '';
    }
  }

  function importCode(code) {
    if (typeof code !== 'string' || !code.trim()) {
      toast('Paste a save code first', 'bad');
      return false;
    }
    let json;
    try {
      json = b64decode(code.trim());
    } catch {
      toast('That save code is not valid', 'bad');
      return false;
    }
    if (!deserialize(json)) {
      toast('That save code is not valid', 'bad');
      return false;
    }
    save();
    toast('Save imported!', 'good');
    emit('state:reset', { reason: 'import' });
    return true;
  }

  // ------------------------------------------------------------------ hero stats
  function computeStats(equipped) {
    const data = D();
    const s = api.s;
    const B = data.BALANCE;
    const H = B.hero;
    const C = B.caps;
    const base = data.heroBaseStats(s.hero.level);
    let atkGear = 0;
    let hpGear = 0;
    const sub = {};
    for (const k of data.SUBSTATS) sub[k] = 0;
    for (const slot of data.SLOTS) {
      const it = equipped && equipped[slot];
      if (!it || !isObj(it.main)) continue;
      const v = Math.max(0, num(it.main.value, 0));
      if (it.main.stat === 'hp') hpGear += v;
      else atkGear += v;
      if (Array.isArray(it.subs)) {
        for (const x of it.subs) {
          if (x && Object.prototype.hasOwnProperty.call(sub, x.stat) && isNum(x.value)) sub[x.stat] += x.value;
        }
      }
    }
    const mb = (id) => num(data.masteryBonus(id, s.mastery[id]), 0);
    let skillLevels = 0;
    for (const id of s.skills.equipped) if (id && s.skills.owned[id]) skillLevels += s.skills.owned[id];
    let allyLevels = 0;
    for (const id of s.allies.equipped) if (id && s.allies.owned[id]) allyLevels += s.allies.owned[id];

    const raw = {
      atk: Math.max(1, Math.round((base.atk + atkGear) * (1 + mb('might')))),
      hp: Math.max(1, Math.round((base.hp + hpGear) * (1 + mb('vitality')))),
      atkSpeed: Math.min(C.atkSpeed, H.atkSpeed * (1 + sub.atkSpeed)),
      critChance: Math.min(C.critChance, H.critChance + sub.critChance),
      critDmg: H.critDmg + sub.critDmg + mb('precision'),
      combo: Math.min(C.combo, sub.combo),
      counter: Math.min(C.counter, sub.counter),
      dodge: Math.min(C.dodge, sub.dodge),
      stun: Math.min(C.stun, sub.stun),
      lifesteal: Math.min(C.lifesteal, sub.lifesteal),
      regen: Math.min(C.regen, sub.regen),
      skillDmg: sub.skillDmg,
      bossDmg: sub.bossDmg,
      goldBonus: sub.goldBonus + mb('greed'),
      chestChance: Math.min(H.chestChanceCap, H.chestChance + mb('fortune')),
      skillLevels,
      allyLevels,
    };
    const fallback = { atk: 1, hp: 1, atkSpeed: H.atkSpeed, critChance: H.critChance, critDmg: H.critDmg, chestChance: H.chestChance };
    for (const k of Object.keys(raw)) {
      if (!isNum(raw[k])) raw[k] = num(fallback[k], 0);
    }
    return raw;
  }

  function getHeroStats() {
    if (!statsCache) statsCache = computeStats(api.s.equipped);
    return Object.assign({}, statsCache);
  }

  function getPower(stats) {
    return D().calcPower(isObj(stats) ? stats : getHeroStats());
  }

  function xpToNext() {
    return D().xpToNext(api.s.hero.level);
  }

  // ------------------------------------------------------------------ currencies
  function amountOf(n) {
    const v = Number(n);
    return isNum(v) && v > 0 ? v : 0;
  }

  function addGoldRaw(n) {
    const v = Math.floor(amountOf(n));
    if (!v) return 0;
    const s = api.s;
    s.gold += v;
    s.stats.goldEarned += v;
    return v;
  }

  function addXpRaw(n) {
    const v = amountOf(n);
    if (!v) return 0;
    const s = api.s;
    const data = D();
    const from = s.hero.level;
    s.hero.xp += v;
    let guard = 0;
    let need = data.xpToNext(s.hero.level);
    while (s.hero.xp >= need && guard < 10000) {
      s.hero.xp -= need;
      s.hero.level += 1;
      need = data.xpToNext(s.hero.level);
      guard++;
    }
    if (s.hero.level !== from) {
      statsDirty();
      emit('levelup', { level: s.hero.level, from });
    }
    return v;
  }

  function fixKeyTimerOn(s, now) {
    const data = D();
    const regen = data.KEY_REGEN_MS;
    if (s.keys >= data.MAX_KEYS) s.keyRegenAt = 0;
    else if (!(s.keyRegenAt > 0) || s.keyRegenAt > now + regen) s.keyRegenAt = now + regen;
  }

  // Grants keys whose regen time has passed; returns the number gained.
  function regenKeys(now) {
    const s = api.s;
    const data = D();
    const max = data.MAX_KEYS;
    const regen = data.KEY_REGEN_MS;
    fixKeyTimerOn(s, now);
    let gained = 0;
    while (s.keys < max && s.keyRegenAt > 0 && now >= s.keyRegenAt && gained < 1000) {
      s.keys += 1;
      gained += 1;
      s.keyRegenAt += regen;
    }
    fixKeyTimerOn(s, now);
    return gained;
  }

  function addGold(n) {
    const v = addGoldRaw(n);
    if (v) changed();
    return v;
  }
  function addGems(n) {
    const v = Math.floor(amountOf(n));
    if (v) {
      api.s.gems += v;
      changed();
    }
    return v;
  }
  function addChests(n) {
    const v = Math.floor(amountOf(n));
    if (v) {
      api.s.chests += v;
      changed();
    }
    return v;
  }
  function addPremiumChests(n) {
    const v = Math.floor(amountOf(n));
    if (v) {
      api.s.premiumChests += v;
      changed();
    }
    return v;
  }
  function addScrolls(n) {
    const v = Math.floor(amountOf(n));
    if (v) {
      api.s.scrolls += v;
      changed();
    }
    return v;
  }
  function addKeys(n) {
    const v = Math.floor(amountOf(n));
    if (v) {
      api.s.keys += v;
      fixKeyTimerOn(api.s, Date.now());
      changed();
    }
    return v;
  }
  function addXp(n) {
    const v = addXpRaw(n);
    if (v) changed();
    return v;
  }

  function canAfford(currency, n) {
    if (CURRENCIES.indexOf(currency) < 0) return false;
    const v = Number(n);
    if (!isNum(v)) return false;
    return api.s[currency] >= Math.max(0, v);
  }

  // Deducts without emitting; toasts on failure.
  function pay(currency, n) {
    if (CURRENCIES.indexOf(currency) < 0) return false;
    const v = Number(n);
    if (!isNum(v) || v < 0) return false;
    const s = api.s;
    if (s[currency] < v) {
      toast('Not enough ' + CURRENCY_NAMES[currency], 'bad');
      return false;
    }
    s[currency] -= v;
    if (currency === 'keys') fixKeyTimerOn(s, Date.now());
    return true;
  }

  function spend(currency, n) {
    if (!pay(currency, n)) return false;
    changed();
    return true;
  }

  function useKey() {
    if (api.s.keys < 1) {
      toast('No keys left. A new key arrives every 30 minutes.', 'bad');
      return false;
    }
    return spend('keys', 1);
  }

  function keyRegenRemaining(nowMs) {
    const s = api.s;
    const now = isNum(nowMs) ? nowMs : Date.now();
    if (s.keys >= D().MAX_KEYS || !(s.keyRegenAt > 0)) return 0;
    return Math.max(0, (s.keyRegenAt - now) / 1000);
  }

  function applyReward(r) {
    if (!isObj(r)) return;
    const s = api.s;
    if (r.gold) addGoldRaw(r.gold);
    if (r.gems) s.gems += Math.floor(amountOf(r.gems));
    if (r.chests) s.chests += Math.floor(amountOf(r.chests));
    if (r.premiumChests) s.premiumChests += Math.floor(amountOf(r.premiumChests));
    if (r.scrolls) s.scrolls += Math.floor(amountOf(r.scrolls));
    if (r.keys) {
      s.keys += Math.floor(amountOf(r.keys));
      fixKeyTimerOn(s, Date.now());
    }
    if (r.xp) addXpRaw(r.xp);
  }

  // ------------------------------------------------------------------ income estimate
  function estimateIncome(floorOverride) {
    const data = D();
    const s = api.s;
    const st = getHeroStats();
    const f = isNum(floorOverride) ? Math.max(1, Math.floor(floorOverride)) : s.campaign.floor;
    let hp = 0;
    let gold = 0;
    let xp = 0;
    let n = 0;
    for (let w = 1; w < data.WAVES_PER_FLOOR; w++) {
      for (const type of data.waveComposition(f, w)) {
        const es = data.enemyStats(f, type, { isBoss: false });
        hp += es.hp;
        gold += es.gold;
        xp += es.xp;
        n++;
      }
    }
    if (!n) {
      const es = data.enemyStats(f, 'skeleton', { isBoss: false });
      hp = es.hp;
      gold = es.gold;
      xp = es.xp;
      n = 1;
    }
    const avgHp = Math.max(1, hp / n);
    const dps = st.atk * (1 + st.critChance * Math.max(0, st.critDmg - 1)) * st.atkSpeed * (1 + st.combo);
    // Waves are not back-to-back kills: each one has a fixed overhead (walk-in, clear beat, run),
    // and skills/allies add damage on top of the auto-attack (see BALANCE.income).
    const I = data.BALANCE.income;
    const perWave = Math.max(1, n / Math.max(1, data.WAVES_PER_FLOOR - 1));
    const kit = kitDps(st, dps, perWave);
    const killTime = (perWave * avgHp) / Math.max(1e-9, kit * num(I.dpsMult, 1));
    const overhead = Math.max(0, num(I.waveOverhead, 0));
    // Survival: each wave costs the hero `threat × incoming DPS × killTime` HP (the enemies in
    // reach while it fights; a fast killer takes little) minus what it heals over the wave. A hero
    // whose HP runs out every `wavesPerLife` waves pays `deathCost` seconds (revive, run, walk-in)
    // per death — extra time per wave. Calibrated against live farming in tests/sim.mjs.
    const surv = heroSurvival(f, st, dps);
    const lost = num(I.threat, 0.2) * surv.incoming * killTime - surv.heal * (killTime + overhead);
    const wavesPerLife = lost > 0 ? st.hp / lost : Infinity;
    const deathOverhead = Number.isFinite(wavesPerLife) ? Math.max(0, num(I.deathCost, 0)) / Math.max(0.05, wavesPerLife) : 0;
    const kps = Math.max(0, Math.min(I.maxKillsPerSec, perWave / (overhead + killTime + deathOverhead)));
    const out = {
      floor: f,
      dps,
      kitDps: kit,
      avgEnemyHp: avgHp,
      incomingDps: surv.incoming, // damage per second of the enemies in reach (before threat)
      healPerSec: surv.heal,
      wavesPerLife: Number.isFinite(wavesPerLife) ? wavesPerLife : 0, // 0 = never dies farming here
      killsPerSec: kps,
      goldPerSec: kps * (gold / n) * (1 + st.goldBonus),
      xpPerSec: kps * (xp / n),
      chestsPerSec: kps * st.chestChance,
    };
    for (const k of Object.keys(out)) if (!isNum(out[k])) out[k] = 0;
    return out;
  }

  // Damage per second of the whole kit while a wave is in reach: auto-attacks (`dps`) plus every
  // equipped skill at its cooldown (area skills hit `BALANCE.income.aoeTargets` enemies) and every
  // equipped ally, so skill/ally upgrades raise AFK income too.
  function kitDps(st, dps, perWave) {
    const data = D();
    const s = api.s;
    const I = data.BALANCE.income;
    const aoe = Math.max(1, Math.min(perWave, num(I.aoeTargets, 2.5)));
    const crit = 1 + clampNum(num(st.critChance, 0), 0, 1) * Math.max(0, num(st.critDmg, 1.5) - 1);
    const hit = st.atk * (1 + Math.max(0, num(st.skillDmg, 0))) * crit;
    let skill = 0;
    const nS = skillSlotsUnlocked();
    for (let i = 0; i < nS; i++) {
      const id = s.skills.equipped[i];
      const L = id ? s.skills.owned[id] : 0;
      if (!L) continue;
      const p = data.skillParams(id, L);
      const cd = Math.max(1, num(p.cd, 10));
      if (id === 'blades') skill += (hit * num(p.dmg, 0) * (num(p.duration, 0) / Math.max(0.1, num(p.tick, 0.5))) * aoe) / cd;
      else if (id === 'warcry') skill += (dps * (num(p.buffAtk, 0) + num(p.buffSpd, 0)) * num(p.duration, 0)) / cd;
      else if (id === 'lightning') skill += (hit * num(p.dmg, 0) * Math.min(num(p.targets, 3), perWave)) / cd;
      else if (num(p.dmg, 0) > 0) skill += (hit * p.dmg * aoe) / cd; // bomb, frost, meteor
    }
    let ally = 0;
    const nA = allySlotsUnlocked();
    for (let i = 0; i < nA; i++) {
      const id = s.allies.equipped[i];
      const L = id ? s.allies.owned[id] : 0;
      if (!L) continue;
      const p = data.allyParams(id, L);
      if (!(num(p.dmg, 0) > 0)) continue;
      ally += (st.atk * p.dmg * (num(p.radius, 0) > 0 ? aoe : 1)) / Math.max(0.15, num(p.interval, 1));
    }
    return dps + skill * num(I.skillUptime, 1) + ally;
  }

  // What hits the hero while it farms waves 1–4 of floor f — the front enemy of each melee lane
  // plus every ranged enemy, less dodge — and what heals it per second: regen, lifesteal, the
  // Pixie and Healing Light.
  function heroSurvival(f, st, dps) {
    const data = D();
    const s = api.s;
    let incoming = 0;
    let waves = 0;
    for (let w = 1; w < data.WAVES_PER_FLOOR; w++) {
      const lanes = {};
      let ranged = 0;
      for (const type of data.waveComposition(f, w)) {
        const def = data.ENEMIES[type] || {};
        const es = data.enemyStats(f, type, { isBoss: false });
        const hit = es.atk * es.atkSpeed;
        if (def.ranged) ranged += hit;
        else {
          const lane = def.flying ? 'air' : 'ground';
          lanes[lane] = Math.max(lanes[lane] || 0, hit);
        }
      }
      incoming += ranged + (lanes.air || 0) + (lanes.ground || 0);
      waves++;
    }
    incoming = (incoming / Math.max(1, waves)) * (1 - clampNum(num(st.dodge, 0), 0, 1));
    let heal = st.hp * num(st.regen, 0) + dps * num(st.lifesteal, 0);
    const fairyLv = s.allies.equipped.indexOf('fairy') >= 0 && s.allies.equipped.indexOf('fairy') < allySlotsUnlocked() ? s.allies.owned.fairy || 0 : 0;
    if (fairyLv) {
      const p = data.allyParams('fairy', fairyLv);
      heal += (st.hp * num(p.heal, 0)) / Math.max(0.1, num(p.interval, 2));
    }
    const healLv = s.skills.equipped.indexOf('heal') >= 0 && s.skills.equipped.indexOf('heal') < skillSlotsUnlocked() ? s.skills.owned.heal || 0 : 0;
    if (healLv) {
      const p = data.skillParams('heal', healLv);
      heal += (st.hp * num(p.heal, 0)) / Math.max(1, num(p.cd, 14));
    }
    return { incoming, heal };
  }

  function offlineCapSeconds() {
    const data = D();
    const hours = data.BALANCE.income.offlineBaseHours + num(data.masteryBonus('patience', api.s.mastery.patience), 0);
    return Math.max(0, hours * 3600);
  }

  function collectOffline(nowMs) {
    const s = api.s;
    const data = D();
    const now = isNum(nowMs) ? nowMs : Date.now();
    const last = isNum(s.lastSeen) && s.lastSeen > 0 ? s.lastSeen : now;
    const seconds = (now - last) / 1000;
    if (!isNum(seconds) || seconds < data.BALANCE.income.offlineMinSeconds) return null;
    const capped = Math.min(seconds, offlineCapSeconds());
    const inc = estimateIncome();
    const eff = data.BALANCE.income.offlineEfficiency;
    const chestEff = num(data.BALANCE.income.offlineChestEfficiency, eff);
    const gold = Math.max(0, Math.floor(inc.goldPerSec * capped * eff));
    const chests = Math.max(0, Math.floor(inc.chestsPerSec * capped * chestEff));
    const xp = Math.max(0, Math.floor(inc.xpPerSec * capped * num(data.BALANCE.income.offlineXpEfficiency, eff)));
    const keys = regenKeys(now);
    addGoldRaw(gold);
    s.chests += chests;
    addXpRaw(xp);
    s.lastSeen = now;
    changed();
    persist();
    return { seconds: Math.floor(seconds), cappedSeconds: Math.floor(capped), gold, chests, xp, keys };
  }

  // ------------------------------------------------------------------ battle callbacks
  function grantKill(info) {
    const s = api.s;
    const data = D();
    const i = isObj(info) ? info : {};
    const isBoss = !!i.isBoss;
    const floor = isNum(i.floor) ? i.floor : s.campaign.floor;
    let baseGold = isNum(i.gold) && i.gold >= 0 ? i.gold : null;
    let baseXp = isNum(i.xp) && i.xp >= 0 ? i.xp : null;
    if (baseGold === null || baseXp === null) {
      const es = data.enemyStats(floor, i.typeId, { isBoss });
      if (baseGold === null) baseGold = es.gold;
      if (baseXp === null) baseXp = es.xp;
    }
    const st = getHeroStats();
    const gold = Math.max(0, Math.round(baseGold * (1 + st.goldBonus)));
    const xp = Math.max(0, Math.round(baseXp));
    const chest = isBoss || Math.random() < st.chestChance;
    s.stats.kills += 1;
    if (isBoss) s.stats.bossKills += 1;
    addGoldRaw(gold);
    if (chest) s.chests += 1;
    addXpRaw(xp);
    changed();
    return { gold, xp, chest };
  }

  function announceUnlocks(prev, next) {
    const data = D();
    const crossed = (f) => prev < f && next >= f;
    data.SKILL_SLOT_FLOORS.forEach((f, i) => {
      if (i > 0 && crossed(f)) {
        toast('Skill slot ' + (i + 1) + ' unlocked!', 'good');
        autoFillSkillSlots();
      }
    });
    data.ALLY_SLOT_FLOORS.forEach((f, i) => {
      if (crossed(f)) {
        toast('Ally slot ' + (i + 1) + ' unlocked!', 'good');
        autoFillAllySlots();
      }
    });
    for (const id of data.DUNGEON_IDS) {
      if (crossed(data.DUNGEONS[id].unlockFloor)) toast(data.DUNGEONS[id].name + ' unlocked!', 'good');
    }
  }

  function onFloorCleared(floor) {
    const s = api.s;
    const data = D();
    const c = s.campaign;
    const f = clampNum(isNum(floor) ? Math.floor(floor) : c.floor, 1, data.BALANCE.enemy.maxFloor - 1);
    const base = data.floorClearRewards(f);
    const st = getHeroStats();
    const gold = Math.max(0, Math.round(base.gold * (1 + st.goldBonus)));
    s.chests += base.chests;
    addGoldRaw(gold);
    s.gems += base.gems;
    const prevHigh = c.highestFloor;
    c.floor = f + 1;
    c.wave = 1;
    c.farming = false;
    c.highestFloor = Math.max(prevHigh, c.floor);
    if (c.highestFloor > prevHigh) announceUnlocks(prevHigh, c.highestFloor);
    changed();
    save();
    return { chests: base.chests, gold, gems: base.gems };
  }

  function setWave(n) {
    const c = api.s.campaign;
    const w = clampNum(toInt(Number(n), 1), 1, D().WAVES_PER_FLOOR);
    if (c.wave !== w) {
      c.wave = w;
      changed();
    }
  }

  function setFarming(on) {
    const c = api.s.campaign;
    const v = !!on;
    if (c.farming !== v) {
      c.farming = v;
      changed();
    }
  }

  function onHeroDied() {
    api.s.stats.deaths += 1;
    changed();
  }

  function grantFlyingChest() {
    const s = api.s;
    const data = D();
    const table = data.BALANCE.flyingChest;
    const e = table[DD.weightedIndex(table.map((x) => x.weight))] || table[0];
    const rnd = () => DD.randInt(Math.floor(num(e.min, 1)), Math.floor(num(e.max, num(e.min, 1))));
    let amount = 0;
    let label = '';
    switch (e.type) {
      case 'gems':
        amount = rnd();
        s.gems += amount;
        label = '+' + amount + ' Gems';
        break;
      case 'chests':
        amount = rnd();
        s.chests += amount;
        label = '+' + amount + ' Chests';
        break;
      case 'gold': {
        const st = getHeroStats();
        const inc = estimateIncome();
        const floorMin = data.killGold(s.campaign.floor) * num(e.minKills, 10) * (1 + st.goldBonus);
        amount = Math.max(1, Math.round(Math.max(inc.goldPerSec * num(e.seconds, 60), floorMin)));
        addGoldRaw(amount);
        label = '+' + DD.fmt(amount) + ' Gold';
        break;
      }
      case 'scrolls':
        amount = rnd();
        s.scrolls += amount;
        label = '+' + amount + ' Skill Scrolls';
        break;
      case 'key':
      default:
        amount = Math.max(1, rnd());
        s.keys += amount;
        fixKeyTimerOn(s, Date.now());
        label = amount === 1 ? '+1 Key' : '+' + amount + ' Keys';
        break;
    }
    s.stats.flyingChests += 1;
    changed();
    return { type: e.type === 'key' ? 'key' : e.type, amount, label };
  }

  function dungeonUnlocked(id) {
    const d = D().DUNGEONS[id];
    return !!d && api.s.campaign.highestFloor >= d.unlockFloor;
  }

  function dungeonLevel(id) {
    const d = api.s.dungeons[id];
    return d ? d.level : 1;
  }

  function grantDungeonWin(id) {
    const s = api.s;
    const data = D();
    if (!data.DUNGEONS[id] || !s.dungeons[id]) return {};
    const lvl = s.dungeons[id].level;
    const r = data.dungeonRewards(id, lvl);
    const out = {};
    if (r.gold) {
      const st = getHeroStats();
      out.gold = Math.max(1, Math.round(r.gold * (1 + st.goldBonus)));
      addGoldRaw(out.gold);
    }
    if (r.gems) {
      out.gems = Math.floor(r.gems);
      s.gems += out.gems;
    }
    if (r.scrolls) {
      out.scrolls = Math.floor(r.scrolls);
      s.scrolls += out.scrolls;
    }
    if (r.premiumChests) {
      out.premiumChests = Math.floor(r.premiumChests);
      s.premiumChests += out.premiumChests;
    }
    s.dungeons[id].level = lvl + 1;
    s.stats.dungeonsWon += 1;
    changed();
    save();
    return out;
  }

  // ------------------------------------------------------------------ chests & gear
  function sellGold(item) {
    const st = getHeroStats();
    return Math.max(1, Math.round(D().itemSellValue(item) * (1 + st.goldBonus)));
  }

  function itemSellValue(item) {
    if (!isObj(item)) return 0;
    return sellGold(item);
  }

  function emptyCompare() {
    const p = getPower();
    return { current: null, powerBefore: p, powerAfter: p, delta: 0, lines: [] };
  }

  function compareItem(item) {
    const data = D();
    const s = api.s;
    if (!isObj(item) || !data.SLOT_INFO[item.slot] || !isObj(item.main)) return emptyCompare();
    const current = s.equipped[item.slot] || null;
    const before = getHeroStats();
    const eq = Object.assign({}, s.equipped);
    eq[item.slot] = item;
    const after = computeStats(eq);
    const powerBefore = data.calcPower(before);
    const powerAfter = data.calcPower(after);
    const lines = [];
    const mainStat = data.SLOT_INFO[item.slot].stat;
    const mb = current && isObj(current.main) ? num(current.main.value, 0) : 0;
    const ma = num(item.main.value, 0);
    lines.push({ stat: mainStat, label: data.STAT_INFO[mainStat].label, before: mb, after: ma, diff: ma - mb, fmt: 'num' });
    const subVal = (it, k) => {
      if (!it || !Array.isArray(it.subs)) return 0;
      let v = 0;
      for (const x of it.subs) if (x && x.stat === k && isNum(x.value)) v += x.value;
      return v;
    };
    for (const k of data.SUBSTATS) {
      const b = subVal(current, k);
      const a = subVal(item, k);
      if (!a && !b) continue;
      lines.push({ stat: k, label: data.STAT_INFO[k].label, before: b, after: a, diff: a - b, fmt: 'pct' });
    }
    return { current, powerBefore, powerAfter, delta: powerAfter - powerBefore, lines };
  }

  function comparePending() {
    const p = api.s.pendingItem;
    return p ? compareItem(p) : null;
  }

  function isUpgrade(item) {
    return compareItem(item).delta > 0;
  }

  // Equip an item into its slot; the previously worn item is sold. No 'state:changed'.
  function doEquip(item) {
    const s = api.s;
    const old = s.equipped[item.slot] || null;
    s.equipped[item.slot] = item;
    s.stats.itemsEquipped += 1;
    let gold = 0;
    if (old) {
      gold = sellGold(old);
      addGoldRaw(gold);
      s.stats.itemsSold += 1;
    }
    statsDirty();
    emit('item:equipped', { item, old });
    if (old) emit('item:sold', { item: old, gold });
    return gold;
  }

  function doSell(item) {
    const s = api.s;
    const gold = sellGold(item);
    addGoldRaw(gold);
    s.stats.itemsSold += 1;
    emit('item:sold', { item, gold });
    return gold;
  }

  function rarityLabel(item) {
    const r = D().RARITIES[item.rarity];
    return (r ? r.name + ' ' : '') + item.name;
  }

  function openChest(opts) {
    const s = api.s;
    const data = D();
    const premium = !!(isObj(opts) && opts.premium);
    if (s.pendingItem) return null;
    if (premium ? s.premiumChests < 1 : s.chests < 1) return null;
    if (premium) s.premiumChests -= 1;
    else s.chests -= 1;
    const hf = s.campaign.highestFloor;
    const ilvl = premium ? data.premiumIlvl(hf) : data.itemIlvl(hf);
    const item = data.rollItem({ ilvl, chestLevel: s.chestLevel, premium });
    s.stats.chestsOpened += 1;
    if (item.rarity > s.stats.bestItemRarity) s.stats.bestItemRarity = item.rarity;

    let decision = 'pending';
    if (s.autoOpen) {
      const al = s.settings.autoLoot;
      const upgrade = compareItem(item).delta > 0;
      if (upgrade) {
        decision = al.autoEquip ? 'equipped' : 'pending'; // auto-open pauses until it is resolved
      } else if (al.sell[item.rarity]) {
        decision = 'sold';
      } else if (item.rarity >= al.stopRarity) {
        decision = 'pending';
        s.autoOpen = false;
        toast('Auto-open stopped: ' + rarityLabel(item) + '!', item.rarity >= 4 ? 'rare' : 'info');
      } else {
        decision = 'pending';
        s.autoOpen = false;
        toast('Auto-open paused: decide on ' + rarityLabel(item), 'info');
      }
    }

    if (decision === 'equipped') {
      doEquip(item);
      if (item.rarity >= 4) toast(rarityLabel(item) + ' equipped!', 'rare');
    } else if (decision === 'sold') {
      const g = doSell(item);
      if (item.rarity >= 4) toast('Auto-sold ' + rarityLabel(item) + ' for ' + DD.fmt(g) + ' gold', 'info');
    } else {
      s.pendingItem = item;
    }
    emit('chest:opened', { item, decision, premium });
    changed();
    return { item, decision };
  }

  function equipPending() {
    const s = api.s;
    const item = s.pendingItem;
    if (!item) return false;
    s.pendingItem = null;
    doEquip(item);
    changed();
    return true;
  }

  function sellPending() {
    const s = api.s;
    const item = s.pendingItem;
    if (!item) return false;
    s.pendingItem = null;
    doSell(item);
    changed();
    return true;
  }

  function chestUpgradeCost() {
    const s = api.s;
    const data = D();
    if (s.chestLevel >= data.MAX_CHEST_LEVEL) return Infinity;
    return data.chestUpgradeCost(s.chestLevel);
  }

  function upgradeChestLevel() {
    const s = api.s;
    const data = D();
    if (s.chestLevel >= data.MAX_CHEST_LEVEL) {
      toast('The chest is already at max level', 'info');
      return false;
    }
    if (!pay('gold', data.chestUpgradeCost(s.chestLevel))) return false;
    s.chestLevel += 1;
    const L = s.chestLevel;
    emit('purchase', { kind: 'chest', id: 'chest', level: L });
    const unlockNames = { 6: 'Legendary', 11: 'Mythic', 16: 'Celestial' };
    if (unlockNames[L]) toast('Chest level ' + L + '! ' + unlockNames[L] + ' loot can now drop!', 'rare');
    else toast('Chest level ' + L + '!', 'good');
    changed();
    return true;
  }

  function rarityOdds(level) {
    return D().rarityOdds(isNum(level) ? level : api.s.chestLevel);
  }

  function premiumOdds(level) {
    return D().premiumOdds(isNum(level) ? level : api.s.chestLevel);
  }

  function setAutoOpen(on) {
    const s = api.s;
    const v = !!on;
    if (v && s.chests < 1) {
      toast('No chests to open', 'bad');
      if (s.autoOpen) {
        s.autoOpen = false;
        changed();
      }
      return false;
    }
    if (s.autoOpen === v) return true;
    s.autoOpen = v;
    if (v) {
      s.stats.autoOpenUsed += 1;
      autoOpenTimer = D().BALANCE.timers.autoOpenInterval; // first chest opens on the next tick
    }
    changed();
    return true;
  }

  // ------------------------------------------------------------------ skills
  function skillSlotsUnlocked() {
    return slotsFor(D().SKILL_SLOT_FLOORS, api.s.campaign.highestFloor, 1);
  }

  function skillCost(id) {
    const data = D();
    const def = data.SKILLS[id];
    if (!def) return {};
    const L = api.s.skills.owned[id];
    if (!L) return { unlock: def.unlock };
    if (L >= data.MAX_SKILL_LEVEL) return {};
    return { upgrade: data.skillUpgradeCost(L) };
  }

  function autoFillSkillSlots() {
    const s = api.s;
    const n = skillSlotsUnlocked();
    let filled = false;
    for (const id of D().SKILL_IDS) {
      if (!s.skills.owned[id] || s.skills.equipped.indexOf(id) >= 0) continue;
      const free = s.skills.equipped.findIndex((x, i) => i < n && !x);
      if (free < 0) break;
      s.skills.equipped[free] = id;
      filled = true;
    }
    if (filled) statsDirty();
  }

  function unlockSkill(id) {
    const s = api.s;
    const data = D();
    const def = data.SKILLS[id];
    if (!def) return false;
    if (s.skills.owned[id]) {
      toast(def.name + ' is already unlocked', 'info');
      return false;
    }
    if (!pay('scrolls', def.unlock)) return false;
    s.skills.owned[id] = 1;
    const n = skillSlotsUnlocked();
    const free = s.skills.equipped.findIndex((x, i) => i < n && !x);
    if (free >= 0) s.skills.equipped[free] = id;
    statsDirty();
    emit('purchase', { kind: 'skill', id, action: 'unlock', level: 1 });
    toast(def.name + ' unlocked!', 'good');
    changed();
    return true;
  }

  function upgradeSkill(id) {
    const s = api.s;
    const data = D();
    const def = data.SKILLS[id];
    if (!def) return false;
    const L = s.skills.owned[id];
    if (!L) {
      toast('Unlock ' + def.name + ' first', 'bad');
      return false;
    }
    if (L >= data.MAX_SKILL_LEVEL) {
      toast(def.name + ' is at max level', 'info');
      return false;
    }
    if (!pay('scrolls', data.skillUpgradeCost(L))) return false;
    s.skills.owned[id] = L + 1;
    statsDirty();
    emit('purchase', { kind: 'skill', id, action: 'upgrade', level: L + 1 });
    changed();
    return true;
  }

  function equipSkill(id, slot) {
    const s = api.s;
    const data = D();
    const def = data.SKILLS[id];
    if (!def) return false;
    if (!s.skills.owned[id]) {
      toast('Unlock ' + def.name + ' first', 'bad');
      return false;
    }
    const i = toInt(Number(slot), -1);
    if (i < 0 || i >= 4) return false;
    if (i >= skillSlotsUnlocked()) {
      toast('Skill slot ' + (i + 1) + ' unlocks at floor ' + data.SKILL_SLOT_FLOORS[i], 'bad');
      return false;
    }
    const eq = s.skills.equipped;
    const cur = eq.indexOf(id);
    if (cur === i) return true;
    if (cur >= 0) eq[cur] = eq[i];
    eq[i] = id;
    statsDirty();
    changed();
    return true;
  }

  function unequipSkill(slot) {
    const eq = api.s.skills.equipped;
    const i = toInt(Number(slot), -1);
    if (i < 0 || i >= eq.length || !eq[i]) return false;
    eq[i] = null;
    statsDirty();
    changed();
    return true;
  }

  // ------------------------------------------------------------------ allies
  function allySlotsUnlocked() {
    return slotsFor(D().ALLY_SLOT_FLOORS, api.s.campaign.highestFloor, 0);
  }

  function allyUpgradeCost(id) {
    const data = D();
    if (!data.ALLIES[id]) return Infinity;
    const L = api.s.allies.owned[id] || 1;
    if (L >= data.MAX_ALLY_LEVEL) return Infinity;
    return data.allyUpgradeCost(L);
  }

  function allyCost(id) {
    const data = D();
    const def = data.ALLIES[id];
    if (!def) return {};
    const L = api.s.allies.owned[id];
    if (!L) return { unlock: def.unlock };
    if (L >= data.MAX_ALLY_LEVEL) return {};
    return { upgrade: data.allyUpgradeCost(L) };
  }

  function autoFillAllySlots() {
    const s = api.s;
    const n = allySlotsUnlocked();
    let filled = false;
    for (const id of D().ALLY_IDS) {
      if (!s.allies.owned[id] || s.allies.equipped.indexOf(id) >= 0) continue;
      const free = s.allies.equipped.findIndex((x, i) => i < n && !x);
      if (free < 0) break;
      s.allies.equipped[free] = id;
      filled = true;
    }
    if (filled) statsDirty();
  }

  function unlockAlly(id) {
    const s = api.s;
    const data = D();
    const def = data.ALLIES[id];
    if (!def) return false;
    if (s.allies.owned[id]) {
      toast(def.name + ' has already joined you', 'info');
      return false;
    }
    if (!pay('gems', def.unlock)) return false;
    s.allies.owned[id] = 1;
    const n = allySlotsUnlocked();
    const free = s.allies.equipped.findIndex((x, i) => i < n && !x);
    if (free >= 0) s.allies.equipped[free] = id;
    statsDirty();
    emit('purchase', { kind: 'ally', id, action: 'unlock', level: 1 });
    if (n === 0) toast(def.name + ' recruited! Ally slots unlock at floor ' + data.ALLY_SLOT_FLOORS[0], 'good');
    else toast(def.name + ' joined your party!', 'good');
    changed();
    return true;
  }

  function upgradeAlly(id) {
    const s = api.s;
    const data = D();
    const def = data.ALLIES[id];
    if (!def) return false;
    const L = s.allies.owned[id];
    if (!L) {
      toast('Recruit ' + def.name + ' first', 'bad');
      return false;
    }
    if (L >= data.MAX_ALLY_LEVEL) {
      toast(def.name + ' is at max level', 'info');
      return false;
    }
    if (!pay('gold', data.allyUpgradeCost(L))) return false;
    s.allies.owned[id] = L + 1;
    statsDirty();
    emit('purchase', { kind: 'ally', id, action: 'upgrade', level: L + 1 });
    changed();
    return true;
  }

  function equipAlly(id, slot) {
    const s = api.s;
    const data = D();
    const def = data.ALLIES[id];
    if (!def) return false;
    if (!s.allies.owned[id]) {
      toast('Recruit ' + def.name + ' first', 'bad');
      return false;
    }
    const i = toInt(Number(slot), -1);
    if (i < 0 || i >= 2) return false;
    if (i >= allySlotsUnlocked()) {
      toast('Ally slot ' + (i + 1) + ' unlocks at floor ' + data.ALLY_SLOT_FLOORS[i], 'bad');
      return false;
    }
    const eq = s.allies.equipped;
    const cur = eq.indexOf(id);
    if (cur === i) return true;
    if (cur >= 0) eq[cur] = eq[i];
    eq[i] = id;
    statsDirty();
    changed();
    return true;
  }

  function unequipAlly(slot) {
    const eq = api.s.allies.equipped;
    const i = toInt(Number(slot), -1);
    if (i < 0 || i >= eq.length || !eq[i]) return false;
    eq[i] = null;
    statsDirty();
    changed();
    return true;
  }

  // ------------------------------------------------------------------ mastery
  function masteryCost(id) {
    const data = D();
    if (!data.MASTERY[id]) return Infinity;
    return data.masteryCost(id, api.s.mastery[id]);
  }

  function upgradeMastery(id) {
    const s = api.s;
    const data = D();
    const def = data.MASTERY[id];
    if (!def) return false;
    const L = s.mastery[id];
    if (L >= def.max) {
      toast(def.name + ' is fully mastered', 'info');
      return false;
    }
    if (!pay('gems', data.masteryCost(id, L))) return false;
    s.mastery[id] = L + 1;
    statsDirty();
    emit('purchase', { kind: 'mastery', id, level: L + 1 });
    changed();
    return true;
  }

  // ------------------------------------------------------------------ quests
  function questValue(q) {
    const s = api.s;
    switch (q.type) {
      case 'stat':
        return num(s.stats[q.key], 0);
      case 'floor':
        return s.campaign.highestFloor;
      case 'heroLevel':
        return s.hero.level;
      case 'chestLevel':
        return s.chestLevel;
      case 'skillsOwned':
        return Object.keys(s.skills.owned).length;
      case 'skillsEquipped':
        return s.skills.equipped.filter(Boolean).length;
      case 'skillLevel': {
        let best = 0;
        for (const id of Object.keys(s.skills.owned)) best = Math.max(best, s.skills.owned[id]);
        return best;
      }
      case 'alliesOwned':
        return Object.keys(s.allies.owned).length;
      case 'masteryTotal': {
        let t = 0;
        for (const id of Object.keys(s.mastery)) t += num(s.mastery[id], 0);
        return t;
      }
      case 'equippedCount':
        return D().SLOTS.filter((slot) => !!s.equipped[slot]).length;
      case 'power':
        return getPower();
      case 'rarity':
        return s.stats.bestItemRarity >= q.key ? 1 : 0;
      default:
        return 0;
    }
  }

  function currentQuest() {
    const data = D();
    const s = api.s;
    const q = data.questAt(s.quest.index);
    if (!q) return null;
    const value = num(questValue(q), 0);
    const target = Math.max(1, num(q.target, 1));
    return {
      id: q.id,
      text: q.text,
      progress: Math.max(0, Math.min(target, Math.floor(value))),
      target,
      done: value >= target,
      reward: q.reward,
      rewardText: data.rewardText(q.reward),
    };
  }

  function checkQuestReady() {
    if (checkingQuest || !_s) return;
    checkingQuest = true;
    try {
      const q = currentQuest();
      if (q && q.done && questReadyIndex !== _s.quest.index) {
        questReadyIndex = _s.quest.index;
        emit('quest:ready', { quest: q });
      }
    } finally {
      checkingQuest = false;
    }
  }

  function claimQuest() {
    const s = api.s;
    const q = currentQuest();
    if (!q) return false;
    if (!q.done) {
      toast('Quest not complete yet', 'bad');
      return false;
    }
    applyReward(q.reward);
    s.quest.claimedIds.push(q.id);
    if (s.quest.claimedIds.length > MAX_CLAIMED_IDS) s.quest.claimedIds.splice(0, s.quest.claimedIds.length - MAX_CLAIMED_IDS);
    s.quest.index += 1;
    questReadyIndex = -1;
    emit('quest:claimed', { quest: q });
    changed();
    return true;
  }

  // ------------------------------------------------------------------ settings
  function setSetting(path, value) {
    const s = api.s;
    const parts = String(path || '')
      .replace(/^settings\./, '')
      .split('.')
      .filter(Boolean);
    if (!parts.length) return false;
    let obj = s.settings;
    for (let i = 0; i < parts.length - 1; i++) {
      obj = obj[parts[i]];
      if (obj === null || typeof obj !== 'object') return false;
    }
    const key = parts[parts.length - 1];
    if (!Object.prototype.hasOwnProperty.call(obj, key)) return false;
    const cur = obj[key];
    let v = value;
    if (Array.isArray(cur)) {
      if (!Array.isArray(v) || v.length !== cur.length) return false;
      v = v.map((x) => !!x);
    } else if (typeof cur === 'boolean') {
      v = !!v;
    } else if (typeof cur === 'number') {
      v = Number(v);
      if (!isNum(v)) return false;
      if (key === 'speed') v = clampNum(Math.round(v), 1, 3);
      if (key === 'stopRarity') v = clampNum(Math.floor(v), 0, D().RARITIES.length);
    } else {
      return false;
    }
    obj[key] = v;
    changed();
    return true;
  }

  // ------------------------------------------------------------------ tick
  function tick(dtReal) {
    const s = api.s;
    const data = D();
    const dt = isNum(dtReal) ? clampNum(dtReal, 0, 5) : 0;
    s.stats.playTime += dt;

    if (regenKeys(Date.now()) > 0) changed();

    if (s.autoOpen && !s.pendingItem) {
      const interval = data.BALANCE.timers.autoOpenInterval;
      autoOpenTimer += dt;
      let guard = 0;
      while (autoOpenTimer >= interval && s.autoOpen && !s.pendingItem && guard < 20) {
        autoOpenTimer -= interval;
        guard++;
        if (s.chests < 1) {
          s.autoOpen = false;
          toast('Out of chests. Auto-open stopped.', 'info');
          changed();
          break;
        }
        openChest({});
      }
      if (autoOpenTimer > interval) autoOpenTimer = interval;
    } else if (!s.autoOpen) {
      autoOpenTimer = 0;
    }

    autosaveTimer += dt;
    if (autosaveTimer >= data.BALANCE.timers.autosave) save();
  }

  // ------------------------------------------------------------------ export
  Object.assign(api, {
    SAVE_KEY,
    invalidate,
    load,
    save,
    serialize,
    deserialize,
    reset,
    exportCode,
    importCode,
    tick,

    getHeroStats,
    getPower,
    xpToNext,

    addGold,
    addGems,
    addChests,
    addPremiumChests,
    addXp,
    addScrolls,
    addKeys,
    spend,
    canAfford,

    grantKill,
    onFloorCleared,
    setWave,
    setFarming,
    onHeroDied,
    grantFlyingChest,
    grantDungeonWin,
    dungeonUnlocked,
    dungeonLevel,
    useKey,
    keyRegenRemaining,

    openChest,
    equipPending,
    sellPending,
    comparePending,
    compareItem,
    isUpgrade,
    itemSellValue,
    chestUpgradeCost,
    upgradeChestLevel,
    rarityOdds,
    premiumOdds,
    setAutoOpen,

    skillSlotsUnlocked,
    unlockSkill,
    upgradeSkill,
    equipSkill,
    unequipSkill,
    skillCost,
    allySlotsUnlocked,
    unlockAlly,
    upgradeAlly,
    equipAlly,
    unequipAlly,
    allyUpgradeCost,
    allyCost,
    upgradeMastery,
    masteryCost,

    currentQuest,
    claimQuest,

    collectOffline,
    offlineCapSeconds,
    estimateIncome,
    setSetting,
  });

  DD.state = api;
})(globalThis.DD);
