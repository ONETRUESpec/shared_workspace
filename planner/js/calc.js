// Rechenkern des Once-Human-Build-Planers. Reine Funktionen, keine DOM-Zugriffe.
// Wird vom Browser (index.html) und von den Node-Tests (tests/calc.test.mjs) benutzt.

export const STAT_KEYS = [
  'weaponDmg', 'attackPct', 'critRate', 'critDmg', 'weakspotDmg', 'statusDmg',
  'psiPct', 'psiFlat', 'hpPct', 'hpFlat', 'magazine', 'reload', 'fireRate',
  'dmgVsBoss', 'dmgVsElite', 'dmgVsCommon', 'dmgVsMarked', 'elementalAll', 'keywordDmg',
  'meleeDmg', 'pollutionFlat', 'pollutionPct', 'dmgReduction', 'vulnerability',
];

export const ELEMENTS = ['Blaze', 'Frost', 'Shock', 'Blast'];

export const KEYWORD_ELEMENT = {
  'Burn': 'Blaze', 'Frost Vortex': 'Frost', 'Power Surge': 'Shock', 'Unstable Bomber': 'Blast',
};

export const ARMOR_SLOTS = ['Helmet', 'Mask', 'Top', 'Gloves', 'Bottoms', 'Shoes'];

export function emptyBonus() {
  const b = {};
  for (const k of STAT_KEYS) b[k] = 0;
  b.elemental = { Blaze: 0, Frost: 0, Shock: 0, Blast: 0 };
  b.keyword = {};
  b.keywordStats = {}; // {Shrapnel: {critRate, critDmg, weakspotDmg}} – gilt nur für das Waffen-Keyword
  return b;
}

/**
 * Addiert ein Stat-Objekt (wie in den Datendateien) auf einen Bonus-Akkumulator.
 * @param {object} acc        Akkumulator aus emptyBonus()
 * @param {object} stats      {weaponDmg: 10, elemental: {Blaze: 5}, keyword: {Shrapnel: 8}, keywordStats: {Bounce: {critRate: 10}}, ...}
 * @param {object} [opt]      {stacks: 1, weaponKeyword: 'Shrapnel', keywordOnly: 'Shrapnel', element: 'Blaze'}
 * @returns {object|null}     Was tatsächlich addiert wurde (für die Aufschlüsselung) oder null
 */
export function addBonus(acc, stats, opt = {}) {
  if (!stats) return null;
  const stacks = Math.max(0, Number(opt.stacks ?? 1));
  const applied = {};
  for (const [key, raw] of Object.entries(stats)) {
    if (key === 'elemental') {
      for (const [el, v] of Object.entries(raw || {})) {
        if (!(el in acc.elemental)) acc.elemental[el] = 0;
        acc.elemental[el] += v * stacks;
        applied[`elemental.${el}`] = v * stacks;
      }
    } else if (key === 'keyword') {
      for (const [kw, v] of Object.entries(raw || {})) {
        if (opt.weaponKeyword && kw !== opt.weaponKeyword) continue;
        acc.keyword[kw] = (acc.keyword[kw] || 0) + v * stacks;
        applied[`keyword.${kw}`] = v * stacks;
      }
    } else if (key === 'keywordStats') {
      // Keyword-gebundene Crit-/Weakspot-Werte: nur wenn die Waffe genau dieses Keyword hat
      for (const [kw, st] of Object.entries(raw || {})) {
        if (kw !== opt.weaponKeyword) continue;
        const ks = acc.keywordStats[kw] || (acc.keywordStats[kw] = {});
        for (const [k, v] of Object.entries(st || {})) {
          ks[k] = (ks[k] || 0) + v * stacks;
          applied[`keywordStats.${kw}.${k}`] = v * stacks;
        }
      }
    } else if (key === 'elementalDmg') {
      // Deviant-Buffs liefern elementalDmg + element
      const el = opt.element || 'Blaze';
      acc.elemental[el] = (acc.elemental[el] || 0) + raw * stacks;
      applied[`elemental.${el}`] = raw * stacks;
    } else if (key === 'keywordDmg') {
      if (opt.keywordOnly && opt.weaponKeyword && opt.keywordOnly !== opt.weaponKeyword) continue;
      acc.keywordDmg += raw * stacks;
      applied.keywordDmg = raw * stacks;
    } else if (key in acc) {
      acc[key] += raw * stacks;
      applied[key] = raw * stacks;
    }
  }
  return Object.keys(applied).length ? applied : null;
}

export function starMultiplier(stars, rarity, star) {
  const curve = stars.curves[rarity] || stars.curves.legendary;
  const idx = Math.min(Math.max(1, Math.round(star || 1)), curve.length) - 1;
  return curve[idx];
}

/** Faktor für das Blueprint-Tier (I..V) relativ zum Tier der Datenbasis (Tier IV). */
export function tierMultiplier(stars, tier, dataTier) {
  const curve = stars.tierCurve || [1];
  const t = Math.min(Math.max(1, Math.round(tier || curve.length)), curve.length);
  const d = Math.min(Math.max(1, Math.round(dataTier || stars.weaponDataTier || curve.length)), curve.length);
  return curve[t - 1] / curve[d - 1];
}

export function maxStars(stars, rarity) {
  return (stars.curves[rarity] || stars.curves.legendary).length;
}

const pct = (v) => 1 + (v || 0) / 100;

/** Crit-/Weakspot-Faktor für einen Treffer. */
export function critWeakspotFactor(critDmgPct, weakspotPct, isCrit, isWeakspot, mode = 'additive') {
  const cd = isCrit ? critDmgPct / 100 : 0;
  const ws = isWeakspot ? weakspotPct / 100 : 0;
  if (mode === 'multiplicative') return (1 + cd) * (1 + ws);
  return 1 + cd + ws;
}

/**
 * Findet in einer Liste das Element mit passender id.
 */
const byId = (list, id) => (id ? (list || []).find((x) => x.id === id) : undefined);

/**
 * Hauptrechnung.
 * @param {object} build  Build-Zustand (siehe README / app.js)
 * @param {object} data   Alle Datendateien {weapons, armor, sets, mods, deviations, cradle, calibrations, food, stars, formulas}
 * @param {object} [opt]  {skipStarTable: bool}
 */
export function computeBuild(build, data, opt = {}) {
  const weapon = byId(data.weapons, build.weapon?.id);
  const stars = data.stars;
  const formulas = data.formulas;
  const options = Object.assign({ critWeakspotMode: formulas.critWeakspotDefault || 'additive', damagePerPellet: true, baseHp: 0 }, build.options || {});
  const bonus = emptyBonus();
  const breakdown = [];
  const warnings = [];
  const weaponKeyword = build.weapon?.keywordOverride || weapon?.keyword || null;
  const weaponElement = build.weapon?.element || (weaponKeyword ? KEYWORD_ELEMENT[weaponKeyword] : null) || null;

  const note = (source, kind, applied, extra = {}) => {
    if (applied) breakdown.push({ source, kind, applied, ...extra });
  };

  const suffixes = Object.assign({}, formulas.modSuffixes || {}, build.suffixOverrides || {});

  // ---- Kalibrierung -------------------------------------------------------------
  const calibration = byId(data.calibrations, build.weapon?.calibrationId);
  if (calibration) note(calibration.name, 'Kalibrierung', addBonus(bonus, calibration.stats, { weaponKeyword }));

  // ---- Mods (Waffe + 6 Rüstungsslots) ---------------------------------------------
  const applyMod = (slotLabel, cfg) => {
    if (!cfg || !cfg.modId) return;
    const mod = byId(data.mods, cfg.modId);
    if (!mod) return;
    const active = !mod.conditional || cfg.active !== false;
    if (active) {
      const stacks = cfg.stacks != null ? Number(cfg.stacks) : (mod.maxStacks || 1);
      note(`${mod.name} (${slotLabel})`, 'Mod', addBonus(bonus, mod.stats, { stacks, weaponKeyword }), { stacks });
    } else {
      note(`${mod.name} (${slotLabel})`, 'Mod', null);
      breakdown.push({ source: `${mod.name} (${slotLabel})`, kind: 'Mod', applied: null, inactive: true });
    }
    if (cfg.suffix && suffixes[cfg.suffix]) {
      note(`${mod.name} <${cfg.suffix}>`, 'Mod-Suffix', addBonus(bonus, suffixes[cfg.suffix], { weaponKeyword, keywordOnly: cfg.suffix }));
    }
  };
  applyMod('Waffe', build.weapon);

  // ---- Rüstung ---------------------------------------------------------------------
  let hpArmor = 0, psiArmor = 0, pollutionArmor = 0;
  const setCount = {};
  const armorPieces = [];
  for (const slot of ARMOR_SLOTS) {
    const cfg = build.armor?.[slot];
    if (!cfg || !cfg.id) continue;
    const piece = byId(data.armor, cfg.id);
    if (!piece) continue;
    const star = Math.min(Number(cfg.star || 1), maxStars(stars, piece.rarity));
    const mult = starMultiplier(stars, piece.rarity, star);
    const hp = piece.hp * mult;
    const psi = piece.psi * mult;
    hpArmor += hp;
    psiArmor += psi;
    pollutionArmor += piece.pollution || 0;
    armorPieces.push({ slot, piece, star, mult, hp, psi });
    if (piece.set) setCount[piece.set] = (setCount[piece.set] || 0) + 1;
    if (piece.stats && Object.keys(piece.stats).length) {
      const active = !piece.conditional || cfg.effectActive !== false;
      if (active) {
        const stacks = cfg.effectStacks != null ? Number(cfg.effectStacks) : (piece.maxStacks || 1);
        note(`${piece.name} (Effekt)`, 'Rüstung', addBonus(bonus, piece.stats, { stacks, weaponKeyword }), { stacks });
      } else {
        breakdown.push({ source: `${piece.name} (Effekt)`, kind: 'Rüstung', applied: null, inactive: true });
      }
    }
    applyMod(slot, cfg);
  }

  // ---- Set-Boni --------------------------------------------------------------------
  const activeSets = [];
  for (const [setName, count] of Object.entries(setCount)) {
    const set = data.sets?.[setName];
    if (!set) continue;
    const bonuses = [];
    for (const b of set.bonus || []) {
      if (b.pieces > count) continue;
      const toggle = build.setToggles?.[setName]?.[b.pieces];
      const active = !b.conditional || (toggle ? toggle.active !== false : true);
      const stacks = toggle?.stacks != null ? Number(toggle.stacks) : (b.maxStacks || 1);
      const applied = active ? addBonus(bonus, b.stats, { stacks, weaponKeyword }) : null;
      bonuses.push({ pieces: b.pieces, effect: b.effect, active, stacks, applied, conditional: b.conditional });
      if (applied) note(`${setName} ${b.pieces}-teilig`, 'Set', applied, { stacks });
      else if (!active) breakdown.push({ source: `${setName} ${b.pieces}-teilig`, kind: 'Set', applied: null, inactive: true });
    }
    activeSets.push({ name: setName, count, bonuses });
  }

  // ---- Essen -----------------------------------------------------------------------
  if (build.foodEnabled !== false) {
    for (const f of build.foods || []) {
      const food = byId(data.food, f.id);
      if (!food) continue;
      if (food.keyword && weaponKeyword && food.keyword !== weaponKeyword && !('keywordDmg' in (food.stats || {}))) {
        breakdown.push({ source: food.name, kind: 'Essen', applied: null, inactive: true, reason: `nur für ${food.keyword}` });
        continue;
      }
      const active = !food.cond || f.active !== false;
      if (active) note(food.name, 'Essen', addBonus(bonus, food.stats, { weaponKeyword, keywordOnly: food.keyword || undefined }));
      else breakdown.push({ source: food.name, kind: 'Essen', applied: null, inactive: true });
    }
  }

  // ---- Deviant ---------------------------------------------------------------------
  let deviant = null;
  if (build.deviant?.id) {
    deviant = byId(data.deviations, build.deviant.id);
    if (deviant?.buff && build.deviant.active !== false) {
      const lv = Math.min(Math.max(1, Math.round(Number(build.deviant.level)) || 1), deviant.buff.levels.length);
      const value = deviant.buff.levels[lv - 1];
      const stats = typeof value === 'object' ? value : { [deviant.buff.stat]: value };
      note(`${deviant.name} (Stufe ${lv})`, 'Deviant', addBonus(bonus, stats, { element: deviant.buff.element, weaponKeyword }));
    } else if (deviant) {
      breakdown.push({ source: deviant.name, kind: 'Deviant', applied: null, inactive: true });
    }
  }

  // ---- Cradle Overrides ------------------------------------------------------------
  for (const c of build.cradle || []) {
    const cr = byId(data.cradle, c.id);
    if (!cr) continue;
    const active = !cr.conditional || c.active !== false;
    if (active) {
      const stacks = c.stacks != null ? Number(c.stacks) : (cr.maxStacks || 1);
      note(cr.name, 'Cradle', addBonus(bonus, cr.stats, { stacks, weaponKeyword }), { stacks });
    } else breakdown.push({ source: cr.name, kind: 'Cradle', applied: null, inactive: true });
  }

  // ---- Manuelle Boni ---------------------------------------------------------------
  if (build.manual) note('Manuell', 'Manuell', addBonus(bonus, build.manual, { weaponKeyword }));

  // ---- Verteidigung / Psi -----------------------------------------------------------
  const hp = (Number(options.baseHp || 0) + hpArmor) * pct(bonus.hpPct) + bonus.hpFlat;
  const psi = psiArmor * pct(bonus.psiPct) + bonus.psiFlat;
  const pollution = (pollutionArmor + bonus.pollutionFlat) * pct(bonus.pollutionPct);

  const result = {
    weapon, weaponKeyword, weaponElement, bonus, breakdown, warnings, armorPieces, activeSets, deviant,
    hp, psi, pollution, hpArmor, psiArmor, options,
  };

  if (!weapon) {
    result.offense = null;
    return result;
  }

  // ---- Offensive --------------------------------------------------------------------
  const target = Object.assign({ weakspotRate: 0, type: 'common', marked: false }, build.target || {});
  const weaponStar = Math.min(Number(build.weapon.star || 1), maxStars(stars, weapon.rarity));
  const weaponTier = Number(build.weapon.tier || (stars.tierCurve || [1]).length);
  result.offense = computeOffense(weapon, weaponStar, bonus, target, options, data, result, weaponTier);

  if (!opt.skipStarTable) {
    result.starTable = [];
    for (let s = 1; s <= maxStars(stars, weapon.rarity); s++) {
      const o = computeOffense(weapon, s, bonus, target, options, data, result, weaponTier);
      result.starTable.push({ star: s, attack: o.attack, avgShot: o.avgShot, dpsSustained: o.dpsSustained, dpsBurst: o.dpsBurst, bodyHit: o.hits.body });
    }
    result.tierTable = [];
    for (let t = 1; t <= (stars.tierCurve || [1]).length; t++) {
      const o = computeOffense(weapon, weaponStar, bonus, target, options, data, result, t);
      result.tierTable.push({ tier: t, attack: o.attack, avgShot: o.avgShot, dpsSustained: o.dpsSustained });
    }
    result.armorStarTable = [];
    for (let s = 1; s <= 6; s++) {
      let h = 0, p = 0;
      for (const ap of armorPieces) {
        const m = starMultiplier(stars, ap.piece.rarity, Math.min(s, maxStars(stars, ap.piece.rarity)));
        h += ap.piece.hp * m;
        p += ap.piece.psi * m;
      }
      result.armorStarTable.push({ star: s, hp: (Number(options.baseHp || 0) + h) * pct(bonus.hpPct) + bonus.hpFlat, psi: p * pct(bonus.psiPct) + bonus.psiFlat });
    }
  }
  return result;
}

export function computeOffense(weapon, star, bonus, target, options, data, ctx, tier) {
  const stars = data.stars;
  const starMult = starMultiplier(stars, weapon.rarity, star);
  const tierMult = tierMultiplier(stars, tier, weapon.damageTier);
  const attack = weapon.damage * tierMult * starMult * pct(bonus.attackPct);
  const isMelee = weapon.type === 'Melee';
  const critRate = Math.min(100, Math.max(0, (weapon.critRate || 0) + bonus.critRate));
  const critDmg = (weapon.critDmg || 0) + bonus.critDmg;
  const weakspotDmg = (weapon.weakspotDmg || 0) + bonus.weakspotDmg;
  const vsType = target.type === 'boss' ? bonus.dmgVsBoss : target.type === 'elite' ? bonus.dmgVsElite : bonus.dmgVsCommon;
  const vsMarked = target.marked ? bonus.dmgVsMarked : 0;
  const elemental = ctx.weaponElement ? (bonus.elemental[ctx.weaponElement] || 0) + bonus.elementalAll : 0;
  const melee = isMelee ? bonus.meleeDmg : 0;

  // Basis eines Körpertreffers ohne Crit/Weakspot
  const vuln = bonus.vulnerability;
  const base = attack * pct(bonus.weaponDmg) * pct(elemental) * pct(vsType) * pct(vsMarked) * pct(melee) * pct(vuln);
  const mode = options.critWeakspotMode;
  const hits = {
    body: base,
    crit: base * critWeakspotFactor(critDmg, weakspotDmg, true, false, mode),
    weakspot: base * critWeakspotFactor(critDmg, weakspotDmg, false, true, mode),
    critWeakspot: base * critWeakspotFactor(critDmg, weakspotDmg, true, true, mode),
  };
  const cr = critRate / 100;
  const wr = Math.min(1, Math.max(0, Number(target.weakspotRate || 0)));
  const avgHit = (1 - cr) * (1 - wr) * hits.body + cr * (1 - wr) * hits.crit + (1 - cr) * wr * hits.weakspot + cr * wr * hits.critWeakspot;
  const pellets = options.damagePerPellet ? (weapon.pellets || 1) : 1;
  const avgShot = avgHit * pellets;

  const rps = weapon.rpm ? (weapon.rpm / 60) * pct(bonus.fireRate) : 0;
  const mag = weapon.mag ? Math.max(1, Math.round(weapon.mag * pct(bonus.magazine))) : null;
  const reload = weapon.reloadSec ? weapon.reloadSec / pct(bonus.reload) : 0;
  const dpsBurst = rps ? avgShot * rps : null;
  const magDamage = mag ? avgShot * mag : null;
  const cycle = mag && rps ? mag / rps + reload : null;
  const dpsSustained = cycle ? magDamage / cycle : dpsBurst;

  // Keyword-/Status-Schaden
  let status = null;
  const kw = ctx.weaponKeyword;
  const formula = kw ? data.formulas.keywords?.[kw] : null;
  if (formula && formula.base) {
    const kwBonus = (bonus.keyword[kw] || 0) + bonus.keywordDmg;
    // Keyword-eigene Crit-Werte ("Bounce Crit Rate +10%"): Shrapnel crittet mit der Waffen-Crit-Rate,
    // alle anderen Keywords nur, wenn ein Bonus ihnen eine eigene Crit Rate gibt.
    const ks = bonus.keywordStats[kw] || {};
    const kwCritRate = Math.min(100, Math.max(0, (kw === 'Shrapnel' ? critRate : 0) + (ks.critRate || 0)));
    const kwCritDmg = critDmg + (ks.critDmg || 0);
    const kcr = kwCritRate / 100;
    const critAvg = kcr > 0 ? (1 - kcr) + kcr * critWeakspotFactor(kwCritDmg, 0, true, false, mode) : 1;
    let perHit;
    if (formula.base === 'psi') {
      const el = formula.element ? (bonus.elemental[formula.element] || 0) + bonus.elementalAll : bonus.elementalAll;
      perHit = ctx.psi * formula.ratio * pct(bonus.statusDmg) * pct(el) * pct(kwBonus) * pct(vsType) * pct(vsMarked) * pct(vuln) * critAvg;
    } else {
      // Bounce / Shrapnel: Weapon DMG auf Attack-Basis (Mittelwert über die Keyword-Crit-Rate)
      perHit = attack * formula.ratio * pct(bonus.weaponDmg) * pct(elemental) * pct(kwBonus) * pct(vsType) * pct(vsMarked) * pct(vuln) * critAvg;
    }
    status = { keyword: kw, perHit, ticks: formula.ticks || 1, total: perHit * (formula.ticks || 1), formula, element: formula.element, kwBonus, critRate: kwCritRate, critDmg: kwCritDmg, critAvg, keywordStats: ks };
  } else if (kw) {
    status = { keyword: kw, perHit: null, formula: data.formulas.keywords?.[kw] || null };
  }

  return {
    star, starMult, tier: Math.min(Math.max(1, Math.round(tier || (stars.tierCurve || [1]).length)), (stars.tierCurve || [1]).length), tierMult, attack, critRate, critDmg, weakspotDmg, elemental, vsType, vsMarked, hits, avgHit, avgShot, pellets,
    rps, mag, reload, dpsBurst, dpsSustained, magDamage, cycle, status, isMelee,
  };
}

/** Kompakte Build-Beschreibung für die URL (#b=...) */
export function encodeBuild(build) {
  const json = JSON.stringify(build);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeBuild(str) {
  try {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))));
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}
