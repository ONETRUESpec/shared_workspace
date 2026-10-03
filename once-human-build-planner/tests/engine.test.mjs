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
  assert.ok(lone && lone.perStack && lone.enabled === false, 'Lone Shadow should be a conditional per-stack effect, off by default');
  assert.equal(lone.maxStacks, 10, '4pc raises Lone Shadow to 10 stacks');
  b.toggles[lone.id] = true;
  const fx2 = A.collectEffects(b, cat, { includeFood: false });
  assert.equal(fx2.find(f => f.id === lone.id).value, 60);
  b.armor.Shoes.pieceId = null; b.armor.Pants.pieceId = null; b.armor.Gloves.pieceId = null; // 3 pieces: cap back to 8
  const fx3 = A.collectEffects(b, cat, { includeFood: false });
  assert.equal(fx3.find(f => f.id === lone.id).value, 48);
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

test('research stat names map onto the right engine stats (reviewer cases)', () => {
  const t = (stat, v, m) => A.toEffects(stat, v, m).map(e => e.stat + (e.key ? ':' + e.key : '') + '=' + e.value).join(',');
  assert.equal(t('crit_dmg_pct', 25), 'critDmgPct=25');
  assert.equal(t('status_dmg_pct', 25), 'statusDmgPct=25');
  assert.equal(t('weakspot_dmg_pct', 25), 'weakspotDmgPct=25');
  assert.equal(t('melee_dmg_pct', 25), 'other=25');
  assert.equal(t('powerSurgeDmgFactorPct', -30), 'keywordDmgPct:powerSurge=-30');
  assert.equal(t('unstableBomberFinalDmgPct', 10), 'finalDmgPct:unstableBomber=10');
  assert.equal(t('burnCritDmgPct', 20), 'keywordCritDmgPct:burn=20');
  assert.equal(t('weaponDmgTakenPct', 50, { target: 'enemy' }), 'weaponVulnPct=50');
  assert.equal(t('blastDmgTakenPct', 80, { target: 'enemy' }), 'elementalDmgPct:blast=80');
  assert.equal(t('frostVulnerabilityPct', 39.2, { target: 'enemy' }), 'elementalDmgPct:frost=39.2');
  assert.equal(t('DMG received from monsters', -30), 'dmgReductionPct=30');
  assert.equal(t('shrapnel_weakspot_hit_weight_pct', 100), 'other=100');
  assert.equal(t('autoReloadChancePct', 70), 'other=70');
  assert.equal(t('celestial_thunder_shock_dmg_pct_psi', 200), 'other=200');
  assert.equal(t('Elemental DMG (Blaze, Frost, Shock, Blast)', 15), 'elementalDmgPct:all=15');
  assert.equal(t('Instant DMG (Power Surge and Unstable Bomber)', 25), 'keywordDmgPct:powerSurge=25,keywordDmgPct:unstableBomber=25');
  assert.equal(t('DMG', 15, { condition: 'Normal enemies take +15% DMG' }), 'dmgVsPct:normal=15');
  assert.equal(t('Shrapnel Crit DMG', 30), 'keywordCritDmgPct:shrapnel=30');
  assert.equal(t('Vulnerability', 8), 'weaponVulnPct=8,statusVulnPct=8');
  assert.equal(t('Attack', 25), 'attackPct=25');
});

test('the 113 test reproduces through the adapter with Mayfly Goggles on ACS12 Corrosion', () => {
  const b = A.defaultBuild(cat);
  b.weapon.id = 'acs12-corrosion'; b.weapon.calibration = { styleId: null, attackBonusPct: 0, random: null };
  const mayfly = cat.armor.pieces.find(p => /Mayfly/.test(p.name));
  b.armor[mayfly.slot].pieceId = mayfly.id;
  for (const f of A.collectEffects(b, cat, { includeFood: false })) if (f.conditional) b.toggles[f.id] = true;
  const r = A.computeBuild(b, cat, { includeFood: false });
  const psi = r.psi.effective;
  assert.equal(r.totals.keywordDmgPct.powerSurge, -15, 'Corrosion +15% intrinsic and Mayfly -30% in one pool');
  assert.ok(Math.abs(r.status.perProc - psi * 0.5 * 0.85) < 1e-9, `${r.status.perProc}`);
  assert.ok(r.status.canCrit && r.status.critRatePct > 0, 'Corrosion grants Power Surge crit');
});

test('mod stacks: value is the total at max stacks; Bullet Siphon keeps its unconditional base', () => {
  const so = cat.mods.byId['shoot-out'];
  assert.ok(so && so.effects[0].perStack && so.effects[0].maxStacks === 20 && so.effects[0].perStackValue === 1.5);
  const b = A.defaultBuild(cat); b.weapon.mod = { id: 'shoot-out', substats: [] };
  if (so.keyword) b.weapon.id = cat.weapons.list.find(w => w.keyword === so.keyword && w.attack != null).id; // keyword mods only work on matching weapons
  let fx = A.collectEffects(b, cat); const e = fx.find(f => /Shoot Out/.test(f.source));
  assert.equal(e.enabled, false); b.toggles[e.id] = true;
  fx = A.collectEffects(b, cat); assert.equal(fx.find(f => /Shoot Out/.test(f.source)).value, 30);
  const pants = cat.armor.pieces.find(p => p.slot === 'Pants');
  b.armor.Pants.pieceId = pants.id; b.armor.Pants.mod = { id: 'bullet-siphon', substats: [] };
  fx = A.collectEffects(b, cat);
  const bsx = fx.filter(f => /Bullet Siphon/.test(f.source));
  assert.equal(bsx.filter(f => f.enabled).reduce((a, f) => a + f.value, 0), 5);
  const st = bsx.find(f => f.perStack); b.toggles[st.id] = true; b.stacks[st.id] = 3;
  fx = A.collectEffects(b, cat);
  assert.equal(fx.filter(f => /Bullet Siphon/.test(f.source) && f.enabled).reduce((a, f) => a + f.value, 0), 17);
});

test('deviation debuffs scale with Skill Rating and Mini Feaster stacks to its cap', () => {
  const lw = cat.deviants.list.find(d => /Lonewolf/.test(d.name));
  const vuln = lw.effects.find(f => f.stat === 'weaponVulnPct');
  assert.ok(vuln && vuln.valueBySkillRating[0] === 25 && vuln.valueBySkillRating[4] === 50);
  const b = A.defaultBuild(cat); b.deviant = { id: cat.deviants.list.find(d => /Mini Feaster/.test(d.name)).id, skillRating: 5, active: true };
  let fx = A.collectEffects(b, cat); const mf = fx.find(f => /Mini Feaster/.test(f.source) && f.stat === 'statusDmgPct');
  b.toggles[mf.id] = true;
  fx = A.collectEffects(b, cat); assert.equal(fx.find(f => f.id === mf.id).value, 80);
  b.deviant.skillRating = 1; fx = A.collectEffects(b, cat); assert.equal(fx.find(f => f.id === mf.id).value, 40);
});

test('Cradle: Marked Strike is a toggle, Scavenging is DMG vs normal enemies', () => {
  const ms = cat.cradle.nodes.find(n => n.id.startsWith('marked-strike'));
  assert.ok(ms.effects[0].conditional && ms.effects[0].stat === 'weakspotDmgPct');
  const sc = cat.cradle.nodes.find(n => n.id.startsWith('scavenging'));
  assert.ok(sc.effects.some(f => f.stat === 'dmgVsPct' && f.key === 'normal'), JSON.stringify(sc.effects));
});

test('epic armor caps at 5 stars and uses the epic series; attack flat is added after Attack %', () => {
  const may = cat.armor.pieces.find(p => /Mayfly/.test(p.name));
  assert.equal(may.maxStars, 5);
  const hp5 = cat.armor.baseStatsAt(may, 5).maxHp, hp6 = cat.armor.baseStatsAt(may, 6).maxHp;
  assert.equal(hp5, hp6); assert.ok(Math.abs(hp5 - 814) <= 2, String(hp5));
  const r = E.computeDamage({ attack: 1000, rpm: 60, magazine: 10, reloadTime: 1 }, 1, [E.effect('attackPct', 50), E.effect('attackFlat', 100)], {});
  assert.equal(r.attack.final, 1600);
});

test('status trigger chance multiplies the weapon base and stays 0 when unknown', () => {
  const w = { name: 'x', keyword: 'powerSurge', attack: 100, rpm: 600, magazine: 30, reloadTime: 2, statusChancePct: 25 };
  const r = E.computeDamage(w, 1, [E.effect('psiIntensity', 100), E.effect('statusChancePct', 20)], { statusEffects: cat.statusEffects });
  assert.equal(r.status.chancePct, 30);
  const r0 = E.computeDamage(Object.assign({}, w, { statusChancePct: null }), 1, [E.effect('psiIntensity', 100), E.effect('statusChancePct', 20)], { statusEffects: cat.statusEffects });
  assert.equal(r0.status.chancePct, 0); assert.equal(r0.dps.statusBurst, 0);
});

test('computeBuild tolerates partial builds (no options / target)', () => {
  const b = A.defaultBuild(cat); delete b.options; delete b.target;
  const r = A.computeBuild(b, cat, {});
  assert.ok(r && r.hits.normal > 0);
});

test('keyword mods and key armor only apply on weapons with that keyword', () => {
  const b = A.defaultBuild(cat); // The Last Valor: Shrapnel
  const fg = cat.mods.weaponMods.find(m => m.keyword === 'fastGunner' && m.effects.some(f => f.stat !== 'other'));
  b.weapon.mod = { id: fg.id, substats: [] };
  let fx = A.collectEffects(b, cat);
  for (const f of fx) if (f.conditional) b.toggles[f.id] = true;
  fx = A.collectEffects(b, cat);
  assert.ok(!fx.some(f => f.source === fg.name), 'incompatible keyword mod must not contribute');
  const mayfly = cat.armor.pieces.find(p => /Mayfly/.test(p.name));
  b.armor[mayfly.slot].pieceId = mayfly.id;
  fx = A.collectEffects(b, cat);
  assert.ok(!fx.some(f => f.source === mayfly.name && f.stat === 'keywordDmgPct'), 'Power Surge key armor inactive on a Shrapnel weapon');
});

test('defensive "DMG taken reduction" set bonuses never become Vulnerability', () => {
  const t = (stat, v, m) => A.toEffects(stat, v, m).map(e => e.stat + '=' + e.value).join(',');
  assert.equal(t('statusDmgTakenReductionPct', 15), 'dmgReductionPct=15');
  assert.equal(t('weaponDmgTakenReductionPct', 10), 'dmgReductionPct=10');
  assert.equal(t('DMG Taken from Players', -10), 'dmgReductionPct=10');
});

test('deviation effects apply with the active switch alone and stacks are clamped', () => {
  const b = A.defaultBuild(cat);
  b.deviant = { id: cat.deviants.list.find(d => /Butterfly/.test(d.name)).id, skillRating: 5, active: true };
  const fx = A.collectEffects(b, cat);
  const ws = fx.find(f => /Butterfly/.test(f.source) && f.stat === 'weakspotDmgPct');
  assert.ok(ws && ws.enabled && ws.value === 50.4);
  for (const p of cat.armor.pieces) if (p.setId === 'lonewolf-set') b.armor[p.slot].pieceId = p.id;
  let fx2 = A.collectEffects(b, cat); const lone = fx2.find(f => /Lonewolf Set 3pc/.test(f.source) && f.perStack);
  b.toggles[lone.id] = true; b.stacks[lone.id] = 99;
  fx2 = A.collectEffects(b, cat); assert.equal(fx2.find(f => f.id === lone.id).value, 60);
  b.stacks[lone.id] = -5; fx2 = A.collectEffects(b, cat); assert.equal(fx2.find(f => f.id === lone.id).value, 0);
});

test('weapon intrinsic bonuses: The Last Valor adds +30% Shrapnel Crit DMG; Compound Bow is Unstable Bomber', () => {
  const b = A.defaultBuild(cat);
  const r = A.computeBuild(b, cat, { includeFood: false });
  assert.equal(r.totals.keywordCritDmgPct.shrapnel, 30);
  assert.ok(r.status.perProcCrit / r.status.perProc > r.hits.crit / r.hits.normal, 'shrapnel crit multiplier exceeds the bullet crit multiplier');
  const bow = cat.weapons.list.find(w => w.name === 'Compound Bow');
  assert.equal(bow.keyword, 'unstableBomber'); assert.equal(bow.element, 'blast');
  const bp = cat.weapons.list.find(w => w.name === 'AWS.338 - Black Panther');
  assert.equal(bp.keyword, 'fortressWarfare');
});
