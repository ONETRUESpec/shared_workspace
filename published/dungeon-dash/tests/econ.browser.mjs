// Dungeon Dash — economy modules in a real browser (Chromium via Playwright).
// Run: node tests/econ.browser.mjs
// Checks: classic-script load of core/data/state, real localStorage save/load, unicode-safe
// export/import with btoa/TextEncoder, and survival when storage access throws (opaque origin).
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out');
mkdirSync(out, { recursive: true });
const js = (f) => join(here, '..', 'src', 'js', f);

const page1 = join(out, 'econ-page.html');
writeFileSync(
  page1,
  `<!doctype html><meta charset="utf-8"><title>econ</title>
<script src="${pathToFileURL(js('core.js'))}"></script>
<script src="${pathToFileURL(js('data.js'))}"></script>
<script src="${pathToFileURL(js('state.js'))}"></script>`,
);

let failed = 0;
const check = (cond, msg) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + msg);
  if (!cond) failed++;
};

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(pathToFileURL(page1).href);
  const r1 = await page.evaluate(() => {
    const S = DD.state;
    S.load();
    const fresh = S.s.chests === 10 && S.s.equipped.weapon.name === 'Rusty Sword';
    S.s.gold = 777;
    S.s.equipped.weapon.name = 'Épée ★ 剣';
    S.save();
    const stored = localStorage.getItem('dungeon-dash-save-v1');
    const code = S.exportCode();
    S.reset();
    const afterReset = S.s.gold;
    const imported = S.importCode(code);
    return { fresh, stored: !!stored, afterReset, imported, gold: S.s.gold, name: S.s.equipped.weapon.name, cp: S.getPower() };
  });
  check(r1.fresh, 'new game created in the browser');
  check(r1.stored, 'save written to localStorage');
  check(r1.afterReset === 0, 'reset wipes progress');
  check(r1.imported && r1.gold === 777 && r1.name === 'Épée ★ 剣', 'unicode export/import round-trip');
  check(Number.isFinite(r1.cp) && r1.cp > 0, 'CP finite');

  await page.reload();
  const r2 = await page.evaluate(() => {
    DD.state.load();
    return DD.state.s.gold;
  });
  check(r2 === 777, 'progress survives a page reload');

  // Opaque origin: localStorage access throws SecurityError — modules must still work.
  const page2 = await ctx.newPage();
  page2.on('pageerror', (e) => errors.push(String(e)));
  await page2.setContent('<!doctype html><meta charset="utf-8"><title>x</title>');
  for (const f of ['core.js', 'data.js', 'state.js']) await page2.addScriptTag({ content: readFileSync(js(f), 'utf8') });
  const r3 = await page2.evaluate(() => {
    let threw = false;
    try {
      void window.localStorage;
    } catch {
      threw = true;
    }
    const S = DD.state;
    S.load();
    const saved = S.save();
    S.tick(16);
    const r = S.openChest();
    return { threw, saved, ok: !!r && r.decision === 'pending', chests: S.s.chests };
  });
  check(r3.ok && r3.chests === 9, 'works when storage is unavailable (storage threw: ' + r3.threw + ', save returned ' + r3.saved + ')');
  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} browser check(s) failed` : '\nbrowser checks passed');
if (failed) process.exitCode = 1;
