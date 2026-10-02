/* Dungeon Dash — battle: the combat simulation (no drawing).
 *
 * Owns the campaign wave flow (waves 1–4, boss wave 5, farming, auto boss retries, revive), Boss
 * Dungeons, hero swings, skills, allies, enemy queueing, projectiles and the flying chest.
 * Render and UI read the view fields on DD.battle every frame; nothing here touches the DOM, so the
 * very same code runs headless in Node for balance simulations. All timing uses the fixed dt passed
 * to update() — never the wall clock — so speed ×3 and the simulator behave identically.
 *
 * Coordinates: logical world pixels (DD.WORLD). x is an entity's horizontal centre, y its feet line.
 */
(function (DD) {
  'use strict';

  // ------------------------------------------------------------------ constants
  const WORLD = DD.WORLD;
  const W = WORLD.W;
  const GROUND = WORLD.GROUND;
  const HERO_X = WORLD.HERO_X;

  const REACH = 46; // hero melee reach: hero.x → an enemy's near edge
  const MELEE_GAP = 18; // melee enemies stop with their near edge this far in front of hero.x
  const MELEE_SLACK = 3; // tolerance for "in melee range"
  const QUEUE_GAP = 6; // gap between queued melee enemies
  const SPAWN_SPACING = 28;
  const FLY_HOVER = 28; // flying enemies hover this far above the ground
  const RUN_SPEED = 90; // px/s of scroll while the hero runs
  const RUN_TIME = 1.0; // seconds of running between waves
  const ENTRY_SPEED = 75; // minimum walking speed while an enemy is still off-screen
  const BOSS_ENTRY_PAUSE = 0.7; // a boss stops for a beat when it first steps fully on screen
  const ENGAGE_GRACE = 8; // timers start at the latest this long into a timed fight
  const CLEAR_DELAY = 0.55; // beat after the last kill before running on
  const FLOOR_CLEAR_DELAY = 1.3; // a longer beat after a boss falls
  const BOSS_INTRO = 0.9; // pause on the boss wave before the boss steps in
  const REVIVE_TIME = 2;
  const DEAD_LINGER = 0.4; // dead enemies stay this long (render fades them)
  const RETREAT_SPEED = 120;
  const OUTRO_TIME = 1.8; // dungeon result pause before returning to the campaign
  const MAX_ENEMIES = 12; // living enemies at once
  const MAX_ENTITIES = 24; // living + fading
  const MAX_PROJECTILES = 40;
  const PROJ_SPEED = 140;
  const FLASH_TIME = 0.12;
  const HURT_TIME = 0.16;
  const BASE_SWING = 0.25; // swing length at 1 attack/s
  const COMBO_MAX = 3;
  const BOSS_CC = 0.4; // bosses suffer 40 % of stun / freeze durations (1 s stun → 0.4 s)
  const STUN_TIME = 1;
  const CHEST_LIFE = 8;
  const CHEST_TAP_R = 22;
  const CHEST_MIN = 45;
  const CHEST_MAX = 90;
  const HORDE_TARGET = 25;
  const HORDE_GROUP = 5;
  const HORDE_INTERVAL = 4;
  const ALLY_ANIM = 0.3;
  const AUTO_CAST_GAP = 0.35; // auto-cast at most one skill per this many seconds
  const HEAL_FLUSH = 1.0; // regen / lifesteal heal numbers are batched this often
  const SKILL_SLOTS = 4;
  const ALLY_SLOTS = 2;
  const HP_CEIL = 1e300;

  // ------------------------------------------------------------------ fallback content
  // Used only when DD.data lacks something at runtime; mirrors CONTRACT §3.
  const BIOME_FALLBACK = [
    { normals: ['skeleton', 'bat', 'slime'], boss: 'lich' },
    { normals: ['mushroom', 'spider', 'sporeling'], boss: 'myconid_king' },
    { normals: ['imp', 'magma_golem', 'fire_hound'], boss: 'infernal' },
    { normals: ['cog_knight', 'steam_bot', 'gear_rat'], boss: 'brass_colossus' },
    { normals: ['drone', 'cyber_ninja', 'mech'], boss: 'ai_core' },
    { normals: ['alien', 'void_eye', 'tentacle'], boss: 'void_titan' },
  ];

  const ENEMY_BASE = {
    name: 'Monster', hpMult: 1, atkMult: 1, speed: 40, range: 18, atkSpeed: 0.8,
    flying: false, ranged: false, projectile: null, w: 18, h: 20, boss: false,
  };
  const BOSS_HINT = { boss: true, w: 44, h: 48, speed: 26, atkSpeed: 0.6, hpMult: 1, atkMult: 1 };
  const ENEMY_HINTS = {
    skeleton: {}, mushroom: {}, cog_knight: {}, alien: {}, zombie: { speed: 32 },
    bat: { flying: true, speed: 58, w: 16, h: 14 },
    spider: { speed: 56 }, fire_hound: { speed: 60 }, gear_rat: { speed: 60 }, cyber_ninja: { speed: 62 },
    slime: { speed: 26, hpMult: 1.6, atkMult: 0.8 }, magma_golem: { speed: 24, hpMult: 1.7, w: 22, h: 24 },
    mech: { speed: 24, hpMult: 1.7, w: 22, h: 24 }, tentacle: { speed: 24, hpMult: 1.7, w: 20, h: 24 },
    sporeling: { ranged: true, projectile: 'spit', range: 110 },
    imp: { ranged: true, projectile: 'fireball', range: 120 },
    steam_bot: { ranged: true, projectile: 'bolt', range: 116 },
    drone: { ranged: true, flying: true, projectile: 'laser', range: 126, h: 16 },
    void_eye: { ranged: true, flying: true, projectile: 'orb', range: 120, h: 16 },
    lich: BOSS_HINT, myconid_king: BOSS_HINT, infernal: BOSS_HINT, brass_colossus: BOSS_HINT,
    ai_core: BOSS_HINT, void_titan: BOSS_HINT,
    dragon: { boss: true, w: 60, h: 58, speed: 24, atkSpeed: 0.6 },
    stone_golem: { boss: true, w: 48, h: 52, speed: 20, atkSpeed: 0.5 },
    overlord: { boss: true, w: 56, h: 60, speed: 22, atkSpeed: 0.6 },
  };

  const DUNGEON_FALLBACK = {
    dragon: { unlockFloor: 3, enemy: 'dragon', horde: false },
    horde: { unlockFloor: 6, enemy: 'zombie', horde: true },
    vault: { unlockFloor: 10, enemy: 'stone_golem', horde: false },
    mothership: { unlockFloor: 20, enemy: 'overlord', horde: false },
  };

  const SKILL_CD = { bomb: 8, blades: 12, warcry: 15, heal: 14, lightning: 7, shield: 18, frost: 16, meteor: 20 };
  function fallbackSkillParams(id, L) {
    const k = L - 1;
    switch (id) {
      case 'bomb': return { dmg: 3 + 0.3 * k };
      case 'blades': return { dmg: 0.6 + 0.06 * k, duration: 5, tick: 0.5, radius: 70 };
      case 'warcry': return { buffAtk: 0.3 + 0.03 * k, buffSpd: 0.2, duration: 6 };
      case 'heal': return { heal: 0.25 + 0.015 * k };
      case 'lightning': return { dmg: 2.2 + 0.22 * k, targets: 3 + Math.floor(L / 5) };
      case 'shield': return { shield: 0.3 + 0.02 * k, duration: 8 };
      case 'frost': return { dmg: 1.5 + 0.15 * k, freeze: 2.5 + 0.05 * k };
      case 'meteor': return { dmg: 6 + 0.6 * k, stun: 1.5 };
      default: return { dmg: 2 };
    }
  }

  function fallbackAllyParams(id, L) {
    const k = L - 1;
    switch (id) {
      case 'wolf': return { interval: 1.2, dmg: 0.6 + 0.06 * k };
      case 'fairy': return { interval: 2, heal: 0.04 + 0.004 * k };
      case 'drone_ally': return { interval: 0.6, dmg: 0.35 + 0.04 * k };
      case 'golem_ally': return { interval: 3, dmg: 1.2 + 0.12 * k, radius: 90 };
      default: return { interval: 1.5, dmg: 0.3 };
    }
  }
  const HOVER_ALLIES = { fairy: true, drone_ally: true };
  const KNOWN_ALLIES = { wolf: true, fairy: true, drone_ally: true, golem_ally: true };

  const DEFAULT_STATS = {
    atk: 10, hp: 100, atkSpeed: 1, critChance: 0.05, critDmg: 1.5, combo: 0, counter: 0, dodge: 0,
    stun: 0, lifesteal: 0, regen: 0, skillDmg: 0, bossDmg: 0, goldBonus: 0, chestChance: 0.3,
  };
  const STAT_LIMITS = {
    atk: [0, HP_CEIL], hp: [1, HP_CEIL], atkSpeed: [0.1, 4], critChance: [0, 1], critDmg: [1, 1e6],
    combo: [0, 0.75], counter: [0, 0.75], dodge: [0, 0.6], stun: [0, 0.5], lifesteal: [0, 1],
    regen: [0, 1], skillDmg: [0, 1e6], bossDmg: [0, 1e6], goldBonus: [0, 1e6], chestChance: [0, 1],
  };

  // ------------------------------------------------------------------ helpers
  function num(v, d) {
    return typeof v === 'number' && Number.isFinite(v) ? v : d;
  }
  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }
  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }
  function chance(p) {
    return p > 0 && Math.random() < p;
  }
  function D() {
    return DD.data || {};
  }
  function S() {
    const st = DD.state;
    return st && st.s && typeof st.s === 'object' ? st.s : null;
  }
  function stateCall(name) {
    const st = DD.state;
    if (!st || typeof st[name] !== 'function') return undefined;
    const args = Array.prototype.slice.call(arguments, 1);
    try {
      return st[name].apply(st, args);
    } catch (err) {
      console.error('[DD.battle] state.' + name + ' failed', err);
      return undefined;
    }
  }
  function dataCall(name, args) {
    const d = DD.data;
    if (!d || typeof d[name] !== 'function') return undefined;
    try {
      return d[name].apply(d, args);
    } catch (err) {
      console.error('[DD.battle] data.' + name + ' failed', err);
      return undefined;
    }
  }
  function emit(evt, payload) {
    DD.bus.emit(evt, payload);
  }
  function settings() {
    const s = S();
    return (s && s.settings) || {};
  }
  function wavesPerFloor() {
    return Math.max(2, Math.floor(num(D().WAVES_PER_FLOOR, 5)));
  }
  function bossTime() {
    return Math.max(5, num(D().BOSS_TIME, 30));
  }
  function dungeonTime() {
    return Math.max(5, num(D().DUNGEON_TIME, 45));
  }
  function lookup(table, id) {
    if (!table || typeof id !== 'string') return null;
    if (Array.isArray(table)) return table.find((x) => x && x.id === id) || null;
    if (typeof table === 'object') return table[id] && typeof table[id] === 'object' ? table[id] : null;
    return null;
  }
  function ownedLevel(owned, id) {
    if (!owned || typeof id !== 'string') return 0;
    const v = owned[id];
    if (typeof v === 'number') return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
    if (v && typeof v === 'object') return Math.max(0, Math.floor(num(v.level, 0)));
    if (v === true) return 1;
    return 0;
  }

  // ------------------------------------------------------------------ content readers
  function enemyDef(type) {
    const out = Object.assign({}, ENEMY_BASE, ENEMY_HINTS[type] || {});
    const E = D().ENEMIES;
    const d = E && typeof E === 'object' ? E[type] : null;
    if (d && typeof d === 'object') {
      for (const k of ['hpMult', 'atkMult', 'speed', 'range', 'atkSpeed', 'w', 'h']) {
        if (Number.isFinite(d[k]) && d[k] > 0) out[k] = d[k];
      }
      for (const k of ['flying', 'ranged', 'boss']) {
        if (d[k] !== undefined) out[k] = !!d[k];
      }
      if (typeof d.projectile === 'string' && d.projectile) out.projectile = d.projectile;
      if (typeof d.name === 'string' && d.name) out.name = d.name;
    }
    if (out.ranged && !out.projectile) out.projectile = 'arrow';
    if (!out.ranged) out.projectile = null;
    out.speed = clamp(out.speed, 6, 240);
    out.atkSpeed = clamp(out.atkSpeed, 0.1, 5);
    out.w = clamp(out.w, 6, 96);
    out.h = clamp(out.h, 6, 96);
    out.range = clamp(out.range, 8, 260);
    return out;
  }

  function enemyStatsFor(floor, type, isBoss, def) {
    let r = dataCall('enemyStats', [floor, type, { isBoss: isBoss }]);
    r = r && typeof r === 'object' ? r : {};
    const g = Math.min(HP_CEIL, Math.pow(1.17, Math.max(0, floor - 1)));
    const fb = {
      hp: 24 * g * def.hpMult * (isBoss ? 12 : 1),
      atk: 3 * g * def.atkMult * (isBoss ? 2.2 : 1),
      gold: 2 * g * (isBoss ? 12 : 1),
      xp: 3 * Math.min(HP_CEIL, Math.pow(1.12, Math.max(0, floor - 1))) * (isBoss ? 10 : 1),
    };
    return {
      hp: clamp(num(r.hp, fb.hp), 1, HP_CEIL),
      atk: clamp(num(r.atk, fb.atk), 0, HP_CEIL),
      atkSpeed: clamp(num(r.atkSpeed, def.atkSpeed), 0.1, 5),
      gold: clamp(num(r.gold, fb.gold), 0, HP_CEIL),
      xp: clamp(num(r.xp, fb.xp), 0, HP_CEIL),
    };
  }

  function fallbackComposition(floor, wave) {
    const b = BIOME_FALLBACK[Math.floor((Math.max(1, floor) - 1) / 10) % BIOME_FALLBACK.length];
    if (wave >= wavesPerFloor()) {
      const out = [b.boss];
      const adds = Math.min(2, Math.floor(floor / 4));
      for (let i = 0; i < adds; i++) out.push(b.normals[i % b.normals.length]);
      return out;
    }
    const n = clamp(3 + Math.floor((wave - 1) / 2) + (floor >= 6 ? 1 : 0) + (floor >= 15 ? 1 : 0), 3, 6);
    const out = [];
    for (let i = 0; i < n; i++) out.push(b.normals[Math.floor(Math.random() * b.normals.length)]);
    return out;
  }

  function composition(floor, wave) {
    let list = dataCall('waveComposition', [floor, wave]);
    if (Array.isArray(list)) list = list.filter((t) => typeof t === 'string' && t.length > 0);
    if (!Array.isArray(list) || list.length === 0) list = fallbackComposition(floor, wave);
    return list.slice(0, MAX_ENEMIES);
  }

  function dungeonDef(id) {
    if (typeof id !== 'string') return null;
    const fb = DUNGEON_FALLBACK[id] || null;
    const d = lookup(D().DUNGEONS, id);
    if (!d && !fb) return null;
    const src = d || {};
    const E = D().ENEMIES || {};
    let enemy = null;
    for (const k of ['enemy', 'boss', 'bossType', 'enemyType', 'unit', 'type']) {
      const v = src[k];
      if (typeof v === 'string' && (E[v] || ENEMY_HINTS[v])) {
        enemy = v;
        break;
      }
    }
    if (!enemy) enemy = fb ? fb.enemy : 'zombie';
    let horde = fb ? fb.horde : enemy === 'zombie';
    if (src.kind === 'horde') horde = true;
    else if (src.kind === 'boss') horde = false;
    const target = Math.max(1, Math.floor(num(src.target, num(src.count, num(src.kills, HORDE_TARGET)))));
    return {
      id: id,
      unlockFloor: Math.max(1, Math.floor(num(src.unlockFloor, num(src.unlock, fb ? fb.unlockFloor : 1)))),
      enemy: enemy,
      horde: horde,
      target: horde ? target : 1,
      time: Math.max(5, num(src.time, num(src.timeLimit, dungeonTime()))),
    };
  }

  function skillDef(id) {
    return lookup(D().SKILLS, id);
  }
  function isKnownSkill(id) {
    return typeof id === 'string' && (SKILL_CD[id] !== undefined || !!skillDef(id));
  }
  function skillCooldown(id) {
    const d = skillDef(id);
    const cd = d ? num(d.cd, num(d.cooldown, NaN)) : NaN;
    return Math.max(0.5, num(cd, SKILL_CD[id] || 10));
  }
  function skillLevel(id) {
    const s = S();
    return ownedLevel(s && s.skills && s.skills.owned, id);
  }
  function skillParamsFor(id, level) {
    const L = Math.max(1, level);
    const out = fallbackSkillParams(id, L);
    const p = dataCall('skillParams', [id, L]);
    if (p && typeof p === 'object') {
      for (const k of Object.keys(p)) if (Number.isFinite(p[k])) out[k] = p[k];
    }
    return out;
  }
  function allyLevel(id) {
    const s = S();
    return ownedLevel(s && s.allies && s.allies.owned, id);
  }
  function allyParamsFor(id, level) {
    const L = Math.max(1, level);
    const out = fallbackAllyParams(id, L);
    const p = dataCall('allyParams', [id, L]);
    if (p && typeof p === 'object') {
      for (const k of Object.keys(p)) if (Number.isFinite(p[k])) out[k] = p[k];
    }
    out.interval = Math.max(0.15, num(out.interval, 1.5));
    return out;
  }

  function readStats() {
    const raw = stateCall('getHeroStats');
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    for (const k of Object.keys(DEFAULT_STATS)) {
      const lim = STAT_LIMITS[k];
      out[k] = clamp(num(src[k], DEFAULT_STATS[k]), lim[0], lim[1]);
    }
    return out;
  }

  // ------------------------------------------------------------------ module + view fields
  const B = (DD.battle = {});

  B.mode = 'campaign';
  B.floor = 1;
  B.wave = 1;
  B.isBossWave = false;
  B.farming = false;
  B.bossTimer = 0;
  B.bossTimeLimit = 0;
  B.dungeon = null;
  B.hero = {
    x: HERO_X, y: GROUND, hp: 100, maxHp: 100, shield: 0, anim: 'idle', animTime: 0, attackAnim: 0,
    buffs: { warcry: 0, blades: 0, shield: 0 },
    swingKind: null, // extra: 'attack' | 'combo' | 'counter' while swinging
  };
  B.enemies = [];
  B.projectiles = [];
  B.allies = [];
  B.flyingChest = null;
  B.moving = false;
  B.scroll = 0;
  B.deadTimer = 0;
  B.skillSlots = [];
  for (let i = 0; i < SKILL_SLOTS; i++) B.skillSlots.push({ id: null, cd: 0, cdTotal: 0, level: 0, locked: i > 0 });
  // extras (read-only): current flow phase and battle clock
  B.phase = 'idle'; // 'run' | 'intro' | 'fight' | 'clear' | 'dead' | 'outro' | 'idle'
  B.time = 0;
  B.timerRunning = false; // boss / dungeon clock is ticking (starts once the fight is engaged)

  // ------------------------------------------------------------------ internal state
  let initialized = false;
  let inUpdate = false;
  let loadoutDirty = false;
  let stats = Object.assign({}, DEFAULT_STATS);
  let phaseTimer = 0;
  let nextWave = 1;
  let pendingSpawn = null;
  let swing = null; // { t, dur, kind, target, landed, combo }
  let atkCd = 0;
  let comboChain = 0;
  let hurtT = 0;
  let warcryAtk = 0;
  let warcrySpd = 0;
  let bladeDmg = 0;
  let bladeTick = 0.5;
  let bladeRadius = 70;
  let bladeTimer = 0;
  let cdById = {};
  let autoCastTimer = 0;
  let chestTimer = 40;
  const allyState = {}; // allyId → { timer }
  let pendingHeal = 0;
  let healFlushTimer = 0;
  let bossKilled = false;
  let fightClock = 0;
  let observedState = null;
  let observedFloor = null;

  // ------------------------------------------------------------------ small queries
  function heroAlive() {
    return B.phase !== 'dead' && B.hero.hp > 0;
  }
  function isActive(e) {
    return !e.dead && !e.fled;
  }
  function livingEnemies() {
    const out = [];
    for (const e of B.enemies) if (isActive(e)) out.push(e);
    return out;
  }
  function edgeDist(e) {
    return e.x - e.w / 2 - B.hero.x;
  }
  function onScreen(e) {
    return e.x - e.w / 2 < W - 2;
  }
  function nearestInReach() {
    let best = null;
    let bestD = Infinity;
    for (const e of B.enemies) {
      if (!isActive(e)) continue;
      const d = edgeDist(e);
      if (d <= REACH && d < bestD) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }
  function enemyById(id) {
    for (const e of B.enemies) if (e.id === id) return e;
    return null;
  }
  function statFloor() {
    return B.mode === 'dungeon' && B.dungeon ? B.dungeon.floor : B.floor;
  }
  function effAtk() {
    return stats.atk * (B.hero.buffs.warcry > 0 ? 1 + warcryAtk : 1);
  }
  function effAtkSpeed() {
    return clamp(stats.atkSpeed * (B.hero.buffs.warcry > 0 ? 1 + warcrySpd : 1), 0.1, 6);
  }
  function swingDuration() {
    const spd = effAtkSpeed();
    return Math.min(BASE_SWING / Math.sqrt(Math.max(1, spd)), 0.8 / spd);
  }
  function timedFight() {
    if (B.mode === 'dungeon') return !!(B.dungeon && !B.dungeon.ended);
    return B.isBossWave;
  }

  // ------------------------------------------------------------------ loadout (skills, allies)
  function refreshLoadout() {
    loadoutDirty = false;
    const s = S();
    // skills
    const eq = s && s.skills && Array.isArray(s.skills.equipped) ? s.skills.equipped : [];
    const unlocked = clamp(Math.floor(num(stateCall('skillSlotsUnlocked'), SKILL_SLOTS)), 0, SKILL_SLOTS);
    for (let i = 0; i < SKILL_SLOTS; i++) {
      const slot = B.skillSlots[i];
      const raw = eq[i];
      const lvl = isKnownSkill(raw) ? skillLevel(raw) : 0;
      const id = i < unlocked && lvl > 0 ? raw : null;
      slot.id = id;
      slot.level = id ? lvl : 0;
      slot.locked = i >= unlocked;
      slot.cdTotal = id ? skillCooldown(id) : 0;
      slot.cd = id ? Math.max(0, num(cdById[id], 0)) : 0;
    }
    // allies
    const aeq = s && s.allies && Array.isArray(s.allies.equipped) ? s.allies.equipped : [];
    const aUnlocked = clamp(Math.floor(num(stateCall('allySlotsUnlocked'), ALLY_SLOTS)), 0, ALLY_SLOTS);
    const prev = {};
    for (const a of B.allies) prev[a.id] = a;
    B.allies.length = 0;
    const seen = {};
    for (let i = 0; i < Math.min(ALLY_SLOTS, aUnlocked); i++) {
      const id = aeq[i];
      if (typeof id !== 'string' || seen[id]) continue;
      if (!KNOWN_ALLIES[id] && !lookup(D().ALLIES, id)) continue;
      const lvl = allyLevel(id);
      if (lvl <= 0) continue;
      seen[id] = true;
      const old = prev[id];
      const a = {
        id: id,
        x: old ? old.x : B.hero.x - 24 - i * 22,
        y: old ? old.y : GROUND,
        anim: old ? old.anim : 'idle',
        animTime: old ? old.animTime : 0,
        level: lvl,
        slot: i,
        hover: !!HOVER_ALLIES[id],
      };
      B.allies.push(a);
      if (!allyState[id]) allyState[id] = { timer: rnd(0.3, 0.8) };
    }
    positionAllies(0);
  }

  function positionAllies(dt) {
    let i = 0;
    for (const a of B.allies) {
      // Hovering allies sit higher and slightly closer; walkers line up behind the hero.
      const tx = B.hero.x - 24 - i * 22;
      a.x = dt > 0 ? a.x + (tx - a.x) * Math.min(1, dt * 8) : tx;
      a.y = a.hover ? GROUND - 34 + Math.sin(B.time * 3 + i * 1.7) * 3 : GROUND;
      i++;
    }
  }

  // ------------------------------------------------------------------ enemies
  function makeEnemy(type, floor) {
    const def = enemyDef(type);
    const isBoss = !!def.boss;
    const st = enemyStatsFor(floor, type, isBoss, def);
    const flying = !!def.flying;
    const baseY = flying ? GROUND - FLY_HOVER : GROUND;
    const ranged = !!def.ranged;
    return {
      id: DD.uid('en'),
      type: type,
      x: W + 10 + def.w / 2,
      y: baseY,
      w: def.w,
      h: def.h,
      hp: st.hp,
      maxHp: st.hp,
      isBoss: isBoss,
      flying: flying,
      anim: 'walk',
      animTime: Math.random() * 0.4,
      stun: 0,
      frozen: 0,
      flash: 0,
      dead: false,
      deadTime: 0,
      // extras (render may use them; battle uses them internally)
      name: def.name,
      ranged: ranged,
      projectile: def.projectile,
      fled: false,
      facing: -1, // -1 faces the hero (left); 1 while fleeing to the right
      moving: true,
      // simulation-only
      speed: def.speed * rnd(0.93, 1.07),
      atk: st.atk,
      atkSpeed: st.atkSpeed,
      gold: st.gold,
      xp: st.xp,
      floor: floor,
      atkCd: rnd(0.25, 0.75),
      swing: -1,
      struck: false,
      hurtT: 0,
      baseY: baseY,
      bob: rnd(0, Math.PI * 2),
      pauseT: 0,
      entered: false,
      standoff: ranged ? clamp(def.range, 50, W - HERO_X - 40) + rnd(-4, 6) : 0,
      stopX: 0,
    };
  }

  /** Spawns enemies of the given types off-screen right, queued behind anything still walking in. */
  function spawnEnemies(types, floor) {
    let living = 0;
    let cursor = W + 10;
    for (const e of B.enemies) {
      if (!isActive(e)) continue;
      living++;
      cursor = Math.max(cursor, e.x + e.w / 2 + QUEUE_GAP);
    }
    let n = 0;
    for (const t of types) {
      if (living >= MAX_ENEMIES) break;
      const e = makeEnemy(t, floor);
      e.x = cursor + e.w / 2;
      cursor = Math.max(cursor + SPAWN_SPACING, e.x + e.w / 2 + QUEUE_GAP);
      B.enemies.push(e);
      living++;
      n++;
    }
    trimEntities();
    return n;
  }

  function trimEntities() {
    if (B.enemies.length <= MAX_ENTITIES) return;
    // Drop the oldest fading corpses first.
    for (let i = 0; i < B.enemies.length && B.enemies.length > MAX_ENTITIES; ) {
      if (B.enemies[i].dead) B.enemies.splice(i, 1);
      else i++;
    }
  }

  /** Enemies leave the field without rewards (hero died, timeout, wave abandoned). */
  function retreatAll() {
    for (const e of B.enemies) {
      if (e.dead) continue;
      e.dead = true;
      e.fled = true;
      e.facing = 1;
      e.deadTime = 0;
      e.swing = -1;
      e.stun = 0;
      e.frozen = 0;
      e.anim = 'walk';
      e.animTime = 0;
    }
    B.projectiles.length = 0;
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    e.deadTime = 0;
    e.swing = -1;
    e.stun = 0;
    e.frozen = 0;
    e.anim = 'dead';
    e.animTime = 0;
    const info = { floor: e.floor, isBoss: e.isBoss, typeId: e.type, gold: e.gold, xp: e.xp };
    if (B.mode === 'dungeon' && B.dungeon) info.dungeon = B.dungeon.id;
    const res = stateCall('grantKill', info);
    const r = res && typeof res === 'object' ? res : {};
    emit('enemy:killed', {
      id: e.id, type: e.type, x: e.x, y: e.y - e.h / 2, isBoss: e.isBoss,
      gold: Math.max(0, num(r.gold, e.gold)), xp: Math.max(0, num(r.xp, e.xp)), chest: !!r.chest,
    });
    if (B.mode === 'dungeon' && B.dungeon && !B.dungeon.ended) B.dungeon.killed++;
    if (e.isBoss) bossKilled = true;
  }

  function damageEnemy(e, amount, kind, crit) {
    if (!e || e.dead) return 0;
    amount = clamp(num(amount, 0), 0, HP_CEIL);
    if (amount <= 0) return 0;
    e.hp -= amount;
    e.flash = FLASH_TIME;
    if (e.swing < 0) e.hurtT = HURT_TIME;
    emit('hit', {
      target: 'enemy', id: e.id, x: e.x, y: e.y - e.h, amount: amount, crit: !!crit, miss: false, kind: kind,
    });
    if (!(e.hp > 0)) killEnemy(e);
    return amount;
  }

  function applyControl(e, field, secs) {
    if (!e || e.dead || !(secs > 0)) return;
    const d = e.isBoss ? secs * BOSS_CC : secs;
    if (d > e[field]) e[field] = d;
    e.swing = -1;
  }

  function moveEnemies(dt) {
    const list = livingEnemies().sort((a, b) => a.x - b.x);
    // Four lanes: melee/ranged × ground/air. Each lane queues single file with a small gap, so
    // melee foes form a line where only the front ones reach the hero, and shooters never stack.
    const laneFront = {};
    for (const e of list) {
      const lane = (e.ranged ? 'r' : 'm') + (e.flying ? 'a' : 'g');
      let stop = e.ranged ? B.hero.x + e.standoff : B.hero.x + MELEE_GAP + e.w / 2;
      const front = laneFront[lane];
      if (front) stop = Math.max(stop, front.x + front.w / 2 + QUEUE_GAP + e.w / 2);
      laneFront[lane] = e;
      e.stopX = stop;
      if (e.pauseT > 0) {
        // Boss entrance beat: stand still for a moment once fully on screen, then walk on in
        // the same frame the pause ends (so it never reads as "settled").
        e.pauseT -= dt;
        if (e.pauseT > 0) {
          e.moving = false;
          continue;
        }
        e.pauseT = 0;
      }
      const free = e.stun <= 0 && e.frozen <= 0 && e.swing < 0;
      if (free && e.x > stop + 0.01) {
        // Hustle while still off-screen so waves arrive promptly, then walk at normal pace.
        const offscreen = e.x - e.w / 2 > W - 6;
        const speed = offscreen ? Math.max(e.speed, ENTRY_SPEED) : e.speed;
        e.x -= Math.min(speed * dt, e.x - stop);
        e.moving = true;
        if (e.isBoss && !e.entered && e.x + e.w / 2 <= W - 6) {
          e.entered = true;
          e.pauseT = BOSS_ENTRY_PAUSE;
        }
      } else {
        e.moving = false;
      }
    }
  }

  /** True once the fight has really begun: someone is trading blows (or after a grace period).
   *  Boss and dungeon timers only run while engaged, so a slow walk-in never eats the clock. */
  function fightEngaged() {
    for (const e of B.enemies) {
      if (!isActive(e)) continue;
      if (edgeDist(e) <= REACH || enemyInRange(e)) return true;
    }
    return false;
  }

  function enemyInRange(e) {
    // Shooters fire from wherever their lane lets them stand (never from off-screen).
    if (e.ranged) return !e.moving && e.x <= Math.max(B.hero.x + e.standoff, num(e.stopX, 0)) + 2 && onScreen(e);
    return edgeDist(e) <= MELEE_GAP + MELEE_SLACK;
  }

  /** Engaged enough to keep the attack timer charging (a knockback must not reset the rhythm). */
  function enemyNear(e) {
    if (e.ranged) return enemyInRange(e);
    return edgeDist(e) <= MELEE_GAP + MELEE_SLACK + 10;
  }

  function enemyAttacks(dt) {
    for (const e of B.enemies) {
      if (!isActive(e)) continue;
      if (e.stun > 0 || e.frozen > 0) {
        e.swing = -1;
        continue;
      }
      if (e.swing >= 0) {
        e.swing += dt;
        const dur = e.isBoss ? 0.6 : 0.4;
        if (!e.struck && e.swing >= dur * 0.5) {
          e.struck = true;
          enemyStrike(e);
          if (B.phase !== 'fight') return;
        }
        if (e.swing >= dur) e.swing = -1;
      } else if (enemyNear(e)) {
        e.atkCd = Math.max(0, e.atkCd - dt);
        if (e.atkCd <= 0 && enemyInRange(e)) {
          e.swing = 0;
          e.struck = false;
          e.atkCd = 1 / Math.max(0.1, e.atkSpeed);
        }
      }
    }
  }

  function enemyStrike(e) {
    const fx = e.x - e.w / 2;
    const fy = e.y - e.h * 0.55;
    emit('enemy:attack', { id: e.id, type: e.type, x: fx, y: fy, ranged: e.ranged });
    if (e.ranged) spawnProjectile(e, fx, fy);
    else damageHero(e.atk, e);
  }

  // ------------------------------------------------------------------ projectiles
  function spawnProjectile(e, sx, sy) {
    if (B.projectiles.length >= MAX_PROJECTILES) {
      // Field saturated: resolve the shot instantly rather than dropping it.
      damageHero(e.atk, e);
      return;
    }
    const tx = B.hero.x + 4;
    const ty = B.hero.y - 14;
    const dx = tx - sx;
    const dy = ty - sy;
    const d = Math.max(1, Math.hypot(dx, dy));
    B.projectiles.push({
      id: DD.uid('pj'),
      kind: e.projectile || 'arrow',
      x: sx,
      y: sy,
      vx: (dx / d) * PROJ_SPEED,
      vy: (dy / d) * PROJ_SPEED,
      t: 0,
      ttl: d / PROJ_SPEED,
      dmg: e.atk,
      srcId: e.id,
    });
  }

  function updateProjectiles(dt) {
    if (B.phase !== 'fight' || !heroAlive()) {
      B.projectiles.length = 0;
      return;
    }
    for (let i = 0; i < B.projectiles.length; ) {
      const p = B.projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.t += dt;
      if (p.t >= p.ttl || p.x <= B.hero.x + 6) {
        B.projectiles.splice(i, 1);
        emit('projectile:hit', { kind: p.kind, x: p.x, y: p.y });
        damageHero(p.dmg, enemyById(p.srcId));
        if (B.phase !== 'fight') return;
        continue;
      }
      i++;
    }
  }

  // ------------------------------------------------------------------ hero
  function healHero(amount, source) {
    if (!heroAlive()) return 0;
    amount = num(amount, 0);
    if (amount <= 0) return 0;
    const before = B.hero.hp;
    B.hero.hp = Math.min(B.hero.maxHp, before + amount);
    const gained = B.hero.hp - before;
    if (gained <= 0) return 0;
    if (source === 'regen' || source === 'lifesteal') pendingHeal += gained;
    else emit('heal', { x: B.hero.x, y: B.hero.y - 30, amount: gained, source: source });
    return gained;
  }

  function flushHeals(dt) {
    healFlushTimer -= dt;
    if (healFlushTimer > 0) return;
    healFlushTimer = HEAL_FLUSH;
    if (pendingHeal >= 1 || (pendingHeal > 0 && pendingHeal >= B.hero.maxHp * 0.01)) {
      emit('heal', { x: B.hero.x, y: B.hero.y - 30, amount: pendingHeal, source: 'regen' });
    }
    pendingHeal = 0;
  }

  function damageHero(amount, src) {
    if (!heroAlive() || B.phase !== 'fight') return;
    amount = clamp(num(amount, 0), 0, HP_CEIL);
    const hx = B.hero.x;
    const hy = B.hero.y - 26;
    if (chance(stats.dodge)) {
      emit('hit', { target: 'hero', x: hx, y: hy, amount: 0, crit: false, miss: true, kind: 'enemy' });
      return;
    }
    let absorbed = 0;
    if (B.hero.shield > 0) {
      absorbed = Math.min(B.hero.shield, amount);
      B.hero.shield -= absorbed;
      if (B.hero.shield <= 1e-9) {
        B.hero.shield = 0;
        B.hero.buffs.shield = 0;
      }
    }
    const taken = amount - absorbed;
    B.hero.hp -= taken;
    emit('hit', {
      target: 'hero', x: hx, y: hy, amount: amount, crit: false, miss: false, kind: 'enemy', absorbed: absorbed,
    });
    if (taken > 0) hurtT = HURT_TIME;
    if (!(B.hero.hp > 0)) {
      die();
      return;
    }
    if (src && isActive(src) && chance(stats.counter)) heroStrike(src, 'counter');
  }

  /** One hero weapon hit on e (attack, combo or counter). */
  function heroStrike(e, kind) {
    if (!e || e.dead) return;
    const crit = chance(stats.critChance);
    let dmg = effAtk() * (crit ? stats.critDmg : 1);
    if (e.isBoss) dmg *= 1 + stats.bossDmg;
    emit('hero:attack', { x: B.hero.x + 14, y: B.hero.y - 14, crit: crit, kind: kind });
    const dealt = damageEnemy(e, dmg, kind, crit);
    if (dealt > 0 && stats.lifesteal > 0) healHero(dealt * stats.lifesteal, 'lifesteal');
    if (e.dead) return;
    if (chance(stats.stun)) applyControl(e, 'stun', STUN_TIME);
    if (!e.isBoss) knockback(e, rnd(3, 6));
  }

  /** Pushes e back and shoves the melee line queued behind it, so the queue never overlaps. */
  function knockback(e, px) {
    e.x += px;
    if (e.ranged) return;
    const line = B.enemies
      .filter((f) => isActive(f) && !f.ranged && f.flying === e.flying && f.x >= e.x - px && f !== e)
      .sort((a, b) => a.x - b.x);
    let prev = e;
    for (const f of line) {
      const minX = prev.x + prev.w / 2 + QUEUE_GAP + f.w / 2;
      if (f.x >= minX) break;
      if (f.isBoss) break; // bosses hold their ground
      f.x = minX;
      prev = f;
    }
  }

  function startSwing(kind, target) {
    const dur = swingDuration() * (kind === 'combo' ? 0.7 : 1);
    swing = { t: 0, dur: Math.max(0.04, dur), kind: kind, target: target, landed: false, combo: false };
    B.hero.attackAnim = 0;
    B.hero.swingKind = kind;
  }

  function heroCombat(dt) {
    atkCd = Math.max(0, atkCd - dt);
    if (swing) {
      swing.t += dt;
      B.hero.attackAnim = clamp(swing.t / swing.dur, 0, 1);
      if (!swing.landed && B.hero.attackAnim >= 0.5) {
        swing.landed = true;
        let t = swing.target;
        if (!t || !isActive(t) || edgeDist(t) > REACH + 8) t = nearestInReach();
        if (t) {
          heroStrike(t, swing.kind);
          if (comboChain < COMBO_MAX && chance(stats.combo)) swing.combo = true;
        }
        if (B.phase !== 'fight') return;
      }
      if (B.hero.attackAnim >= 1) {
        const combo = swing.combo;
        swing = null;
        B.hero.attackAnim = 0;
        B.hero.swingKind = null;
        const t = combo ? nearestInReach() : null;
        if (t) {
          comboChain++;
          startSwing('combo', t);
        } else {
          comboChain = 0;
        }
      }
      return;
    }
    if (atkCd <= 0 && !B.moving) {
      const t = nearestInReach();
      if (t) {
        comboChain = 0;
        startSwing('attack', t);
        atkCd = 1 / effAtkSpeed();
      }
    }
  }

  /** With nobody in reach and nobody still approaching (ranged foes holding back, stunned or
   *  frozen enemies), the hero walks up to them: the world scrolls and the enemies slide closer. */
  function heroAdvance(dt) {
    if (swing) return false;
    const list = livingEnemies();
    if (list.length === 0) return false;
    let nearest = Infinity;
    for (const e of list) {
      if (e.moving || e.pauseT > 0) return false;
      nearest = Math.min(nearest, edgeDist(e));
    }
    if (nearest <= REACH) return false;
    const step = Math.min(RUN_SPEED * dt, nearest - (REACH - 6));
    if (!(step > 0)) return false;
    shiftWorld(step);
    B.moving = true;
    return true;
  }

  function shiftWorld(step) {
    B.scroll += step;
    for (const e of B.enemies) e.x -= step;
    for (const p of B.projectiles) p.x -= step;
  }

  function die() {
    const h = B.hero;
    h.hp = 0;
    h.shield = 0;
    h.buffs.warcry = 0;
    h.buffs.blades = 0;
    h.buffs.shield = 0;
    h.attackAnim = 0;
    h.swingKind = null;
    swing = null;
    comboChain = 0;
    pendingHeal = 0;
    B.moving = false;
    B.phase = 'dead';
    B.deadTimer = REVIVE_TIME;
    nextWave = 1;
    stateCall('onHeroDied');
    emit('hero:died', {});
    if (B.mode === 'campaign' && B.isBossWave) failBoss('death');
    else if (B.mode === 'dungeon' && B.dungeon && !B.dungeon.ended) failDungeon('death');
    retreatAll();
  }

  function revive() {
    const h = B.hero;
    B.deadTimer = 0;
    h.hp = h.maxHp;
    h.shield = 0;
    h.buffs.shield = 0;
    hurtT = 0;
    atkCd = 0;
    emit('hero:revived', {});
    if (B.mode === 'dungeon') returnToCampaign();
    else startRun(nextWave, RUN_TIME);
  }

  // ------------------------------------------------------------------ skills
  function tickCooldowns(dt) {
    for (const id of Object.keys(cdById)) {
      const v = num(cdById[id], 0) - dt;
      if (v <= 0) delete cdById[id];
      else cdById[id] = v;
    }
    for (const slot of B.skillSlots) slot.cd = slot.id ? Math.max(0, num(cdById[slot.id], 0)) : 0;
  }

  function tickBuffs(dt) {
    const b = B.hero.buffs;
    b.warcry = Math.max(0, b.warcry - dt);
    b.blades = Math.max(0, b.blades - dt);
    if (b.shield > 0) {
      b.shield = Math.max(0, b.shield - dt);
      if (b.shield <= 0) B.hero.shield = 0;
    }
    if (B.hero.shield <= 0) b.shield = 0;
  }

  function bladesStep(dt) {
    if (B.hero.buffs.blades <= 0) return;
    bladeTimer -= dt;
    if (bladeTimer > 0) return;
    bladeTimer += bladeTick;
    if (bladeTimer < 0) bladeTimer = bladeTick;
    const dmg = effAtk() * bladeDmg * (1 + stats.skillDmg);
    for (const e of livingEnemies()) {
      if (Math.abs(e.x - B.hero.x) - e.w / 2 <= bladeRadius) skillHit(e, dmg);
    }
  }

  function skillHit(e, base) {
    const crit = chance(stats.critChance);
    let dmg = base * (crit ? stats.critDmg : 1);
    if (e.isBoss) dmg *= 1 + stats.bossDmg;
    damageEnemy(e, dmg, 'skill', crit);
  }

  function center(e) {
    return { x: e.x, y: e.y - e.h / 2 };
  }

  function castSlot(i) {
    const slot = B.skillSlots[i];
    if (!slot || !slot.id || slot.cd > 0 || num(cdById[slot.id], 0) > 0) return false;
    if (B.phase !== 'fight' || !heroAlive()) return false;
    const visible = livingEnemies().filter(onScreen);
    if (visible.length === 0) return false;
    const id = slot.id;
    const p = skillParamsFor(id, slot.level || skillLevel(id) || 1);
    const base = effAtk() * (1 + stats.skillDmg);
    const h = B.hero;
    let hits = [];
    let after = null;

    switch (id) {
      case 'blades': {
        h.buffs.blades = Math.max(0.5, num(p.duration, 5));
        bladeDmg = Math.max(0, num(p.dmg, 0.6));
        bladeTick = clamp(num(p.tick, 0.5), 0.1, 2);
        bladeRadius = clamp(num(p.radius, 70), 20, 200);
        bladeTimer = 0;
        hits = visible.filter((e) => Math.abs(e.x - h.x) - e.w / 2 <= bladeRadius);
        break;
      }
      case 'warcry': {
        h.buffs.warcry = Math.max(0.5, num(p.duration, 6));
        warcryAtk = Math.max(0, num(p.buffAtk, 0.3));
        warcrySpd = Math.max(0, num(p.buffSpd, 0.2));
        break;
      }
      case 'heal': {
        after = () => healHero(h.maxHp * Math.max(0, num(p.heal, 0.25)), 'skill');
        break;
      }
      case 'shield': {
        h.shield = Math.max(h.shield, h.maxHp * Math.max(0, num(p.shield, 0.3)));
        h.buffs.shield = Math.max(0.5, num(p.duration, 8));
        break;
      }
      case 'lightning': {
        const n = Math.max(1, Math.floor(num(p.targets, 3)));
        hits = visible.slice().sort((a, b) => edgeDist(a) - edgeDist(b)).slice(0, n);
        const dmg = base * Math.max(0, num(p.dmg, 2.2));
        after = () => hits.forEach((e) => skillHit(e, dmg));
        break;
      }
      case 'frost': {
        hits = visible;
        const dmg = base * Math.max(0, num(p.dmg, 1.5));
        const fr = Math.max(0, num(p.freeze, 2.5));
        after = () => hits.forEach((e) => {
          skillHit(e, dmg);
          applyControl(e, 'frozen', fr);
        });
        break;
      }
      case 'meteor': {
        hits = visible;
        const dmg = base * Math.max(0, num(p.dmg, 6));
        const sn = Math.max(0, num(p.stun, 1.5));
        after = () => hits.forEach((e) => {
          skillHit(e, dmg);
          applyControl(e, 'stun', sn);
        });
        break;
      }
      default: {
        // 'bomb' and any data-defined damage skill: hit everything on screen.
        hits = visible;
        const dmg = base * Math.max(0, num(p.dmg, 3));
        after = () => hits.forEach((e) => skillHit(e, dmg));
      }
    }

    const cd = slot.cdTotal > 0 ? slot.cdTotal : skillCooldown(id);
    cdById[id] = cd;
    slot.cd = cd;
    emit('skill:cast', { id: id, slot: i, x: h.x, y: h.y - 14, targets: hits.map(center) });
    if (after) after();
    return true;
  }

  function wantsCast(id, visible, living) {
    const h = B.hero;
    let nearest = Infinity;
    let boss = false;
    for (const e of visible) {
      nearest = Math.min(nearest, edgeDist(e));
      if (e.isBoss) boss = true;
    }
    const crowd = boss || visible.length >= Math.min(3, living);
    const hpRatio = h.maxHp > 0 ? h.hp / h.maxHp : 1;
    switch (id) {
      case 'heal': return hpRatio < 0.7;
      case 'shield': return h.buffs.shield <= 0 && (nearest <= MELEE_GAP + 20 || B.projectiles.length > 0);
      case 'warcry': return nearest <= REACH + 12;
      case 'blades': return nearest <= bladeRadiusFor(id);
      case 'lightning': return nearest <= 200;
      // Area skills wait for the line to close in so they catch as many enemies as possible.
      case 'frost': return crowd && nearest <= 110;
      default: return crowd && nearest <= 130; // bomb, meteor
    }
  }

  function bladeRadiusFor(id) {
    const slot = B.skillSlots.find((s) => s.id === id);
    const p = skillParamsFor(id, (slot && slot.level) || 1);
    return clamp(num(p.radius, 70), 20, 200);
  }

  function autoSkills(dt) {
    autoCastTimer = Math.max(0, autoCastTimer - dt);
    if (autoCastTimer > 0 || !settings().autoSkill) return;
    const living = livingEnemies();
    const visible = living.filter(onScreen);
    if (visible.length === 0) return;
    for (let i = 0; i < SKILL_SLOTS; i++) {
      const slot = B.skillSlots[i];
      if (!slot.id || slot.cd > 0) continue;
      if (!wantsCast(slot.id, visible, living.length)) continue;
      if (castSlot(i)) {
        autoCastTimer = AUTO_CAST_GAP;
        return;
      }
    }
  }

  // ------------------------------------------------------------------ allies
  function allyAct(a) {
    const p = allyParamsFor(a.id, a.level);
    const h = B.hero;
    if (num(p.heal, 0) > 0 && !(num(p.dmg, 0) > 0)) {
      if (h.hp >= h.maxHp) return false;
      healHero(h.maxHp * p.heal, 'ally');
      emit('ally:attack', { id: a.id, x: a.x, y: a.y - 8, tx: h.x, ty: h.y - 16 });
      return true;
    }
    const dmgMult = Math.max(0, num(p.dmg, 0.3));
    const visible = livingEnemies().filter(onScreen);
    if (visible.length === 0) return false;
    if (num(p.radius, 0) > 0) {
      const r = p.radius;
      const hits = visible.filter((e) => edgeDist(e) <= r);
      if (hits.length === 0) return false;
      emit('ally:attack', { id: a.id, x: a.x, y: a.y - 8, tx: hits[0].x, ty: hits[0].y - hits[0].h / 2 });
      for (const e of hits) damageEnemy(e, effAtk() * dmgMult * (e.isBoss ? 1 + stats.bossDmg : 1), 'ally', false);
      return true;
    }
    let t = visible[0];
    for (const e of visible) if (edgeDist(e) < edgeDist(t)) t = e;
    emit('ally:attack', { id: a.id, x: a.x, y: a.y - 8, tx: t.x, ty: t.y - t.h / 2 });
    damageEnemy(t, effAtk() * dmgMult * (t.isBoss ? 1 + stats.bossDmg : 1), 'ally', false);
    return true;
  }

  function updateAllies(dt) {
    positionAllies(dt);
    for (const a of B.allies) {
      a.animTime += dt;
      if (a.anim === 'attack' && a.animTime >= ALLY_ANIM) {
        a.anim = 'idle';
        a.animTime = 0;
      }
    }
    if (B.phase !== 'fight' || !heroAlive()) return;
    // Iterate over a snapshot: a kill can level the hero up, which may refresh the loadout.
    const list = B.allies.slice();
    for (const a of list) {
      const st = allyState[a.id] || (allyState[a.id] = { timer: 0.5 });
      st.timer -= dt;
      if (st.timer > 0) continue;
      if (allyAct(a)) {
        const p = allyParamsFor(a.id, a.level);
        st.timer = Math.max(st.timer + p.interval, 0.1);
        a.anim = 'attack';
        a.animTime = 0;
      } else {
        st.timer = 0.2;
      }
      if (B.phase !== 'fight') return;
    }
  }

  // ------------------------------------------------------------------ flying chest
  function tickFlyingChest(dt) {
    const fc = B.flyingChest;
    if (fc) {
      fc.t += dt;
      const p = fc.t / fc.life;
      fc.x = fc.x0 + (fc.x1 - fc.x0) * p;
      fc.y = fc.baseY + Math.sin(fc.t * 2.3 + fc.phase) * 9;
      if (fc.t >= fc.life) {
        B.flyingChest = null;
        chestTimer = rnd(CHEST_MIN, CHEST_MAX);
        emit('flyingChest:escaped', {});
      }
      return;
    }
    chestTimer -= dt;
    if (chestTimer <= 0) spawnChest();
  }

  function spawnChest() {
    const baseY = rnd(30, 42);
    const phase = rnd(0, Math.PI * 2);
    B.flyingChest = {
      x: -14, y: baseY + Math.sin(phase) * 9, t: 0, life: CHEST_LIFE,
      x0: -14, x1: W + 14, baseY: baseY, phase: phase, dir: 1,
    };
    emit('flyingChest:spawn', {});
  }

  // ------------------------------------------------------------------ flow
  function startRun(waveNo, secs) {
    B.phase = 'run';
    phaseTimer = secs;
    nextWave = waveNo;
    swing = null;
    B.hero.attackAnim = 0;
    B.hero.swingKind = null;
  }

  function beginWave(n) {
    if (B.mode === 'dungeon') {
      beginDungeonFight();
      return;
    }
    const bossWave = wavesPerFloor();
    n = clamp(Math.floor(num(n, 1)), 1, bossWave);
    B.wave = n;
    const isBoss = n === bossWave;
    B.isBossWave = isBoss;
    bossKilled = false;
    fightClock = 0;
    B.timerRunning = false;
    stateCall('setWave', n);
    if (isBoss) {
      B.bossTimeLimit = bossTime();
      B.bossTimer = B.bossTimeLimit;
      pendingSpawn = composition(B.floor, n);
      B.phase = 'intro';
      phaseTimer = BOSS_INTRO;
    } else {
      B.bossTimer = 0;
      B.bossTimeLimit = 0;
      spawnEnemies(composition(B.floor, n), B.floor);
      B.phase = 'fight';
    }
    for (const id of Object.keys(allyState)) allyState[id].timer = Math.max(allyState[id].timer, 0.4);
    emit('wave:start', { floor: B.floor, wave: n, isBoss: isBoss, mode: 'campaign' });
  }

  function beginDungeonFight() {
    const d = B.dungeon;
    if (!d) {
      returnToCampaign();
      return;
    }
    bossKilled = false;
    fightClock = 0;
    B.timerRunning = false;
    B.isBossWave = !d.horde;
    B.bossTimeLimit = d.timeLimit;
    B.bossTimer = d.timer;
    if (d.horde) {
      d.spawnTimer = 0;
      B.phase = 'fight';
    } else {
      pendingSpawn = [d.enemy];
      B.phase = 'intro';
      phaseTimer = BOSS_INTRO;
    }
    emit('wave:start', { floor: B.floor, wave: 1, isBoss: !d.horde, mode: 'dungeon', dungeon: d.id });
  }

  function hordeSpawner(dt) {
    const d = B.dungeon;
    if (!d || !d.horde || d.ended || d.spawned >= d.target) return;
    d.spawnTimer -= dt;
    const living = livingEnemies().length;
    // Hurry the next group along when the field is empty.
    if (living === 0 && d.spawnTimer > 0.6) d.spawnTimer = 0.6;
    if (d.spawnTimer > 0) return;
    const n = Math.min(HORDE_GROUP, d.target - d.spawned, MAX_ENEMIES - living);
    if (n <= 0) {
      d.spawnTimer = 0.5;
      return;
    }
    const types = [];
    for (let i = 0; i < n; i++) types.push(d.enemy);
    d.spawned += spawnEnemies(types, d.floor);
    d.spawnTimer = HORDE_INTERVAL;
  }

  function onWaveCleared() {
    const bossWave = wavesPerFloor();
    let next;
    if (B.wave < bossWave - 1) {
      next = B.wave + 1;
    } else if (B.farming) {
      if (settings().autoBoss) {
        setFarming(false);
        next = bossWave;
      } else {
        next = 1;
      }
    } else {
      next = bossWave;
    }
    B.phase = 'clear';
    phaseTimer = CLEAR_DELAY;
    nextWave = next;
  }

  function onBossKilled() {
    // The boss falls and its minions crumble with it (still paying out).
    for (const e of livingEnemies()) killEnemy(e);
    B.projectiles.length = 0;
    const cleared = B.floor;
    const res = stateCall('onFloorCleared', cleared);
    const rewards = res && typeof res === 'object' ? res : {};
    const s = S();
    const stFloor = s && s.campaign ? Math.floor(num(s.campaign.floor, NaN)) : NaN;
    B.floor = Number.isFinite(stFloor) && stFloor > cleared ? stFloor : cleared + 1;
    observedFloor = s && s.campaign ? s.campaign.floor : observedFloor;
    B.isBossWave = false;
    B.bossTimer = 0;
    B.bossTimeLimit = 0;
    B.timerRunning = false;
    bossKilled = false;
    emit('floor:cleared', { floor: cleared, rewards: rewards });
    B.phase = 'clear';
    phaseTimer = FLOOR_CLEAR_DELAY;
    nextWave = 1;
  }

  function setFarming(on) {
    B.farming = !!on;
    stateCall('setFarming', !!on);
  }

  function failBoss(reason) {
    B.isBossWave = false;
    B.bossTimer = 0;
    B.bossTimeLimit = 0;
    B.timerRunning = false;
    bossKilled = false;
    setFarming(true);
    emit('boss:failed', { reason: reason });
    if (reason !== 'death') {
      retreatAll();
      swing = null;
      B.hero.attackAnim = 0;
      B.hero.swingKind = null;
      B.phase = 'clear';
      phaseTimer = CLEAR_DELAY + 0.6;
      nextWave = 1;
    }
  }

  function winDungeon() {
    const d = B.dungeon;
    d.ended = true;
    d.result = 'won';
    B.timerRunning = false;
    retreatAll();
    swing = null;
    B.hero.attackAnim = 0;
    B.hero.swingKind = null;
    const res = stateCall('grantDungeonWin', d.id);
    const rewards = res && typeof res === 'object' ? res : {};
    d.rewards = rewards;
    emit('dungeon:won', { id: d.id, level: d.level, rewards: rewards });
    B.phase = 'outro';
    phaseTimer = OUTRO_TIME;
  }

  function failDungeon(reason) {
    const d = B.dungeon;
    if (!d || d.ended) return;
    d.ended = true;
    d.result = 'failed';
    B.timerRunning = false;
    emit('dungeon:failed', { id: d.id, level: d.level, reason: reason });
    if (reason === 'timeout') {
      retreatAll();
      swing = null;
      B.hero.attackAnim = 0;
      B.hero.swingKind = null;
      B.phase = 'outro';
      phaseTimer = OUTRO_TIME;
    }
  }

  function returnToCampaign() {
    B.mode = 'campaign';
    B.dungeon = null;
    B.isBossWave = false;
    B.bossTimer = 0;
    B.bossTimeLimit = 0;
    B.timerRunning = false;
    bossKilled = false;
    const s = S();
    if (s && s.campaign) {
      B.floor = Math.max(1, Math.floor(num(s.campaign.floor, B.floor)));
      B.farming = !!s.campaign.farming;
      observedFloor = s.campaign.floor;
    }
    retreatAll();
    startRun(1, RUN_TIME);
  }

  function checkOutcome() {
    if (B.phase !== 'fight') return true;
    let anyLiving = false;
    for (const e of B.enemies) {
      if (isActive(e)) {
        anyLiving = true;
        break;
      }
    }
    if (B.mode === 'campaign') {
      if (B.isBossWave) {
        if (bossKilled || !anyLiving) {
          onBossKilled();
          return true;
        }
      } else if (!anyLiving) {
        onWaveCleared();
        return true;
      }
    } else {
      const d = B.dungeon;
      if (!d || d.ended) return false;
      const won = d.horde ? d.killed >= d.target || (!anyLiving && d.spawned >= d.target) : bossKilled || !anyLiving;
      if (won) {
        winDungeon();
        return true;
      }
    }
    return false;
  }

  function fightStep(dt) {
    if (B.mode === 'dungeon') hordeSpawner(dt);
    moveEnemies(dt);

    if (timedFight()) {
      if (!B.timerRunning) {
        fightClock += dt;
        if (fightClock >= ENGAGE_GRACE || fightEngaged()) B.timerRunning = true;
      }
      if (B.timerRunning) {
        B.bossTimer = Math.max(0, B.bossTimer - dt);
        if (B.mode === 'dungeon' && B.dungeon) B.dungeon.timer = B.bossTimer;
      }
    }

    if (!nearestInReach()) heroAdvance(dt);

    heroCombat(dt);
    if (checkOutcome()) return;
    autoSkills(dt);
    if (checkOutcome()) return;
    bladesStep(dt);
    if (checkOutcome()) return;
    updateProjectiles(dt);
    if (checkOutcome()) return;
    enemyAttacks(dt);
    if (checkOutcome()) return;

    if (timedFight() && B.bossTimer <= 0) {
      if (B.mode === 'dungeon') failDungeon('timeout');
      else failBoss('timeout');
    }
  }

  function updateEnemyTimers(dt) {
    for (let i = 0; i < B.enemies.length; ) {
      const e = B.enemies[i];
      e.flash = Math.max(0, e.flash - dt);
      e.hurtT = Math.max(0, e.hurtT - dt);
      if (e.dead) {
        e.deadTime += dt;
        if (e.fled) e.x += RETREAT_SPEED * dt;
        if (e.deadTime >= DEAD_LINGER) {
          B.enemies.splice(i, 1);
          continue;
        }
      } else {
        e.stun = Math.max(0, e.stun - dt);
        e.frozen = Math.max(0, e.frozen - dt);
        if (e.flying) e.y = e.baseY + Math.sin(B.time * 3.2 + e.bob) * 2;
      }
      i++;
    }
  }

  function setEnemyAnims(dt) {
    for (const e of B.enemies) {
      let a;
      if (e.dead) a = e.fled ? 'walk' : 'dead';
      else if (e.swing >= 0) a = 'attack';
      else if (e.hurtT > 0) a = 'hurt';
      else if (e.moving && e.stun <= 0 && e.frozen <= 0) a = 'walk';
      else a = 'idle';
      if (a !== e.anim) {
        e.anim = a;
        e.animTime = 0;
      } else {
        e.animTime += dt;
      }
    }
  }

  function setHeroAnim(dt) {
    const h = B.hero;
    hurtT = Math.max(0, hurtT - dt);
    let a;
    if (B.phase === 'dead') a = 'dead';
    else if (swing) a = 'attack';
    else if (hurtT > 0) a = 'hurt';
    else if (B.moving) a = 'run';
    else a = 'idle';
    if (a !== h.anim) {
      h.anim = a;
      h.animTime = 0;
    } else {
      h.animTime += dt;
    }
    if (!swing) h.attackAnim = 0;
  }

  function syncWithState() {
    const s = S();
    if (s !== observedState) {
      init();
      return;
    }
    if (s && s.campaign && B.mode === 'campaign' && s.campaign.floor !== observedFloor) init();
  }

  // ------------------------------------------------------------------ public API
  function init() {
    initialized = true;
    const s = S();
    observedState = s;
    const camp = (s && s.campaign) || {};
    observedFloor = camp.floor;
    const bossWave = wavesPerFloor();

    B.mode = 'campaign';
    B.dungeon = null;
    B.floor = Math.max(1, Math.floor(num(camp.floor, 1)));
    B.farming = !!camp.farming;
    let w = clamp(Math.floor(num(camp.wave, 1)), 1, bossWave);
    if (B.farming && w === bossWave) w = 1;
    B.wave = w;
    B.isBossWave = false;
    B.bossTimer = 0;
    B.bossTimeLimit = 0;
    B.timerRunning = false;
    fightClock = 0;
    B.enemies.length = 0;
    B.projectiles.length = 0;
    B.flyingChest = null;
    B.moving = false;
    B.deadTimer = 0;

    stats = readStats();
    const h = B.hero;
    h.x = HERO_X;
    h.y = GROUND;
    h.maxHp = stats.hp;
    h.hp = stats.hp;
    h.shield = 0;
    h.anim = 'run';
    h.animTime = 0;
    h.attackAnim = 0;
    h.swingKind = null;
    h.buffs.warcry = 0;
    h.buffs.blades = 0;
    h.buffs.shield = 0;

    swing = null;
    atkCd = 0;
    comboChain = 0;
    hurtT = 0;
    bossKilled = false;
    pendingSpawn = null;
    pendingHeal = 0;
    healFlushTimer = HEAL_FLUSH;
    autoCastTimer = 0.5;
    cdById = {};
    for (const k of Object.keys(allyState)) delete allyState[k];
    chestTimer = rnd(30, 50); // the first chest comes a little sooner to teach the tap
    B.allies.length = 0;
    refreshLoadout();
    startRun(w, 0.8);
  }

  function update(dt) {
    dt = num(dt, 0);
    if (dt <= 0) return;
    dt = Math.min(dt, 0.1);
    if (!initialized) init();
    inUpdate = true;
    try {
      syncWithState();
      if (loadoutDirty) refreshLoadout();
      B.time += dt;
      B.moving = false;

      tickCooldowns(dt);
      tickFlyingChest(dt);
      updateEnemyTimers(dt);
      if (B.phase !== 'dead') tickBuffs(dt);

      switch (B.phase) {
        case 'run':
          B.moving = true;
          shiftWorld(RUN_SPEED * dt);
          phaseTimer -= dt;
          if (phaseTimer <= 0) {
            B.moving = false;
            beginWave(nextWave);
          }
          break;
        case 'intro':
          phaseTimer -= dt;
          if (phaseTimer <= 0) {
            spawnEnemies(pendingSpawn && pendingSpawn.length ? pendingSpawn : composition(statFloor(), wavesPerFloor()), statFloor());
            pendingSpawn = null;
            B.phase = 'fight';
          }
          break;
        case 'fight':
          fightStep(dt);
          break;
        case 'clear':
          phaseTimer -= dt;
          if (phaseTimer <= 0) startRun(nextWave, RUN_TIME);
          break;
        case 'outro':
          phaseTimer -= dt;
          if (phaseTimer <= 0) returnToCampaign();
          break;
        case 'dead':
          B.deadTimer = Math.max(0, B.deadTimer - dt);
          if (B.deadTimer <= 0) revive();
          break;
        default:
          startRun(B.wave || 1, 0.5);
      }

      if (heroAlive()) {
        if (stats.regen > 0) healHero(B.hero.maxHp * stats.regen * dt, 'regen');
        flushHeals(dt);
      }
      updateAllies(dt);
      if (B.phase !== 'fight') B.projectiles.length = 0;
      setEnemyAnims(dt);
      setHeroAnim(dt);
      if (!(B.hero.hp >= 0)) B.hero.hp = 0;
    } finally {
      inUpdate = false;
    }
    if (loadoutDirty) refreshLoadout();
  }

  function castSkill(slot) {
    const i = Math.floor(num(slot, -1));
    if (i < 0 || i >= SKILL_SLOTS || !initialized) return false;
    if (loadoutDirty && !inUpdate) refreshLoadout();
    return castSlot(i);
  }

  function tapAt(wx, wy) {
    const fc = B.flyingChest;
    const x = num(wx, NaN);
    const y = num(wy, NaN);
    if (!fc || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    const dx = x - fc.x;
    const dy = y - fc.y;
    if (dx * dx + dy * dy > CHEST_TAP_R * CHEST_TAP_R) return false;
    const cx = fc.x;
    const cy = fc.y;
    B.flyingChest = null;
    chestTimer = rnd(CHEST_MIN, CHEST_MAX);
    const res = stateCall('grantFlyingChest');
    const reward = res && typeof res === 'object' ? res : { type: 'gold', amount: 0, label: 'Treasure' };
    emit('flyingChest:collected', { x: cx, y: cy, reward: reward });
    return true;
  }

  function challengeBoss() {
    if (!initialized) init();
    if (B.mode !== 'campaign') return false;
    const bossWave = wavesPerFloor();
    if (B.isBossWave && (B.phase === 'intro' || B.phase === 'fight')) return false;
    if (B.phase === 'run' && nextWave === bossWave && !B.farming) return false;
    setFarming(false);
    if (B.phase === 'dead') {
      nextWave = bossWave;
      return true;
    }
    retreatAll();
    startRun(bossWave, 0.8);
    return true;
  }

  function startDungeon(id) {
    if (!initialized) init();
    if (B.mode === 'dungeon') return false;
    const def = dungeonDef(id);
    if (!def) return false;
    const s = S();
    const highest = s && s.campaign ? num(s.campaign.highestFloor, num(s.campaign.floor, 1)) : B.floor;
    if (highest < def.unlockFloor) return false;
    if (stateCall('useKey') !== true) return false;

    const dl = s && s.dungeons && s.dungeons[id];
    const level = Math.max(1, Math.floor(num(dl && typeof dl === 'object' ? dl.level : dl, 1)));
    // Abandon the current campaign fight quietly (no boss failure, no rewards).
    retreatAll();
    swing = null;
    B.hero.attackAnim = 0;
    B.hero.swingKind = null;
    if (B.phase === 'dead') {
      B.deadTimer = 0;
      emit('hero:revived', {});
    }
    B.hero.hp = B.hero.maxHp;
    B.hero.shield = 0;
    B.hero.buffs.shield = 0;
    B.mode = 'dungeon';
    B.isBossWave = !def.horde;
    B.bossTimeLimit = def.time;
    B.bossTimer = def.time;
    B.dungeon = {
      id: def.id,
      level: level,
      timer: def.time,
      timeLimit: def.time,
      killed: 0,
      target: def.target,
      // extras
      floor: Math.max(1, Math.floor(num(dataCall('dungeonFloor', [level]), 2 + level * 3))),
      enemy: def.enemy,
      horde: def.horde,
      spawned: 0,
      spawnTimer: 0,
      ended: false,
      result: null,
    };
    emit('dungeon:start', { id: def.id, level: level });
    startRun(1, RUN_TIME);
    return true;
  }

  function leaveDungeon() {
    if (B.mode !== 'dungeon' || !B.dungeon) return false;
    const d = B.dungeon;
    if (!d.ended) {
      d.ended = true;
      d.result = 'forfeit';
      B.timerRunning = false;
      emit('dungeon:failed', { id: d.id, level: d.level, reason: 'forfeit' });
    }
    if (B.phase === 'dead') return true; // revive will bring the hero back to the campaign
    returnToCampaign();
    return true;
  }

  function onStatsChanged() {
    if (!initialized) return;
    const ns = readStats();
    const h = B.hero;
    const ratio = h.maxHp > 0 ? clamp(h.hp / h.maxHp, 0, 1) : 1;
    stats = ns;
    h.maxHp = ns.hp;
    if (B.phase !== 'dead' && h.hp > 0) h.hp = clamp(ratio * ns.hp, Math.min(1, ns.hp), ns.hp);
    h.shield = clamp(num(h.shield, 0), 0, ns.hp * 10);
    if (inUpdate) loadoutDirty = true;
    else refreshLoadout();
  }

  /** Extra (tests / debugging): send a flying chest across now. False if one is already flying. */
  function spawnFlyingChest() {
    if (!initialized) init();
    if (B.flyingChest) return false;
    spawnChest();
    return true;
  }

  /** Extra: seconds until the given slot is ready (0 = ready), or -1 if empty/locked. */
  function skillReadyIn(slot) {
    const s = B.skillSlots[Math.floor(num(slot, -1))];
    if (!s || !s.id) return -1;
    return Math.max(0, s.cd);
  }

  B.init = init;
  B.update = update;
  B.castSkill = castSkill;
  B.tapAt = tapAt;
  B.challengeBoss = challengeBoss;
  B.startDungeon = startDungeon;
  B.leaveDungeon = leaveDungeon;
  B.onStatsChanged = onStatsChanged;
  B.skillReadyIn = skillReadyIn;
  B.spawnFlyingChest = spawnFlyingChest;
  B.REACH = REACH;

  DD.bus.on('stats:changed', () => B.onStatsChanged());
})(globalThis.DD);
