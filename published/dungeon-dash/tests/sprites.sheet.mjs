// Dungeon Dash — sprites module check + contact sheets (Chromium via Playwright).
// Run: node tests/sprites.sheet.mjs
// Writes tests/out/sprites-sheet.png (hero, allies, misc) plus
//        tests/out/sprites-sheet-crypt-fungal-forge.png, -clockwork-neon-void.png, -bosses.png, -icons.png
// Fails (exit 1) on console errors, placeholder sprites for contract names, or bad icon output.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out');
mkdirSync(out, { recursive: true });

const ENEMIES = {
  crypt: ['skeleton', 'bat', 'slime', 'lich'],
  fungal: ['mushroom', 'spider', 'sporeling', 'myconid_king'],
  forge: ['imp', 'magma_golem', 'fire_hound', 'infernal'],
  clockwork: ['cog_knight', 'steam_bot', 'gear_rat', 'brass_colossus'],
  neon: ['drone', 'cyber_ninja', 'mech', 'ai_core'],
  void: ['alien', 'void_eye', 'tentacle', 'void_titan'],
  dungeon: ['dragon', 'zombie', 'stone_golem', 'overlord'],
};
const ALLIES = ['wolf', 'fairy', 'drone_ally', 'golem_ally'];
const PROJ = ['arrow', 'fireball', 'spit', 'bolt', 'laser', 'orb', 'rock'].map((k) => 'proj_' + k);
const FX = { fx_explosion: 'play', fx_slash: 'play', fx_lightning: 'play', fx_frost: 'play', fx_meteor: 'fall', fx_blade: 'spin', fx_heal: 'play', coin: 'spin' };
const SKILLS = ['bomb', 'blades', 'warcry', 'heal', 'lightning', 'shield', 'frost', 'meteor'];
const DUNGEONS = ['dragon', 'horde', 'vault', 'mothership'];
const CURRENCIES = ['gold', 'gems', 'keys', 'scrolls', 'chest', 'premium', 'cp', 'xp'];
const SLOTS = ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'belt', 'ring', 'amulet'];

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
await page.goto(pathToFileURL(join(here, 'sprites.harness.html')).href);

const report = await page.evaluate(
  ({ ENEMIES, ALLIES, PROJ, FX, SKILLS, DUNGEONS, CURRENCIES, SLOTS }) => {
    const S = DD.sprites;
    const fails = [];
    const t0 = performance.now();
    S.init();
    S.init(); // must be safe twice
    const initMs = performance.now() - t0;
    const isPH = (c) => S.isPlaceholder(c);
    const need = (cond, msg) => {
      if (!cond) fails.push(msg);
    };
    const checkAnim = (name, an, minFrames) => {
      const c = S.anim(name, an, 0);
      need(c && c.width > 0 && !isPH(c), `${name}.${an} returned a placeholder`);
      const n = S.frameCount(name, an);
      need(n >= (minFrames || 1), `${name}.${an} has ${n} frames (< ${minFrames})`);
      for (let i = 0; i < n; i++) {
        const f = S.frame(name, an, i);
        // every frame must contain visible pixels
        const ctx = f.getContext('2d');
        const d = ctx.getImageData(0, 0, f.width, f.height).data;
        let solid = 0;
        for (let k = 3; k < d.length; k += 4) if (d[k] > 0) solid++;
        need(solid > 4, `${name}.${an}[${i}] is empty`);
      }
    };
    // hero
    for (const [an, min] of [['idle', 2], ['run', 4], ['attack', 3], ['hurt', 1], ['dead', 1]]) checkAnim('hero', an, min);
    for (let e = 0; e < 6; e++) {
      const c = S.anim('hero', 'attack', 0.1, { weaponEra: e, weaponRarity: e, armorRarity: 6 - e });
      need(!isPH(c), `hero look era ${e} placeholder`);
    }
    need(S.anim('hero', 'idle', 0, { weaponEra: 3 }) !== S.anim('hero', 'idle', 0, { weaponEra: 4 }), 'hero look does not change the sprite');
    // enemies
    for (const biome of Object.keys(ENEMIES)) {
      for (const name of ENEMIES[biome]) {
        for (const [an, min] of [['walk', 2], ['attack', 2], ['hurt', 1], ['idle', 2], ['dead', 1]]) checkAnim(name, an, min);
      }
    }
    for (const a of ALLIES) for (const an of ['idle', 'attack']) checkAnim(a, an, 1);
    checkAnim('flying_chest', 'fly', 2);
    for (const p of PROJ) checkAnim(p, 'fly', 1);
    for (const f of Object.keys(FX)) checkAnim(f, FX[f], f === 'fx_explosion' ? 5 : 1);
    // robustness
    const ph = S.anim('no_such_sprite', 'walk', 0);
    need(isPH(ph) && ph.width > 0, 'unknown sprite must return a visible placeholder');
    need(isPH(S.anim('skeleton', 'moonwalk', 0)), 'unknown anim must return a placeholder');
    for (const t of [NaN, -5, Infinity, undefined, '3', 1e9]) need(!isPH(S.anim('skeleton', 'walk', t)), `bad t=${t} broke anim`);
    need(!isPH(S.anim('hero', 'idle', 0, { weaponEra: 'x', weaponRarity: null, armorRarity: 99 })), 'garbage look broke hero');
    const base = S.anim('skeleton', 'walk', 0);
    const fl = S.flashed(base);
    need(fl && fl.width === base.width && fl.height === base.height, 'flashed size mismatch');
    need(S.flashed(base) === fl, 'flashed must be cached');
    const sz = S.size('lich');
    need(sz.w > 0 && sz.h >= 40, 'size(lich) too small');
    need(S.size('nope').w > 0, 'size(unknown) must be safe');
    // icons
    const urls = [];
    const pushUrl = (u, label) => {
      need(typeof u === 'string' && u.startsWith('data:image/png'), `${label} is not a PNG data URL`);
      urls.push(u);
    };
    for (const slot of SLOTS) for (let e = 0; e < 6; e++) for (let r = 0; r < 7; r++) pushUrl(S.itemIcon({ slot, era: e, rarity: r, ilvl: e * 10 + 1 }), `itemIcon ${slot}/${e}/${r}`);
    need(S.itemIcon({ slot: 'ring', era: 2, rarity: 3 }) === S.itemIcon({ slot: 'ring', era: 2, rarity: 3 }), 'itemIcon not cached');
    pushUrl(S.itemIcon(null), 'itemIcon(null)');
    pushUrl(S.itemIcon({ slot: 'boots', ilvl: 45 }), 'itemIcon without era');
    for (const k of SKILLS) pushUrl(S.skillIcon(k), 'skillIcon ' + k);
    for (const k of ALLIES) pushUrl(S.allyIcon(k), 'allyIcon ' + k);
    for (const k of DUNGEONS) pushUrl(S.dungeonIcon(k), 'dungeonIcon ' + k);
    for (const k of CURRENCIES) pushUrl(S.currencyIcon(k), 'currencyIcon ' + k);
    for (let l = 1; l <= 20; l++) pushUrl(S.chestIcon(l), 'chestIcon ' + l);
    pushUrl(S.chestIcon('abc'), 'chestIcon(garbage)');
    pushUrl(S.heroPortrait(), 'heroPortrait()');
    pushUrl(S.heroPortrait({ weaponEra: 5, weaponRarity: 6, armorRarity: 6 }), 'heroPortrait(look)');
    pushUrl(S.skillIcon('nope'), 'skillIcon(unknown)');
    // distinctness: different slots/eras must not share artwork
    const distinct = new Set();
    for (const slot of SLOTS) for (let e = 0; e < 6; e++) distinct.add(S.itemIcon({ slot, era: e, rarity: 0 }));
    need(distinct.size === 48, `only ${distinct.size}/48 distinct item icons`);
    return { fails, initMs: Math.round(initMs), names: S.names().length, icons: urls.length };
  },
  { ENEMIES, ALLIES, PROJ, FX, SKILLS, DUNGEONS, CURRENCIES, SLOTS },
);

async function saveSheet(file, names, opts) {
  const url = await page.evaluate(([n, o]) => SHEET.sheetSprites(n, o), [names, opts || { scale: 3, width: 1800 }]);
  writeFileSync(join(out, file), Buffer.from(url.split(',')[1], 'base64'));
}

// 1) hero (+ looks), allies, flying chest, projectiles, fx
const heroLooks = await page.evaluate(() => {
  const S = DD.sprites;
  const scale = 3;
  const looks = [];
  for (let e = 0; e < 6; e++) looks.push({ weaponEra: e, weaponRarity: e + 1 > 6 ? 6 : e + 1, armorRarity: e });
  const W = 1800;
  const cell = 40 * scale + 8;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = 32 * scale * 2 + 60;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1b1626';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#ffd27a';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('hero looks: weaponEra 0..5 (weaponRarity era+1, armorRarity era) — idle / attack swing / portrait', 10, 16);
  looks.forEach((l, i) => {
    const x = 10 + i * (cell * 2 + 10);
    const a = S.frame('hero', 'idle', 0, l);
    const b = S.frame('hero', 'attack', 1, l);
    ctx.fillStyle = '#231d31';
    ctx.fillRect(x, 26, cell * 2, 32 * scale);
    ctx.drawImage(a, x, 26, 40 * scale, 32 * scale);
    ctx.drawImage(b, x + cell, 26, 40 * scale, 32 * scale);
  });
  return new Promise((res) => {
    let pending = looks.length;
    looks.forEach((l, i) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 10 + i * (cell * 2 + 10), 32 * scale + 34, 96, 96);
        if (--pending === 0) res(c.toDataURL('image/png'));
      };
      img.src = S.heroPortrait(l);
    });
  });
});
writeFileSync(join(out, 'sprites-sheet-hero-looks.png'), Buffer.from(heroLooks.split(',')[1], 'base64'));
await saveSheet('sprites-sheet.png', ['hero', ...ALLIES, 'flying_chest', ...PROJ, ...Object.keys(FX)]);
await saveSheet('sprites-sheet-crypt-fungal-forge.png', [...ENEMIES.crypt, ...ENEMIES.fungal, ...ENEMIES.forge].filter((n) => !/lich|myconid|infernal/.test(n)).concat(['lich', 'myconid_king', 'infernal']));
await saveSheet('sprites-sheet-clockwork-neon-void.png', [...ENEMIES.clockwork, ...ENEMIES.neon, ...ENEMIES.void].filter((n) => !/colossus|ai_core|titan/.test(n)).concat(['brass_colossus', 'ai_core', 'void_titan']));
await saveSheet('sprites-sheet-bosses.png', ['dragon', 'zombie', 'stone_golem', 'overlord'], { scale: 2, width: 1800 });

// icons
const iconUrl = await page.evaluate(({ SKILLS, ALLIES, DUNGEONS, CURRENCIES, SLOTS }) => {
  const S = DD.sprites;
  const groups = [];
  const RN = ['common', 'uncommon', 'rare', 'epic', 'legend', 'mythic', 'celest'];
  for (const slot of SLOTS) {
    const items = [];
    for (let e = 0; e < 6; e++) items.push({ url: S.itemIcon({ slot, era: e, rarity: e + 1 > 6 ? 6 : e + 1 }), label: slot + ' e' + e + ' ' + RN[Math.min(6, e + 1)] });
    groups.push({ title: 'itemIcon — ' + slot + ' (era 0..5)', items });
  }
  groups.push({ title: 'itemIcon rarity ramp (weapon era 0 → celestial)', items: RN.map((r, i) => ({ url: S.itemIcon({ slot: 'weapon', era: 0, rarity: i }), label: r })) });
  groups.push({ title: 'skillIcon', items: SKILLS.map((k) => ({ url: S.skillIcon(k), label: k })) });
  groups.push({ title: 'allyIcon / dungeonIcon', items: ALLIES.map((k) => ({ url: S.allyIcon(k), label: k })).concat(DUNGEONS.map((k) => ({ url: S.dungeonIcon(k), label: k }))) });
  groups.push({ title: 'currencyIcon (32×32) + heroPortrait', items: CURRENCIES.map((k) => ({ url: S.currencyIcon(k), label: k })).concat([{ url: S.heroPortrait(), label: 'portrait' }, { url: S.heroPortrait({ weaponEra: 4, weaponRarity: 5, armorRarity: 4 }), label: 'portrait lg' }]) });
  const chests = [];
  for (let l = 1; l <= 20; l++) chests.push({ url: S.chestIcon(l), label: 'chest Lv' + l });
  groups.push({ title: 'chestIcon 1..20', items: chests });
  return SHEET.sheetIcons(groups, { scale: 2, width: 1800 });
}, { SKILLS, ALLIES, DUNGEONS, CURRENCIES, SLOTS });
writeFileSync(join(out, 'sprites-sheet-icons.png'), Buffer.from(iconUrl.split(',')[1], 'base64'));

await browser.close();

const problems = report.fails.concat(errors);
console.log(`sprites: ${report.names} sprite defs, init ${report.initMs} ms, ${report.icons} icon URLs checked`);
console.log('sheets: tests/out/sprites-sheet*.png');
if (problems.length) {
  console.error('FAIL\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('PASS');
