// Dungeon Dash — UI visual + behaviour harness (Chromium via Playwright).
// Run: node tests/ui.shot.mjs [viewFilter] [widths]
//   e.g. node tests/ui.shot.mjs compare,loot 360
// Screenshots every tab, the chest compare modal (normal / legendary / celestial into an empty slot),
// the chest-upgrade, auto-loot, item and settings sheets, the offline modal and stage-strip states at
// 360×640, 390×844 and 1280×800 into tests/out/ui_<view>_<w>.png. Asserts no console/page errors and
// no horizontal overflow, then drives a few real interactions and a live run of src/index.html.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(here, 'out');
const fontDir = join(out, 'ui-fonts');
mkdirSync(fontDir, { recursive: true });

// ------------------------------------------------------------------ fonts (best effort, cached)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Pixelify+Sans:wght@400..700&display=swap';
const fontCss = join(out, 'ui-fonts.css');
function prepareFonts() {
  if (existsSync(fontCss) && readFileSync(fontCss, 'utf8').includes('@font-face')) return;
  try {
    const css = execFileSync('curl', ['-sS', '-m', '15', '-A', UA, FONT_URL], { encoding: 'utf8', timeout: 20000 });
    const blocks = css.split('@font-face').slice(1);
    let local = '';
    let n = 0;
    for (const b of blocks) {
      if (!/unicode-range:\s*U\+0000-00FF/.test(b)) continue; // latin subset only
      const url = (b.match(/url\((https:[^)]+\.woff2)\)/) || [])[1];
      if (!url) continue;
      const file = 'f' + n++ + '.woff2';
      writeFileSync(join(fontDir, file), execFileSync('curl', ['-sS', '-m', '15', url], { timeout: 20000 }));
      local += '@font-face' + b.replace(url, 'ui-fonts/' + file);
    }
    writeFileSync(fontCss, local);
    console.log('  fonts: ' + n + ' latin faces cached');
  } catch (e) {
    writeFileSync(fontCss, '/* fonts unavailable offline */\n');
    console.log('  (font download skipped: ' + String(e.message).split('\n')[0] + ')');
  }
}
prepareFonts();

// ------------------------------------------------------------------ static server
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = join(root, p);
    if (!file.startsWith(root)) throw new Error('outside');
    await stat(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const harness = `${origin}/tests/ui.harness.html`;

let failed = 0;
const check = (cond, msg) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + msg);
  if (!cond) failed++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ views
const tab = (id) => async (p) => p.evaluate((t) => UIH.tab(t), id);
const VIEWS = [
  ['loot', async (p) => p.evaluate(() => { UIH.scenario('mid'); UIH.tab('loot'); UIH.lootFeed(); })],
  ['hero', tab('hero')],
  ['skills', tab('skills')],
  ['skills-choose', async (p) => {
    await p.evaluate(() => UIH.tab('skills'));
    await p.click('.uc-skill[data-id="heal"] .uc-equip');
    await p.evaluate(() => document.querySelector('.uc-skill[data-id="heal"]').scrollIntoView({ block: 'center' }));
  }],
  ['allies', tab('allies')],
  ['dungeons', tab('dungeons')],
  ['mastery', tab('mastery')],
  ['compare', async (p) => p.evaluate(() => { UIH.tab('loot'); UIH.compare('normal'); }), 450],
  ['compare-worse', async (p) => p.evaluate(() => { DD.state.s.pendingItem = null; UIH.compare('worse'); }), 450],
  ['compare-reveal', async (p) => p.evaluate(() => { DD.state.s.pendingItem = null; UIH.compare('legendary'); }), 260],
  ['compare-legendary', async (p) => p.evaluate(() => { DD.state.s.pendingItem = null; UIH.compare('legendary'); }), 1500],
  ['compare-celestial', async (p) => p.evaluate(() => { DD.state.s.pendingItem = null; UIH.compare('celestial'); }), 1500],
  ['chest-sheet', async (p) => p.evaluate(() => { DD.state.s.pendingItem = null; DD.ui.closeOverlay(); DD.ui.closeOverlay(); UIH.sheet('chest'); })],
  ['autoloot', async (p) => p.evaluate(() => UIH.sheet('autoloot'))],
  ['item', async (p) => p.evaluate(() => { UIH.tab('hero'); UIH.sheet('item', 'armor'); })],
  ['item-empty', async (p) => p.evaluate(() => UIH.sheet('item', 'amulet'))],
  ['settings', async (p) => p.evaluate(() => { UIH.tab('mastery'); UIH.sheet('settings'); })],
  ['offline', async (p) => p.evaluate(() => { DD.ui.closeOverlay(); UIH.tab('loot'); UIH.offline(); }), 400],
  ['farm', async (p) => p.evaluate(() => { DD.ui.closeOverlay(); UIH.scenario('farm'); UIH.tab('loot'); })],
  ['boss', async (p) => p.evaluate(() => { UIH.scenario('boss'); UIH.tab('dungeons'); UIH.toasts(); }), 500],
  ['dungeon', async (p) => p.evaluate(() => { UIH.scenario('dungeon'); UIH.tab('dungeons'); })],
  ['hero-stats', async (p) => p.evaluate(() => { DD.ui.closeOverlay(); UIH.scenario('mid'); UIH.tab('hero'); const el = document.getElementById('dd-panels'); el.scrollTop = el.scrollHeight; })],
  ['focus', async (p) => {
    await p.evaluate(() => { UIH.tab('loot'); document.activeElement && document.activeElement.blur(); document.querySelector('.chest-lv').focus(); });
    await p.keyboard.press('Tab');
  }],
  ['fresh', async (p) => p.evaluate(() => { UIH.scenario('fresh'); UIH.tab('loot'); })],
  ['fresh-skills', tab('skills')],
  ['fresh-dungeons', tab('dungeons')],
  ['fresh-allies', tab('allies')],
];

const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',') : null;
const widths = process.argv[3] ? process.argv[3].split(',').map(Number) : [360, 390, 1280];
const VIEWPORTS = [
  { w: 360, h: 640, dpr: 2 },
  { w: 390, h: 844, dpr: 2 },
  { w: 1280, h: 800, dpr: 1 },
].filter((v) => widths.includes(v.w));

async function overflowReport(page) {
  return page.evaluate(() => {
    const bad = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth) bad.push('document scrollWidth ' + doc.scrollWidth + ' > ' + window.innerWidth);
    const visible = (el) => el.offsetParent !== null && el.getClientRects().length > 0;
    for (const sel of ['.panels', '.sheet-body', '.hud', '.stage', '.skillbar', '.tabs', '.cmp-cards', '.cmp-diff', '.dlg-actions', '.dlg-offline', '.panel']) {
      document.querySelectorAll(sel).forEach((el) => {
        if (visible(el) && el.scrollWidth > el.clientWidth + 1) bad.push(sel + ' scrollWidth ' + el.scrollWidth + ' > ' + el.clientWidth);
      });
    }
    const W = window.innerWidth;
    document.querySelectorAll('.btn, .card, .pill, .tab, .skill, .tgl, .icard, .toast, .switch-btn, .chk, .slot, .ld-slot').forEach((el) => {
      if (!visible(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > W + 0.5 || r.left < -0.5)) bad.push((el.className || el.tagName) + ' sticks out [' + Math.round(r.left) + ', ' + Math.round(r.right) + ']');
    });
    return bad;
  });
}

const browser = await chromium.launch();
const errors = [];
function watch(page, tag) {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(tag + ': ' + m.text());
  });
  page.on('pageerror', (e) => errors.push(tag + ': ' + (e.stack || e.message)));
}

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr, hasTouch: vp.w < 500, isMobile: vp.w < 500 });
  const page = await ctx.newPage();
  watch(page, vp.w + 'px');
  await page.goto(harness + '?scenario=mid', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await wait(300);
  console.log(`viewport ${vp.w}×${vp.h}`);
  for (const [name, setup, delay] of VIEWS) {
    if (only && !only.includes(name)) {
      // keep scenario continuity for later views even when filtered
      if (name === 'loot' || name === 'farm' || name === 'fresh') await setup(page);
      continue;
    }
    try {
      await setup(page);
    } catch (e) {
      check(false, `${name}: setup failed: ${e.message.split('\n')[0]}`);
      continue;
    }
    await wait(delay || 380);
    const bad = await overflowReport(page);
    check(bad.length === 0, `${name} @${vp.w}: no horizontal overflow` + (bad.length ? ' — ' + bad.slice(0, 4).join('; ') : ''));
    await page.screenshot({ path: join(out, `ui_${name}_${vp.w}.png`) });
  }
  await ctx.close();
}

// ------------------------------------------------------------------ interaction checks (390 px)
{
  console.log('interactions');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  watch(page, 'interact');
  await page.goto(harness + '?scenario=mid', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true);
  await page.evaluate(() => {
    window.__clicks = 0;
    DD.bus.on('ui:click', () => window.__clicks++);
    window.__opens = [];
    DD.bus.on('ui:open', (p) => window.__opens.push(p.panel));
  });
  await wait(200);

  // chest → compare → equip
  await page.tap('.chest-btn');
  await wait(250);
  let kind = await page.evaluate(() => DD.ui.overlayKind());
  check(typeof kind === 'string' && kind.startsWith('compare'), 'tapping the chest opens the compare modal (' + kind + ')');
  const pendingRarity = await page.evaluate(() => (DD.state.s.pendingItem ? DD.state.s.pendingItem.rarity : -1));
  if (pendingRarity >= 4) await wait(1300);
  await page.tap('.cmp-equip');
  await wait(200);
  const after = await page.evaluate(() => ({ kind: DD.ui.overlayKind(), pending: !!DD.state.s.pendingItem, log: document.querySelectorAll('.loot-log li').length }));
  check(after.kind === null && !after.pending, 'Equip resolves the pending item and closes the modal');
  check(after.log >= 1, 'Equip adds a line to the loot log');

  // sell flow
  await page.tap('.chest-btn');
  await wait(250);
  if ((await page.evaluate(() => (DD.state.s.pendingItem ? DD.state.s.pendingItem.rarity : -1))) >= 4) await wait(1300);
  const goldBefore = await page.evaluate(() => DD.state.s.gold);
  await page.tap('.cmp-sell');
  await wait(200);
  const goldAfter = await page.evaluate(() => DD.state.s.gold);
  check(goldAfter > goldBefore, 'Sell adds gold (' + goldBefore + ' → ' + goldAfter + ')');

  // tabs
  for (const t of ['hero', 'skills', 'allies', 'dungeons', 'mastery', 'loot']) {
    await page.tap('#tab-' + t);
    await wait(60);
    const sel = await page.evaluate((id) => document.getElementById('tab-' + id).getAttribute('aria-selected') === 'true' && !document.getElementById('panel-' + id).hidden, t);
    check(sel, 'tab ' + t + ' shows its panel');
  }

  // skill cast (slot 2 = blades, ready)
  const cast = await page.evaluate(() => {
    const before = DD.battle.skillSlots[1].cd;
    document.querySelectorAll('.skill')[1].click();
    return { before, after: DD.battle.skillSlots[1].cd };
  });
  check(cast.before === 0 && cast.after > 0, 'skill button casts via DD.battle.castSkill');
  await wait(120);
  const sweep = await page.evaluate(() => getComputedStyle(document.querySelectorAll('.skill')[1]).getPropertyValue('--p').trim());
  check(Number(sweep) > 0, 'cooldown sweep variable is set (' + sweep + ')');

  // AUTO + speed toggles
  const toggles = await page.evaluate(() => {
    const a0 = DD.state.s.settings.autoSkill;
    document.querySelector('.tgl-auto').click();
    const a1 = DD.state.s.settings.autoSkill;
    const s0 = DD.state.s.settings.speed;
    document.querySelector('.tgl-speed').click();
    const s1 = DD.state.s.settings.speed;
    return { a0, a1, s0, s1 };
  });
  check(toggles.a0 !== toggles.a1, 'AUTO toggles settings.autoSkill');
  check(toggles.s1 === (toggles.s0 % 3) + 1, 'speed cycles ×' + toggles.s0 + ' → ×' + toggles.s1);

  // auto-loot sheet: toggle a rarity + stop select
  await page.evaluate(() => DD.ui.openSheet('autoloot'));
  await wait(120);
  const al = await page.evaluate(() => {
    const before = DD.state.s.settings.autoLoot.sell[3];
    document.querySelector('.chk.r3').click();
    const sel = document.getElementById('stop-rarity');
    sel.value = '5';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { before, after: DD.state.s.settings.autoLoot.sell[3], stop: DD.state.s.settings.autoLoot.stopRarity };
  });
  check(al.before !== al.after, 'auto-sell checkbox toggles autoLoot.sell[3]');
  check(al.stop === 5, 'stop-rarity select sets autoLoot.stopRarity');
  await page.keyboard.press('Escape');
  await wait(80);
  check((await page.evaluate(() => DD.ui.overlayKind())) === null, 'Escape closes a sheet');

  // chest upgrade from the sheet
  const up = await page.evaluate(async () => {
    const lv = DD.state.s.chestLevel;
    DD.ui.openSheet('chest');
    await new Promise((r) => setTimeout(r, 60));
    document.querySelector('.sheet-chest .btn-lg').click();
    return { lv, after: DD.state.s.chestLevel };
  });
  check(up.after === up.lv + 1, 'Upgrade in the chest sheet raises the chest level');
  await page.evaluate(() => DD.ui.closeOverlay());

  // soft-disabled button explains itself
  const deny = await page.evaluate(async () => {
    DD.ui.switchTab('mastery');
    DD.state.s.gems = 0;
    DD.state.invalidate();
    DD.ui.refresh();
    await new Promise((r) => setTimeout(r, 50));
    const b = document.querySelector('.ms-btn');
    const lvl = DD.state.s.mastery.might;
    b.click();
    await new Promise((r) => setTimeout(r, 50));
    return { disabled: b.getAttribute('aria-disabled'), toast: document.querySelector('.toasts').textContent, same: DD.state.s.mastery.might === lvl };
  });
  check(deny.disabled === 'true' && /gems/i.test(deny.toast) && deny.same, 'unaffordable upgrade is soft-disabled and explains why');

  // dungeon enter → battle-focused view (loot tab) + leave
  const dg = await page.evaluate(async () => {
    DD.ui.switchTab('dungeons');
    DD.state.s.keys = 3;
    DD.state.invalidate();
    DD.ui.refresh();
    await new Promise((r) => setTimeout(r, 50));
    document.querySelector('.dg[data-id="dragon"] .dg-enter').click();
    await new Promise((r) => setTimeout(r, 80));
    const res = { mode: DD.battle.mode, tab: DD.ui.currentTab(), keys: DD.state.s.keys, leaveVisible: !document.querySelector('.stage .btn-ghost').hidden };
    document.querySelector('.stage .btn-ghost').click();
    res.after = DD.battle.mode;
    return res;
  });
  check(dg.mode === 'dungeon' && dg.tab === 'loot' && dg.keys === 2, 'Enter dungeon spends a key and switches to the battle view');
  check(dg.leaveVisible && dg.after === 'campaign', 'Leave button forfeits the dungeon');

  // quest claim
  const q = await page.evaluate(async () => {
    DD.ui.switchTab('loot');
    DD.state.s.stats.chestsOpened = 50;
    DD.state.invalidate();
    DD.ui.refresh();
    await new Promise((r) => setTimeout(r, 50));
    const btn = document.querySelector('.btn-claim');
    const vis = !!btn && !btn.hidden;
    const idx = DD.state.s.quest.index;
    if (vis) btn.click();
    return { vis, advanced: DD.state.s.quest.index === idx + 1 };
  });
  check(q.vis && q.advanced, 'quest Claim button appears when done and claims');

  // settings: export code + two-step reset
  const rs = await page.evaluate(async () => {
    DD.ui.openSheet('settings');
    await new Promise((r) => setTimeout(r, 60));
    const code = document.querySelector('.sheet-settings textarea').value;
    const b = document.querySelector('.sheet-settings .btn-danger');
    b.click();
    await new Promise((r) => setTimeout(r, 160));
    const armed = b.classList.contains('is-armed');
    const lvl = DD.state.s.hero.level;
    b.click();
    await new Promise((r) => setTimeout(r, 60));
    return { codeLen: code.length, armed, lvlBefore: lvl, lvlAfter: DD.state.s.hero.level, overlay: DD.ui.overlayKind() };
  });
  check(rs.codeLen > 100, 'settings shows an export save code');
  check(rs.armed && rs.lvlBefore > 1 && rs.lvlAfter === 1 && rs.overlay === null, 'reset needs two taps and wipes the save');

  // keyboard: tab focus ring + arrow keys move between tabs
  const kb = await page.evaluate(async () => {
    document.getElementById('tab-loot').focus();
    document.getElementById('tab-loot').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));
    return { tab: DD.ui.currentTab(), focused: document.activeElement && document.activeElement.id };
  });
  check(kb.tab === 'hero' && kb.focused === 'tab-hero', 'ArrowRight on the tab bar moves to the next tab');

  const clicks = await page.evaluate(() => window.__clicks);
  check(clicks > 5, "buttons emit 'ui:click' (" + clicks + ')');
  const opens = await page.evaluate(() => window.__opens.length);
  check(opens > 3, "tab switches and sheets emit 'ui:open' (" + opens + ')');
  await page.screenshot({ path: join(out, 'ui_interact_390.png') });
  await ctx.close();
}

// ------------------------------------------------------------------ reduced motion
{
  console.log('reduced motion');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce', hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  watch(page, 'reduced');
  await page.goto(harness + '?scenario=mid', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.evaluate(() => UIH.compare('legendary'));
  await wait(500);
  const unlocked = await page.evaluate(() => document.querySelector('.cmp-equip').getAttribute('aria-disabled') !== 'true');
  check(unlocked, 'reduced motion: legendary reveal unlocks its buttons quickly');
  await page.screenshot({ path: join(out, 'ui_reduced_390.png') });
  await ctx.close();
}

// ------------------------------------------------------------------ live run of the real game
{
  console.log('live run (src/index.html, all real modules)');
  const css = readFileSync(fontCss, 'utf8').replace(/ui-fonts\//g, origin + '/tests/out/ui-fonts/');
  for (const vp of [{ w: 390, h: 844, dpr: 2 }, { w: 1280, h: 800, dpr: 1 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr, hasTouch: vp.w < 500, isMobile: vp.w < 500 });
    await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: css }));
    await ctx.route('https://fonts.gstatic.com/**', (r) => r.fulfill({ status: 204, body: '' }));
    const page = await ctx.newPage();
    watch(page, 'live' + vp.w);
    await page.goto(`${origin}/src/index.html`, { waitUntil: 'load' });
    await wait(2500);
    for (const t of ['hero', 'skills', 'allies', 'dungeons', 'mastery', 'loot']) {
      await page.click('#tab-' + t);
      await wait(150);
    }
    for (let i = 0; i < 4; i++) {
      await page.click('.chest-btn');
      await wait(250);
      const k = await page.evaluate(() => DD.ui.overlayKind());
      if (k && k.startsWith('compare')) {
        await wait(1300);
        await page.click(i % 2 ? '.cmp-sell' : '.cmp-equip');
        await wait(150);
      }
    }
    // auto-open through the real state tick: results land in the loot log / ticker or pause on a pick
    await page.evaluate(() => {
      DD.ui.closeOverlay();
      DD.state.s.pendingItem = null;
      DD.state.addChests(20);
    });
    await page.click('.switch-btn[data-act="toggleAutoOpen"]');
    await wait(2500);
    const auto = await page.evaluate(() => ({ log: document.querySelectorAll('.loot-log li').length, overlay: DD.ui.overlayKind(), on: DD.state.s.autoOpen }));
    check(auto.log > 0 || (auto.overlay && auto.overlay.startsWith('compare')), `live ${vp.w}: auto-open feeds the loot log (${auto.log} lines, overlay ${auto.overlay})`);
    await page.evaluate(() => {
      if (DD.state.s.autoOpen) DD.state.setAutoOpen(false);
    });
    await wait(400);
    const k2 = await page.evaluate(() => DD.ui.overlayKind());
    if (k2 && k2.startsWith('compare')) {
      await wait(1300);
      await page.click('.cmp-sell');
    }
    await wait(1500);
    const live = await page.evaluate(() => ({ floor: DD.battle.floor, kills: DD.state.s.stats.kills, opened: DD.state.s.stats.chestsOpened, w: document.getElementById('battle-canvas').getBoundingClientRect().width }));
    check(live.opened >= 3, `live ${vp.w}: chests opened through the UI (${live.opened}), kills ${live.kills}, canvas ${Math.round(live.w)}px`);
    const bad = await overflowReport(page);
    check(bad.length === 0, `live ${vp.w}: no horizontal overflow` + (bad.length ? ' — ' + bad.slice(0, 4).join('; ') : ''));
    await page.screenshot({ path: join(out, `ui_live_${vp.w}.png`) });
    // come back after 3 hours: main.js → state.collectOffline → ui.showOffline
    await page.evaluate(() => {
      DD.ui.closeOverlay();
      DD.state.s.pendingItem = null;
      DD.state.s.lastSeen = Date.now() - 3 * 3600 * 1000;
      localStorage.setItem(DD.state.SAVE_KEY || 'dungeon-dash-save-v1', DD.state.serialize());
      // keep the outgoing page's pagehide / autosave from overwriting the back-dated save
      DD.state.save = () => true;
      DD.state.tick = () => {};
    });
    await page.reload({ waitUntil: 'load' });
    await wait(1200);
    const off = await page.evaluate(() => ({ kind: DD.ui.overlayKind(), title: (document.querySelector('.off-title') || {}).textContent || '' }));
    check(off.kind === 'offline' && /away/.test(off.title), `live ${vp.w}: offline modal after a 3h absence ("${off.title}")`);
    if (vp.w < 500) await page.screenshot({ path: join(out, `ui_live-offline_${vp.w}.png`) });
    if (off.kind === 'offline') {
      await page.click('.dlg-offline .btn-primary');
      await wait(150);
      check((await page.evaluate(() => DD.ui.overlayKind())) !== 'offline', `live ${vp.w}: Collect closes the offline modal`);
    }
    await ctx.close();
  }
}

await browser.close();
server.close();

check(errors.length === 0, 'no console errors' + (errors.length ? ':\n    ' + errors.slice(0, 12).join('\n    ') : ''));
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall UI checks passed');
process.exit(failed ? 1 : 0);
