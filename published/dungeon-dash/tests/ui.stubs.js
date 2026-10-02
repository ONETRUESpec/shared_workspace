/* Dungeon Dash — UI test stubs (loaded by tests/ui.harness.html).
 *
 * Load order in the harness: core.js, data.js, state.js, sprites.js (real modules when they exist),
 * then this file, then render.js (optional) and ui.js.
 *
 * Installs:
 *   - DD.battle: a deterministic fake exposing every view field from CONTRACT §6 plus the action
 *     functions the UI calls (castSkill, challengeBoss, startDungeon, leaveDungeon, tapAt).
 *   - Fallback fakes for DD.data / DD.state / DD.sprites when the real modules failed to load, so the
 *     UI can still be exercised in isolation (the real modules are always preferred).
 *   - DD.audio / DD.render no-ops when missing.
 *   - window.UIH: scenario helpers driven by tests/ui.shot.mjs. */
(function (DD) {
  'use strict';
  if (!DD) throw new Error('core.js must load before ui.stubs.js');

  const real = {
    data: !!DD.data,
    state: !!DD.state,
    sprites: !!DD.sprites,
  };

  // ======================================================================== fallback DD.data
  if (!DD.data) {
    const RARITIES = [
      ['common', 'Common', '#9aa3ad'],
      ['uncommon', 'Uncommon', '#5fd068'],
      ['rare', 'Rare', '#4aa3ff'],
      ['epic', 'Epic', '#b46cff'],
      ['legendary', 'Legendary', '#ffa726'],
      ['mythic', 'Mythic', '#ff5252'],
      ['celestial', 'Celestial', '#5ef3ff'],
    ].map((r, i) => ({ idx: i, id: r[0], name: r[1], color: r[2], mult: [1, 1.35, 1.8, 2.45, 3.3, 4.5, 6.2][i], subs: [0, 1, 2, 3, 4, 4, 5][i] }));
    const SLOTS = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'belt', 'ring', 'amulet'];
    const SLOT_STAT = { weapon: 'atk', helmet: 'hp', armor: 'hp', gloves: 'atk', boots: 'hp', belt: 'hp', ring: 'atk', amulet: 'atk' };
    const SLOT_INFO = {};
    for (const s of SLOTS) SLOT_INFO[s] = { id: s, name: s[0].toUpperCase() + s.slice(1), stat: SLOT_STAT[s], mult: 1 };
    const STAT_INFO = {
      atk: { label: 'Attack', short: 'ATK', fmt: 'num' },
      hp: { label: 'Health', short: 'HP', fmt: 'num' },
      atkSpeed: { label: 'Attack Speed', short: 'SPD', fmt: 'pct' },
      critChance: { label: 'Crit Chance', short: 'CRIT', fmt: 'pct' },
      critDmg: { label: 'Crit Damage', short: 'CDMG', fmt: 'pct' },
      combo: { label: 'Combo', short: 'CMB', fmt: 'pct' },
      counter: { label: 'Counter', short: 'CTR', fmt: 'pct' },
      dodge: { label: 'Dodge', short: 'DDG', fmt: 'pct' },
      stun: { label: 'Stun', short: 'STN', fmt: 'pct' },
      lifesteal: { label: 'Lifesteal', short: 'LS', fmt: 'pct' },
      regen: { label: 'Regen', short: 'RGN', fmt: 'pct', suffix: '/s' },
      skillDmg: { label: 'Skill Damage', short: 'SKL', fmt: 'pct' },
      bossDmg: { label: 'Boss Damage', short: 'BOSS', fmt: 'pct' },
      goldBonus: { label: 'Gold Bonus', short: 'GOLD', fmt: 'pct' },
      chestChance: { label: 'Chest Drop', short: 'CHEST', fmt: 'pct' },
    };
    const SUBSTATS = ['critChance', 'critDmg', 'atkSpeed', 'combo', 'counter', 'dodge', 'stun', 'lifesteal', 'regen', 'skillDmg', 'bossDmg', 'goldBonus'];
    const mkMap = (rows) => {
      const o = {};
      for (const r of rows) o[r.id] = r;
      return o;
    };
    const SKILLS = mkMap([
      { id: 'bomb', name: 'Fire Bomb', rarity: 1, cd: 8, unlock: 0 },
      { id: 'blades', name: 'Spinning Blades', rarity: 2, cd: 12, unlock: 10 },
      { id: 'warcry', name: 'Battle Cry', rarity: 2, cd: 15, unlock: 10 },
      { id: 'heal', name: 'Healing Light', rarity: 2, cd: 14, unlock: 15 },
      { id: 'lightning', name: 'Chain Lightning', rarity: 3, cd: 7, unlock: 20 },
      { id: 'shield', name: 'Arcane Shield', rarity: 3, cd: 18, unlock: 20 },
      { id: 'frost', name: 'Frost Nova', rarity: 4, cd: 16, unlock: 30 },
      { id: 'meteor', name: 'Meteor Strike', rarity: 5, cd: 20, unlock: 40 },
    ]);
    const ALLIES = mkMap([
      { id: 'wolf', name: 'Dire Wolf', rarity: 2, unlock: 100 },
      { id: 'fairy', name: 'Pixie', rarity: 3, unlock: 200 },
      { id: 'drone_ally', name: 'Battle Drone', rarity: 3, unlock: 400 },
      { id: 'golem_ally', name: 'Ember Golem', rarity: 4, unlock: 600 },
    ]);
    const MASTERY = mkMap([
      { id: 'might', name: 'Might', max: 100, per: 0.06, flavor: 'Permanently increases ATK.' },
      { id: 'vitality', name: 'Vitality', max: 100, per: 0.06, flavor: 'Permanently increases max HP.' },
      { id: 'greed', name: 'Greed', max: 50, per: 0.08, flavor: 'Earn more gold.' },
      { id: 'fortune', name: 'Fortune', max: 30, per: 0.01, flavor: 'More chest drops.' },
      { id: 'precision', name: 'Precision', max: 50, per: 0.05, flavor: 'Crits hit harder.' },
      { id: 'patience', name: 'Patience', max: 16, per: 1, flavor: 'Longer AFK rewards.' },
    ]);
    const DUNGEONS = mkMap([
      { id: 'dragon', name: "Dragon's Lair", unlockFloor: 3, color: '#ff5a3c', rewardName: 'Skill Scrolls' },
      { id: 'horde', name: 'Zombie Horde', unlockFloor: 6, color: '#7dff6a', rewardName: 'Gems' },
      { id: 'vault', name: 'Golem Vault', unlockFloor: 10, color: '#e0b04a', rewardName: 'Premium Chests' },
      { id: 'mothership', name: 'Mothership', unlockFloor: 20, color: '#21e6ff', rewardName: 'Gold & Scrolls' },
    ]);
    const BIOMES = ['The Crypt', 'Fungal Hollows', 'Magma Forge', 'Clockwork Depths', 'Neon Grid', 'Void Rift'].map((name, i) => ({ idx: i, name }));
    const pct = (v) => DD.fmtPct(v, 1);
    const odds = (L) => {
      const a = [0.8, 0.18, 0.02, 0, 0, 0, 0];
      const b = [0.04, 0.16, 0.3, 0.27, 0.15, 0.06, 0.02];
      const t = (Math.max(1, Math.min(20, L)) - 1) / 19;
      const o = a.map((x, i) => x + (b[i] - x) * t);
      if (L < 6) o[4] = 0;
      if (L < 11) o[5] = 0;
      if (L < 16) o[6] = 0;
      const sum = o.reduce((x, y) => x + y, 0);
      return o.map((x) => x / sum);
    };
    DD.data = {
      RARITIES,
      SLOTS,
      SLOT_INFO,
      STAT_INFO,
      SUBSTATS,
      ERAS: ['Medieval', 'Arcane', 'Infernal', 'Steampunk', 'Cyber', 'Cosmic'].map((name, i) => ({ idx: i, name, from: 1 + i * 10 })),
      BIOMES,
      SKILLS,
      SKILL_IDS: Object.keys(SKILLS),
      ALLIES,
      ALLY_IDS: Object.keys(ALLIES),
      MASTERY,
      MASTERY_IDS: Object.keys(MASTERY),
      DUNGEONS,
      DUNGEON_IDS: Object.keys(DUNGEONS),
      WAVES_PER_FLOOR: 5,
      BOSS_TIME: 30,
      DUNGEON_TIME: 45,
      MAX_CHEST_LEVEL: 20,
      MAX_KEYS: 5,
      KEY_REGEN_MS: 1800000,
      SKILL_SLOT_FLOORS: [1, 5, 12, 25],
      ALLY_SLOT_FLOORS: [4, 20],
      MAX_SKILL_LEVEL: 30,
      MAX_ALLY_LEVEL: 50,
      biomeForFloor: (f) => BIOMES[Math.floor((Math.max(1, f) - 1) / 10) % 6],
      rarityOdds: odds,
      chestUpgradeCost: (L) => Math.floor(400 * Math.pow(2.15, L - 1)),
      skillDesc: (id, L) => SKILLS[id].name + ' at level ' + L + ': deals ' + pct(3 + 0.3 * (L - 1)) + ' ATK.',
      allyDesc: (id, L) => ALLIES[id].name + ' attacks for ' + pct(0.4 + 0.05 * (L - 1)) + ' of your ATK.',
      masteryDesc: (id, L) => '+' + pct(MASTERY[id].per * L) + ' ' + MASTERY[id].name,
      dungeonDesc: (id) => 'Defeat the guardian of ' + DUNGEONS[id].name + ' within 45s.',
      dungeonRewards: (id, L) => ({ dragon: { scrolls: 4 + 2 * L }, horde: { gems: 20 + 10 * L }, vault: { premiumChests: 1 + Math.floor(L / 2) }, mothership: { gold: 50000 * L, scrolls: 3 + L } })[id] || {},
      dungeonFloor: (L) => 2 + L * 3,
      rewardText: (r) =>
        Object.keys(r || {})
          .filter((k) => r[k] > 0)
          .map((k) => '+' + DD.fmt(r[k]) + ' ' + k)
          .join(', '),
      fmtStat: (k, v) => (STAT_INFO[k] && STAT_INFO[k].fmt === 'num' ? DD.fmt(v) : (v >= 0 ? '+' : '') + pct(v)),
      calcPower: (st) => Math.round((st.atk + 0.1 * st.hp) * (1 + st.critChance * (st.critDmg - 1)) * st.atkSpeed),
      xpToNext: (L) => Math.floor(30 * Math.pow(1.18, L - 1)),
      itemSellValue: (it) => Math.floor(10 * Math.pow(1.1, (it.ilvl || 1) - 1) * Math.pow(1 + (it.rarity || 0), 2)),
      createItem: (o) => ({
        id: DD.uid('it'),
        slot: o.slot,
        rarity: o.rarity,
        ilvl: o.ilvl,
        era: Math.min(5, Math.floor((o.ilvl - 1) / 10)),
        name: o.name || 'Item',
        main: { stat: SLOT_STAT[o.slot], value: Math.round((SLOT_STAT[o.slot] === 'atk' ? 6 : 60) * RARITIES[o.rarity].mult * Math.pow(1.09, o.ilvl - 1)) },
        subs: o.subs || [],
      }),
    };
  }

  // ======================================================================== fallback DD.state
  if (!DD.state) {
    const data = () => DD.data;
    const emit = (e, p) => DD.bus.emit(e, p || {});
    const changed = () => emit('state:changed', {});
    const toast = (text, kind) => emit('toast', { text, kind });
    const fresh = () => ({
      version: 1,
      createdAt: Date.now(),
      lastSeen: Date.now(),
      hero: { level: 1, xp: 0 },
      gold: 0,
      gems: 0,
      keys: 3,
      scrolls: 0,
      chests: 10,
      premiumChests: 0,
      chestLevel: 1,
      equipped: { weapon: data().createItem({ slot: 'weapon', rarity: 0, ilvl: 1, name: 'Rusty Sword', subs: [] }), helmet: null, armor: null, gloves: null, boots: null, belt: null, ring: null, amulet: null },
      pendingItem: null,
      campaign: { floor: 1, wave: 1, highestFloor: 1, farming: false },
      skills: { owned: { bomb: 1 }, equipped: ['bomb', null, null, null] },
      allies: { owned: {}, equipped: [null, null] },
      mastery: { might: 0, vitality: 0, greed: 0, fortune: 0, precision: 0, patience: 0 },
      dungeons: { dragon: { level: 1 }, horde: { level: 1 }, vault: { level: 1 }, mothership: { level: 1 } },
      keyRegenAt: Date.now() + 1800000,
      quest: { index: 0, claimedIds: [] },
      stats: { kills: 0, bossKills: 0, chestsOpened: 0, itemsSold: 0, itemsEquipped: 0, flyingChests: 0, dungeonsWon: 0, deaths: 0, playTime: 0, goldEarned: 0, bestItemRarity: -1 },
      settings: { sound: true, speed: 1, autoSkill: true, autoBoss: true, autoLoot: { sell: [true, true, false, false, false, false, false], autoEquip: true, stopRarity: 4 } },
      autoOpen: false,
    });
    let s = fresh();
    const stats = (eq) => {
      const st = { atk: 10 + s.hero.level * 2, hp: 100 + s.hero.level * 20, atkSpeed: 1, critChance: 0.05, critDmg: 1.5, combo: 0, counter: 0, dodge: 0, stun: 0, lifesteal: 0, regen: 0, skillDmg: 0, bossDmg: 0, goldBonus: 0, chestChance: 0.3 };
      for (const k of data().SLOTS) {
        const it = eq[k];
        if (!it) continue;
        st[it.main.stat] += it.main.value;
        for (const x of it.subs || []) st[x.stat] = (st[x.stat] || 0) + x.value;
      }
      st.atk *= 1 + 0.06 * s.mastery.might;
      st.hp *= 1 + 0.06 * s.mastery.vitality;
      return st;
    };
    const pay = (cur, n) => {
      if (s[cur] < n) {
        toast('Not enough ' + cur, 'bad');
        return false;
      }
      s[cur] -= n;
      return true;
    };
    const slotsFor = (floors, min) => Math.max(min, floors.filter((f) => s.campaign.highestFloor >= f).length);
    const compareItem = (item) => {
      const cur = s.equipped[item.slot] || null;
      const before = data().calcPower(stats(s.equipped));
      const eq = Object.assign({}, s.equipped, { [item.slot]: item });
      const after = data().calcPower(stats(eq));
      const lines = [{ stat: item.main.stat, label: data().STAT_INFO[item.main.stat].label, before: cur ? cur.main.value : 0, after: item.main.value, diff: item.main.value - (cur ? cur.main.value : 0), fmt: 'num' }];
      const sub = (it, k) => (it && it.subs ? it.subs.filter((x) => x.stat === k).reduce((a, x) => a + x.value, 0) : 0);
      for (const k of data().SUBSTATS) {
        const b = sub(cur, k);
        const a = sub(item, k);
        if (a || b) lines.push({ stat: k, label: data().STAT_INFO[k].label, before: b, after: a, diff: a - b, fmt: 'pct' });
      }
      return { current: cur, powerBefore: before, powerAfter: after, delta: after - before, lines };
    };
    const api = {
      get s() {
        return s;
      },
      set s(v) {
        s = Object.assign(fresh(), v);
      },
      load() {
        return false;
      },
      save() {
        s.lastSeen = Date.now();
        return true;
      },
      serialize: () => JSON.stringify(s),
      deserialize(str) {
        try {
          s = Object.assign(fresh(), JSON.parse(str));
          changed();
          return true;
        } catch {
          return false;
        }
      },
      reset() {
        s = fresh();
        changed();
        emit('state:reset', { reason: 'reset' });
      },
      exportCode: () => btoa(JSON.stringify(s)),
      importCode(code) {
        try {
          s = Object.assign(fresh(), JSON.parse(atob(String(code).trim())));
          changed();
          toast('Save imported!', 'good');
          emit('state:reset', { reason: 'import' });
          return true;
        } catch {
          toast('That save code is not valid', 'bad');
          return false;
        }
      },
      invalidate: changed,
      tick() {},
      getHeroStats: () => stats(s.equipped),
      getPower: (st) => data().calcPower(st || stats(s.equipped)),
      xpToNext: () => data().xpToNext(s.hero.level),
      keyRegenRemaining: () => (s.keys >= 5 ? 0 : Math.max(0, (s.keyRegenAt - Date.now()) / 1000)),
      useKey() {
        if (!pay('keys', 1)) return false;
        changed();
        return true;
      },
      setFarming(v) {
        s.campaign.farming = !!v;
        changed();
      },
      openChest(o) {
        const premium = !!(o && o.premium);
        if (s.pendingItem || (premium ? s.premiumChests < 1 : s.chests < 1)) return null;
        if (premium) s.premiumChests--;
        else s.chests--;
        const r = DD.weightedIndex(data().rarityOdds(s.chestLevel));
        const item = data().createItem({ slot: DD.pick(data().SLOTS), rarity: premium ? Math.max(2, r) : r, ilvl: s.campaign.highestFloor, name: 'Found Gear' });
        s.pendingItem = item;
        s.stats.chestsOpened++;
        emit('chest:opened', { item, decision: 'pending', premium });
        changed();
        return { item, decision: 'pending' };
      },
      equipPending() {
        const it = s.pendingItem;
        if (!it) return false;
        const old = s.equipped[it.slot];
        s.equipped[it.slot] = it;
        s.pendingItem = null;
        if (old) s.gold += api.itemSellValue(old);
        emit('item:equipped', { item: it, old });
        changed();
        return true;
      },
      sellPending() {
        const it = s.pendingItem;
        if (!it) return false;
        const g = api.itemSellValue(it);
        s.gold += g;
        s.pendingItem = null;
        emit('item:sold', { item: it, gold: g });
        changed();
        return true;
      },
      compareItem,
      comparePending: () => (s.pendingItem ? compareItem(s.pendingItem) : null),
      itemSellValue: (it) => data().itemSellValue(it),
      chestUpgradeCost: () => (s.chestLevel >= 20 ? Infinity : data().chestUpgradeCost(s.chestLevel)),
      upgradeChestLevel() {
        if (s.chestLevel >= 20 || !pay('gold', data().chestUpgradeCost(s.chestLevel))) return false;
        s.chestLevel++;
        toast('Chest level ' + s.chestLevel + '!', 'good');
        changed();
        return true;
      },
      rarityOdds: (L) => data().rarityOdds(L || s.chestLevel),
      setAutoOpen(v) {
        s.autoOpen = !!v;
        changed();
        return true;
      },
      skillSlotsUnlocked: () => slotsFor(data().SKILL_SLOT_FLOORS, 1),
      skillCost: (id) => (s.skills.owned[id] ? { upgrade: Math.ceil(2 + s.skills.owned[id] * 1.5) } : { unlock: data().SKILLS[id].unlock }),
      unlockSkill(id) {
        if (!pay('scrolls', data().SKILLS[id].unlock)) return false;
        s.skills.owned[id] = 1;
        changed();
        return true;
      },
      upgradeSkill(id) {
        if (!pay('scrolls', Math.ceil(2 + s.skills.owned[id] * 1.5))) return false;
        s.skills.owned[id]++;
        changed();
        return true;
      },
      equipSkill(id, i) {
        const eq = s.skills.equipped;
        const c = eq.indexOf(id);
        if (c >= 0) eq[c] = eq[i];
        eq[i] = id;
        changed();
        return true;
      },
      unequipSkill(i) {
        s.skills.equipped[i] = null;
        changed();
        return true;
      },
      allySlotsUnlocked: () => slotsFor(data().ALLY_SLOT_FLOORS, 0),
      allyUpgradeCost: (id) => Math.floor(800 * Math.pow(1.6, (s.allies.owned[id] || 1) - 1)),
      unlockAlly(id) {
        if (!pay('gems', data().ALLIES[id].unlock)) return false;
        s.allies.owned[id] = 1;
        changed();
        return true;
      },
      upgradeAlly(id) {
        if (!pay('gold', api.allyUpgradeCost(id))) return false;
        s.allies.owned[id]++;
        changed();
        return true;
      },
      equipAlly(id, i) {
        const eq = s.allies.equipped;
        const c = eq.indexOf(id);
        if (c >= 0) eq[c] = eq[i];
        eq[i] = id;
        changed();
        return true;
      },
      unequipAlly(i) {
        s.allies.equipped[i] = null;
        changed();
        return true;
      },
      masteryCost: (id) => (s.mastery[id] >= data().MASTERY[id].max ? Infinity : (id === 'might' || id === 'vitality' ? 10 + 6 * s.mastery[id] : 20 + 10 * s.mastery[id])),
      upgradeMastery(id) {
        if (!pay('gems', api.masteryCost(id))) return false;
        s.mastery[id]++;
        changed();
        return true;
      },
      currentQuest: () => ({ id: 'q_fake', text: 'Open 10 chests', progress: Math.min(10, s.stats.chestsOpened), target: 10, done: s.stats.chestsOpened >= 10, reward: { gems: 15 }, rewardText: '+15 Gems' }),
      claimQuest() {
        s.gems += 15;
        s.stats.chestsOpened = 0;
        changed();
        return true;
      },
      collectOffline: () => null,
      setSetting(path, v) {
        const parts = String(path).split('.');
        let o = s.settings;
        while (parts.length > 1) o = o[parts.shift()];
        o[parts[0]] = v;
        changed();
        return true;
      },
    };
    DD.state = api;
  }

  // ======================================================================== fallback DD.sprites
  if (!DD.sprites) {
    DD.sprites = { init() {} }; // every *Icon missing → the UI shows CSS-shape fallbacks
  }
  if (!DD.audio) DD.audio = { init() {}, play() {} };

  // ======================================================================== fake DD.battle
  const GROUND = (DD.WORLD && DD.WORLD.GROUND) || 170;
  const HERO_X = (DD.WORLD && DD.WORLD.HERO_X) || 84;
  let uid = 0;
  const enemy = (type, x, extra) =>
    Object.assign(
      { id: 'e' + ++uid, type, x, y: GROUND, w: 20, h: 22, hp: 60, maxHp: 100, isBoss: false, flying: false, anim: 'walk', animTime: 0, stun: 0, frozen: 0, flash: 0, dead: false, deadTime: 0 },
      extra || {},
    );

  const FB = {
    mode: 'campaign',
    floor: 1,
    wave: 1,
    isBossWave: false,
    farming: false,
    bossTimer: 0,
    bossTimeLimit: 0,
    dungeon: null,
    hero: { x: HERO_X, y: GROUND, hp: 100, maxHp: 100, shield: 0, anim: 'idle', animTime: 0, attackAnim: 0, buffs: { warcry: 0, blades: 0, shield: 0 } },
    enemies: [],
    projectiles: [],
    allies: [],
    flyingChest: null,
    moving: false,
    scroll: 0,
    deadTimer: 0,
    skillSlots: [0, 1, 2, 3].map(() => ({ id: null, cd: 0, cdTotal: 0 })),
    phase: 'fight',
    time: 0,
    frozen: false,
    init() {},
    update(dt) {
      if (this.frozen) return;
      this.time += dt;
      this.hero.animTime += dt;
      for (const e of this.enemies) e.animTime += dt;
      for (const a of this.allies) a.animTime += dt;
      for (const sl of this.skillSlots) if (sl.cd > 0) sl.cd = Math.max(0, sl.cd - dt);
    },
    castSkill(slot) {
      const sl = this.skillSlots[slot];
      if (!sl || !sl.id || sl.cd > 0) return false;
      const def = DD.data.SKILLS[sl.id] || {};
      sl.cdTotal = Number(def.cd) || 8;
      sl.cd = sl.cdTotal;
      DD.bus.emit('skill:cast', { id: sl.id, slot, x: this.hero.x, y: this.hero.y, targets: this.enemies.map((e) => ({ x: e.x, y: e.y - e.h / 2 })) });
      return true;
    },
    tapAt() {
      return false;
    },
    challengeBoss() {
      if (this.mode !== 'campaign') return false;
      this.farming = false;
      this.wave = 5;
      this.isBossWave = true;
      this.bossTimeLimit = 30;
      this.bossTimer = 30;
      if (typeof DD.state.setFarming === 'function') DD.state.setFarming(false);
      DD.bus.emit('wave:start', { floor: this.floor, wave: 5, isBoss: true, mode: 'campaign' });
      return true;
    },
    startDungeon(id) {
      if (this.mode === 'dungeon') return false;
      const s = DD.state.s;
      const def = DD.data.DUNGEONS[id];
      if (!def || s.campaign.highestFloor < def.unlockFloor) return false;
      if (DD.state.useKey() !== true) return false;
      const level = (s.dungeons[id] && s.dungeons[id].level) || 1;
      this.mode = 'dungeon';
      this.isBossWave = id !== 'horde';
      this.bossTimeLimit = 45;
      this.bossTimer = 45;
      this.dungeon = { id, level, timer: 45, timeLimit: 45, killed: 0, target: id === 'horde' ? 25 : 1 };
      DD.bus.emit('dungeon:start', { id, level });
      return true;
    },
    leaveDungeon() {
      if (this.mode !== 'dungeon') return false;
      const d = this.dungeon;
      DD.bus.emit('dungeon:failed', { id: d.id, level: d.level, reason: 'forfeit' });
      this.mode = 'campaign';
      this.dungeon = null;
      this.isBossWave = false;
      this.bossTimer = 0;
      this.bossTimeLimit = 0;
      return true;
    },
    onStatsChanged() {},
  };
  DD.battle = FB;
  if (!DD.render) {
    DD.render = {
      init(canvas) {
        this.canvas = canvas;
      },
      draw() {
        const c = this.canvas;
        if (!c) return;
        const ctx = c.getContext('2d');
        if (c.width !== 360) {
          c.width = 360;
          c.height = 200;
        }
        const g = ctx.createLinearGradient(0, 0, 0, 200);
        g.addColorStop(0, '#1a1426');
        g.addColorStop(1, '#2c2236');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 360, 200);
        ctx.fillStyle = '#3a3146';
        ctx.fillRect(0, GROUND, 360, 30);
      },
    };
  }

  // ======================================================================== scenarios
  const D = () => DD.data;
  // deterministic gear (explicit names + substats so screenshots never change)
  function item(slot, rarity, ilvl, name, subs, roll) {
    const it = D().createItem({ slot, rarity, ilvl, name, mainRoll: roll || 1, subs: subs.map(([stat, value]) => ({ stat, value })) });
    it.id = 'fix_' + slot + '_' + rarity + '_' + ilvl;
    return it;
  }
  const GEAR = () => ({
    weapon: item('weapon', 3, 22, 'Hellfire Cleaver', [['critChance', 0.034], ['critDmg', 0.21], ['atkSpeed', 0.07]]),
    helmet: item('helmet', 2, 20, 'Horned Visage', [['dodge', 0.021], ['regen', 0.004]]),
    armor: item('armor', 4, 21, 'Fabled Ember Plate', [['counter', 0.025], ['dodge', 0.018], ['lifesteal', 0.03], ['goldBonus', 0.07]]),
    gloves: item('gloves', 1, 18, 'Runed Gauntlets', [['combo', 0.02]]),
    boots: item('boots', 2, 23, 'Cinder Treads', [['dodge', 0.02], ['stun', 0.012]]),
    belt: item('belt', 0, 15, 'Leather Girdle', []),
    ring: item('ring', 3, 22, 'Demonbone Ring', [['critChance', 0.03], ['skillDmg', 0.09], ['bossDmg', 0.08]]),
    amulet: null,
  });

  function midSave() {
    const now = Date.now();
    return {
      version: 1,
      createdAt: now - 86400000,
      lastSeen: now,
      hero: { level: 31, xp: 0 },
      gold: 1234567,
      gems: 342,
      keys: 2,
      scrolls: 45,
      chests: 37,
      premiumChests: 2,
      chestLevel: 7,
      equipped: GEAR(),
      pendingItem: null,
      campaign: { floor: 23, wave: 3, highestFloor: 24, farming: false },
      skills: { owned: { bomb: 8, blades: 5, warcry: 3, heal: 1, lightning: 2 }, equipped: ['bomb', 'blades', 'warcry', null] },
      allies: { owned: { wolf: 6, fairy: 2 }, equipped: ['wolf', null] },
      mastery: { might: 12, vitality: 9, greed: 4, fortune: 3, precision: 2, patience: 0 },
      dungeons: { dragon: { level: 5 }, horde: { level: 3 }, vault: { level: 2 }, mothership: { level: 1 } },
      keyRegenAt: now + 754000,
      quest: { index: 4, claimedIds: ['q_open1', 'q_equip1', 'q_floor2', 'q_sell1'] },
      stats: { kills: 4123, bossKills: 23, chestsOpened: 9, itemsSold: 240, itemsEquipped: 31, flyingChests: 6, dungeonsWon: 7, deaths: 18, playTime: 9120, goldEarned: 5400000, bestItemRarity: 4, autoOpenUsed: 1 },
      settings: { sound: true, speed: 2, autoSkill: true, autoBoss: true, autoLoot: { sell: [true, true, true, false, false, false, false], autoEquip: true, stopRarity: 4 } },
      autoOpen: false,
    };
  }

  function setBattle(kind) {
    const s = DD.state.s;
    uid = 0;
    FB.mode = 'campaign';
    FB.dungeon = null;
    FB.floor = s.campaign.floor;
    FB.wave = s.campaign.wave;
    FB.farming = false;
    FB.isBossWave = false;
    FB.bossTimer = 0;
    FB.bossTimeLimit = 0;
    FB.deadTimer = 0;
    FB.moving = false;
    FB.projectiles = [];
    FB.flyingChest = null;
    const st = DD.state.getHeroStats ? DD.state.getHeroStats() : { hp: 1000 };
    FB.hero.maxHp = Math.max(1, Math.round(st.hp || 1000));
    FB.hero.hp = Math.round(FB.hero.maxHp * 0.66);
    FB.hero.shield = 0;
    FB.hero.anim = 'attack';
    FB.hero.attackAnim = 0.45;
    FB.hero.buffs = { warcry: 0, blades: 0, shield: 0 };
    const biome = D().biomeForFloor ? D().biomeForFloor(FB.floor) : null;
    const types = biome && biome.enemies ? biome.enemies : ['skeleton', 'bat', 'slime'];
    FB.enemies = [
      enemy(types[0], HERO_X + 34, { anim: 'attack', hp: 40 }),
      enemy(types[1], HERO_X + 70, { hp: 90, flying: !!(D().ENEMIES && D().ENEMIES[types[1]] && D().ENEMIES[types[1]].flying) }),
      enemy(types[2], HERO_X + 120, { hp: 100 }),
    ];
    FB.allies = (s.allies.equipped || []).filter(Boolean).map((id, i) => ({ id, x: HERO_X - 26 - i * 22, y: GROUND, anim: 'idle', animTime: 0 }));
    const eq = s.skills.equipped || [];
    const cds = [[3.2, 8], [0, 12], [11.4, 15], [0, 0]];
    FB.skillSlots = [0, 1, 2, 3].map((i) => ({ id: eq[i] || null, cd: eq[i] ? cds[i][0] : 0, cdTotal: eq[i] ? cds[i][1] : 0 }));
    if (kind === 'farm') {
      FB.farming = true;
      FB.wave = 2;
      s.campaign.farming = true;
    } else if (kind === 'boss') {
      FB.wave = 5;
      FB.isBossWave = true;
      FB.bossTimeLimit = 30;
      FB.bossTimer = 8.4;
      const boss = biome && biome.boss ? biome.boss : 'lich';
      FB.enemies = [enemy(boss, HERO_X + 46, { isBoss: true, w: 44, h: 50, hp: 3300, maxHp: 10000, anim: 'attack' })];
      FB.hero.shield = Math.round(FB.hero.maxHp * 0.18);
      FB.hero.buffs.shield = 4;
    } else if (kind === 'dungeon') {
      FB.mode = 'dungeon';
      FB.isBossWave = false;
      FB.bossTimeLimit = 45;
      FB.bossTimer = 27.5;
      FB.dungeon = { id: 'horde', level: 3, timer: 27.5, timeLimit: 45, killed: 12, target: 25 };
      FB.enemies = [enemy('zombie', HERO_X + 30, { anim: 'attack' }), enemy('zombie', HERO_X + 58), enemy('zombie', HERO_X + 84), enemy('zombie', HERO_X + 130)];
    } else if (kind === 'dead') {
      FB.hero.hp = 0;
      FB.hero.anim = 'dead';
      FB.deadTimer = 1.4;
    }
  }

  function applySave(save) {
    if (real.state) {
      DD.state.s = save; // the real setter sanitizes
      DD.state.invalidate();
    } else {
      DD.state.s = save;
      DD.bus.emit('state:changed', {});
    }
  }

  const UIH = {
    real,
    scenario(name) {
      if (name === 'fresh') {
        if (real.state) DD.state.reset();
        else DD.state.reset();
        setBattle('normal');
        FB.skillSlots[0].cd = 0;
      } else {
        applySave(midSave());
        setBattle(name === 'mid' ? 'normal' : name);
      }
      if (DD.ui && DD.ui.refresh) DD.ui.refresh();
      return true;
    },
    tab(id) {
      DD.ui.closeOverlay();
      DD.ui.switchTab(id);
      document.getElementById('dd-panels').scrollTop = 0;
    },
    // Put a deterministic item into the chest modal.
    compare(kind) {
      const s = DD.state.s;
      DD.ui.closeOverlay();
      let it;
      if (kind === 'legendary') it = item('weapon', 4, 25, 'Kingsworn Hellfire Cleaver', [['critChance', 0.041], ['critDmg', 0.28], ['atkSpeed', 0.09], ['bossDmg', 0.11]], 1.04);
      else if (kind === 'celestial') it = item('amulet', 6, 26, 'Astral Ember Amulet', [['critChance', 0.06], ['critDmg', 0.4], ['combo', 0.05], ['skillDmg', 0.18], ['goldBonus', 0.15]], 1.05);
      else if (kind === 'worse') it = item('helmet', 1, 19, 'Iron Helm', [['regen', 0.003]], 0.96);
      else it = item('boots', 3, 24, 'Hellstrider Boots', [['counter', 0.02], ['dodge', 0.028], ['regen', 0.005]], 1.02);
      it.id = 'pending_' + kind;
      s.pendingItem = it;
      DD.bus.emit('chest:opened', { item: it, decision: 'pending' });
      DD.bus.emit('state:changed', {});
      return it.name;
    },
    // Fill the loot log + ticker with auto-loot results (no state mutation).
    lootFeed() {
      const feed = [
        ['sold', item('helmet', 2, 22, 'Iron Helm', [['dodge', 0.01], ['regen', 0.002]])],
        ['equipped', item('gloves', 3, 23, 'Runed Gauntlets', [['combo', 0.03], ['critChance', 0.02], ['stun', 0.01]])],
        ['sold', item('belt', 1, 21, 'Studded Belt', [['regen', 0.003]])],
        ['sold', item('ring', 0, 20, 'Copper Band', [])],
      ];
      for (const [decision, it] of feed) {
        it.id = 'feed_' + it.slot + '_' + it.rarity;
        if (decision === 'sold') DD.bus.emit('item:sold', { item: it, gold: 1180 + it.rarity * 640 });
        else DD.bus.emit('item:equipped', { item: it, old: null });
        DD.bus.emit('chest:opened', { item: it, decision });
      }
    },
    offline() {
      DD.ui.showOffline({ seconds: 11520, cappedSeconds: 11520, gold: 1834000, chests: 46, xp: 52000, keys: 2 });
    },
    toasts() {
      DD.ui.toast('Floor 23 cleared! +3 chests', 'good');
      DD.ui.toast('Legendary Fabled Ember Plate equipped!', 'rare');
      DD.ui.toast('Not enough gems', 'bad');
    },
    sheet(name, arg) {
      DD.ui.openSheet(name, arg);
    },
    freeze(on) {
      FB.frozen = !!on;
    },
  };
  globalThis.UIH = UIH;
})(globalThis.DD);
