#!/usr/bin/env node
// Produces dist/index.html: one self-contained file (CSS, data and scripts inlined)
// that can be dropped onto any static host or opened directly in a browser.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="css\/style.css">/, () => `<style>\n${read('css/style.css')}\n</style>`);
for (const script of ['js/data.js', 'js/ui-helpers.js', 'js/engine.js', 'js/ui.js']) {
  const re = new RegExp(`<script(?: type="module")? src="${script.replace('/', '\\/')}"></script>`);
  if (!re.test(html)) { console.error(`index.html does not reference ${script}`); process.exit(1); }
  html = html.replace(re, () => `<script>\n${read(script).replace(/<\/script>/g, '<\\/script>')}\n</script>`);
}
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'index.html'), html);
console.log(`wrote dist/index.html (${(html.length / 1024).toFixed(1)} KiB)`);
