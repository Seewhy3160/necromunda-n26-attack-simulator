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

/** The price model needs the data block in scope, so both are evaluated together. */
export function loadPricing() {
  const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const grab = (id) => src.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`))[1];
  return new Function('module', grab('data') + '\n' + grab('pricing') + '\nreturn Pricing;')({ exports: {} });
}

/** The public API, with everything it depends on evaluated in one scope. */
export function loadApi() {
  const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const grab = (id) => src.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`))[1];
  return new Function('module',
    grab('engine') + '\n' + grab('data') + '\n' + grab('pricing') + '\n' + grab('api') +
    '\nreturn Necromunda;')({ exports: {} });
}
