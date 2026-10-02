// Dungeon Dash — economy module tests (data.js + state.js). Run: node tests/econ.test.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const js = join(here, '..', 'src', 'js');

// ---------------------------------------------------------------- fake localStorage
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

for (const f of ['core.js', 'data.js', 'state.js']) {
  vm.runInThisContext(readFileSync(join(js, f), 'utf8'), { filename: f });
}
const DD = globalThis.DD;
const data = DD.data;
const state = DD.state;

// ---------------------------------------------------------------- tiny harness
let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (err) {
    failed++;
    console.log('  FAIL ' + name);
    console.log('       ' + String((err && err.stack) || err).split('\n').slice(0, 6).join('\n       '));
  }
}

const events = [];
const toasts = [];
for (const evt of [
  'state:changed',
  'stats:changed',
  'chest:opened',
  'item:equipped',
  'item:sold',
  'levelup',
  'quest:ready',
  'quest:claimed',
  'purchase',
  'state:reset',
]) {
  DD.bus.on(evt, (p) => events.push({ evt, p }));
}
DD.bus.on('toast', (p) => toasts.push(p));
const count = (evt) => events.filter((e) => e.evt === evt).length;
const clearEvents = () => {
  events.length = 0;
  toasts.length = 0;
};

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);
function assertFiniteDeep(obj, path) {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `${path}.${k} is not finite: ${v}`);
    else if (v && typeof v === 'object') assertFiniteDeep(v, `${path}.${k}`);
  }
}

function fresh() {
  store.clear();
  state.reset();
  clearEvents();
  return state.s;
}

function validateItem(it, ctx) {
  assert.ok(it && typeof it === 'object', `${ctx}: item object`);
  assert.equal(typeof it.id, 'string', `${ctx}: id`);
  assert.ok(data.SLOTS.includes(it.slot), `${ctx}: slot ${it.slot}`);
  assert.ok(Number.isInteger(it.rarity) && it.rarity >= 0 && it.rarity <= 6, `${ctx}: rarity`);
  assert.ok(Number.isInteger(it.ilvl) && it.ilvl >= 1, `${ctx}: ilvl`);
  assert.equal(it.era, data.eraForIlvl(it.ilvl), `${ctx}: era matches ilvl`);
  assert.equal(typeof it.name, 'string');
  assert.ok(it.name.length > 0, `${ctx}: name`);
  assert.equal(it.main.stat, data.SLOT_INFO[it.slot].stat, `${ctx}: main stat`);
  assert.ok(isFiniteNum(it.main.value) && it.main.value >= 1, `${ctx}: main value ${it.main.value}`);
  assert.equal(it.subs.length, data.RARITIES[it.rarity].subs, `${ctx}: sub count`);
  const seen = new Set();
  for (const sub of it.subs) {
    assert.ok(data.SUBSTATS.includes(sub.stat), `${ctx}: sub stat ${sub.stat}`);
    assert.ok(!seen.has(sub.stat), `${ctx}: duplicate sub ${sub.stat}`);
    seen.add(sub.stat);
    assert.ok(isFiniteNum(sub.value) && sub.value > 0, `${ctx}: sub value`);
    const [lo, hi] = data.BALANCE.subRanges[sub.stat];
    const r = data.RARITIES[it.rarity];
    const scale = (1 + data.BALANCE.item.subRarityScale * it.rarity) * r.rollMult;
    assert.ok(sub.value >= lo * scale - 1e-4 && sub.value <= hi * scale + 1e-4, `${ctx}: ${sub.stat} ${sub.value} in range`);
  }
}

// =========================================================================== data
console.log('data');

test('vocabulary tables match the contract', () => {
  assert.deepEqual(
    data.RARITIES.map((r) => r.id),
    ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'celestial'],
  );
  assert.deepEqual(data.RARITIES.map((r) => r.subs), [0, 1, 2, 3, 4, 4, 5]);
  assert.deepEqual(data.SLOTS, ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'belt', 'ring', 'amulet']);
  assert.deepEqual(data.ERAS.map((e) => e.from), [1, 11, 21, 31, 41, 51]);
  assert.equal(data.SUBSTATS.length, 12);
  assert.deepEqual(data.BIOMES.map((b) => b.id), ['crypt', 'fungal', 'forge', 'clockwork', 'neon', 'void']);
  assert.deepEqual(Object.keys(data.SKILLS), ['bomb', 'blades', 'warcry', 'heal', 'lightning', 'shield', 'frost', 'meteor']);
  assert.deepEqual(Object.keys(data.ALLIES), ['wolf', 'fairy', 'drone_ally', 'golem_ally']);
  assert.deepEqual(Object.keys(data.MASTERY), ['might', 'vitality', 'greed', 'fortune', 'precision', 'patience']);
  assert.deepEqual(Object.keys(data.DUNGEONS), ['dragon', 'horde', 'vault', 'mothership']);
  assert.equal(data.WAVES_PER_FLOOR, 5);
  assert.equal(data.BOSS_TIME, 30);
  assert.equal(data.DUNGEON_TIME, 45);
  assert.equal(data.MAX_CHEST_LEVEL, 20);
  assert.equal(data.MAX_KEYS, 5);
  assert.equal(data.KEY_REGEN_MS, 1800000);
  assert.deepEqual(
    Object.values(data.SKILLS).map((s) => [s.cd, s.unlock]),
    [[8, 0], [12, 10], [15, 10], [14, 15], [7, 20], [18, 20], [16, 30], [20, 40]],
  );
  assert.deepEqual(Object.values(data.ALLIES).map((a) => a.unlock), [100, 200, 400, 600]);
  assert.deepEqual(Object.values(data.DUNGEONS).map((d) => d.unlockFloor), [3, 6, 10, 20]);
});

test('every enemy referenced by biomes/dungeons exists with sane fields', () => {
  const ids = new Set();
  for (const b of data.BIOMES) {
    for (const t of b.enemies) ids.add(t);
    ids.add(b.boss);
  }
  for (const d of Object.values(data.DUNGEONS)) ids.add(d.enemy);
  for (const id of ['dragon', 'zombie', 'stone_golem', 'overlord']) ids.add(id);
  for (const id of ids) {
    const e = data.ENEMIES[id];
    assert.ok(e, 'enemy ' + id);
    for (const k of ['hpMult', 'atkMult', 'speed', 'range', 'atkSpeed', 'w', 'h']) {
      assert.ok(isFiniteNum(e[k]) && e[k] > 0, `${id}.${k}`);
    }
    assert.equal(typeof e.flying, 'boolean');
    assert.equal(typeof e.ranged, 'boolean');
    assert.equal(typeof e.boss, 'boolean');
    if (e.ranged) assert.ok(data.PROJECTILES.includes(e.projectile), `${id} projectile`);
    else assert.equal(e.projectile, null);
    if (e.boss) assert.ok(e.h >= 40 && e.h <= 64, `${id} boss height ${e.h}`);
    else assert.ok(e.h >= 16 && e.h <= 24, `${id} normal height ${e.h}`);
  }
  for (const b of data.BIOMES) assert.ok(data.ENEMIES[b.boss].boss, b.boss + ' is a boss');
  assert.ok(data.ENEMIES.bat.flying && data.ENEMIES.drone.flying && data.ENEMIES.void_eye.flying);
  for (const r of ['sporeling', 'imp', 'steam_bot', 'drone', 'void_eye']) {
    assert.ok(data.ENEMIES[r].ranged && data.ENEMIES[r].range >= 120 && data.ENEMIES[r].range <= 150, r);
  }
  const speedMult = data.BALANCE.enemy.speedMult || 1; // global pacing knob on top of per-type speeds
  for (const f of ['bat', 'spider', 'fire_hound', 'gear_rat', 'cyber_ninja']) {
    const base = data.ENEMIES[f].speed / speedMult;
    assert.ok(base >= 70 && base <= 90, f + ' fast');
  }
});

test('item names: >= 3 per slot per era', () => {
  for (const slot of data.SLOTS) {
    assert.equal(data.ITEM_NAMES[slot].length, 6, slot);
    for (const list of data.ITEM_NAMES[slot]) assert.ok(list.length >= 3, slot);
  }
});

test('rarity odds rows sum to 1 for levels 1..20 and match the anchors', () => {
  for (let L = 1; L <= 20; L++) {
    const o = data.rarityOdds(L);
    assert.equal(o.length, 7);
    const sum = o.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-12, `L${L} sums to ${sum}`);
    for (const p of o) assert.ok(p >= 0 && p <= 1);
    const po = data.premiumOdds(L);
    assert.ok(Math.abs(po.reduce((a, b) => a + b, 0) - 1) < 1e-12, `premium L${L}`);
    assert.equal(po[0], 0);
    assert.equal(po[1], 0);
  }
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  [0.8, 0.18, 0.02, 0, 0, 0, 0].forEach((p, i) => close(data.rarityOdds(1)[i], p));
  [0.04, 0.16, 0.3, 0.27, 0.15, 0.06, 0.02].forEach((p, i) => close(data.rarityOdds(20)[i], p));
  assert.equal(data.rarityOdds(5)[4], 0);
  close(data.rarityOdds(6)[4], 0.002);
  assert.equal(data.rarityOdds(10)[5], 0);
  assert.ok(data.rarityOdds(11)[5] > 0);
  assert.equal(data.rarityOdds(15)[6], 0);
  assert.ok(data.rarityOdds(16)[6] > 0);
  // Common odds fall monotonically; out-of-range levels clamp.
  for (let L = 2; L <= 20; L++) assert.ok(data.rarityOdds(L)[0] < data.rarityOdds(L - 1)[0]);
  assert.deepEqual(data.rarityOdds(0), data.rarityOdds(1));
  assert.deepEqual(data.rarityOdds(99), data.rarityOdds(20));
  assert.deepEqual(data.rarityOdds(NaN), data.rarityOdds(1));
});

test('chest upgrade cost formula', () => {
  for (let L = 1; L < 20; L++) assert.equal(data.chestUpgradeCost(L), Math.floor(400 * Math.pow(2.15, L - 1)));
});

test('rollItem produces valid items for many ilvl/chestLevel combos', () => {
  const rarityCounts = new Array(7).fill(0);
  for (const ilvl of [1, 2, 5, 10, 11, 20, 21, 35, 41, 50, 51, 120, 400, 4999]) {
    for (let cl = 1; cl <= 20; cl++) {
      for (let n = 0; n < 12; n++) {
        const it = data.rollItem({ ilvl, chestLevel: cl, premium: n % 4 === 0 });
        validateItem(it, `ilvl ${ilvl} cl ${cl}`);
        assert.equal(it.ilvl, ilvl);
        if (n % 4 === 0) assert.ok(it.rarity >= 2, 'premium is rare+');
        rarityCounts[it.rarity]++;
      }
    }
  }
  // Every rarity incl. celestial (with 5 unique subs) can be produced.
  for (let r = 0; r <= 6; r++) {
    for (const slot of data.SLOTS) validateItem(data.rollItem({ ilvl: 30, chestLevel: 1, slot, rarity: r }), `forced r${r} ${slot}`);
  }
  assert.ok(rarityCounts[0] > 0 && rarityCounts[3] > 0);
  // Garbage options never throw and still give a valid item.
  validateItem(data.rollItem(), 'no opts');
  validateItem(data.rollItem({ ilvl: NaN, chestLevel: 'x' }), 'garbage opts');
  validateItem(data.rollItem({ ilvl: -5, chestLevel: -1 }), 'negative opts');
});

test('item main stat follows base × slot × rarity × growth^(ilvl-1) (±spread)', () => {
  const spread = data.BALANCE.item.mainSpread;
  for (const slot of data.SLOTS) {
    for (const r of [0, 3, 6]) {
      for (const ilvl of [1, 15, 60]) {
        const it = data.rollItem({ ilvl, chestLevel: 1, slot, rarity: r });
        const expect = data.itemMainValue(slot, r, ilvl);
        assert.ok(it.main.value >= Math.floor(expect * (1 - spread)) - 1 && it.main.value <= Math.ceil(expect * (1 + spread)) + 1);
      }
    }
  }
  assert.equal(data.itemMainValue('weapon', 0, 1), 6);
  assert.equal(data.itemMainValue('armor', 0, 1), 60);
  const g = data.BALANCE.item.growth;
  assert.ok(Math.abs(data.itemMainValue('ring', 2, 3) - 6 * 0.5 * 1.8 * g * g) < 1e-9);
});

test('legendary+ items get an epithet; eras pick era-specific names', () => {
  for (let i = 0; i < 30; i++) {
    const it = data.rollItem({ ilvl: 55, chestLevel: 20, slot: 'weapon', rarity: 6 });
    const ep = data.EPITHETS[6].find((e) => it.name.startsWith(e + ' '));
    assert.ok(ep, 'celestial epithet: ' + it.name);
    assert.ok(data.ITEM_NAMES.weapon[5].includes(it.name.slice(ep.length + 1)), it.name);
  }
  const common = data.rollItem({ ilvl: 25, chestLevel: 1, slot: 'boots', rarity: 0 });
  assert.ok(data.ITEM_NAMES.boots[2].includes(common.name), common.name);
});

test('itemIlvl = max(1, highestFloor + randInt(-3, 1))', () => {
  for (let i = 0; i < 300; i++) {
    const a = data.itemIlvl(1);
    assert.ok(a >= 1 && a <= 2);
    const b = data.itemIlvl(30);
    assert.ok(b >= 27 && b <= 31);
  }
});

test('enemyStats/heroBaseStats/xpToNext/calcPower finite for 1..400', () => {
  const types = Object.keys(data.ENEMIES);
  for (let f = 1; f <= 400; f++) {
    for (const t of types) {
      const e = data.enemyStats(f, t, { isBoss: data.ENEMIES[t].boss });
      assertFiniteDeep(e, `enemy ${t}@${f}`);
      assert.ok(e.hp >= 1 && e.atk >= 1 && e.gold >= 1 && e.xp >= 1);
    }
    const h = data.heroBaseStats(f);
    assertFiniteDeep(h, `hero@${f}`);
    assert.ok(isFiniteNum(data.xpToNext(f)) && data.xpToNext(f) >= 1);
    const cp = data.calcPower({
      atk: h.atk * 3,
      hp: h.hp * 3,
      atkSpeed: 4,
      critChance: 1,
      critDmg: 9,
      combo: 0.75,
      counter: 0.75,
      dodge: 0.6,
      stun: 0.5,
      lifesteal: 0.5,
      regen: 0.05,
      skillDmg: 3,
      bossDmg: 3,
      goldBonus: 2,
      chestChance: 0.9,
      skillLevels: 120,
      allyLevels: 100,
    });
    assert.ok(isFiniteNum(cp) && cp > 0, `cp@${f}`);
    for (let w = 1; w <= 5; w++) {
      const comp = data.waveComposition(f, w);
      if (w < 5) assert.ok(comp.length >= 3 && comp.length <= 6, `wave size ${comp.length}`);
      else {
        assert.equal(comp[0], data.biomeForFloor(f).boss);
        assert.ok(comp.length >= 1 && comp.length <= 3);
      }
      for (const t of comp) assert.ok(data.ENEMIES[t], t);
    }
  }
  // Formula anchors.
  const e1 = data.enemyStats(1, 'skeleton', { isBoss: false });
  assert.equal(e1.hp, 40);
  assert.equal(e1.atk, 6);
  assert.equal(e1.gold, 4);
  assert.equal(e1.xp, 3);
  const b1 = data.enemyStats(1, 'skeleton', { isBoss: true });
  assert.equal(b1.hp, 400);
  assert.equal(b1.atk, 15);
  assert.equal(b1.gold, 60);
  assert.equal(b1.xp, 30);
  assert.deepEqual(data.heroBaseStats(1), { atk: data.BALANCE.hero.atk, hp: data.BALANCE.hero.hp });
  assert.equal(data.xpToNext(1), 30);
  assert.equal(data.xpToNext(2), Math.floor(30 * 1.2));
  assert.equal(data.biomeForFloor(1).id, 'crypt');
  assert.equal(data.biomeForFloor(10).id, 'crypt');
  assert.equal(data.biomeForFloor(11).id, 'fungal');
  assert.equal(data.biomeForFloor(61).id, 'crypt');
  // Garbage inputs.
  assertFiniteDeep(data.enemyStats(NaN, 'nope', null), 'garbage enemy');
  assertFiniteDeep(data.enemyStats(1e9, 'skeleton', { isBoss: true }), 'huge floor');
  assert.equal(data.calcPower(null), 0);
  assert.equal(data.calcPower({ atk: NaN, hp: undefined }), 0);
  // Deterministic composition.
  assert.deepEqual(data.waveComposition(17, 3), data.waveComposition(17, 3));
});

test('calcPower grows with every stat', () => {
  const base = {
    atk: 100,
    hp: 1000,
    atkSpeed: 1,
    critChance: 0.1,
    critDmg: 1.5,
    combo: 0,
    counter: 0,
    dodge: 0,
    stun: 0,
    lifesteal: 0,
    regen: 0,
    skillDmg: 0,
    bossDmg: 0,
    goldBonus: 0,
    chestChance: 0.3,
    skillLevels: 1,
    allyLevels: 0,
  };
  const p0 = data.calcPower(base);
  const bumps = { atk: 10, hp: 100, atkSpeed: 0.1, critChance: 0.05, critDmg: 0.2, combo: 0.05, counter: 0.05, dodge: 0.05, stun: 0.05, lifesteal: 0.05, regen: 0.01, skillDmg: 0.1, bossDmg: 0.1, skillLevels: 1, allyLevels: 1 };
  for (const [k, d] of Object.entries(bumps)) {
    assert.ok(data.calcPower(Object.assign({}, base, { [k]: base[k] + d })) > p0, 'CP grows with ' + k);
  }
});

test('sell value, skill/ally/mastery formulas and descriptions', () => {
  assert.equal(data.itemSellValue({ ilvl: 1, rarity: 0 }), 4);
  assert.equal(data.itemSellValue({ ilvl: 11, rarity: 2 }), Math.floor(4 * Math.pow(1.1, 10) * 9));
  assert.equal(data.itemSellValue(null), 0);
  for (let L = 1; L < 30; L++) assert.equal(data.skillUpgradeCost(L), Math.ceil(2 + L * 1.5));
  for (let L = 1; L < 50; L++) assert.equal(data.allyUpgradeCost(L), Math.floor(500 * Math.pow(1.5, L - 1)));
  assert.equal(data.masteryCost('might', 0), 10);
  assert.equal(data.masteryCost('might', 5), 40);
  assert.equal(data.masteryCost('greed', 3), 50);
  assert.equal(data.masteryCost('fortune', 30), Infinity);
  assert.ok(Math.abs(data.skillParams('bomb', 1).dmg - 3) < 1e-9);
  assert.ok(Math.abs(data.skillParams('bomb', 2).dmg - 3.3) < 1e-9);
  assert.equal(data.skillParams('lightning', 4).targets, 3);
  assert.equal(data.skillParams('lightning', 5).targets, 4);
  assert.ok(Math.abs(data.skillParams('frost', 3).freeze - 2.6) < 1e-9);
  assert.equal(data.allyParams('golem_ally', 1).radius, 90);
  for (const id of Object.keys(data.SKILLS)) {
    for (const L of [1, 7, 30]) {
      const p = data.skillParams(id, L);
      assertFiniteDeep(p, id);
      const d = data.skillDesc(id, L);
      assert.ok(d.length > 10 && !/NaN|undefined/.test(d), d);
    }
  }
  for (const id of Object.keys(data.ALLIES)) {
    assertFiniteDeep(data.allyParams(id, 25), id);
    const d = data.allyDesc(id, 3);
    assert.ok(d.length > 10 && !/NaN|undefined/.test(d), d);
  }
  for (const id of Object.keys(data.MASTERY)) {
    const d = data.masteryDesc(id, 4);
    assert.ok(d.length > 3 && !/NaN|undefined/.test(d), d);
  }
  for (const id of Object.keys(data.DUNGEONS)) {
    const d = data.dungeonDesc(id);
    assert.ok(d.length > 10 && !/NaN|undefined/.test(d), d);
    for (const L of [1, 5, 50]) assertFiniteDeep(data.dungeonRewards(id, L), id);
  }
  assert.deepEqual(data.dungeonRewards('dragon', 3), { scrolls: 22 });
  assert.deepEqual(data.dungeonRewards('horde', 2), { gems: 80 });
  assert.deepEqual(data.dungeonRewards('vault', 5), { premiumChests: 4 });
  assert.equal(data.dungeonRewards('mothership', 1).scrolls, 4);
  assert.equal(data.dungeonFloor(1), 5);
});

test('quest table: ~25 tutorial steps then endless +5 floor chain', () => {
  assert.ok(data.QUESTS.length >= 22 && data.QUESTS.length <= 32);
  const ids = new Set(data.QUESTS.map((q) => q.id));
  assert.equal(ids.size, data.QUESTS.length, 'unique ids');
  const a = data.questAt(data.QUESTS.length);
  const b = data.questAt(data.QUESTS.length + 1);
  assert.equal(a.type, 'floor');
  assert.equal(b.target - a.target, 5);
  assert.ok(data.questAt(5000).reward.gems > 0);
  for (let i = 0; i < data.QUESTS.length + 20; i++) {
    const q = data.questAt(i);
    assert.ok(q.text && q.target > 0 && data.rewardText(q.reward).length > 0, 'quest ' + i);
  }
});

// =========================================================================== state
console.log('state');

test('new game matches the contract', () => {
  const s = fresh();
  assert.equal(s.version, 1);
  assert.equal(s.chests, 10);
  assert.equal(s.keys, 3);
  assert.equal(s.gold, 0);
  assert.equal(s.chestLevel, 1);
  assert.equal(s.autoOpen, false);
  assert.ok(s.keyRegenAt > Date.now() + data.KEY_REGEN_MS - 5000);
  assert.equal(s.equipped.weapon.name, 'Rusty Sword');
  assert.equal(s.equipped.weapon.rarity, 0);
  assert.equal(s.equipped.weapon.ilvl, 1);
  assert.deepEqual(s.skills, { owned: { bomb: 1 }, equipped: ['bomb', null, null, null] });
  assert.deepEqual(s.allies, { owned: {}, equipped: [null, null] });
  assert.deepEqual(s.campaign, { floor: 1, wave: 1, highestFloor: 1, farming: false });
  assert.equal(s.stats.bestItemRarity, -1);
  assert.deepEqual(s.settings.autoLoot.sell, [true, true, false, false, false, false, false]);
  const st = state.getHeroStats();
  assertFiniteDeep(st, 'stats');
  assert.equal(st.atk, data.BALANCE.hero.atk + 6); // base ATK + Rusty Sword
  assert.equal(st.hp, 100);
  assert.equal(st.atkSpeed, 1);
  assert.equal(st.critChance, 0.05);
  assert.equal(st.critDmg, 1.5);
  assert.equal(st.chestChance, 0.3);
  assert.ok(state.getPower() > 0);
  assert.equal(state.xpToNext(), 30);
});

test('getHeroStats is memoized, returns copies and applies mastery + caps', () => {
  const s = fresh();
  const a = state.getHeroStats();
  a.atk = 999999;
  const atk0 = data.BALANCE.hero.atk + 6; // base ATK + Rusty Sword
  assert.equal(state.getHeroStats().atk, atk0, 'callers cannot corrupt the cache');
  s.mastery.might = 10;
  s.mastery.fortune = 30;
  s.mastery.precision = 4;
  s.mastery.greed = 2;
  s.gems = 1000;
  assert.ok(state.upgradeMastery('vitality'));
  const st = state.getHeroStats();
  assert.equal(st.atk, Math.round(atk0 * 1.6));
  assert.equal(st.hp, Math.round(100 * 1.06));
  assert.ok(Math.abs(st.chestChance - 0.6) < 1e-9);
  assert.ok(Math.abs(st.critDmg - 1.7) < 1e-9);
  assert.ok(Math.abs(st.goldBonus - 0.16) < 1e-9);
  // Caps: stack absurd substats via a fake equipped ring.
  s.equipped.ring = {
    id: 'x',
    slot: 'ring',
    rarity: 6,
    ilvl: 1,
    era: 0,
    name: 'Test',
    main: { stat: 'atk', value: 1 },
    subs: data.SUBSTATS.map((k) => ({ stat: k, value: 50 })),
  };
  assert.ok(state.upgradeMastery('vitality'));
  const c = state.getHeroStats();
  assert.equal(c.atkSpeed, 4);
  assert.equal(c.critChance, 1);
  assert.equal(c.combo, 0.75);
  assert.equal(c.counter, 0.75);
  assert.equal(c.dodge, 0.6);
  assert.equal(c.stun, 0.5);
  assert.equal(c.lifesteal, 0.5);
  assert.equal(c.regen, 0.05);
  assertFiniteDeep(c, 'capped');
});

test('manual openChest always returns pending; blocks while pending; no chests → null', () => {
  const s = fresh();
  const r = state.openChest();
  assert.equal(r.decision, 'pending');
  validateItem(r.item, 'opened');
  assert.equal(s.pendingItem, r.item);
  assert.equal(s.chests, 9);
  assert.equal(s.stats.chestsOpened, 1);
  assert.ok(s.stats.bestItemRarity >= 0);
  assert.equal(count('chest:opened'), 1);
  assert.ok(count('state:changed') >= 1);
  assert.equal(state.openChest(), null, 'blocked by pending item');
  assert.equal(s.chests, 9);
  state.sellPending();
  s.chests = 0;
  assert.equal(state.openChest(), null, 'no chests');
  assert.equal(state.openChest({ premium: true }), null, 'no premium chests');
  s.premiumChests = 2;
  const p = state.openChest({ premium: true });
  assert.ok(p.item.rarity >= 2);
  assert.equal(s.premiumChests, 1);
});

test('equipPending equips, auto-sells old item, updates stats and emits events', () => {
  const s = fresh();
  const old = s.equipped.weapon;
  const it = data.rollItem({ ilvl: 5, chestLevel: 1, slot: 'weapon', rarity: 3 });
  s.pendingItem = it;
  const cmp = state.comparePending();
  assert.equal(cmp.current, old);
  assert.ok(cmp.delta > 0 && cmp.powerAfter > cmp.powerBefore);
  assert.equal(cmp.lines[0].stat, 'atk');
  assert.equal(cmp.lines[0].before, 6);
  assert.equal(cmp.lines[0].after, it.main.value);
  assert.equal(cmp.lines.length, 1 + it.subs.length);
  for (const l of cmp.lines.slice(1)) {
    assert.equal(l.fmt, 'pct');
    assert.equal(l.before, 0);
    assert.ok(typeof l.label === 'string' && l.label.length);
  }
  clearEvents();
  const gold0 = s.gold;
  const cp0 = state.getPower();
  assert.ok(state.equipPending());
  assert.equal(s.equipped.weapon, it);
  assert.equal(s.pendingItem, null);
  assert.ok(s.gold > gold0, 'old item sold');
  assert.equal(s.gold - gold0, state.itemSellValue(old));
  assert.ok(state.getPower() > cp0);
  assert.equal(count('item:equipped'), 1);
  assert.equal(events.find((e) => e.evt === 'item:equipped').p.old, old);
  assert.equal(count('item:sold'), 1);
  assert.ok(count('stats:changed') >= 1);
  assert.equal(s.stats.itemsEquipped, 1);
  assert.equal(state.equipPending(), false, 'nothing pending');
  assert.equal(state.sellPending(), false, 'nothing pending');
  // Sell flow
  s.pendingItem = data.rollItem({ ilvl: 3, chestLevel: 1, slot: 'ring', rarity: 2 });
  const val = state.itemSellValue(s.pendingItem);
  const g = s.gold;
  assert.ok(state.sellPending());
  assert.equal(s.gold, g + val);
  assert.equal(s.pendingItem, null);
  assert.equal(s.equipped.ring, null);
  // compare on empty slot / garbage
  const cmpEmpty = state.compareItem(data.rollItem({ ilvl: 3, chestLevel: 1, slot: 'amulet', rarity: 1 }));
  assert.equal(cmpEmpty.current, null);
  assert.ok(cmpEmpty.delta > 0);
  const bad = state.compareItem({ slot: 'nope' });
  assert.equal(bad.delta, 0);
  assert.deepEqual(bad.lines, []);
  assert.equal(state.comparePending(), null);
});

test('auto-open decisions follow the contract', () => {
  const s = fresh();
  s.chests = 100;
  const al = s.settings.autoLoot;
  // Make items deterministic by stubbing rollItem.
  const realRoll = data.rollItem;
  let next = null;
  data.rollItem = () => next;
  try {
    s.autoOpen = true;
    // 1) Upgrade + autoEquip → equipped
    next = realRoll({ ilvl: 10, chestLevel: 1, slot: 'helmet', rarity: 2 });
    let r = state.openChest();
    assert.equal(r.decision, 'equipped');
    assert.equal(s.equipped.helmet, next);
    assert.equal(s.autoOpen, true);
    // 2) Upgrade + autoEquip off → pending (auto-open stays on and waits)
    al.autoEquip = false;
    next = realRoll({ ilvl: 10, chestLevel: 1, slot: 'boots', rarity: 1 });
    r = state.openChest();
    assert.equal(r.decision, 'pending');
    assert.equal(s.pendingItem, next);
    state.sellPending();
    al.autoEquip = true;
    // 3) Not an upgrade + sell[rarity] → sold
    const goldBefore = s.gold;
    next = realRoll({ ilvl: 1, chestLevel: 1, slot: 'helmet', rarity: 0 });
    r = state.openChest();
    assert.equal(r.decision, 'sold');
    assert.ok(s.gold > goldBefore);
    assert.equal(s.autoOpen, true);
    // 4) Not an upgrade, not sold, rarity >= stopRarity → pending + autoOpen off
    al.stopRarity = 3;
    const weak = data.createItem({ slot: 'helmet', rarity: 3, ilvl: 1, mainRoll: 0.01, subs: [] });
    next = weak;
    r = state.openChest();
    assert.ok(state.compareItem(weak).delta <= 0 || r.decision === 'equipped');
    if (r.decision !== 'equipped') {
      assert.equal(r.decision, 'pending');
      assert.equal(s.autoOpen, false);
    }
    state.sellPending();
    // 5) Not an upgrade, not sold, below stopRarity → pending + autoOpen off
    s.autoOpen = true;
    al.stopRarity = 6;
    next = data.createItem({ slot: 'helmet', rarity: 2, ilvl: 1, mainRoll: 0.01, subs: [] });
    r = state.openChest();
    assert.equal(r.decision, 'pending');
    assert.equal(s.autoOpen, false);
    state.sellPending();
    // Manual open (autoOpen false) is always pending even for upgrades
    next = realRoll({ ilvl: 50, chestLevel: 1, slot: 'gloves', rarity: 5 });
    r = state.openChest();
    assert.equal(r.decision, 'pending');
  } finally {
    data.rollItem = realRoll;
  }
});

test('tick drives auto-open at 0.3 s cadence and stops when out of chests', () => {
  const s = fresh();
  s.chests = 5;
  s.settings.autoLoot.sell = [true, true, true, true, true, true, true];
  s.settings.autoLoot.stopRarity = 7;
  assert.ok(state.setAutoOpen(true));
  assert.equal(s.stats.autoOpenUsed, 1);
  let guard = 0;
  while (s.chests > 0 && guard++ < 200) {
    state.tick(0.1);
    if (s.pendingItem) state.sellPending();
  }
  assert.equal(s.chests, 0);
  assert.ok(guard >= 10 && guard <= 20, 'about one chest per 0.3s, took ' + guard + ' ticks');
  for (let i = 0; i < 5; i++) state.tick(0.1);
  assert.equal(s.autoOpen, false, 'auto-open turns off when empty');
  assert.equal(state.setAutoOpen(true), false, 'cannot enable with no chests');
  assert.ok(toasts.some((t) => t.kind === 'bad'));
});

test('chest level upgrade: insufficient then sufficient gold', () => {
  const s = fresh();
  assert.equal(state.chestUpgradeCost(), 400);
  clearEvents();
  assert.equal(state.upgradeChestLevel(), false);
  assert.equal(s.chestLevel, 1);
  assert.ok(toasts.some((t) => t.kind === 'bad' && /gold/i.test(t.text)));
  s.gold = 1000;
  assert.ok(state.upgradeChestLevel());
  assert.equal(s.chestLevel, 2);
  assert.equal(s.gold, 600);
  assert.equal(count('purchase'), 1);
  assert.ok(toasts.some((t) => /Chest level 2/.test(t.text)));
  assert.deepEqual(state.rarityOdds(), data.rarityOdds(2));
  s.chestLevel = 20;
  assert.equal(state.chestUpgradeCost(), Infinity);
  s.gold = 1e30;
  assert.equal(state.upgradeChestLevel(), false);
});

test('skills: unlock/upgrade/equip with insufficient and sufficient scrolls', () => {
  const s = fresh();
  assert.equal(state.skillSlotsUnlocked(), 1);
  assert.deepEqual(state.skillCost('blades'), { unlock: 10 });
  assert.deepEqual(state.skillCost('bomb'), { upgrade: 4 });
  clearEvents();
  assert.equal(state.unlockSkill('blades'), false);
  assert.ok(toasts.some((t) => t.kind === 'bad'));
  s.scrolls = 100;
  assert.ok(state.unlockSkill('blades'));
  assert.equal(s.scrolls, 90);
  assert.equal(s.skills.owned.blades, 1);
  assert.deepEqual(s.skills.equipped, ['bomb', null, null, null], 'slot 2 still locked');
  assert.equal(state.unlockSkill('blades'), false, 'already owned');
  assert.equal(state.equipSkill('blades', 1), false, 'slot locked');
  assert.ok(state.equipSkill('blades', 0));
  assert.deepEqual(s.skills.equipped, ['blades', null, null, null]);
  s.campaign.highestFloor = 12;
  assert.equal(state.skillSlotsUnlocked(), 3);
  assert.ok(state.equipSkill('bomb', 2));
  assert.ok(state.equipSkill('bomb', 0), 'swap');
  assert.deepEqual(s.skills.equipped, ['bomb', null, 'blades', null]);
  s.hero.level = 60;
  state.invalidate();
  const cp = state.getPower();
  assert.ok(state.upgradeSkill('bomb'));
  assert.equal(s.skills.owned.bomb, 2);
  assert.equal(s.scrolls, 90 - 4);
  assert.ok(state.getPower() > cp, 'skill level moves CP');
  assert.equal(state.upgradeSkill('meteor'), false, 'not owned');
  assert.ok(state.unequipSkill(2));
  assert.equal(state.unequipSkill(2), false);
  s.scrolls = 0;
  assert.equal(state.upgradeSkill('bomb'), false);
  s.skills.owned.bomb = 30;
  assert.deepEqual(state.skillCost('bomb'), {});
  s.scrolls = 1000;
  assert.equal(state.upgradeSkill('bomb'), false, 'max level');
  assert.equal(state.unlockSkill('nope'), false);
  assert.ok(count('purchase') >= 2);
});

test('allies: unlock/upgrade/equip with insufficient and sufficient currency', () => {
  const s = fresh();
  assert.equal(state.allySlotsUnlocked(), 0);
  assert.equal(state.unlockAlly('wolf'), false);
  s.gems = 150;
  s.campaign.highestFloor = 4;
  assert.equal(state.allySlotsUnlocked(), 1);
  assert.ok(state.unlockAlly('wolf'));
  assert.equal(s.gems, 50);
  assert.deepEqual(s.allies.equipped, ['wolf', null], 'auto-equipped into the free slot');
  assert.equal(state.allyUpgradeCost('wolf'), 500);
  assert.deepEqual(state.allyCost('fairy'), { unlock: 200 });
  assert.equal(state.upgradeAlly('wolf'), false, 'no gold');
  s.gold = 500;
  const cp = state.getPower();
  assert.ok(state.upgradeAlly('wolf'));
  assert.equal(s.allies.owned.wolf, 2);
  assert.equal(s.gold, 0);
  assert.ok(state.getPower() > cp, 'ally level moves CP');
  assert.equal(state.allyUpgradeCost('wolf'), Math.floor(500 * 1.5));
  assert.equal(state.equipAlly('wolf', 1), false, 'slot 2 locked');
  s.gems = 1000;
  assert.ok(state.unlockAlly('fairy'));
  assert.deepEqual(s.allies.equipped, ['wolf', null]);
  s.campaign.highestFloor = 20;
  assert.ok(state.equipAlly('fairy', 1));
  assert.ok(state.equipAlly('fairy', 0), 'swap');
  assert.deepEqual(s.allies.equipped, ['fairy', 'wolf']);
  assert.ok(state.unequipAlly(1));
  assert.deepEqual(s.allies.equipped, ['fairy', null]);
  assert.equal(state.upgradeAlly('drone_ally'), false, 'not owned');
  s.allies.owned.wolf = 50;
  assert.equal(state.allyUpgradeCost('wolf'), Infinity);
});

test('mastery: insufficient then sufficient gems, max level', () => {
  const s = fresh();
  assert.equal(state.masteryCost('might'), 10);
  assert.equal(state.upgradeMastery('might'), false);
  s.gems = 26;
  const atk0 = state.getHeroStats().atk;
  assert.ok(state.upgradeMastery('might'));
  assert.equal(s.gems, 16);
  assert.equal(s.mastery.might, 1);
  assert.ok(state.getHeroStats().atk > atk0);
  assert.equal(state.masteryCost('might'), 16);
  assert.ok(state.upgradeMastery('might'));
  assert.equal(s.gems, 0);
  assert.equal(state.upgradeMastery('might'), false);
  s.mastery.patience = 16;
  s.gems = 1e6;
  assert.equal(state.upgradeMastery('patience'), false);
  assert.equal(state.masteryCost('patience'), Infinity);
});

test('currencies: add/spend/useKey and key regen', () => {
  const s = fresh();
  state.addGold(100);
  state.addGems(5);
  state.addChests(2);
  state.addScrolls(3);
  assert.equal(s.gold, 100);
  assert.equal(s.gems, 5);
  assert.equal(s.chests, 12);
  assert.equal(s.scrolls, 3);
  state.addGold(NaN);
  state.addGold(-50);
  assert.equal(s.gold, 100);
  assert.equal(state.spend('gold', 150), false);
  assert.ok(state.spend('gold', 40));
  assert.equal(s.gold, 60);
  assert.equal(state.spend('rubies', 1), false);
  assert.equal(state.spend('gold', NaN), false);
  // keys
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    s.keys = 5;
    state.tick(0.016);
    assert.equal(s.keyRegenAt, 0, 'full keys → no timer');
    assert.ok(state.useKey());
    assert.equal(s.keys, 4);
    assert.ok(Math.abs(s.keyRegenAt - (now + data.KEY_REGEN_MS)) < 5);
    now += data.KEY_REGEN_MS + 1000;
    state.tick(0.016);
    assert.equal(s.keys, 5);
    assert.equal(s.keyRegenAt, 0);
    s.keys = 0;
    state.tick(0.016);
    assert.equal(state.useKey(), false);
    now += data.KEY_REGEN_MS * 2 + 10;
    state.tick(0.016);
    assert.equal(s.keys, 2);
    assert.ok(state.keyRegenRemaining() > 0 && state.keyRegenRemaining() <= data.KEY_REGEN_MS / 1000);
    state.addKeys(10);
    assert.equal(s.keys, 12, 'rewards may exceed the regen cap');
    assert.equal(s.keyRegenAt, 0);
  } finally {
    Date.now = realNow;
  }
});

test('xp and level-ups emit levelup + stats:changed', () => {
  const s = fresh();
  state.addXp(29);
  assert.equal(s.hero.level, 1);
  clearEvents();
  state.addXp(1);
  assert.equal(s.hero.level, 2);
  assert.equal(s.hero.xp, 0);
  assert.equal(count('levelup'), 1);
  assert.ok(count('stats:changed') >= 1);
  state.addXp(1e7);
  assert.ok(s.hero.level > 20);
  assertFiniteDeep(state.getHeroStats(), 'after many levels');
  assert.equal(count('levelup'), 2, 'one event per addXp call');
});

test('battle callbacks: grantKill, onFloorCleared, waves, deaths, flying chest, dungeons', () => {
  const s = fresh();
  let chests = 0;
  for (let i = 0; i < 400; i++) {
    const es = data.enemyStats(1, 'skeleton', { isBoss: false });
    const r = state.grantKill({ floor: 1, isBoss: false, typeId: 'skeleton', gold: es.gold, xp: es.xp });
    assert.equal(r.gold, 4);
    assert.equal(r.xp, 3);
    if (r.chest) chests++;
  }
  assert.ok(chests > 70 && chests < 170, 'chest drop ≈ 30%: ' + chests);
  assert.equal(s.stats.kills, 400);
  const rb = state.grantKill({ floor: 1, isBoss: true, typeId: 'lich' });
  assert.equal(rb.chest, true);
  assert.equal(rb.gold, data.enemyStats(1, 'lich', { isBoss: true }).gold);
  assert.equal(s.stats.bossKills, 1);
  assertFiniteDeep(state.grantKill({}), 'empty info');
  assertFiniteDeep(state.grantKill(null), 'null info');

  clearEvents();
  const c0 = s.chests;
  const rw = state.onFloorCleared(1);
  assert.deepEqual(Object.keys(rw).sort(), ['chests', 'gems', 'gold']);
  assert.equal(rw.chests, 3);
  assert.equal(rw.gems, 4);
  assert.equal(rw.gold, 20 * 4);
  assert.equal(s.chests, c0 + 3);
  assert.deepEqual(s.campaign, { floor: 2, wave: 1, highestFloor: 2, farming: false });
  for (let f = 2; f < 10; f++) state.onFloorCleared(f);
  assert.equal(s.campaign.highestFloor, 10);
  assert.ok(toasts.some((t) => /Dragon's Lair unlocked/.test(t.text)));
  assert.ok(toasts.some((t) => /Skill slot 2 unlocked/.test(t.text)));
  assert.ok(toasts.some((t) => /Ally slot 1 unlocked/.test(t.text)));
  const g5 = state.onFloorCleared(10).gems;
  assert.equal(g5, 25);
  assert.equal(state.onFloorCleared(15).gems, 10);

  state.setWave(3);
  assert.equal(s.campaign.wave, 3);
  state.setWave(99);
  assert.equal(s.campaign.wave, 5);
  state.setFarming(true);
  assert.equal(s.campaign.farming, true);
  state.onHeroDied();
  assert.equal(s.stats.deaths, 1);

  const types = new Set();
  for (let i = 0; i < 300; i++) {
    const before = { gems: s.gems, chests: s.chests, gold: s.gold, scrolls: s.scrolls, keys: s.keys };
    const r = state.grantFlyingChest();
    types.add(r.type);
    assert.ok(['gems', 'chests', 'gold', 'key', 'scrolls'].includes(r.type));
    assert.ok(isFiniteNum(r.amount) && r.amount > 0);
    assert.ok(typeof r.label === 'string' && r.label.startsWith('+'));
    const field = r.type === 'key' ? 'keys' : r.type;
    assert.equal(s[field] - before[field], r.amount);
    if (r.type === 'gems') assert.ok(r.amount >= 20 && r.amount <= 40);
    if (r.type === 'chests') assert.ok(r.amount >= 6 && r.amount <= 15);
    if (r.type === 'scrolls') assert.ok(r.amount >= 4 && r.amount <= 10);
    if (r.type === 'key') assert.equal(r.amount, 1);
  }
  assert.equal(types.size, 5);
  assert.equal(s.stats.flyingChests, 300);

  const sc = s.scrolls;
  const dr = state.grantDungeonWin('dragon');
  assert.deepEqual(dr, { scrolls: 14 });
  assert.equal(s.scrolls, sc + 14);
  assert.equal(s.dungeons.dragon.level, 2);
  assert.deepEqual(state.grantDungeonWin('dragon'), { scrolls: 18 });
  const pc = s.premiumChests;
  assert.deepEqual(state.grantDungeonWin('vault'), { premiumChests: 2 });
  assert.equal(s.premiumChests, pc + 2);
  const ms = state.grantDungeonWin('mothership');
  assert.ok(ms.gold > 0 && ms.scrolls === 4);
  assert.equal(state.grantDungeonWin('horde').gems, 60);
  assert.deepEqual(state.grantDungeonWin('nope'), {});
  assert.equal(s.stats.dungeonsWon, 5);
  assert.ok(state.dungeonUnlocked('vault'));
  assert.ok(!state.dungeonUnlocked('mothership'));
});

test('serialize/deserialize round-trip', () => {
  const s = fresh();
  s.gold = 12345;
  s.gems = 77;
  s.chestLevel = 7;
  s.campaign.floor = 14;
  s.campaign.highestFloor = 14;
  s.mastery.might = 3;
  s.equipped.helmet = data.rollItem({ ilvl: 12, chestLevel: 20, slot: 'helmet', rarity: 6 });
  s.equipped.helmet.name = 'Ünïcödé Crown ★ 王冠';
  s.pendingItem = data.rollItem({ ilvl: 13, chestLevel: 5 });
  s.settings.autoLoot.sell[2] = true;
  s.quest.index = 4;
  s.quest.claimedIds = ['q_open1', 'q_equip1'];
  const json = state.serialize();
  const snapshot = JSON.parse(json);
  state.reset();
  assert.notEqual(state.s.gold, 12345);
  clearEvents();
  assert.ok(state.deserialize(json));
  assert.deepEqual(JSON.parse(state.serialize()), snapshot);
  assert.ok(count('state:changed') >= 1 && count('stats:changed') >= 1);
  // export/import code with unicode
  const code = state.exportCode();
  assert.ok(/^[A-Za-z0-9+/=]+$/.test(code));
  state.reset();
  assert.ok(state.importCode(code));
  assert.equal(state.s.equipped.helmet.name, 'Ünïcödé Crown ★ 王冠');
  assert.equal(state.s.gold, 12345);
  assert.ok(state.importCode('  ' + code.slice(0, 40) + '\n' + code.slice(40) + '  '), 'whitespace tolerated');
  assert.equal(state.importCode('not base64 at all!!'), false);
  assert.equal(state.importCode(''), false);
  assert.equal(state.importCode(Buffer.from('{"nope":1}').toString('base64')), false);
  assert.equal(state.s.gold, 12345, 'failed import leaves state untouched');
});

test('deserialize: garbage input is rejected without throwing', () => {
  fresh();
  state.s.gold = 4242;
  const garbage = [
    '',
    'null',
    '[]',
    '42',
    '"str"',
    '{',
    '{}',
    'true',
    '{"foo":1}',
    undefined,
    null,
    123,
    {},
    'x'.repeat(100),
  ];
  for (const g of garbage) assert.equal(state.deserialize(g), false, 'rejects ' + String(g).slice(0, 20));
  assert.equal(state.s.gold, 4242);
});

test('deserialize: partial / old / corrupted-field saves merge onto defaults', () => {
  fresh();
  assert.ok(state.deserialize('{"version":1}'));
  let s = state.s;
  assert.equal(s.chests, 10);
  assert.equal(s.equipped.weapon.name, 'Rusty Sword', 'missing gear → starter weapon');
  assert.deepEqual(s.skills.equipped, ['bomb', null, null, null]);
  assertFiniteDeep(state.getHeroStats(), 'partial');

  const weird = {
    version: 1,
    hero: { level: 'seven', xp: -5 },
    gold: 'lots',
    gems: -10,
    keys: 2,
    chests: 3.7,
    chestLevel: 99,
    equipped: {
      weapon: { slot: 'helmet', rarity: 2 },
      helmet: { slot: 'helmet', rarity: 9, ilvl: -3, main: { value: NaN }, subs: [{ stat: 'dodge', value: 0.02 }, { stat: 'dodge', value: 0.5 }, { stat: 'evil', value: 1 }, 'x'] },
      armor: 'nope',
    },
    pendingItem: { slot: 'boots', ilvl: 7, rarity: 1, name: 42 },
    campaign: { floor: 0, wave: 17, highestFloor: -2, farming: 'yes' },
    skills: { owned: { bomb: 50, meteor: 2, fake: 3 }, equipped: ['meteor', 'meteor', 'fake', 'bomb'] },
    allies: { owned: { wolf: 3 }, equipped: ['wolf', 'wolf'] },
    mastery: { might: 1000, greed: -3 },
    dungeons: { dragon: { level: 0 }, horde: 'x' },
    keyRegenAt: 'soon',
    quest: { index: -4, claimedIds: ['a', 5, null] },
    stats: { kills: NaN, bestItemRarity: 42 },
    settings: { speed: 7, sound: 'loud', autoLoot: { sell: [false, 'x'], stopRarity: -2 } },
    autoOpen: 1,
    extraJunk: { a: 1 },
  };
  assert.ok(state.deserialize(JSON.stringify(weird)));
  s = state.s;
  assert.equal(s.hero.level, 1);
  assert.equal(s.hero.xp, 0);
  assert.equal(s.gold, 0);
  assert.equal(s.gems, 0);
  assert.equal(s.chests, 3);
  assert.equal(s.chestLevel, 20);
  assert.equal(s.equipped.weapon, null, 'wrong-slot item dropped');
  assert.equal(s.equipped.helmet.rarity, 6);
  assert.equal(s.equipped.helmet.ilvl, 1);
  assert.ok(s.equipped.helmet.main.value >= 1);
  assert.deepEqual(s.equipped.helmet.subs, [{ stat: 'dodge', value: 0.02 }]);
  assert.equal(s.equipped.armor, null);
  assert.equal(s.pendingItem.slot, 'boots');
  assert.ok(typeof s.pendingItem.name === 'string' && s.pendingItem.name.length);
  assert.deepEqual(s.campaign, { floor: 1, wave: 5, highestFloor: 1, farming: false });
  assert.deepEqual(s.skills.owned, { bomb: 30, meteor: 2 });
  assert.deepEqual(s.skills.equipped, ['meteor', null, null, null], 'locked/duplicate/unknown slots cleared');
  assert.deepEqual(s.allies.equipped, [null, null], 'ally slots locked at floor 1');
  assert.equal(s.mastery.might, 100);
  assert.equal(s.mastery.greed, 0);
  assert.equal(s.dungeons.dragon.level, 1);
  assert.equal(s.dungeons.horde.level, 1);
  assert.ok(s.keyRegenAt > Date.now());
  assert.equal(s.quest.index, 0);
  assert.deepEqual(s.quest.claimedIds, ['a']);
  assert.equal(s.stats.kills, 0);
  assert.equal(s.stats.bestItemRarity, 6);
  assert.equal(s.settings.speed, 1);
  assert.equal(s.settings.sound, true);
  assert.deepEqual(s.settings.autoLoot.sell, [false, true, false, false, false, false, false]);
  assert.equal(s.settings.autoLoot.stopRarity, 0);
  assert.equal(s.autoOpen, false);
  assert.ok(!('extraJunk' in s));
  assertFiniteDeep(s, 'weird save');
  assertFiniteDeep(state.getHeroStats(), 'weird stats');
  assert.ok(state.getPower() > 0);
});

test('localStorage persistence: save/load/reset/corrupt save', () => {
  fresh();
  state.s.gold = 999;
  assert.ok(state.save());
  assert.ok(store.has('dungeon-dash-save-v1'));
  state.s.gold = 1;
  assert.ok(state.load());
  assert.equal(state.s.gold, 999);
  store.set('dungeon-dash-save-v1', '{corrupt!!');
  assert.equal(state.load(), false);
  assert.equal(state.s.gold, 0, 'corrupt save → new game');
  assert.equal(store.get('dungeon-dash-save-v1-backup'), '{corrupt!!', 'corrupt save backed up');
  state.save();
  clearEvents();
  state.reset();
  assert.ok(!store.has('dungeon-dash-save-v1'));
  assert.equal(count('state:reset'), 1);
  // Autosave every 15 s from tick
  state.s.gold = 31337;
  for (let i = 0; i < 16; i++) state.tick(1);
  assert.equal(JSON.parse(store.get('dungeon-dash-save-v1')).gold, 31337);
  // Throwing storage is tolerated.
  const saved = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
    removeItem() {
      throw new Error('blocked');
    },
  };
  try {
    assert.equal(state.save(), false);
    assert.equal(state.load(), false);
    state.reset();
  } finally {
    globalThis.localStorage = saved;
  }
});

test('collectOffline: 30 s → null, 2 h sane, 48 h capped, keys regen', () => {
  const s = fresh();
  const t0 = 1_800_000_000_000;
  s.lastSeen = t0;
  assert.equal(state.collectOffline(t0 + 30_000), null);
  assert.equal(s.lastSeen, t0, 'not consumed');
  // 2 hours
  const inc = state.estimateIncome();
  assert.ok(inc.killsPerSec > 0 && inc.killsPerSec <= 1.2);
  const gold0 = s.gold;
  const chests0 = s.chests;
  const r2 = state.collectOffline(t0 + 2 * 3600_000);
  assert.ok(r2);
  assertFiniteDeep(r2, 'offline 2h');
  assert.equal(r2.seconds, 7200);
  assert.equal(r2.cappedSeconds, 7200);
  assert.ok(r2.gold > 0 && r2.chests > 0 && r2.xp > 0);
  assert.ok(Math.abs(r2.gold - Math.floor(inc.goldPerSec * 7200 * 0.75)) <= 1);
  assert.equal(s.gold - gold0, r2.gold);
  assert.equal(s.chests - chests0, r2.chests);
  assert.ok(r2.chests <= 7200 * 1.2 * 0.75 * 0.3 + 1);
  assert.equal(r2.keys, 2, '2 h of regen from 3 keys (+4 possible, cap 5)');
  assert.equal(s.keys, 5);
  assert.equal(s.lastSeen, t0 + 2 * 3600_000);
  assert.equal(state.collectOffline(t0 + 2 * 3600_000 + 1000), null, 'cannot double-collect');
  // 48 hours → capped to 8 h (+patience)
  const t1 = t0 + 2 * 3600_000;
  s.keys = 0;
  s.keyRegenAt = t1 + 1000;
  const r48 = state.collectOffline(t1 + 48 * 3600_000);
  assert.equal(r48.seconds, 48 * 3600);
  assert.equal(r48.cappedSeconds, 8 * 3600);
  assert.equal(r48.keys, 5);
  assertFiniteDeep(r48, 'offline 48h');
  s.mastery.patience = 4;
  s.lastSeen = t1;
  const rp = state.collectOffline(t1 + 48 * 3600_000);
  assert.equal(rp.cappedSeconds, 12 * 3600);
  // Clock went backwards / garbage
  s.lastSeen = t1 + 1e9;
  assert.equal(state.collectOffline(t1), null);
  s.lastSeen = t1;
  assert.ok(state.collectOffline(NaN) !== undefined);
});

test('quest chain advances, emits quest:ready once and claimed rewards apply', () => {
  const s = fresh();
  let q = state.currentQuest();
  assert.equal(q.id, 'q_open1');
  assert.equal(q.done, false);
  assert.equal(q.progress, 0);
  assert.equal(q.target, 1);
  assert.equal(q.rewardText, '+3 Chests');
  assert.equal(state.claimQuest(), false);
  clearEvents();
  state.openChest();
  state.sellPending();
  assert.equal(count('quest:ready'), 1);
  state.addGold(1);
  assert.equal(count('quest:ready'), 1, 'only once per quest');
  q = state.currentQuest();
  assert.ok(q.done);
  const chests = s.chests;
  assert.ok(state.claimQuest());
  assert.equal(s.chests, chests + 3);
  assert.equal(s.quest.index, 1);
  assert.deepEqual(s.quest.claimedIds, ['q_open1']);
  assert.equal(count('quest:claimed'), 1);
  // q_equip1 → equip something
  assert.equal(state.currentQuest().id, 'q_equip1');
  s.pendingItem = data.rollItem({ ilvl: 1, chestLevel: 1, slot: 'ring', rarity: 0 });
  state.equipPending();
  assert.ok(state.currentQuest().done);
  const gems = s.gems;
  assert.ok(state.claimQuest());
  assert.equal(s.gems, gems + 10);
  // Fast-forward through the whole tutorial by satisfying every condition.
  s.stats.chestsOpened = 1000;
  s.stats.itemsSold = 1000;
  s.stats.dungeonsWon = 50;
  s.stats.flyingChests = 50;
  s.stats.autoOpenUsed = 1;
  s.stats.kills = 10000;
  s.stats.bestItemRarity = 6;
  s.campaign.highestFloor = 22;
  s.chestLevel = 10;
  s.hero.level = 40;
  s.skills.owned = { bomb: 5, blades: 1, warcry: 1 };
  s.skills.equipped = ['bomb', 'blades', 'warcry', null];
  s.allies.owned = { wolf: 1 };
  s.mastery.might = 30;
  for (const slot of data.SLOTS) s.equipped[slot] = data.rollItem({ ilvl: 22, chestLevel: 20, slot, rarity: 5 });
  state.invalidate();
  let guard = 0;
  while (s.quest.index < data.QUESTS.length && guard++ < 100) {
    const cq = state.currentQuest();
    assert.ok(cq.done, 'tutorial quest should be done: ' + cq.id + ' ' + cq.progress + '/' + cq.target);
    assert.ok(state.claimQuest());
  }
  assert.equal(s.quest.index, data.QUESTS.length);
  q = state.currentQuest();
  assert.equal(q.text, 'Reach floor 25');
  assert.equal(q.progress, 22);
  assert.equal(q.done, false);
  s.campaign.highestFloor = 31;
  state.setWave(2);
  assert.ok(state.claimQuest());
  assert.equal(state.currentQuest().text, 'Reach floor 30');
  assert.ok(state.claimQuest());
  assert.equal(state.currentQuest().text, 'Reach floor 35');
  assert.equal(state.claimQuest(), false);
  assert.ok(s.quest.claimedIds.length <= 60);
});

test('setSetting validates paths and types', () => {
  const s = fresh();
  assert.ok(state.setSetting('autoLoot.stopRarity', 5));
  assert.equal(s.settings.autoLoot.stopRarity, 5);
  assert.ok(state.setSetting('sound', false));
  assert.equal(s.settings.sound, false);
  assert.ok(state.setSetting('speed', 3));
  assert.equal(s.settings.speed, 3);
  assert.ok(state.setSetting('speed', 9));
  assert.equal(s.settings.speed, 3);
  assert.ok(state.setSetting('autoLoot.sell.3', true));
  assert.equal(s.settings.autoLoot.sell[3], true);
  assert.ok(state.setSetting('autoLoot.sell', [false, false, false, false, false, false, false]));
  assert.equal(s.settings.autoLoot.sell[0], false);
  assert.equal(state.setSetting('autoLoot.sell', [true]), false);
  assert.ok(state.setSetting('settings.autoBoss', false));
  assert.equal(s.settings.autoBoss, false);
  assert.equal(state.setSetting('nope', 1), false);
  assert.equal(state.setSetting('autoLoot.nope.deeper', 1), false);
  assert.equal(state.setSetting('speed', 'fast'), false);
  assert.equal(state.setSetting('', 1), false);
  assert.equal(state.setSetting('__proto__.polluted', 1), false);
  assert.equal({}.polluted, undefined);
});

test('every mutation emits state:changed', () => {
  const s = fresh();
  s.gold = 1e9;
  s.gems = 1e6;
  s.scrolls = 1e6;
  s.campaign.highestFloor = 30;
  const actions = [
    () => state.addGold(1),
    () => state.addGems(1),
    () => state.addChests(1),
    () => state.addXp(1),
    () => state.addScrolls(1),
    () => state.addKeys(1),
    () => state.spend('gold', 1),
    () => state.grantKill({ floor: 1 }),
    () => state.onFloorCleared(30),
    () => state.setWave(4),
    () => state.setFarming(true),
    () => state.onHeroDied(),
    () => state.grantFlyingChest(),
    () => state.grantDungeonWin('horde'),
    () => state.useKey(),
    () => state.openChest(),
    () => state.equipPending(),
    () => state.openChest(),
    () => state.sellPending(),
    () => state.upgradeChestLevel(),
    () => state.setAutoOpen(true),
    () => state.setAutoOpen(false),
    () => state.unlockSkill('heal'),
    () => state.upgradeSkill('heal'),
    () => state.equipSkill('heal', 3),
    () => state.unequipSkill(3),
    () => state.unlockAlly('golem_ally'),
    () => state.upgradeAlly('golem_ally'),
    () => state.equipAlly('golem_ally', 1),
    () => state.unequipAlly(1),
    () => state.upgradeMastery('greed'),
    () => state.setSetting('autoSkill', false),
  ];
  actions.forEach((fn, i) => {
    clearEvents();
    const r = fn();
    assert.ok(r !== false, 'action ' + i + ' succeeded');
    assert.ok(count('state:changed') >= 1, 'action ' + i + ' emitted state:changed');
  });
});

test('works in Node without localStorage', () => {
  const saved = globalThis.localStorage;
  delete globalThis.localStorage;
  try {
    state.reset();
    assert.equal(state.save(), false);
    assert.equal(state.load(), false);
    state.tick(20);
    assert.ok(state.s.chests === 10);
  } finally {
    globalThis.localStorage = saved;
  }
});

// =========================================================================== balance sanity print
console.log('balance snapshot (informational)');
{
  fresh();
  const s = state.s;
  const rows = [];
  for (const f of [1, 5, 10, 15, 20, 30, 50]) {
    s.campaign.floor = f;
    s.campaign.highestFloor = f;
    s.hero.level = Math.max(1, Math.round(f * 1.5));
    for (const slot of data.SLOTS) s.equipped[slot] = data.rollItem({ ilvl: f, chestLevel: Math.min(20, 1 + Math.floor(f / 3)), slot, rarity: Math.min(6, 1 + Math.floor(f / 8)) });
    state.invalidate();
    const st = state.getHeroStats();
    const inc = state.estimateIncome();
    rows.push({
      floor: f,
      lvl: s.hero.level,
      atk: Math.round(st.atk),
      hp: st.hp,
      cp: state.getPower(),
      enemyHp: data.enemyStats(f, 'skeleton', { isBoss: false }).hp,
      bossHp: data.enemyStats(f, data.biomeForFloor(f).boss, { isBoss: true }).hp,
      kps: inc.killsPerSec.toFixed(2),
      goldPerMin: Math.round(inc.goldPerSec * 60),
      chestCost: data.chestUpgradeCost(Math.min(19, 1 + Math.floor(f / 3))),
    });
  }
  console.table(rows);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
