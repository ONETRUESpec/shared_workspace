#!/usr/bin/env node
// Produces dist/artifact.html: the page without the document skeleton (no doctype/html/head/body)
// and with a slimmed data bundle (research provenance fields stripped) for hosts that wrap the
// content themselves and cap page size.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');

// Slim data: drop provenance-only fields (the full data stays in js/data.js and data/*.json)
const DROP = new Set(['sources', 'source', 'crossChecks', 'ohdbUrls', 'notes', 'evidence', 'evidenceFor', 'evidenceAgainst', 'quote', 'sourcesConsulted', 'calculators', 'nameOriginalZhTW', 'effectTextZhTW', 'durationSheetRaw', 'ingredients', 'recipeUnlock', 'altBlueprintsSameGun', 'ladderEquipOriginIds', 'presetBaseAttrs', 'armModelPath', 'skinSeqNo', 'icon', 'iconFile', 'ohdbUrl', 'ohdbMirrorCrossCheck', 'alternatives', 'disagreement', 'history', 'legacyTieredMods', 'memeticSpecializations']);
function slim(v) {
  if (Array.isArray(v)) return v.map(slim);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) { if (DROP.has(k)) continue; o[k] = slim(x); }
    return o;
  }
  return v;
}
const data = {};
for (const f of readdirSync(join(root, 'data')).filter(f => f.endsWith('.json')).sort()) {
  const d = JSON.parse(read('data/' + f));
  if (d._meta) d._meta = { facet: d._meta.facet, gameVersion: d._meta.gameVersion, generatedAt: d._meta.generatedAt };
  data[basename(f, '.json')] = slim(d);
}
const dataJs = `window.OH_DATA = ${JSON.stringify(data)};`;

let html = read('index.html');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
let out = head.split('\n').filter(l => !/<meta charset|<meta name="viewport"/.test(l)).join('\n') + '\n' + body;
out = out.replace(/<link rel="stylesheet" href="css\/style.css">/, () => `<style>\n${read('css/style.css')}\n</style>`);
const scripts = { 'js/data.js': dataJs, 'js/ui-helpers.js': read('js/ui-helpers.js'), 'js/engine.js': read('js/engine.js'), 'js/data-adapter.js': read('js/data-adapter.js'), 'js/ui.js': read('js/ui.js') };
for (const [path, code] of Object.entries(scripts)) {
  const re = new RegExp(`<script src="${path.replace('/', '\\/')}"></script>`);
  if (!re.test(out)) { console.error(`index.html does not reference ${path}`); process.exit(1); }
  out = out.replace(re, () => `<script>\n${code.replace(/<\/script>/g, '<\\/script>')}\n</script>`);
}
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'artifact.html'), out.trim() + '\n');
console.log(`wrote dist/artifact.html (${(out.length / 1024).toFixed(1)} KiB; data ${(dataJs.length / 1024).toFixed(1)} KiB)`);
