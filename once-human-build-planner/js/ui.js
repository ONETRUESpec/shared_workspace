/* Once Human Build Planner – UI. Depends on UI (helpers), Engine, Adapter and window.OH_DATA. */
(function () {
  'use strict';
  const { h, clear, select, starPicker, numberInput, switchInput, panel, storage, encodeState, decodeState, toast, fmt } = window.UI;
  const E = window.Engine, A = window.Adapter;

  let cat, build;
  const editor = document.getElementById('editor');
  const results = document.getElementById('results');

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function boot() {
    if (!window.OH_DATA) { editor.textContent = 'Data bundle missing: run `npm run bundle`.'; return; }
    cat = A.buildCatalog(window.OH_DATA);
    build = loadInitialBuild();
    const ver = String(cat.meta.versions.formula || '');
    const m = ver.match(/Version\s+([\d.]+)/i);
    document.getElementById('data-version').textContent = 'data: ' + (m ? 'v' + m[1] : 'v3.0.7') + ' · 2026-10-03';
    document.getElementById('data-version').title = ver;
    document.getElementById('btn-share').addEventListener('click', shareLink);
    document.getElementById('btn-export').addEventListener('click', exportJson);
    document.getElementById('btn-reset').addEventListener('click', () => { build = A.defaultBuild(cat); persist(); render(); toast('Build reset'); });
    document.getElementById('file-import').addEventListener('change', importJson);
    window.addEventListener('hashchange', () => { const b = fromHash(); if (b) { build = b; persist(); render(); } });
    render();
  }

  function loadInitialBuild() {
    const fromUrl = fromHash();
    if (fromUrl) return fromUrl;
    const saved = storage.get('build', null);
    return migrate(saved) || A.exampleBuild(cat);
  }
  function fromHash() {
    const m = location.hash.match(/[#&]b=([A-Za-z0-9_-]+)/);
    return m ? migrate(decodeState(m[1])) : null;
  }
  function migrate(b) {
    if (!b || typeof b !== 'object' || !b.weapon) return null;
    const d = A.defaultBuild(cat);
    const out = Object.assign({}, d, b);
    out.weapon = Object.assign({}, d.weapon, b.weapon || {});
    out.weapon.calibration = Object.assign({}, d.weapon.calibration, (b.weapon && b.weapon.calibration) || {});
    out.weapon.mod = Object.assign({ id: null, substats: [] }, (b.weapon && b.weapon.mod) || {});
    out.armor = Object.assign({}, d.armor);
    for (const s of A.SLOTS) out.armor[s] = Object.assign({ pieceId: null, star: 6, mod: { id: null, substats: [] } }, (b.armor && b.armor[s]) || {});
    out.food = Object.assign({}, d.food, b.food || {});
    out.deviant = Object.assign({}, d.deviant, b.deviant || {});
    out.cradle = Object.assign({}, d.cradle, b.cradle || {});
    out.target = Object.assign({}, d.target, b.target || {});
    out.options = Object.assign({}, d.options, b.options || {});
    out.toggles = b.toggles || {}; out.stacks = b.stacks || {};
    if (!cat.weapons.byId[out.weapon.id]) out.weapon.id = d.weapon.id;
    return out;
  }
  function persist() { storage.set('build', build); }
  function shareLink() {
    const url = location.origin + location.pathname + '#b=' + encodeState(build);
    history.replaceState(null, '', url);
    const done = () => toast('Build link copied');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => toast('Link is in the address bar'));
    else toast('Link is in the address bar');
  }
  function exportJson() {
    const blob = new Blob([JSON.stringify(build, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'once-human-build.json' });
    document.body.append(a); a.click(); a.remove();
  }
  function importJson(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    file.text().then(t => { const b = migrate(JSON.parse(t)); if (!b) throw new Error('not a build'); build = b; persist(); render(); toast('Build imported'); }).catch(() => toast('Could not read that file as a build'));
    ev.target.value = '';
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function set(fn, { structural = true } = {}) { fn(); if (build.example) delete build.example; persist(); structural ? render() : renderResults(); }

  function render() {
    const scrollY = window.scrollY;
    clear(editor);
    editor.append(weaponPanel(), armorPanel(), foodPanel(), deviantPanel(), cradlePanel(), targetPanel(), optionsPanel());
    renderResults();
    window.scrollTo(0, scrollY);
  }

  function collapsedState(id) { return storage.get('collapsed:' + id, false); }

  // --- Weapon -----------------------------------------------------------------
  function weaponPanel() {
    const w = cat.weapons.byId[build.weapon.id];
    const opts = cat.weapons.list.map(x => ({ value: x.id, label: `${x.name}${x.attack == null ? ' (no stats yet)' : ''}`, group: `${x.class}`, class: 'rarity-' + x.rarity, disabled: x.attack == null }));
    const maxStars = (w && w.maxStars) || 6;
    if ((build.weapon.star || 1) > maxStars) build.weapon.star = maxStars;
    const star = build.weapon.star || 1;
    const body = [];
    body.push(h('div.row',
      h('div.field', h('label', { for: 'weapon-select' }, 'Weapon'), select(opts, build.weapon.id, v => set(() => { build.weapon.id = v; build.weapon.calibration.styleId = null; }), { id: 'weapon-select' })),
      h('div.field.narrow', h('span.label', 'Blueprint stars'), starPicker(star, maxStars, v => set(() => { build.weapon.star = v; }), { id: 'weapon-stars' })),
    ));
    if (w) {
      const atk = w.attackByStar[star];
      body.push(h('div.grid3',
        stat('DMG (card)', atk != null ? fmt.num(atk) : '–', `${star}★ = ×${(w.starRatios[star - 1] || 1).toFixed(2)} of 1★ ${fmt.num(w.attack)}`),
        stat('Fire rate', w.rpm ? fmt.num(w.rpm) + ' RPM' : '–', w.pellets > 1 ? `${w.pellets} pellets` : null),
        stat('Magazine', w.magazine != null ? w.magazine : '–', w.reloadTime ? `reload ${w.reloadTime}s` : null),
        stat('Crit', `${w.critRatePct ?? '–'}% / +${w.critDmgPct ?? '–'}%`, 'rate / DMG'),
        stat('Weakspot DMG', w.weakspotDmgPct != null ? '+' + w.weakspotDmgPct + '%' : '–', null),
        stat('Keyword', w.keywordLabel || 'none', w.element ? `${w.element} element` : null),
      ));
      if (w.specialEffect && (w.specialEffect.text || w.specialEffect.summary)) body.push(h('p.note', h('b', (w.specialEffect.name || 'Special effect') + ': '), w.specialEffect.text || w.specialEffect.summary));
      body.push(h('p.note.small', w.attackSource === 'official' ? 'Base DMG from decoded official gun tables (Tier V, artLevel 5).' : w.attackSource === 'ohdb-scaled' ? `Base DMG = OHDB listed ${fmt.num(w.ohdbListedDmg)} × ${A.OHDB_TO_CARD_RATIO} (OHDB lists the Tier IV ladder; in-game Tier V cards are 1.52× higher, verified on 33 screenshots).` : 'No base DMG known for this weapon.'));
    }
    // Calibration
    const cal = build.weapon.calibration;
    const calClass = w ? cat.calibration.classMap[w.class] : null;
    const styles = cat.calibration.styles.filter(s => !calClass || s.appliesTo.includes(calClass));
    body.push(h('h3', 'Calibration blueprint'));
    body.push(h('p.note.small', 'Since v2.3.1 (Jan 2026) a calibration blueprint is consumed when crafting: fixed style attributes, one guaranteed Attack bonus (Legendary 33–50%) and one random attribute.'));
    body.push(h('div.row',
      h('div.field', h('label', { for: 'cal-style' }, 'Style'), select([{ value: '', label: 'None' }].concat(styles.map(s => ({ value: s.id, label: s.name + (s.hasValues ? '' : ' (values unknown)'), disabled: !s.hasValues }))), cal.styleId || '', v => set(() => { cal.styleId = v || null; }), { id: 'cal-style' })),
      h('div.field.narrow', h('label', { for: 'cal-attack' }, 'Attack bonus %'), numberInput(cal.attackBonusPct, { min: 0, max: 60, step: 0.5, attrs: { id: 'cal-attack' }, onChange: v => set(() => { cal.attackBonusPct = v || 0; }, { structural: false }) })),
      h('div.field', h('label', { for: 'cal-random' }, 'Random attribute'), select([{ value: '', label: 'None' }].concat(cat.calibration.randomPool.map(p => ({ value: p, label: p }))), cal.random && cal.random.stat || '', v => set(() => { cal.random = v ? { stat: v, value: (cat.calibration.randomDefaults[v] || {}).max || 20 } : null; }), { id: 'cal-random' })),
      cal.random && cal.random.stat ? h('div.field.narrow', h('label', { for: 'cal-random-v' }, 'Value %'), numberInput(cal.random.value, { min: 0, max: 60, step: 0.5, attrs: { id: 'cal-random-v' }, onChange: v => set(() => { cal.random.value = v || 0; }, { structural: false }) })) : null,
    ));
    if (cal.styleId && cat.calibration.byId[cal.styleId]) body.push(effectList(cat.calibration.byId[cal.styleId].effects, { plain: true }));
    // Weapon mod
    body.push(h('h3', 'Weapon mod'));
    body.push(modEditor(build.weapon.mod, cat.mods.weaponMods, 'weapon', w ? w.keyword : null));
    return panel('p-weapon', 'Weapon', body, { collapsed: collapsedState('p-weapon') });
  }

  function stat(k, v, sub) { return h('div.kpi', h('div.k', k), h('div.v', { style: { fontSize: '18px' } }, v), sub ? h('div.sub', sub) : null); }

  // --- Mods -------------------------------------------------------------------
  function modEditor(sel, mods, kind, keyword, slot) {
    const list = mods.filter(m => !slot || m.slot === slot);
    const opts = [{ value: '', label: 'None' }].concat(list.map(m => {
      const incompatible = kind === 'weapon' && m.keyword && keyword && m.keyword !== keyword;
      return { value: m.id, label: m.name + (m.keyword ? ` [${m.keywordLabel}]` : '') + (incompatible ? ' – needs ' + m.keywordLabel : ''), group: m.keyword ? 'Keyword mods' : 'General mods' };
    }));
    const wrap = h('div.slot');
    wrap.append(h('div.field', h('span.label', kind === 'weapon' ? 'Mod' : 'Armor mod'), select(opts, sel.id || '', v => set(() => { sel.id = v || null; if (!sel.substats || !sel.substats.length) sel.substats = defaultSubstats(kind); }))));
    const mod = sel.id && cat.mods.byId[sel.id];
    if (mod) {
      if (mod.text) wrap.append(h('p.note.small', mod.text));
      if (mod.effects.length) wrap.append(effectList(mod.effects));
      wrap.append(h('span.label', 'Sub-attributes (4, fixed per mod since v2.3.1; values at max level)'));
      const subs = h('div.substats');
      const subOpts = [{ value: '', label: '—' }].concat(cat.mods.substats.filter(s => s.appliesTo.includes(kind)).map(s => ({ value: s.id, label: s.label })));
      for (let i = 0; i < cat.mods.substatCount; i++) {
        const ss = sel.substats[i] || (sel.substats[i] = { id: null, value: null });
        const row = h('div.substat');
        row.append(select(subOpts, ss.id || '', v => set(() => { ss.id = v || null; const d = cat.mods.substatsById[v]; ss.value = d ? d.defaultValue : null; })));
        row.append(numberInput(ss.value, { step: 0.1, onChange: v => set(() => { ss.value = v; }, { structural: false }) }));
        subs.append(row);
      }
      wrap.append(subs);
    }
    return wrap;
  }
  function defaultSubstats() { return [{ id: null, value: null }, { id: null, value: null }, { id: null, value: null }, { id: null, value: null }]; }

  // --- Effect list with toggles ----------------------------------------------
  function effectList(effects, { plain = false } = {}) {
    const box = h('div.effects');
    for (const fx of effects) {
      const label = effectLabel(fx);
      if (fx.stat === 'other') { box.append(h('div.eff.dim', h('span', humanize(fx.text || fx.rawStat || 'Effect') + (fx.condition ? ' – ' + fx.condition : '')), h('span.v', fx.value != null ? String(fx.value) : ''))); continue; }
      if (plain || !fx.conditional) {
        box.append(h('div.eff', h('span', label), h('span.v', valueLabel(fx))));
        continue;
      }
      const on = build.toggles[fx.id] === true;
      const row = h('div.eff.conditional');
      const input = h('input', { type: 'checkbox', checked: on, id: 'tg-' + fx.id });
      input.addEventListener('change', () => set(() => { build.toggles[fx.id] = input.checked; }, { structural: false }));
      const lab = h('label', { for: 'tg-' + fx.id }, input, ' ', label, fx.condition ? h('span.faint.small', ' – ' + fx.condition) : null);
      row.append(lab);
      const right = h('span.v');
      if (fx.perStack) {
        const stacks = build.stacks[fx.id] != null ? build.stacks[fx.id] : (fx.maxStacks || 1);
        right.append(numberInput(stacks, { min: 0, max: fx.maxStacks || 99, step: 1, width: '58px', attrs: { title: 'stacks' }, onChange: v => set(() => { build.stacks[fx.id] = v || 0; }, { structural: false }) }), ` × ${valueLabel(fx)}`);
      } else right.append(valueLabel(fx));
      row.append(right);
      box.append(row);
    }
    return box;
  }
  function effectLabel(fx) {
    const def = E.STATS[fx.stat] || { label: fx.stat };
    let l = def.label;
    if (fx.key && fx.key !== 'all') l = l.replace('Keyword', prettyKey(fx.key)).replace('Elemental', prettyKey(fx.key)).replace('type', prettyKey(fx.key));
    if (fx.key === 'all' && fx.stat === 'elementalDmgPct') l = 'Elemental DMG % (all)';
    return l;
  }
  function humanize(s) { return String(s).replace(/_/g, ' ').replace(/\bpct\b/g, '%').replace(/\b(dmg|hp|aoe)\b/gi, m => m.toUpperCase()).replace(/^\w/, c => c.toUpperCase()); }
  function prettyKey(k) { return ({ burn: 'Burn', frostVortex: 'Frost Vortex', powerSurge: 'Power Surge', unstableBomber: 'Unstable Bomber', shrapnel: 'Shrapnel', bounce: 'Bounce', bullsEye: "Bull's Eye", fastGunner: 'Fast Gunner', fortressWarfare: 'Fortress Warfare', blaze: 'Blaze', frost: 'Frost', blast: 'Blast', shock: 'Shock', deviant: 'Deviants', human: 'Humans', monster: 'Monsters', normal: 'Normal', elite: 'Elite', boss: 'Boss', player: 'Players', shield: 'Shields' })[k] || k; }
  function valueLabel(fx) { const def = E.STATS[fx.stat]; return def && def.unit === 'pct' ? fmt.pct(fx.value, 1) : fmt.signed(fx.value, 1); }

  // --- Armor ------------------------------------------------------------------
  function armorPanel() {
    const body = [];
    const counts = {};
    for (const s of A.SLOTS) { const p = build.armor[s].pieceId && cat.armor.piecesById[build.armor[s].pieceId]; if (p && p.setId) counts[p.setId] = (counts[p.setId] || 0) + 1; }
    const quick = h('div.row',
      h('div.field', h('label', { for: 'set-quick' }, 'Equip a full set'), select([{ value: '', label: 'Choose a set…' }].concat(cat.armor.sets.map(s => ({ value: s.id, label: s.name, class: 'rarity-' + s.rarity }))), '', v => { if (!v) return; set(() => { for (const p of cat.armor.pieces) if (p.setId === v && A.SLOTS.includes(p.slot)) { build.armor[p.slot].pieceId = p.id; } }); }, { id: 'set-quick' })),
      h('div.field.narrow', h('span.label', 'All stars'), starPicker(Math.min(...A.SLOTS.map(s => build.armor[s].star || 1)), 6, v => set(() => { for (const s of A.SLOTS) build.armor[s].star = v; }), { id: 'armor-stars-all' })),
    );
    body.push(quick);
    const slots = h('div.slots');
    for (const slot of A.SLOTS) {
      const sel = build.armor[slot];
      const pieces = cat.armor.pieces.filter(p => p.slot === slot);
      const opts = [{ value: '', label: 'Empty' }].concat(pieces.map(p => ({ value: p.id, label: p.name, group: p.kind === 'key' ? 'Key armor (unique effect)' : p.setName, class: 'rarity-' + p.rarity })));
      const card = h('div.slot');
      card.append(h('div.slot-head', h('span.slot-name', slot), starPicker(sel.star || 1, 6, v => set(() => { sel.star = v; }))));
      card.append(select(opts, sel.pieceId || '', v => set(() => { sel.pieceId = v || null; })));
      const p = sel.pieceId && cat.armor.piecesById[sel.pieceId];
      if (p) {
        const bs = cat.armor.baseStatsAt(p, sel.star || 1);
        card.append(h('div.note.small', `HP ${fmt.num(bs.maxHp)} · Psi ${fmt.num(bs.psiIntensity)} · Pollution ${bs.pollutionResist ?? '–'} (Tier V, ${sel.star}★)`));
        if (p.effectText) card.append(h('p.note.small', p.effectText));
        if (p.effects.length) card.append(effectList(p.effects));
      }
      card.append(modEditor(sel.mod, cat.mods.armorMods, 'armor', null, slot));
      slots.append(card);
    }
    body.push(slots);
    // Set bonuses
    const setBox = h('div');
    setBox.append(h('h3', 'Set bonuses'));
    const active = Object.entries(counts);
    if (!active.length) setBox.append(h('p.note', 'No set pieces equipped.'));
    for (const [setId, n] of active) {
      const s = cat.armor.setsById[setId];
      if (!s) continue;
      const box = h('div.effects');
      box.append(h('div.eff', h('b', `${s.name} – ${n} piece${n > 1 ? 's' : ''}`)));
      for (const b of s.bonuses) {
        const on = n >= b.pieces;
        box.append(h('div.eff', { class: on ? '' : 'faint' }, h('span', h('span.chip', { class: on ? 'on' : '' }, `${b.pieces}pc`), ' ', b.text)));
        if (on && b.effects.length) box.append(effectList(b.effects));
      }
      setBox.append(box);
    }
    body.push(setBox);
    return panel('p-armor', 'Armor', body, { collapsed: collapsedState('p-armor') });
  }

  // --- Food -------------------------------------------------------------------
  function foodPanel() {
    const f = build.food;
    const foods = cat.food.items.filter(i => i.slot === 'food');
    const drinks = cat.food.items.filter(i => i.slot === 'drink');
    const opt = (items) => [{ value: '', label: 'None' }].concat(items.map(i => ({ value: i.id, label: i.name + (i.combatRelevant ? '' : ' (utility)'), group: i.combatRelevant ? 'Combat buffs' : 'Other buffs' })));
    const body = [];
    body.push(h('p.note.small', 'One food buff and one drink buff can be active at a time; they stack with each other. Results always show the build with and without these buffs.'));
    body.push(h('div.row',
      h('div.field', h('label', { for: 'food-sel' }, 'Food'), select(opt(foods), f.foodId || '', v => set(() => { f.foodId = v || null; }), { id: 'food-sel' })),
      h('div.field', h('label', { for: 'drink-sel' }, 'Drink'), select(opt(drinks), f.drinkId || '', v => set(() => { f.drinkId = v || null; }), { id: 'drink-sel' })),
    ));
    for (const key of ['foodId', 'drinkId']) {
      const it = f[key] && cat.food.byId[f[key]];
      if (!it) continue;
      body.push(h('div.slot', h('div.slot-head', h('span.slot-name', it.name), h('span.faint.small', it.durationSeconds ? `${Math.round(it.durationSeconds / 60)} min` : '')), effectList(it.effects), it.disagreement ? h('p.note.warn', 'Sources disagree: ' + it.disagreement) : null));
    }
    body.push(h('div.row',
      switchInput(f.chefRex, 'Chefosaurus Rex cooked (boosts dish values)', v => set(() => { f.chefRex = v; }), { id: 'chef-rex' }),
      f.chefRex ? h('div.field.narrow', h('label', { for: 'chef-rating' }, 'Rating'), select([3, 4, 5].map(n => ({ value: n, label: `${n} ★` })), f.chefRexRating, v => set(() => { f.chefRexRating = Number(v); }), { id: 'chef-rating' })) : null,
      f.chefRex ? h('div.field.narrow', h('label', { for: 'chef-mood' }, 'Mood'), select([{ value: 'high', label: 'Active ≥90' }, { value: 'mid', label: 'Active 20–89' }, { value: 'low', label: 'Active <20' }], f.chefRexMood, v => set(() => { f.chefRexMood = v; }), { id: 'chef-mood' })) : null,
    ));
    return panel('p-food', 'Food & drink', body, { collapsed: collapsedState('p-food') });
  }

  // --- Deviant ----------------------------------------------------------------
  function deviantPanel() {
    const d = build.deviant;
    const opts = [{ value: '', label: 'None' }].concat(cat.deviants.list.map(x => ({ value: x.id, label: x.name + (x.effects.length ? '' : ' (no stat effect)') })));
    const body = [];
    body.push(h('div.row',
      h('div.field', h('label', { for: 'dev-sel' }, 'Combat deviation'), select(opts, d.id || '', v => set(() => { d.id = v || null; }), { id: 'dev-sel' })),
      h('div.field.narrow', h('label', { for: 'dev-sr' }, 'Skill rating'), select([1, 2, 3, 4, 5].map(n => ({ value: n, label: `${n}` })), d.skillRating || 5, v => set(() => { d.skillRating = Number(v); }), { id: 'dev-sr' })),
      switchInput(d.active !== false, 'Skill active on target', v => set(() => { d.active = v; }), { id: 'dev-active' }),
    ));
    const dev = d.id && cat.deviants.byId[d.id];
    if (dev) {
      body.push(h('p.note.small', dev.text));
      const fxs = dev.effects.map(fx => Object.assign({}, fx, { value: fx.valueBySkillRating ? fx.valueBySkillRating[(d.skillRating || 5) - 1] : fx.value }));
      if (fxs.length) body.push(effectList(fxs));
      else body.push(h('p.note', 'This deviation has no modelled stat effect on your weapon damage (its own skill damage is listed in the notes).'));
      if (dev.damage && dev.damage.formula) body.push(h('p.note.small', 'Skill damage: ' + dev.damage.formula));
    }
    body.push(h('p.note.small', 'Values scale linearly with Skill Rating (SR5 = 2× SR1), per decoded game-client formulas.'));
    return panel('p-deviant', 'Deviation', body, { collapsed: collapsedState('p-deviant') });
  }

  // --- Cradle -----------------------------------------------------------------
  function cradlePanel() {
    const c = build.cradle;
    const body = [];
    const picked = c.nodeIds.map(id => cat.cradle.byId[id]).filter(Boolean);
    body.push(h('p.note.small', `Up to ${cat.cradle.maxActive} Cradle Overrides. ${picked.length}/${cat.cradle.maxActive} selected.`));
    const opts = [{ value: '', label: 'Add an override…' }].concat(cat.cradle.nodes.filter(n => !c.nodeIds.includes(n.id)).map(n => ({ value: n.id, label: (`${n.name} – ${n.text}`.length > 72 ? `${n.name} – ${n.text}`.slice(0, 70) + '…' : `${n.name} – ${n.text}`), group: n.style || 'Other' })));
    body.push(h('div.field', h('label', { for: 'cradle-add' }, 'Add override'), select(opts, '', v => { if (!v) return; if (c.nodeIds.length >= cat.cradle.maxActive) { toast(`Maximum ${cat.cradle.maxActive} overrides`); return; } set(() => { c.nodeIds.push(v); }); }, { id: 'cradle-add' })));
    const list = h('div.slots');
    for (const n of picked) {
      list.append(h('div.slot',
        h('div.slot-head', h('span.slot-name', n.name), h('button.btn.small.ghost', { type: 'button', onclick: () => set(() => { c.nodeIds = c.nodeIds.filter(x => x !== n.id); }) }, 'Remove')),
        h('p.note.small', n.text),
        n.effects.length ? effectList(n.effects) : null,
      ));
    }
    body.push(list);
    return panel('p-cradle', 'Cradle overrides', body, { collapsed: collapsedState('p-cradle') });
  }

  // --- Target -----------------------------------------------------------------
  function targetPanel() {
    const t = build.target;
    const body = [h('div.row',
      h('div.field', h('label', { for: 'tgt-faction' }, 'Enemy type'), select(E.TARGET_FACTIONS.map(f => ({ value: f, label: prettyKey(f) })), t.faction, v => set(() => { t.faction = v; }), { id: 'tgt-faction' })),
      h('div.field', h('label', { for: 'tgt-tier' }, 'Enemy tier'), select(E.TARGET_TIERS.map(f => ({ value: f, label: prettyKey(f) })), t.tier, v => set(() => { t.tier = v; }), { id: 'tgt-tier' })),
      h('div.field.narrow', h('label', { for: 'tgt-vuln' }, 'Extra Vulnerability %'), numberInput(t.vulnerabilityPct, { min: 0, max: 200, step: 1, attrs: { id: 'tgt-vuln' }, onChange: v => set(() => { t.vulnerabilityPct = v || 0; }, { structural: false }) })),
      h('div.field.narrow', h('label', { for: 'tgt-mit' }, 'Damage taken %'), numberInput(t.mitigation, { min: 1, max: 200, step: 1, attrs: { id: 'tgt-mit', title: 'Enemy level / armour mitigation is not published; 100 = no reduction' }, onChange: v => set(() => { t.mitigation = v || 100; }, { structural: false }) })),
    ), h('p.note.small', 'DMG-vs-type bonuses apply to the selected type and tier. Enemy level and armour mitigation have no published formula; use "Damage taken %" to approximate it.')];
    return panel('p-target', 'Target', body, { collapsed: collapsedState('p-target') });
  }

  // --- Options ----------------------------------------------------------------
  function optionsPanel() {
    const o = build.options;
    const body = [
      h('div.field', h('label', { for: 'opt-cw' }, 'Crit × Weakspot on one hit'), select([{ value: 'additive', label: '1 + Crit DMG + Weakspot DMG (one bucket; most community calculators)' }, { value: 'multiplicative', label: '(1 + Crit DMG) × (1 + Weakspot DMG)' }], o.critWeakspotModel, v => set(() => { o.critWeakspotModel = v; }), { id: 'opt-cw' })),
      switchInput(o.elementalAffectsBullets, 'Apply matching Elemental DMG % to bullets too (unverified; default off = status procs only)', v => set(() => { o.elementalAffectsBullets = v; }), { id: 'opt-el' }),
      switchInput(o.attackAndWeaponDmgSeparate, 'Attack % and Weapon DMG % are separate multiplicative buckets (off = one additive bucket)', v => set(() => { o.attackAndWeaponDmgSeparate = v; }), { id: 'opt-aw' }),
    ];
    return panel('p-options', 'Formula options', body, { collapsed: collapsedState('p-options') });
  }

  // ---------------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------------
  function renderResults() {
    clear(results);
    const withFood = A.computeBuild(build, cat, { includeFood: true });
    const noFood = A.computeBuild(build, cat, { includeFood: false });
    if (!withFood) { results.append(h('div.panel', h('div.body', h('p.note', 'Pick a weapon to see results.')))); return; }
    const hasFood = !!(build.food.foodId || build.food.drinkId);
    const r = withFood;
    const w = r.weapon;
    // KPIs
    const kp = h('div.panel', h('header', h('h2', `${w.name} · ${build.weapon.star}★`), build.example ? h('span.chip', { title: 'This is a sample loadout. Change anything to make it yours.' }, 'example build') : null), h('div.body',
      h('div.kpi-grid',
        kpi('Body hit', r.hits.normal, `attack ${fmt.num(r.attack.final)} · ×${r.multipliers.weaponDmgMult.toFixed(3)} wpn`),
        kpi('Crit hit', r.hits.crit, `${r.multipliers.critRatePct.toFixed(1)}% rate · +${r.multipliers.critDmgPct.toFixed(1)}% DMG`, 'crit'),
        kpi('Weakspot hit', r.hits.weakspot, `+${r.multipliers.weakspotPct.toFixed(1)}% weakspot`, 'weak'),
        kpi('Weakspot crit', r.hits.weakspotCrit, build.options.critWeakspotModel === 'additive' ? 'additive crit+weakspot' : 'multiplicative', 'weak'),
        kpi('Expected / shot (body)', r.expectedBody * r.inputs.pellets, r.inputs.pellets > 1 ? `${r.inputs.pellets} pellets` : 'crit-weighted average'),
        kpi('Expected / shot (weakspot)', r.expectedWeak * r.inputs.pellets, 'crit-weighted average'),
        r.status && r.status.perProc != null ? kpi(`${prettyKey(r.status.keyword)} proc`, r.status.perProc, r.status.model === 'psi' ? `Psi ${fmt.num(r.psi.effective)} × ${(r.status.factor * 100).toFixed(0)}%${r.status.tickSeconds ? ` per ${r.status.tickSeconds}s tick` : ''}` : `${(r.status.factor * 100).toFixed(0)}% of hit, can crit/weakspot`, 'status') : (w.keyword ? kpi(`${prettyKey(w.keyword)}`, null, 'no numeric model yet', 'status') : null),
        kpi('Max HP', r.defense.maxHp, `Psi ${fmt.num(r.psi.effective)} · Pollution ${fmt.num(r.defense.pollutionResist)}`),
      ),
      h('div.kpi-grid', { style: { marginTop: '8px' } },
        kpi('Burst DPS', r.dps.totalBurstBody, `${fmt.num(r.rate.rpm)} RPM${r.dps.statusBurst ? ` · incl. ${fmt.num(r.dps.statusBurst)} status` : ''}`),
        kpi('Sustained DPS', r.dps.totalSustainedBody, `mag ${r.rate.magazine} · reload ${r.rate.reloadTime.toFixed(2)}s`),
        kpi('Burst DPS (weakspot)', r.dps.totalBurstWeakspot, 'all shots on weakspot'),
        kpi('Magazine damage', r.dps.magazineDamageBody, 'body, crit-weighted'),
      ),
    ));
    results.append(kp);
    // With vs without food
    const cmp = E.compare(noFood, withFood);
    const rows = [['Body hit', 'normal', 0], ['Crit hit', 'crit', 0], ['Weakspot hit', 'weakspot', 0], ['Weakspot crit', 'weakspotCrit', 0], ['Expected / shot (body)', 'expectedBody', 0], ['Status proc', 'status', 1], ['Burst DPS', 'burstBody', 0], ['Sustained DPS', 'sustainedBody', 0], ['Max HP', 'maxHp', 0]];
    const table = h('table.cmp', h('thead', h('tr', h('th', 'Metric'), h('th', 'No food'), h('th', 'With food'), h('th', 'Δ'))));
    const tb = h('tbody');
    for (const [label, key, d] of rows) {
      const c = cmp[key]; if (!c) continue;
      tb.append(h('tr', h('td', label), h('td.num', fmt.num(c.a, d)), h('td.num', fmt.num(c.b, d)), h('td.num', { class: c.delta > 0 ? 'delta-up' : c.delta < 0 ? 'delta-down' : '' }, c.deltaPct != null ? fmt.pct(c.deltaPct, 1) : '–')));
    }
    table.append(tb);
    results.append(h('div.panel', h('header', h('h2', 'With food vs. without')), h('div.body', hasFood ? h('div.table-wrap', table) : h('p.note', 'No food or drink selected. Pick a dish or drink to compare.'))));
    // Star comparison
    const st = h('table.cmp', h('thead', h('tr', h('th', 'Stars'), h('th', 'Card DMG'), h('th', 'Body hit'), h('th', 'Weakspot crit'), h('th', 'Sustained DPS'))));
    const stb = h('tbody');
    const saved = build.weapon.star;
    for (let s = 1; s <= (w.maxStars || 6); s++) {
      build.weapon.star = s;
      const rs = A.computeBuild(build, cat, { includeFood: true });
      stb.append(h('tr', { class: s === saved ? 'total' : '' }, h('td', `${s}★`), h('td.num', fmt.num(rs.attack.atStar)), h('td.num', fmt.num(rs.hits.normal)), h('td.num', fmt.num(rs.hits.weakspotCrit)), h('td.num', fmt.num(rs.dps.totalSustainedBody))));
    }
    build.weapon.star = saved;
    st.append(stb);
    results.append(h('div.panel', h('header', h('h2', '1★ to 6★')), h('div.body', h('div.table-wrap', st), h('p.note.small', w.rarity === 'epic' ? 'Epic blueprints cap at 5★ (official series ×1.00 / 1.056 / 1.112 / 1.167 / 1.223). Stars change nothing else on the card.' : 'Each star adds 5% of the 1★ card DMG (official blueprint table: ×1.00 / 1.05 / 1.10 / 1.15 / 1.20 / 1.25). Stars change nothing else on the card.'))));
    // Breakdown
    results.append(breakdownPanel(r));
    // Formula
    results.append(h('div.panel', h('header', h('h2', 'Formula')), h('div.body',
      h('pre.formula', formulaText(r)),
      h('details.breakdown', h('summary', 'Confidence notes'), h('ul.note.small',
        h('li', 'Base DMG per star: official blueprint tables, matches 33 in-game screenshots (high).'),
        h('li', 'Weapon DMG %, Crit, Weakspot and DMG-vs-type stacking: community-tested model shared by the main calculators (medium).'),
        h('li', 'Status proc = Psi × factor × (1 + Status DMG% + keyword DMG%) × (1 + Elemental%) × (1 + Final%) – reproduces the in-game 113 test (medium).'),
        h('li', 'Crit+Weakspot additive vs multiplicative is disputed; switch it in Formula options.'),
        h('li', 'Enemy level/armour mitigation and range falloff are not modelled unless you set "Damage taken %".'),
      )),
    )));
  }

  function kpi(k, v, sub, cls) { return h('div.kpi', { class: cls || '' }, h('div.k', k), h('div.v', v == null ? '–' : fmt.num(v, v < 100 ? 1 : 0)), sub ? h('div.sub', sub) : null); }

  function breakdownPanel(r) {
    const box = h('div.body');
    const groups = [
      ['Attack %', 'attackPct'], ['Attack (flat)', 'attackFlat'], ['Weapon DMG %', 'weaponDmgPct'], ['Crit Rate %', 'critRatePct'], ['Crit DMG %', 'critDmgPct'], ['Weakspot DMG %', 'weakspotDmgPct'],
      ['Elemental DMG %', 'elementalDmgPct'], ['Status DMG %', 'statusDmgPct'], ['Keyword DMG %', 'keywordDmgPct'], ['Final DMG %', 'finalDmgPct'], ['DMG vs type %', 'dmgVsPct'], ['Vulnerability (weapon) %', 'weaponVulnPct'], ['Vulnerability (status) %', 'statusVulnPct'], ['All DMG %', 'allDmgPct'],
      ['Psi Intensity', 'psiIntensity'], ['Psi Intensity %', 'psiIntensityPct'], ['Fire Rate %', 'fireRatePct'], ['Reload Efficiency %', 'reloadEfficiencyPct'], ['Magazine %', 'magazinePct'], ['Max HP', 'maxHp'], ['Max HP %', 'maxHpPct'], ['DMG Reduction %', 'dmgReductionPct'],
    ];
    for (const [label, stat] of groups) {
      const src = r.sources[stat];
      if (!src || !src.length) continue;
      const total = r.totals[stat];
      const totalText = typeof total === 'object' ? Object.entries(total).map(([k, v]) => `${k === 'all' ? '' : prettyKey(k) + ' '}${fmt.signed(v, 1)}`).join(', ') : fmt.signed(total, 1);
      const det = h('details.breakdown', h('summary', `${label}: ${totalText}`));
      const g = h('div.bucket');
      for (const s of src) g.append(h('span.src', `${s.source}${s.key && s.key !== 'all' ? ' (' + prettyKey(s.key) + ')' : ''}`), h('span.v', fmt.signed(s.value, 1)));
      det.append(g);
      box.append(det);
    }
    return h('div.panel', h('header', h('h2', 'Stat breakdown')), box);
  }

  function formulaText(r) {
    const m = r.multipliers;
    const lines = [
      `hit = ${fmt.num(r.attack.atStar)} (card, ${r.inputs.star}★)`,
      `    × ${m.attackMult.toFixed(3)} (1 + Attack ${fmt.pct(r.attack.pct, 1)})`,
      `    × ${m.weaponDmgMult.toFixed(3)} (1 + Weapon DMG ${fmt.pct(m.weaponDmgPct, 1)})`,
      m.elementalApplied ? `    × ${(1 + m.elementalPct / 100).toFixed(3)} (1 + Elemental ${fmt.pct(m.elementalPct, 1)})` : null,
      `    × ${(1 + m.dmgVsPct / 100).toFixed(3)} (1 + DMG vs type ${fmt.pct(m.dmgVsPct, 1)})`,
      `    × ${(1 + m.weaponVulnPct / 100).toFixed(3)} (1 + Vulnerability ${fmt.pct(m.weaponVulnPct, 1)})`,
      `    × ${(1 + m.allDmgPct / 100).toFixed(3)} (1 + All DMG ${fmt.pct(m.allDmgPct, 1)})`,
      m.mitigation !== 1 ? `    × ${m.mitigation.toFixed(2)} (damage taken)` : null,
      `    = ${fmt.num(r.hits.normal, 1)} body hit`,
      `crit      × ${m.critMult.toFixed(3)}   weakspot × ${m.weakMult.toFixed(3)}   weakspot crit × ${m.critWeakMult.toFixed(3)}`,
      r.status && r.status.perProc != null ? (r.status.model === 'psi'
        ? `proc = Psi ${fmt.num(r.psi.effective)} × ${(r.status.factor * 100).toFixed(0)}% × (1 + Status/keyword ${fmt.pct(r.psi.statusDmgPct + (r.totals.keywordDmgPct ? ((r.totals.keywordDmgPct.all || 0) + (r.totals.keywordDmgPct[r.status.keyword] || 0)) : 0), 1)}) × elemental × final × vuln = ${fmt.num(r.status.perProc, 1)}`
        : `proc = hit × ${(r.status.factor * 100).toFixed(0)}% × (1 + ${prettyKey(r.status.keyword)} DMG) = ${fmt.num(r.status.perProc, 1)} (crit/weakspot apply)`) : null,
    ].filter(Boolean);
    return lines.join('\n');
  }

  boot();
})();
