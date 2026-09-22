import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Pull a named <script id="..."> block out of the single-file app and evaluate it. */
export function loadScript(id) {
  const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const re = new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`);
  const m = src.match(re);
  if (!m) throw new Error(`no <script id="${id}"> in index.html`);
  const mod = { exports: {} };
  new Function('module', m[1])(mod);
  return mod.exports;
}
