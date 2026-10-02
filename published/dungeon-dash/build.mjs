// Inlines src/ into two single-file builds:
//   dist/dungeon-dash.html  standalone page (open it directly in a browser)
//   dist/artifact.html      fragment for a claude.ai Artifact (the host adds doctype/head/body)
// Usage: node build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, 'src');
const dist = join(here, 'dist');

const read = (p) => readFileSync(join(src, p), 'utf8');
// Keep inline scripts from closing their own <script> element early.
const safeJs = (code) => code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const safeCss = (code) => code.replace(/<\/style/gi, '<\\/style');

function inline(html) {
  html = html.replace(/<link rel="stylesheet" href="([^"]+\.css)">/g, (m, href) =>
    /^https?:/.test(href) ? m : `<style>\n${safeCss(read(href))}\n</style>`,
  );
  html = html.replace(/<script src="([^"]+\.js)"><\/script>/g, (m, path) =>
    /^https?:/.test(path) ? m : `<script>\n${safeJs(read(path))}\n</script>`,
  );
  return html;
}

function between(html, name) {
  const start = `<!-- ARTIFACT:${name}:START -->`;
  const end = `<!-- ARTIFACT:${name}:END -->`;
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  if (a < 0 || b < 0) throw new Error(`missing ${name} markers in index.html`);
  return html.slice(a + start.length, b).trim();
}

const page = inline(read('index.html'));
mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, 'dungeon-dash.html'), page);

const fragment = `${between(page, 'HEAD')}\n${between(page, 'BODY')}\n`;
writeFileSync(join(dist, 'artifact.html'), fragment);

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + ' KB';
console.log(`dist/dungeon-dash.html ${kb(page)}`);
console.log(`dist/artifact.html     ${kb(fragment)}`);
