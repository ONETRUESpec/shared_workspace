// Dungeon Dash — headless battle simulation test.
// Loads core.js, then the real data.js + state.js when they exist and load cleanly (falling back to
// tests/battle.stubs.js otherwise), then battle.js, all inside a Node vm context (no DOM).
// Runs DD.battle.update(1/60) for 20 simulated minutes with (a) very strong and (b) very weak hero
// stats, plus (c) an informational fresh-save idle run, and asserts the battle invariants.
// Usage: node tests/battle.sim.mjs [minutes]      (BATTLE_SIM_STUBS=1 forces the stub data/state)
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const jsPath = (p) => path.join(root, 'src', 'js', p);

const STEP = 1 / 60;
const MINUTES = Math.max(1, Number(process.argv[2]) || 20);
const SKILL_IDS = ['bomb', 'blades', 'warcry', 'heal', 'lightning', 'shield', 'frost', 'meteor'];
const EVENTS = [
  'hit', 'heal', 'enemy:killed', 'enemy:attack', 'hero:attack', 'hero:died', 'hero:revived', 'wave:start',
  'floor:cleared', 'boss:failed', 'skill:cast', 'ally:attack', 'projectile:hit', 'flyingChest:spawn',
  'flyingChest:collected', 'flyingChest:escaped', 'dungeon:start', 'dungeon:won', 'dungeon:failed',
];

const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const fmtArg = (a) => (a instanceof Error ? a.stack || a.message : typeof a === 'object' ? safeJson(a) : String(a));
function safeJson(o) {
  try {
    return JSON.stringify(o);
  } catch {
    return String(o);
  }
}

// ---------------------------------------------------------------- module loading
function makeEnv() {
  const errors = [];
  const sandboxConsole = {
    log: () => {},
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: (...a) => errors.push(a.map(fmtArg).join(' ')),
  };
  const ctx = vm.createContext({ console: sandboxConsole });
  return { ctx, errors };
}

function runFile(ctx, file) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
}

function validData(d) {
  if (!d || typeof d.waveComposition !== 'function' || typeof d.enemyStats !== 'function' || !d.ENEMIES) return false;
  const comp = d.waveComposition(1, 1);
  if (!Array.isArray(comp) || comp.length === 0) return false;
  const st = d.enemyStats(1, comp[0], { isBoss: false });
  return st && Number.isFinite(st.hp) && Number.isFinite(st.atk);
}

function validState(st) {
  if (!st || !st.s || typeof st.getHeroStats !== 'function' || typeof st.grantKill !== 'function') return false;
  const hs = st.getHeroStats();
  return hs && Number.isFinite(hs.atk) && Number.isFinite(hs.hp) && st.s.campaign && Number.isFinite(st.s.campaign.floor);
}

const loadNotes = new Set();
function loadModules() {
  const env = makeEnv();
  const { ctx } = env;
  runFile(ctx, jsPath('core.js'));
  const DD = ctx.DD;
  const used = { data: 'stub', state: 'stub' };
  const forceStubs = process.env.BATTLE_SIM_STUBS === '1';
  if (!forceStubs && fs.existsSync(jsPath('data.js'))) {
    try {
      runFile(ctx, jsPath('data.js'));
      if (validData(DD.data)) used.data = 'real';
      else {
        loadNotes.add('data.js loaded but failed validation; using stub data');
        delete DD.data;
      }
    } catch (err) {
      loadNotes.add('data.js failed to load (' + err.message + '); using stub data');
      delete DD.data;
    }
  }
  if (used.data === 'real' && fs.existsSync(jsPath('state.js'))) {
    try {
      runFile(ctx, jsPath('state.js'));
      if (DD.state && typeof DD.state.load === 'function') DD.state.load();
      if (validState(DD.state)) used.state = 'real';
      else {
        loadNotes.add('state.js loaded but failed validation; using stub state');
        delete DD.state;
      }
    } catch (err) {
      loadNotes.add('state.js failed to load (' + err.message + '); using stub state');
      delete DD.state;
    }
  }
  runFile(ctx, path.join(here, 'battle.stubs.js'));
  runFile(ctx, jsPath('battle.js'));
  if (env.errors.length) {
    for (const e of env.errors) loadNotes.add('load-time console.error: ' + e.slice(0, 200));
    env.errors.length = 0;
  }
  return { ...env, DD, used };
}

// ---------------------------------------------------------------- invariant checks
function findBad(obj, pathStr, out, depth = 0) {
  if (out.length > 5 || depth > 6 || obj === null || obj === undefined) return;
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) out.push(`${pathStr}=${obj}`);
    return;
  }
  if (typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => findBad(v, `${pathStr}[${i}]`, out, depth + 1));
    return;
  }
  for (const k of Object.keys(obj)) {
    if (k === 'target' && pathStr.endsWith('swing')) continue;
    findBad(obj[k], `${pathStr}.${k}`, out, depth + 1);
  }
}

function scanView(B) {
  const out = [];
  for (const k of ['floor', 'wave', 'bossTimer', 'bossTimeLimit', 'scroll', 'deadTimer']) {
    if (typeof B[k] !== 'number' || !Number.isFinite(B[k])) out.push(`${k}=${B[k]}`);
  }
  if (B.mode !== 'campaign' && B.mode !== 'dungeon') out.push(`mode=${B.mode}`);
  findBad(B.hero, 'hero', out);
  findBad(B.dungeon, 'dungeon', out);
  findBad(B.flyingChest, 'flyingChest', out);
  findBad(B.skillSlots, 'skillSlots', out);
  findBad(B.allies, 'allies', out);
  findBad(B.projectiles, 'projectiles', out);
  for (const e of B.enemies) {
    for (const k of ['x', 'y', 'w', 'h', 'hp', 'maxHp', 'animTime', 'stun', 'frozen', 'flash', 'deadTime']) {
      if (typeof e[k] !== 'number' || !Number.isFinite(e[k])) out.push(`enemy.${e.type}.${k}=${e[k]}`);
    }
  }
  const h = B.hero;
  if (h.hp < 0 || h.hp > h.maxHp * (1 + 1e-9)) out.push(`hero.hp out of range ${h.hp}/${h.maxHp}`);
  if (h.attackAnim < 0 || h.attackAnim > 1) out.push(`hero.attackAnim=${h.attackAnim}`);
  if (!['run', 'idle', 'attack', 'hurt', 'dead'].includes(h.anim)) out.push(`hero.anim=${h.anim}`);
  for (const e of B.enemies) {
    if (!['walk', 'idle', 'attack', 'hurt', 'dead'].includes(e.anim)) out.push(`enemy.anim=${e.anim}`);
  }
  if (B.skillSlots.length !== 4) out.push('skillSlots.length=' + B.skillSlots.length);
  return out;
}

// ---------------------------------------------------------------- scenario runner
function scenario(name, cfg) {
  const env = loadModules();
  const { DD, used } = env;
  const B = DD.battle;
  const S = DD.state;
  const s = S.s;

  const counts = Object.fromEntries(EVENTS.map((e) => [e, 0]));
  const skillCasts = Object.fromEntries(SKILL_IDS.map((id) => [id, 0]));
  const failures = [];
  const payloadBad = [];
  const dungeonResults = [];
  const fail = (msg) => failures.push(msg);
  let chestSpawnNo = 0;
  let tapPlan = null;
  let firstFloorAt = null;
  let simT = 0;

  for (const ev of EVENTS) {
    DD.bus.on(ev, (p) => {
      counts[ev]++;
      const bad = [];
      findBad(p, ev, bad);
      if (bad.length && payloadBad.length < 10) payloadBad.push(bad.join(', '));
      if (ev === 'skill:cast' && p.id in skillCasts) skillCasts[p.id]++;
      if (ev === 'flyingChest:spawn') {
        chestSpawnNo++;
        tapPlan = chestSpawnNo % 3 === 0 ? null : { at: 1.5 + (chestSpawnNo % 4), done: false };
      }
      if (ev === 'dungeon:won') dungeonResults.push(`won ${p.id} L${p.level} ${safeJson(p.rewards)}`);
      if (ev === 'dungeon:failed') dungeonResults.push(`failed ${p.id} (${p.reason})`);
      if (ev === 'floor:cleared' && firstFloorAt === null) firstFloorAt = simT;
    });
  }

  // Loadout: every skill owned, the scenario's four equipped; allies per scenario.
  if (cfg.skills) {
    s.skills.owned = Object.fromEntries(SKILL_IDS.map((id) => [id, 3]));
    s.skills.equipped = cfg.skills.slice();
  }
  if (cfg.allies) {
    s.allies.owned = { wolf: 2, fairy: 2, drone_ally: 2, golem_ally: 2 };
    s.allies.equipped = cfg.allies.slice();
    S.allySlotsUnlocked = () => 2;
  }
  if (cfg.skills) S.skillSlotsUnlocked = () => 4;
  const realGet = S.getHeroStats.bind(S);
  let statOverride = cfg.stats ? cfg.stats(DD) : null;
  if (statOverride) S.getHeroStats = () => Object.assign({}, realGet(), statOverride);

  B.init();
  const ctl = {
    DD, B, S, s, fail, counts,
    setStats(o) {
      statOverride = o;
      DD.bus.emit('stats:changed', {});
    },
    get stats() {
      return statOverride;
    },
  };

  const minutes = cfg.minutes || MINUTES;
  const steps = Math.round((minutes * 60) / STEP);
  let frozenSeen = 0;
  let stunSeen = 0;
  let queueSeen = 0;
  let exceptions = 0;
  let farmingSeen = false;
  let maxLiving = 0;
  let maxProj = 0;
  let maxFloor = B.floor;
  let nanReported = 0;
  let idleWhileApproaching = 0;
  const actions = (cfg.actions || []).map((a) => ({ ...a, done: false }));

  console.log(`\n[${name}] data=${used.data} state=${used.state}  ${cfg.label}`);
  for (let i = 0; i < steps; i++) {
    simT = i * STEP;
    try {
      B.update(STEP);
      if (i % 60 === 0 && typeof S.tick === 'function') S.tick(1);
    } catch (err) {
      exceptions++;
      if (exceptions <= 3) fail(`exception at ${fmtTime(simT)}: ${err.stack || err}`);
      if (exceptions > 20) break;
    }

    // scripted actions
    for (const a of actions) {
      if (a.done) continue;
      if ((a.at !== undefined && simT >= a.at) || (a.when && a.when(ctl, simT))) {
        a.done = true;
        try {
          a.fn(ctl, simT);
        } catch (err) {
          fail(`action "${a.name}" threw: ${err.stack || err}`);
        }
      }
    }

    // flying chest: tap two of every three, after a short delay; also check a miss first
    const fc = B.flyingChest;
    if (fc && tapPlan && !tapPlan.done && fc.t >= tapPlan.at) {
      tapPlan.done = true;
      if (B.tapAt(fc.x + 60, fc.y + 60) !== false) fail('tapAt far from the chest should return false');
      if (B.tapAt(fc.x + 6, fc.y - 6) !== true) fail(`tapAt on the chest at (${fc.x.toFixed(1)},${fc.y.toFixed(1)}) did not collect it`);
      if (B.flyingChest) fail('flying chest still present after being collected');
    }
    if (fc && (fc.y < 0 || fc.y > 200 / 3 + 4)) fail(`flying chest left the top third: y=${fc.y}`);

    if (B.farming) farmingSeen = true;
    maxFloor = Math.max(maxFloor, B.floor);
    let living = 0;
    for (const e of B.enemies) if (!e.dead) living++;
    maxLiving = Math.max(maxLiving, living);
    maxProj = Math.max(maxProj, B.projectiles.length);
    if (B.phase === 'fight' && B.moving && B.enemies.some((e) => !e.dead && e.moving)) idleWhileApproaching++;
    for (const e of B.enemies) {
      if (e.dead) continue;
      if (e.frozen > 0) frozenSeen++;
      if (e.stun > 0) stunSeen++;
    }
    if (i % 30 === 0) {
      // Melee enemies on the ground must form a line with gaps, never overlap at rest.
      for (const ranged of [false, true]) {
      const line = B.enemies.filter((e) => !e.dead && !!e.ranged === ranged && !e.flying && !e.moving).sort((a, b) => a.x - b.x);
      for (let k = 1; k < line.length; k++) {
        const gap = line[k].x - line[k].w / 2 - (line[k - 1].x + line[k - 1].w / 2);
        if (gap >= 5.5 && gap <= 12) queueSeen++;
        if (gap < -0.5 && !line[k].isBoss && !line[k - 1].isBoss) {
          fail(`queued ${ranged ? 'ranged' : 'melee'} enemies overlap at ${fmtTime(simT)}: gap ${gap.toFixed(1)}`);
        }
      }
      }
    }

    if (i % 3 === 0) {
      const bad = scanView(B);
      if (bad.length && nanReported < 5) {
        nanReported++;
        fail(`bad view field at ${fmtTime(simT)}: ${bad.join(', ')}`);
      }
    }
    if (i % (120 * 60) === 0 || i === steps - 1) {
      const t = i === steps - 1 ? minutes * 60 : simT;
      console.log(
        `  ${fmtTime(t).padStart(5)}  floor ${String(B.floor).padStart(3)} wave ${B.wave}${B.isBossWave ? '(boss)' : '      '} ` +
          `${B.mode.padEnd(8)} ${String(B.phase).padEnd(5)} farming=${B.farming ? 'Y' : 'n'}  kills=${counts['enemy:killed']} ` +
          `deaths=${counts['hero:died']} casts=${counts['skill:cast']} chests=${counts['flyingChest:collected']}/${counts['flyingChest:spawn']} ` +
          `lvl=${s.hero ? s.hero.level : '?'}`,
      );
    }
  }

  // common assertions
  if (exceptions) fail(`${exceptions} exception(s) thrown by update()`);
  if (env.errors.length) fail(`console.error called ${env.errors.length}x, first: ${env.errors[0].slice(0, 400)}`);
  if (payloadBad.length) fail(`non-finite numbers in event payloads: ${payloadBad.slice(0, 3).join(' | ')}`);
  if (maxLiving > 12) fail(`too many living enemies at once: ${maxLiving}`);
  if (maxProj > 40) fail(`too many projectiles at once: ${maxProj}`);
  if (counts['flyingChest:spawn'] < 1) fail('no flying chest spawned');
  if (counts['flyingChest:collected'] < 1) fail('no flying chest collected via tapAt');
  if (counts['skill:cast'] < 1) fail('no skills cast');
  if (counts['wave:start'] < 1) fail('no wave started');
  if (idleWhileApproaching > 0) fail(`hero ran while enemies were still approaching (${idleWhileApproaching} frames)`);

  const summary = {
    name, used, counts, skillCasts, farmingSeen, maxFloor, maxLiving, maxProj, firstFloorAt, dungeonResults, frozenSeen, stunSeen, queueSeen,
    finalFloor: B.floor, heroLevel: s.hero && s.hero.level,
  };
  if (cfg.assert) cfg.assert(summary, fail, ctl);

  console.log(
    `  events: kills=${counts['enemy:killed']} floors=${counts['floor:cleared']} bossFails=${counts['boss:failed']} ` +
      `deaths=${counts['hero:died']} revives=${counts['hero:revived']} enemyAttacks=${counts['enemy:attack']} ` +
      `projHits=${counts['projectile:hit']} allyAttacks=${counts['ally:attack']} heals=${counts.heal}`,
  );
  console.log(`  skills: ${SKILL_IDS.map((id) => `${id}=${skillCasts[id]}`).join(' ')}`);
  console.log(`  chests: spawned=${counts['flyingChest:spawn']} collected=${counts['flyingChest:collected']} escaped=${counts['flyingChest:escaped']}`);
  console.log(`  dungeons: ${dungeonResults.join('; ') || 'none'}`);
  if (firstFloorAt !== null) console.log(`  first floor cleared at ${fmtTime(firstFloorAt)}; max living enemies ${maxLiving}; max projectiles ${maxProj}`);
  console.log(failures.length ? `  FAIL (${failures.length})` : '  PASS');
  for (const f of failures) console.log('    - ' + f);
  return { summary, failures };
}

// ---------------------------------------------------------------- scenarios
function normalAndBoss(DD) {
  const comp = DD.data.waveComposition(1, 1);
  const bossComp = DD.data.waveComposition(1, DD.data.WAVES_PER_FLOOR || 5);
  const isBossType = (t) => DD.data.ENEMIES && DD.data.ENEMIES[t] && DD.data.ENEMIES[t].boss;
  const normal = DD.data.enemyStats(1, comp[0], { isBoss: false });
  const bossType = bossComp.find(isBossType) || bossComp[0];
  const boss = DD.data.enemyStats(1, bossType, { isBoss: true });
  return { normal, boss };
}

const results = [];

results.push(
  scenario('a', {
    label: 'very strong hero — floors must advance, dungeons must be won',
    skills: ['bomb', 'lightning', 'frost', 'meteor'],
    allies: ['wolf', 'golem_ally'],
    stats: () => ({
      atk: 1e40, hp: 1e40, atkSpeed: 2.5, critChance: 0.3, critDmg: 2.5, combo: 0.35, counter: 0.3,
      dodge: 0.3, stun: 0.2, lifesteal: 0.05, regen: 0.02, skillDmg: 0.5, bossDmg: 0.5,
    }),
    actions: [
      { name: 'bogus dungeon', at: 5, fn: ({ B, fail }) => B.startDungeon('nope') !== false && fail('startDungeon(bogus) should be false') },
      {
        name: 'stats change keeps hp ratio',
        at: 30,
        fn: ({ B, fail, setStats, stats }) => {
          const h = B.hero;
          if (B.phase === 'dead') return;
          h.hp = h.maxHp * 0.5; // simulate a half-health hero
          const before = h.hp / h.maxHp;
          setStats(Object.assign({}, stats, { hp: stats.hp * 3 }));
          const after = h.hp / h.maxHp;
          if (Math.abs(after - before) > 1e-6) fail(`hp ratio not preserved on stats change: ${before} → ${after}`);
          if (!(h.maxHp >= 2.9e40)) fail('maxHp not refreshed on stats:changed');
        },
      },
      {
        name: 'horde dungeon',
        when: ({ s, B }) => s.campaign.highestFloor >= 6 && B.mode === 'campaign' && B.phase === 'fight',
        fn: ({ B, s, fail, DD }) => {
          s.keys = Math.max(s.keys, 3);
          const keys = s.keys;
          if (B.startDungeon('horde') !== true) return fail('startDungeon(horde) returned false');
          if (s.keys !== keys - 1) fail('startDungeon did not spend a key');
          if (B.mode !== 'dungeon' || !B.dungeon || B.dungeon.target !== 25) fail('dungeon view not set up: ' + JSON.stringify(B.dungeon));
          if (B.startDungeon('dragon') !== false) fail('second startDungeon while in a dungeon should be false');
          if (B.challengeBoss() !== false) fail('challengeBoss inside a dungeon should be false');
          void DD;
        },
      },
      {
        name: 'dragon dungeon',
        when: ({ B, counts }) => counts['dungeon:won'] + counts['dungeon:failed'] >= 1 && B.mode === 'campaign' && B.phase === 'fight',
        fn: ({ B, s, fail }) => {
          s.keys = Math.max(s.keys, 2);
          if (B.startDungeon('dragon') !== true) fail('startDungeon(dragon) returned false');
        },
      },
    ],
    assert(sum, fail, { B, S, s }) {
      // Import (deserialize) swaps the state object: battle must resync to it on the next update.
      if (typeof S.serialize === 'function' && typeof S.deserialize === 'function') {
        const floorBefore = s.campaign.floor;
        if (!S.deserialize(S.serialize())) fail('state round-trip failed');
        B.update(STEP);
        if (B.floor !== S.s.campaign.floor || B.floor !== floorBefore) fail(`battle did not resync after import: ${B.floor} vs ${S.s.campaign.floor}`);
        for (let i = 0; i < 600; i++) B.update(STEP);
        const bad = scanView(B);
        if (bad.length) fail('bad view after import: ' + bad.join(', '));
      }
      if (sum.finalFloor < 6) fail(`floors did not advance enough: final floor ${sum.finalFloor}`);
      if (sum.counts['floor:cleared'] < 5) fail(`only ${sum.counts['floor:cleared']} floors cleared`);
      if (sum.counts['dungeon:start'] < 2) fail('dungeons were not started');
      if (sum.counts['dungeon:won'] < 2) fail(`strong hero should win both dungeons: ${sum.dungeonResults.join('; ')}`);
      if (sum.counts['ally:attack'] < 1) fail('allies never attacked');
    },
  }),
);

results.push(
  scenario('b', {
    label: 'very weak hero — must die, fail the boss and farm; dungeon must fail',
    skills: ['blades', 'warcry', 'heal', 'shield'],
    allies: ['fairy', 'drone_ally'],
    stats: (DD) => {
      const { normal, boss } = normalAndBoss(DD);
      return {
        atk: Math.min(normal.hp / 2.5, boss.hp / 90), hp: normal.atk * 7, atkSpeed: 1, critChance: 0.05,
        critDmg: 1.5, combo: 0.1, counter: 0.1, dodge: 0.05, stun: 0.05, lifesteal: 0.02, regen: 0, skillDmg: 0, bossDmg: 0,
      };
    },
    actions: [
      { name: 'challenge boss', at: 40, fn: ({ B, fail }) => B.challengeBoss() !== true && fail('challengeBoss() returned false') },
      { name: 'challenge boss again', at: 130, fn: ({ B }) => B.challengeBoss() },
      {
        name: 'dragon dungeon (should fail)',
        at: 240,
        fn: ({ B, s, fail }) => {
          s.campaign.highestFloor = Math.max(s.campaign.highestFloor, 10);
          s.keys = 3;
          if (B.startDungeon('dragon') !== true) fail('startDungeon(dragon) returned false for a weak hero with keys');
        },
      },
      {
        name: 'horde dungeon then forfeit',
        when: ({ B, counts }, t) => t > 300 && counts['dungeon:failed'] >= 1 && B.mode === 'campaign' && B.phase === 'fight',
        fn: ({ B, s, fail }) => {
          s.keys = Math.max(1, s.keys);
          if (B.startDungeon('horde') !== true) fail('startDungeon(horde) returned false');
        },
      },
      {
        name: 'leave dungeon',
        when: ({ B }) => B.mode === 'dungeon' && B.dungeon && B.dungeon.id === 'horde' && B.dungeon.killed >= 0 && B.phase === 'fight' && B.dungeon.timer < 40,
        fn: ({ B, fail }) => {
          if (B.leaveDungeon() !== true) fail('leaveDungeon() returned false');
          if (B.mode !== 'campaign') fail('leaveDungeon did not return to the campaign');
        },
      },
      { name: 'manual cast', when: ({ B }) => B.phase === 'fight' && B.skillSlots[3].cd <= 0 && B.enemies.some((e) => !e.dead && e.x < 350), fn: ({ B, fail }) => {
        if (B.castSkill(3) !== true) fail('castSkill(3) on a ready slot with enemies on screen returned false');
        if (B.castSkill(3) !== false) fail('castSkill on a cooling-down slot should return false');
        if (B.castSkill(9) !== false) fail('castSkill(out of range) should return false');
      } },
    ],
    assert(sum, fail, { B, S }) {
      // A reset replaces the save: battle must restart at floor 1, wave 1.
      if (typeof S.reset === 'function') {
        S.reset();
        for (let i = 0; i < 120; i++) B.update(STEP);
        if (B.floor !== 1 || B.mode !== 'campaign' || B.farming) fail(`battle did not resync after reset: floor ${B.floor} mode ${B.mode} farming ${B.farming}`);
        const bad = scanView(B);
        if (bad.length) fail('bad view after reset: ' + bad.join(', '));
      }
      if (sum.counts['hero:died'] < 1) fail('weak hero never died');
      if (sum.counts['hero:revived'] < 1) fail('weak hero never revived');
      if (!sum.farmingSeen) fail('farming mode never happened');
      if (sum.counts['boss:failed'] < 1) fail('boss never failed');
      if (!sum.dungeonResults.some((r) => r.startsWith('failed dragon'))) fail(`dragon dungeon did not fail: ${sum.dungeonResults.join('; ')}`);
      if (!sum.dungeonResults.some((r) => r.includes('forfeit'))) fail('leaveDungeon did not emit dungeon:failed forfeit');
      for (const id of ['blades', 'warcry', 'heal', 'shield']) if (!sum.skillCasts[id]) fail(`skill ${id} never cast`);
      if (sum.counts['ally:attack'] < 1) fail('allies never acted');
    },
  }),
);

results.push(
  scenario('d', {
    label: 'moderate immortal hero — every area skill must fire, freeze and stun must land, enemies must queue',
    minutes: Math.min(MINUTES, 6),
    skills: ['frost', 'meteor', 'bomb', 'lightning'],
    allies: ['wolf', 'golem_ally'],
    stats: (DD) => {
      const { normal } = normalAndBoss(DD);
      return {
        atk: normal.hp / 12, hp: 1e30, atkSpeed: 1, critChance: 0.1, critDmg: 1.5, combo: 0.2, counter: 0.2,
        dodge: 0.1, stun: 0.3, lifesteal: 0, regen: 0, skillDmg: 0, bossDmg: 0,
      };
    },
    assert(sum, fail) {
      for (const id of ['frost', 'meteor', 'bomb', 'lightning']) if (sum.skillCasts[id] < 2) fail(`skill ${id} cast only ${sum.skillCasts[id]}x`);
      if (!sum.frozenSeen) fail('no enemy was ever frozen');
      if (!sum.stunSeen) fail('no enemy was ever stunned');
      if (!sum.queueSeen) fail('melee enemies never formed a queue');
      if (sum.counts['ally:attack'] < 10) fail('allies barely attacked');
    },
  }),
);

// (c) informational: fresh save with the real stats (no gear, bomb only), idle — not asserted beyond invariants
results.push(
  scenario('c', {
    label: 'fresh save, idle (informational balance readout)',
    actions: [],
    assert(sum, fail) {
      void fail;
      console.log(`  fresh idle: reached floor ${sum.maxFloor}, hero level ${sum.heroLevel}`);
    },
  }),
);

const allFail = results.flatMap((r) => r.failures.map((f) => `[${r.summary.name}] ${f}`));
const union = new Set();
for (const r of results) for (const id of SKILL_IDS) if (r.summary.skillCasts[id]) union.add(id);
const missing = SKILL_IDS.filter((id) => !union.has(id));
if (missing.length) allFail.push(`skills never cast in any scenario: ${missing.join(', ')}`);
if (loadNotes.size) console.log('\nnotes:\n  ' + Array.from(loadNotes).join('\n  '));
console.log(allFail.length ? `\nBATTLE SIM FAILED (${allFail.length})\n  ${allFail.join('\n  ')}` : '\nBATTLE SIM PASSED');
process.exit(allFail.length ? 1 : 0);
