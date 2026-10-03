// Node test-runner tests for the engine and adapter against researched test vectors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis;
for (const f of ['js/engine.js', 'js/data.js', 'js/data-adapter.js']) new Function(readFileSync(join(root, f), 'utf8'))();
const E = globalThis.Engine, A = globalThis.Adapter;
const cat = A.buildCatalog(globalThis.OH_DATA);
const vectors = JSON.parse(readFileSync(join(root, 'data/test_vectors.json'), 'utf8')).testVectors;

test('star multipliers follow the official blueprint table', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(s => E.starMultiplier(s)), [1, 1.05, 1.1, 1.15, 1.2, 1.25]);
});

test('in-game weapon card readings reproduce from Tier V attack x star ratio', () => {
  const cards = vectors.filter(v => v.inputs && v.inputs.officialGunPresetAttack_artLevel5 != null && v.expected && v.expected.displayedDMG != null);
  assert.ok(cards.length >= 30, `expected 30+ card vectors, got ${cards.length}`);
  let checked = 0;
  for (const v of cards) {
    const w = cat.weapons.list.find(x => x.name === v.inputs.weapon || x.aliases.includes(v.inputs.weapon));
    if (!w || w.attack == null) continue;
    const got = w.attackByStar[v.inputs.star];
    assert.ok(Math.abs(got - v.expected.displayedDMG) <= 1, `${v.id} ${v.inputs.weapon} ${v.inputs.star}★: got ${got}, card shows ${v.expected.displayedDMG}`);
    checked++;
  }
  assert.ok(checked >= 25, `only ${checked} card vectors could be checked`);
});

test('weapon card crit/weakspot attributes match the blueprint attrs', () => {
  const cards = vectors.filter(v => v.inputs && v.inputs.blueprintBaseCombatAttrs && v.expected && v.expected.critRatePct != null);
  let checked = 0;
  for (const v of cards) {
    const w = cat.weapons.list.find(x => x.name === v.inputs.weapon);
    if (!w) continue;
    assert.equal(w.critRatePct, v.expected.critRatePct, `${v.inputs.weapon} crit rate`);
    assert.equal(w.critDmgPct, v.expected.critDmgPct, `${v.inputs.weapon} crit dmg`);
    assert.equal(w.weakspotDmgPct, v.expected.weakspotDmgPct, `${v.inputs.weapon} weakspot`);
    checked++;
  }
  assert.ok(checked >= 10, `only ${checked} attribute vectors checked`);
});

test('the 113 Power Surge test: Psi 267 x 0.5 x (1 + 15% - 30%) = 113', () => {
  const w = { name: 'ACS12 - Corrosion', keyword: 'powerSurge', attack: 210, rpm: 180, magazine: 8, reloadTime: 2, critRatePct: 8, critDmgPct: 27, weakspotDmgPct: 20 };
  const fx = [E.effect('psiIntensity', 267, { source: 'armor' }), E.effect('keywordDmgPct', 15, { key: 'powerSurge', source: 'Corrosion' }), E.effect('keywordDmgPct', -30, { key: 'powerSurge', source: 'Mayfly Goggles' })];
  const r = E.computeDamage(w, 1, fx, { statusEffects: cat.statusEffects });
  assert.equal(Math.round(r.status.perProc), 113);
  assert.ok(Math.abs(r.status.perProc - 113.475) < 1e-9);
});

test('Sportskeeda worked example: Psi 800 Power Surge with 20% status and 6% shock = 508.8', () => {
  const w = { name: 'x', keyword: 'powerSurge', attack: 100, rpm: 600, magazine: 30, reloadTime: 2 };
  const fx = [E.effect('psiIntensity', 800), E.effect('statusDmgPct', 20), E.effect('elementalDmgPct', 6, { key: 'shock' })];
  const r = E.computeDamage(w, 1, fx, { statusEffects: cat.statusEffects });
  assert.ok(Math.abs(r.status.perProc - 508.8) < 1e-9, String(r.status.perProc));
});

test('crit and weakspot combine additively by default and multiplicatively when asked', () => {
  const w = { name: 'x', attack: 1000, rpm: 60, magazine: 10, reloadTime: 1, critRatePct: 0, critDmgPct: 50, weakspotDmgPct: 60 };
  const add = E.computeDamage(w, 1, [], { options: { critWeakspotModel: 'additive' } });
  const mul = E.computeDamage(w, 1, [], { options: { critWeakspotModel: 'multiplicative' } });
  assert.equal(add.hits.weakspotCrit, 2100);
  assert.ok(Math.abs(mul.hits.weakspotCrit - 2400) < 1e-9);
  assert.equal(add.hits.crit, 1500); assert.equal(add.hits.weakspot, 1600);
});

test('armor base stats: Tier V 6-star legendary helmet HP and Psi match the post-2.3.1 card', () => {
  const helmet = cat.armor.pieces.find(p => p.setId === 'lonewolf-set' && p.slot === 'Helmet');
  const bs = cat.armor.baseStatsAt(helmet, 6);
  assert.ok(Math.abs(bs.maxHp - 925) <= 1, `HP ${bs.maxHp}`);
  assert.equal(bs.psiIntensity, 115);
  const one = cat.armor.baseStatsAt(helmet, 1);
  assert.ok(Math.abs(bs.maxHp / one.maxHp - 1.25) < 0.01);
});

test('Lonewolf full set grants 1pc magazine, 2pc crit rate and toggled 3pc Lone Shadow stacks', () => {
  const b = A.defaultBuild(cat);
  for (const p of cat.armor.pieces) if (p.setId === 'lonewolf-set') b.armor[p.slot].pieceId = p.id;
  const fx = A.collectEffects(b, cat, { includeFood: false });
  const sum = (stat) => fx.filter(f => f.enabled && f.stat === stat).reduce((a, f) => a + f.value, 0);
  assert.equal(sum('magazinePct'), 10);
  assert.equal(sum('critRatePct') >= 5, true);
  const lone = fx.find(f => f.stat === 'critDmgPct' && /Lonewolf Set 3pc/.test(f.source));
  assert.ok(lone && lone.perStack && lone.maxStacks === 8 && lone.enabled === false, 'Lone Shadow should be a conditional per-stack effect, off by default');
  b.toggles[lone.id] = true;
  const fx2 = A.collectEffects(b, cat, { includeFood: false });
  assert.equal(fx2.find(f => f.id === lone.id).value, 48);
});

test('food is excluded when includeFood is false and the comparison reports the delta', () => {
  const b = A.defaultBuild(cat);
  const bread = cat.food.items.find(i => /Shattered Bread|Crumbly Bread/i.test(i.name));
  assert.ok(bread, 'bread dish present');
  b.food.foodId = bread.id;
  const withF = A.computeBuild(b, cat, { includeFood: true });
  const without = A.computeBuild(b, cat, { includeFood: false });
  assert.ok(withF.hits.normal > without.hits.normal);
  const cmp = E.compare(without, withF);
  assert.ok(cmp.normal.deltaPct > 0);
});

test('every weapon with a base DMG gets a 1..6 star ladder and a keyword/element resolution', () => {
  for (const w of cat.weapons.list) {
    if (w.attack == null) continue;
    assert.equal(Object.keys(w.attackByStar).length, w.maxStars, w.name);
    assert.ok(w.maxStars === 6 || w.maxStars === 5, w.name);
    assert.equal(w.attackByStar[1], w.attack, w.name);
    assert.ok(w.attackByStar[w.maxStars] > w.attackByStar[1], w.name);
    if (w.keywordLabel) assert.ok(w.keyword, `${w.name}: keyword ${w.keywordLabel} unresolved`);
  }
});

test('build round-trips through the URL encoding', async () => {
  const { encode, decode } = { encode: (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url'), decode: (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) };
  const b = A.defaultBuild(cat);
  b.weapon.star = 3; b.cradle.nodeIds = [cat.cradle.nodes[0].id];
  assert.deepEqual(decode(encode(b)), b);
});
