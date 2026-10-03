/* Once Human Build Planner – data adapter.
 * Turns the raw research JSON (window.OH_DATA.*) into engine-ready catalogues and
 * converts a build selection into a flat list of engine effects. No DOM code here.
 */
(function (global) {
  'use strict';
  const E = global.Engine;

  const SLOTS = ['Helmet', 'Mask', 'Top', 'Gloves', 'Pants', 'Shoes'];
  const SLOT_ALIASES = { bottoms: 'Pants', bottom: 'Pants', legs: 'Pants', boots: 'Shoes', hat: 'Helmet', head: 'Helmet', jacket: 'Top', chest: 'Top' };
  const KEYWORD_IDS = {
    'burn': 'burn', 'frost vortex': 'frostVortex', 'power surge': 'powerSurge', 'unstable bomber': 'unstableBomber',
    'shrapnel': 'shrapnel', 'bounce': 'bounce', "the bull's eye": 'bullsEye', "bull's eye": 'bullsEye', 'bulls eye': 'bullsEye',
    'fast gunner': 'fastGunner', 'fortress warfare': 'fortressWarfare',
  };
  const ELEMENT_IDS = { blaze: 'blaze', fire: 'blaze', frost: 'frost', ice: 'frost', blast: 'blast', explosive: 'blast', shock: 'shock', electric: 'shock', physical: 'physical' };
  const CLASS_TO_CALIB = { AR: 'Assault Rifle', SMG: 'Submachine Gun', LMG: 'Light Machine Gun', Shotgun: 'Shotgun', Sniper: 'Sniper Rifle', Pistol: 'Pistol', Crossbow: 'Crossbow', Launcher: 'Heavy Artillery', Melee: null };
  const OHDB_TO_CARD_RATIO = 1.52; // OHDB "Tier V" = official artLevel 4; in-game Tier V card = artLevel 5 (see research/calculators.md)
  // Per-rarity star series from the official blueprint tables (research/verify-stars.json): epic caps at 5★, rare at 4★, standard at 3★.
  const SERIES = { legendary: [1, 1.05, 1.1, 1.15, 1.2, 1.25], epic: [1, 1.05575, 1.1115, 1.16725, 1.223], rare: [1, 1.06266666667, 1.12533333333, 1.188], uncommon: [1, 1.0715, 1.143], standard: [1, 1.0715, 1.143] };
  function rarityKeyOf(r) { r = String(r || '').toLowerCase(); return /legend/.test(r) ? 'legendary' : /epic/.test(r) ? 'epic' : /rare/.test(r) ? 'rare' : /uncommon/.test(r) ? 'uncommon' : 'standard'; }
  // Weapon-specific keyword trigger chances (percent per shot) from research/verify-status.json; null = unknown (status DPS then omitted).
  const TRIGGER_CHANCE = { 'MPS7 - Outer Space': 25, 'ACS12 - Corrosion': 75, 'SOCR - Outsider': 35, 'SOCR - The Last Valor': 25, 'DE.50 - Jaws': 25, 'KAM - Abyss Glance': 5, 'MG4 - Predator': 40, 'AWS.338 - Bullseye': 70, 'MPS5 - Kumawink': 25, 'HAMR - Brahminy': 60, 'KVD - Boom! Boom!': 18, 'ACS12 - Pyroclasm Starter': 27, 'DBSG - Doombringer': 30, 'KV-SBR - Little Jaws': 100, 'MG4 - Conflicting Memories': 17, 'M416 - Silent Anabasis': 11, 'DE.50 - Wildfire': 60 };

  function normSlot(s) { if (!s) return null; const k = String(s).toLowerCase(); return SLOT_ALIASES[k] || (SLOTS.find(x => x.toLowerCase() === k) || s); }
  function keywordId(s) { if (!s) return null; return KEYWORD_IDS[String(s).toLowerCase().trim()] || null; }
  function elementId(s) { if (!s) return null; const m = String(s).toLowerCase().match(/blaze|fire|frost|ice|blast|explosive|shock|electric|physical/); return m ? ELEMENT_IDS[m[0]] : null; }
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  // ---------------------------------------------------------------------------
  // Stat-name interpretation for research-file vocabularies
  // ---------------------------------------------------------------------------
  /**
   * Convert a raw (stat, value, unit, text) from any data file into zero or more engine effects.
   * Handles keyword-/element-/target-specific names that the engine alias table cannot express alone.
   * meta: { unit, condition, source, sourceType, target ('player'|'enemy'), text }
   */
  const KW_LIST = [["the bull's eye", 'bullsEye'], ["bull's eye", 'bullsEye'], ['bulls eye', 'bullsEye'], ['frost vortex', 'frostVortex'], ['power surge', 'powerSurge'], ['unstable bomber', 'unstableBomber'], ['fast gunner', 'fastGunner'], ['fortress warfare', 'fortressWarfare'], ['shrapnel', 'shrapnel'], ['bounce', 'bounce'], ['burn', 'burn']];
  const MECHANIC_RE = /\b(weight|hit rate|refill|auto ?reload|shield|cooldown|lonely cortex|extra triggers?|triggers?\b|hit parts?|max stacks?|stacks? per|stacks? retained|spread|delay|durability|interval|usage speed|medicine|energy|sanity|stamina|resist(?!ance to)|yield|xp\b|rescue|jump|glide|accuracy|stability|mobility|melee|heavy attack|tactical item|sentry|suppression|purge|revive|clone|aggro|knockback|slow|root|immobil|confusion|pull|platform|wall|absorption|sprint|blink|share|bullets?\b|ammo|count\b|targets?\b|parts?\b|self.?dam|retained|frequency|guaranteed|applied|detonation|state|secured|securement|links?\b|items? gathered|resource|body size|full stomach|debuffs you inflict|duration|can crit|range\b)/;

  function toEffects(rawStat, value, meta) {
    const out = [];
    if (value == null || isNaN(Number(value))) return out;
    const m = Object.assign({}, meta || {});
    const name = String(rawStat || '');
    const low = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
    const unit = String(m.unit || '').toLowerCase();
    const isFlat = unit === 'flat' || /\(flat\)/.test(low);
    const enemy = m.target === 'enemy';
    const push = (stat, v, key, extra) => out.push(E.effect(stat, v, Object.assign({}, m, { key }, extra || {})));
    const other = () => { push('other', value, null, { text: name }); return out; };

    // Psi-scaled procs and pure mechanics are not stats
    if (/\bpsi$|pct psi\b|psi\b.*(dmg|damage)|(dmg|damage).*\bpsi\b/.test(low) && !/^psi intensity/.test(low)) return other();
    if (unit.includes('psi')) return other();
    const keywords = KW_LIST.filter(([k]) => low.includes(k)).map(([, id]) => id).filter((id, i, a) => a.indexOf(id) === i);
    const elements = Array.from(new Set((low.match(/\b(blaze|frost|blast|shock)\b/g) || []).map(e => ELEMENT_IDS[e])));
    const isDmgish = /\b(dmg|damage|factor|coefficient)\b/.test(low);
    const ctxText = String(m.condition || m.text || '').toLowerCase();
    // Generic "DMG" lines whose text names an enemy tier ("Normal enemies take +15% DMG") are DMG-vs-type
    if (/^(dmg|damage|weapon dmg)$/.test(low)) {
      const tier = ctxText.match(/\b(normal|elite|boss)\b[^.]{0,40}\btake/);
      if (tier) { push('dmgVsPct', value, tier[1]); return out; }
      if (/enemies affected by|targets affected by/.test(ctxText)) { push('weaponVulnPct', value, null, { condition: m.condition || m.text }); push('statusVulnPct', value, null, { condition: m.condition || m.text }); return out; }
    }

    // --- target-side debuffs ("X DMG taken", "vulnerability")
    if (enemy || /\btaken\b|vulnerab/.test(low)) {
      if (/weakspot dmg taken|weakspot damage taken/.test(low)) { push('weakspotDmgPct', value, null, { condition: m.condition || 'target debuff' }); return out; }
      if (/status (dmg|damage) taken|status vulnerab/.test(low)) { push('statusVulnPct', value, null); return out; }
      if (/weapon (dmg|damage) taken|weapon vulnerab/.test(low)) { push('weaponVulnPct', value, null); return out; }
      if (elements.length && /taken|vulnerab/.test(low)) { push('elementalDmgPct', value, elements.length > 1 ? 'all' : elements[0], { condition: m.condition || 'target debuff' }); return out; }
      if (keywords.length && /taken/.test(low)) { for (const k of keywords) push('keywordDmgPct', value, k, { condition: m.condition || 'target debuff' }); return out; }
      if (/vulnerab/.test(low) || (enemy && /\b(dmg|damage) taken\b/.test(low))) { push('weaponVulnPct', value, null); push('statusVulnPct', value, null); return out; }
      if (enemy) return other();
    }
    // --- player-side defence
    if (/dmg reduction|damage reduction/.test(low)) { push('dmgReductionPct', value, null); return out; }
    if (/(dmg|damage) (taken|received)|(dmg|damage) from (monsters|deviants|players|meta)/.test(low)) { push('dmgReductionPct', -value, null); return out; }

    // --- combined / multi-keyword lines (before the keyword branch)
    if (/weapon (and|&) status dmg|weapon.*status dmg/.test(low)) { push('weaponDmgPct', value, null); push('statusDmgPct', value, null); return out; }
    if (/continuous dmg/.test(low)) { push('keywordDmgPct', value, 'burn'); push('keywordDmgPct', value, 'frostVortex'); return out; }
    if (/instant dmg/.test(low)) { push('keywordDmgPct', value, 'powerSurge'); push('keywordDmgPct', value, 'unstableBomber'); return out; }

    // --- target-type damage
    if (/^(dmg|damage)\s*(vs|against|to)\b|\b(dmg|damage) (vs|against|to) /.test(low) || /^(normal|elite|boss) enemies take/.test(low)) {
      if (/super anomaly|anomaly/.test(low)) return other();
      if (/bull.?s eye|marked|hunter.?s mark/.test(low)) { push('weaponDmgPct', value, null, { condition: (m.condition || 'vs targets under The Bull\'s Eye') }); return out; }
      const keys = [];
      if (/deviant/.test(low)) keys.push('deviant');
      if (/human|meta/.test(low)) keys.push('human');
      if (/monster/.test(low)) keys.push('monster');
      if (/normal/.test(low)) keys.push('normal');
      if (/elite/.test(low)) keys.push('elite');
      if (/boss|great one/.test(low)) keys.push('boss');
      if (/player/.test(low)) keys.push('player');
      if (/shield/.test(low)) keys.push('shield');
      if (!keys.length) keys.push('all');
      for (const k of keys) push('dmgVsPct', value, k);
      return out;
    }
    if (/dmg vs marked|vs marked|marked enemy dmg/.test(low)) { push('weaponDmgPct', value, null, { condition: m.condition || 'vs marked targets' }); return out; }

    // --- keyword-specific
    if (keywords.length) {
      if (/final (dmg|damage)/.test(low)) { for (const k of keywords) push('finalDmgPct', value, k); return out; }
      if (/crit (dmg|damage)/.test(low)) { for (const k of keywords) push('keywordCritDmgPct', value, k); return out; }
      if (/crit rate|crit chance/.test(low)) return other();
      if (/trigger chance|trigger factor|\bchance\b/.test(low) && !/extra stack|stack chance/.test(low)) { push('statusChancePct', value, null, { condition: m.condition || null, text: name }); return out; }
      if (MECHANIC_RE.test(low) || /nth hit|every \d+|loss due to/.test(low)) return other();
      if (/weakspot/.test(low)) { for (const k of keywords) push('keywordWeakspotDmgPct', value, k); return out; }
      if (isDmgish || /\bdmg rate\b/.test(low)) { for (const k of keywords) push('keywordDmgPct', value, k); return out; }
      return other();
    }
    // --- mechanics that are not stats
    if (MECHANIC_RE.test(low) && !/^(max hp|hp|crit rate|crit dmg)/.test(low)) return other();

    // --- element-specific
    if (elements.length && (isDmgish || /elemental/.test(low))) { push('elementalDmgPct', value, elements.length > 1 ? 'all' : elements[0]); return out; }
    if (/elemental (dmg|damage)|element.?s dmg|element dmg/.test(low)) { push('elementalDmgPct', value, 'all'); return out; }

    // --- generic stats
    if (/psi intensity (dmg|damage)/.test(low)) { push('statusDmgPct', value, null); return out; }
    if (/^psi intensity|^psi$/.test(low)) { push(unit === 'percent' || unit === '%' || /pct|%/.test(low) ? 'psiIntensityPct' : 'psiIntensity', value, null); return out; }
    if (/final (dmg|damage)/.test(low)) { push('finalDmgPct', value, 'all'); return out; }
    if (/^attack\b|attack pct|attack %|\battack\b/.test(low) && !/speed|melee|heavy/.test(low)) { push(isFlat ? 'attackFlat' : 'attackPct', value, null); return out; }
    if (/all (dmg|damage)|damage boost|final attack/.test(low)) { push('allDmgPct', value, null); return out; }
    if (/status (dmg|damage)/.test(low)) { push('statusDmgPct', value, null); return out; }
    if (/crit rate|critical rate|crit chance/.test(low)) { push('critRatePct', value, null); return out; }
    if (/crit (dmg|damage)|critical (dmg|damage)/.test(low)) { push('critDmgPct', value, null); return out; }
    if (/weakspot/.test(low)) { push('weakspotDmgPct', value, null); return out; }
    if (/weapon (dmg|damage)|^dmg$|^damage$|^dmg pct$|^damage pct$|^dmg %$/.test(low)) { push(isFlat && unit === 'flat' && !/pct|%/.test(low) ? 'weaponDmgPct' : 'weaponDmgPct', value, null); return out; }
    if (/fire rate/.test(low)) { push('fireRatePct', value, null); return out; }
    if (/reload/.test(low)) { push('reloadEfficiencyPct', value, null); return out; }
    if (/magazine|mag capacity|mag cap/.test(low)) { push(isFlat ? 'magazineFlat' : 'magazinePct', value, null); return out; }
    if (/max hp|^hp$|hp pct/.test(low)) { push(isFlat || unit === 'flat' ? 'maxHp' : 'maxHpPct', value, null); return out; }
    if (/pollution|contamination/.test(low)) { push('pollutionResist', value, null); return out; }
    if (/movement speed|move speed/.test(low)) { push('movementSpeedPct', value, null); return out; }
    if (/healing|heal\b/.test(low)) { push('healingPct', value, null); return out; }
    if (/^range/.test(low)) { push('rangePct', value, null); return out; }
    const r = E.resolveStat(name);
    if (r.stat !== 'other' && r.stat !== 'attackPct') push(r.stat, value, r.key);
    else push('other', value, null, { text: name });
    return out;
  }

  /** Does an effect's condition/text describe a situational trigger (so the UI should expose a toggle)? */
  function isConditionalText(t) {
    if (!t) return false;
    return /\b(after|when|while|within|during|upon|each|every|per\b|stacks?|against|affected|marked|if\b|on (kill|hit|defeat|crit|weakspot|reload)|below|above|for \d+ ?s|lasts?|at night|daytime|airborne|full|empty|first|next|chance)\b/i.test(t);
  }

  /** Normalise stack semantics into {baseValue, perStackValue, maxStacks, maxValue}. Mod data stores
   *  value = total-at-max with perStack = increment (or value = base with maxValue), set bonuses store value per stack. */
  function stackify(fx, raw) {
    if (!raw) return fx;
    if (typeof raw.perStack === 'number') {
      fx.perStack = true; fx.perStackValue = raw.perStack;
      if (raw.maxValue != null) { fx.baseValue = raw.value; fx.maxStacks = raw.maxStacks || Math.max(1, Math.round((raw.maxValue - raw.value) / raw.perStack)); fx.maxValue = raw.maxValue; }
      else { fx.maxStacks = raw.maxStacks || Math.max(1, Math.round(raw.value / raw.perStack)); fx.baseValue = Math.max(0, raw.value - raw.perStack * fx.maxStacks); fx.maxValue = raw.value >= raw.perStack * fx.maxStacks ? raw.value : null; }
    } else if (raw.perStack === true || raw.perStackValue != null) {
      fx.perStack = true; fx.perStackValue = raw.perStackValue != null ? raw.perStackValue : fx.value; fx.baseValue = 0; fx.maxStacks = raw.maxStacks || raw.stacks || null; fx.maxValue = raw.maxValue || null;
    }
    return fx;
  }

  // ---------------------------------------------------------------------------
  // Catalogue builders
  // ---------------------------------------------------------------------------
  function buildWeapons(raw, official) {
    const starTable = { 1: 1, 2: 1.05, 3: 1.1, 4: 1.15, 5: 1.2, 6: 1.25 }; // legendary blueprint presetAttackRatio (official tables)
    const offByName = new Map();
    if (official && Array.isArray(official.weapons)) {
      for (const o of official.weapons) { offByName.set(o.name, o); for (const a of o.aliases || []) offByName.set(a, o); }
    }
    const list = [];
    for (const w of raw.weapons || []) {
      const o = offByName.get(w.name) || (w.aliases || []).map(a => offByName.get(a)).find(Boolean) || null;
      const keyword = keywordId(w.statusKeyword);
      let attack = null, attackSource = 'none';
      let starRatios = null;
      if (o && o.cardAttackTier5 != null) {
        attack = Number(o.cardAttackTier5); attackSource = 'official';
        // Some official rows are non-upgradable variants (flat ratio series); legendary/epic blueprints use the 5%-per-star series.
        starRatios = Array.isArray(o.starRatios) && o.starRatios.length >= 6 && o.starRatios.some(r => r !== 1) ? o.starRatios : null;
      }
      else if (w.baseDmg != null) { attack = Math.round(Number(w.baseDmg) * OHDB_TO_CARD_RATIO); attackSource = 'ohdb-scaled'; }
      const rpm = o && o.fireRateRPM ? Number(o.fireRateRPM) : (o && o.fireIntervalSec ? Math.round(60 / o.fireIntervalSec) : (w.fireRateRPM || null));
      const reload = o && o.reloadLoopTime ? Number(o.reloadLoopTime) : (w.reloadTimeSec || null);
      const magazine = (o && (o.magazine != null ? o.magazine : o.magazineOhdbMirror)) ?? w.magazine ?? null;
      const rarityKey = rarityKeyOf(w.rarity);
      const series = starRatios || SERIES[rarityKey] || SERIES.legendary;
      const maxStars = series.length;
      const attackByStar = {};
      if (attack != null) for (let s = 1; s <= maxStars; s++) attackByStar[s] = Math.round(attack * series[s - 1]);
      list.push({
        id: slug(w.name), name: w.name, aliases: w.aliases || [], rarity: (w.rarity || '').toLowerCase(), class: w.weaponClass || 'Other', frame: w.frame || null,
        element: elementId(w.element) || E.KEYWORD_ELEMENT[keyword] || null, keyword, keywordLabel: w.statusKeyword || null,
        specialEffect: w.specialEffect || null,
        attack, attackSource, attackStar: 1, attackByStar, starRatios: series, maxStars,
        ohdbListedDmg: w.baseDmg != null ? Number(w.baseDmg) : null, tier1Dmg: w.baseDmgTier1_game8 != null ? Number(w.baseDmgTier1_game8) : null,
        pellets: w.pellets || 1, rpm, magazine, reloadTime: reload, burst: o && o.burstBulletNum ? o.burstBulletNum : null,
        critRatePct: o && o.critRatePct != null ? o.critRatePct : (w.baseCritRate ?? null),
        critDmgPct: o && o.critDmgPct != null ? o.critDmgPct : (w.baseCritDmg ?? null),
        weakspotDmgPct: o && o.weakspotDmgPct != null ? o.weakspotDmgPct : (w.baseWeakspotDmg ?? null),
        falloff: o && o.falloff ? o.falloff : (w.effectiveRangeM ? { fullDamageRangeM: w.effectiveRangeM, minDamageRangeM: w.minDamageRangeM || null, minDamageFraction: w.minDamagePercent != null ? w.minDamagePercent / 100 : null } : null),
        ammoType: w.ammoType || null, dataQuality: w.dataQuality || null,
        sources: w.sources || [], official: o || null, triggerChancePct: TRIGGER_CHANCE[w.name] != null ? TRIGGER_CHANCE[w.name] : null,
      });
    }
    list.sort((a, b) => (a.rarity === b.rarity ? a.name.localeCompare(b.name) : (a.rarity === 'legendary' ? -1 : 1)));
    return { list, byId: Object.fromEntries(list.map(w => [w.id, w])), starTable };
  }

  function buildArmor(raw) {
    const tierMult = (raw.starScaling && raw.starScaling.tierMultipliersFromTier1) || { maxHp: { V: 9.8333 }, psiIntensity: { V: 5.75 } };
    const hpTierV = (tierMult.maxHp && tierMult.maxHp.V) || 9.8333;
    const psiTierV = (tierMult.psiIntensity && tierMult.psiIntensity.V) || 5.75;
    const post231Hp = 1.2542; // v2.3.1 re-based Tier V HP (OHDB 740 = 590 x 1.2542; 6-star = 925) – research/verify-stars.json
    const slotMeta = {};
    for (const s of raw.slots || []) slotMeta[normSlot(s.slot)] = s;
    const pieces = [];
    const sets = [];
    for (const set of raw.sets || []) {
      const setId = slug(set.name);
      const bonuses = (set.setBonuses || []).map(b => ({ pieces: b.pieces, text: b.text, effects: (b.effects || []).map(e => normaliseEffectDef(e, `${set.name} ${b.pieces}pc`, 'armor-set')).flat(), alternatives: b.alternatives || [] }));
      sets.push({ id: setId, name: set.name, rarity: (set.rarity || '').toLowerCase(), style: set.style || null, bonuses, maxPieces: set.maxPieces || set.pieces.length });
      for (const p of set.pieces || []) {
        pieces.push(makePiece(p, set, setId, 'set'));
      }
    }
    for (const k of raw.keyArmor || []) pieces.push(makePiece(k, null, null, 'key'));
    function makePiece(p, set, setId, kind) {
      const slot = normSlot(p.slot);
      const base = p.baseStats || {};
      const effects = (p.effects || []).map(e => normaliseEffectDef(Object.assign({}, e, { condition: e.condition || (kind === 'key' && isConditionalText(p.effectText) ? p.effectText : null) }), p.name, 'armor-piece')).flat();
      return {
        id: slug(p.name), name: p.name, slot, kind, setId, setName: set ? set.name : null, rarity: ((p.rarity || (set && set.rarity) || '')).toLowerCase(),
        keyword: keywordId(p.keyword), effectText: p.effectText || null, effects, alternatives: p.alternatives || [], maxStars: (SERIES[rarityKeyOf((p.rarity || (set && set.rarity) || ''))] || SERIES.legendary).length,
        baseTier1: { maxHp: base.maxHp ?? null, psiIntensity: base.psiIntensity ?? null, pollutionResist: base.pollutionResist ?? null },
        sources: p.sources || [],
      };
    }
    pieces.sort((a, b) => a.name.localeCompare(b.name));
    return {
      sets, setsById: Object.fromEntries(sets.map(s => [s.id, s])), pieces, piecesById: Object.fromEntries(pieces.map(p => [p.id, p])),
      slots: SLOTS, slotMeta,
      /** Tier V base stats at a star (post-2.3.1 HP re-base applied). */
      baseStatsAt(piece, star, opts) {
        const o = Object.assign({ tier: 'V', post231: true }, opts || {});
        const series = SERIES[rarityKeyOf(piece.rarity)] || SERIES.legendary;
        const st = Math.max(1, Math.min(series.length, star || 1));
        const sm = series[st - 1];
        const hpT = (tierMult.maxHp && tierMult.maxHp[o.tier]) || hpTierV;
        const psiT = (tierMult.psiIntensity && tierMult.psiIntensity[o.tier]) || psiTierV;
        const hp = piece.baseTier1.maxHp != null ? Math.round(piece.baseTier1.maxHp * hpT * sm * (o.post231 ? post231Hp : 1)) : null;
        const psi = piece.baseTier1.psiIntensity != null ? Math.round(piece.baseTier1.psiIntensity * psiT * sm) : null;
        const sMeta = slotMeta[piece.slot];
        let pr = null;
        if (sMeta && raw.starScaling && raw.starScaling.tierMultipliersFromTier1 && raw.starScaling.tierMultipliersFromTier1.pollutionResistPost231) {
          const prp = raw.starScaling.tierMultipliersFromTier1.pollutionResistPost231;
          const grp = /mask|top/i.test(piece.slot) ? 'maskTop' : 'helmetGlovesPantsShoes';
          pr = o.tier === 'V' ? (prp.tier5 && prp.tier5[grp]) : (prp.tier1 && prp.tier1[grp]);
        }
        return { maxHp: hp, psiIntensity: psi, pollutionResist: pr ?? null, starMultiplier: sm, star: st, maxStars: series.length };
      },
    };
  }

  /** Normalise an effect definition {stat, value, condition, perStack, maxStacks, duration} into engine effects with metadata. */
  function normaliseEffectDef(e, source, sourceType) {
    if (!e || e.value == null) return [];
    const effects = toEffects(e.stat, e.value, { unit: e.unit, condition: e.condition, source, sourceType });
    for (const fx of effects) {
      stackify(fx, e);
      fx.duration = e.duration || e.durationSeconds || null;
      fx.conditional = !!(e.condition) || !!fx.perStack;
      fx.id = `${slug(source)}:${fx.stat}:${fx.key || ''}:${slug(e.stat)}`;
      fx.rawStat = e.stat;
    }
    return effects;
  }

  function buildMods(raw) {
    const conv = (m, kind) => {
      const eff = m.effect || {};
      const st = kind === 'weapon' ? 'weapon-mod' : 'armor-mod';
      let effects = eff.value != null ? toEffects(eff.stat, eff.value, { unit: eff.unit, condition: eff.condition, source: m.name, sourceType: st }) : [];
      const split = [];
      for (const fx of effects) {
        stackify(fx, eff);
        fx.conditional = (!!eff.condition && !/^\s*$/.test(eff.condition) && !/always/i.test(eff.condition)) || !!fx.perStack;
        fx.id = `${slug(m.name)}:${fx.stat}:${fx.key || ''}`; fx.rawStat = eff.stat;
        if (fx.perStack && fx.baseValue > 0) {
          // unconditional base part + stacking part
          const base = Object.assign({}, fx, { value: fx.baseValue, perStack: false, baseValue: 0, perStackValue: null, maxStacks: null, maxValue: null, conditional: false, id: fx.id + ':base', condition: null });
          fx.baseValue = 0; fx.maxValue = fx.maxValue != null ? fx.maxValue - base.value : null; fx.id += ':stacks';
          split.push(base);
        }
        split.push(fx);
      }
      effects = split;
      return {
        id: slug(m.name), name: m.name, kind, slot: normSlot(m.slot) || (kind === 'weapon' ? 'Weapon' : null), rarity: (m.rarity || 'legendary').toLowerCase(),
        keyword: keywordId(m.keyword), keywordLabel: m.keyword || null, text: eff.text || null, effects, suffixVariants: m.suffixVariants || [], notes: m.notes || null, sources: m.sources || [],
      };
    };
    const weaponMods = (raw.weaponMods || []).map(m => conv(m, 'weapon')).sort((a, b) => a.name.localeCompare(b.name));
    const armorMods = (raw.armorMods || []).map(m => conv(m, 'armor')).sort((a, b) => a.name.localeCompare(b.name));
    // Sub-attribute options: one per substat with per-rarity tier values
    const substats = [];
    for (const s of raw.substats || []) {
      const tiers = (s.tiers || []).map(t => ({ tier: t.tier, min: t.min, max: t.max }));
      const legendary = tiers.find(t => /legendary/i.test(t.tier)) || tiers[tiers.length - 1] || null;
      const expanded = expandSubstat(s.stat);
      for (const ex of expanded) {
        substats.push({ id: slug(ex.label), label: ex.label, stat: ex.stat, key: ex.key, unit: s.unit === 'flat' ? 'flat' : 'pct', appliesTo: s.appliesTo || ['weapon', 'armor'], tiers, defaultValue: legendary ? legendary.max : (ex.defaultValue || null), notes: s.notes || null });
      }
    }
    const suffixes = Array.isArray(raw.suffixes) ? raw.suffixes : Object.values(raw.suffixes || {});
    return { weaponMods, armorMods, byId: Object.fromEntries([...weaponMods, ...armorMods].map(m => [m.id, m])), substats, substatsById: Object.fromEntries(substats.map(s => [s.id, s])), suffixes, levelling: raw.levelling || null, substatCount: raw.substatCount || 4 };
  }

  /** Expand placeholder substat names like "<Keyword> DMG" into concrete options. */
  function expandSubstat(label) {
    const l = String(label);
    const kws = [['Shrapnel', 'shrapnel'], ['Bounce', 'bounce'], ['Burn', 'burn'], ['Frost Vortex', 'frostVortex'], ['Power Surge', 'powerSurge'], ['Unstable Bomber', 'unstableBomber'], ["The Bull's Eye", 'bullsEye'], ['Fast Gunner', 'fastGunner'], ['Fortress Warfare', 'fortressWarfare']];
    const els = [['Blaze', 'blaze'], ['Frost', 'frost'], ['Blast', 'blast'], ['Shock', 'shock']];
    if (/^<keyword> dmg/i.test(l)) return kws.map(([n, id]) => ({ label: `${n} DMG`, stat: 'keywordDmgPct', key: id, defaultValue: 10 }));
    if (/^<keyword> trigger chance/i.test(l)) return kws.map(([n, id]) => ({ label: `${n} Trigger Chance`, stat: 'statusChancePct', key: null, defaultValue: 6 }));
    if (/^<keyword> duration/i.test(l)) return [];
    if (/^<keyword> crit dmg/i.test(l)) return kws.map(([n, id]) => ({ label: `${n} Crit DMG`, stat: 'keywordCritDmgPct', key: id, defaultValue: 15 })).concat(kws.map(([n, id]) => ({ label: `${n} Weakspot DMG`, stat: 'keywordWeakspotDmgPct', key: id, defaultValue: 9 })));
    if (/^<element> elemental dmg/i.test(l)) return els.map(([n, id]) => ({ label: `${n} Elemental DMG`, stat: 'elementalDmgPct', key: id, defaultValue: 10 }));
    if (/instant keyword dmg|bullet-effect dmg/i.test(l)) return [];
    if (/^dmg vs normal/i.test(l)) return [{ label: 'DMG vs Normal', stat: 'dmgVsPct', key: 'normal' }];
    if (/^dmg vs elite/i.test(l)) return [{ label: 'DMG vs Elite', stat: 'dmgVsPct', key: 'elite' }];
    if (/^dmg vs boss/i.test(l)) return [{ label: 'DMG vs Boss / Great Ones', stat: 'dmgVsPct', key: 'boss' }];
    if (/^dmg reduction/i.test(l)) return [{ label: 'DMG Reduction', stat: 'dmgReductionPct', key: null, defaultValue: 5 }];
    if (/^reload/i.test(l)) return [{ label: 'Reload Efficiency', stat: 'reloadEfficiencyPct', key: null, defaultValue: 10 }];
    if (/^elemental dmg/i.test(l)) return [{ label: 'Elemental DMG (all)', stat: 'elementalDmgPct', key: 'all' }];
    if (/^psi intensity/i.test(l)) return [{ label: 'Psi Intensity', stat: 'psiIntensity', key: null, defaultValue: 30 }];
    if (/^max hp/i.test(l)) return [{ label: 'Max HP %', stat: 'maxHpPct', key: null, defaultValue: 5 }];
    if (/^crit rate/i.test(l)) return [{ label: 'Crit Rate', stat: 'critRatePct', key: null, defaultValue: 5 }];
    if (/^magazine/i.test(l)) return [{ label: 'Magazine Capacity', stat: 'magazinePct', key: null, defaultValue: 10 }];
    if (/^fire rate/i.test(l)) return [{ label: 'Fire Rate', stat: 'fireRatePct', key: null, defaultValue: 5 }];
    if (/^pollution/i.test(l)) return [{ label: 'Pollution Resist', stat: 'pollutionResist', key: null, defaultValue: 10 }];
    if (/^movement/i.test(l)) return [{ label: 'Movement Speed', stat: 'movementSpeedPct', key: null, defaultValue: 5 }];
    const r = E.resolveStat(l);
    return [{ label: l, stat: r.stat, key: r.key || null }];
  }

  function buildFood(raw) {
    const items = [];
    for (const it of raw.items || []) {
      const buffs = (it.buffs || []).filter(b => b && b.value != null && !isNaN(Number(b.value)));
      if (!buffs.length) continue;
      const effects = buffs.map(b => toEffects(b.stat, b.value, { unit: b.unit === 'flat' ? 'flat' : (b.unit || 'percent'), condition: b.condition || null, source: it.name, sourceType: 'food' })).flat();
      for (const fx of effects) { fx.conditional = isConditionalText(fx.condition); fx.id = `${slug(it.name)}:${fx.stat}:${fx.key || ''}`; }
      const combat = effects.some(e => e.stat !== 'other');
      const slot = (it.buffSlot || (/(drink|beverage)/i.test(it.category) ? 'drink' : 'food')).toLowerCase();
      items.push({ id: slug(it.name), name: it.name, category: it.category || 'food', slot: slot === 'drink' ? 'drink' : 'food', combatRelevant: it.combatRelevant != null ? !!it.combatRelevant : combat, effects, durationSeconds: it.durationSeconds || null, chefRexNote: it.chefRexBoostedPower || null, disagreement: it.disagreement || null, confidence: it.confidence || null, rawBuffs: buffs });
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    return { items, byId: Object.fromEntries(items.map(i => [i.id, i])), stackingRules: raw.stackingRules || null, chefRex: { 5: { high: 38, mid: 31, low: 25 }, 4: { high: 32, mid: 26, low: 20 }, 3: { high: 26, mid: 21, low: 15 } } };
  }

  function buildCradle(raw) {
    const c = raw.cradle || {};
    const live = (c.nodes || []).filter(n => n.pool !== 'datamine_placeholder' && n.pool !== 'legacy_variant' && n.pool !== 'legacy_general_1.0' && !n.valuesLookUnscaled);
    const nodes = [];
    const seen = new Set();
    for (const n of live) {
      const key = slug(n.name) + ':' + slug(n.effectText || '');
      if (seen.has(key)) continue; seen.add(key);
      const effects = (n.effects || []).map(e => toEffects(e.stat, e.value, { unit: e.unit, condition: e.condition, source: n.name, sourceType: 'cradle', text: n.effectText })).flat();
      for (const fx of effects) {
        const typeOnly = fx.stat === 'dmgVsPct';
        fx.conditional = !typeOnly && isConditionalText(fx.condition || n.effectText);
        const perStack = /per stack|each stack|every stack|per (hit|kill|shot|trigger)|stack/i.test(fx.condition || n.effectText || '') && !!n.maxStacks;
        if (perStack) stackify(fx, { perStack: true, maxStacks: n.maxStacks });
        fx.id = `${slug(n.name)}-${n.idSuffix || ''}:${fx.stat}:${fx.key || ''}`;
      }
      nodes.push({ id: slug(n.name) + (n.idSuffix ? '-' + n.idSuffix : ''), name: n.name, style: n.style || null, pool: n.pool, text: n.effectText || '', effects, durationSec: n.durationSec || null, maxStacks: n.maxStacks || null, ohdbUrl: n.ohdbUrl || null });
    }
    nodes.sort((a, b) => a.name.localeCompare(b.name) || (a.pool || '').localeCompare(b.pool || ''));
    return { nodes, byId: Object.fromEntries(nodes.map(n => [n.id, n])), maxActive: c.maxActiveNodes || 8 };
  }

  function buildDeviants(raw) {
    const list = [];
    for (const d of raw.deviants || []) {
      const skill = d.skill || {};
      const effects = [];
      const effList = skill.effects || [];
      for (const e of effList) {
        if (e.value == null || isNaN(Number(e.value))) continue;
        if (/cap$/i.test(e.stat)) continue; // handled with its sibling
        const bySR = Array.isArray(e.valueBySkillRating) && e.valueBySkillRating.length === 5 ? e.valueBySkillRating : null;
        const cap = effList.find(x => x.stat === e.stat + 'Cap');
        const fx = toEffects(e.stat, e.value, { unit: e.unit, condition: e.condition, source: d.name, sourceType: 'deviant', target: e.target || 'player' });
        for (const f of fx) {
          f.target = e.target || 'player'; f.valueBySkillRating = bySR; f.conditional = true; f.id = `${slug(d.name)}:${f.stat}:${f.key || ''}`; f.rawStat = e.stat;
          if (cap && cap.value) { f.perStack = true; f.perStackValue = f.value; f.baseValue = 0; f.maxValue = cap.value; f.maxStacks = Math.max(1, Math.round(cap.value / f.value)); f.capBySkillRating = Array.isArray(cap.valueBySkillRating) ? cap.valueBySkillRating : null; }
        }
        effects.push(...fx);
      }
      list.push({ id: slug(d.name), name: d.name, type: d.type || 'Combat', text: skill.text || '', effects, damage: skill.damage || null, cooldownSeconds: d.cooldownSeconds || null, durationSeconds: d.durationSeconds || null, notes: d.notes || null, traits: d.traits || [], variants: d.variants || [] });
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return { list, byId: Object.fromEntries(list.map(d => [d.id, d])), scalingRules: raw.scalingRules || null };
  }

  function buildCalibration(raw) {
    const styles = [];
    for (const c of raw.weaponCalibrations || []) {
      const lvl = (c.levels && c.levels[0]) || { bonuses: {} };
      const b = lvl.bonuses || {};
      const effects = [];
      const add = (stat, v, key) => { if (v != null && !isNaN(Number(v)) && Number(v) !== 0) effects.push(Object.assign(E.effect(stat, v, { key, source: c.name, sourceType: 'calibration' }), { id: `${slug(c.name)}:${stat}` })); };
      add('attackPct', b.attack); add('rangePct', b.range); add('fireRatePct', b.fireRate); add('reloadEfficiencyPct', b.reloadSpeed); add('magazinePct', b.magazineCapacity);
      const hasValues = effects.length > 0;
      styles.push({ id: slug(c.name), name: c.name, style: c.style || null, appliesTo: c.appliesTo || [], effects, hasValues, otherBonuses: Object.fromEntries(Object.entries(b).filter(([k]) => !['attack', 'range', 'fireRate', 'reloadSpeed', 'magazineCapacity'].includes(k))), confidence: c.confidence || null });
    }
    const sys = (raw.calibrationSystem && raw.calibrationSystem.current) || {};
    const attackBonus = (sys.blueprintAttributeStructure && sys.blueprintAttributeStructure.guaranteedAttackBonus && sys.blueprintAttributeStructure.guaranteedAttackBonus.byRarity) || {};
    const randomPool = ['Crit Rate', 'Crit DMG', 'Elemental DMG', 'Weakspot DMG'];
    const randomDefaults = { 'Crit Rate': { stat: 'critRatePct', max: 20 }, 'Crit DMG': { stat: 'critDmgPct', max: 20 }, 'Elemental DMG': { stat: 'elementalDmgPct', max: 20, key: 'all' }, 'Weakspot DMG': { stat: 'weakspotDmgPct', max: 20 } };
    return { styles, byId: Object.fromEntries(styles.map(s => [s.id, s])), attackBonusByRarity: attackBonus, randomPool, randomDefaults, classMap: CLASS_TO_CALIB, system: sys };
  }

  function buildStatusEffects(formula) {
    const out = {};
    for (const s of (formula && formula.statusEffects) || []) {
      const id = s.id;
      const m = String(s.damageFormula || '').match(/(\d+(?:\.\d+)?)%\s*x\s*(PsiIntensity|Attack)/i);
      const factor = m ? Number(m[1]) : null;
      const scalesWith = m ? (/attack/i.test(m[2]) ? 'attack' : 'psi') : (Array.isArray(s.scalesWith) && s.scalesWith.some(x => /attack|weapon/i.test(x)) ? 'attack' : 'psi');
      const tick = String(s.damageFormula || '').match(/per tick/i) ? ((s.tickSeconds) || (id === 'burn' || id === 'frostVortex' ? 0.5 : null)) : null;
      out[id] = { id, name: s.name, baseFactorPct: s.baseFactorPct != null ? s.baseFactorPct : factor, scalesWith: s.scalesWith === 'attack' ? 'attack' : (s.scalesWith === 'psi' ? 'psi' : scalesWith), element: s.element || E.KEYWORD_ELEMENT[id] || null, tickSeconds: s.tickSeconds != null ? s.tickSeconds : tick, durationSeconds: s.durationSeconds != null ? s.durationSeconds : (id === 'burn' ? 6 : id === 'frostVortex' ? 4 : null), maxStacks: s.maxStacks || 1, canCrit: s.canCrit, canWeakspot: s.canWeakspot, trigger: s.trigger || null, effect: s.effect || null, notes: s.notes || null, formula: s.damageFormula || null, verified: s.verified || null };
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Build -> effects
  // ---------------------------------------------------------------------------
  function defaultBuild(cat) {
    const w = cat.weapons.list.find(x => /The Last Valor/i.test(x.name) && x.attack != null) || cat.weapons.list.find(x => x.attackSource === 'official') || cat.weapons.list[0];
    return {
      v: 1,
      weapon: { id: w ? w.id : null, star: 6, calibration: { styleId: null, attackBonusPct: 50, random: { stat: 'Elemental DMG', value: 20 } }, mod: { id: null, substats: [] } },
      armor: Object.fromEntries(SLOTS.map(s => [s, { pieceId: null, star: 6, mod: { id: null, substats: [] } }])),
      food: { foodId: null, drinkId: null, chefRex: false, chefRexRating: 5, chefRexMood: 'high' },
      deviant: { id: null, skillRating: 5, active: true },
      cradle: { nodeIds: [] },
      target: { faction: 'deviant', tier: 'boss', vulnerabilityPct: 0, mitigation: 100 },
      toggles: {},        // effectId -> boolean (conditional effects on/off)
      stacks: {},         // effectId -> number of stacks
      options: { critWeakspotModel: 'additive', elementalAffectsBullets: true, attackAndWeaponDmgSeparate: true, statusKeywordSeparate: false, damagePoolModel: 'multiplicative', weakspotZoneMult: 1, includeFood: true },
    };
  }

  /** An example loadout so the planner opens in a working state (clearly marked in the UI). */
  function exampleBuild(cat) {
    const b = defaultBuild(cat);
    const find = (list, re) => list.find(x => re.test(x.name));
    for (const p of cat.armor.pieces) if (p.setId === 'lonewolf-set' && SLOTS.includes(p.slot)) b.armor[p.slot].pieceId = p.id;
    const food = find(cat.food.items.filter(i => i.slot === 'food' && i.combatRelevant), /Shattered Bread|Crumbly Bread|Stargazy/i);
    const drink = find(cat.food.items.filter(i => i.slot === 'drink' && i.combatRelevant), /Signature Beverage|Whimsical|Energy Drink/i) || cat.food.items.find(i => i.slot === 'drink' && i.combatRelevant);
    if (food) b.food.foodId = food.id;
    if (drink) b.food.drinkId = drink.id;
    const dev = find(cat.deviants.list, /Butterfly/i);
    if (dev) b.deviant.id = dev.id;
    const wantNodes = [/^Steady Hand/i, /^Marked Strike/i, /^Tactical Combo/i, /^Assault Rifle Enhancement|^Rifle Enhancement/i];
    for (const re of wantNodes) { const n = cat.cradle.nodes.find(x => re.test(x.name) && x.effects.some(e => e.stat !== 'other')); if (n && b.cradle.nodeIds.length < cat.cradle.maxActive) b.cradle.nodeIds.push(n.id); }
    const mod = find(cat.mods.weaponMods, /Shrapnel Smash|Shrapnel Carnage/i);
    if (mod) { b.weapon.mod.id = mod.id; b.weapon.mod.substats = [{ id: 'weapon-dmg', value: 10 }, { id: 'crit-dmg', value: 15 }, { id: 'weakspot-dmg', value: 9 }, { id: 'shrapnel-dmg', value: 10 }].map(s => cat.mods.substatsById[s.id] ? s : { id: null, value: null }); }
    b.example = true;
    return b;
  }

  /** Expand a catalogue effect into an engine effect honouring toggles and stacks. */
  function applyEffect(fx, build, { forceEnabled } = {}) {
    const toggled = build.toggles[fx.id];
    let enabled = fx.conditional ? (toggled === true) : (toggled !== false);
    if (forceEnabled) enabled = true;
    let value = fx.value;
    if (fx.perStack) {
      const stacks = build.stacks[fx.id] != null ? build.stacks[fx.id] : (fx.maxStacks || 1);
      const per = fx.perStackValue != null ? fx.perStackValue : fx.value;
      value = (fx.baseValue || 0) + per * stacks;
      if (fx.maxValue != null) value = Math.min(value, fx.maxValue);
    }
    return Object.assign({}, fx, { value, enabled });
  }

  function collectEffects(build, cat, { includeFood = true } = {}) {
    build = Object.assign({ toggles: {}, stacks: {}, armor: {}, food: {}, deviant: {}, cradle: { nodeIds: [] }, target: {}, options: {} }, build || {});
    build.weapon = Object.assign({ calibration: {}, mod: {} }, build.weapon || {});
    build.toggles = build.toggles || {}; build.stacks = build.stacks || {}; build.food = build.food || {}; build.deviant = build.deviant || {}; build.cradle = build.cradle || { nodeIds: [] };
    const out = [];
    const push = (fx) => { if (fx && fx.stat && fx.stat !== 'other') out.push(fx); else if (fx) out.push(fx); };
    // Weapon special effect is part of the weapon card and handled via keyword; calibration:
    const cal = build.weapon.calibration || {};
    if (cal.styleId && cat.calibration.byId[cal.styleId]) for (const fx of cat.calibration.byId[cal.styleId].effects) push(Object.assign({}, fx, { enabled: true }));
    if (cal.attackBonusPct) push(Object.assign(E.effect('attackPct', cal.attackBonusPct, { source: 'Calibration: Attack bonus', sourceType: 'calibration' }), { id: 'calibration:attackBonus', enabled: true }));
    if (cal.random && cal.random.stat && cal.random.value) {
      const def = cat.calibration.randomDefaults[cal.random.stat];
      if (def) push(Object.assign(E.effect(def.stat, cal.random.value, { key: cal.random.key || def.key || null, source: `Calibration: ${cal.random.stat}`, sourceType: 'calibration' }), { id: 'calibration:random', enabled: true }));
    }
    // Weapon mod
    pushMod(build.weapon.mod, 'weapon-mod');
    // Armor pieces, set bonuses, mods
    const setCounts = {};
    for (const slot of SLOTS) {
      const sel = build.armor[slot];
      if (!sel || !sel.pieceId) continue;
      const piece = cat.armor.piecesById[sel.pieceId];
      if (!piece) continue;
      const bs = cat.armor.baseStatsAt(piece, sel.star || 1);
      if (bs.maxHp != null) push(Object.assign(E.effect('maxHp', bs.maxHp, { source: `${piece.name} (${sel.star || 1}★)`, sourceType: 'armor-base' }), { id: `${piece.id}:maxHp`, enabled: true }));
      if (bs.psiIntensity != null) push(Object.assign(E.effect('psiIntensity', bs.psiIntensity, { source: `${piece.name} (${sel.star || 1}★)`, sourceType: 'armor-base' }), { id: `${piece.id}:psi`, enabled: true }));
      if (bs.pollutionResist != null) push(Object.assign(E.effect('pollutionResist', bs.pollutionResist, { source: piece.name, sourceType: 'armor-base' }), { id: `${piece.id}:pr`, enabled: true }));
      for (const fx of piece.effects) push(applyEffect(fx, build));
      if (piece.setId) setCounts[piece.setId] = (setCounts[piece.setId] || 0) + 1;
      pushMod(sel.mod, 'armor-mod');
    }
    for (const [setId, n] of Object.entries(setCounts)) {
      const set = cat.armor.setsById[setId];
      if (!set) continue;
      const active = set.bonuses.filter(b => n >= b.pieces);
      const stackRaise = active.flatMap(b => b.effects).find(fx => /MaxStacks$/i.test(fx.rawStat || '') && fx.stat === 'other');
      for (const b of active) for (const fx of b.effects) {
        let f = fx;
        if (stackRaise && fx.perStack && fx.stat !== 'other') f = Object.assign({}, fx, { maxStacks: stackRaise.value });
        push(applyEffect(f, build));
      }
    }
    // Food & drink
    if (includeFood) {
      for (const key of ['foodId', 'drinkId']) {
        const item = build.food[key] && cat.food.byId[build.food[key]];
        if (!item) continue;
        const mult = build.food.chefRex ? 1 + ((cat.food.chefRex[build.food.chefRexRating] || cat.food.chefRex[5])[build.food.chefRexMood || 'high'] || 0) / 100 : 1;
        for (const fx of item.effects) { const a = applyEffect(fx, build); if (fx.stat !== 'psiIntensity' && fx.stat !== 'pollutionResist' && fx.stat !== 'maxHp') a.value = a.value * mult; else a.value = a.value * mult; push(a); }
      }
    }
    // Deviant
    if (build.deviant.id && build.deviant.active !== false) {
      const d = cat.deviants.byId[build.deviant.id];
      if (d) for (const fx of d.effects) {
        const sr = Math.max(1, Math.min(5, build.deviant.skillRating || 5));
        let f = fx;
        if (fx.valueBySkillRating) {
          const v = fx.valueBySkillRating[sr - 1];
          f = Object.assign({}, fx, { value: v, perStackValue: fx.perStack ? v : fx.perStackValue, maxValue: fx.capBySkillRating ? fx.capBySkillRating[sr - 1] : fx.maxValue });
        }
        push(applyEffect(f, build));
      }
    }
    // Cradle
    for (const id of build.cradle.nodeIds || []) {
      const n = cat.cradle.byId[id];
      if (n) for (const fx of n.effects) push(applyEffect(fx, build));
    }
    // Target debuffs
    const tgt = build.target || {};
    if (tgt.vulnerabilityPct) { push(Object.assign(E.effect('weaponVulnPct', tgt.vulnerabilityPct, { source: 'Target: extra Vulnerability', sourceType: 'target' }), { id: 'target:vuln', enabled: true })); push(Object.assign(E.effect('statusVulnPct', tgt.vulnerabilityPct, { source: 'Target: extra Vulnerability', sourceType: 'target' }), { id: 'target:vuln-status', enabled: true })); }
    return out;

    function pushMod(modSel, kind) {
      if (!modSel || !modSel.id) return;
      const mod = cat.mods.byId[modSel.id];
      if (!mod) return;
      for (const fx of mod.effects) push(applyEffect(fx, build));
      for (const ss of modSel.substats || []) {
        const def = cat.mods.substatsById[ss.id];
        if (!def || ss.value == null) continue;
        push(Object.assign(E.effect(def.stat, ss.value, { key: def.key, source: `${mod.name}: ${def.label}`, sourceType: kind + '-sub' }), { id: `${mod.id}:sub:${def.id}`, enabled: true }));
      }
    }
  }

  function computeBuild(build, cat, { includeFood } = {}) {
    const w = build && build.weapon && cat.weapons.byId[build.weapon.id];
    if (!w) return null;
    const options = build.options || {}, target = build.target || {};
    const inc = includeFood != null ? includeFood : options.includeFood !== false;
    const effects = collectEffects(build, cat, { includeFood: inc });
    const weapon = Object.assign({}, w, { attackByStar: w.attackByStar, attackStar: 1, statusChancePct: build.weapon.triggerChancePct != null ? build.weapon.triggerChancePct : w.triggerChancePct });
    const ctx = {
      targetType: [target.faction || 'deviant', target.tier || 'boss'].filter(Boolean),
      starTable: cat.weapons.starTable,
      statusEffects: cat.statusEffects,
      options: Object.assign({}, options, { mitigation: (target.mitigation != null ? target.mitigation : 100) / 100 }),
    };
    const result = E.computeDamage(weapon, build.weapon.star || 1, effects, ctx);
    result.effects = effects;
    result.weapon = w;
    return result;
  }

  function buildCatalog(data) {
    const cat = {};
    cat.meta = { generated: {}, versions: {} };
    for (const [k, v] of Object.entries(data)) if (v && v._meta) cat.meta.versions[k] = v._meta.gameVersion || null;
    cat.weapons = buildWeapons(data.weapons || { weapons: [] }, data.official_weapons || null);
    cat.armor = buildArmor(data.armor || { sets: [], keyArmor: [], slots: [] });
    cat.mods = buildMods(data.mods || {});
    cat.food = buildFood(data.food || {});
    cat.cradle = buildCradle(data.cradle || {});
    cat.deviants = buildDeviants(data.deviants || {});
    cat.calibration = buildCalibration(data.calibration || {});
    cat.statusEffects = buildStatusEffects(data.formula || {});
    cat.formula = data.formula || null;
    cat.testVectors = data.test_vectors || null;
    return cat;
  }

  global.Adapter = { SLOTS, SERIES, buildCatalog, defaultBuild, exampleBuild, collectEffects, isConditionalText, stackify, computeBuild, toEffects, applyEffect, keywordId, elementId, slug, OHDB_TO_CARD_RATIO };
})(typeof window !== 'undefined' ? window : globalThis);
