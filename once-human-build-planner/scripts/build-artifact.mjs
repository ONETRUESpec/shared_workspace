#!/usr/bin/env node
// Produces dist/artifact.html: the single-file page without the document skeleton
// (no doctype/html/head/body), for hosts that wrap the content themselves.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let html = readFileSync(join(root, 'dist', 'index.html'), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const keep = head.split('\n').filter(l => !/<meta charset|<meta name="viewport"/.test(l)).join('\n');
const out = keep.trim() + '\n' + body.trim() + '\n';
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'artifact.html'), out);
console.log(`wrote dist/artifact.html (${(out.length / 1024).toFixed(1)} KiB)`);
