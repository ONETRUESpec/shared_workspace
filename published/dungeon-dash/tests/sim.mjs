// Dungeon Dash — headless progression simulation (balance tool).
//
// Loads the REAL src/js/core.js, data.js, state.js and battle.js into a fresh Node vm context per
// run (in-memory localStorage, simulated wall clock, optional seeded Math.random) and plays the
// real battle at a fixed 1/60 s step, exactly like main.js does (battle.update per step, then
// state.tick). Player behaviour is scripted through the same state/battle API calls the UI makes:
//
//   idle    never opens a chest, never buys anything, never taps the flying chest
//           (skills auto-cast and auto boss retry stay on, as in a fresh save).
//   active  every 10 s: opens every chest (Equip when the compare CP delta is > 0, else Sell),
//           claims quests, then spends — skills (scrolls: cheapest unlock/upgrade), allies (gems:
//           recruit when a slot is free), mastery with leftover gems (Might/Vitality first), gold on
//           the cheaper of chest level / ally upgrade — and enters the easiest Boss Dungeon whenever
//           it holds a key (if that dungeon's strength is at most 2 floors above its best floor).
//           Taps the flying chest when it shows up (checked every second).
//   casual  the same decisions, but only every 5 minutes (and it taps a flying chest only if one
//           crosses the screen during those visits).
//
// Prints, per policy: a table at t = 2, 5, 10, 20, 40, 60, 120 min (floor, hero level, CP, chest
// level, gold, gems, deaths, boss fails, dungeon wins; averaged over the runs), time to each floor
// milestone, the minutes spent on each floor (the walls), gold sources and dungeon results. Then:
// the AFK estimate checked against live farming of the same floor (saves taken from the idle and
// active runs) with the AFK payout for 1 h and 8 h away, flying-chest and dungeon rewards relative
// to income, an optional ablation study (active minus one upgrade type: does each one matter?) and
// a NaN/Infinity sweep of the formulas for floors 1..500 plus live battles at floors 100/250/500.
//
// Usage: node tests/sim.mjs [--minutes=120] [--runs=3] [--policy=idle,casual,active] [--seed=1]
//                           [--ablate] [--no-extras] [--quiet] [--json=out.json]
//                           [--set=enemy.hpGrowth=1.16,enemy.walls.1.1=1.4]   try BALANCE tweaks
//                           [--trace]          one line per new floor: hero vs enemy numbers
//                           [--log-floor=21]   narrate deaths / boss tries / purchases on a floor
// Each run is seeded (seed, seed+1, …) so a tweak can be compared against the same luck.
// Exit code 1 if any number goes non-finite or a module logs an error; otherwise 0 (informational).
import vm from 'node:vm';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'src', 'js');
const FILES = ['core', 'data', 'state', 'battle'].map((f) => ({ name: f + '.js', code: readFileSync(join(SRC, f + '.js'), 'utf8') }));

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const a = argv.find((x) => x === '--' + k || x.startsWith('--' + k + '='));
  if (!a) return d;
  return a.includes('=') ? a.slice(k.length + 3) : true;
};
const MINUTES = Number(arg('minutes', '120'));
const RUNS = Math.max(1, Number(arg('runs', '3')));
const POLICIES = String(arg('policy', 'idle,casual,active')).split(',').filter(Boolean);
const SEED = Number(arg('seed', '1'));
const ABLATE = !!arg('ablate', false);
const EXTRAS = !arg('no-extras', false);
const QUIET = !!arg('quiet', false);
const TRACE = !!arg('trace', false);
const JSON_OUT = arg('json', '') || '';
const LOG_FLOOR = Number(arg('log-floor', '0')) || 0;
const OVERRIDES = String(arg('set', ''))
  .split(',')
  .filter(Boolean)
  .map((kv) => {
    const i = kv.lastIndexOf('=');
    return { path: kv.slice(0, i), value: Number(kv.slice(i + 1)) };
  });
const STEP = 1 / 60;
const CHECKPOINTS = [2, 5, 10, 20, 40, 60, 120, 180, 240, 360, 480].filter((m) => m <= MINUTES);
const MILESTONES = [1, 2, 5, 8, 10, 12, 15, 18, 20, 22, 25, 30, 35, 40, 50];
const SNAP_FLOORS = [5, 10, 15, 20, 25, 30, 40];

let problems = 0;
const problem = (msg) => {
  problems++;
  console.log('  PROBLEM: ' + msg);
};

// ---------------------------------------------------------------- world (one vm context per run)
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeWorld(seed) {
  const store = new Map();
  const errors = [];
  const clock = { now: Date.UTC(2026, 0, 1, 12) };
  const sandbox = {
    console: {
      log() {},
      info() {},
      debug() {},
      warn() {},
      error: (...a) => errors.push(a.map((x) => (x && x.stack) || String(x)).join(' ')),
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    },
    __rng: mulberry32(seed),
    __now: () => clock.now,
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext('Math.random = __rng; Date.now = __now;', ctx);
  for (const f of FILES) vm.runInContext(f.code, ctx, { filename: f.name });
  const DD = ctx.DD;
  for (const o of OVERRIDES) {
    const keys = o.path.split('.');
    let obj = DD.data.BALANCE;
    for (let i = 0; i < keys.length - 1; i++) obj = obj && obj[keys[i]];
    if (!obj || !(keys[keys.length - 1] in obj)) throw new Error('unknown BALANCE key ' + o.path);
    obj[keys[keys.length - 1]] = o.value;
  }
  return { DD, ctx, errors, clock, S: DD.state, B: DD.battle, data: DD.data };
}

// ---------------------------------------------------------------- player actions (UI-equivalent calls)
function openAllChests(w) {
  const { S } = w;
  let guard = 0;
  while ((S.s.chests > 0 || S.s.premiumChests > 0) && guard++ < 20000) {
    // Loot tab: premium button first while there are premium chests, then the big chest button.
    const r = S.openChest({ premium: S.s.premiumChests > 0 });
    if (!r) {
      if (S.s.pendingItem) S.sellPending();
      else break;
      continue;
    }
    if (r.decision === 'pending') {
      const cmp = S.comparePending();
      if (cmp && cmp.delta > 0) S.equipPending();
      else S.sellPending();
    }
  }
}

function claimQuests(w) {
  const { S } = w;
  for (let g = 0; g < 50; g++) {
    const q = S.currentQuest();
    if (!q) break;
    if (!q.done) {
      // "Turn on Auto-Open": flip the toggle on and straight back off (counts as used).
      if (q.text === 'Turn on Auto-Open' && S.s.chests > 0 && !S.s.autoOpen) {
        S.setAutoOpen(true);
        S.setAutoOpen(false);
        continue;
      }
      break;
    }
    if (!S.claimQuest()) break;
  }
}

const MASTERY_WEIGHT = { might: 1, vitality: 1.15, fortune: 1.6, greed: 2.2, precision: 2.5 };

function spendAll(w, flags) {
  const { S, data } = w;
  const s = S.s;
  // ---- skills (scrolls): cheapest of {unlock a skill into a free slot, upgrade an equipped skill}
  if (!flags.noSkills) {
    for (let g = 0; g < 200; g++) {
      const nSlots = S.skillSlotsUnlocked();
      const free = s.skills.equipped.slice(0, nSlots).some((x) => !x);
      let best = null;
      for (const id of data.SKILL_IDS) {
        const c = S.skillCost(id);
        if (c.unlock !== undefined && free) {
          if (!best || c.unlock < best.cost) best = { cost: c.unlock, go: () => S.unlockSkill(id) };
        } else if (c.upgrade !== undefined && s.skills.equipped.includes(id)) {
          if (!best || c.upgrade < best.cost) best = { cost: c.upgrade, go: () => S.upgradeSkill(id) };
        }
      }
      if (!best || s.scrolls < best.cost || !best.go()) break;
    }
  }
  // ---- allies (gems): recruit the cheapest new ally when a slot is free; save gems for it
  let reserve = 0;
  if (!flags.noAllies) {
    const nA = S.allySlotsUnlocked();
    const freeA = s.allies.equipped.slice(0, nA).some((x) => !x);
    if (nA > 0 && freeA) {
      const next = data.ALLY_IDS.filter((id) => !s.allies.owned[id]).sort((a, b) => data.ALLIES[a].unlock - data.ALLIES[b].unlock)[0];
      if (next) {
        const cost = data.ALLIES[next].unlock;
        if (s.gems >= cost) S.unlockAlly(next);
        else reserve = cost;
      }
    }
  }
  // ---- mastery with the gems left over (Might / Vitality first)
  if (!flags.noMastery) {
    for (let g = 0; g < 500; g++) {
      let best = null;
      for (const id of Object.keys(MASTERY_WEIGHT)) {
        const c = S.masteryCost(id);
        if (!Number.isFinite(c)) continue;
        const score = c * MASTERY_WEIGHT[id];
        if (!best || score < best.score) best = { id, cost: c, score };
      }
      if (!best || s.gems - reserve < best.cost || !S.upgradeMastery(best.id)) break;
    }
  }
  // ---- gold: the cheaper of chest level / ally upgrade (saves up for it when short)
  for (let g = 0; g < 500; g++) {
    let best = null;
    if (!flags.noChest) {
      const cc = S.chestUpgradeCost();
      if (Number.isFinite(cc)) best = { cost: cc, go: () => S.upgradeChestLevel() };
    }
    if (!flags.noAllies) {
      for (const id of s.allies.equipped) {
        if (!id) continue;
        const c = S.allyUpgradeCost(id);
        if (Number.isFinite(c) && (!best || c < best.cost)) best = { cost: c, go: () => S.upgradeAlly(id) };
      }
    }
    if (!best || s.gold < best.cost || !best.go()) break;
  }
  // ---- fill empty slots (skills tab / allies tab "Equip")
  const n = S.skillSlotsUnlocked();
  for (const id of data.SKILL_IDS) {
    if (!s.skills.owned[id] || s.skills.equipped.includes(id)) continue;
    const free = s.skills.equipped.findIndex((x, i) => i < n && !x);
    if (free >= 0) S.equipSkill(id, free);
  }
  const an = S.allySlotsUnlocked();
  for (const id of data.ALLY_IDS) {
    if (!s.allies.owned[id] || s.allies.equipped.includes(id)) continue;
    const free = s.allies.equipped.findIndex((x, i) => i < an && !x);
    if (free >= 0) S.equipAlly(id, free);
  }
}

const DUNGEON_ORDER = ['dragon', 'horde', 'vault', 'mothership'];
function maybeDungeon(w) {
  const { S, B, data } = w;
  if (S.s.keys < 1 || B.mode !== 'campaign' || B.phase === 'dead' || B.isBossWave) return null;
  const ids = DUNGEON_ORDER.filter((id) => S.dungeonUnlocked(id));
  if (!ids.length) return null;
  // the easiest unlocked dungeon (lowest enemy strength), ties in reward-priority order, and only
  // if its "Enemy strength ≈ floor N" is at most 2 floors above the best floor reached
  ids.sort((a, b) => data.dungeonFloor(S.dungeonLevel(a)) - data.dungeonFloor(S.dungeonLevel(b)) || DUNGEON_ORDER.indexOf(a) - DUNGEON_ORDER.indexOf(b));
  const id = ids[0];
  if (data.dungeonFloor(S.dungeonLevel(id)) > S.s.campaign.highestFloor + 2) return null;
  return B.startDungeon(id) ? id : null; // Dungeons tab "Enter"
}

function tapFlying(w) {
  const fc = w.B.flyingChest;
  if (!fc) return false;
  return w.B.tapAt(fc.x, fc.y); // render.js forwards the tap in world coordinates
}

function act(w, flags) {
  openAllChests(w);
  claimQuests(w);
  spendAll(w, flags);
  openAllChests(w); // quest rewards may have added chests
  if (!flags.noDungeons) maybeDungeon(w);
}

// ---------------------------------------------------------------- one run
const POLICY = {
  idle: { every: Infinity, tapEvery: Infinity },
  active: { every: 10, tapEvery: 1 },
  casual: { every: 300, tapEvery: Infinity, watch: 10 },
};

function finiteDeep(obj, path, out, depth = 0) {
  if (depth > 6 || !obj) return;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === 'number') {
      if (!Number.isFinite(v) && !(v === Infinity && /cost|Cost/i.test(k))) out.push(path + '.' + k + '=' + v);
    } else if (v && typeof v === 'object') finiteDeep(v, path + '.' + k, out, depth + 1);
  }
}

function runOnce(policyName, seed, flags = {}, opts = {}) {
  const pol = POLICY[policyName];
  const w = makeWorld(seed);
  const { DD, S, B } = w;
  if (opts.onWorld) opts.onWorld(w);
  if (opts.save) {
    if (!S.deserialize(opts.save)) throw new Error('could not load snapshot');
  } else S.load(); // empty storage → new game
  B.init();

  const r = {
    policy: policyName,
    seed,
    checkpoints: {},
    reached: {},
    floorTime: {},
    gold: { kills: 0, floors: 0, sold: 0, flying: 0, dungeons: 0 },
    goldAt: {},
    bossFails: 0,
    deaths: 0,
    dungeon: {},
    dungeonWins: 0,
    dungeonFails: 0,
    flyingSpawned: 0,
    flyingTapped: 0,
    flyingRewards: {},
    chestsFound: 0,
    snapshots: {},
    firstClear: null,
    nonFinite: [],
    purchases: { chest: 0, skill: 0, ally: 0, mastery: 0 },
  };
  let t = 0;
  const on = (evt, fn) => DD.bus.on(evt, fn);
  on('floor:cleared', (p) => {
    if (p.floor === 1 && r.firstClear === null) r.firstClear = t;
    r.gold.floors += (p.rewards && p.rewards.gold) || 0;
    r.chestsFound += (p.rewards && p.rewards.chests) || 0;
  });
  on('enemy:killed', (p) => {
    r.gold.kills += p.gold || 0;
    if (p.chest) r.chestsFound++;
  });
  on('item:sold', (p) => (r.gold.sold += p.gold || 0));
  on('boss:failed', () => r.bossFails++);
  on('hero:died', () => r.deaths++);
  on('flyingChest:spawn', () => r.flyingSpawned++);
  on('flyingChest:collected', (p) => {
    r.flyingTapped++;
    const rw = p.reward || {};
    r.flyingRewards[rw.type] = (r.flyingRewards[rw.type] || 0) + 1;
    if (rw.type === 'gold') r.gold.flying += rw.amount || 0;
  });
  on('dungeon:won', (p) => {
    r.dungeonWins++;
    const d = (r.dungeon[p.id] = r.dungeon[p.id] || { won: 0, failed: 0, maxWon: 0, firstWinAt: null, log: [] });
    d.won++;
    d.maxWon = Math.max(d.maxWon, p.level);
    if (d.firstWinAt === null) d.firstWinAt = t;
    d.log.push('W' + p.level);
    r.gold.dungeons += (p.rewards && p.rewards.gold) || 0;
  });
  on('dungeon:failed', (p) => {
    r.dungeonFails++;
    const d = (r.dungeon[p.id] = r.dungeon[p.id] || { won: 0, failed: 0, maxWon: 0, firstWinAt: null, log: [] });
    d.failed++;
    d.log.push('L' + p.level + (p.reason === 'death' ? 'd' : 't'));
  });
  on('purchase', (p) => {
    if (p.kind in r.purchases) r.purchases[p.kind]++;
  });
  if (opts.logFloor) {
    // --log-floor=N: narrate what happens while the campaign sits on floor N (first run only)
    const here = () => B.mode === 'campaign' && S.s.campaign.floor === opts.logFloor;
    let bossStart = 0;
    const log = (m) => here() && console.log(`    ${fmtT(t)} ${m}`);
    on('wave:start', (p) => {
      if (p.isBoss) bossStart = t;
      if (p.isBoss) log(`boss wave (hero ${Math.round(B.hero.hp)}/${Math.round(B.hero.maxHp)} hp)`);
    });
    on('hero:died', () => log(`hero died on wave ${B.wave}${B.isBossWave ? ' (boss, ' + Math.round(t - bossStart) + ' s in)' : ''} — boss hp left ${Math.round((B.enemies.find((e) => e.isBoss && !e.dead) || {}).hp || 0)}`));
    on('boss:failed', (p) => p.reason === 'timeout' && log(`boss timeout — boss hp left ${Math.round((B.enemies.find((e) => e.isBoss) || {}).hp || 0)}`));
    on('floor:cleared', (p) => p.floor === opts.logFloor && console.log(`    ${fmtT(t)} CLEARED (boss took ${Math.round(t - bossStart)} s)`));
    on('purchase', (p) => log(`bought ${p.kind} ${p.id} ${p.level || ''}`));
  }

  const total = (opts.minutes || MINUTES) * 60;
  let nextAct = pol.every === Infinity ? Infinity : Math.min(pol.every, 10);
  let nextTap = pol.tapEvery;
  let watchUntil = -1;
  let nextCk = 0;
  const cks = (opts.checkpoints || CHECKPOINTS).slice();
  const snapFloors = opts.snapFloors || [];
  const snapTimes = (opts.snapTimes || []).slice();
  const steps = Math.round(total / STEP);
  for (let i = 1; i <= steps; i++) {
    B.update(STEP);
    S.tick(STEP);
    t = i * STEP;
    w.clock.now += STEP * 1000;
    if (t >= nextAct) {
      nextAct += pol.every;
      act(w, flags);
      if (pol.watch) watchUntil = t + pol.watch;
    }
    if (!flags.noFlying && B.flyingChest && (t >= nextTap || t <= watchUntil)) {
      if (t >= nextTap) nextTap = t + pol.tapEvery;
      if (B.flyingChest.t > 0.8) tapFlying(w); // ~1 s reaction time
    } else if (t >= nextTap) nextTap = t + pol.tapEvery;
    const hf = S.s.campaign.highestFloor;
    if (r.reached[hf] === undefined) {
      for (let f = 1; f <= hf; f++) if (r.reached[f] === undefined) r.reached[f] = t;
      if (opts.trace) traceLine(w, t, hf, r);
      for (const sf of snapFloors) if (hf >= sf && !r.snapshots['F' + sf]) r.snapshots['F' + sf] = { t, label: `${policyName} @${fmtT(t)}`, save: S.serialize() };
    }
    if (snapTimes.length && t >= snapTimes[0] * 60) {
      const m = snapTimes.shift();
      r.snapshots['T' + m] = { t, label: `${policyName} @${m}m`, save: S.serialize() };
    }
    if (nextCk < cks.length && t >= cks[nextCk] * 60 - 1e-9) {
      const m = cks[nextCk++];
      r.checkpoints[m] = {
        floor: hf,
        cur: S.s.campaign.floor,
        level: S.s.hero.level,
        cp: S.getPower(),
        chestLv: S.s.chestLevel,
        gold: S.s.gold,
        gems: S.s.gems,
        scrolls: S.s.scrolls,
        chests: S.s.chests,
        deaths: r.deaths,
        bossFails: r.bossFails,
        dungeonWins: r.dungeonWins,
        goldEarned: S.s.stats.goldEarned,
        src: Object.assign({}, r.gold),
        mastery: Object.assign({}, S.s.mastery),
        skills: Object.assign({}, S.s.skills.owned),
        allies: Object.assign({}, S.s.allies.owned),
      };
    }
  }
  const hf = S.s.campaign.highestFloor;
  for (let f = 1; f < hf; f++) r.floorTime[f] = r.reached[f + 1] - r.reached[f];
  r.final = {
    floor: hf,
    level: S.s.hero.level,
    cp: S.getPower(),
    chestLv: S.s.chestLevel,
    gold: S.s.gold,
    gems: S.s.gems,
    stats: S.getHeroStats(),
    mastery: Object.assign({}, S.s.mastery),
    skills: Object.assign({}, S.s.skills.owned),
    allies: Object.assign({}, S.s.allies.owned),
    equipped: S.s.equipped,
    dungeons: JSON.parse(JSON.stringify(S.s.dungeons)),
    goldEarned: S.s.stats.goldEarned,
  };
  finiteDeep({ s: S.s, stats: S.getHeroStats(), hero: B.hero, enemies: B.enemies }, policyName, r.nonFinite);
  r.errors = w.errors.slice(0, 5);
  r.errorCount = w.errors.length;
  r.world = w;
  return r;
}

// --trace: one line per new floor (hero vs enemy numbers) for the first run of each policy
function traceLine(w, t, f, r) {
  const { S, data: D } = w;
  const st = S.getHeroStats();
  const s = S.s;
  const e = D.enemyStats(f, D.biomeForFloor(f).enemies[0], { isBoss: false });
  const b = D.enemyStats(f, D.biomeForFloor(f).boss, { isBoss: true });
  const eq = Object.values(s.equipped).filter(Boolean);
  const rar = eq.reduce((a, it) => a + it.rarity, 0) / Math.max(1, eq.length);
  const ilv = eq.reduce((a, it) => a + it.ilvl, 0) / Math.max(1, eq.length);
  const dps = st.atk * (1 + st.critChance * (st.critDmg - 1)) * st.atkSpeed * (1 + st.combo);
  console.log(
    `  [${fmtT(t)}] F${f} lv${s.hero.level} atk ${fmtN(st.atk)} hp ${fmtN(st.hp)} dps ${fmtN(dps)} CP ${fmtN(S.getPower())} | ` +
      `gear ${eq.length} slots, rarity ${rar.toFixed(1)}, ilvl ${ilv.toFixed(1)} | chestLv ${s.chestLevel} might ${s.mastery.might} vit ${s.mastery.vitality} ` +
      `skills ${JSON.stringify(s.skills.owned)} allies ${JSON.stringify(s.allies.owned)} | enemy hp ${fmtN(e.hp)} (${(e.hp / Math.max(1, st.atk)).toFixed(1)} hits) atk ${fmtN(e.atk)} (${((100 * e.atk) / st.hp).toFixed(0)}%hp) boss hp ${fmtN(b.hp)} (${(b.hp / dps).toFixed(0)} s) | deaths ${r.deaths} bossFails ${r.bossFails}`,
  );
}

// ---------------------------------------------------------------- formatting helpers
const fmtT = (sec) => (sec === null || sec === undefined ? '—' : `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`);
let fmtN = (n) => String(Math.round(n));
const pad = (s, n) => String(s).padStart(n);
const padR = (s, n) => String(s).padEnd(n);
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN);
const med = (arr) => {
  const a = arr.slice().sort((x, y) => x - y);
  return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : NaN;
};

function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => '  ' + cells.map((c, i) => (i === 0 ? padR(c, widths[i]) : pad(c, widths[i]))).join('  ');
  console.log(line(headers));
  console.log('  ' + widths.map((x) => '-'.repeat(x)).join('  '));
  for (const r of rows) console.log(line(r));
}

// ---------------------------------------------------------------- policy report
function reportPolicy(name, runs) {
  console.log(`\n=== ${name} × ${runs.length} runs (${MINUTES} min each) ===`);
  const rows = [];
  for (const m of CHECKPOINTS) {
    const cs = runs.map((r) => r.checkpoints[m]).filter(Boolean);
    if (!cs.length) continue;
    const fl = cs.map((c) => c.floor);
    rows.push([
      m + ' min',
      `${avg(fl).toFixed(1)} (${Math.min(...fl)}–${Math.max(...fl)})`,
      avg(cs.map((c) => c.level)).toFixed(1),
      fmtN(avg(cs.map((c) => c.cp))),
      avg(cs.map((c) => c.chestLv)).toFixed(1),
      fmtN(avg(cs.map((c) => c.gold))),
      fmtN(avg(cs.map((c) => c.gems))),
      fmtN(avg(cs.map((c) => c.deaths))),
      fmtN(avg(cs.map((c) => c.bossFails))),
      avg(cs.map((c) => c.dungeonWins)).toFixed(1),
    ]);
  }
  table(['t', 'floor (min–max)', 'level', 'CP', 'chestLv', 'gold', 'gems', 'deaths', 'bossFail', 'dungWins'], rows);
  const fc = runs.map((r) => r.firstClear).filter((x) => x !== null);
  console.log(`  floor 1 cleared at ${fc.map(fmtT).join(', ')}`);
  const ms = MILESTONES.filter((f) => runs.some((r) => r.reached[f] !== undefined));
  console.log(
    '  reached: ' +
      ms
        .map((f) => {
          const ts = runs.map((r) => r.reached[f]);
          const got = ts.filter((x) => x !== undefined);
          return `F${f} ${got.length === runs.length ? fmtT(med(got)) : fmtT(got.length ? med(got) : null) + ` (${got.length}/${runs.length})`}`;
        })
        .join('  '),
  );
  const totals = (k) => avg(runs.map((r) => r[k]));
  console.log(
    `  totals: deaths ${totals('deaths').toFixed(0)}, boss fails ${totals('bossFails').toFixed(0)}, dungeon wins ${totals('dungeonWins').toFixed(1)} / fails ${totals('dungeonFails').toFixed(1)}, flying chests tapped ${totals('flyingTapped').toFixed(0)}/${totals('flyingSpawned').toFixed(0)}`,
  );
  // minutes per floor (median) — walls
  const maxF = Math.max(...runs.map((r) => r.final.floor));
  const per = [];
  for (let f = 1; f < maxF; f++) {
    const ts = runs.map((r) => r.floorTime[f]).filter((x) => x !== undefined);
    if (ts.length) per.push(`${f}:${(med(ts) / 60).toFixed(1)}`);
  }
  console.log('  minutes on floor (median): ' + per.join(' '));
  if (name !== 'idle') {
    for (const m of CHECKPOINTS.filter((x) => x === 10 || x === 40 || x === CHECKPOINTS[CHECKPOINTS.length - 1])) {
      const cs = runs.map((r) => r.checkpoints[m]).filter(Boolean);
      const sum = (k) => avg(cs.map((c) => c.src[k]));
      const tot = sum('kills') + sum('floors') + sum('sold') + sum('flying') + sum('dungeons');
      const pc = (k) => ((100 * sum(k)) / Math.max(1, tot)).toFixed(0) + '%';
      console.log(`  gold sources by ${m} min (${fmtN(tot)} total): kills ${pc('kills')}, floor clears ${pc('floors')}, selling ${pc('sold')}, flying chest ${pc('flying')}, dungeons ${pc('dungeons')}`);
    }
    const f = runs[0].final;
    console.log(
      `  run 1 final: mastery ${JSON.stringify(f.mastery)} skills ${JSON.stringify(f.skills)} allies ${JSON.stringify(f.allies)} purchases ${JSON.stringify(runs[0].purchases)}`,
    );
    const gear = Object.values(f.equipped)
      .filter(Boolean)
      .map((it) => it.slot[0].toUpperCase() + it.slot[1] + ':' + 'CURELMX'[it.rarity] + it.ilvl)
      .join(' ');
    console.log(`  run 1 gear: ${gear}  (C/U/R/E/L/M/X rarity + ilvl)`);
    const dl = Object.entries(runs[0].dungeon).map(([id, d]) => `${id} ${d.log.join(',')}`);
    console.log('  run 1 dungeons: ' + (dl.join(' | ') || 'none'));
  }
  for (const r of runs) {
    if (r.nonFinite.length) problem(`${name} seed ${r.seed}: non-finite ${r.nonFinite.slice(0, 5).join(', ')}`);
    if (r.errorCount) problem(`${name} seed ${r.seed}: ${r.errorCount} console errors, e.g. ${r.errors[0]}`);
  }
}

// ---------------------------------------------------------------- AFK / reward magnitudes
function liveFarm(save, minutes) {
  // Load the save with farming on and auto boss off, so the real battle loops waves 1–4 of the
  // current floor hands-off — exactly what the AFK estimate models — and measure what it pays.
  const s = JSON.parse(save);
  s.campaign.farming = true;
  s.campaign.wave = 1;
  s.settings.autoBoss = false;
  let kills = 0;
  const r = runOnce('idle', 777, {}, {
    save: JSON.stringify(s),
    minutes,
    checkpoints: [],
    onWorld: (w) => w.DD.bus.on('enemy:killed', () => kills++),
  });
  const sec = minutes * 60;
  return { killsPerSec: kills / sec, goldPerSec: r.gold.kills / sec, chestsPerSec: r.chestsFound / sec, deaths: r.deaths };
}

function offlineFor(save, hours) {
  const w = makeWorld(4242);
  w.S.deserialize(save);
  const now = w.clock.now;
  w.S.s.lastSeen = now - hours * 3600 * 1000;
  const lv0 = w.S.s.hero.level;
  const inc = w.S.estimateIncome();
  const r = w.S.collectOffline(now);
  return Object.assign({}, r, { levels: w.S.s.hero.level - lv0, inc });
}

function reportRewards(saves) {
  if (!saves.length) return;
  console.log('\n=== AFK estimate vs live farming of the same floor (10 min hands-off, waves 1–4 looped), and AFK payouts ===');
  const rows = [];
  const mags = [];
  for (const sv of saves) {
    const o1 = offlineFor(sv.save, 1);
    const o8 = offlineFor(sv.save, 8);
    const live = liveFarm(sv.save, 10);
    const s = JSON.parse(sv.save);
    const inc = o1.inc;
    rows.push([
      `${sv.label} F${s.campaign.floor} lv${s.hero.level}`,
      inc.killsPerSec.toFixed(2) + (inc.wavesPerLife && inc.wavesPerLife < 100 ? ` (dies every ${inc.wavesPerLife.toFixed(1)} waves)` : ''),
      live.killsPerSec.toFixed(2) + ` (${live.deaths} deaths)`,
      (inc.killsPerSec / Math.max(1e-9, live.killsPerSec)).toFixed(2),
      fmtN(o1.gold) + ' / ' + fmtN(o1.chests) + ' / +' + o1.levels + 'lv',
      fmtN(o8.gold) + ' / ' + fmtN(o8.chests) + ' / +' + o8.levels + 'lv',
      (o1.gold / Math.max(1, live.goldPerSec * 3600)).toFixed(2),
    ]);
    mags.push({ label: sv.label, s, live });
  }
  table(['save', 'estimate kills/s', 'live kills/s', 'est÷live', 'AFK 1h gold/chests/levels', 'AFK 8h gold/chests/levels', 'AFK 1h gold ÷ 1h live'], rows);

  console.log('\n=== flying chest & dungeon rewards relative to income (live farming income of the same saves) ===');
  const rows2 = [];
  for (const { label, s, live } of mags) {
    const w = makeWorld(99);
    w.S.deserialize(JSON.stringify(s));
    const D = w.data;
    const gps = Math.max(1e-9, live.goldPerSec);
    const cps = Math.max(1e-9, live.chestsPerSec);
    const fcTable = D.BALANCE.flyingChest;
    const goldRow = fcTable.find((x) => x.type === 'gold');
    const chestRow = fcTable.find((x) => x.type === 'chests');
    const gemRow = fcTable.find((x) => x.type === 'gems');
    const est = w.S.estimateIncome();
    const st = w.S.getHeroStats();
    // the same formula as state.grantFlyingChest
    const fcGold = Math.max(est.goldPerSec * goldRow.seconds, D.killGold(s.campaign.floor) * (goldRow.minKills || 10) * (1 + st.goldBonus));
    const chestAvg = (chestRow.min + chestRow.max) / 2;
    const lv = (id) => (s.dungeons[id] ? s.dungeons[id].level : 1);
    const ms = D.dungeonRewards('mothership', lv('mothership'));
    const might = w.S.masteryCost('might');
    rows2.push([
      `${label} F${s.campaign.floor}`,
      fmtN(gps * 60) + '/min',
      (cps * 60).toFixed(1) + '/min',
      fmtN(fcGold) + ` (${(fcGold / gps).toFixed(0)} s)`,
      `${chestAvg} (${(chestAvg / cps).toFixed(0)} s)`,
      `${(gemRow.min + gemRow.max) / 2} (Might ${might})`,
      `L${lv('dragon')} ${D.dungeonRewards('dragon', lv('dragon')).scrolls} scr`,
      `L${lv('horde')} ${D.dungeonRewards('horde', lv('horde')).gems} gems`,
      `L${lv('vault')} ${D.dungeonRewards('vault', lv('vault')).premiumChests} prem`,
      `L${lv('mothership')} ${fmtN(ms.gold)} (${(ms.gold / gps).toFixed(0)} s)`,
    ]);
  }
  table(['save', 'farm gold', 'farm chests', 'flying gold (s of income)', 'flying chests (s)', 'flying gems', 'dragon', 'horde', 'vault', 'mothership gold (s)'], rows2);
}

// ---------------------------------------------------------------- NaN / Infinity sweep up to floor 500
function finiteSweep() {
  console.log('\n=== NaN/Infinity sweep: formulas for floors 1..500 (+5000), live battle at floors 100/250/500 ===');
  const w = makeWorld(5);
  const { DD, S, B, data: D } = w;
  const bad = [];
  const chk = (label, v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) bad.push(label + '=' + v);
  };
  const chkObj = (label, o) => {
    const out = [];
    finiteDeep(o, label, out);
    bad.push(...out);
  };
  for (const f of [...Array(500).keys()].map((i) => i + 1).concat([1000, 5000, 1e6])) {
    for (const b of D.BIOMES) for (const t of b.enemies.concat([b.boss])) chkObj(`enemy ${t}@${f}`, D.enemyStats(f, t, { isBoss: t === b.boss }));
    chkObj('hero@' + f, D.heroBaseStats(f));
    chk('xpToNext@' + f, D.xpToNext(f));
    chk('killGold@' + f, D.killGold(f));
    chkObj('floorClear@' + f, D.floorClearRewards(f));
    chk('main@' + f, D.itemMainValue('weapon', 6, f));
    chk('sell@' + f, D.itemSellValue({ ilvl: f, rarity: 6 }));
    for (const id of D.DUNGEON_IDS) chkObj(`dungeon ${id} L${f}`, D.dungeonRewards(id, f));
    chk('dungeonFloor@' + f, D.dungeonFloor(f));
  }
  for (let L = 1; L <= 20; L++) chk('chestCost@' + L, D.chestUpgradeCost(L));
  for (const f of [100, 250, 500]) {
    S.reset();
    const s = S.s;
    s.campaign.floor = f;
    s.campaign.highestFloor = f;
    s.hero.level = f * 2;
    s.chestLevel = 20;
    s.gold = 1e30;
    s.gems = 1e9;
    for (const slot of D.SLOTS) s.equipped[slot] = D.rollItem({ ilvl: f, chestLevel: 20, slot, rarity: 6 });
    for (const id of D.SKILL_IDS) s.skills.owned[id] = 30;
    s.skills.equipped = ['bomb', 'lightning', 'meteor', 'frost'];
    for (const id of D.ALLY_IDS) s.allies.owned[id] = 50;
    s.allies.equipped = ['wolf', 'golem_ally'];
    for (const id of D.MASTERY_IDS) s.mastery[id] = D.MASTERY[id].max;
    S.invalidate();
    B.init();
    for (let i = 0; i < 60 * 90; i++) {
      B.update(STEP);
      S.tick(STEP);
      w.clock.now += STEP * 1000;
      if (i === 60 * 20) B.spawnFlyingChest();
      if (i === 60 * 21 && B.flyingChest) B.tapAt(B.flyingChest.x, B.flyingChest.y);
    }
    chkObj('battle@' + f, { hero: B.hero, enemies: B.enemies, projectiles: B.projectiles, bossTimer: B.bossTimer });
    chkObj('state@' + f, { s: S.s, stats: S.getHeroStats(), cp: S.getPower(), inc: S.estimateIncome() });
    s.lastSeen = w.clock.now - 10 * 3600 * 1000;
    chkObj('offline@' + f, S.collectOffline(w.clock.now));
    for (const id of D.DUNGEON_IDS) {
      s.dungeons[id].level = f;
      s.keys = 5;
      B.leaveDungeon();
      B.startDungeon(id);
      for (let i = 0; i < 60 * 50; i++) {
        B.update(STEP);
        S.tick(STEP);
      }
      chkObj(`dungeon ${id}@${f}`, { hero: B.hero, enemies: B.enemies, s: S.s });
    }
    for (const v of [S.s.gold, S.getPower(), B.hero.maxHp, S.s.chests]) if (/NaN|undefined|Infinity|∞/.test(DD.fmt(v))) bad.push('fmt ' + v);
  }
  if (w.errors.length) bad.push(...w.errors.slice(0, 3));
  if (bad.length) problem('non-finite values: ' + bad.slice(0, 8).join(', ') + (bad.length > 8 ? ` (+${bad.length - 8})` : ''));
  else console.log('  all finite (formulas 1..500, 1000, 5000, 1e6; battle + offline + dungeons at 100/250/500)');
}

// ---------------------------------------------------------------- ablation
function ablation() {
  const variants = [
    ['active (all)', {}],
    ['no chest upgrades', { noChest: true }],
    ['no skills', { noSkills: true }],
    ['no allies', { noAllies: true }],
    ['no mastery', { noMastery: true }],
    ['no dungeons', { noDungeons: true }],
    ['no flying chest', { noFlying: true }],
  ];
  const cks = CHECKPOINTS.filter((m) => [10, 20, 40, 60, 120].includes(m));
  console.log(`\n=== ablation: active policy minus one upgrade type (floor reached; ${RUNS} runs each) ===`);
  const rows = [];
  for (const [label, flags] of variants) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(runOnce('active', SEED + i, flags, { checkpoints: cks }));
    rows.push([label, ...cks.map((m) => avg(runs.map((r) => r.checkpoints[m].floor)).toFixed(1)), fmtN(avg(runs.map((r) => r.final.cp)))]);
  }
  table(['variant', ...cks.map((m) => m + ' min'), 'final CP'], rows);
}

// ---------------------------------------------------------------- main
{
  const w0 = makeWorld(1);
  fmtN = (n) => w0.DD.fmt(n);
  if (OVERRIDES.length) console.log('BALANCE overrides: ' + OVERRIDES.map((o) => o.path + '=' + o.value).join(', '));
}
const t0 = Date.now();
const all = {};
for (const p of POLICIES) {
  if (!POLICY[p]) throw new Error('unknown policy ' + p);
  all[p] = [];
  for (let i = 0; i < RUNS; i++) {
    if (TRACE && i === 0) console.log(`--- trace: ${p} run 1 ---`);
    const r = runOnce(p, SEED + i, {}, {
      snapFloors: p === 'active' && i === 0 ? SNAP_FLOORS : [],
      snapTimes: p === 'idle' && i === 0 ? [20, 60] : [],
      trace: TRACE && i === 0,
      logFloor: i === 0 ? LOG_FLOOR : 0,
    });
    all[p].push(r);
    if (!QUIET)
      console.log(
        `${p} run ${i + 1} (seed ${SEED + i}): floor ${r.final.floor}, lv ${r.final.level}, CP ${fmtN(r.final.cp)}, chest Lv ${r.final.chestLv}, deaths ${r.deaths}, boss fails ${r.bossFails}, dungeon wins ${r.dungeonWins}`,
      );
  }
}
for (const p of POLICIES) reportPolicy(p, all[p]);
if (JSON_OUT) {
  const out = {};
  for (const p of POLICIES) {
    out[p] = all[p].map((r) => ({
      seed: r.seed,
      firstClear: r.firstClear,
      checkpoints: Object.fromEntries(Object.entries(r.checkpoints).map(([m, c]) => [m, { floor: c.floor, level: c.level, cp: c.cp, chestLv: c.chestLv, gold: c.gold, gems: c.gems }])),
      reached: r.reached,
      floorTime: r.floorTime,
      deaths: r.deaths,
      bossFails: r.bossFails,
      dungeonWins: r.dungeonWins,
      dungeonFails: r.dungeonFails,
      gold: r.gold,
      final: { floor: r.final.floor, level: r.final.level, cp: r.final.cp, chestLv: r.final.chestLv },
    }));
  }
  writeFileSync(JSON_OUT, JSON.stringify(out));
}
if (EXTRAS) {
  const saves = [];
  for (const p of ['idle', 'active']) if (all[p]) saves.push(...Object.values(all[p][0].snapshots).sort((a, b) => a.t - b.t));
  reportRewards(saves);
}
if (ABLATE) ablation();
if (EXTRAS) finiteSweep();
console.log(`\nsim done in ${((Date.now() - t0) / 1000).toFixed(1)} s${problems ? ` — ${problems} problem(s)` : ''}`);
process.exitCode = problems ? 1 : 0;
