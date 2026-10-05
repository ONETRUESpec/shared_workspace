// Tests für den Rechenkern. Ausführen mit:  node --test planner/tests
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { computeBuild, starMultiplier, tierMultiplier, critWeakspotFactor, encodeBuild, decodeBuild, emptyBonus, addBonus } from '../js/calc.js';

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(readFileSync(join(here, '..', 'data', name), 'utf8'));
const data = {
  weapons: load('weapons.json'), armor: load('armor.json'), sets: load('sets.json'), mods: load('mods.json'),
  deviations: load('deviations.json'), cradle: load('cradle.json'), calibrations: load('calibrations.json'),
  food: load('food.json'), stars: load('stars.json'), formulas: load('formulas.json'),
};
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('Sternkurven: legendär 6★ = +25 %, selten 4★ = +19 %, Grenzen werden geklemmt', () => {
  close(starMultiplier(data.stars, 'legendary', 1), 1.0);
  close(starMultiplier(data.stars, 'legendary', 6), 1.25);
  close(starMultiplier(data.stars, 'legendary', 9), 1.25);
  close(starMultiplier(data.stars, 'rare', 4), 1.19);
  close(starMultiplier(data.stars, 'rare', 6), 1.19);
  close(starMultiplier(data.stars, 'epic', 5), 1.22);
});

test('Tierkurve: Tier V = Tier IV × 1.52 (SOCR 174 → 264, KVD 168 → 255, Jaws 494 → 751), Standard ist Tier V', () => {
  close(tierMultiplier(data.stars, 4, 4), 1);
  close(tierMultiplier(data.stars, 5, 4), 1.52);
  for (const [id, t5] of [['socr-the-last-valor', 264], ['kvd-boom-boom', 255], ['de-50-jaws', 751]]) {
    const w = data.weapons.find((x) => x.id === id);
    assert.ok(Math.abs(w.damage * tierMultiplier(data.stars, 5, w.damageTier) - t5) <= 1.5, `${id}: ${w.damage * 1.52} vs ${t5}`);
  }
  const res = computeBuild({ weapon: { id: 'socr-the-last-valor', star: 1 } }, data);
  close(res.offense.attack, 174 * 1.52);
  assert.equal(res.offense.tier, 5);
  close(computeBuild({ weapon: { id: 'socr-the-last-valor', star: 6, tier: 5 } }, data).offense.attack, 174 * 1.52 * 1.25);
});

test('Crit-/Weakspot-Faktor additiv und multiplikativ', () => {
  close(critWeakspotFactor(27, 60, true, true, 'additive'), 1.87);
  close(critWeakspotFactor(27, 60, true, true, 'multiplicative'), 1.27 * 1.6);
  close(critWeakspotFactor(27, 60, false, false, 'additive'), 1);
});

test('addBonus: Keyword-Boni nur für das Waffen-Keyword', () => {
  const b = emptyBonus();
  addBonus(b, { keyword: { Shrapnel: 8, Bounce: 8 }, weaponDmg: 5 }, { weaponKeyword: 'Shrapnel', stacks: 2 });
  close(b.keyword.Shrapnel, 16);
  assert.equal(b.keyword.Bounce, undefined);
  close(b.weaponDmg, 10);
});

test('SOCR - The Last Valor ohne Boni: Treffer, Crit, Weakspot, DPS', () => {
  const res = computeBuild({ weapon: { id: 'socr-the-last-valor', star: 1, tier: 4 }, target: { weakspotRate: 0 } }, data);
  const o = res.offense;
  close(o.attack, 174);
  close(o.hits.body, 174);
  close(o.hits.crit, 174 * 1.27);
  close(o.hits.weakspot, 174 * 1.6);
  close(o.hits.critWeakspot, 174 * 1.87);
  close(o.avgHit, 0.94 * 174 + 0.06 * 174 * 1.27);
  close(o.rps, 515 / 60);
  assert.equal(o.mag, 30);
  close(o.cycle, 30 / (515 / 60) + 2.3);
  close(o.dpsSustained, (o.avgShot * 30) / o.cycle);
  assert.equal(res.starTable.length, 6);
  close(res.starTable[5].attack, 174 * 1.25);
});

test('Essen: Shattered Bread +25 % Weapon DMG, global abschaltbar', () => {
  const build = { weapon: { id: 'socr-the-last-valor', star: 1, tier: 4 }, foods: [{ id: 'shattered-bread' }] };
  close(computeBuild(build, data).offense.hits.body, 174 * 1.25);
  close(computeBuild({ ...build, foodEnabled: false }, data).offense.hits.body, 174);
  // bedingtes Essen kann deaktiviert werden
  const pie = { weapon: { id: 'socr-the-last-valor', star: 1, tier: 4 }, foods: [{ id: 'stargazy-pie', active: false }] };
  close(computeBuild(pie, data).offense.critDmg, 27);
  close(computeBuild({ ...pie, foods: [{ id: 'stargazy-pie' }] }, data).offense.critDmg, 52);
});

test('Deviant: Lonewolf\'s Whisper Stufe 2 = +21.6 % Weapon DMG', () => {
  const build = { weapon: { id: 'socr-the-last-valor', star: 1, tier: 4 }, deviant: { id: 'lonewolfs-whisper', level: 2 } };
  close(computeBuild(build, data).offense.hits.body, 174 * 1.216);
});

test('Rüstung: Sternfaktor auf HP/Psi, Set-Boni werden gezählt', () => {
  const build = {
    weapon: { id: 'socr-the-last-valor', star: 1, tier: 4 },
    armor: { Top: { id: 'lonewolf-jacket', star: 6 }, Helmet: { id: 'lonewolf-hat', star: 1 } },
  };
  const res = computeBuild(build, data);
  close(res.hpArmor, 1918 * 1.25 + 738);
  close(res.psiArmor, 63 * 1.25 + 92);
  const lw = res.activeSets.find((s) => s.name === 'Lonewolf');
  assert.equal(lw.count, 2);
  close(res.offense.critRate, 6 + 5); // 2-teilig: Crit Rate +5 %
  close(res.bonus.magazine, 10); // 1-teilig: Magazin +10 %
  assert.equal(res.offense.mag, 33);
});

test('Status-Schaden: Power Surge = 50 % Psi × (1 + Status DMG)', () => {
  const build = {
    weapon: { id: 'acs12-corrosion', star: 1, tier: 4 },
    armor: { Top: { id: 'lonewolf-jacket', star: 1 } },
    foods: [{ id: 'whimsical-drink' }],
  };
  const res = computeBuild(build, data);
  assert.equal(res.weaponKeyword, 'Power Surge');
  close(res.offense.status.perHit, 63 * 0.5 * 1.25);
});

test('Kalibrierung: Attack +25 % geht in den Attack-Wert', () => {
  const cal = data.calibrations.find((c) => c.name === 'Precision Assault Rifle');
  const build = { weapon: { id: 'socr-the-last-valor', star: 1, tier: 4, calibrationId: cal.id } };
  const o = computeBuild(build, data).offense;
  close(o.attack, 174 * 1.25);
  close(o.rps, (515 / 60) * 0.9);
});

test('Build-Kodierung ist verlustfrei', () => {
  const build = { weapon: { id: 'socr-the-last-valor', star: 3, tier: 5 }, foods: [{ id: 'shattered-bread' }], manual: { critDmg: 12.5 } };
  assert.deepEqual(decodeBuild(encodeBuild(build)), build);
});

test('Deviant-Stufe wird gerundet und gegen NaN abgesichert (Link/Storage kann krumme Werte enthalten)', () => {
  const mk = (level) => computeBuild({ weapon: { id: 'socr-the-last-valor', star: 1, tier: 4 }, deviant: { id: 'butterflys-emissary', level }, target: { weakspotRate: 0.5 } }, data);
  close(mk(2).offense.weakspotDmg, 60 + 30);
  close(mk(2.4).offense.weakspotDmg, 60 + 30);
  close(mk('x').offense.weakspotDmg, 60 + 25);
  close(mk(undefined).offense.weakspotDmg, 60 + 25);
  for (const lv of [2.4, 'x', null, 99]) {
    const o = mk(lv).offense;
    assert.ok(Number.isFinite(o.avgHit) && Number.isFinite(o.dpsSustained), `Stufe ${lv} liefert NaN`);
  }
  assert.equal(mk(2.4).breakdown.find((l) => l.kind === 'Deviant').source, "Butterfly's Emissary (Stufe 2)");
});

test('Datenparser: keine Doppelzählung, keyword-gebundene Werte bleiben beim Keyword', () => {
  const mod = (id) => data.mods.find((m) => m.id === id);
  assert.deepEqual(mod('power-of-striving-shoes').stats, { weaponDmg: 10, statusDmg: 10 });
  assert.deepEqual(mod('slow-and-steady-shoes').stats, { meleeDmg: 10, weaponDmg: 10, statusDmg: 10 });
  assert.deepEqual(mod('super-bullet-weapon').stats, { keywordStats: { Bounce: { critRate: 10, critDmg: 25 } } });
  assert.deepEqual(data.cradle.find((c) => c.id === 'transient-impact').stats, { elemental: { Shock: 18 }, keyword: { 'Power Surge': 25 } });
  assert.deepEqual(data.cradle.find((c) => c.id === 'tracking-bullet').stats, { keywordStats: { Shrapnel: { critDmg: 35 } }, keyword: { Shrapnel: 25 } });
  assert.deepEqual(data.sets.Blast.bonus.find((b) => b.pieces === 3).stats, {}); // "DMG of your next Melee attack +20%" ist kein Attack-Bonus
  assert.deepEqual(data.sets.Rustic.bonus.find((b) => b.pieces === 2).stats, { meleeDmg: 15 });
});

test('Keyword-Crit: "Bounce Crit Rate +10%, Bounce Crit DMG +25%" wirkt nur auf Bounce-Schaden und nur bei Bounce-Waffen', () => {
  const bounce = computeBuild({ weapon: { id: 'mps5-kumawink', star: 1, tier: 4, modId: 'super-bullet-weapon' }, target: { weakspotRate: 0 } }, data);
  assert.equal(bounce.weaponKeyword, 'Bounce');
  close(bounce.offense.critRate, 8); // Waffen-Crit unverändert
  close(bounce.offense.status.critRate, 10);
  close(bounce.offense.status.critDmg, 30 + 25);
  close(bounce.offense.status.perHit, 142 * 0.4 * (0.9 + 0.1 * 1.55));
  // dieselbe Mod auf einer Shrapnel-Waffe: kein Effekt
  const shr = computeBuild({ weapon: { id: 'socr-the-last-valor', star: 1, tier: 4, modId: 'super-bullet-weapon' }, target: { weakspotRate: 0 } }, data);
  close(shr.offense.critRate, 6);
  close(shr.offense.status.critRate, 6); // Shrapnel crittet mit der Waffen-Crit-Rate
  close(shr.offense.status.perHit, 174 * 0.6 * (0.94 + 0.06 * 1.27));
  assert.equal(shr.breakdown.find((l) => l.kind === 'Mod')?.applied ?? null, null);
});

test('Verwundbarkeit (+5 % Shellfish) geht in Körpertreffer und Status-Schaden ein', () => {
  const res = computeBuild({ weapon: { id: 'socr-the-last-valor', star: 1, tier: 4 }, foods: [{ id: 'shellfish-dish' }] }, data);
  close(res.bonus.vulnerability, 5);
  close(res.offense.hits.body, 174 * 1.05);
});
