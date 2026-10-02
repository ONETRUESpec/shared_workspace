/* Dungeon Dash — data: static content tables and pure formulas.
 *
 * Every tunable number lives in BALANCE at the top of this file. Formulas read BALANCE at
 * call time, so a headless balance sim may tweak DD.data.BALANCE.* at runtime and see the effect.
 * Works in browsers and in Node (no DOM access). */
(function (DD) {
  'use strict';

  // =====================================================================================
  // BALANCE — all tunable numbers
  // =====================================================================================
  // Tuned with tests/sim.mjs (real battle, idle / casual / active policies) against CONTRACT §1:
  // a fresh hero clears floor 1 in ~40 s; an idle hero stalls at floor 6 (7 after ~2 h); an active
  // player reaches floor 10 at ~9 min, floor 20 at ~40 min and floor ~32 at 120 min, feeling walls
  // at 6–8 (casual players), 11–12, 16–18, 21 and 26–27; a casual player lands in between.
  // The curve's main knobs: enemy.{hpGrowth, atkGrowth, walls, wallAtkExp, biomeStep}, item.growth.
  const BALANCE = {
    // ---- hero ------------------------------------------------------------------------
    hero: {
      atk: 12, // base ATK at level 1
      hp: 100, // base HP at level 1
      growth: 1.05, // per hero level (kept low so XP alone cannot carry an idle player)
      atkSpeed: 1.0,
      critChance: 0.05,
      critDmg: 1.5,
      chestChance: 0.3, // per-kill chest drop chance
      chestChanceCap: 0.9,
    },
    caps: {
      atkSpeed: 4,
      critChance: 1,
      combo: 0.75,
      counter: 0.75,
      dodge: 0.6,
      stun: 0.5,
      lifesteal: 0.5,
      regen: 0.05,
    },
    xp: { base: 30, growth: 1.2 }, // xpToNext(L) = floor(base * growth^(L-1))

    // ---- items -----------------------------------------------------------------------
    item: {
      baseAtk: 6,
      baseHp: 60,
      growth: 1.095, // per item level
      mainSpread: 0.06, // main stat rolls within ±6% of the formula value
      ilvlSpread: [-3, 1], // itemIlvl = highestFloor + randInt(a, b)
      premiumIlvlSpread: [0, 2], // premium chests roll a little higher
      subRarityScale: 0.08, // substat rolls × (1 + 0.08 × rarity)
    },
    // Substat roll ranges (fractions; regen is per second).
    subRanges: {
      critChance: [0.01, 0.03],
      critDmg: [0.05, 0.15],
      atkSpeed: [0.02, 0.06],
      combo: [0.01, 0.03],
      counter: [0.01, 0.03],
      dodge: [0.01, 0.025],
      stun: [0.005, 0.02],
      lifesteal: [0.01, 0.03],
      regen: [0.002, 0.006],
      skillDmg: [0.03, 0.08],
      bossDmg: [0.03, 0.08],
      goldBonus: [0.03, 0.08],
    },
    // Weighted substat pools per slot (no duplicates on one item; each pool has >= 5 entries).
    subPools: {
      weapon: { critChance: 4, critDmg: 4, atkSpeed: 4, combo: 3, stun: 2, lifesteal: 2, skillDmg: 2, bossDmg: 2, counter: 1 },
      helmet: { regen: 4, dodge: 3, counter: 3, lifesteal: 2, skillDmg: 2, critChance: 1, stun: 1, goldBonus: 1 },
      armor: { counter: 4, regen: 4, dodge: 3, lifesteal: 3, stun: 1, bossDmg: 1 },
      gloves: { atkSpeed: 4, critChance: 3, combo: 3, critDmg: 2, stun: 2, lifesteal: 2, counter: 1 },
      boots: { dodge: 4, atkSpeed: 3, counter: 3, regen: 2, combo: 1, goldBonus: 1 },
      belt: { regen: 4, lifesteal: 3, counter: 2, dodge: 2, goldBonus: 2, bossDmg: 1 },
      ring: { critChance: 2, critDmg: 2, atkSpeed: 2, combo: 2, counter: 1, dodge: 1, stun: 1, lifesteal: 2, regen: 1, skillDmg: 3, bossDmg: 3, goldBonus: 3 },
      amulet: { critChance: 2, critDmg: 2, atkSpeed: 1, combo: 1, counter: 1, dodge: 1, stun: 1, lifesteal: 2, regen: 2, skillDmg: 3, bossDmg: 3, goldBonus: 3 },
    },
    sell: { base: 4, growth: 1.1 }, // floor(base * growth^(ilvl-1) * (1 + rarity)^2)

    // ---- chests ----------------------------------------------------------------------
    chest: {
      costBase: 400, // upgrade cost L -> L+1 = floor(costBase * costGrowth^(L-1))
      costGrowth: 2.15,
      premiumLevelBonus: 3, // premium chests roll with chestLevel + 3 ...
      premiumMinRarity: 2, // ... and never below Rare
      // Rarity odds per chest level in basis points (1/100 of a percent), for
      // [common, rare, epic, legendary, mythic, celestial]. Uncommon is the remainder so
      // every row sums to exactly 10000.
      oddsBp: [
        /* L1  */ [8000, 200, 0, 0, 0, 0],
        /* L2  */ [7400, 450, 30, 0, 0, 0],
        /* L3  */ [6800, 700, 80, 0, 0, 0],
        /* L4  */ [6200, 950, 150, 0, 0, 0],
        /* L5  */ [5600, 1200, 250, 0, 0, 0],
        /* L6  */ [5000, 1450, 360, 20, 0, 0],
        /* L7  */ [4500, 1700, 500, 60, 0, 0],
        /* L8  */ [4000, 1900, 650, 120, 0, 0],
        /* L9  */ [3550, 2100, 800, 200, 0, 0],
        /* L10 */ [3100, 2300, 980, 300, 0, 0],
        /* L11 */ [2700, 2450, 1150, 400, 10, 0],
        /* L12 */ [2350, 2550, 1320, 500, 30, 0],
        /* L13 */ [2000, 2650, 1500, 600, 60, 0],
        /* L14 */ [1700, 2730, 1680, 700, 100, 0],
        /* L15 */ [1400, 2800, 1850, 800, 150, 0],
        /* L16 */ [1150, 2850, 2020, 900, 200, 5],
        /* L17 */ [950, 2900, 2200, 1020, 280, 20],
        /* L18 */ [750, 2940, 2380, 1150, 360, 50],
        /* L19 */ [550, 2970, 2540, 1300, 460, 100],
        /* L20 */ [400, 3000, 2700, 1500, 600, 200],
      ],
    },

    // ---- enemies ---------------------------------------------------------------------
    enemy: {
      hpBase: 40,
      hpGrowth: 1.155,
      bossHp: 10,
      atkBase: 6,
      atkGrowth: 1.15,
      bossAtk: 2.5,
      goldBase: 4,
      goldGrowth: 1.12,
      bossGold: 15,
      xpBase: 3,
      xpGrowth: 1.1,
      bossXp: 10,
      biomeStep: 1.15, // enemy HP × biomeStep per biome passed (floors 11, 21, …), like a wall
      // Walls: enemy HP × mult from that floor on (cumulative, on top of biomeStep); ATK gets
      // mult^wallAtkExp, so a wall is mostly a damage check (the boss timer), not a death loop.
      // wallMult(f) = biomeStep^floor((f-1)/10) × Π mult over the walls reached.
      walls: [
        [6, 1.8], // the gear check: an idle hero (no chests opened) stalls at floor 6
        [8, 1.5],
        [12, 1.2],
      ],
      wallAtkExp: 0.7,
      speedMult: 1.35, // × every enemy type's walk speed (wave pacing)
      maxFloor: 5000, // formulas clamp the floor here so numbers stay finite
    },
    // Per-type combat multipliers. speed px/s, range px, atkSpeed attacks/s, weight = spawn weight.
    // Ranged types hit softer (atk 0.75): every shooter that has stopped fires, not just the front one.
    enemyTypes: {
      skeleton: { hp: 1.0, atk: 1.0, speed: 45, range: 24, atkSpeed: 0.8, weight: 5 },
      bat: { hp: 0.6, atk: 0.8, speed: 80, range: 22, atkSpeed: 1.1, weight: 3 },
      slime: { hp: 1.8, atk: 0.8, speed: 30, range: 22, atkSpeed: 0.6, weight: 2 },
      lich: { hp: 0.7, atk: 0.8, speed: 40, range: 30, atkSpeed: 0.5, weight: 1 },
      mushroom: { hp: 1.1, atk: 1.0, speed: 42, range: 24, atkSpeed: 0.8, weight: 5 },
      spider: { hp: 0.65, atk: 0.9, speed: 85, range: 22, atkSpeed: 1.2, weight: 3 },
      sporeling: { hp: 0.8, atk: 0.75, speed: 40, range: 135, atkSpeed: 0.6, weight: 2.5 },
      myconid_king: { hp: 1.0, atk: 1.0, speed: 28, range: 30, atkSpeed: 0.5, weight: 1 },
      imp: { hp: 0.75, atk: 0.75, speed: 50, range: 140, atkSpeed: 0.55, weight: 3 },
      magma_golem: { hp: 1.7, atk: 1.1, speed: 28, range: 26, atkSpeed: 0.55, weight: 2 },
      fire_hound: { hp: 0.7, atk: 1.0, speed: 88, range: 22, atkSpeed: 1.2, weight: 4 },
      infernal: { hp: 1.05, atk: 1.1, speed: 30, range: 32, atkSpeed: 0.5, weight: 1 },
      cog_knight: { hp: 1.25, atk: 1.0, speed: 44, range: 26, atkSpeed: 0.8, weight: 5 },
      steam_bot: { hp: 0.9, atk: 0.75, speed: 40, range: 130, atkSpeed: 0.65, weight: 2.5 },
      gear_rat: { hp: 0.6, atk: 0.85, speed: 90, range: 22, atkSpeed: 1.3, weight: 3 },
      brass_colossus: { hp: 1.2, atk: 0.95, speed: 26, range: 34, atkSpeed: 0.45, weight: 1 },
      drone: { hp: 0.7, atk: 0.75, speed: 60, range: 150, atkSpeed: 0.7, weight: 3 },
      cyber_ninja: { hp: 0.85, atk: 1.1, speed: 85, range: 24, atkSpeed: 1.2, weight: 4 },
      mech: { hp: 2.1, atk: 1.15, speed: 30, range: 28, atkSpeed: 0.55, weight: 2 },
      ai_core: { hp: 0.95, atk: 1.15, speed: 26, range: 32, atkSpeed: 0.55, weight: 1 },
      alien: { hp: 1.1, atk: 1.05, speed: 46, range: 24, atkSpeed: 0.85, weight: 5 },
      void_eye: { hp: 0.75, atk: 0.75, speed: 50, range: 140, atkSpeed: 0.65, weight: 3 },
      tentacle: { hp: 2.0, atk: 1.1, speed: 30, range: 30, atkSpeed: 0.6, weight: 2 },
      void_titan: { hp: 1.25, atk: 1.1, speed: 26, range: 36, atkSpeed: 0.5, weight: 1 },
      dragon: { hp: 1.3, atk: 1.0, speed: 26, range: 120, atkSpeed: 0.5, weight: 1 },
      zombie: { hp: 0.7, atk: 0.8, speed: 35, range: 22, atkSpeed: 0.7, weight: 1 },
      stone_golem: { hp: 1.6, atk: 0.9, speed: 22, range: 34, atkSpeed: 0.45, weight: 1 },
      overlord: { hp: 1.3, atk: 1.05, speed: 24, range: 130, atkSpeed: 0.5, weight: 1 },
    },
    waves: {
      baseCount: 3, // wave 1 of floor 1
      perTwoWaves: 1, // +1 enemy on waves 3-4
      floorStep: 5, // +1 enemy every 5 floors ...
      floorBonusMax: 2, // ... up to +2
      minCount: 3,
      maxCount: 6,
      bossAdds: [
        [1, 0], // from floor 1: no adds
        [5, 1], // from floor 5: 1 normal beside the boss
        [15, 2], // from floor 15: 2 normals
      ],
      bossAddMaxHp: 1.3, // boss minions are drawn from enemy types with hp mult <= this
    },

    // ---- rewards ---------------------------------------------------------------------
    floorClear: {
      chests: 3,
      goldKills: 20, // floor-clear gold = 20 × a normal kill's gold on that floor
      gems: 4, // every floor
      gemsEvery5: 10, // instead, on floors 5, 15, 25, …
      gemsEvery10: 25, // instead, on floors 10, 20, 30, …
    },
    flyingChest: [
      { type: 'gems', weight: 40, min: 20, max: 40 },
      { type: 'chests', weight: 30, min: 6, max: 15 },
      { type: 'gold', weight: 15, seconds: 150, minKills: 30 },
      { type: 'scrolls', weight: 12, min: 4, max: 10 },
      { type: 'key', weight: 5, min: 1, max: 1 },
    ],
    income: {
      // AFK kill-rate model (state.estimateIncome), calibrated against live farming of waves 1-4 in
      // tests/sim.mjs: kills/s = n / (waveOverhead + killTime + deathOverhead), n = average wave
      // size, killTime = n × avgEnemyHp / (dpsMult × kit DPS) where the kit is auto-attacks plus
      // equipped skills and allies, deathOverhead = deathCost / waves the hero survives (from
      // threat × in-reach enemy DPS × killTime vs. HP and healing). Even a hero that one-shots
      // everything only manages ~0.57 kills/s: every wave costs ~5.5 s of walk-in, clear beat, run.
      waveOverhead: 5.5, // seconds per wave that are not spent killing
      dpsMult: 1.1, // calibration on the whole kit's DPS (auto-attack + skills + allies)
      aoeTargets: 2.5, // enemies an area skill / the Ember Golem catches on average
      skillUptime: 0.8, // auto-cast waits for targets / a crowd
      refKillsPerSec: 0.5, // reference kill rate for "N seconds of income" rewards in data formulas
      maxKillsPerSec: 1.2, // hard cap on the estimate
      threat: 0.2, // share of the in-reach enemies' DPS × kill time that actually lands per wave
      deathCost: 8, // seconds lost per death while farming (revive 2 s, run, walk-in)
      offlineEfficiency: 0.75, // gold
      offlineXpEfficiency: 0.5, // xp (levels come fast on low floors; keep AFK from skipping them)
      offlineChestEfficiency: 0.75, // chests (separate knob: chests drive the whole loop)
      offlineBaseHours: 8,
      offlineMinSeconds: 60,
    },

    // ---- combat power ----------------------------------------------------------------
    power: {
      hpWeight: 0.12,
      combo: 1,
      counter: 0.5,
      dodge: 0.8,
      stun: 0.5,
      lifesteal: 0.6,
      regen: 3,
      skillDmg: 0.3,
      bossDmg: 0.2,
      skillLevel: 0.02, // per level of each equipped skill
      allyLevel: 0.04, // per level of each equipped ally
    },

    // ---- skills ----------------------------------------------------------------------
    skills: {
      bomb: { cd: 8, unlock: 0, dmg: 3.0, dmgPerLv: 0.3 },
      blades: { cd: 12, unlock: 10, duration: 5, tick: 0.5, radius: 70, dmg: 0.6, dmgPerLv: 0.06 },
      warcry: { cd: 15, unlock: 10, duration: 6, buffAtk: 0.3, buffAtkPerLv: 0.03, buffSpd: 0.2 },
      heal: { cd: 14, unlock: 15, heal: 0.25, healPerLv: 0.015 },
      lightning: { cd: 7, unlock: 20, dmg: 2.2, dmgPerLv: 0.22, targets: 3, targetsEvery: 5 },
      shield: { cd: 18, unlock: 20, duration: 8, shield: 0.3, shieldPerLv: 0.02 },
      frost: { cd: 16, unlock: 30, dmg: 1.5, dmgPerLv: 0.15, freeze: 2.5, freezePerLv: 0.05 },
      meteor: { cd: 20, unlock: 40, dmg: 6.0, dmgPerLv: 0.6, stun: 1.5 },
    },
    skillUpgrade: { base: 2, perLevel: 1.5, maxLevel: 30 }, // cost L -> L+1 = ceil(base + L × perLevel)
    skillSlotFloors: [1, 5, 12, 25],

    // ---- allies ----------------------------------------------------------------------
    allies: {
      wolf: { unlock: 100, interval: 1.2, dmg: 0.6, dmgPerLv: 0.06 },
      fairy: { unlock: 200, interval: 2, heal: 0.04, healPerLv: 0.004 },
      drone_ally: { unlock: 400, interval: 0.6, dmg: 0.35, dmgPerLv: 0.04 },
      golem_ally: { unlock: 600, interval: 3, dmg: 1.2, dmgPerLv: 0.12, radius: 90 },
    },
    allyUpgrade: { base: 500, growth: 1.5, maxLevel: 50 }, // gold cost L -> L+1 = floor(base × growth^(L-1))
    allySlotFloors: [4, 20],

    // ---- mastery (gems) --------------------------------------------------------------
    mastery: {
      might: { per: 0.06, max: 100, costBase: 10, costPerLv: 6 },
      vitality: { per: 0.06, max: 100, costBase: 10, costPerLv: 6 },
      greed: { per: 0.08, max: 50, costBase: 20, costPerLv: 10 },
      fortune: { per: 0.01, max: 30, costBase: 20, costPerLv: 10 },
      precision: { per: 0.05, max: 50, costBase: 20, costPerLv: 10 },
      patience: { per: 1, max: 16, costBase: 20, costPerLv: 10 }, // +1 hour offline cap
    },

    // ---- boss dungeons ---------------------------------------------------------------
    dungeons: {
      floorBase: 2, // enemy strength = campaign floor (2 + level × 3)
      floorPerLevel: 3,
      time: 45,
      hordeTarget: 25,
      unlock: { dragon: 3, horde: 6, vault: 10, mothership: 20 },
      dragonScrolls: [10, 4], // 10 + 4L
      hordeGems: [40, 20], // 40 + 20L
      vaultChests: [2, 0.5], // 2 + floor(L / 2)
      mothershipGoldSeconds: 180,
      mothershipGoldFloors: 15, // gold is valued at the dungeon's floor + 15 (~ where the player is)
      mothershipScrolls: [3, 1], // 3 + L
    },

    // ---- keys, timers, new game ------------------------------------------------------
    keys: { max: 5, regenMs: 30 * 60 * 1000 },
    timers: { autoOpenInterval: 0.3, autosave: 15 },
    start: { chests: 10, keys: 3, gold: 0, gems: 0, scrolls: 0 },
  };

  // Fixed structural constants (not balance knobs).
  const WAVES_PER_FLOOR = 5;
  const BOSS_TIME = 30;
  const DUNGEON_TIME = 45;
  const MAX_CHEST_LEVEL = 20;

  // =====================================================================================
  // helpers
  // =====================================================================================
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const num = (v, d) => (isNum(v) ? v : d);
  // like num(), but an overflow to +Infinity saturates at a huge finite value instead of the default
  const big = (v, d) => (isNum(v) ? Math.min(v, 1e300) : v === Infinity ? 1e300 : d);
  const clampNum = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const toInt = (v, d) => (isNum(v) ? Math.floor(v) : d);
  const floorOf = (f) => clampNum(toInt(f, 1), 1, BALANCE.enemy.maxFloor);
  const pct = (v) => DD.fmtPct(v, 1);
  const secs = (v) => {
    const r = Math.round(v * 100) / 100;
    return r + 's';
  };
  const round5 = (v) => Math.round(v * 100000) / 100000;

  // Small deterministic PRNG (mulberry32) so wave composition is reproducible per floor/wave.
  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function weightedPick(weights, rnd) {
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) return 0;
    let r = rnd() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  // =====================================================================================
  // vocabulary tables
  // =====================================================================================
  const RARITIES = [
    { idx: 0, id: 'common', name: 'Common', color: '#9aa3ad', mult: 1.0, subs: 0, rollMult: 1 },
    { idx: 1, id: 'uncommon', name: 'Uncommon', color: '#5fd068', mult: 1.35, subs: 1, rollMult: 1 },
    { idx: 2, id: 'rare', name: 'Rare', color: '#4aa3ff', mult: 1.8, subs: 2, rollMult: 1 },
    { idx: 3, id: 'epic', name: 'Epic', color: '#b46cff', mult: 2.45, subs: 3, rollMult: 1 },
    { idx: 4, id: 'legendary', name: 'Legendary', color: '#ffa726', mult: 3.3, subs: 4, rollMult: 1 },
    { idx: 5, id: 'mythic', name: 'Mythic', color: '#ff5252', mult: 4.5, subs: 4, rollMult: 1.5 },
    { idx: 6, id: 'celestial', name: 'Celestial', color: '#5ef3ff', mult: 6.2, subs: 5, rollMult: 2 },
  ];

  // Slot ids in display order (plain strings); per-slot details in SLOT_INFO.
  const SLOTS = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'belt', 'ring', 'amulet'];
  const SLOT_INFO = {
    weapon: { id: 'weapon', name: 'Weapon', stat: 'atk', mult: 1.0 },
    helmet: { id: 'helmet', name: 'Helmet', stat: 'hp', mult: 0.6 },
    armor: { id: 'armor', name: 'Armor', stat: 'hp', mult: 1.0 },
    gloves: { id: 'gloves', name: 'Gloves', stat: 'atk', mult: 0.4 },
    boots: { id: 'boots', name: 'Boots', stat: 'hp', mult: 0.5 },
    belt: { id: 'belt', name: 'Belt', stat: 'hp', mult: 0.5 },
    ring: { id: 'ring', name: 'Ring', stat: 'atk', mult: 0.5 },
    amulet: { id: 'amulet', name: 'Amulet', stat: 'atk', mult: 0.5 },
  };

  const ERAS = [
    { idx: 0, id: 'medieval', name: 'Medieval', from: 1 },
    { idx: 1, id: 'arcane', name: 'Arcane', from: 11 },
    { idx: 2, id: 'infernal', name: 'Infernal', from: 21 },
    { idx: 3, id: 'steampunk', name: 'Steampunk', from: 31 },
    { idx: 4, id: 'cyber', name: 'Cyber', from: 41 },
    { idx: 5, id: 'cosmic', name: 'Cosmic', from: 51 },
  ];

  const SUBSTATS = [
    'critChance',
    'critDmg',
    'atkSpeed',
    'combo',
    'counter',
    'dodge',
    'stun',
    'lifesteal',
    'regen',
    'skillDmg',
    'bossDmg',
    'goldBonus',
  ];

  // Labels/format for every stat that can appear on an item or the hero sheet.
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
  const SUBSTAT_INFO = {};
  for (const k of SUBSTATS) {
    const info = Object.assign({ id: k }, STAT_INFO[k]);
    Object.defineProperty(info, 'range', { enumerable: true, get: () => BALANCE.subRanges[k] });
    SUBSTAT_INFO[k] = info;
  }

  // Base item names: ITEM_NAMES[slot][eraIdx] = [names...]
  const ITEM_NAMES = {
    // One weapon icon/sprite per era (sword, runed blade, cleaver, saber, katana, star blade), so
    // every name in an era describes that shape.
    weapon: [
      ['Rusty Sword', 'Iron Longsword', "Knight's Falchion", 'Steel Broadsword', "Squire's Blade"],
      ['Runed Blade', 'Moonsilver Saber', 'Glyph Sword', 'Crystal Edge'],
      ['Hellfire Cleaver', 'Brimstone Cleaver', 'Demonfang Chopper', 'Cinder Hatchet'],
      ['Steam Saber', 'Cogwork Rapier', 'Brass Cutlass', 'Valve Saber'],
      ['Plasma Katana', 'Laser Edge', 'Ion Blade', 'Neon Katana'],
      ['Star Edge', 'Void Reaver', 'Nebula Blade', 'Comet Sword'],
    ],
    helmet: [
      ['Leather Cap', 'Iron Helm', "Squire's Coif", 'Bucket Helm'],
      ["Sage's Circlet", 'Runic Hood', 'Starweave Cowl'],
      ['Horned Helm', 'Cinder Mask', 'Brimstone Visor'],
      ['Brass Goggles', 'Rivet Helm', 'Aviator Cap'],
      ['Neural Visor', 'HUD Helmet', 'Chrome Mask'],
      ['Astral Crown', 'Nova Helm', 'Pulsar Halo'],
    ],
    armor: [
      ['Padded Tunic', 'Chainmail Hauberk', 'Iron Breastplate'],
      ['Mystic Robe', 'Runeweave Vestment', 'Spellguard Mail'],
      ['Magma Plate', 'Ashen Cuirass', 'Demonhide Coat'],
      ['Boilerplate Vest', 'Brass Carapace', 'Clockwork Harness'],
      ['Nanofiber Suit', 'Kevlar Rig', 'Holo-Weave Jacket'],
      ['Starplate Armor', 'Nebula Mantle', 'Event Horizon Suit'],
    ],
    gloves: [
      ['Leather Gloves', 'Iron Gauntlets', "Archer's Bracers"],
      ['Spellweaver Gloves', 'Rune Grips', 'Etherbound Wraps'],
      ['Flameguard Gauntlets', 'Cinder Claws', 'Hellforged Fists'],
      ['Piston Gauntlets', "Tinker's Gloves", 'Gearwork Grips'],
      ['Haptic Gloves', 'Servo Fists', 'Shock Knuckles'],
      ['Gravity Gauntlets', 'Quasar Grips', 'Starfire Hands'],
    ],
    boots: [
      ['Worn Boots', 'Iron Greaves', "Ranger's Treads"],
      ['Sylph Slippers', 'Blinkstep Boots', 'Runed Sabatons'],
      ['Ember Treads', 'Lavawalker Boots', 'Charred Greaves'],
      ['Spring Boots', 'Brass Striders', 'Steamjet Boots'],
      ['Mag-Lev Boots', 'Neon Sneakers', 'Hydraulic Striders'],
      ['Moonwalkers', 'Comet Treads', 'Warp Boots'],
    ],
    belt: [
      ['Rope Belt', 'Leather Girdle', 'Studded Belt'],
      ['Sash of Whispers', 'Runic Cord', "Alchemist's Belt"],
      ['Chain of Torment', 'Brimstone Girdle', 'Ashbound Sash'],
      ['Gearbelt', 'Tool Harness', 'Valve Girdle'],
      ['Power Cell Belt', 'Utility Rig', 'Fusion Belt'],
      ['Orbit Sash', 'Stardust Girdle', 'Gravity Belt'],
    ],
    ring: [
      ['Copper Ring', 'Signet Ring', 'Garnet Band'],
      ['Moonstone Ring', 'Band of Sorcery', 'Runeloop'],
      ['Ring of Embers', 'Infernal Seal', 'Obsidian Band'],
      ['Gear Ring', 'Brass Coil', "Tinkerer's Loop"],
      ['Circuit Ring', 'Data Band', 'Holo Ring'],
      ['Ring of Saturn', 'Quasar Band', 'Starlight Loop'],
    ],
    amulet: [
      ['Wooden Charm', 'Silver Pendant', 'Holy Talisman'],
      ['Arcane Locket', 'Crystal Pendant', "Seer's Eye"],
      ["Demon's Heart", 'Ember Amulet', 'Skull Talisman'],
      ['Pocket Watch', 'Brass Medallion', 'Steam Core Pendant'],
      ['Neural Chip', 'Quantum Dongle', 'Neon Pendant'],
      ['Star Heart', 'Nebula Amulet', 'Singularity Charm'],
    ],
  };
  // Epithets prefixed to legendary+ item names, per rarity index.
  const EPITHETS = {
    4: ['Fabled', 'Kingsworn', 'Gilded', 'Ancient', 'Valiant', 'Heroic'],
    5: ['Bloodbound', 'Dread', 'Wyrmforged', 'Eclipsed', 'Doomsung'],
    6: ['Astral', 'Seraphic', 'Starborn', 'Empyrean', 'Godforged'],
  };

  const BIOMES = [
    {
      idx: 0,
      id: 'crypt',
      name: 'The Crypt',
      enemies: ['skeleton', 'bat', 'slime'],
      boss: 'lich',
      colors: { sky: '#14121c', wall: '#2b2a35', floor: '#3a3946', accent: '#5dff8a' },
    },
    {
      idx: 1,
      id: 'fungal',
      name: 'Fungal Hollows',
      enemies: ['mushroom', 'spider', 'sporeling'],
      boss: 'myconid_king',
      colors: { sky: '#120f1f', wall: '#2a2140', floor: '#3b2f4f', accent: '#c77dff' },
    },
    {
      idx: 2,
      id: 'forge',
      name: 'Magma Forge',
      enemies: ['imp', 'magma_golem', 'fire_hound'],
      boss: 'infernal',
      colors: { sky: '#1c0d0a', wall: '#3a1a12', floor: '#4a241a', accent: '#ff7b2e' },
    },
    {
      idx: 3,
      id: 'clockwork',
      name: 'Clockwork Depths',
      enemies: ['cog_knight', 'steam_bot', 'gear_rat'],
      boss: 'brass_colossus',
      colors: { sky: '#15120c', wall: '#3a3020', floor: '#4b3d28', accent: '#e0b04a' },
    },
    {
      idx: 4,
      id: 'neon',
      name: 'Neon Grid',
      enemies: ['drone', 'cyber_ninja', 'mech'],
      boss: 'ai_core',
      colors: { sky: '#07071a', wall: '#141438', floor: '#1d1d4a', accent: '#21e6ff' },
    },
    {
      idx: 5,
      id: 'void',
      name: 'Void Rift',
      enemies: ['alien', 'void_eye', 'tentacle'],
      boss: 'void_titan',
      colors: { sky: '#05030b', wall: '#1a1030', floor: '#251744', accent: '#b98bff' },
    },
  ];
  for (const b of BIOMES) b.normals = b.enemies; // alias

  // Static (visual/behaviour) enemy info; combat multipliers come from BALANCE.enemyTypes.
  const ENEMY_STATIC = {
    skeleton: { name: 'Skeleton', biome: 'crypt', w: 16, h: 22 },
    bat: { name: 'Crypt Bat', biome: 'crypt', w: 18, h: 16, flying: true },
    slime: { name: 'Bog Slime', biome: 'crypt', w: 20, h: 16 },
    lich: { name: 'Lich Lord', biome: 'crypt', w: 40, h: 48, boss: true },
    mushroom: { name: 'Shroomling', biome: 'fungal', w: 18, h: 20 },
    spider: { name: 'Cave Spider', biome: 'fungal', w: 22, h: 16 },
    sporeling: { name: 'Sporeling', biome: 'fungal', w: 16, h: 18, ranged: true, projectile: 'spit' },
    myconid_king: { name: 'Myconid King', biome: 'fungal', w: 44, h: 50, boss: true },
    imp: { name: 'Fire Imp', biome: 'forge', w: 16, h: 18, ranged: true, projectile: 'fireball' },
    magma_golem: { name: 'Magma Golem', biome: 'forge', w: 24, h: 24 },
    fire_hound: { name: 'Fire Hound', biome: 'forge', w: 24, h: 16 },
    infernal: { name: 'The Infernal', biome: 'forge', w: 48, h: 56, boss: true },
    cog_knight: { name: 'Cog Knight', biome: 'clockwork', w: 18, h: 22 },
    steam_bot: { name: 'Steam Bot', biome: 'clockwork', w: 18, h: 20, ranged: true, projectile: 'bolt' },
    gear_rat: { name: 'Gear Rat', biome: 'clockwork', w: 18, h: 16 },
    brass_colossus: { name: 'Brass Colossus', biome: 'clockwork', w: 50, h: 56, boss: true },
    drone: { name: 'Hunter Drone', biome: 'neon', w: 18, h: 16, flying: true, ranged: true, projectile: 'laser' },
    cyber_ninja: { name: 'Cyber Ninja', biome: 'neon', w: 16, h: 22 },
    mech: { name: 'Battle Mech', biome: 'neon', w: 24, h: 24 },
    ai_core: { name: 'A.I. Core', biome: 'neon', w: 44, h: 48, boss: true },
    alien: { name: 'Grey Alien', biome: 'void', w: 16, h: 22 },
    void_eye: { name: 'Void Eye', biome: 'void', w: 18, h: 18, flying: true, ranged: true, projectile: 'orb' },
    tentacle: { name: 'Void Tentacle', biome: 'void', w: 20, h: 24 },
    void_titan: { name: 'Void Titan', biome: 'void', w: 52, h: 56, boss: true },
    dragon: { name: 'Ancient Dragon', biome: 'dungeon', w: 64, h: 56, boss: true, ranged: true, projectile: 'fireball' },
    zombie: { name: 'Zombie', biome: 'dungeon', w: 16, h: 22 },
    stone_golem: { name: 'Stone Golem', biome: 'dungeon', w: 52, h: 54, boss: true },
    overlord: { name: 'Alien Overlord', biome: 'dungeon', w: 60, h: 64, boss: true, ranged: true, projectile: 'laser' },
  };
  // ENEMIES[typeId]: combat fields are getters onto BALANCE so runtime tuning is reflected.
  const ENEMIES = {};
  for (const id of Object.keys(ENEMY_STATIC)) {
    const st = ENEMY_STATIC[id];
    const bal = () => BALANCE.enemyTypes[id] || BALANCE.enemyTypes.skeleton;
    ENEMIES[id] = {
      id,
      name: st.name,
      biome: st.biome,
      w: st.w,
      h: st.h,
      flying: !!st.flying,
      ranged: !!st.ranged,
      projectile: st.projectile || null,
      boss: !!st.boss,
      get hpMult() {
        return bal().hp;
      },
      get atkMult() {
        return bal().atk;
      },
      get speed() {
        return bal().speed * num(BALANCE.enemy.speedMult, 1);
      },
      get range() {
        return bal().range;
      },
      get atkSpeed() {
        return bal().atkSpeed;
      },
      get weight() {
        return bal().weight;
      },
    };
  }

  const PROJECTILES = ['arrow', 'fireball', 'spit', 'bolt', 'laser', 'orb', 'rock'];

  // ---- skills -------------------------------------------------------------------------
  const SKILL_STATIC = {
    bomb: { name: 'Fire Bomb', rarity: 1, kind: 'damage', color: '#ff7b2e', flavor: 'A blazing bomb that blasts the whole enemy line.' },
    blades: { name: 'Spinning Blades', rarity: 2, kind: 'aura', color: '#c9d6e8', flavor: 'Whirling steel that shreds anything close.' },
    warcry: { name: 'Battle Cry', rarity: 2, kind: 'buff', color: '#ff5252', flavor: 'A furious roar that fuels every swing.' },
    heal: { name: 'Healing Light', rarity: 2, kind: 'heal', color: '#7dff9b', flavor: 'Holy light mends your wounds.' },
    lightning: { name: 'Chain Lightning', rarity: 3, kind: 'damage', color: '#7fc8ff', flavor: 'Bolts leap from foe to foe.' },
    shield: { name: 'Arcane Shield', rarity: 3, kind: 'shield', color: '#b46cff', flavor: 'A shimmering barrier soaks up damage.' },
    frost: { name: 'Frost Nova', rarity: 4, kind: 'damage', color: '#9be7ff', flavor: 'An icy burst that freezes enemies solid.' },
    meteor: { name: 'Meteor Strike', rarity: 5, kind: 'damage', color: '#ffb347', flavor: 'Call a falling star down on your foes.' },
  };
  const SKILLS = {};
  for (const id of Object.keys(SKILL_STATIC)) {
    const st = SKILL_STATIC[id];
    SKILLS[id] = {
      id,
      name: st.name,
      rarity: st.rarity,
      kind: st.kind,
      color: st.color,
      flavor: st.flavor,
      get cd() {
        return BALANCE.skills[id].cd;
      },
      get cooldown() {
        return BALANCE.skills[id].cd;
      },
      get unlock() {
        return BALANCE.skills[id].unlock;
      },
      get maxLevel() {
        return BALANCE.skillUpgrade.maxLevel;
      },
    };
  }
  const SKILL_IDS = Object.keys(SKILLS);

  // ---- allies -------------------------------------------------------------------------
  const ALLY_STATIC = {
    wolf: { name: 'Dire Wolf', rarity: 2, color: '#b0b8c8', flavor: 'A loyal hunter that savages your foes.' },
    fairy: { name: 'Pixie', rarity: 3, color: '#ff9bf0', flavor: 'A tiny healer fluttering at your side.' },
    drone_ally: { name: 'Battle Drone', rarity: 3, color: '#21e6ff', flavor: 'An automated gun platform with a quick trigger.' },
    golem_ally: { name: 'Ember Golem', rarity: 4, color: '#ff7b2e', flavor: 'A molten brute that slams the ground.' },
  };
  const ALLIES = {};
  for (const id of Object.keys(ALLY_STATIC)) {
    const st = ALLY_STATIC[id];
    ALLIES[id] = {
      id,
      name: st.name,
      rarity: st.rarity,
      color: st.color,
      flavor: st.flavor,
      get unlock() {
        return BALANCE.allies[id].unlock;
      },
      get interval() {
        return BALANCE.allies[id].interval;
      },
      get maxLevel() {
        return BALANCE.allyUpgrade.maxLevel;
      },
    };
  }
  const ALLY_IDS = Object.keys(ALLIES);

  // ---- mastery ------------------------------------------------------------------------
  const MASTERY_STATIC = {
    might: { name: 'Might', stat: 'atk', flavor: 'Permanently increases ATK.' },
    vitality: { name: 'Vitality', stat: 'hp', flavor: 'Permanently increases max HP.' },
    greed: { name: 'Greed', stat: 'goldBonus', flavor: 'Earn more gold from every source.' },
    fortune: { name: 'Fortune', stat: 'chestChance', flavor: 'Enemies drop chests more often.' },
    precision: { name: 'Precision', stat: 'critDmg', flavor: 'Critical hits strike harder.' },
    patience: { name: 'Patience', stat: 'offline', flavor: 'Collect AFK rewards for longer.' },
  };
  const MASTERY = {};
  for (const id of Object.keys(MASTERY_STATIC)) {
    const st = MASTERY_STATIC[id];
    MASTERY[id] = {
      id,
      name: st.name,
      stat: st.stat,
      flavor: st.flavor,
      get per() {
        return BALANCE.mastery[id].per;
      },
      get max() {
        return BALANCE.mastery[id].max;
      },
    };
  }
  const MASTERY_IDS = Object.keys(MASTERY);

  // ---- dungeons -----------------------------------------------------------------------
  const DUNGEON_STATIC = {
    dragon: { name: "Dragon's Lair", enemy: 'dragon', kind: 'boss', reward: 'scrolls', rewardName: 'Skill Scrolls', color: '#ff5a3c' },
    horde: { name: 'Zombie Horde', enemy: 'zombie', kind: 'horde', reward: 'gems', rewardName: 'Gems', color: '#7dff6a' },
    vault: { name: 'Golem Vault', enemy: 'stone_golem', kind: 'boss', reward: 'premiumChests', rewardName: 'Premium Chests', color: '#e0b04a' },
    mothership: { name: 'Mothership', enemy: 'overlord', kind: 'boss', reward: 'gold', rewardName: 'Gold & Scrolls', color: '#21e6ff' },
  };
  const DUNGEONS = {};
  for (const id of Object.keys(DUNGEON_STATIC)) {
    const st = DUNGEON_STATIC[id];
    DUNGEONS[id] = {
      id,
      name: st.name,
      enemy: st.enemy,
      boss: st.kind === 'boss' ? st.enemy : null,
      kind: st.kind,
      reward: st.reward,
      rewardName: st.rewardName,
      color: st.color,
      get unlockFloor() {
        return BALANCE.dungeons.unlock[id];
      },
      get time() {
        return BALANCE.dungeons.time;
      },
      get target() {
        return st.kind === 'horde' ? BALANCE.dungeons.hordeTarget : 1;
      },
    };
  }
  const DUNGEON_IDS = Object.keys(DUNGEONS);

  // =====================================================================================
  // quests
  // =====================================================================================
  // type: 'stat' (s.stats[key]), 'floor' (highestFloor), 'heroLevel', 'chestLevel',
  // 'skillsOwned', 'skillsEquipped', 'skillLevel' (best owned skill level), 'alliesOwned',
  // 'masteryTotal', 'equippedCount', 'power' (CP), 'rarity' (bestItemRarity >= key).
  const QUESTS = [
    { id: 'q_open1', text: 'Open a chest', type: 'stat', key: 'chestsOpened', target: 1, reward: { chests: 3 } },
    { id: 'q_equip1', text: 'Equip a new item', type: 'stat', key: 'itemsEquipped', target: 1, reward: { gems: 10 } },
    { id: 'q_floor2', text: 'Reach floor 2', type: 'floor', target: 2, reward: { chests: 5 } },
    { id: 'q_sell1', text: 'Sell an item', type: 'stat', key: 'itemsSold', target: 1, reward: { gems: 10 } },
    { id: 'q_open10', text: 'Open 10 chests', type: 'stat', key: 'chestsOpened', target: 10, reward: { gems: 15 } },
    { id: 'q_floor3', text: 'Reach floor 3', type: 'floor', target: 3, reward: { keys: 1 } },
    { id: 'q_slots4', text: 'Wear gear in 4 slots', type: 'equippedCount', target: 4, reward: { chests: 5 } },
    { id: 'q_chest2', text: 'Upgrade the chest to Lv 2', type: 'chestLevel', target: 2, reward: { gems: 20 } },
    { id: 'q_dungeon1', text: 'Win a Boss Dungeon', type: 'stat', key: 'dungeonsWon', target: 1, reward: { scrolls: 5 } },
    { id: 'q_flying1', text: 'Tap a flying chest', type: 'stat', key: 'flyingChests', target: 1, reward: { gems: 15 } },
    { id: 'q_level5', text: 'Reach hero level 5', type: 'heroLevel', target: 5, reward: { chests: 5 } },
    { id: 'q_floor5', text: 'Reach floor 5', type: 'floor', target: 5, reward: { gems: 20 } },
    { id: 'q_skill2', text: 'Unlock a new skill', type: 'skillsOwned', target: 2, reward: { scrolls: 5 } },
    { id: 'q_skillEq2', text: 'Equip 2 skills', type: 'skillsEquipped', target: 2, reward: { gems: 15 } },
    { id: 'q_mastery1', text: 'Buy a Mastery level', type: 'masteryTotal', target: 1, reward: { gems: 20 } },
    { id: 'q_auto', text: 'Turn on Auto-Open', type: 'stat', key: 'autoOpenUsed', target: 1, reward: { chests: 10 } },
    { id: 'q_rare', text: 'Find a Rare item', type: 'rarity', key: 2, target: 1, reward: { gems: 20 } },
    { id: 'q_floor7', text: 'Reach floor 7', type: 'floor', target: 7, reward: { keys: 1 } },
    { id: 'q_ally1', text: 'Recruit an ally', type: 'alliesOwned', target: 1, reward: { gems: 30 } },
    { id: 'q_chest4', text: 'Upgrade the chest to Lv 4', type: 'chestLevel', target: 4, reward: { chests: 10 } },
    { id: 'q_skilllv3', text: 'Upgrade a skill to Lv 3', type: 'skillLevel', target: 3, reward: { scrolls: 8 } },
    { id: 'q_floor10', text: 'Reach floor 10', type: 'floor', target: 10, reward: { gems: 50 } },
    { id: 'q_open100', text: 'Open 100 chests', type: 'stat', key: 'chestsOpened', target: 100, reward: { chests: 15 } },
    { id: 'q_epic', text: 'Find an Epic item', type: 'rarity', key: 3, target: 1, reward: { gems: 30 } },
    { id: 'q_power', text: 'Reach 1,000 Combat Power', type: 'power', target: 1000, reward: { gems: 40, scrolls: 5 } },
    { id: 'q_dungeon5', text: 'Win 5 Boss Dungeons', type: 'stat', key: 'dungeonsWon', target: 5, reward: { scrolls: 10 } },
    { id: 'q_floor15', text: 'Reach floor 15', type: 'floor', target: 15, reward: { gems: 60 } },
    { id: 'q_chest6', text: 'Upgrade the chest to Lv 6', type: 'chestLevel', target: 6, reward: { gems: 50 } },
    { id: 'q_kills500', text: 'Defeat 500 enemies', type: 'stat', key: 'kills', target: 500, reward: { chests: 20 } },
    { id: 'q_floor20', text: 'Reach floor 20', type: 'floor', target: 20, reward: { gems: 80, keys: 1 } },
  ];
  const ENDLESS_FIRST_FLOOR = 25;
  const ENDLESS_STEP = 5;

  // =====================================================================================
  // pure formulas
  // =====================================================================================
  function biomeForFloor(f) {
    const i = Math.floor((floorOf(f) - 1) / 10) % BIOMES.length;
    return BIOMES[i];
  }

  // Extra enemy HP & ATK multiplier on a floor: biomeStep per biome passed (floors 11, 21, …)
  // times every BALANCE.enemy.walls step [fromFloor, mult] already reached. These are the walls.
  function wallMult(floor) {
    const E = BALANCE.enemy;
    const f = floorOf(floor);
    let m = Math.pow(num(E.biomeStep, 1), Math.floor((f - 1) / 10));
    if (Array.isArray(E.walls)) {
      for (const w of E.walls) if (Array.isArray(w) && f >= w[0]) m *= num(w[1], 1);
    }
    return m;
  }

  function enemyStats(floor, typeId, opts) {
    const E = BALANCE.enemy;
    const f = floorOf(floor);
    const def = ENEMIES[typeId] || ENEMIES.skeleton;
    const isBoss = opts && typeof opts.isBoss === 'boolean' ? opts.isBoss : def.boss;
    const hpMult = num(def.hpMult, 1);
    const atkMult = num(def.atkMult, 1);
    const wall = wallMult(f);
    const hp =E.hpBase * hpMult * Math.pow(E.hpGrowth, f - 1) * wall * (isBoss ? E.bossHp : 1);
    const atk = E.atkBase * atkMult * Math.pow(E.atkGrowth, f - 1) * Math.pow(wall, num(E.wallAtkExp, 1)) * (isBoss ? E.bossAtk : 1);
    const gold = E.goldBase * Math.pow(E.goldGrowth, f - 1) * (isBoss ? E.bossGold : 1);
    const xp = E.xpBase * Math.pow(E.xpGrowth, f - 1) * (isBoss ? E.bossXp : 1);
    return {
      hp: Math.max(1, Math.round(big(hp, 1))),
      atk: Math.max(1, Math.round(big(atk, 1))),
      atkSpeed: Math.max(0.05, num(def.atkSpeed, 0.8)),
      gold: Math.max(1, Math.round(big(gold, 1))),
      xp: Math.max(1, Math.round(big(xp, 1))),
    };
  }

  // Gold of one normal kill on a floor (before gold bonus).
  function killGold(floor) {
    return enemyStats(floor, 'skeleton', { isBoss: false }).gold;
  }

  function waveComposition(floor, wave) {
    const W = BALANCE.waves;
    const f = floorOf(floor);
    const w = clampNum(toInt(wave, 1), 1, WAVES_PER_FLOOR);
    const biome = biomeForFloor(f);
    const rnd = seeded(f * 7919 + w * 104729 + 13);
    const weights = biome.enemies.map((t) => num(ENEMIES[t] && ENEMIES[t].weight, 1));
    const pickNormal = () => biome.enemies[weightedPick(weights, rnd)];
    const out = [];
    if (w >= WAVES_PER_FLOOR) {
      out.push(biome.boss);
      let adds = 0;
      for (const row of W.bossAdds) if (f >= row[0]) adds = row[1];
      // Minions beside the boss come from the biome's lighter enemies (no tanks), so the boss
      // fight's difficulty follows the floor curve instead of jumping with the seeded roll.
      let pool = biome.enemies.filter((t) => num(ENEMIES[t] && ENEMIES[t].hpMult, 1) <= num(W.bossAddMaxHp, 99));
      if (!pool.length) pool = biome.enemies;
      const addWeights = pool.map((t) => num(ENEMIES[t] && ENEMIES[t].weight, 1));
      for (let i = 0; i < adds; i++) out.push(pool[weightedPick(addWeights, rnd)]);
      return out;
    }
    const count = clampNum(
      W.baseCount + Math.floor((w - 1) / 2) * W.perTwoWaves + Math.min(W.floorBonusMax, Math.floor((f - 1) / W.floorStep)),
      W.minCount,
      W.maxCount,
    );
    for (let i = 0; i < count; i++) out.push(pickNormal());
    return out;
  }

  function heroBaseStats(level) {
    const H = BALANCE.hero;
    const L = clampNum(toInt(level, 1), 1, 100000);
    const g = Math.pow(H.growth, L - 1);
    return { atk: num(H.atk * g, H.atk), hp: num(H.hp * g, H.hp) };
  }

  function xpToNext(level) {
    const L = clampNum(toInt(level, 1), 1, 100000);
    const v = Math.floor(BALANCE.xp.base * Math.pow(BALANCE.xp.growth, L - 1));
    return isNum(v) ? Math.max(1, v) : Number.MAX_SAFE_INTEGER;
  }

  function rarityOdds(chestLevel) {
    const rows = BALANCE.chest.oddsBp;
    const L = clampNum(toInt(chestLevel, 1), 1, rows.length);
    const row = rows[L - 1];
    // row = [common, rare, epic, legendary, mythic, celestial]; uncommon = remainder.
    const bp = [row[0], 0, row[1], row[2], row[3], row[4], row[5]];
    const rest = 10000 - bp.reduce((a, b) => a + b, 0);
    bp[1] = Math.max(0, rest);
    const total = bp.reduce((a, b) => a + b, 0) || 10000;
    return bp.map((v) => v / total);
  }

  function premiumOdds(chestLevel) {
    const C = BALANCE.chest;
    const base = rarityOdds(toInt(chestLevel, 1) + C.premiumLevelBonus);
    const out = base.map((p, i) => (i < C.premiumMinRarity ? 0 : p));
    const total = out.reduce((a, b) => a + b, 0);
    if (total <= 0) return out.map((_, i) => (i === C.premiumMinRarity ? 1 : 0));
    return out.map((p) => p / total);
  }

  function chestUpgradeCost(level) {
    const L = clampNum(toInt(level, 1), 1, MAX_CHEST_LEVEL);
    return Math.floor(BALANCE.chest.costBase * Math.pow(BALANCE.chest.costGrowth, L - 1));
  }

  function itemIlvl(highestFloor) {
    const s = BALANCE.item.ilvlSpread;
    const v = floorOf(highestFloor) + DD.randInt(s[0], s[1]);
    return clampNum(v, 1, BALANCE.enemy.maxFloor);
  }

  function premiumIlvl(highestFloor) {
    const s = BALANCE.item.premiumIlvlSpread;
    return clampNum(floorOf(highestFloor) + DD.randInt(s[0], s[1]), 1, BALANCE.enemy.maxFloor);
  }

  function eraForIlvl(ilvl) {
    const v = Math.max(1, toInt(ilvl, 1));
    let e = 0;
    for (let i = 0; i < ERAS.length; i++) if (v >= ERAS[i].from) e = i;
    return e;
  }

  function itemMainValue(slot, rarity, ilvl) {
    const I = BALANCE.item;
    const info = SLOT_INFO[slot] || SLOT_INFO.weapon;
    const r = RARITIES[clampNum(toInt(rarity, 0), 0, 6)];
    const lv = clampNum(toInt(ilvl, 1), 1, BALANCE.enemy.maxFloor);
    const base = info.stat === 'atk' ? I.baseAtk : I.baseHp;
    return base * info.mult * r.mult * Math.pow(I.growth, lv - 1);
  }

  function rollSubValue(stat, rarity) {
    const range = BALANCE.subRanges[stat] || [0.01, 0.02];
    const r = RARITIES[clampNum(toInt(rarity, 0), 0, 6)];
    const v = DD.rand(range[0], range[1]) * (1 + BALANCE.item.subRarityScale * r.idx) * r.rollMult;
    return Math.max(0.00001, round5(v));
  }

  function rollSubs(slot, rarity) {
    const r = RARITIES[clampNum(toInt(rarity, 0), 0, 6)];
    const poolObj = BALANCE.subPools[slot] || {};
    let keys = Object.keys(poolObj).filter((k) => SUBSTATS.indexOf(k) >= 0);
    if (keys.length < r.subs) keys = SUBSTATS.slice(); // safety: fall back to the full list
    const weights = keys.map((k) => num(poolObj[k], 1));
    const subs = [];
    for (let n = 0; n < r.subs && keys.length; n++) {
      const i = DD.weightedIndex(weights);
      subs.push({ stat: keys[i], value: rollSubValue(keys[i], r.idx) });
      keys.splice(i, 1);
      weights.splice(i, 1);
    }
    // Keep a stable, readable order.
    subs.sort((a, b) => SUBSTATS.indexOf(a.stat) - SUBSTATS.indexOf(b.stat));
    return subs;
  }

  function itemName(slot, era, rarity) {
    const byEra = ITEM_NAMES[slot] || ITEM_NAMES.weapon;
    const list = byEra[clampNum(toInt(era, 0), 0, byEra.length - 1)];
    let name = DD.pick(list);
    const ep = EPITHETS[rarity];
    if (ep) name = DD.pick(ep) + ' ' + name;
    return name;
  }

  // Deterministic item factory (used for the starter weapon and by rollItem).
  // opts: { slot, rarity, ilvl, name?, mainRoll? (multiplier, default random ±mainSpread), subs? }
  function createItem(opts) {
    const o = opts || {};
    const slot = SLOT_INFO[o.slot] ? o.slot : 'weapon';
    const rarity = clampNum(toInt(o.rarity, 0), 0, 6);
    const ilvl = clampNum(toInt(o.ilvl, 1), 1, BALANCE.enemy.maxFloor);
    const era = eraForIlvl(ilvl);
    const spread = BALANCE.item.mainSpread;
    const roll = isNum(o.mainRoll) ? o.mainRoll : 1 + DD.rand(-spread, spread);
    const value = Math.max(1, Math.round(itemMainValue(slot, rarity, ilvl) * roll));
    return {
      id: DD.uid('it'),
      slot,
      rarity,
      ilvl,
      era,
      name: typeof o.name === 'string' && o.name ? o.name : itemName(slot, era, rarity),
      main: { stat: SLOT_INFO[slot].stat, value },
      subs: Array.isArray(o.subs) ? o.subs.map((x) => ({ stat: x.stat, value: x.value })) : rollSubs(slot, rarity),
    };
  }

  // rollItem({ ilvl, chestLevel, premium, slot?, rarity? }) → Item
  function rollItem(opts) {
    const o = opts || {};
    const chestLevel = clampNum(toInt(o.chestLevel, 1), 1, MAX_CHEST_LEVEL);
    const odds = o.premium ? premiumOdds(chestLevel) : rarityOdds(chestLevel);
    const rarity = isNum(o.rarity) ? clampNum(Math.floor(o.rarity), 0, 6) : DD.weightedIndex(odds);
    const slot = SLOT_INFO[o.slot] ? o.slot : DD.pick(SLOTS);
    return createItem({ slot, rarity, ilvl: toInt(o.ilvl, 1) });
  }

  function itemSellValue(item) {
    if (!item || typeof item !== 'object') return 0;
    const ilvl = clampNum(toInt(item.ilvl, 1), 1, BALANCE.enemy.maxFloor);
    const r = clampNum(toInt(item.rarity, 0), 0, 6);
    const v = Math.floor(BALANCE.sell.base * Math.pow(BALANCE.sell.growth, ilvl - 1) * Math.pow(1 + r, 2));
    return isNum(v) ? Math.max(1, v) : 1;
  }

  function calcPower(stats) {
    const st = stats || {};
    const P = BALANCE.power;
    const g = (k, d) => (isNum(st[k]) ? st[k] : d);
    const atk = Math.max(0, g('atk', 0));
    const hp = Math.max(0, g('hp', 0));
    const critChance = clampNum(g('critChance', 0), 0, 1);
    const critDmg = Math.max(1, g('critDmg', 1.5));
    const atkSpeed = Math.max(0.1, g('atkSpeed', 1));
    const util =
      1 +
      P.combo * Math.max(0, g('combo', 0)) +
      P.counter * Math.max(0, g('counter', 0)) +
      P.dodge * Math.max(0, g('dodge', 0)) +
      P.stun * Math.max(0, g('stun', 0)) +
      P.lifesteal * Math.max(0, g('lifesteal', 0)) +
      P.regen * Math.max(0, g('regen', 0)) +
      P.skillDmg * Math.max(0, g('skillDmg', 0)) +
      P.bossDmg * Math.max(0, g('bossDmg', 0));
    const extra = 1 + P.skillLevel * Math.max(0, g('skillLevels', 0)) + P.allyLevel * Math.max(0, g('allyLevels', 0));
    const v = (atk + P.hpWeight * hp) * (1 + critChance * (critDmg - 1)) * atkSpeed * util * extra;
    return isNum(v) ? Math.round(v) : 0;
  }

  // ---- skills -------------------------------------------------------------------------
  function skillLevelOf(level) {
    return clampNum(toInt(level, 1), 1, BALANCE.skillUpgrade.maxLevel);
  }
  function skillParams(id, level) {
    const B = BALANCE.skills[id];
    if (!B) return { cd: 10 };
    const L = skillLevelOf(level);
    const k = L - 1;
    switch (id) {
      case 'bomb':
        return { cd: B.cd, dmg: B.dmg + B.dmgPerLv * k };
      case 'blades':
        return { cd: B.cd, dmg: B.dmg + B.dmgPerLv * k, duration: B.duration, tick: B.tick, radius: B.radius };
      case 'warcry':
        return { cd: B.cd, duration: B.duration, buffAtk: B.buffAtk + B.buffAtkPerLv * k, buffSpd: B.buffSpd };
      case 'heal':
        return { cd: B.cd, heal: B.heal + B.healPerLv * k };
      case 'lightning':
        return { cd: B.cd, dmg: B.dmg + B.dmgPerLv * k, targets: B.targets + Math.floor(L / B.targetsEvery) };
      case 'shield':
        return { cd: B.cd, shield: B.shield + B.shieldPerLv * k, duration: B.duration };
      case 'frost':
        return { cd: B.cd, dmg: B.dmg + B.dmgPerLv * k, freeze: B.freeze + B.freezePerLv * k };
      case 'meteor':
        return { cd: B.cd, dmg: B.dmg + B.dmgPerLv * k, stun: B.stun };
      default:
        return { cd: B.cd };
    }
  }
  function skillDesc(id, level) {
    const p = skillParams(id, level);
    switch (id) {
      case 'bomb':
        return 'Hurl a fire bomb that blasts all enemies for ' + pct(p.dmg) + ' ATK.';
      case 'blades':
        return 'Spinning blades for ' + secs(p.duration) + ': every ' + secs(p.tick) + ' hit enemies within ' + p.radius + 'px for ' + pct(p.dmg) + ' ATK.';
      case 'warcry':
        return 'Roar for +' + pct(p.buffAtk) + ' ATK and +' + pct(p.buffSpd) + ' attack speed for ' + secs(p.duration) + '.';
      case 'heal':
        return 'Restore ' + pct(p.heal) + ' of max HP.';
      case 'lightning':
        return 'Lightning arcs through up to ' + p.targets + ' enemies for ' + pct(p.dmg) + ' ATK each.';
      case 'shield':
        return 'Gain a shield absorbing ' + pct(p.shield) + ' of max HP for ' + secs(p.duration) + '.';
      case 'frost':
        return 'Frost nova deals ' + pct(p.dmg) + ' ATK to all enemies and freezes them for ' + secs(p.freeze) + '.';
      case 'meteor':
        return 'A meteor crashes down for ' + pct(p.dmg) + ' ATK to all enemies and stuns them for ' + secs(p.stun) + '.';
      default:
        return '';
    }
  }
  function skillUpgradeCost(level) {
    const U = BALANCE.skillUpgrade;
    const L = clampNum(toInt(level, 1), 1, U.maxLevel);
    return Math.ceil(U.base + L * U.perLevel);
  }

  // ---- allies -------------------------------------------------------------------------
  function allyParams(id, level) {
    const B = BALANCE.allies[id];
    if (!B) return { interval: 2 };
    const L = clampNum(toInt(level, 1), 1, BALANCE.allyUpgrade.maxLevel);
    const k = L - 1;
    const out = { interval: B.interval };
    if (isNum(B.dmg)) out.dmg = B.dmg + B.dmgPerLv * k;
    if (isNum(B.heal)) out.heal = B.heal + B.healPerLv * k;
    if (isNum(B.radius)) out.radius = B.radius;
    return out;
  }
  function allyDesc(id, level) {
    const p = allyParams(id, level);
    switch (id) {
      case 'wolf':
        return 'Bites the nearest enemy every ' + secs(p.interval) + ' for ' + pct(p.dmg) + ' of your ATK.';
      case 'fairy':
        return 'Heals you for ' + pct(p.heal) + ' of max HP every ' + secs(p.interval) + '.';
      case 'drone_ally':
        return 'Shoots the nearest enemy every ' + secs(p.interval) + ' for ' + pct(p.dmg) + ' of your ATK.';
      case 'golem_ally':
        return 'Slams all enemies within ' + p.radius + 'px every ' + secs(p.interval) + ' for ' + pct(p.dmg) + ' of your ATK.';
      default:
        return '';
    }
  }
  function allyUpgradeCost(level) {
    const U = BALANCE.allyUpgrade;
    const L = clampNum(toInt(level, 1), 1, U.maxLevel);
    return Math.floor(U.base * Math.pow(U.growth, L - 1));
  }

  // ---- mastery ------------------------------------------------------------------------
  function masteryBonus(id, level) {
    const B = BALANCE.mastery[id];
    if (!B) return 0;
    const L = clampNum(toInt(level, 0), 0, B.max);
    return B.per * L;
  }
  function masteryCost(id, level) {
    const B = BALANCE.mastery[id];
    if (!B) return Infinity;
    const L = clampNum(toInt(level, 0), 0, B.max);
    if (L >= B.max) return Infinity;
    return B.costBase + B.costPerLv * L;
  }
  function masteryDesc(id, level) {
    const v = masteryBonus(id, level);
    switch (id) {
      case 'might':
        return '+' + pct(v) + ' ATK';
      case 'vitality':
        return '+' + pct(v) + ' max HP';
      case 'greed':
        return '+' + pct(v) + ' gold';
      case 'fortune':
        return '+' + pct(v) + ' chest drop chance';
      case 'precision':
        return '+' + pct(v) + ' crit damage';
      case 'patience': {
        const h = Math.round(v);
        return '+' + h + 'h offline time (' + (BALANCE.income.offlineBaseHours + h) + 'h max)';
      }
      default:
        return '';
    }
  }

  // ---- dungeons -----------------------------------------------------------------------
  function dungeonFloor(level) {
    const D = BALANCE.dungeons;
    return D.floorBase + Math.max(1, toInt(level, 1)) * D.floorPerLevel;
  }
  // Gold earned per second at a floor at the reference kill rate (before gold bonus).
  function goldIncomeRate(floor) {
    return BALANCE.income.refKillsPerSec * killGold(floor);
  }
  function dungeonRewards(id, level) {
    const D = BALANCE.dungeons;
    const L = Math.max(1, toInt(level, 1));
    switch (id) {
      case 'dragon':
        return { scrolls: D.dragonScrolls[0] + D.dragonScrolls[1] * L };
      case 'horde':
        return { gems: D.hordeGems[0] + D.hordeGems[1] * L };
      case 'vault':
        return { premiumChests: D.vaultChests[0] + Math.floor(L * D.vaultChests[1]) };
      case 'mothership':
        return {
          gold: Math.max(1, Math.round(D.mothershipGoldSeconds * goldIncomeRate(dungeonFloor(L) + num(D.mothershipGoldFloors, 0)))),
          scrolls: D.mothershipScrolls[0] + D.mothershipScrolls[1] * L,
        };
      default:
        return {};
    }
  }
  function dungeonDesc(id) {
    const d = DUNGEONS[id];
    if (!d) return '';
    const t = BALANCE.dungeons.time;
    switch (id) {
      case 'dragon':
        return 'Slay the Ancient Dragon within ' + t + 's. Rewards Skill Scrolls.';
      case 'horde':
        return 'Cut down ' + BALANCE.dungeons.hordeTarget + ' zombies within ' + t + 's. Rewards Gems.';
      case 'vault':
        return 'Shatter the Stone Golem within ' + t + 's. Rewards Premium Chests (Rare or better).';
      case 'mothership':
        return 'Take down the Alien Overlord within ' + t + 's. Rewards a hoard of Gold and Skill Scrolls.';
      default:
        return '';
    }
  }

  // ---- rewards ------------------------------------------------------------------------
  // Base floor-clear rewards (state applies the gold bonus).
  function floorClearRewards(floor) {
    const F = BALANCE.floorClear;
    const f = floorOf(floor);
    const gems = f % 10 === 0 ? F.gemsEvery10 : f % 5 === 0 ? F.gemsEvery5 : num(F.gems, 0);
    return { chests: F.chests, gold: Math.max(1, Math.round(F.goldKills * killGold(f))), gems };
  }

  function rewardText(r) {
    if (!r || typeof r !== 'object') return '';
    const parts = [];
    const add = (n, one, many) => {
      if (isNum(n) && n > 0) parts.push('+' + DD.fmt(n) + ' ' + (n === 1 ? one : many));
    };
    add(r.gold, 'Gold', 'Gold');
    add(r.gems, 'Gem', 'Gems');
    add(r.chests, 'Chest', 'Chests');
    add(r.premiumChests, 'Premium Chest', 'Premium Chests');
    add(r.scrolls, 'Skill Scroll', 'Skill Scrolls');
    add(r.keys, 'Key', 'Keys');
    add(r.key, 'Key', 'Keys');
    add(r.xp, 'XP', 'XP');
    return parts.join(', ');
  }

  // ---- quests -------------------------------------------------------------------------
  function questAt(index) {
    const i = Math.max(0, toInt(index, 0));
    if (i < QUESTS.length) {
      const q = QUESTS[i];
      return { id: q.id, text: q.text, type: q.type, key: q.key, target: q.target, reward: Object.assign({}, q.reward) };
    }
    const k = i - QUESTS.length;
    const floor = ENDLESS_FIRST_FLOOR + ENDLESS_STEP * k;
    const reward = { gems: Math.min(200, 40 + 5 * k) };
    if (k % 2 === 1) reward.chests = 10 + 2 * Math.floor(k / 2);
    if (k % 2 === 0) reward.scrolls = 6 + Math.floor(k / 2);
    if (k % 4 === 3) reward.keys = 1;
    return { id: 'floor_' + floor, text: 'Reach floor ' + floor, type: 'floor', target: floor, reward };
  }

  // ---- stat formatting ----------------------------------------------------------------
  function fmtStat(stat, value) {
    const info = STAT_INFO[stat];
    const v = isNum(value) ? value : 0;
    if (!info || info.fmt === 'num') return DD.fmt(v);
    const digits = Math.abs(v) < 0.01 ? 2 : 1;
    return (v >= 0 ? '+' : '') + DD.fmtPct(v, digits) + (info.suffix || '');
  }

  // =====================================================================================
  // export
  // =====================================================================================
  DD.data = {
    BALANCE,
    RARITIES,
    SLOTS,
    SLOT_INFO,
    ERAS,
    SUBSTATS,
    SUBSTAT_INFO,
    STAT_INFO,
    ITEM_NAMES,
    EPITHETS,
    BIOMES,
    ENEMIES,
    PROJECTILES,
    SKILLS,
    SKILL_IDS,
    ALLIES,
    ALLY_IDS,
    MASTERY,
    MASTERY_IDS,
    DUNGEONS,
    DUNGEON_IDS,
    QUESTS,
    WAVES_PER_FLOOR,
    BOSS_TIME,
    DUNGEON_TIME,
    MAX_CHEST_LEVEL,
    get MAX_KEYS() {
      return BALANCE.keys.max;
    },
    get KEY_REGEN_MS() {
      return BALANCE.keys.regenMs;
    },
    get SKILL_SLOT_FLOORS() {
      return BALANCE.skillSlotFloors.slice();
    },
    get ALLY_SLOT_FLOORS() {
      return BALANCE.allySlotFloors.slice();
    },
    get MAX_SKILL_LEVEL() {
      return BALANCE.skillUpgrade.maxLevel;
    },
    get MAX_ALLY_LEVEL() {
      return BALANCE.allyUpgrade.maxLevel;
    },

    biomeForFloor,
    wallMult,
    enemyStats,
    killGold,
    waveComposition,
    heroBaseStats,
    xpToNext,
    rollItem,
    createItem,
    itemIlvl,
    premiumIlvl,
    eraForIlvl,
    itemMainValue,
    itemName,
    rarityOdds,
    premiumOdds,
    chestUpgradeCost,
    itemSellValue,
    calcPower,
    skillParams,
    skillDesc,
    skillUpgradeCost,
    allyParams,
    allyDesc,
    allyUpgradeCost,
    masteryBonus,
    masteryCost,
    masteryDesc,
    dungeonFloor,
    dungeonRewards,
    dungeonDesc,
    goldIncomeRate,
    floorClearRewards,
    rewardText,
    questAt,
    fmtStat,
  };
})(globalThis.DD);
