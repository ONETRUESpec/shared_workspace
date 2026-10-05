// Oberfläche des Once-Human-Build-Planers (Vanilla JS, keine Abhängigkeiten).
import { computeBuild, encodeBuild, decodeBuild, maxStars, tierMultiplier, ARMOR_SLOTS, KEYWORD_ELEMENT, ELEMENTS } from './calc.js';

const DATA_FILES = ['weapons', 'armor', 'sets', 'mods', 'deviations', 'cradle', 'calibrations', 'food', 'stars', 'formulas', 'meta'];
const SLOT_LABEL = { Helmet: 'Helm', Mask: 'Maske', Top: 'Oberteil', Gloves: 'Handschuhe', Bottoms: 'Hose', Shoes: 'Schuhe' };
const RARITY_LABEL = { common: 'Gewöhnlich', uncommon: 'Standard', rare: 'Selten', epic: 'Episch', legendary: 'Legendär' };
const CAL_GROUP = { 'LMG': 'Light Machine Gun', 'Crossbow': 'Bow / Crossbow', 'Rocket Launcher': 'Heavy Weapon', 'Flamethrower': 'Heavy Weapon' };
const STAT_LABEL = {
  weaponDmg: 'Weapon DMG %', attackPct: 'Attack %', critRate: 'Crit Rate %', critDmg: 'Crit DMG %', weakspotDmg: 'Weakspot DMG %',
  statusDmg: 'Status DMG %', psiPct: 'Psi Intensity %', psiFlat: 'Psi Intensity (flat)', hpPct: 'Max HP %', hpFlat: 'Max HP (flat)',
  magazine: 'Magazin %', reload: 'Nachladen %', fireRate: 'Feuerrate %', dmgVsBoss: 'DMG vs Boss %', dmgVsElite: 'DMG vs Elite %',
  dmgVsCommon: 'DMG vs Normal %', dmgVsMarked: 'DMG vs markiert %', elementalAll: 'Elemental DMG (alle) %', keywordDmg: 'Keyword DMG %',
  meleeDmg: 'Melee DMG %', pollutionFlat: 'Pollution Resist (flat)', pollutionPct: 'Pollution Resist %', dmgReduction: 'DMG Reduction %',
  vulnerability: 'Verwundbarkeit des Ziels %',
};
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
/** Beschriftung für Bonus-Schlüssel wie "critDmg", "elemental.Blaze", "keyword.Shrapnel" oder "keywordStats.Bounce.critRate". */
function statLabel(key) {
  if (STAT_LABEL[key]) return STAT_LABEL[key];
  const [kind, a, b] = key.split('.');
  if (kind === 'elemental') return `${a} DMG %`;
  if (kind === 'keyword') return `${a} DMG %`;
  if (kind === 'keywordStats') return `${a} ${STAT_LABEL[b] || b}`;
  return key;
}
const STORAGE_KEY = 'oh-planner-build-v1';

const data = {};
let build = defaultBuild();

function defaultBuild() {
  return {
    weapon: { id: 'socr-the-last-valor', star: 1, tier: 5, calibrationId: null, modId: null, suffix: null, active: true, stacks: null, element: null },
    armor: Object.fromEntries(ARMOR_SLOTS.map((s) => [s, { id: null, star: 1, modId: null, suffix: null, active: true, stacks: null, effectActive: true }])),
    setToggles: {},
    foodEnabled: true,
    foods: [],
    deviant: { id: null, level: 1, active: true },
    cradle: [],
    manual: {},
    target: { weakspotRate: 0.5, type: 'boss', marked: false },
    options: { critWeakspotMode: 'additive', damagePerPellet: true, baseHp: 0 },
    suffixOverrides: {},
  };
}

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 0) => (n == null || Number.isNaN(n) ? '–' : Number(n).toLocaleString('de-DE', { maximumFractionDigits: d, minimumFractionDigits: d }));
const pctf = (n) => (n == null ? '–' : `${n > 0 ? '+' : ''}${fmt(n, 1)} %`);
const byId = (list, id) => (id ? list.find((x) => x.id === id) : undefined);

async function loadData() {
  await Promise.all(DATA_FILES.map(async (f) => {
    const r = await fetch(`data/${f}.json`);
    if (!r.ok) throw new Error(`data/${f}.json konnte nicht geladen werden (${r.status})`);
    data[f] = await r.json();
  }));
}

// ----------------------------------------------------------------------------------
// Rendering der Eingabeseite
// ----------------------------------------------------------------------------------

function starPicker(name, value, max, extra = '') {
  let html = `<div class="stars" data-star-group="${esc(name)}" ${extra}>`;
  for (let i = 1; i <= 6; i++) {
    const dis = i > max ? 'disabled' : '';
    html += `<button type="button" class="star ${i <= value ? 'on' : ''}" data-star="${i}" ${dis} title="${i} Stern${i > 1 ? 'e' : ''}">★</button>`;
  }
  return html + `<span class="star-label">${value}★ / ${max}★</span></div>`;
}

function selectHtml(id, items, value, { placeholder = '– keine –', group = null, label = (x) => x.name } = {}) {
  let html = `<select id="${id}" class="sel">`;
  html += `<option value="">${esc(placeholder)}</option>`;
  if (group) {
    const groups = new Map();
    for (const it of items) {
      const g = group(it) || 'Sonstige';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(it);
    }
    for (const [g, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      html += `<optgroup label="${esc(g)}">`;
      for (const it of list) html += `<option value="${esc(it.id)}" ${it.id === value ? 'selected' : ''}>${esc(label(it))}</option>`;
      html += '</optgroup>';
    }
  } else {
    for (const it of items) html += `<option value="${esc(it.id)}" ${it.id === value ? 'selected' : ''}>${esc(label(it))}</option>`;
  }
  return html + '</select>';
}

function modPicker(prefix, cfg, slot) {
  const mods = data.mods.filter((m) => (slot === 'Weapon' ? m.category === 'Weapon Mod' : m.category === 'Armor Mod' && m.slot === slot));
  const mod = byId(data.mods, cfg.modId);
  const suffixes = Object.keys(data.formulas.modSuffixes);
  let html = `<div class="row"><label>Mod</label>${selectHtml(`${prefix}-mod`, mods, cfg.modId, { group: (m) => m.keyword || 'Allgemein', label: (m) => `${m.name}${m.stats && Object.keys(m.stats).length ? '' : ' (nur Text)'}` })}</div>`;
  if (mod) {
    html += `<div class="row"><label>Suffix</label><select id="${prefix}-suffix" class="sel"><option value="">– keiner –</option>${suffixes.map((s) => `<option value="${esc(s)}" ${cfg.suffix === s ? 'selected' : ''}>${esc(s)}${(mod.variants || []).includes(s) ? '' : ' *'}</option>`).join('')}</select></div>`;
    html += `<div class="effect">${esc(mod.effect)}</div>`;
    if (mod.conditional && Object.keys(mod.stats || {}).length) {
      html += `<div class="row inline"><label class="chk"><input type="checkbox" id="${prefix}-active" ${cfg.active !== false ? 'checked' : ''}> Bedingung erfüllt</label>`;
      if ((mod.maxStacks || 1) > 1) html += `<label>Stacks <input type="number" id="${prefix}-stacks" min="0" max="99" title="Standard: ${mod.maxStacks}" value="${cfg.stacks ?? mod.maxStacks}" class="num"></label>`;
      html += '</div>';
    }
    if (!Object.keys(mod.stats || {}).length) html += `<div class="hint">Kein automatisch lesbarer Wert; Bonus ggf. unter „Manuell“ eintragen.</div>`;
  }
  return html;
}

function renderWeapon() {
  const w = byId(data.weapons, build.weapon.id);
  const max = w ? maxStars(data.stars, w.rarity) : 6;
  if (w && build.weapon.star > max) build.weapon.star = max;
  const group = w ? (CAL_GROUP[w.type] || w.type) : null;
  const cals = data.calibrations.filter((c) => !group || c.weaponGroup === group || c.weaponGroup === 'None');
  let html = `<div class="row"><label>Waffe</label>${selectHtml('weapon', data.weapons, build.weapon.id, { placeholder: '– Waffe wählen –', group: (x) => x.type, label: (x) => `${x.name} (${RARITY_LABEL[x.rarity] || x.rarity})` })}</div>`;
  if (w) {
    const tiers = data.stars.tierCurve || [1];
    const tier = Math.min(Number(build.weapon.tier || tiers.length), tiers.length);
    html += `<div class="row"><label>Tier</label><div class="tiers">${tiers.map((_, i) => `<button type="button" class="tier ${i + 1 === tier ? 'on' : ''}" data-tier="${i + 1}">${ROMAN[i]}</button>`).join('')}</div></div>`;
    html += `<div class="row"><label>Sterne</label>${starPicker('weapon', build.weapon.star, max)}</div>`;
    const attackBase = w.damage * tierMultiplier(data.stars, tier, w.damageTier) * data.stars.curves[w.rarity][Math.min(build.weapon.star, max) - 1];
    html += `<div class="statgrid">
      <div><span>Attack (Tier ${ROMAN[tier - 1]}, ${Math.min(build.weapon.star, max)}★)</span><b>${fmt(attackBase)}</b></div>
      <div><span>Feuerrate</span><b>${w.rpm ? fmt(w.rpm) + ' rpm' : '–'}</b></div>
      <div><span>Magazin</span><b>${w.mag ?? '–'}</b></div>
      <div><span>Crit Rate</span><b>${w.critRate != null ? w.critRate + ' %' : '–'}</b></div>
      <div><span>Crit DMG</span><b>${w.critDmg != null ? w.critDmg + ' %' : '–'}</b></div>
      <div><span>Weakspot DMG</span><b>${w.weakspotDmg != null ? w.weakspotDmg + ' %' : '–'}</b></div>
      <div><span>Nachladen</span><b>${w.reloadSec != null ? w.reloadSec + ' s' : '–'}</b></div>
      <div><span>Pellets</span><b>${w.pellets || 1}</b></div>
    </div>`;
    if (tier !== w.damageTier) html += `<div class="hint">Attack-Datenbasis ist Tier ${ROMAN[w.damageTier - 1]} (${fmt(w.damage)}); ${esc(data.stars.tierStatus)}</div>`;
    if (w.profileSource !== 'meta-builds') html += `<div class="hint warn">Crit/Weakspot/Magazin-Werte sind ${w.profileSource === 'family-estimate' ? 'von der Waffenfamilie übernommen' : w.profileSource === 'type-estimate' ? 'Durchschnitt des Waffentyps' : 'nicht bekannt'} – bitte im Spiel prüfen.</div>`;
    if (w.effect) html += `<div class="effect">${esc(w.effect)}</div>`;
    html += `<div class="row"><label>Keyword</label><select id="weapon-keyword" class="sel"><option value="">${esc(w.keyword || '– keins –')} (erkannt)</option>${['Shrapnel', 'Bounce', 'Burn', 'Frost Vortex', 'Power Surge', 'Unstable Bomber', "The Bull's Eye", 'Fortress Warfare', 'Fast Gunner'].map((k) => `<option value="${esc(k)}" ${build.weapon.keywordOverride === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>`;
    const kw = build.weapon.keywordOverride || w.keyword;
    html += `<div class="row"><label>Element</label><select id="weapon-element" class="sel"><option value="">${esc(kw && KEYWORD_ELEMENT[kw] ? KEYWORD_ELEMENT[kw] + ' (aus Keyword)' : '– keins –')}</option>${ELEMENTS.map((e) => `<option value="${e}" ${build.weapon.element === e ? 'selected' : ''}>${e}</option>`).join('')}</select></div>`;
    html += `<div class="row"><label>Kalibrierung</label>${selectHtml('weapon-cal', cals, build.weapon.calibrationId, { group: (c) => c.style || 'Sonstige', label: (c) => `${c.name} – ${c.effect}` })}</div>`;
    html += modPicker('weapon', build.weapon, 'Weapon');
  }
  $('#sec-weapon .body').innerHTML = html;
}

function renderArmor() {
  let html = '';
  for (const slot of ARMOR_SLOTS) {
    const cfg = build.armor[slot];
    const piece = byId(data.armor, cfg.id);
    const max = piece ? maxStars(data.stars, piece.rarity) : 6;
    if (piece && cfg.star > max) cfg.star = max;
    const pieces = data.armor.filter((a) => a.slot === slot);
    html += `<div class="slot" data-slot="${slot}"><h4>${SLOT_LABEL[slot]}</h4>`;
    html += `<div class="row"><label>Teil</label>${selectHtml(`armor-${slot}`, pieces, cfg.id, { group: (a) => a.set ? `Set: ${a.set}` : `Einzelteile (${RARITY_LABEL[a.rarity] || a.rarity})`, label: (a) => `${a.name}` })}</div>`;
    if (piece) {
      html += `<div class="row"><label>Sterne</label>${starPicker(`armor-${slot}`, cfg.star, max)}</div>`;
      const m = data.stars.curves[piece.rarity][Math.min(cfg.star, max) - 1];
      html += `<div class="statgrid small"><div><span>HP</span><b>${fmt(piece.hp * m)}</b></div><div><span>Psi</span><b>${fmt(piece.psi * m)}</b></div><div><span>Pollution</span><b>${piece.pollution}</b></div><div><span>Seltenheit</span><b>${RARITY_LABEL[piece.rarity] || piece.rarity}</b></div></div>`;
      if (piece.effect) {
        html += `<div class="effect">${esc(piece.effect)}</div>`;
        if (piece.conditional && Object.keys(piece.stats || {}).length) {
          html += `<div class="row inline"><label class="chk"><input type="checkbox" id="armor-${slot}-effect" ${cfg.effectActive !== false ? 'checked' : ''}> Effekt-Bedingung erfüllt</label>`;
          if ((piece.maxStacks || 1) > 1) html += `<label>Stacks <input type="number" id="armor-${slot}-estacks" min="0" max="99" title="Standard: ${piece.maxStacks}" value="${cfg.effectStacks ?? piece.maxStacks}" class="num"></label>`;
          html += '</div>';
        }
      }
      html += modPicker(`armor-${slot}`, cfg, slot);
    }
    html += '</div>';
  }
  $('#sec-armor .body').innerHTML = html;
}

function renderSets(result) {
  const box = $('#sec-sets .body');
  if (!result.activeSets.length) { box.innerHTML = '<div class="hint">Kein Set-Teil ausgewählt.</div>'; return; }
  let html = '';
  for (const s of result.activeSets) {
    const set = data.sets[s.name];
    html += `<div class="setbox"><h4>${esc(s.name)} <span class="muted">${s.count} Teil${s.count > 1 ? 'e' : ''}</span></h4>`;
    for (const b of set.bonus) {
      const have = b.pieces <= s.count;
      const t = build.setToggles[s.name]?.[b.pieces] || {};
      html += `<div class="setbonus ${have ? '' : 'off'}"><span class="pieces">${b.pieces}×</span><span class="txt">${esc(b.effect)}</span>`;
      if (have && b.conditional && Object.keys(b.stats || {}).length) {
        html += `<label class="chk"><input type="checkbox" data-set="${esc(s.name)}" data-pieces="${b.pieces}" class="set-active" ${t.active !== false ? 'checked' : ''}> aktiv</label>`;
        if ((b.maxStacks || 1) > 1) html += `<label>Stacks <input type="number" class="num set-stacks" data-set="${esc(s.name)}" data-pieces="${b.pieces}" min="0" max="99" title="Standard: ${b.maxStacks}" value="${t.stacks ?? b.maxStacks}"></label>`;
      }
      if (have && !Object.keys(b.stats || {}).length) html += `<span class="muted">(kein Zahlenwert)</span>`;
      html += '</div>';
    }
    html += '</div>';
  }
  box.innerHTML = html;
}

function renderFood() {
  const sel = new Map(build.foods.map((f) => [f.id, f]));
  let html = `<div class="row inline"><label class="chk big"><input type="checkbox" id="food-enabled" ${build.foodEnabled !== false ? 'checked' : ''}> Essen-Buffs einrechnen</label><span class="muted">Rechts wird immer auch der Wert ohne Essen gezeigt.</span></div>`;
  html += '<div class="foodlist">';
  for (const f of data.food) {
    const chosen = sel.get(f.id);
    html += `<div class="food ${chosen ? 'on' : ''}"><label class="chk"><input type="checkbox" class="food-pick" data-id="${esc(f.id)}" ${chosen ? 'checked' : ''}> <b>${esc(f.name)}</b> <span class="tag ${f.status}">${f.status === 'verified' ? 'geprüft' : f.status === 'community' ? 'Community' : 'geschätzt'}</span></label><div class="effect">${esc(f.effect)}</div>`;
    if (chosen && f.cond) html += `<label class="chk sub"><input type="checkbox" class="food-cond" data-id="${esc(f.id)}" ${chosen.active !== false ? 'checked' : ''}> Bedingung erfüllt: ${esc(f.cond)}</label>`;
    html += '</div>';
  }
  $('#sec-food .body').innerHTML = html + '</div>';
}

function renderDeviant() {
  const d = byId(data.deviations, build.deviant.id);
  let html = `<div class="row"><label>Deviant</label>${selectHtml('deviant', data.deviations, build.deviant.id, { group: (x) => x.buff ? 'Mit Build-Wert' : 'Nur Beschreibung', label: (x) => x.name })}</div>`;
  if (d) {
    html += `<div class="effect">${esc(d.effect || '')}</div>`;
    if (d.buff) {
      const n = d.buff.levels.length;
      html += `<div class="row inline"><label>Stufe <select id="deviant-level" class="sel narrow">${d.buff.levels.map((v, i) => `<option value="${i + 1}" ${build.deviant.level === i + 1 ? 'selected' : ''}>${i + 1}${n > 1 ? '' : ' (einziger Wert)'} → +${v} %</option>`).join('')}</select></label>`;
      html += `<label class="chk"><input type="checkbox" id="deviant-active" ${build.deviant.active !== false ? 'checked' : ''}> ${esc(d.buff.cond || 'Buff aktiv')}</label></div>`;
      html += `<div class="hint ${d.buff.status === 'estimated' ? 'warn' : ''}">${esc(d.buff.note)} <span class="tag ${d.buff.status}">${d.buff.status === 'verified' ? 'geprüft' : d.buff.status === 'community' ? 'Community' : 'geschätzt'}</span></div>`;
    } else html += '<div class="hint">Für diesen Deviant ist kein Zahlenwert hinterlegt; Bonus ggf. unter „Manuell“ eintragen.</div>';
  }
  $('#sec-deviant .body').innerHTML = html;
}

function renderCradle() {
  let html = `<div class="row"><label>Hinzufügen</label>${selectHtml('cradle-add', data.cradle.filter((c) => !build.cradle.some((x) => x.id === c.id)), '', { placeholder: '– Override wählen –', group: (c) => c.style || 'Sonstige', label: (c) => `${c.name}${Object.keys(c.stats || {}).length ? '' : ' (nur Text)'}` })}</div>`;
  for (const c of build.cradle) {
    const cr = byId(data.cradle, c.id);
    if (!cr) continue;
    html += `<div class="chip"><div><b>${esc(cr.name)}</b> <span class="muted">${esc(cr.style || '')}</span><div class="effect">${esc(cr.effect)}</div>`;
    if (cr.conditional && Object.keys(cr.stats || {}).length) {
      html += `<label class="chk"><input type="checkbox" class="cradle-active" data-id="${esc(c.id)}" ${c.active !== false ? 'checked' : ''}> Bedingung erfüllt</label>`;
      if ((cr.maxStacks || 1) > 1) html += ` <label>Stacks <input type="number" class="num cradle-stacks" data-id="${esc(c.id)}" min="0" max="99" title="Standard: ${cr.maxStacks}" value="${c.stacks ?? cr.maxStacks}"></label>`;
    }
    html += `</div><button type="button" class="x cradle-remove" data-id="${esc(c.id)}" title="Entfernen">×</button></div>`;
  }
  $('#sec-cradle .body').innerHTML = html;
}

function renderManual() {
  const keys = ['weaponDmg', 'attackPct', 'critRate', 'critDmg', 'weakspotDmg', 'statusDmg', 'psiPct', 'psiFlat', 'hpPct', 'hpFlat', 'magazine', 'reload', 'fireRate', 'dmgVsBoss', 'dmgVsElite', 'dmgVsCommon', 'dmgVsMarked', 'elementalAll', 'keywordDmg', 'meleeDmg', 'pollutionFlat', 'pollutionPct'];
  let html = '<div class="manualgrid">';
  for (const k of keys) html += `<label><span>${STAT_LABEL[k]}</span><input type="number" step="0.1" class="num manual" data-key="${k}" value="${build.manual[k] ?? ''}" placeholder="0"></label>`;
  for (const el of ELEMENTS) html += `<label><span>${el} DMG %</span><input type="number" step="0.1" class="num manual-el" data-el="${el}" value="${build.manual.elemental?.[el] ?? ''}" placeholder="0"></label>`;
  html += '</div><div class="hint">Für Boni, die der Planer nicht automatisch liest (Mods ohne Zahlenwert, Memetics, Cradle-Texte, Whims …).</div>';
  $('#sec-manual .body').innerHTML = html;
}

function renderTarget() {
  const t = build.target, o = build.options;
  $('#sec-target .body').innerHTML = `
    <div class="row"><label>Weakspot-Trefferquote</label><input type="range" id="t-ws" min="0" max="100" value="${Math.round(t.weakspotRate * 100)}"><span id="t-ws-val" class="val">${Math.round(t.weakspotRate * 100)} %</span></div>
    <div class="row"><label>Zieltyp</label><select id="t-type" class="sel narrow"><option value="common" ${t.type === 'common' ? 'selected' : ''}>Normal</option><option value="elite" ${t.type === 'elite' ? 'selected' : ''}>Elite</option><option value="boss" ${t.type === 'boss' ? 'selected' : ''}>Boss</option></select>
      <label class="chk"><input type="checkbox" id="t-marked" ${t.marked ? 'checked' : ''}> Ziel markiert (Bull's Eye)</label></div>
    <div class="row"><label>Crit × Weakspot</label><select id="o-mode" class="sel narrow"><option value="additive" ${o.critWeakspotMode === 'additive' ? 'selected' : ''}>additiv (1 + Crit% + Weakspot%)</option><option value="multiplicative" ${o.critWeakspotMode === 'multiplicative' ? 'selected' : ''}>multiplikativ ((1+Crit%)×(1+Weakspot%))</option></select></div>
    <div class="row"><label>Pellets</label><label class="chk"><input type="checkbox" id="o-pellet" ${o.damagePerPellet ? 'checked' : ''}> Attack gilt pro Pellet (Schrotflinten: Schuss = Attack × Pellets)</label></div>
    <div class="row"><label>Basis-HP</label><input type="number" id="o-basehp" class="num" value="${o.baseHp || 0}" min="0"> <span class="muted">Charakter-HP ohne Rüstung (falls bekannt), wird mit Max-HP-% skaliert</span></div>
    <div class="hint">Welche Variante das Spiel nutzt, ist umstritten (Steam-Thread „Can weakspot hits trigger critical hits?“). Die additive Variante ist die verbreitete Community-Annahme und Standard.</div>`;
}

// ----------------------------------------------------------------------------------
// Ergebnisse
// ----------------------------------------------------------------------------------

function renderResults() {
  const result = computeBuild(build, data);
  const noFood = computeBuild({ ...build, foodEnabled: false }, data, { skipStarTable: true });
  const withFood = computeBuild({ ...build, foodEnabled: true }, data, { skipStarTable: true });
  renderSets(result);
  const o = result.offense;
  const box = $('#results');
  if (!o) { box.innerHTML = '<div class="hint">Bitte eine Waffe wählen.</div>'; return; }
  const w = result.weapon;
  const foodTag = build.foodEnabled !== false ? 'mit Essen' : 'ohne Essen';
  let html = `<h2>${esc(w.name)} <span class="muted">Tier ${ROMAN[o.tier - 1]} · ${o.star}★ · ${foodTag}</span></h2>`;
  html += `<div class="bignums">
    <div><span>Attack</span><b>${fmt(o.attack)}</b><small>×${o.tierMult.toFixed(2)} Tier · ×${o.starMult.toFixed(2)} Sterne</small></div>
    <div><span>Körpertreffer</span><b>${fmt(o.hits.body)}</b></div>
    <div><span>Crit</span><b>${fmt(o.hits.crit)}</b><small>${fmt(o.critRate, 1)} % Chance · +${fmt(o.critDmg, 1)} %</small></div>
    <div><span>Weakspot</span><b>${fmt(o.hits.weakspot)}</b><small>+${fmt(o.weakspotDmg, 1)} %</small></div>
    <div><span>Crit + Weakspot</span><b>${fmt(o.hits.critWeakspot)}</b></div>
    <div><span>Ø Treffer</span><b>${fmt(o.avgHit)}</b><small>bei ${Math.round(build.target.weakspotRate * 100)} % Weakspot</small></div>
    ${o.pellets > 1 ? `<div><span>Ø Schuss (${o.pellets} Pellets)</span><b>${fmt(o.avgShot)}</b></div>` : ''}
    ${o.dpsBurst != null ? `<div><span>DPS (Dauerfeuer)</span><b>${fmt(o.dpsBurst)}</b></div>` : ''}
    ${o.dpsSustained != null && o.cycle ? `<div><span>DPS inkl. Nachladen</span><b>${fmt(o.dpsSustained)}</b><small>${o.mag} Schuss · ${fmt(o.reload, 2)} s Reload</small></div>` : ''}
    ${o.magDamage != null ? `<div><span>Schaden pro Magazin</span><b>${fmt(o.magDamage)}</b></div>` : ''}
  </div>`;

  // Vergleich mit / ohne Essen
  const cmp = (a, b, key) => { const x = a.offense?.[key], y = b.offense?.[key]; return x != null && y != null ? `${fmt(y)} → ${fmt(x)} (${pctf(y ? ((x - y) / y) * 100 : 0)})` : '–'; };
  html += `<div class="panel"><h3>Mit vs. ohne Essen</h3><table class="tbl"><tr><th></th><th>ohne → mit Essen</th></tr>
    <tr><td>Ø Treffer</td><td>${cmp(withFood, noFood, 'avgHit')}</td></tr>
    <tr><td>DPS inkl. Nachladen</td><td>${cmp(withFood, noFood, 'dpsSustained')}</td></tr>
    ${withFood.offense.status?.perHit != null ? `<tr><td>${esc(withFood.weaponKeyword)} pro Auslösung</td><td>${fmt(noFood.offense.status.perHit)} → ${fmt(withFood.offense.status.perHit)}</td></tr>` : ''}
    <tr><td>Max HP</td><td>${fmt(noFood.hp)} → ${fmt(withFood.hp)}</td></tr></table></div>`;

  // Status / Keyword
  if (o.status) {
    const s = o.status;
    html += `<div class="panel"><h3>Keyword: ${esc(s.keyword)}</h3>`;
    if (s.perHit != null) {
      html += `<div class="bignums small"><div><span>pro ${s.formula.base === 'psi' ? 'Tick/Auslösung' : 'Treffer'}</span><b>${fmt(s.perHit)}</b></div>${s.ticks > 1 ? `<div><span>gesamt (${s.ticks} Ticks)</span><b>${fmt(s.total)}</b></div>` : ''}<div><span>Psi Intensity</span><b>${fmt(result.psi)}</b></div><div><span>Keyword DMG</span><b>${pctf(s.kwBonus)}</b></div></div>`;
      html += `<div class="hint">${esc(s.formula.desc)}</div>`;
    } else html += `<div class="hint">${esc(s.formula?.desc || 'Für dieses Keyword gibt es keinen eigenen Schadenswert.')}</div>`;
    html += '</div>';
  }

  // Verteidigung
  html += `<div class="panel"><h3>Verteidigung</h3><div class="bignums small">
    <div><span>Max HP</span><b>${fmt(result.hp)}</b><small>Rüstung ${fmt(result.hpArmor)}${build.options.baseHp ? ` + Basis ${fmt(build.options.baseHp)}` : ''}</small></div>
    <div><span>Psi Intensity</span><b>${fmt(result.psi)}</b></div>
    <div><span>Pollution Resist</span><b>${fmt(result.pollution)}</b></div></div></div>`;

  // Sterntabellen
  html += `<div class="panel"><h3>Waffe nach Sternen</h3><table class="tbl"><tr><th>Sterne</th><th>Attack</th><th>Körper</th><th>Ø Schuss</th><th>DPS inkl. Reload</th></tr>`;
  for (const r of result.starTable) html += `<tr class="${r.star === o.star ? 'cur' : ''}"><td>${r.star}★</td><td>${fmt(r.attack)}</td><td>${fmt(r.bodyHit)}</td><td>${fmt(r.avgShot)}</td><td>${r.dpsSustained != null ? fmt(r.dpsSustained) : '–'}</td></tr>`;
  html += '</table>';
  html += `<h3>Waffe nach Tier (bei ${o.star}★)</h3><table class="tbl"><tr><th>Tier</th><th>Attack</th><th>Ø Schuss</th><th>DPS inkl. Reload</th></tr>`;
  for (const r of result.tierTable) html += `<tr class="${r.tier === o.tier ? 'cur' : ''}"><td>${ROMAN[r.tier - 1]}</td><td>${fmt(r.attack)}</td><td>${fmt(r.avgShot)}</td><td>${r.dpsSustained != null ? fmt(r.dpsSustained) : '–'}</td></tr>`;
  html += `</table><div class="hint">${esc(data.stars.tierStatus)}</div>`;
  if (result.armorPieces.length) {
    html += `<h3>Rüstung nach Sternen (alle Teile gleich)</h3><table class="tbl"><tr><th>Sterne</th><th>Max HP</th><th>Psi Intensity</th></tr>`;
    for (const r of result.armorStarTable) html += `<tr><td>${r.star}★</td><td>${fmt(r.hp)}</td><td>${fmt(r.psi)}</td></tr>`;
    html += '</table>';
  }
  html += `<div class="hint">Sternkurve ${RARITY_LABEL[w.rarity]}: ${data.stars.curves[w.rarity].map((m) => `×${m.toFixed(2)}`).join(' · ')} (${esc(data.stars.status[w.rarity])})</div></div>`;

  // Bonus-Summe
  const b = result.bonus;
  const rows = Object.entries(STAT_LABEL).filter(([k]) => b[k]).map(([k, l]) => `<tr><td>${l}</td><td>${pctf(b[k])}</td></tr>`);
  for (const [el, v] of Object.entries(b.elemental)) if (v) rows.push(`<tr><td>${el} DMG %</td><td>${pctf(v)}</td></tr>`);
  for (const [kw, v] of Object.entries(b.keyword)) if (v) rows.push(`<tr><td>${kw} DMG %</td><td>${pctf(v)}</td></tr>`);
  for (const [kw, st] of Object.entries(b.keywordStats)) for (const [k, v] of Object.entries(st)) if (v) rows.push(`<tr><td>${esc(kw)} ${STAT_LABEL[k] || k}</td><td>${pctf(v)}</td></tr>`);
  html += `<div class="panel"><h3>Summe aller Boni</h3>${rows.length ? `<table class="tbl">${rows.join('')}</table>` : '<div class="hint">Keine Boni aktiv.</div>'}</div>`;

  // Formel
  const f = (n) => fmt(n, 2);
  html += `<div class="panel"><h3>Rechenweg</h3><pre class="formula">Attack      = ${w.damage} (Tier ${ROMAN[w.damageTier - 1]}) × ${o.tierMult.toFixed(2)} (Tier ${ROMAN[o.tier - 1]}) × ${o.starMult.toFixed(2)} (Sterne) × ${f(1 + b.attackPct / 100)} (Attack %) = ${f(o.attack)}
Körper      = ${f(o.attack)} × ${f(1 + b.weaponDmg / 100)} (Weapon DMG) × ${f(1 + o.elemental / 100)} (Element) × ${f(1 + o.vsType / 100)} (Zieltyp) × ${f(1 + o.vsMarked / 100)} (markiert)${o.isMelee ? ` × ${f(1 + b.meleeDmg / 100)} (Melee)` : ''}${b.vulnerability ? ` × ${f(1 + b.vulnerability / 100)} (Verwundbarkeit)` : ''} = ${f(o.hits.body)}
Crit        = Körper × ${build.options.critWeakspotMode === 'additive' ? `(1 + ${f(o.critDmg / 100)})` : `(1 + ${f(o.critDmg / 100)})`} = ${f(o.hits.crit)}
Weakspot    = Körper × (1 + ${f(o.weakspotDmg / 100)}) = ${f(o.hits.weakspot)}
Crit+Weak   = Körper × ${build.options.critWeakspotMode === 'additive' ? `(1 + ${f(o.critDmg / 100)} + ${f(o.weakspotDmg / 100)})` : `(1 + ${f(o.critDmg / 100)}) × (1 + ${f(o.weakspotDmg / 100)})`} = ${f(o.hits.critWeakspot)}
Ø Treffer   = gewichtet mit Crit ${f(o.critRate)} % und Weakspot ${Math.round(build.target.weakspotRate * 100)} % = ${f(o.avgHit)}
${o.cycle ? `DPS         = ${o.mag} × ${f(o.avgShot)} / (${o.mag} / ${f(o.rps)} Schuss/s + ${f(o.reload)} s Reload) = ${f(o.dpsSustained)}` : ''}${o.status?.perHit != null ? `\n${o.status.keyword.padEnd(11)} = ${o.status.formula.base === 'psi' ? `Psi ${f(result.psi)} × ${o.status.formula.ratio}` : `Attack ${f(o.attack)} × ${o.status.formula.ratio}`} × Boni${o.status.critAvg !== 1 ? ` × ${f(o.status.critAvg)} (Crit ${f(o.status.critRate)} % / +${f(o.status.critDmg)} %)` : ''} = ${f(o.status.perHit)}` : ''}</pre></div>`;

  // Aufschlüsselung
  html += `<div class="panel"><h3>Quellen der Boni</h3><table class="tbl bd">`;
  for (const line of result.breakdown) {
    const applied = line.applied ? Object.entries(line.applied).map(([k, v]) => `${statLabel(k)} ${pctf(v)}`).join(', ') : (line.inactive ? `<span class="muted">inaktiv${line.reason ? ` (${esc(line.reason)})` : ''}</span>` : '<span class="muted">kein Zahlenwert</span>');
    html += `<tr><td><span class="kind">${line.kind}</span> ${esc(line.source)}${line.stacks > 1 ? ` ×${line.stacks}` : ''}</td><td>${applied}</td></tr>`;
  }
  if (!result.breakdown.length) html += '<tr><td colspan="2" class="muted">Keine Boni ausgewählt.</td></tr>';
  html += '</table></div>';
  box.innerHTML = html;
}

// ----------------------------------------------------------------------------------
// Ereignisse
// ----------------------------------------------------------------------------------

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(build)); } catch (e) { /* privat/blockiert */ }
  history.replaceState(null, '', `#b=${encodeBuild(build)}`);
}

function update(rerender = []) {
  for (const r of rerender) r();
  renderResults();
  persist();
}

function num(v, fallback = null) { const n = Number(v); return v === '' || Number.isNaN(n) ? fallback : n; }

function bindEvents() {
  const form = $('#form');
  form.addEventListener('change', (e) => {
    const t = e.target;
    const id = t.id || '';
    if (id === 'weapon') { build.weapon.id = t.value || null; build.weapon.calibrationId = null; build.weapon.modId = null; build.weapon.keywordOverride = null; build.weapon.element = null; update([renderWeapon]); }
    else if (id === 'weapon-cal') { build.weapon.calibrationId = t.value || null; update(); }
    else if (id === 'weapon-mod') { build.weapon.modId = t.value || null; build.weapon.stacks = null; update([renderWeapon]); }
    else if (id === 'weapon-suffix') { build.weapon.suffix = t.value || null; update(); }
    else if (id === 'weapon-active') { build.weapon.active = t.checked; update(); }
    else if (id === 'weapon-stacks') { build.weapon.stacks = num(t.value, 0); update(); }
    else if (id === 'weapon-keyword') { build.weapon.keywordOverride = t.value || null; update([renderWeapon]); }
    else if (id === 'weapon-element') { build.weapon.element = t.value || null; update(); }
    else if (id.startsWith('armor-')) {
      const [, slot, what] = id.split('-');
      const cfg = build.armor[slot];
      if (!what) { cfg.id = t.value || null; cfg.modId = null; cfg.effectActive = true; cfg.effectStacks = null; update([renderArmor]); }
      else if (what === 'mod') { cfg.modId = t.value || null; cfg.stacks = null; update([renderArmor]); }
      else if (what === 'suffix') { cfg.suffix = t.value || null; update(); }
      else if (what === 'active') { cfg.active = t.checked; update(); }
      else if (what === 'stacks') { cfg.stacks = num(t.value, 0); update(); }
      else if (what === 'effect') { cfg.effectActive = t.checked; update(); }
      else if (what === 'estacks') { cfg.effectStacks = num(t.value, 0); update(); }
    }
    else if (t.classList.contains('set-active') || t.classList.contains('set-stacks')) {
      const s = t.dataset.set, p = t.dataset.pieces;
      build.setToggles[s] = build.setToggles[s] || {};
      build.setToggles[s][p] = build.setToggles[s][p] || {};
      if (t.classList.contains('set-active')) build.setToggles[s][p].active = t.checked; else build.setToggles[s][p].stacks = num(t.value, 0);
      update();
    }
    else if (id === 'food-enabled') { build.foodEnabled = t.checked; update(); }
    else if (t.classList.contains('food-pick')) { if (t.checked) build.foods.push({ id: t.dataset.id, active: true }); else build.foods = build.foods.filter((f) => f.id !== t.dataset.id); update([renderFood]); }
    else if (t.classList.contains('food-cond')) { const f = build.foods.find((x) => x.id === t.dataset.id); if (f) f.active = t.checked; update(); }
    else if (id === 'deviant') { build.deviant = { id: t.value || null, level: 1, active: true }; update([renderDeviant]); }
    else if (id === 'deviant-level') { build.deviant.level = num(t.value, 1); update(); }
    else if (id === 'deviant-active') { build.deviant.active = t.checked; update(); }
    else if (id === 'cradle-add') { if (t.value) build.cradle.push({ id: t.value, active: true }); update([renderCradle]); }
    else if (t.classList.contains('cradle-active')) { const c = build.cradle.find((x) => x.id === t.dataset.id); if (c) c.active = t.checked; update(); }
    else if (t.classList.contains('cradle-stacks')) { const c = build.cradle.find((x) => x.id === t.dataset.id); if (c) c.stacks = num(t.value, 0); update(); }
    else if (t.classList.contains('manual')) { const v = num(t.value); if (v == null || v === 0) delete build.manual[t.dataset.key]; else build.manual[t.dataset.key] = v; update(); }
    else if (t.classList.contains('manual-el')) { build.manual.elemental = build.manual.elemental || {}; const v = num(t.value); if (v == null || v === 0) delete build.manual.elemental[t.dataset.el]; else build.manual.elemental[t.dataset.el] = v; if (!Object.keys(build.manual.elemental).length) delete build.manual.elemental; update(); }
    else if (id === 't-type') { build.target.type = t.value; update(); }
    else if (id === 't-marked') { build.target.marked = t.checked; update(); }
    else if (id === 'o-mode') { build.options.critWeakspotMode = t.value; update(); }
    else if (id === 'o-pellet') { build.options.damagePerPellet = t.checked; update(); }
    else if (id === 'o-basehp') { build.options.baseHp = num(t.value, 0); update(); }
  });
  form.addEventListener('input', (e) => {
    if (e.target.id === 't-ws') { build.target.weakspotRate = Number(e.target.value) / 100; $('#t-ws-val').textContent = `${e.target.value} %`; renderResults(); persist(); }
  });
  form.addEventListener('click', (e) => {
    const star = e.target.closest('button.star');
    if (star) {
      const group = star.closest('[data-star-group]').dataset.starGroup;
      const v = Number(star.dataset.star);
      if (group === 'weapon') { build.weapon.star = v; update([renderWeapon]); }
      else if (group.startsWith('armor-')) { build.armor[group.slice(6)].star = v; update([renderArmor]); }
      return;
    }
    const tierBtn = e.target.closest('button.tier');
    if (tierBtn) { build.weapon.tier = Number(tierBtn.dataset.tier); update([renderWeapon]); return; }
    const rm = e.target.closest('.cradle-remove');
    if (rm) { build.cradle = build.cradle.filter((c) => c.id !== rm.dataset.id); update([renderCradle]); return; }
    const all = e.target.closest('[data-all-stars]');
    if (all) { const v = Number(all.dataset.allStars); for (const s of ARMOR_SLOTS) build.armor[s].star = v; build.weapon.star = v; update([renderWeapon, renderArmor]); }
  });

  $('#btn-link').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#b=${encodeBuild(build)}`;
    try { await navigator.clipboard.writeText(url); toast('Link kopiert'); } catch (e) { prompt('Link zum Build:', url); }
  });
  $('#btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ build, result: computeBuild(build, data) }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'once-human-build.json'; a.click();
  });
  $('#btn-reset').addEventListener('click', () => { if (confirm('Build zurücksetzen?')) { build = defaultBuild(); renderAll(); update(); } });
  $('#btn-sections').addEventListener('click', () => { const open = ![...document.querySelectorAll('details.sec')].every((d) => d.open); document.querySelectorAll('details.sec').forEach((d) => { d.open = open; }); });
}

function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 1800);
}

function renderAll() {
  renderWeapon(); renderArmor(); renderFood(); renderDeviant(); renderCradle(); renderManual(); renderTarget();
}

function restore() {
  const m = location.hash.match(/#b=([A-Za-z0-9_-]+)/);
  let saved = m ? decodeBuild(m[1]) : null;
  if (!saved) { try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { saved = null; } }
  if (saved && saved.weapon) {
    const d = defaultBuild();
    build = { ...d, ...saved, weapon: { ...d.weapon, ...saved.weapon }, armor: { ...d.armor, ...(saved.armor || {}) }, target: { ...d.target, ...(saved.target || {}) }, options: { ...d.options, ...(saved.options || {}) } };
    for (const s of ARMOR_SLOTS) build.armor[s] = { ...d.armor[s], ...(build.armor[s] || {}) };
  }
}

async function main() {
  try {
    await loadData();
  } catch (e) {
    $('#results').innerHTML = `<div class="hint warn">Daten konnten nicht geladen werden: ${esc(e.message)}.<br>Die Seite muss über einen Webserver geöffnet werden (z. B. <code>python3 -m http.server</code> im Ordner <code>planner/</code>), nicht per Doppelklick.</div>`;
    return;
  }
  $('#meta').textContent = `Datenstand ${data.meta.snapshotDate} · Spielversion ${data.meta.gameVersion} · ${data.weapons.length} Waffen · ${data.armor.length} Rüstungsteile · ${data.mods.length} Mods`;
  restore();
  renderAll();
  bindEvents();
  renderResults();
}

main();
