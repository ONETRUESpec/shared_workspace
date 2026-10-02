// End-to-end smoke test of the built single-file game (dist/dungeon-dash.html, opened via file://).
//
// Plays the real game through its real DOM in Chromium at 390×844 (phone, touch) and 1280×800
// (desktop), plus a layout-only pass at 360×640: boots, checks the canvas draws, opens chests and
// decides Equip/Sell in the compare modal, claims a quest, sets auto-loot rules, runs auto-open,
// upgrades the chest, unlocks/equips/upgrades a skill and an ally, buys mastery, enters + leaves a
// dungeon and wins one, taps a flying chest, visits every tab and sheet, runs ×3 speed for ~60 s,
// imports its own exported save, hits a boss wall (farming + Challenge Boss), reloads (save
// persists) and fakes a 3 h absence (AFK modal). The 360 pass also does a two-tap reset, and the
// dist/artifact.html fragment is checked statically and booted in a host-like shell with
// localStorage blocked.
//
// Asserts: no console errors / page errors (only failed Google Fonts requests are ignored), no
// "NaN" / "undefined" / "Infinity" / "[object" text in the DOM, no horizontal overflow on phones.
// Screenshots: tests/out/smoke-<width>-<step>.png
//
// Usage: node tests/smoke.mjs [--no-build] [--speed-seconds=60] [--only=390,1280,360]
// Needs Playwright with Chromium (global install is fine: NODE_PATH must reach it).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  for (const p of ['/opt/node22/lib/node_modules/playwright', '/usr/local/lib/node_modules_global/playwright', '/usr/local/lib/node_modules/playwright']) {
    try {
      ({ chromium } = require(p));
      break;
    } catch {
      /* try the next one */
    }
  }
}
if (!chromium) {
  console.error('Playwright is not installed (npm i -g playwright && npx playwright install chromium)');
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(here, 'out');
const fontDir = join(out, 'smoke-fonts');
mkdirSync(fontDir, { recursive: true });

const args = process.argv.slice(2);
const argVal = (name, d) => {
  const a = args.find((x) => x.startsWith('--' + name + '='));
  return a ? a.slice(name.length + 3) : d;
};
const SPEED_SECONDS = Math.max(5, Number(argVal('speed-seconds', '60')) || 60);
const ONLY = argVal('only', '390,1280,360').split(',').map((x) => Number(x));

if (!args.includes('--no-build')) execFileSync(process.execPath, [join(root, 'build.mjs')], { stdio: 'inherit' });
const PAGE = pathToFileURL(join(root, 'dist', 'dungeon-dash.html')).href;

// ------------------------------------------------------------------ reporting
let failed = 0;
let passed = 0;
const check = (cond, msg) => {
  if (cond) passed++;
  else failed++;
  console.log((cond ? '  ok   ' : '  FAIL ') + msg);
  return !!cond;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shots = [];

// ------------------------------------------------------------------ Google Fonts through a cache
// Chromium cannot always reach Google Fonts directly (sandbox proxies), so font requests are served
// from a curl-fed disk cache. If that fails too the request is aborted, and the resulting "failed to
// load" console error is the only error this test ignores.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
function cachedFetch(url) {
  const file = join(fontDir, createHash('sha1').update(url).digest('hex').slice(0, 16));
  if (!existsSync(file)) writeFileSync(file, execFileSync('curl', ['-sS', '-f', '-m', '20', '-A', UA, url], { timeout: 25000 }));
  return readFileSync(file);
}
async function routeFonts(ctx) {
  const serve = (type) => async (route) => {
    try {
      const body = cachedFetch(route.request().url());
      await route.fulfill({ status: 200, contentType: type, headers: { 'access-control-allow-origin': '*' }, body });
    } catch {
      await route.abort('failed');
    }
  };
  await ctx.route(/^https:\/\/fonts\.googleapis\.com\//, serve('text/css'));
  await ctx.route(/^https:\/\/fonts\.gstatic\.com\//, serve('font/woff2'));
}
const isFontNoise = (text, url) => /fonts\.(googleapis|gstatic)\.com/.test(url || '') || (/fonts\.(googleapis|gstatic)\.com/.test(text) && /Failed to load/.test(text));

// ------------------------------------------------------------------ page helpers
const errors = [];
const warnings = [];
function watch(page, tag) {
  page.on('console', (m) => {
    const url = (m.location() && m.location().url) || '';
    if (m.type() === 'error' && !isFontNoise(m.text(), url)) errors.push(`[${tag}] ${m.text()}`);
    if (m.type() === 'warning' && !isFontNoise(m.text(), url)) warnings.push(`[${tag}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.stack || e.message}`));
}

async function domScan(page, label) {
  const bad = await page.evaluate(() => {
    const re = /NaN|undefined|Infinity|\[object/;
    const found = [];
    const text = document.body.innerText || '';
    for (const line of text.split('\n')) if (re.test(line)) found.push('text: ' + line.trim().slice(0, 80));
    for (const el of document.querySelectorAll('[aria-label], [title], [data-reason]')) {
      for (const a of ['aria-label', 'title', 'data-reason']) {
        const v = el.getAttribute(a);
        if (v && re.test(v)) found.push(a + ': ' + v.slice(0, 80));
      }
    }
    return found;
  });
  check(bad.length === 0, `${label}: no NaN/undefined/Infinity/[object text` + (bad.length ? ' — ' + bad.slice(0, 4).join(' | ') : ''));
}

async function overflow(page, label) {
  const bad = await page.evaluate(() => {
    const out = [];
    const W = window.innerWidth;
    const doc = document.documentElement;
    if (doc.scrollWidth > W) out.push('document ' + doc.scrollWidth + ' > ' + W);
    if (document.body.scrollWidth > W) out.push('body ' + document.body.scrollWidth + ' > ' + W);
    const visible = (el) => el.offsetParent !== null && el.getClientRects().length > 0;
    for (const sel of ['.panels', '.panel', '.sheet-body', '.hud', '.stage', '.skillbar', '.tabs', '.cmp-cards', '.cmp-diff', '.dlg-actions', '.dlg', '.sheet']) {
      for (const el of document.querySelectorAll(sel)) {
        if (visible(el) && el.scrollWidth > el.clientWidth + 1) out.push(sel + ' scrollWidth ' + el.scrollWidth + ' > ' + el.clientWidth);
      }
    }
    for (const el of document.querySelectorAll('button, .card, .pill, .icard, .toast, .ld-slot')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > W + 0.5 || r.left < -0.5)) out.push((el.className || el.tagName).toString().slice(0, 40) + ' sticks out [' + Math.round(r.left) + ',' + Math.round(r.right) + ']');
    }
    return out;
  });
  check(bad.length === 0, `${label}: no horizontal overflow` + (bad.length ? ' — ' + bad.slice(0, 4).join('; ') : ''));
}

async function shot(page, w, name) {
  const p = join(out, `smoke-${w}-${name}.png`);
  await page.screenshot({ path: p });
  shots.push(p);
}

const ov = (page) => page.evaluate(() => DD.ui.overlayKind());
const S = (page, fn, arg) => page.evaluate(fn, arg);

async function press(page, touch, selector) {
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: 'visible', timeout: 5000 });
  if (touch) await loc.tap({ timeout: 5000 });
  else await loc.click({ timeout: 5000 });
}

async function boot(page) {
  await page.waitForFunction(
    () => window.DD && DD.ui && DD.battle && DD.render && DD.battle.time > 0.3 && document.querySelector('#battle-canvas') && document.querySelector('.tabs'),
    null,
    { timeout: 20000 },
  );
  await page.evaluate(() => document.fonts && document.fonts.ready);
}

async function canvasStats(page) {
  return page.evaluate(() => {
    const c = document.getElementById('battle-canvas');
    const r = c.getBoundingClientRect();
    // Read from a throw-away copy so the game's own canvas never gets a readback (and Chrome does
    // not warn about repeated getImageData on it).
    const copy = document.createElement('canvas');
    copy.width = c.width;
    copy.height = c.height;
    const g = copy.getContext('2d', { willReadFrequently: true });
    g.drawImage(c, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    let n = 0;
    let hash = 0;
    const colors = new Set();
    const step = 4 * 37;
    for (let i = 0; i < d.length; i += step) {
      n++;
      if (d[i] + d[i + 1] + d[i + 2] > 60) lit++;
      colors.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
      hash = (hash * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0;
    }
    return { w: c.width, h: c.height, cssW: r.width, cssH: r.height, dpr: window.devicePixelRatio, lit: lit / n, colors: colors.size, hash };
  });
}

// Resolves a pending compare modal through its real buttons (waits out the legendary reveal lock).
async function decideCompare(page, touch, choice) {
  await page.waitForFunction(() => String(DD.ui.overlayKind() || '').startsWith('compare'), null, { timeout: 5000 });
  const sel = choice === 'equip' ? '.cmp-equip' : '.cmp-sell';
  await page.waitForFunction((s) => {
    const b = document.querySelector(s);
    return b && b.getAttribute('aria-disabled') !== 'true';
  }, sel, { timeout: 5000 });
  await press(page, touch, sel);
  await page.waitForFunction(() => !String(DD.ui.overlayKind() || '').startsWith('compare') && !DD.state.s.pendingItem, null, { timeout: 5000 });
}

async function resolvePending(page, touch) {
  for (let i = 0; i < 3; i++) {
    const k = await ov(page);
    if (k && k.startsWith('compare')) await decideCompare(page, touch, 'sell');
    else if (await S(page, () => !!DD.state.s.pendingItem)) {
      await S(page, () => DD.ui.openSheet('compare'));
      await wait(100);
    } else return;
  }
}

async function closeSheet(page, touch) {
  await press(page, touch, '.overlay .x-btn');
  await page.waitForFunction(() => DD.ui.overlayKind() === null, null, { timeout: 3000 });
}

// ------------------------------------------------------------------ full play-through
async function playThrough(browser, vp) {
  const W = vp.w;
  const touch = !!vp.touch;
  const tag = String(W);
  console.log(`\n=== ${W}×${vp.h} (dpr ${vp.dpr}${touch ? ', touch' : ''}) ===`);
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr, isMobile: touch, hasTouch: touch });
  await routeFonts(ctx);
  const page = await ctx.newPage();
  watch(page, tag);
  await page.goto(PAGE, { waitUntil: 'load' });
  await boot(page);
  await wait(1200);

  // ---- boot + canvas
  const fresh = await S(page, () => ({ chests: DD.state.s.chests, weapon: DD.state.s.equipped.weapon && DD.state.s.equipped.weapon.name, ov: DD.ui.overlayKind(), tab: DD.ui.currentTab() }));
  check(fresh.chests >= 10 && fresh.weapon === 'Rusty Sword' && fresh.ov === null && fresh.tab === 'loot', `boot: fresh save (chests ${fresh.chests}, ${fresh.weapon}), Loot tab, no modal`);
  const c1 = await canvasStats(page);
  await wait(500);
  const c2 = await canvasStats(page);
  check(c1.lit > 0.25 && c1.colors > 24, `canvas draws (lit ${(c1.lit * 100).toFixed(0)}%, ${c1.colors} colours)`);
  check(c1.hash !== c2.hash, 'canvas animates between frames');
  check(Math.abs(c1.w - Math.round(c1.cssW * c1.dpr)) <= 1 && Math.abs(c1.cssW / c1.cssH - 1.8) < 0.02, `canvas backing ${c1.w}×${c1.h} matches CSS ${c1.cssW.toFixed(0)}×${c1.cssH.toFixed(0)} × dpr ${c1.dpr}, aspect 360:200`);
  await shot(page, W, '01-boot');
  await domScan(page, 'boot');
  if (W <= 400) await overflow(page, 'boot');

  // ---- manual chests: compare modal, Equip and Sell through the real buttons
  for (let i = 0; i < 6; i++) {
    const before = await S(page, () => ({ eq: DD.state.s.stats.itemsEquipped, sold: DD.state.s.stats.itemsSold, opened: DD.state.s.stats.chestsOpened, chests: DD.state.s.chests }));
    await press(page, touch, '.chest-btn');
    await page.waitForFunction(() => String(DD.ui.overlayKind() || '').startsWith('compare'), null, { timeout: 5000 });
    if (i === 0) {
      await wait(1300);
      await shot(page, W, '02-compare');
      await domScan(page, 'compare modal');
      if (W <= 400) await overflow(page, 'compare modal');
    }
    const choice = i % 2 === 0 ? 'equip' : 'sell';
    await decideCompare(page, touch, choice);
    const after = await S(page, () => ({ eq: DD.state.s.stats.itemsEquipped, sold: DD.state.s.stats.itemsSold, opened: DD.state.s.stats.chestsOpened }));
    const ok = after.opened === before.opened + 1 && (choice === 'equip' ? after.eq === before.eq + 1 : after.sold === before.sold + 1);
    check(ok, `chest ${i + 1}: opened and ${choice === 'equip' ? 'equipped' : 'sold'} via the modal`);
  }
  await wait(300);
  check(await S(page, () => typeof DD.audio.isReady !== 'function' || DD.audio.isReady() === true), 'audio: the AudioContext is running after the first gesture');
  if (!touch) {
    // desktop shortcut: C opens a chest (the compare modal appears)
    await page.keyboard.press('c');
    const viaKey = await page.waitForFunction(() => String(DD.ui.overlayKind() || '').startsWith('compare'), null, { timeout: 3000 }).then(() => true, () => false);
    check(viaKey, 'keyboard: C opens a chest');
    if (viaKey) await decideCompare(page, touch, 'sell');
  }
  const logLines = await S(page, () => document.querySelectorAll('.loot-log li').length);
  check(logLines >= 3, `recent-loot list shows manual decisions (${logLines} lines)`);

  // ---- quest claim
  await wait(300);
  const q0 = await S(page, () => ({ i: DD.state.s.quest.index, done: !!(DD.state.currentQuest() || {}).done }));
  if (q0.done) {
    await press(page, touch, '.btn-claim');
    await wait(200);
    check((await S(page, () => DD.state.s.quest.index)) === q0.i + 1, 'quest Claim button claims the reward');
  } else check(false, 'first quest ("Open a chest") should be claimable after opening chests');

  // ---- auto-loot rules + auto-open
  await press(page, touch, '.loot-controls [data-act="autoLootSheet"]');
  await page.waitForFunction(() => DD.ui.overlayKind() === 'autoloot');
  const unchecked = await S(page, () => [...document.querySelectorAll('.sellgrid .chk')].map((b, i) => (b.getAttribute('aria-checked') === 'true' ? -1 : i)).filter((i) => i >= 0));
  for (const i of unchecked) await press(page, touch, `.sellgrid .chk[data-arg="${i}"]`);
  await page.selectOption('#stop-rarity', '7');
  await wait(150);
  await shot(page, W, '03-autoloot-sheet');
  await domScan(page, 'auto-loot sheet');
  if (W <= 400) await overflow(page, 'auto-loot sheet');
  const al = await S(page, () => DD.state.s.settings.autoLoot);
  check(al.sell.every(Boolean) && al.stopRarity === 7, 'auto-loot sheet: every rarity set to auto-sell, stop = never (via checkboxes + select)');
  await closeSheet(page, touch);

  await S(page, () => DD.state.addChests(40));
  const opened0 = await S(page, () => DD.state.s.stats.chestsOpened);
  await press(page, touch, '.loot-controls [data-act="toggleAutoOpen"]');
  check(await S(page, () => DD.state.s.autoOpen === true), 'Auto-open switch turns auto-open on');
  await wait(3000);
  const ao = await S(page, () => ({ opened: DD.state.s.stats.chestsOpened, log: document.querySelectorAll('.loot-log li').length, ticker: document.querySelectorAll('.ticker .tk').length, ov: DD.ui.overlayKind() }));
  check(ao.opened - opened0 >= 6 && ao.ov === null, `auto-open opened ${ao.opened - opened0} chests in 3 s without blocking (log ${ao.log}, ticker ${ao.ticker})`);
  await shot(page, W, '04-autoopen');
  await press(page, touch, '.loot-controls [data-act="toggleAutoOpen"]');
  check(await S(page, () => DD.state.s.autoOpen === false), 'Auto-open switch turns auto-open off');
  await resolvePending(page, touch);

  // ---- chest level upgrade through the sheet
  await S(page, () => DD.state.addGold(5e6));
  await press(page, touch, '.chest-lv');
  await page.waitForFunction(() => DD.ui.overlayKind() === 'chest');
  const lv0 = await S(page, () => DD.state.s.chestLevel);
  await press(page, touch, '.overlay [data-act="upgradeChest"]');
  await wait(150);
  await press(page, touch, '.overlay [data-act="upgradeChest"]');
  await wait(250);
  await shot(page, W, '05-chest-sheet');
  await domScan(page, 'chest sheet');
  if (W <= 400) await overflow(page, 'chest sheet');
  check((await S(page, () => DD.state.s.chestLevel)) === lv0 + 2, `chest sheet upgrades the chest level (${lv0} → ${lv0 + 2})`);
  await closeSheet(page, touch);

  // ---- skills: unlock, equip (single slot), upgrade, then the slot chooser once more slots open
  await S(page, () => DD.state.addScrolls(120));
  await press(page, touch, '#tab-skills');
  await press(page, touch, '[data-act="skillMain"][data-arg="blades"]');
  check(await S(page, () => DD.state.s.skills.owned.blades === 1), 'skills: Unlock button unlocks Spinning Blades');
  await wait(200);
  await press(page, touch, '[data-act="skillEquip"][data-arg="blades"]');
  check(await S(page, () => DD.state.s.skills.equipped[0] === 'blades'), 'skills: Equip puts Spinning Blades in the only open slot');
  await wait(200);
  await press(page, touch, '[data-act="skillMain"][data-arg="blades"]');
  check(await S(page, () => DD.state.s.skills.owned.blades === 2), 'skills: Upgrade raises Spinning Blades to Lv 2');
  // progress jump (as if the player had reached floor 12): 3 skill slots, 1 ally slot, 3 dungeons
  await S(page, () => {
    DD.state.s.campaign.highestFloor = Math.max(12, DD.state.s.campaign.highestFloor);
    DD.state.invalidate();
  });
  await wait(300);
  await press(page, touch, '[data-act="skillEquip"][data-arg="bomb"]');
  await page.locator('.uc[data-id="bomb"] .chooser').waitFor({ state: 'visible', timeout: 3000 });
  await shot(page, W, '06-skill-chooser');
  if (W <= 400) await overflow(page, 'skill chooser');
  await press(page, touch, '.uc[data-id="bomb"] .ch-slot[data-arg2="1"]');
  await wait(200);
  const sk = await S(page, () => ({ eq: DD.state.s.skills.equipped.slice(), battle: DD.battle.skillSlots.map((x) => x.id) }));
  check(sk.eq[0] === 'blades' && sk.eq[1] === 'bomb' && sk.battle[0] === 'blades' && sk.battle[1] === 'bomb', `skills: slot chooser equips Fire Bomb to slot 2 (state ${sk.eq.join(',')}; battle ${sk.battle.join(',')})`);
  await domScan(page, 'skills tab');

  // ---- allies: recruit (auto-equips), unequip, equip, train
  await S(page, () => DD.state.addGems(3000));
  await press(page, touch, '#tab-allies');
  await press(page, touch, '[data-act="allyMain"][data-arg="wolf"]');
  await wait(250);
  const al1 = await S(page, () => ({ owned: DD.state.s.allies.owned.wolf, eq: DD.state.s.allies.equipped[0], battle: DD.battle.allies.map((a) => a.id) }));
  check(al1.owned === 1 && al1.eq === 'wolf' && al1.battle.includes('wolf'), `allies: Recruit adds the Dire Wolf to the party and the battle (${al1.battle.join(',')})`);
  await press(page, touch, '[data-act="allyUnequip"][data-arg="wolf"]');
  await wait(150);
  check(await S(page, () => DD.state.s.allies.equipped[0] === null && DD.battle.allies.length === 0), 'allies: Unequip removes the wolf from battle');
  await press(page, touch, '[data-act="allyEquip"][data-arg="wolf"]');
  await wait(150);
  check(await S(page, () => DD.state.s.allies.equipped[0] === 'wolf'), 'allies: Equip puts the wolf back');
  await press(page, touch, '[data-act="allyMain"][data-arg="wolf"]');
  check(await S(page, () => DD.state.s.allies.owned.wolf === 2), 'allies: Train raises the wolf to Lv 2');
  await wait(400);
  await shot(page, W, '07-allies');
  await domScan(page, 'allies tab');

  // ---- mastery
  await press(page, touch, '#tab-mastery');
  await press(page, touch, '[data-act="masteryUp"][data-arg="might"]');
  await press(page, touch, '[data-act="masteryUp"][data-arg="vitality"]');
  const ms = await S(page, () => DD.state.s.mastery);
  check(ms.might === 1 && ms.vitality === 1, 'mastery: Upgrade buys Might and Vitality');
  await wait(200);
  await shot(page, W, '08-mastery');

  // ---- dungeons: enter + leave, then enter + win
  await S(page, () => DD.state.addKeys(3));
  await press(page, touch, '#tab-dungeons');
  await wait(200);
  await shot(page, W, '09-dungeons');
  await domScan(page, 'dungeons tab');
  if (W <= 400) await overflow(page, 'dungeons tab');
  const keys0 = await S(page, () => DD.state.s.keys);
  await press(page, touch, '[data-act="enterDungeon"][data-arg="dragon"]');
  await wait(200);
  const dg = await S(page, () => ({ mode: DD.battle.mode, id: DD.battle.dungeon && DD.battle.dungeon.id, keys: DD.state.s.keys, tab: DD.ui.currentTab() }));
  check(dg.mode === 'dungeon' && dg.id === 'dragon' && dg.keys === keys0 - 1 && dg.tab === 'loot', `dungeon: Enter starts Dragon's Lair, spends a key, shows the battle (tab ${dg.tab})`);
  await wait(2500);
  await shot(page, W, '10-dungeon');
  await domScan(page, 'in dungeon');
  if (W <= 400) await overflow(page, 'dungeon strip');
  await press(page, touch, '.stage [data-act="leaveDungeon"]');
  await wait(200);
  check(await S(page, () => DD.battle.mode === 'campaign'), 'dungeon: Leave returns to the campaign');

  // a hero strong enough to win (Might 100), then restore the real Might level
  await S(page, () => {
    window.__dg = [];
    DD.bus.on('dungeon:won', (p) => window.__dg.push('won:' + p.id));
    DD.bus.on('dungeon:failed', (p) => window.__dg.push('failed:' + p.id + ':' + p.reason));
    window.__might = DD.state.s.mastery.might;
    DD.state.s.mastery.might = 100;
    DD.state.invalidate();
  });
  await press(page, touch, '#tab-dungeons');
  await page.waitForFunction(() => DD.battle.phase !== 'dead', null, { timeout: 5000 });
  await press(page, touch, '[data-act="enterDungeon"][data-arg="dragon"]');
  await page.waitForFunction(() => window.__dg.length > 0, null, { timeout: 60000 }).catch(() => {});
  const res = await S(page, () => ({ ev: window.__dg.slice(), level: DD.state.s.dungeons.dragon.level, won: DD.state.s.stats.dungeonsWon }));
  check(res.ev[0] === 'won:dragon' && res.level === 2 && res.won === 1, `dungeon: Dragon's Lair won (${res.ev.join(',') || 'no result'}; level ${res.level})`);
  await page.waitForFunction(() => DD.battle.mode === 'campaign', null, { timeout: 8000 }).catch(() => {});
  await S(page, () => {
    DD.state.s.mastery.might = window.__might;
    DD.state.invalidate();
  });
  check(await S(page, () => DD.battle.mode === 'campaign'), 'dungeon: back in the campaign after the victory');

  // ---- flying chest: force one across, then tap it where it is drawn
  let collected = false;
  for (let attempt = 0; attempt < 3 && !collected; attempt++) {
    const fc0 = await S(page, () => DD.state.s.stats.flyingChests);
    await S(page, () => DD.battle.spawnFlyingChest());
    await page.waitForFunction(() => DD.battle.flyingChest && DD.battle.flyingChest.x > 70, null, { timeout: 6000 }).catch(() => {});
    if (attempt === 0) await shot(page, W, '11-flying-chest');
    const pt = await S(page, () => {
      const fc = DD.battle.flyingChest;
      if (!fc) return null;
      const r = document.getElementById('battle-canvas').getBoundingClientRect();
      const lead = fc.x + ((fc.x1 - fc.x0) / fc.life) * 0.05; // where it will be by the time the tap lands
      return { x: r.left + (lead / 360) * r.width, y: r.top + (fc.y / 200) * r.height };
    });
    if (!pt) continue;
    if (touch) await page.touchscreen.tap(pt.x, pt.y);
    else await page.mouse.click(pt.x, pt.y);
    await wait(150);
    collected = (await S(page, () => DD.state.s.stats.flyingChests)) === fc0 + 1;
  }
  check(collected, `flying chest: a ${touch ? 'tap' : 'click'} on the canvas collects it`);
  await wait(250);
  await shot(page, W, '12-chest-collected');

  // ---- every tab + every sheet
  for (const t of ['loot', 'hero', 'skills', 'allies', 'dungeons', 'mastery']) {
    await press(page, touch, '#tab-' + t);
    await wait(250);
    const st = await S(page, (id) => ({ cur: DD.ui.currentTab(), vis: !document.getElementById('panel-' + id).hidden }), t);
    check(st.cur === t && st.vis, `tab ${t}: switches and shows its panel`);
    await shot(page, W, '13-tab-' + t);
    await domScan(page, 'tab ' + t);
    if (W <= 400) await overflow(page, 'tab ' + t);
  }
  await press(page, touch, '.settings-row');
  await page.waitForFunction(() => DD.ui.overlayKind() === 'settings');
  await wait(200);
  check(await S(page, () => (document.querySelector('.overlay textarea.code') || {}).value.length > 100), 'settings sheet: shows an export code');
  await shot(page, W, '14-settings');
  await domScan(page, 'settings sheet');
  if (W <= 400) await overflow(page, 'settings sheet');
  await page.keyboard.press('Escape');
  await wait(150);
  check((await ov(page)) === null, 'settings sheet: Escape closes it');
  // export code -> import through the sheet (state:reset makes battle + UI re-initialise)
  await press(page, touch, '.settings-row');
  await page.waitForFunction(() => DD.ui.overlayKind() === 'settings');
  // compare against what the code itself holds (it was generated when the sheet opened; kills since
  // then have changed the live gold)
  const exported = await S(page, () => {
    const code = document.querySelector('.overlay textarea[readonly]').value;
    const save = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(code), (ch) => ch.charCodeAt(0))));
    return { code, eq: save.equipped.weapon && save.equipped.weapon.id, gold: save.gold, lv: save.chestLevel };
  });
  await page.locator('.overlay textarea:not([readonly])').fill(exported.code);
  await press(page, touch, '.overlay [data-act="importCode"]');
  await page.waitForFunction(() => DD.ui.overlayKind() === null, null, { timeout: 3000 }).catch(() => {});
  await wait(300);
  const imported = await S(page, () => ({ ov: DD.ui.overlayKind(), eq: DD.state.s.equipped.weapon && DD.state.s.equipped.weapon.id, gold: DD.state.s.gold, lv: DD.state.s.chestLevel, mode: DD.battle.mode, toast: document.querySelector('.toasts').textContent }));
  check(imported.ov === null && imported.eq === exported.eq && imported.lv === exported.lv && imported.gold >= exported.gold && /imported/i.test(imported.toast) && imported.mode === 'campaign', 'settings: exported code imports back through the sheet (save restored, battle re-initialised)' + ` [ov ${imported.ov}, weapon ${imported.eq === exported.eq}, chestLv ${exported.lv}→${imported.lv}, gold ${exported.gold}→${imported.gold}, mode ${imported.mode}, toasts "${imported.toast.slice(0, 120)}"]`);
  await press(page, touch, '#tab-hero');
  await press(page, touch, '.slot[data-arg="weapon"]');
  await page.waitForFunction(() => DD.ui.overlayKind() === 'item:weapon');
  await wait(150);
  await shot(page, W, '15-item-sheet');
  await domScan(page, 'item sheet');
  await closeSheet(page, touch);

  // ---- ×3 speed with auto-open running
  await press(page, touch, '#tab-loot');
  for (let i = 0; i < 3 && (await S(page, () => DD.state.s.settings.speed)) !== 3; i++) await press(page, touch, '.tgl-speed');
  check(await S(page, () => DD.state.s.settings.speed === 3), 'speed button cycles to ×3');
  await S(page, () => DD.state.addChests(400));
  await press(page, touch, '.loot-controls [data-act="toggleAutoOpen"]');
  const sp0 = await S(page, () => ({ t: DD.battle.time, kills: DD.state.s.stats.kills, floor: DD.state.s.campaign.highestFloor, opened: DD.state.s.stats.chestsOpened }));
  const t0 = Date.now();
  let minFps = Infinity;
  while (Date.now() - t0 < SPEED_SECONDS * 1000) {
    await wait(Math.min(10000, SPEED_SECONDS * 1000 - (Date.now() - t0)));
    const fps = await S(page, () => new Promise((r) => {
      let n = 0;
      const start = performance.now();
      const f = () => (++n, performance.now() - start < 500 ? requestAnimationFrame(f) : r((n * 1000) / (performance.now() - start)));
      requestAnimationFrame(f);
    }));
    minFps = Math.min(minFps, fps);
    await domScan(page, `×3 run +${Math.round((Date.now() - t0) / 1000)}s`);
  }
  const sp1 = await S(page, () => ({ t: DD.battle.time, kills: DD.state.s.stats.kills, floor: DD.state.s.campaign.highestFloor, opened: DD.state.s.stats.chestsOpened, ov: DD.ui.overlayKind() }));
  const ratio = (sp1.t - sp0.t) / SPEED_SECONDS;
  check(ratio > 2.2, `×3 speed: ${(sp1.t - sp0.t).toFixed(0)} s of battle in ${SPEED_SECONDS} s (×${ratio.toFixed(2)}), min fps ≈ ${minFps.toFixed(0)}`);
  check(sp1.kills > sp0.kills && sp1.opened > sp0.opened, `×3 run: ${sp1.kills - sp0.kills} kills, ${sp1.opened - sp0.opened} chests auto-opened, highest floor ${sp0.floor} → ${sp1.floor}`);
  await shot(page, W, '16-speed3');
  await press(page, touch, '.loot-controls [data-act="toggleAutoOpen"]');
  for (let i = 0; i < 3 && (await S(page, () => DD.state.s.settings.speed)) !== 1; i++) await press(page, touch, '.tgl-speed');
  await resolvePending(page, touch);
  if (W <= 400) await overflow(page, 'after ×3 run');

  // ---- reload: the save persists
  const snap = await S(page, () => {
    DD.state.save();
    const s = DD.state.s;
    return {
      floor: s.campaign.floor,
      high: s.campaign.highestFloor,
      gold: s.gold,
      chestLevel: s.chestLevel,
      eq: Object.keys(s.equipped).map((k) => (s.equipped[k] ? s.equipped[k].id : null)).join(','),
      skills: JSON.stringify(s.skills),
      allies: JSON.stringify(s.allies),
      mastery: JSON.stringify(s.mastery),
      dungeons: JSON.stringify(s.dungeons),
    };
  });
  await page.reload({ waitUntil: 'load' });
  await boot(page);
  await wait(600);
  const back = await S(page, () => {
    const s = DD.state.s;
    return {
      floor: s.campaign.floor,
      high: s.campaign.highestFloor,
      gold: s.gold,
      chestLevel: s.chestLevel,
      eq: Object.keys(s.equipped).map((k) => (s.equipped[k] ? s.equipped[k].id : null)).join(','),
      skills: JSON.stringify(s.skills),
      allies: JSON.stringify(s.allies),
      mastery: JSON.stringify(s.mastery),
      dungeons: JSON.stringify(s.dungeons),
      bFloor: DD.battle.floor,
      ov: DD.ui.overlayKind(),
    };
  });
  check(back.eq === snap.eq, 'reload: equipped items persisted');
  check(back.floor >= snap.floor && back.floor <= snap.floor + 1 && back.high >= snap.high && back.bFloor === back.floor, `reload: floor persisted (${snap.floor} → ${back.floor}, battle on ${back.bFloor})`);
  check(back.gold >= snap.gold && back.gold < snap.gold * 1.5 + 1000, `reload: gold persisted (${snap.gold} → ${back.gold})`);
  check(back.chestLevel === snap.chestLevel && back.skills === snap.skills && back.allies === snap.allies && back.mastery === snap.mastery && back.dungeons === snap.dungeons, 'reload: chest level, skills, allies, mastery and dungeons persisted');
  check(back.ov === null, 'reload: no AFK modal after a short absence');
  await domScan(page, 'after reload');

  // ---- boss wall: lose to a boss far too strong, farm, then Challenge Boss from the stage strip
  const prevFloor = await S(page, () => DD.state.s.campaign.floor);
  await S(page, () => {
    const c = DD.state.s.campaign;
    c.floor = 60;
    c.highestFloor = Math.max(60, c.highestFloor);
    c.wave = 1;
    c.farming = false;
    DD.state.invalidate();
  });
  await wait(100);
  await S(page, () => DD.battle.challengeBoss());
  await page.waitForFunction(() => DD.battle.farming === true && !DD.battle.isBossWave, null, { timeout: 45000 }).catch(() => {});
  await wait(400);
  const farm = await S(page, () => {
    const b = document.querySelector('.stage .btn-boss');
    return { farming: DD.battle.farming, saved: DD.state.s.campaign.farming, btn: !!b && !b.hidden && b.offsetParent !== null, sub: document.querySelector('.st-sub').textContent };
  });
  check(farm.farming && farm.saved && farm.btn && /Farming/.test(farm.sub), `boss wall: a failed boss switches to farming and shows Challenge Boss ("${farm.sub}")`);
  await shot(page, W, '17-farming');
  await domScan(page, 'farming strip');
  if (W <= 400) await overflow(page, 'farming strip');
  if (farm.btn) {
    await press(page, touch, '.stage .btn-boss');
    await wait(150);
    check(await S(page, () => DD.battle.farming === false && DD.state.s.campaign.farming === false), 'Challenge Boss leaves farming and heads for the boss');
  }
  await S(page, (f) => {
    const c = DD.state.s.campaign;
    c.floor = f;
    c.wave = 1;
    c.farming = false;
    DD.state.invalidate();
  }, prevFloor);
  await wait(200);

  // ---- 3 h away: AFK modal
  await S(page, () => {
    DD.state.save(); // also restarts the autosave clock
    const key = DD.state.SAVE_KEY || 'dungeon-dash-save-v1';
    const raw = JSON.parse(localStorage.getItem(key));
    raw.lastSeen = Date.now() - 3 * 3600 * 1000;
    localStorage.setItem(key, JSON.stringify(raw));
    DD.state.save = () => false; // keep pagehide from overwriting the back-dated save
  });
  await page.reload({ waitUntil: 'load' });
  await boot(page);
  await page.waitForFunction(() => DD.ui.overlayKind() === 'offline', null, { timeout: 5000 }).catch(() => {});
  await wait(400);
  const off = await S(page, () => ({ kind: DD.ui.overlayKind(), title: (document.querySelector('.off-title') || {}).textContent || '', rows: document.querySelectorAll('.dlg-offline .rewards li').length }));
  check(off.kind === 'offline' && /away/.test(off.title) && /3h/.test(off.title) && off.rows >= 1, `AFK modal after a 3 h absence ("${off.title}", ${off.rows} reward rows)`);
  await shot(page, W, '18-offline');
  await domScan(page, 'AFK modal');
  if (W <= 400) await overflow(page, 'AFK modal');
  if (off.kind === 'offline') {
    await press(page, touch, '.dlg-offline [data-act="collectOffline"]');
    await wait(200);
    check((await ov(page)) === null, 'AFK modal: Collect closes it');
  }

  // ---- device slept with the tab visible: no visibilitychange, frames just stop; the wall clock jumps
  await S(page, () => {
    const real = Date.now.bind(Date);
    Date.now = () => real() + 10 * 60 * 1000;
  });
  await page.waitForFunction(() => DD.ui.overlayKind() === 'offline', null, { timeout: 4000 }).catch(() => {});
  const slept = await S(page, () => ({ kind: DD.ui.overlayKind(), title: (document.querySelector('.off-title') || {}).textContent || '' }));
  check(slept.kind === 'offline' && /10m/.test(slept.title), `AFK modal after the device slept 10 min with the tab open ("${slept.title}")`);
  if (slept.kind === 'offline') await press(page, touch, '.dlg-offline [data-act="collectOffline"]');
  await wait(1500);
  const c3 = await canvasStats(page);
  check(c3.lit > 0.25, 'canvas still drawing at the end');
  await shot(page, W, '19-end');
  await ctx.close();
}

// ------------------------------------------------------------------ narrow phone: layout only
async function layoutPass(browser, vp) {
  const W = vp.w;
  const touch = true;
  console.log(`\n=== ${W}×${vp.h} layout pass ===`);
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr, isMobile: true, hasTouch: true });
  await routeFonts(ctx);
  const page = await ctx.newPage();
  watch(page, String(W));
  await page.goto(PAGE, { waitUntil: 'load' });
  await boot(page);
  await wait(800);
  await overflow(page, `${W} boot`);
  await shot(page, W, '01-boot');
  await press(page, touch, '.chest-btn');
  await page.waitForFunction(() => String(DD.ui.overlayKind() || '').startsWith('compare'));
  await wait(1300);
  await overflow(page, `${W} compare modal`);
  await shot(page, W, '02-compare');
  await decideCompare(page, touch, 'equip');
  await S(page, () => {
    DD.state.addGold(1e6);
    DD.state.addGems(1e4);
    DD.state.addScrolls(500);
    DD.state.s.campaign.highestFloor = 25;
    DD.state.invalidate();
    DD.state.unlockSkill('blades');
    DD.state.unlockSkill('heal');
    DD.state.unlockAlly('wolf');
    DD.state.unlockAlly('fairy');
  });
  for (const t of ['loot', 'hero', 'skills', 'allies', 'dungeons', 'mastery']) {
    await press(page, touch, '#tab-' + t);
    await wait(250);
    await overflow(page, `${W} tab ${t}`);
    await domScan(page, `${W} tab ${t}`);
    await shot(page, W, '03-tab-' + t);
  }
  for (const [name, open] of [['chest', '.chest-lv'], ['autoloot', '[data-act="autoLootSheet"]']]) {
    await press(page, touch, '#tab-loot');
    await press(page, touch, open);
    await page.waitForFunction((k) => DD.ui.overlayKind() === k, name);
    await wait(200);
    await overflow(page, `${W} ${name} sheet`);
    await shot(page, W, '04-sheet-' + name);
    await closeSheet(page, touch);
  }
  await press(page, touch, '#tab-mastery');
  await press(page, touch, '.settings-row');
  await page.waitForFunction(() => DD.ui.overlayKind() === 'settings');
  await overflow(page, `${W} settings sheet`);
  await shot(page, W, '04-sheet-settings');
  await closeSheet(page, touch);
  await press(page, touch, '#tab-dungeons');
  await press(page, touch, '[data-act="enterDungeon"][data-arg="horde"]');
  await wait(1500);
  await overflow(page, `${W} dungeon strip`);
  await shot(page, W, '05-dungeon');
  // two-tap reset from the settings sheet wipes everything, even mid-dungeon
  await press(page, touch, '#tab-mastery');
  await press(page, touch, '.settings-row');
  await page.waitForFunction(() => DD.ui.overlayKind() === 'settings');
  await press(page, touch, '.overlay [data-act="resetAsk"]');
  await wait(150);
  const armed = await S(page, () => document.querySelector('.overlay [data-act="resetAsk"]').textContent);
  check(/erase/i.test(armed), `reset: first tap arms the confirm ("${armed}")`);
  await overflow(page, `${W} reset confirm`);
  await press(page, touch, '.overlay [data-act="resetAsk"]');
  await wait(500);
  const r = await S(page, () => ({ chests: DD.state.s.chests, floor: DD.state.s.campaign.floor, high: DD.state.s.campaign.highestFloor, bFloor: DD.battle.floor, mode: DD.battle.mode, ov: DD.ui.overlayKind(), gold: DD.state.s.gold, w: DD.state.s.equipped.weapon && DD.state.s.equipped.weapon.name }));
  check(r.chests >= 10 && r.floor === 1 && r.high === 1 && r.bFloor === 1 && r.mode === 'campaign' && r.ov === null && r.gold < 100 && r.w === 'Rusty Sword', `reset: second tap starts a fresh game (floor ${r.floor}, battle ${r.mode} floor ${r.bFloor}, ${r.chests} chests)`);
  await domScan(page, `${W} after reset`);
  await shot(page, W, '06-after-reset');
  await ctx.close();
}

// ------------------------------------------------------------------ dist/artifact.html fragment
async function fragmentPass(browser) {
  console.log('\n=== dist/artifact.html fragment (host shell, storage blocked) ===');
  const frag = readFileSync(join(root, 'dist', 'artifact.html'), 'utf8');
  const page0 = readFileSync(join(root, 'dist', 'dungeon-dash.html'), 'utf8');
  check(!/<!doctype|<html[\s>]|<\/html>|<head[\s>]|<\/head>|<body[\s>]|<\/body>/i.test(frag), 'artifact.html: no doctype/html/head/body tags');
  check(/<title>Dungeon Dash<\/title>/.test(frag), 'artifact.html: has <title>');
  const scripts = frag.match(/<script\b[^>]*>/gi) || [];
  check(scripts.length >= 9 && scripts.every((t) => !/\bsrc=/i.test(t)), `artifact.html: all ${scripts.length} scripts inline`);
  const links = (frag.match(/<link\b[^>]*rel="stylesheet"[^>]*>/gi) || []).map((t) => (t.match(/href="([^"]+)"/) || [])[1]);
  check(links.every((h) => /^https:\/\/fonts\.googleapis\.com\//.test(h)) && /<style>/.test(frag), 'artifact.html: CSS inline, only Google Fonts stylesheets external');
  check(/^<!doctype html>/i.test(page0) && !/<script\b[^>]*\bsrc=/i.test(page0), 'dungeon-dash.html: standalone page with inline scripts');

  const shell = join(out, 'smoke-artifact-host.html');
  writeFileSync(shell, '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>\n' + frag + '</body></html>\n');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await routeFonts(ctx);
  // the strictest host: any touch of localStorage throws
  await ctx.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
  });
  const page = await ctx.newPage();
  watch(page, 'artifact');
  await page.goto(pathToFileURL(shell).href, { waitUntil: 'load' });
  await boot(page);
  await wait(800);
  const c = await canvasStats(page);
  check(c.lit > 0.25 && (await page.title()) === 'Dungeon Dash', `artifact fragment boots in a host shell with storage blocked (canvas lit ${(c.lit * 100).toFixed(0)}%)`);
  await press(page, true, '.chest-btn');
  await decideCompare(page, true, 'equip');
  check(await S(page, () => DD.state.s.stats.itemsEquipped === 1 && DD.state.save() === false), 'artifact fragment: chests open and equip; saving fails quietly');
  await overflow(page, 'artifact fragment');
  await shot(page, 'artifact', '01-boot');
  await ctx.close();
}

// ------------------------------------------------------------------ run
const browser = await chromium.launch();
const VIEWPORTS = [
  { w: 390, h: 844, dpr: 3, touch: true },
  { w: 1280, h: 800, dpr: 1, touch: false },
];
try {
  for (const vp of VIEWPORTS) {
    if (!ONLY.includes(vp.w)) continue;
    try {
      await playThrough(browser, vp);
    } catch (e) {
      check(false, `${vp.w}: play-through aborted: ${String(e.message || e).split('\n')[0]}`);
    }
  }
  try {
    await fragmentPass(browser);
  } catch (e) {
    check(false, `artifact fragment pass aborted: ${String(e.message || e).split('\n')[0]}`);
  }
  if (ONLY.includes(360)) {
    try {
      await layoutPass(browser, { w: 360, h: 640, dpr: 2 });
    } catch (e) {
      check(false, `360: layout pass aborted: ${String(e.message || e).split('\n')[0]}`);
    }
  }
} finally {
  await browser.close();
}

console.log('');
check(errors.length === 0, 'no console errors or page errors' + (errors.length ? ':\n    ' + errors.slice(0, 15).join('\n    ') : ''));
if (warnings.length) console.log('  (console warnings: ' + warnings.length + ')\n    ' + warnings.slice(0, 8).join('\n    '));
console.log(`\nscreenshots: ${shots.length} in tests/out/smoke-*.png`);
console.log(failed ? `SMOKE FAILED: ${failed} failed, ${passed} passed` : `SMOKE PASSED: ${passed} checks`);
process.exit(failed ? 1 : 0);
