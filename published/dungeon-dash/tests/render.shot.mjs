// Dungeon Dash — render/audio visual harness (Chromium via Playwright).
// Run: node tests/render.shot.mjs
// Screenshots every biome, a boss fight, a skill-heavy moment, the boss dungeons, the revive overlay
// and a live run of the real battle module at 390 px (dpr 3) and 960 px (dpr 1) into tests/out/.
// Asserts: no console/page errors, VFX caps hold under an event storm, taps hit the flying chest,
// audio can play every contract sound after a user gesture.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(here, 'out');
mkdirSync(out, { recursive: true });

// --- Pixelify Sans for realistic text (best effort; falls back to monospace)
const fontFile = join(out, 'pixelify.woff2');
if (!existsSync(fontFile)) {
  try {
    const css = execFileSync('curl', ['-sS', '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400..700&display=swap'], { encoding: 'utf8', timeout: 15000 });
    const urls = [...css.matchAll(/url\((https:[^)]+\.woff2)\)/g)].map((m) => m[1]);
    const latin = urls[urls.length - 1];
    if (latin) writeFileSync(fontFile, execFileSync('curl', ['-sS', latin], { timeout: 15000 }));
  } catch (e) {
    console.log('  (font download skipped: ' + String(e.message).split('\n')[0] + ')');
  }
}

// --- tiny static server
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = join(root, p);
    if (!file.startsWith(root)) throw new Error('outside');
    await stat(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch (e) {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/tests/render.harness.html`;

let failed = 0;
const check = (cond, msg) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + msg);
  if (!cond) failed++;
};

const SHOTS = [
  ['crypt', [0.75, 1.8]],
  ['fungal', [1.2]],
  ['forge', [1.3]],
  ['clockwork', [1.2]],
  ['neon', [0.9]],
  ['void', [0.95]],
  ['boss', [0.8, 2.2]],
  ['skills', [0.3, 0.62, 0.95]],
  ['dungeon', [0.9]],
  ['horde', [0.5]],
  ['vault', [0.8]],
  ['mothership', [0.8]],
  ['dead', [0.9]],
  ['clear', [0.7]],
];
const only = process.argv[2] ? process.argv[2].split(',') : null;
const widths = process.argv[3] ? process.argv[3].split(',').map(Number) : [390, 960];

const browser = await chromium.launch();
const errors = [];
try {
  for (const width of widths) {
    const dpr = width < 500 ? 3 : 1;
    const ctx = await browser.newContext({ viewport: { width, height: 760 }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[${width}] pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`[${width}] console: ${m.text()}`);
    });
    for (const [name, times] of SHOTS) {
      if (only && !only.includes(name)) continue;
      await page.goto(`${base}?scenario=${name}`);
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
      await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
      for (let i = 0; i < times.length; i++) {
        const stats = await page.evaluate((t) => window.advanceTo(t), times[i]);
        const file = `render_${name}${times.length > 1 ? '_' + (i + 1) : ''}_${width}.png`;
        await page.locator('canvas').screenshot({ path: join(out, file) });
        if (i === 0 && name === 'crypt') console.log(`  [${width}px dpr${dpr}] k=${stats.k} theme=${stats.theme}`);
      }
    }

    if (!only) {
      // live: the real data/state/battle modules drive the renderer
      await page.goto(`${base}?live=1&floor=12`);
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
      const live = await page.evaluate(() => window.advanceTo(9));
      await page.locator('canvas').screenshot({ path: join(out, `render_live_${width}.png`) });
      check(live && live.theme === 'fungal', `[${width}] live run renders the fungal biome on floor 12 (theme=${live && live.theme})`);

      // soak: real battle at ×3 for 3 simulated minutes (waves, bosses, chest flights), then a
      // floor far too hard for a fresh hero (deaths, revive overlay, boss failures)
      if (width === widths[0]) {
        await page.goto(`${base}?live=1&floor=1&speed=3`);
        await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
        const soak = await page.evaluate(() => window.advanceTo(60));
        await page.locator('canvas').screenshot({ path: join(out, `render_soak_${width}.png`) });
        const ev = soak.events || {};
        check((ev['enemy:killed'] || 0) > 20 && (ev['wave:start'] || 0) > 5, `[${width}] soak ×3: ${ev['enemy:killed'] || 0} kills, ${ev['wave:start'] || 0} waves, ${ev['floor:cleared'] || 0} floors cleared, ${ev['skill:cast'] || 0} skills, floor ${soak.floor}`);
        check(soak.particles <= 300 && soak.texts <= 40, `[${width}] soak caps hold (${soak.particles} particles, ${soak.texts} texts)`);
        await page.goto(`${base}?live=1&floor=40&speed=3`);
        await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
        const hard = await page.evaluate(() => window.advanceTo(20));
        await page.locator('canvas').screenshot({ path: join(out, `render_hard_${width}.png`) });
        check(((hard.events || {})['hero:died'] || 0) > 0, `[${width}] hard floor: hero died ${(hard.events || {})['hero:died'] || 0}× and revived without errors (theme=${hard.theme})`);
      }

      // tap on the flying chest (canvas coordinates → world → DD.battle.tapAt)
      await page.goto(`${base}?scenario=crypt`);
      await page.waitForFunction(() => window.__ready === true);
      await page.evaluate(() => window.advanceTo(0.5));
      const box = await page.locator('canvas').boundingBox();
      const fc = await page.evaluate(() => ({ x: DD.battle.flyingChest.x, y: DD.battle.flyingChest.y }));
      // a near miss (12 world px off) must still count thanks to the forgiving hit-test
      await page.mouse.click(box.x + ((fc.x + 12) / 360) * box.width, box.y + ((fc.y + 14) / 200) * box.height);
      const tapped = await page.evaluate(() => window.__tapped || 0);
      check(tapped === 1, `[${width}] tapping near the flying chest collects it`);
      await page.evaluate(() => window.advanceTo(0.8));
      await page.locator('canvas').screenshot({ path: join(out, `render_tap_${width}.png`) });

      // event storm (×3 speed worst case): caps must hold, no exceptions
      const storm = await page.evaluate(() => {
        const B = DD.battle;
        for (let f = 0; f < 90; f++) {
          for (let i = 0; i < 40; i++) {
            const e = B.enemies[i % Math.max(1, B.enemies.length)] || { id: 'x', x: 200, y: 170, h: 20 };
            DD.bus.emit('hit', { target: 'enemy', id: e.id, x: e.x, y: e.y - 20, amount: 1234567, crit: i % 3 === 0, miss: false, kind: 'attack' });
            DD.bus.emit('enemy:killed', { id: 'k' + i, type: 'skeleton', x: 200 + i, y: 150, isBoss: i % 20 === 0, gold: 5, xp: 1, chest: true });
          }
          DD.bus.emit('skill:cast', { id: ['meteor', 'lightning', 'frost', 'bomb'][f % 4], slot: 0, x: 84, y: 156, targets: [{ x: 150, y: 160 }, { x: 190, y: 160 }, { x: 230, y: 140 }] });
          DD.render.draw(1 / 60);
        }
        return DD.render.stats();
      });
      check(storm.particles <= 300, `[${width}] particle pool capped (${storm.particles} ≤ 300)`);
      check(storm.texts <= 40, `[${width}] floating numbers capped (${storm.texts} ≤ 40)`);
      check(storm.coins <= 50 && storm.fx <= 90, `[${width}] coins/fx capped (${storm.coins}, ${storm.fx})`);

      // NaN / garbage resilience: draw must not throw on a malformed view
      const nanOk = await page.evaluate(() => {
        const B = DD.battle;
        B.enemies.push({ id: 'bad', type: 'nope', x: NaN, y: undefined, w: 'x', hp: NaN, maxHp: 0 });
        B.projectiles.push({ id: 'p', kind: undefined, x: Infinity, y: 4 });
        B.hero.x = NaN;
        B.scroll = NaN;
        DD.bus.emit('hit', { target: 'enemy', x: NaN, y: null, amount: 'lots' });
        DD.bus.emit('skill:cast', { id: 'meteor', targets: [null, { x: NaN }] });
        DD.bus.emit('floor:cleared', { rewards: null });
        DD.bus.emit('flyingChest:collected', { reward: null });
        for (let i = 0; i < 30; i++) DD.render.draw(1 / 60);
        return true;
      });
      check(nanOk === true, `[${width}] malformed view / payloads do not break drawing`);

      // reduced motion: shake disabled, fewer particles
      await page.goto(`${base}?scenario=skills&reduced=1`);
      await page.waitForFunction(() => window.__ready === true);
      const red = await page.evaluate(() => window.advanceTo(0.9));
      check(red.reduced === true && red.particles <= 110, `[${width}] reduced motion caps particles (${red.particles} ≤ 110)`);
    }
    await ctx.close();
  }

  // audio: every contract sound schedules after a gesture, and the rate limiter holds
  if (!only) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 700 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[audio] pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`[audio] console: ${m.text()}`);
    });
    await page.goto(`${base}?scenario=crypt`);
    await page.waitForFunction(() => window.__ready === true);
    await page.mouse.click(10, 10); // the user gesture that unlocks WebAudio
    await page.waitForFunction(() => DD.audio.isReady(), null, { timeout: 5000 }).catch(() => {});
    const res = await page.evaluate(async () => {
      const names = ['hit', 'crit', 'kill', 'coin', 'chest', 'equip', 'sell', 'rare', 'legendary', 'levelup', 'skill', 'boss', 'death', 'click', 'win', 'fail', 'flap'];
      const played = {};
      for (const n of names) {
        played[n] = DD.audio.play(n);
        await new Promise((r) => setTimeout(r, 15));
      }
      let burst = 0;
      for (let i = 0; i < 100; i++) if (DD.audio.play('hit')) burst++;
      DD.state.s.settings.sound = false;
      const muted = DD.audio.play('crit');
      DD.state.s.settings.sound = true;
      return { ready: DD.audio.isReady(), played, burst, muted };
    });
    check(res.ready, 'audio context running after a gesture');
    const bad = Object.entries(res.played).filter(([, v]) => !v).map(([k]) => k);
    check(bad.length === 0, 'all contract sounds play' + (bad.length ? ' (failed: ' + bad.join(', ') + ')' : ''));
    check(res.burst <= 1, `rate limiter: 100 instant hits → ${res.burst} played`);
    check(res.muted === false, 'settings.sound=false mutes play()');
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

check(errors.length === 0, 'no console errors' + (errors.length ? ':\n    ' + errors.slice(0, 12).join('\n    ') : ''));
console.log(failed ? `\n${failed} check(s) failed` : '\nall render checks passed');
process.exit(failed ? 1 : 0);
