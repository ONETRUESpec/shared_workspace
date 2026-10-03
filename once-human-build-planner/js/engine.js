/* Once Human Build Planner – calculation engine.
 *
 * Pure functions, no DOM. Loaded as a classic script in the browser (window.Engine)
 * and importable from Node tests (globalThis.Engine).
 *
 * Model (see research/SPEC.md and data/formula.json):
 *   DIRECT HIT
 *     hit = Attack(star, calibration)
 *         × (1 + ΣAttack%) × (1 + ΣWeaponDMG%)
 *         × (1 + ΣElementalDMG%[weapon element])      (optional, default OFF – unverified)
 *         × (crit ? 1 + ΣCritDMG% : 1) × (weakspot ? 1 + ΣWeakspotDMG% : 1)
 *         × (1 + ΣDmgVs[target type]%) × (1 + ΣWeaponVulnerability%) × (1 + ΣAllDMG%)
 *         × falloff × mitigation
 *   STATUS PROC (Burn, Frost Vortex, Power Surge, Unstable Bomber, …)
 *     proc = Psi × (1 + ΣPsi%) × baseFactor
 *          × (1 + ΣStatusDMG% + ΣKeywordDMG%[keyword])
 *          × (1 + ΣElementalDMG%[keyword element]) × (1 + ΣFinalDMG%[keyword])
 *          × (1 + ΣStatusVulnerability%) × (1 + ΣDmgVs%) × (1 + ΣAllDMG%) × mitigation
 *     (no crit, no weakspot, no falloff)
 *   BULLET KEYWORDS (Shrapnel 60 % Attack, Bounce 40 % Attack) go through the DIRECT HIT chain.
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Canonical stat vocabulary
  // ---------------------------------------------------------------------------
  const STATS = {
    attackPct:        { label: 'Attack %',              unit: 'pct', bucket: 'attack' },
    attackFlat:       { label: 'Attack (flat)',         unit: 'flat', bucket: 'attack' },
    weaponDmgPct:     { label: 'Weapon DMG %',          unit: 'pct', bucket: 'weaponDmg' },
    elementalDmgPct:  { label: 'Elemental DMG %',       unit: 'pct', bucket: 'elementalDmg', keyed: 'element' },
    statusDmgPct:     { label: 'Status DMG %',          unit: 'pct', bucket: 'statusDmg' },
    keywordDmgPct:    { label: 'Keyword DMG %',         unit: 'pct', bucket: 'statusDmg', keyed: 'keyword' },
    finalDmgPct:      { label: 'Final DMG %',           unit: 'pct', bucket: 'finalDmg', keyed: 'keyword' },
    critRatePct:      { label: 'Crit Rate %',           unit: 'pct', bucket: 'crit' },
    critDmgPct:       { label: 'Crit DMG %',            unit: 'pct', bucket: 'crit' },
    weakspotDmgPct:   { label: 'Weakspot DMG %',        unit: 'pct', bucket: 'weakspot' },
    dmgVsPct:         { label: 'DMG vs type %',         unit: 'pct', bucket: 'dmgVsType', keyed: 'target' },
    weaponVulnPct:    { label: 'Vulnerability (weapon) %', unit: 'pct', bucket: 'vulnerability' },
    statusVulnPct:    { label: 'Vulnerability (status) %', unit: 'pct', bucket: 'vulnerability' },
    allDmgPct:        { label: 'All DMG %',             unit: 'pct', bucket: 'allDmg' },
    psiIntensity:     { label: 'Psi Intensity',         unit: 'flat', bucket: 'psiIntensity' },
    psiIntensityPct:  { label: 'Psi Intensity %',       unit: 'pct', bucket: 'psiIntensity' },
    fireRatePct:      { label: 'Fire Rate %',           unit: 'pct', bucket: 'rate' },
    reloadEfficiencyPct: { label: 'Reload Efficiency %', unit: 'pct', bucket: 'rate' },
    reloadSpeedPct:   { label: 'Reload Speed % (legacy)', unit: 'pct', bucket: 'rate' },
    magazinePct:      { label: 'Magazine %',            unit: 'pct', bucket: 'rate' },
    magazineFlat:     { label: 'Magazine (flat)',       unit: 'flat', bucket: 'rate' },
    rangePct:         { label: 'Range %',               unit: 'pct', bucket: 'rate' },
    statusChancePct:  { label: 'Status trigger chance %', unit: 'pct', bucket: 'statusDmg' },
    maxHp:            { label: 'Max HP',                unit: 'flat', bucket: 'defense' },
    maxHpPct:         { label: 'Max HP %',              unit: 'pct', bucket: 'defense' },
    pollutionResist:  { label: 'Pollution Resist',      unit: 'flat', bucket: 'defense' },
    dmgReductionPct:  { label: 'DMG Reduction %',       unit: 'pct', bucket: 'defense' },
    healingPct:       { label: 'Healing %',             unit: 'pct', bucket: 'defense' },
    movementSpeedPct: { label: 'Movement Speed %',      unit: 'pct', bucket: 'utility' },
    staminaPct:       { label: 'Stamina %',             unit: 'pct', bucket: 'utility' },
    other:            { label: 'Other',                 unit: 'text', bucket: 'utility' },
  };

  const ELEMENTS = ['blaze', 'frost', 'blast', 'shock', 'physical'];
  const KEYWORD_ELEMENT = {
    burn: 'blaze', frostVortex: 'frost', powerSurge: 'shock', unstableBomber: 'blast',
    shrapnel: 'physical', bounce: 'physical', bullsEye: 'physical', fastGunner: 'physical', fortressWarfare: 'physical',
  };
  const TARGET_TYPES = ['deviant', 'human', 'monster', 'elite', 'boss', 'player'];

  // Aliases accepted from data files (lower-cased, punctuation stripped) -> canonical stat id
  const ALIASES = {
    attack: 'attackPct', attackpct: 'attackPct', atk: 'attackPct', dmg: 'attackPct', basedmg: 'attackPct', attackbonus: 'attackPct',
    attackflat: 'attackFlat',
    weapondmg: 'weaponDmgPct', weapondmgpct: 'weaponDmgPct', weapondamage: 'weaponDmgPct', weapondmgbonus: 'weaponDmgPct',
    elementaldmg: 'elementalDmgPct', elementaldmgpct: 'elementalDmgPct', elementaldamage: 'elementalDmgPct',
    blazedmg: 'elementalDmgPct:blaze', frostdmg: 'elementalDmgPct:frost', blastdmg: 'elementalDmgPct:blast', shockdmg: 'elementalDmgPct:shock',
    statusdmg: 'statusDmgPct', statusdmgpct: 'statusDmgPct', statusdamage: 'statusDmgPct', psiintensitydmg: 'statusDmgPct',
    burndmg: 'keywordDmgPct:burn', frostvortexdmg: 'keywordDmgPct:frostVortex', powersurgedmg: 'keywordDmgPct:powerSurge',
    unstablebomberdmg: 'keywordDmgPct:unstableBomber', shrapneldmg: 'keywordDmgPct:shrapnel', bouncedmg: 'keywordDmgPct:bounce',
    bullseyedmg: 'keywordDmgPct:bullsEye', thebullseyedmg: 'keywordDmgPct:bullsEye', fastgunnerdmg: 'keywordDmgPct:fastGunner', fortresswarfaredmg: 'keywordDmgPct:fortressWarfare',
    finaldmg: 'finalDmgPct', finaldmgpct: 'finalDmgPct',
    critrate: 'critRatePct', critratepct: 'critRatePct', criticalrate: 'critRatePct', critchance: 'critRatePct',
    critdmg: 'critDmgPct', critdmgpct: 'critDmgPct', criticaldmg: 'critDmgPct', criticaldamage: 'critDmgPct',
    weakspotdmg: 'weakspotDmgPct', weakspotdmgpct: 'weakspotDmgPct', weakspotdamage: 'weakspotDmgPct', weakspot: 'weakspotDmgPct',
    dmgvs: 'dmgVsPct', dmgvspct: 'dmgVsPct', dmgvsdeviants: 'dmgVsPct:deviant', dmgvsdeviant: 'dmgVsPct:deviant', dmgvshumans: 'dmgVsPct:human', dmgvshuman: 'dmgVsPct:human',
    dmgvsmonsters: 'dmgVsPct:monster', dmgvselites: 'dmgVsPct:elite', dmgvsbosses: 'dmgVsPct:boss', dmgvsplayers: 'dmgVsPct:player',
    vulnerability: 'weaponVulnPct', vulnerabilitypct: 'weaponVulnPct', weaponvulnerability: 'weaponVulnPct', weaponvuln: 'weaponVulnPct', weaponvulnpct: 'weaponVulnPct',
    statusvulnerability: 'statusVulnPct', statusvuln: 'statusVulnPct', statusvulnpct: 'statusVulnPct',
    alldmg: 'allDmgPct', alldmgpct: 'allDmgPct', alldamage: 'allDmgPct', damagebonus: 'allDmgPct',
    psiintensity: 'psiIntensity', psi: 'psiIntensity', psiintensityflat: 'psiIntensity',
    psiintensitypct: 'psiIntensityPct', psipct: 'psiIntensityPct',
    firerate: 'fireRatePct', fireratepct: 'fireRatePct', rpm: 'fireRatePct',
    reloadefficiency: 'reloadEfficiencyPct', reloadefficiencypct: 'reloadEfficiencyPct', reload: 'reloadEfficiencyPct',
    reloadspeed: 'reloadSpeedPct', reloadspeedpct: 'reloadSpeedPct',
    magazine: 'magazinePct', magazinepct: 'magazinePct', magcapacity: 'magazinePct', magcapacitypct: 'magazinePct', mag: 'magazinePct', magazinecapacity: 'magazinePct',
    magazineflat: 'magazineFlat', magflat: 'magazineFlat',
    range: 'rangePct', rangepct: 'rangePct',
    statuschance: 'statusChancePct', triggerchance: 'statusChancePct', statustriggerchance: 'statusChancePct',
    maxhp: 'maxHp', hp: 'maxHp', maxhpflat: 'maxHp', maxhppct: 'maxHpPct', hppct: 'maxHpPct',
    pollutionresist: 'pollutionResist', pollutionresistance: 'pollutionResist', contaminationresistance: 'pollutionResist',
    dmgreduction: 'dmgReductionPct', dmgreductionpct: 'dmgReductionPct', damagereduction: 'dmgReductionPct',
    healing: 'healingPct', healingpct: 'healingPct', healingbonus: 'healingPct',
    movementspeed: 'movementSpeedPct', movementspeedpct: 'movementSpeedPct', movespeed: 'movementSpeedPct',
    stamina: 'staminaPct', staminapct: 'staminaPct',
  };

  function normKey(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  /** Resolve a raw stat name from a data file to {stat, key}. Returns stat 'other' when unknown. */
  function resolveStat(raw, extra) {
    if (!raw) return { stat: 'other' };
    if (STATS[raw]) return { stat: raw, key: extra || null };
    const n = normKey(raw);
    let hit = ALIASES[n];
    if (!hit) {
      // try stripping trailing "pct"/"bonus"/"boost"
      hit = ALIASES[n.replace(/(bonus|boost|pct|percent)$/, '')];
    }
    if (!hit) return { stat: 'other', key: null, raw };
    const [stat, key] = hit.split(':');
    return { stat, key: key || extra || null };
  }

  // ---------------------------------------------------------------------------
  // Effect normalisation
  // ---------------------------------------------------------------------------
  /**
   * Effect: { stat, value, key?, element?, keyword?, target?, condition?, source, enabled }
   * Values are percent points for *Pct stats, flat for flat stats.
   */
  function effect(stat, value, opts) {
    const o = opts || {};
    const r = resolveStat(stat, o.key || o.element || o.keyword || o.target);
    return {
      stat: r.stat,
      key: r.key || null,
      value: Number(value) || 0,
      condition: o.condition || null,
      source: o.source || '',
      sourceType: o.sourceType || 'other',
      enabled: o.enabled !== false,
      text: o.text || null,
      raw: r.raw || null,
    };
  }

  /** Aggregate enabled effects into totals keyed by stat (and sub-key for keyed stats). */
  function aggregate(effects) {
    const totals = {};      // stat -> number (unkeyed) or {key -> number}
    const sources = {};     // stat -> [{source, value, key}]
    for (const e of effects) {
      if (!e || !e.enabled || e.stat === 'other') continue;
      const def = STATS[e.stat];
      if (!def) continue;
      if (def.keyed) {
        const key = e.key || 'all';
        totals[e.stat] = totals[e.stat] || {};
        totals[e.stat][key] = (totals[e.stat][key] || 0) + e.value;
      } else {
        totals[e.stat] = (totals[e.stat] || 0) + e.value;
      }
      (sources[e.stat] = sources[e.stat] || []).push({ source: e.source, sourceType: e.sourceType, value: e.value, key: e.key || null, condition: e.condition });
    }
    return { totals, sources };
  }

  function keyedSum(totals, stat, key) {
    const t = totals[stat];
    if (!t) return 0;
    let v = t.all || 0;
    if (key && t[key]) v += t[key];
    return v;
  }
  function flat(totals, stat) { return totals[stat] || 0; }

  // ---------------------------------------------------------------------------
  // Star scaling & weapon base values
  // ---------------------------------------------------------------------------
  const DEFAULT_STAR_MULT = { 1: 1.00, 2: 1.05, 3: 1.10, 4: 1.15, 5: 1.20, 6: 1.25 };

  function starMultiplier(star, table) {
    const t = table || DEFAULT_STAR_MULT;
    const s = Math.min(6, Math.max(1, Math.round(star || 1)));
    const v = t[s] != null ? t[s] : t[String(s)];
    return v != null ? Number(v) : DEFAULT_STAR_MULT[s];
  }

  /**
   * Weapon attack at a given star. Prefers an explicit per-star table on the weapon,
   * else scales the 1★ (or listed) base by the global star multiplier.
   * weapon: { attack, attackStar (star the listed attack refers to, default 1), attackByStar?: {1..6} }
   */
  function weaponAttackAtStar(weapon, star, starTable) {
    if (!weapon) return 0;
    if (weapon.attackByStar && weapon.attackByStar[star] != null) return Number(weapon.attackByStar[star]);
    const base = Number(weapon.attack) || 0;
    const refStar = weapon.attackStar || 1;
    const ref = starMultiplier(refStar, starTable);
    return base / ref * starMultiplier(star, starTable);
  }

  // ---------------------------------------------------------------------------
  // Damage computation
  // ---------------------------------------------------------------------------
  const DEFAULT_OPTIONS = {
    critWeakspotModel: 'multiplicative',   // or 'additive' (1 + crit + weakspot)
    elementalAffectsBullets: false,       // unverified: apply matching Elemental DMG% to direct hits
    attackAndWeaponDmgSeparate: true,     // false: one additive bucket
    mitigation: 1,                        // target damage taken multiplier (level gap / armor) – unknown, default 1
    falloff: 1,                           // range falloff multiplier
    critRateCapPct: 100,
  };

  /**
   * @param {object} weapon  normalised weapon { name, class, element, keyword, attack, attackStar, attackByStar,
   *                           rpm, magazine, reloadTime, critRatePct, critDmgPct, weakspotDmgPct, pellets, burst,
   *                           statusChancePct, keywordFactor }
   * @param {number} star    1..6
   * @param {Array}  effects normalised effects (already filtered by enabled)
   * @param {object} ctx     { targetType, starTable, statusEffects (from formula.json), options }
   */
  function computeDamage(weapon, star, effects, ctx) {
    const opts = Object.assign({}, DEFAULT_OPTIONS, (ctx && ctx.options) || {});
    const { totals, sources } = aggregate(effects);
    const targetType = (ctx && ctx.targetType) || 'deviant';

    // --- base attack
    const attackBase = weaponAttackAtStar(weapon, star, ctx && ctx.starTable);
    const attackFlat = flat(totals, 'attackFlat');
    const attackPct = flat(totals, 'attackPct');
    const weaponDmgPct = flat(totals, 'weaponDmgPct');

    let attackMult, weaponDmgMult;
    if (opts.attackAndWeaponDmgSeparate) {
      attackMult = 1 + attackPct / 100;
      weaponDmgMult = 1 + weaponDmgPct / 100;
    } else {
      attackMult = 1 + (attackPct + weaponDmgPct) / 100;
      weaponDmgMult = 1;
    }
    const attack = (attackBase + attackFlat) * attackMult;

    // --- shared multipliers
    const element = weapon.element || KEYWORD_ELEMENT[weapon.keyword] || null;
    const elementalPct = element ? keyedSum(totals, 'elementalDmgPct', element) : 0;
    const dmgVsPct = keyedSum(totals, 'dmgVsPct', targetType);
    const weaponVulnPct = flat(totals, 'weaponVulnPct');
    const statusVulnPct = flat(totals, 'statusVulnPct');
    const allDmgPct = flat(totals, 'allDmgPct');
    const commonMult = (1 + dmgVsPct / 100) * (1 + allDmgPct / 100) * opts.mitigation;

    // --- crit & weakspot
    const critRate = Math.max(0, Math.min(opts.critRateCapPct, (Number(weapon.critRatePct) || 0) + flat(totals, 'critRatePct'))) / 100;
    const critDmgPct = (Number(weapon.critDmgPct) || 0) + flat(totals, 'critDmgPct');
    const weakspotPct = (Number(weapon.weakspotDmgPct) || 0) + flat(totals, 'weakspotDmgPct');
    const critMult = 1 + critDmgPct / 100;
    const weakMult = 1 + weakspotPct / 100;
    const critWeakMult = opts.critWeakspotModel === 'additive' ? (1 + critDmgPct / 100 + weakspotPct / 100) : critMult * weakMult;

    const directBase = attack * weaponDmgMult
      * (opts.elementalAffectsBullets ? (1 + elementalPct / 100) : 1)
      * (1 + weaponVulnPct / 100) * commonMult * opts.falloff;

    const pellets = Number(weapon.pellets) || 1;
    const hits = {
      normal: directBase,
      crit: directBase * critMult,
      weakspot: directBase * weakMult,
      weakspotCrit: directBase * critWeakMult,
    };
    const expectedBody = hits.normal * (1 - critRate) + hits.crit * critRate;
    const expectedWeak = hits.weakspot * (1 - critRate) + hits.weakspotCrit * critRate;

    // --- rate of fire, magazine, reload
    const rpm = (Number(weapon.rpm) || 0) * (1 + flat(totals, 'fireRatePct') / 100);
    const sps = rpm / 60;
    const magazine = Math.max(1, Math.floor(((Number(weapon.magazine) || 1) + flat(totals, 'magazineFlat')) * (1 + flat(totals, 'magazinePct') / 100)));
    const reloadEff = flat(totals, 'reloadEfficiencyPct') + legacyReloadToEfficiency(flat(totals, 'reloadSpeedPct'));
    const reloadTime = (Number(weapon.reloadTime) || 0) / (1 + reloadEff / 100);
    const magTime = sps > 0 ? magazine / sps : 0;
    const cycleTime = magTime + reloadTime;

    // --- status procs (Psi-scaled)
    const psiFlat = flat(totals, 'psiIntensity');
    const psi = psiFlat * (1 + flat(totals, 'psiIntensityPct') / 100);
    const statusDmgPct = flat(totals, 'statusDmgPct');
    const statusDefs = (ctx && ctx.statusEffects) || {};
    const keyword = weapon.keyword || null;
    let status = null;
    if (keyword) {
      const def = statusDefs[keyword] || {};
      const kwElement = def.element || KEYWORD_ELEMENT[keyword] || null;
      const factor = weapon.keywordFactor != null ? Number(weapon.keywordFactor) : (def.baseFactorPct != null ? def.baseFactorPct / 100 : null);
      const keywordPct = keyedSum(totals, 'keywordDmgPct', keyword);
      const finalPct = keyedSum(totals, 'finalDmgPct', keyword);
      const kwElementalPct = kwElement ? keyedSum(totals, 'elementalDmgPct', kwElement) : 0;
      const chance = Math.min(100, (Number(weapon.statusChancePct) || def.triggerChancePct || 0) + flat(totals, 'statusChancePct'));
      if (def.scalesWith === 'attack' || keyword === 'shrapnel' || keyword === 'bounce') {
        // bullet keyword: % of attack through the direct chain (can crit & weakspot)
        const f = factor != null ? factor : 0;
        const procBase = directBase * f * (1 + keywordPct / 100) * (1 + finalPct / 100);
        status = {
          keyword, model: 'attack', element: kwElement, factor: f, chancePct: chance,
          perProc: procBase, perProcCrit: procBase * critMult, perProcWeakspot: procBase * weakMult,
          expected: procBase * (1 - critRate) + procBase * critMult * critRate,
          canCrit: true, canWeakspot: true,
          tickSeconds: def.tickSeconds || null, durationSeconds: def.durationSeconds || null,
          note: def.notes || null,
        };
      } else if (factor != null) {
        const proc = psi * factor * (1 + (statusDmgPct + keywordPct) / 100) * (1 + kwElementalPct / 100) * (1 + finalPct / 100)
          * (1 + statusVulnPct / 100) * commonMult;
        const ticks = def.tickSeconds && def.durationSeconds ? Math.round(def.durationSeconds / def.tickSeconds) : 1;
        status = {
          keyword, model: 'psi', element: kwElement, factor, chancePct: chance,
          perProc: proc, expected: proc, canCrit: false, canWeakspot: false,
          tickSeconds: def.tickSeconds || null, durationSeconds: def.durationSeconds || null, ticksPerApplication: ticks,
          perApplication: proc * ticks,
          note: def.notes || null,
        };
      } else {
        status = { keyword, model: 'unknown', chancePct: chance, perProc: null, expected: null, note: def.notes || 'No damage formula available for this keyword.' };
      }
    }

    // --- DPS
    const perShotBody = expectedBody * pellets;
    const perShotWeak = expectedWeak * pellets;
    const statusPerShot = status && status.expected != null ? status.expected * (status.chancePct / 100 || (status.chancePct === 0 ? 0 : 1)) : 0;
    const dps = {
      burstBody: perShotBody * sps,
      burstWeakspot: perShotWeak * sps,
      sustainedBody: cycleTime > 0 ? (perShotBody * magazine) / cycleTime : 0,
      sustainedWeakspot: cycleTime > 0 ? (perShotWeak * magazine) / cycleTime : 0,
      statusBurst: statusPerShot * sps,
      statusSustained: cycleTime > 0 ? (statusPerShot * magazine) / cycleTime : 0,
      magazineDamageBody: perShotBody * magazine,
      magazineDamageWeakspot: perShotWeak * magazine,
    };
    dps.totalBurstBody = dps.burstBody + dps.statusBurst;
    dps.totalSustainedBody = dps.sustainedBody + dps.statusSustained;
    dps.totalBurstWeakspot = dps.burstWeakspot + dps.statusBurst;
    dps.totalSustainedWeakspot = dps.sustainedWeakspot + dps.statusSustained;

    // --- defense
    const maxHp = (flat(totals, 'maxHp')) * (1 + flat(totals, 'maxHpPct') / 100);
    const defense = {
      maxHp, pollutionResist: flat(totals, 'pollutionResist'), dmgReductionPct: flat(totals, 'dmgReductionPct'),
    };

    return {
      inputs: { star, targetType, options: opts, pellets },
      attack: { base1Star: weaponAttackAtStar(weapon, 1, ctx && ctx.starTable), atStar: attackBase, starMultiplier: starMultiplier(star, ctx && ctx.starTable), flat: attackFlat, pct: attackPct, final: attack },
      multipliers: {
        attackMult, weaponDmgMult, weaponDmgPct, elementalPct, elementalApplied: opts.elementalAffectsBullets,
        critRatePct: critRate * 100, critDmgPct, critMult, weakspotPct, weakMult, critWeakMult,
        dmgVsPct, weaponVulnPct, statusVulnPct, allDmgPct, commonMult, falloff: opts.falloff, mitigation: opts.mitigation,
      },
      hits, expectedBody, expectedWeak,
      rate: { rpm, shotsPerSecond: sps, magazine, reloadTime, reloadEfficiencyPct: reloadEff, magTime, cycleTime },
      psi: { flat: psiFlat, pct: flat(totals, 'psiIntensityPct'), effective: psi, statusDmgPct },
      status, dps, defense,
      totals, sources,
    };
  }

  /** Legacy "Reload Speed %" to Reload Efficiency % (max conversion per 2025-05-21 patch: +10% -> +3%). */
  function legacyReloadToEfficiency(reloadSpeedPct) { return (reloadSpeedPct || 0) * 0.3; }

  // ---------------------------------------------------------------------------
  // Comparison helpers (with food vs without, build A vs B)
  // ---------------------------------------------------------------------------
  function compare(a, b) {
    const pick = (r) => ({
      normal: r.hits.normal, crit: r.hits.crit, weakspot: r.hits.weakspot, weakspotCrit: r.hits.weakspotCrit,
      expectedBody: r.expectedBody, expectedWeak: r.expectedWeak,
      status: r.status && r.status.expected != null ? r.status.expected : 0,
      burstBody: r.dps.totalBurstBody, sustainedBody: r.dps.totalSustainedBody,
      burstWeakspot: r.dps.totalBurstWeakspot, sustainedWeakspot: r.dps.totalSustainedWeakspot,
      maxHp: r.defense.maxHp,
    });
    const A = pick(a), B = pick(b);
    const out = {};
    for (const k of Object.keys(A)) out[k] = { a: A[k], b: B[k], delta: B[k] - A[k], deltaPct: A[k] ? (B[k] - A[k]) / A[k] * 100 : null };
    return out;
  }

  global.Engine = {
    STATS, ELEMENTS, KEYWORD_ELEMENT, TARGET_TYPES, DEFAULT_STAR_MULT, DEFAULT_OPTIONS,
    resolveStat, effect, aggregate, starMultiplier, weaponAttackAtStar, computeDamage, compare, legacyReloadToEfficiency, normKey,
  };
})(typeof window !== 'undefined' ? window : globalThis);
