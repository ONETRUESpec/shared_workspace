// Headless balance simulation against CONTRACT §1 targets, using the real data/state/battle modules.
// (tests/sim.mjs is the fuller balance tool: idle/casual/active policies, AFK checks, ablation.)
//
//   idle   — never opens a chest (skills auto-cast, auto boss retry on). Target: floor 1 cleared in
//            ~30–45 s; stalls around floor 5–7.
//   active — opens every chest (equips upgrades, sells the rest), claims quests, buys the cheapest
//            useful upgrade (chest level, skills, allies, mastery), runs Boss Dungeons with its keys.
//            Target: ~floor 10 after 10 min, ~floor 20 after 40 min; walls felt at 6–8, 12–15, 20+.
//
// Usage: node tests/balance.sim.mjs [--minutes=40] [--runs=3] [--policy=idle,active]
// Prints a timeline per run and a summary; exits 0 (informational) unless something throws or a
// number goes NaN/Infinity.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'src', 'js');
for (const f of ['core', 'data', 'state', 'battle']) require(join(src, f + '.js'));
const DD = globalThis.DD;

const args = process.argv.slice(2);
const arg = (k, d) => {
  const a = args.find((x) => x.startsWith('--' + k + '='));
  return a ? a.slice(k.length + 3) : d;
};
const MINUTES = Number(arg('minutes', '40'));
const RUNS = Number(arg('runs', '3'));
const POLICIES = arg('policy', 'idle,active').split(',');
// --set=enemy.hpGrowth=1.16,hero.growth=1.05  (try BALANCE tweaks without editing data.js)
for (const kv of arg('set', '').split(',').filter(Boolean)) {
  const [path, val] = kv.split('=');
  const keys = path.split('.');
  let o = DD.data.BALANCE;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  if (!o || !(keys[keys.length - 1] in o)) throw new Error('unknown BALANCE key ' + path);
  o[keys[keys.length - 1]] = Number(val);
  console.log('BALANCE.' + path + ' = ' + val);
}
const STEP = 1 / 60;

// Simulated wall clock so key regen and timestamps follow simulated time.
let simNow = Date.UTC(2026, 0, 1);
const realNow = Date.now;
Date.now = () => simNow;

let bad = 0;
const finite = (label, v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    bad++;
    console.log('  NON-FINITE ' + label + ': ' + v);
  }
};

function decideChests(S) {
  // Open everything (manual decisions): equip upgrades, sell the rest.
  let guard = 0;
  while ((S.s.chests > 0 || S.s.premiumChests > 0) && guard++ < 5000) {
    const r = S.openChest({ premium: S.s.premiumChests > 0 });
    if (!r) break;
    if (r.decision === 'pending') {
      if (S.isUpgrade(S.s.pendingItem)) S.equipPending();
      else S.sellPending();
    }
  }
}

function spend(S) {
  const D = DD.data;
  const s = S.s;
  for (let guard = 0; guard < 200; guard++) {
    // candidate purchases with their cost relative to the wallet; take the cheapest affordable
    const options = [];
    const cc = S.chestUpgradeCost();
    if (Number.isFinite(cc) && s.gold >= cc) options.push({ w: cc / Math.max(1, s.gold), go: () => S.upgradeChestLevel() });
    for (const id of D.SKILL_IDS) {
      const c = S.skillCost(id);
      if (c.unlock !== undefined && s.scrolls >= c.unlock) options.push({ w: 0, go: () => S.unlockSkill(id) });
      else if (c.upgrade !== undefined && s.skills.equipped.includes(id) && s.scrolls >= c.upgrade) options.push({ w: 0.5, go: () => S.upgradeSkill(id) });
    }
    for (const id of D.ALLY_IDS) {
      const c = S.allyCost(id);
      if (c.unlock !== undefined && s.gems >= c.unlock && S.allySlotsUnlocked() > 0) options.push({ w: 0.2, go: () => S.unlockAlly(id) });
      else if (c.upgrade !== undefined && s.allies.equipped.includes(id) && s.gold >= c.upgrade) options.push({ w: c.upgrade / Math.max(1, s.gold), go: () => S.upgradeAlly(id) });
    }
    for (const id of ['might', 'vitality', 'fortune', 'greed']) {
      const c = S.masteryCost(id);
      // keep 100 gems in reserve for the first ally until one is owned
      const reserve = Object.keys(s.allies.owned).length ? 0 : 100;
      if (Number.isFinite(c) && s.gems - reserve >= c) options.push({ w: c / Math.max(1, s.gems), go: () => S.upgradeMastery(id) });
    }
    if (!options.length) break;
    options.sort((a, b) => a.w - b.w);
    if (!options[0].go()) break;
  }
  // fill empty skill / ally slots
  const n = S.skillSlotsUnlocked();
  for (const id of D.SKILL_IDS) {
    if (!s.skills.owned[id] || s.skills.equipped.includes(id)) continue;
    const free = s.skills.equipped.findIndex((x, i) => i < n && !x);
    if (free >= 0) S.equipSkill(id, free);
  }
  const an = S.allySlotsUnlocked();
  for (const id of D.ALLY_IDS) {
    if (!s.allies.owned[id] || s.allies.equipped.includes(id)) continue;
    const free = s.allies.equipped.findIndex((x, i) => i < an && !x);
    if (free >= 0) S.equipAlly(id, free);
  }
}

function runOnce(policy) {
  const S = DD.state;
  const B = DD.battle;
  S.reset();
  B.init();
  const timeline = [];
  const t0 = B.time;
  const firstClear = { t: null };
  const reached = { 5: null, 8: null, 10: null, 12: null, 15: null, 18: null, 20: null, 22: null, 25: null };
  const offs = [
    DD.bus.on('floor:cleared', (p) => {
      if (p.floor === 1 && firstClear.t === null) firstClear.t = B.time - t0;
    }),
  ];
  let bossFails = 0;
  offs.push(DD.bus.on('boss:failed', () => bossFails++));
  let dungeonWins = 0;
  offs.push(DD.bus.on('dungeon:won', () => dungeonWins++));
  const total = MINUTES * 60;
  let t = 0;
  let nextAct = 1;
  let nextLog = 60;
  while (t < total) {
    B.update(STEP);
    t += STEP;
    simNow += STEP * 1000;
    S.tick(STEP);
    if (policy === 'active' && t >= nextAct) {
      nextAct += 2;
      decideChests(S);
      while (S.currentQuest() && S.currentQuest().done) S.claimQuest();
      spend(S);
      if (B.mode === 'campaign' && S.s.keys > 0 && B.phase !== 'dead') {
        const ids = DD.data.DUNGEON_IDS.filter((id) => S.dungeonUnlocked(id));
        // the dungeon whose strength floor is lowest relative to the campaign
        ids.sort((a, b) => DD.data.dungeonFloor(S.dungeonLevel(a)) - DD.data.dungeonFloor(S.dungeonLevel(b)));
        const id = ids.find((x) => DD.data.dungeonFloor(S.dungeonLevel(x)) <= S.s.campaign.highestFloor - 1);
        if (id) B.startDungeon(id);
      }
    }
    const hf = S.s.campaign.highestFloor;
    for (const k of Object.keys(reached)) if (reached[k] === null && hf >= Number(k)) reached[k] = t;
    if (t >= nextLog) {
      nextLog += 60;
      const m = Math.round(t / 60);
      if (m % 5 === 0 || m <= 2) timeline.push(`${String(m).padStart(3)}m F${String(hf).padStart(3)} lv${S.s.hero.level} cp${DD.fmt(S.getPower())} chestLv${S.s.chestLevel} gold${DD.fmt(S.s.gold)}`);
    }
  }
  offs.forEach((o) => o());
  const s = S.s;
  finite('gold', s.gold);
  finite('power', S.getPower());
  finite('hero hp', B.hero.hp);
  return {
    policy,
    firstClear: firstClear.t,
    floor: s.campaign.highestFloor,
    level: s.hero.level,
    cp: S.getPower(),
    reached,
    bossFails,
    dungeonWins,
    deaths: s.stats.deaths,
    chestLevel: s.chestLevel,
    timeline,
  };
}

const fmtT = (sec) => (sec === null ? '  —  ' : `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`);
for (const policy of POLICIES) {
  console.log(`\n=== ${policy} × ${RUNS} (${MINUTES} min each) ===`);
  const res = [];
  for (let i = 0; i < RUNS; i++) {
    const r = runOnce(policy);
    res.push(r);
    console.log(`run ${i + 1}: floor ${r.floor}, lv ${r.level}, CP ${DD.fmt(r.cp)}, chest Lv ${r.chestLevel}, floor 1 cleared ${fmtT(r.firstClear)}, deaths ${r.deaths}, boss fails ${r.bossFails}, dungeon wins ${r.dungeonWins}`);
    console.log('       reached ' + Object.entries(r.reached).map(([k, v]) => `F${k} ${fmtT(v)}`).join('  '));
    if (i === 0) for (const line of r.timeline) console.log('       ' + line);
  }
  const avg = (f) => res.reduce((a, r) => a + f(r), 0) / res.length;
  console.log(`avg: floor ${avg((r) => r.floor).toFixed(1)}, floor 1 cleared ${fmtT(avg((r) => r.firstClear || 0))}`);
}
Date.now = realNow;
if (bad) {
  console.log('\nBALANCE SIM: non-finite numbers found');
  process.exit(1);
}
console.log('\nbalance sim done');
