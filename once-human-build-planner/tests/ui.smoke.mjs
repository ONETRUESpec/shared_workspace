// Browser smoke test: loads index.html from disk in headless Chromium, checks for console errors,
// exercises the main controls and saves screenshots. Run: node tests/ui.smoke.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(process.cwd() + '/')('playwright');
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.env.SHOT_DIR || join(root, 'dist', 'screenshots');
mkdirSync(outDir, { recursive: true });
const url = 'file://' + join(root, 'index.html');

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
try {
  for (const [name, viewport, theme] of [['desktop-dark', { width: 1366, height: 1000 }, 'dark'], ['phone-light', { width: 400, height: 900 }, 'light']]) {
    const ctx = await browser.newContext({ viewport, colorScheme: theme });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    await page.goto(url);
    await page.waitForSelector('#results .kpi .v');
    const kpis = await page.$$eval('#results .kpi .v', els => els.map(e => e.textContent.trim()));
    check(kpis.length >= 8 && kpis.filter(k => /\d/.test(k)).length >= 6, `${name}: KPIs rendered (${kpis.slice(0, 4).join(' | ')})`);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    check(scrollW <= viewport.width + 1, `${name}: no horizontal overflow (${scrollW} <= ${viewport.width})`);
    if (name === 'desktop-dark') {
      // star change updates the card DMG
      const before = await page.$eval('#results .kpi .v', e => e.textContent);
      await page.click('#weapon-stars button:nth-child(1)');
      await page.waitForFunction(b => document.querySelector('#results .kpi .v').textContent !== b, before);
      const after = await page.$eval('#results .kpi .v', e => e.textContent);
      check(parseFloat(after.replace(/,/g, '')) < parseFloat(before.replace(/,/g, '')), `star 6 -> 1 lowers body hit (${before} -> ${after})`);
      await page.click('#weapon-stars button:nth-child(6)');
      // pick a food and check the comparison table appears
      await page.selectOption('#food-sel', { index: 1 });
      await page.waitForSelector('#results table.cmp');
      const rows = await page.$$eval('#results table.cmp tbody tr', trs => trs.length);
      check(rows >= 5, `food comparison table has rows (${rows})`);
      // equip a full set
      await page.selectOption('#set-quick', { index: 1 });
      await page.waitForFunction(() => document.querySelectorAll('#p-armor .slot select').length > 0);
      const equipped = await page.$$eval('#p-armor .slot > select', sels => sels.filter(s => s.value).length);
      check(equipped >= 5, `full set equipped (${equipped} slots)`);
      // persisted to localStorage and share link
      const saved = await page.evaluate(() => { try { return !!localStorage.getItem('ohbp:build'); } catch (e) { return false; } });
      check(saved, 'build persisted to localStorage');
    }
    await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: name !== 'desktop-dark' });
    await ctx.close();
  }
} finally {
  await browser.close();
}
for (const e of errors) console.log('CONSOLE', e);
check(errors.length === 0, `no console/page errors (${errors.length})`);
console.log(failures ? `${failures} check(s) failed` : 'all UI checks passed', '- screenshots in', outDir);
process.exit(failures ? 1 : 0);
